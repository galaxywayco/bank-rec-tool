import { useState, useCallback } from 'react'
import { parseCSV, fmtAmt, fmtDate, detectBankName, parseDate } from './utils/csv'
import { detectGLCols, detectBankCols } from './utils/columns'
import { parseGLRows, parseBankRows, matchTransactions, CATEGORY_LABELS, runVerification, detectPeriod } from './utils/matching'
import { Section, Tag } from './components/Section'
import { SummaryCard } from './components/SummaryCard'
import { PasteZone } from './components/PasteZone'
import { ReportModal } from './components/ReportModal'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const now = new Date()

/* ── Category chip colors (muted, monochromatic for dark UI) ── */
const CAT_CHIP = {
  wire:         'bg-violet-500/12 text-violet-400 border-violet-500/20',
  card_deposit: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20',
  settlement:   'bg-teal-500/12 text-teal-400 border-teal-500/20',
  ach:          'bg-blue-500/12 text-blue-400 border-blue-500/20',
  fee:          'bg-orange-500/12 text-orange-400 border-orange-500/20',
  check:        'bg-white/5 text-slate-400 border-white/10',
  transfer:     'bg-cyan-500/12 text-cyan-400 border-cyan-500/20',
  other:        'bg-white/5 text-slate-500 border-white/8',
}

function TxRow({ gl, bk, dayDiff, color }) {
  const rowBg = color === 'green' ? 'hover:bg-emerald-500/[0.04]' : color === 'amber' ? 'hover:bg-amber-500/[0.04]' : 'hover:bg-white/[0.02]'
  return (
    <tr className={`border-b border-white/[0.04] ${rowBg} text-xs transition-colors`}>
      <td className="py-2.5 px-3 text-slate-500 font-mono">{gl ? fmtDate(gl.date) : '—'}</td>
      <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-400">{gl ? gl.desc : '—'}</td>
      <td className={`py-2.5 px-3 font-mono font-medium text-right tabular-nums ${gl?.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {gl ? fmtAmt(gl.net) : '—'}
      </td>
      <td className="py-2.5 px-3 text-slate-500 font-mono">{bk ? fmtDate(bk.date) : '—'}</td>
      <td className="py-2.5 px-3 max-w-[200px] truncate text-slate-400">{bk ? bk.desc : '—'}</td>
      <td className={`py-2.5 px-3 font-mono font-medium text-right tabular-nums ${bk?.amt >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {bk ? fmtAmt(bk.amt) : '—'}
      </td>
      {dayDiff != null && <td className="py-2.5 px-3 text-center text-slate-600 font-mono">{dayDiff}d</td>}
    </tr>
  )
}

function TableHeader({ showDayDiff }) {
  return (
    <thead>
      <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
        <th className="py-2.5 px-3 text-left font-medium">GL Date</th>
        <th className="py-2.5 px-3 text-left font-medium">GL Description</th>
        <th className="py-2.5 px-3 text-right font-medium">GL Amount</th>
        <th className="py-2.5 px-3 text-left font-medium">Bank Date</th>
        <th className="py-2.5 px-3 text-left font-medium">Bank Description</th>
        <th className="py-2.5 px-3 text-right font-medium">Bank Amount</th>
        {showDayDiff && <th className="py-2.5 px-3 text-center font-medium">Gap</th>}
      </tr>
    </thead>
  )
}

function SingleSideTable({ rows, side }) {
  const isGL = side === 'gl'
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
          <th className="py-2.5 px-3 text-left font-medium">Date</th>
          <th className="py-2.5 px-3 text-left font-medium">Description</th>
          <th className="py-2.5 px-3 text-right font-medium">Amount</th>
          {isGL && <th className="py-2.5 px-3 text-left font-medium">Control</th>}
          {!isGL && <th className="py-2.5 px-3 text-left font-medium">Type</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
            <td className="py-2.5 px-3 text-slate-500 font-mono">{fmtDate(r.date)}</td>
            <td className="py-2.5 px-3 max-w-[300px] truncate text-slate-400">{r.desc}</td>
            <td className={`py-2.5 px-3 font-mono font-medium text-right tabular-nums ${(isGL ? r.net : r.amt) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {fmtAmt(isGL ? r.net : r.amt)}
            </td>
            {isGL && <td className="py-2.5 px-3 text-slate-600 font-mono">{r.control}</td>}
            {!isGL && <td className="py-2.5 px-3">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${CAT_CHIP[r.category] || CAT_CHIP.other}`}>
                {CATEGORY_LABELS[r.category] || r.category}
              </span>
            </td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function sum(rows, field) {
  return rows.reduce((s, r) => s + (r[field] || 0), 0)
}

function CategorySummary({ category, items }) {
  const total = items.reduce((s, r) => s + r.amt, 0)
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${CAT_CHIP[category] || CAT_CHIP.other}`}>
      <span className="text-[11px] font-medium">{CATEGORY_LABELS[category] || category} ({items.length})</span>
      <span className="text-[11px] font-mono font-semibold tabular-nums">{fmtAmt(total)}</span>
    </div>
  )
}

/* ── Match rate ring (SVG) ── */
function MatchRing({ rate }) {
  const r = 18, stroke = 3
  const circ = 2 * Math.PI * r
  const offset = circ - (rate / 100) * circ
  const color = rate >= 90 ? '#10B981' : rate >= 70 ? '#F59E0B' : '#EF4444'
  return (
    <div className="flex items-center gap-3">
      <svg width="44" height="44" className="rotate-[-90deg]">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div>
        <div className="text-2xl font-bold font-mono tabular-nums" style={{ color }}>{rate}%</div>
        <div className="text-[11px] text-slate-500 uppercase tracking-wider">Match Rate</div>
      </div>
    </div>
  )
}

export default function App() {
  const [glText, setGlText] = useState('')
  const [bankText, setBankText] = useState('')
  const [recMonth, setRecMonth] = useState(now.getMonth())
  const [recYear, setRecYear] = useState(now.getFullYear())
  const [transitStart, setTransitStart] = useState(26)
  const [transitEnd, setTransitEnd] = useState(5)
  const [results, setResults] = useState(null)
  const [error, setError] = useState('')
  const [detectedBank, setDetectedBank] = useState(null)
  const [detectedGL, setDetectedGL] = useState(null)
  const [showExport, setShowExport] = useState(false)

  const handleBankChange = useCallback((val) => {
    setBankText(val)
    if (val.trim()) {
      const rows = parseCSV(val)
      if (rows.length > 1) {
        const cols = detectBankCols(rows)
        const hdr = rows[cols.headerRow] || []
        const parts = []
        const name = detectBankName(val)
        if (name) parts.push(name)
        if (cols.dateCol >= 0) parts.push(`Date: "${hdr[cols.dateCol] || 'col' + (cols.dateCol + 1)}"`)
        if (cols.debitCol >= 0) parts.push(`Dr/Cr split`)
        else if (cols.amtCol >= 0) parts.push(`Amt: "${hdr[cols.amtCol] || 'col' + (cols.amtCol + 1)}"`)
        parts.push(`${rows.length - cols.headerRow - 1} rows`)
        setDetectedBank(parts.join(' · '))
      }
    } else { setDetectedBank(null) }
  }, [])

  const handleGLChange = useCallback((val) => {
    setGlText(val)
    if (val.trim()) {
      const rows = parseCSV(val)
      if (rows.length > 1) {
        const cols = detectGLCols(rows)
        const hdr = rows[cols.headerRow] || []
        const parts = []
        if (cols.headerRow > 0) parts.push(`Header at row ${cols.headerRow + 1}`)
        if (cols.dateCol >= 0) parts.push(`Date: "${hdr[cols.dateCol] || 'col' + (cols.dateCol + 1)}"`)
        if (cols.debitCol >= 0) parts.push(`Debit/Credit split`)
        parts.push(`${rows.length - cols.headerRow - 1} rows`)
        setDetectedGL(parts.join(' · '))
        if (cols.dateCol >= 0) {
          const dateRows = rows.slice(cols.headerRow + 1)
            .map(r => ({ date: parseDate(r[cols.dateCol]) }))
            .filter(r => r.date)
          const period = detectPeriod(dateRows)
          if (period) { setRecMonth(period.month); setRecYear(period.year) }
        }
      }
    } else { setDetectedGL(null) }
  }, [])

  const runRec = useCallback(() => {
    setError('')
    setResults(null)
    try {
      if (!glText.trim()) { setError('Paste GL data to continue.'); return }
      if (!bankText.trim()) { setError('Paste bank statement data to continue.'); return }
      const glRows = parseCSV(glText)
      const bkRows = parseCSV(bankText)
      if (glRows.length < 2) { setError('GL data needs a header row + at least one data row.'); return }
      if (bkRows.length < 2) { setError('Bank data needs a header row + at least one data row.'); return }
      const glCols = detectGLCols(glRows)
      const bkCols = detectBankCols(bkRows)
      if (glCols.dateCol === -1) { setError('Could not detect a date column in GL data. Check your CSV format.'); return }
      if (bkCols.dateCol === -1) { setError('Could not detect a date column in bank data. Check your CSV format.'); return }
      const gl = parseGLRows(glRows, glCols)
      const bk = parseBankRows(bkRows, bkCols)
      if (gl.length === 0) { setError('No usable GL transactions found after parsing.'); return }
      if (bk.length === 0) { setError('No usable bank transactions found after parsing.'); return }
      const result = matchTransactions(gl, bk, recMonth, recYear, transitStart, transitEnd)
      const fullResult = { ...result, gl, bk, glCols, bkCols }
      const verification = runVerification(fullResult)
      setResults({ ...fullResult, verification })
    } catch (e) { setError('Parsing error: ' + e.message) }
  }, [glText, bankText, recMonth, recYear, transitStart, transitEnd])

  const years = [recYear - 1, recYear, recYear + 1]

  return (
    <div className="min-h-screen bg-surface-0">

      {/* ── Header ── */}
      <header className="border-b border-white/[0.06] bg-surface-1/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo mark */}
            <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-200 tracking-tight">BankRec</span>
              <span className="text-slate-600 mx-2">/</span>
              <span className="text-sm text-slate-500">Kushner Companies</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {results && (
              <div className="flex items-center gap-2">
                <div className={`status-dot ${results.verification?.allHardPass ? 'status-dot-green' : 'status-dot-red'}`} />
                <span className={`text-xs font-medium ${results.verification?.allHardPass ? 'text-emerald-400' : 'text-red-400'}`}>
                  {results.verification?.allHardPass ? 'Reconciled' : 'Unreconciled'}
                </span>
              </div>
            )}
            <span className="text-[11px] text-slate-600 font-mono">{MONTHS[recMonth]?.slice(0, 3)} {recYear}</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* ── Settings Row ── */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm font-semibold text-slate-300">Settings</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Month</label>
              <select
                className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/40 transition-colors"
                value={recMonth}
                onChange={e => setRecMonth(+e.target.value)}
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Year</label>
              <select
                className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500/40 transition-colors"
                value={recYear}
                onChange={e => setRecYear(+e.target.value)}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">GL Cut-off Day</label>
              <input
                type="number" min="1" max="31"
                className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-300 font-mono focus:outline-none focus:border-blue-500/40 transition-colors"
                value={transitStart}
                onChange={e => setTransitStart(+e.target.value)}
              />
              <span className="text-[10px] text-slate-600">Exclude GL deposits on/after this day</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Bank Cut-off Day</label>
              <input
                type="number" min="1" max="31"
                className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-slate-300 font-mono focus:outline-none focus:border-blue-500/40 transition-colors"
                value={transitEnd}
                onChange={e => setTransitEnd(+e.target.value)}
              />
              <span className="text-[10px] text-slate-600">Exclude bank items on/before this day</span>
            </div>
          </div>
        </div>

        {/* ── Upload Zones ── */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="glass-card p-5">
            <PasteZone
              label="GL Export"
              hint={"Paste Yardi/Voyager GL export here…\nExpected columns: Date, Debit, Credit, Description"}
              value={glText}
              onChange={handleGLChange}
              detected={detectedGL ? `${detectedGL}` : null}
            />
          </div>
          <div className="glass-card p-5">
            <PasteZone
              label="Bank Statement"
              hint={"Paste bank statement CSV here…\nSupports: BofA, Wells Fargo, PNC, TD, Truist, Metro, PPAC"}
              value={bankText}
              onChange={handleBankChange}
              detected={detectedBank}
            />
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="flex items-center gap-4">
          <button
            onClick={runRec}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all text-sm"
          >
            Run Reconciliation
          </button>
          {results && (
            <button
              onClick={() => setShowExport(true)}
              className="border border-white/[0.08] hover:border-white/[0.16] text-slate-400 hover:text-slate-200 font-medium px-6 py-3 rounded-xl transition-all text-sm"
            >
              Export Report
            </button>
          )}
          {error && (
            <span className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl">{error}</span>
          )}
        </div>

        {/* ── Results ── */}
        {results && (() => {
          const { matched, nearMatch, unmatchedGL, unmatchedBK, bankByCategory,
                  inTransitGL, inTransitBK, receiptDetails, periodWarning } = results
          const matchableCount = (results.gl.length - (receiptDetails?.length || 0))
          const matchRate = matchableCount > 0 ? Math.round((matched.length / matchableCount) * 100) : 0
          return (
            <div className="flex flex-col gap-5">

              {/* Period Warning */}
              {periodWarning && (
                <div className="glass-card p-4 border-amber-500/20 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-amber-400">Period Mismatch</div>
                    <div className="text-xs text-amber-400/70 mt-0.5">{periodWarning}</div>
                  </div>
                </div>
              )}

              {/* Deposit Totals Info */}
              {receiptDetails && receiptDetails.length > 0 && (
                <div className="glass-card p-4 border-blue-500/15 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-blue-400">Deposit Totals Detected</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {receiptDetails.length} individual receipt lines excluded from matching.
                      Only deposit totals are matched against bank deposits to prevent double-counting.
                    </div>
                  </div>
                </div>
              )}

              {/* ── KPI Bar ── */}
              <div className="glass-card-elevated p-5">
                <div className="flex items-center justify-between flex-wrap gap-6">
                  <div className="flex items-center gap-8 flex-wrap">
                    <MatchRing rate={matchRate} />
                    <div className="flex gap-6">
                      <div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider">Matched</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-emerald-400">{matched.length}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider">Near</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-amber-400">{nearMatch.length}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider">GL Open</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-red-400">{unmatchedGL.length}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider">Bank Open</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-red-400">{unmatchedBK.length}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider">In-Transit</div>
                        <div className="text-lg font-bold font-mono tabular-nums text-blue-400">{inTransitGL.length + inTransitBK.length}</div>
                      </div>
                    </div>
                  </div>
                  {/* Reconciliation status */}
                  {(() => {
                    const adjBook = matched.reduce((s,m) => s+m.gl.net, 0) + nearMatch.reduce((s,m) => s+m.gl.net, 0) + sum(unmatchedGL, 'net') + sum(inTransitGL, 'net') + sum(unmatchedBK, 'amt')
                    const adjBank = matched.reduce((s,m) => s+m.bk.amt, 0) + nearMatch.reduce((s,m) => s+m.bk.amt, 0) + sum(unmatchedBK, 'amt') + sum(inTransitBK, 'amt') + sum(unmatchedGL, 'net')
                    const diff = adjBook - adjBank
                    const reconciled = Math.abs(diff) < 0.02
                    return (
                      <div className={`px-4 py-2.5 rounded-xl border ${reconciled ? 'bg-emerald-500/8 border-emerald-500/20' : 'bg-red-500/8 border-red-500/20'}`}>
                        <div className={`text-[11px] uppercase tracking-wider font-medium ${reconciled ? 'text-emerald-500/60' : 'text-red-500/60'}`}>Difference</div>
                        <div className={`text-lg font-bold font-mono tabular-nums ${reconciled ? 'text-emerald-400' : 'text-red-400'}`}>{fmtAmt(diff)}</div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* ── Categories ── */}
              {unmatchedBK.length > 0 && Object.keys(bankByCategory).length > 0 && (
                <div className="glass-card p-5">
                  <div className="text-sm font-semibold text-slate-300 mb-3">Unmatched Bank Items by Type</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {Object.entries(bankByCategory).map(([cat, items]) => (
                      <CategorySummary key={cat} category={cat} items={items} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Matched ── */}
              <Section
                title="Matched Transactions"
                badge={<Tag color="green">{matched.length}</Tag>}
                defaultOpen={false}
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <TableHeader showDayDiff />
                    <tbody>
                      {matched.map(({ gl, bk, dayDiff }) => (
                        <TxRow key={gl.id + bk.id} gl={gl} bk={bk} dayDiff={dayDiff} color="green" />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* ── Near-Match ── */}
              {nearMatch.length > 0 && (
                <Section
                  title="Near-Match (review recommended)"
                  badge={<Tag color="amber">{nearMatch.length}</Tag>}
                  defaultOpen
                >
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <TableHeader showDayDiff />
                      <tbody>
                        {nearMatch.map(({ gl, bk, dayDiff }) => (
                          <TxRow key={gl.id + bk.id} gl={gl} bk={bk} dayDiff={dayDiff} color="amber" />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Section>
              )}

              {/* ── Unmatched GL ── */}
              {unmatchedGL.length > 0 && (
                <Section
                  title="Outstanding GL Items"
                  badge={<Tag color="red">{unmatchedGL.length} · {fmtAmt(sum(unmatchedGL, 'net'))}</Tag>}
                  defaultOpen
                >
                  <div className="overflow-x-auto">
                    <SingleSideTable rows={unmatchedGL} side="gl" />
                  </div>
                </Section>
              )}

              {/* ── Unmatched Bank ── */}
              {unmatchedBK.length > 0 && (
                <Section
                  title="Unrecorded Bank Items"
                  badge={<Tag color="red">{unmatchedBK.length} · {fmtAmt(sum(unmatchedBK, 'amt'))}</Tag>}
                  defaultOpen
                >
                  <div className="overflow-x-auto">
                    <SingleSideTable rows={unmatchedBK} side="bank" />
                  </div>
                </Section>
              )}

              {/* ── In-Transit ── */}
              {(inTransitGL.length > 0 || inTransitBK.length > 0) && (
                <Section
                  title="In-Transit Items"
                  badge={<Tag color="blue">{inTransitGL.length + inTransitBK.length}</Tag>}
                  defaultOpen={false}
                >
                  <div className="p-5 flex flex-col gap-4">
                    {inTransitGL.length > 0 && (
                      <div>
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">GL In-Transit ({inTransitGL.length})</div>
                        <SingleSideTable rows={inTransitGL} side="gl" />
                      </div>
                    )}
                    {inTransitBK.length > 0 && (
                      <div>
                        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-2">Bank In-Transit ({inTransitBK.length})</div>
                        <SingleSideTable rows={inTransitBK} side="bank" />
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Reconciliation Balance ── */}
              <div className="glass-card-elevated p-5">
                <div className="text-sm font-semibold text-slate-300 mb-4">Reconciliation Balance</div>
                <div className="grid md:grid-cols-2 gap-8 text-sm">
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Balance per Books (GL)</span>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Matched + near-match activity</span>
                      <span className="font-mono tabular-nums">{fmtAmt(matched.reduce((s,m) => s+m.gl.net, 0) + nearMatch.reduce((s,m) => s+m.gl.net, 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Outstanding GL items</span>
                      <span className="font-mono tabular-nums">{fmtAmt(sum(unmatchedGL, 'net'))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>+ Bank adjustments needed</span>
                      <span className="font-mono tabular-nums">{fmtAmt(sum(unmatchedBK, 'amt'))}</span>
                    </div>
                    <div className="border-t border-white/[0.08] pt-2.5 flex justify-between font-semibold text-slate-200">
                      <span>Adjusted Book Balance</span>
                      <span className="font-mono tabular-nums">{fmtAmt(
                        matched.reduce((s,m) => s+m.gl.net, 0) +
                        nearMatch.reduce((s,m) => s+m.gl.net, 0) +
                        sum(unmatchedGL, 'net') +
                        sum(inTransitGL, 'net') +
                        sum(unmatchedBK, 'amt')
                      )}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">Balance per Bank</span>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Matched + near-match activity</span>
                      <span className="font-mono tabular-nums">{fmtAmt(matched.reduce((s,m) => s+m.bk.amt, 0) + nearMatch.reduce((s,m) => s+m.bk.amt, 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Unrecorded bank items</span>
                      <span className="font-mono tabular-nums">{fmtAmt(sum(unmatchedBK, 'amt'))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>+ Outstanding GL items</span>
                      <span className="font-mono tabular-nums">{fmtAmt(sum(unmatchedGL, 'net'))}</span>
                    </div>
                    <div className="border-t border-white/[0.08] pt-2.5 flex justify-between font-semibold text-slate-200">
                      <span>Adjusted Bank Balance</span>
                      <span className="font-mono tabular-nums">{fmtAmt(
                        matched.reduce((s,m) => s+m.bk.amt, 0) +
                        nearMatch.reduce((s,m) => s+m.bk.amt, 0) +
                        sum(unmatchedBK, 'amt') +
                        sum(inTransitBK, 'amt') +
                        sum(unmatchedGL, 'net')
                      )}</span>
                    </div>
                  </div>
                </div>
                {/* Final status bar */}
                {(() => {
                  const adjBook = matched.reduce((s,m) => s+m.gl.net, 0) + nearMatch.reduce((s,m) => s+m.gl.net, 0) + sum(unmatchedGL, 'net') + sum(inTransitGL, 'net') + sum(unmatchedBK, 'amt')
                  const adjBank = matched.reduce((s,m) => s+m.bk.amt, 0) + nearMatch.reduce((s,m) => s+m.bk.amt, 0) + sum(unmatchedBK, 'amt') + sum(inTransitBK, 'amt') + sum(unmatchedGL, 'net')
                  const diff = adjBook - adjBank
                  const reconciled = Math.abs(diff) < 0.02
                  return (
                    <div className={`mt-5 pt-4 border-t flex justify-between items-center ${
                      reconciled ? 'border-emerald-500/20' : 'border-red-500/20'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`status-dot ${reconciled ? 'status-dot-green' : 'status-dot-red'}`} />
                        <span className={`font-bold text-sm ${reconciled ? 'text-emerald-400' : 'text-red-400'}`}>
                          {reconciled ? 'RECONCILED' : 'DIFFERENCE — INVESTIGATE'}
                        </span>
                      </div>
                      <span className={`font-mono font-bold text-xl tabular-nums ${reconciled ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmtAmt(diff)}
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* ── Verification ── */}
              {results.verification && (
                <div className={`glass-card p-5 ${
                  results.verification.allHardPass ? 'glow-green border-emerald-500/15' : 'glow-red border-red-500/15'
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        results.verification.allHardPass ? 'bg-emerald-500/15' : 'bg-red-500/15'
                      }`}>
                        {results.verification.allHardPass ? (
                          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm font-bold ${results.verification.allHardPass ? 'text-emerald-400' : 'text-red-400'}`}>
                        Integrity Verification
                      </span>
                    </div>
                    <span className={`text-[11px] font-mono font-medium px-3 py-1 rounded-full border ${
                      results.verification.allHardPass
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {results.verification.passCount}/{results.verification.totalChecks} passed
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {results.verification.checks.map((check, i) => (
                      <div key={i} className={`flex items-start gap-2.5 text-xs rounded-lg px-3.5 py-2.5 border ${
                        check.pass
                          ? 'bg-emerald-500/[0.04] border-emerald-500/10 text-emerald-300/80'
                          : check.severity === 'warning'
                            ? 'bg-amber-500/[0.06] border-amber-500/15 text-amber-300/80'
                            : 'bg-red-500/[0.06] border-red-500/15 text-red-300/80'
                      }`}>
                        <span className="mt-0.5 shrink-0 w-4 text-center font-mono text-[11px]">
                          {check.pass ? '✓' : check.severity === 'warning' ? '!' : '✗'}
                        </span>
                        <div>
                          <span className="font-semibold">{check.label}</span>
                          <span className="text-slate-500 mx-1.5">—</span>
                          <span className="text-slate-400">{check.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── Export Modal ── */}
      {showExport && results && (
        <ReportModal
          results={results}
          recMonth={recMonth}
          recYear={recYear}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
