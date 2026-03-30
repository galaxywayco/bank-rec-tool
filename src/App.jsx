import { useState, useCallback } from 'react'
import { parseCSV, fmtAmt, fmtDate, detectBankName } from './utils/csv'
import { detectGLCols, detectBankCols } from './utils/columns'
import { parseGLRows, parseBankRows, matchTransactions } from './utils/matching'
import { Section, Tag } from './components/Section'
import { SummaryCard } from './components/SummaryCard'
import { PasteZone } from './components/PasteZone'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const now = new Date()

function ColPill({ label }) {
  return <span className="inline-block bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs px-2 py-0.5 rounded font-mono">{label}</span>
}

function TxRow({ gl, bk, dayDiff, color }) {
  const border = color === 'green' ? 'border-green-100' : color === 'amber' ? 'border-amber-100' : 'border-gray-100'
  return (
    <tr className={`border-b ${border} hover:bg-gray-50 text-xs`}>
      <td className="py-2 px-3 text-gray-500">{gl ? fmtDate(gl.date) : '—'}</td>
      <td className="py-2 px-3 max-w-[200px] truncate text-gray-700">{gl ? gl.desc : '—'}</td>
      <td className={`py-2 px-3 font-mono font-semibold text-right ${gl?.net >= 0 ? 'text-green-700' : 'text-red-700'}`}>
        {gl ? fmtAmt(gl.net) : '—'}
      </td>
      <td className="py-2 px-3 text-gray-500">{bk ? fmtDate(bk.date) : '—'}</td>
      <td className="py-2 px-3 max-w-[200px] truncate text-gray-700">{bk ? bk.desc : '—'}</td>
      <td className={`py-2 px-3 font-mono font-semibold text-right ${bk?.amt >= 0 ? 'text-green-700' : 'text-red-700'}`}>
        {bk ? fmtAmt(bk.amt) : '—'}
      </td>
      {dayDiff != null && <td className="py-2 px-3 text-center text-gray-400">{dayDiff}d</td>}
    </tr>
  )
}

function TableHeader({ showDayDiff }) {
  return (
    <thead>
      <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-200">
        <th className="py-2 px-3 text-left">GL Date</th>
        <th className="py-2 px-3 text-left">GL Description</th>
        <th className="py-2 px-3 text-right">GL Amount</th>
        <th className="py-2 px-3 text-left">Bank Date</th>
        <th className="py-2 px-3 text-left">Bank Description</th>
        <th className="py-2 px-3 text-right">Bank Amount</th>
        {showDayDiff && <th className="py-2 px-3 text-center">Gap</th>}
      </tr>
    </thead>
  )
}

function SingleSideTable({ rows, side }) {
  const isGL = side === 'gl'
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-200">
          <th className="py-2 px-3 text-left">Date</th>
          <th className="py-2 px-3 text-left">Description</th>
          <th className="py-2 px-3 text-right">Amount</th>
          {isGL && <th className="py-2 px-3 text-left">Control</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2 px-3 text-gray-500">{isGL ? fmtDate(r.date) : fmtDate(r.date)}</td>
            <td className="py-2 px-3 max-w-[300px] truncate text-gray-700">{r.desc}</td>
            <td className={`py-2 px-3 font-mono font-semibold text-right ${(isGL ? r.net : r.amt) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmtAmt(isGL ? r.net : r.amt)}
            </td>
            {isGL && <td className="py-2 px-3 text-gray-400 font-mono">{r.control}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function sum(rows, field) {
  return rows.reduce((s, r) => s + (r[field] || 0), 0)
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
  const [copied, setCopied] = useState(false)

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
    } else {
      setDetectedBank(null)
    }
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
      }
    } else {
      setDetectedGL(null)
    }
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
      setResults({ ...result, gl, bk, glCols, bkCols })
    } catch (e) {
      setError('Parsing error: ' + e.message)
    }
  }, [glText, bankText, recMonth, recYear, transitStart, transitEnd])

  const copyReport = useCallback(() => {
    if (!results) return
    const { matched, nearMatch, unmatchedGL, unmatchedBK, inTransitGL, inTransitBK } = results
    const lines = [
      `BANK RECONCILIATION — ${MONTHS[recMonth]} ${recYear}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `SUMMARY`,
      `  Matched:          ${matched.length} transactions`,
      `  Near-Match:       ${nearMatch.length} transactions`,
      `  Unmatched GL:     ${unmatchedGL.length} transactions  (${fmtAmt(sum(unmatchedGL, 'net'))})`,
      `  Unmatched Bank:   ${unmatchedBK.length} transactions  (${fmtAmt(sum(unmatchedBK, 'amt'))})`,
      `  In-Transit GL:    ${inTransitGL.length} transactions`,
      `  In-Transit Bank:  ${inTransitBK.length} transactions`,
      '',
      '--- UNMATCHED GL ---',
      ...unmatchedGL.map(r => `  ${fmtDate(r.date)}  ${r.desc.padEnd(40)}  ${fmtAmt(r.net)}`),
      '',
      '--- UNMATCHED BANK ---',
      ...unmatchedBK.map(r => `  ${fmtDate(r.date)}  ${r.desc.padEnd(40)}  ${fmtAmt(r.amt)}`),
    ]
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [results, recMonth, recYear])

  const years = [recYear - 1, recYear, recYear + 1]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bank Reconciliation</h1>
            <p className="text-xs text-gray-400 mt-0.5">Paste GL export and bank statement CSV to reconcile</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full font-medium">GWC Tool</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Config Row */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="text-sm font-semibold text-gray-700 mb-4">Reconciliation Settings</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Month</label>
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                value={recMonth}
                onChange={e => setRecMonth(+e.target.value)}
              >
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Year</label>
              <select
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                value={recYear}
                onChange={e => setRecYear(+e.target.value)}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">GL cut-off (day of month)</label>
              <input
                type="number" min="1" max="31"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                value={transitStart}
                onChange={e => setTransitStart(+e.target.value)}
              />
              <span className="text-xs text-gray-400">Exclude GL deposits on/after this day</span>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500 font-medium">Bank cut-off (day of month)</label>
              <input
                type="number" min="1" max="31"
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"
                value={transitEnd}
                onChange={e => setTransitEnd(+e.target.value)}
              />
              <span className="text-xs text-gray-400">Exclude bank items on/before this day</span>
            </div>
          </div>
        </div>

        {/* Paste Zones */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <PasteZone
              label="GL Export (CSV)"
              hint={"Paste Yardi/Voyager GL export here…\nExpected columns: Date, Debit, Credit, Description"}
              value={glText}
              onChange={handleGLChange}
              detected={detectedGL ? `Detected: ${detectedGL}` : null}
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <PasteZone
              label="Bank Statement (CSV)"
              hint={"Paste bank statement CSV here…\nSupports: BofA, Wells Fargo, PNC, TD, Truist, Metro, PPAC"}
              value={bankText}
              onChange={handleBankChange}
              detected={detectedBank}
            />
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center gap-4">
          <button
            onClick={runRec}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl shadow transition-colors text-sm"
          >
            Run Reconciliation
          </button>
          {results && (
            <button
              onClick={copyReport}
              className="border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-700 font-medium px-5 py-3 rounded-xl transition-colors text-sm"
            >
              {copied ? '✓ Copied!' : 'Copy Report'}
            </button>
          )}
          {error && <span className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-2 rounded-lg">{error}</span>}
        </div>

        {/* Results */}
        {results && (() => {
          const { matched, nearMatch, unmatchedGL, unmatchedBK, inTransitGL, inTransitBK } = results
          const matchRate = results.gl.length > 0 ? Math.round((matched.length / results.gl.length) * 100) : 0
          return (
            <div className="flex flex-col gap-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <SummaryCard label="Matched" value={matched.length} color="green" />
                <SummaryCard label="Near-Match" value={nearMatch.length} color="amber" />
                <SummaryCard label="Unmatched GL" value={unmatchedGL.length} color="red" />
                <SummaryCard label="Unmatched Bank" value={unmatchedBK.length} color="red" />
                <SummaryCard label="In-Transit" value={inTransitGL.length + inTransitBK.length} color="blue" />
                <SummaryCard label="Match Rate" value={matchRate + '%'} color={matchRate >= 90 ? 'green' : matchRate >= 70 ? 'amber' : 'red'} />
              </div>

              {/* Matched */}
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

              {/* Near Match */}
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

              {/* Unmatched GL */}
              {unmatchedGL.length > 0 && (
                <Section
                  title="Unmatched GL Items"
                  badge={<Tag color="red">{unmatchedGL.length} · {fmtAmt(sum(unmatchedGL, 'net'))}</Tag>}
                  defaultOpen
                >
                  <div className="overflow-x-auto">
                    <SingleSideTable rows={unmatchedGL} side="gl" />
                  </div>
                </Section>
              )}

              {/* Unmatched Bank */}
              {unmatchedBK.length > 0 && (
                <Section
                  title="Unmatched Bank Items"
                  badge={<Tag color="red">{unmatchedBK.length} · {fmtAmt(sum(unmatchedBK, 'amt'))}</Tag>}
                  defaultOpen
                >
                  <div className="overflow-x-auto">
                    <SingleSideTable rows={unmatchedBK} side="bank" />
                  </div>
                </Section>
              )}

              {/* In-Transit */}
              {(inTransitGL.length > 0 || inTransitBK.length > 0) && (
                <Section
                  title="In-Transit Items"
                  badge={<Tag color="blue">{inTransitGL.length + inTransitBK.length}</Tag>}
                  defaultOpen={false}
                >
                  <div className="p-4 flex flex-col gap-4">
                    {inTransitGL.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">GL In-Transit ({inTransitGL.length})</div>
                        <SingleSideTable rows={inTransitGL} side="gl" />
                      </div>
                    )}
                    {inTransitBK.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Bank In-Transit ({inTransitBK.length})</div>
                        <SingleSideTable rows={inTransitBK} side="bank" />
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* Balance Check */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-sm font-semibold text-gray-700 mb-3">Balance Summary</div>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">GL Net (unmatched)</span>
                    <span className={`font-mono font-bold text-lg ${sum(unmatchedGL, 'net') === 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtAmt(sum(unmatchedGL, 'net'))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Bank Net (unmatched)</span>
                    <span className={`font-mono font-bold text-lg ${sum(unmatchedBK, 'amt') === 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtAmt(sum(unmatchedBK, 'amt'))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-gray-400 uppercase tracking-wide">Difference</span>
                    <span className={`font-mono font-bold text-lg ${Math.abs(sum(unmatchedGL, 'net') - sum(unmatchedBK, 'amt')) < 0.02 ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtAmt(sum(unmatchedGL, 'net') - sum(unmatchedBK, 'amt'))}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
