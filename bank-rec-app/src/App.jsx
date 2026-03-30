import { useState, useCallback } from 'react'
import { parseCSV, fmtAmt, fmtDate, detectBankName } from './utils/csv'
import { detectGLCols, detectBankCols } from './utils/columns'
import { parseGLRows, parseBankRows, matchTransactions, CATEGORY_LABELS } from './utils/matching'
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
          {!isGL && <th className="py-2 px-3 text-left">Type</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2 px-3 text-gray-500">{fmtDate(r.date)}</td>
            <td className="py-2 px-3 max-w-[300px] truncate text-gray-700">{r.desc}</td>
            <td className={`py-2 px-3 font-mono font-semibold text-right ${(isGL ? r.net : r.amt) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmtAmt(isGL ? r.net : r.amt)}
            </td>
            {isGL && <td className="py-2 px-3 text-gray-400 font-mono">{r.control}</td>}
            {!isGL && <td className="py-2 px-3">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                r.category === 'wire' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                r.category === 'ach' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                r.category === 'fee' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                r.category === 'check' ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                r.category === 'transfer' ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' :
                'bg-gray-50 text-gray-500 border border-gray-200'
              }`}>{CATEGORY_LABELS[r.category] || r.category}</span>
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

/**
 * Category color chip for summary display
 */
function CategorySummary({ category, items }) {
  const total = items.reduce((s, r) => s + r.amt, 0)
  const colors = {
    wire: 'bg-purple-50 text-purple-700 border-purple-200',
    ach: 'bg-blue-50 text-blue-700 border-blue-200',
    fee: 'bg-orange-50 text-orange-700 border-orange-200',
    check: 'bg-gray-100 text-gray-600 border-gray-200',
    transfer: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    other: 'bg-gray-50 text-gray-500 border-gray-200',
  }
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${colors[category] || colors.other}`}>
      <span className="text-xs font-medium">{CATEGORY_LABELS[category] || category} ({items.length})</span>
      <span className={`text-xs font-mono font-semibold ${total >= 0 ? '' : ''}`}>{fmtAmt(total)}</span>
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
    const { matched, nearMatch, unmatchedGL, unmatchedBK, bankByCategory,
            inTransitGL, inTransitBK, receiptDetails, periodWarning } = results

    const pad = (s, n) => (s || '').padEnd(n)
    const rpad = (s, n) => (s || '').padStart(n)
    const divider = '─'.repeat(72)

    // Calculate totals
    const matchedGLTotal = matched.reduce((s, m) => s + m.gl.net, 0)
    const matchedBKTotal = matched.reduce((s, m) => s + m.bk.amt, 0)
    const nearMatchGLTotal = nearMatch.reduce((s, m) => s + m.gl.net, 0)
    const unmatchedGLTotal = sum(unmatchedGL, 'net')
    const unmatchedBKTotal = sum(unmatchedBK, 'amt')
    const inTransitGLTotal = sum(inTransitGL, 'net')
    const inTransitBKTotal = sum(inTransitBK, 'amt')

    // GL side totals (book)
    const glTotal = matchedGLTotal + nearMatchGLTotal + unmatchedGLTotal + inTransitGLTotal
    // Bank side totals
    const bkTotal = matchedBKTotal + sum(nearMatch.map(m => m.bk), 'amt') + unmatchedBKTotal + inTransitBKTotal

    const lines = [
      `BANK RECONCILIATION REPORT`,
      `${MONTHS[recMonth]} ${recYear}`,
      `Generated: ${new Date().toLocaleString()}`,
      '',
      divider,
      'SECTION 1: RECONCILIATION SUMMARY',
      divider,
      '',
      `  Matched Transactions:       ${String(matched.length).padStart(5)}    ${rpad(fmtAmt(matchedBKTotal), 14)}`,
      `  Near-Match (review):        ${String(nearMatch.length).padStart(5)}    ${rpad(fmtAmt(nearMatchGLTotal), 14)}`,
      `  Unmatched GL (book only):   ${String(unmatchedGL.length).padStart(5)}    ${rpad(fmtAmt(unmatchedGLTotal), 14)}`,
      `  Unmatched Bank (bank only): ${String(unmatchedBK.length).padStart(5)}    ${rpad(fmtAmt(unmatchedBKTotal), 14)}`,
      `  In-Transit GL:              ${String(inTransitGL.length).padStart(5)}    ${rpad(fmtAmt(inTransitGLTotal), 14)}`,
      `  In-Transit Bank:            ${String(inTransitBK.length).padStart(5)}    ${rpad(fmtAmt(inTransitBKTotal), 14)}`,
    ]

    if (receiptDetails && receiptDetails.length > 0) {
      lines.push(`  Receipt Detail Lines:       ${String(receiptDetails.length).padStart(5)}    (excluded from matching — rolled into deposit totals)`)
    }

    if (periodWarning) {
      lines.push('', `  ⚠ PERIOD WARNING: ${periodWarning}`)
    }

    // SECTION 2: BALANCE PER BOOKS
    lines.push(
      '',
      divider,
      'SECTION 2: BALANCE PER BOOKS (GL)',
      divider,
      '',
      `  Book activity (matched):              ${rpad(fmtAmt(matchedGLTotal), 14)}`,
      `  Book activity (near-match):           ${rpad(fmtAmt(nearMatchGLTotal), 14)}`,
      '',
      '  Adjustments needed (items on bank, not in GL):',
    )

    // Group unmatched bank items by category
    const cats = Object.keys(bankByCategory || {}).sort()
    if (cats.length > 0) {
      for (const cat of cats) {
        const items = bankByCategory[cat]
        const catTotal = items.reduce((s, r) => s + r.amt, 0)
        lines.push(`    ${pad(CATEGORY_LABELS[cat] || cat, 24)} (${items.length})    ${rpad(fmtAmt(catTotal), 14)}`)
      }
    } else {
      lines.push('    (none)')
    }

    lines.push(
      `  Total bank adjustments:               ${rpad(fmtAmt(unmatchedBKTotal), 14)}`,
      '',
      `  ADJUSTED BOOK BALANCE:                ${rpad(fmtAmt(glTotal + unmatchedBKTotal), 14)}`,
    )

    // SECTION 3: BALANCE PER BANK
    lines.push(
      '',
      divider,
      'SECTION 3: BALANCE PER BANK STATEMENT',
      divider,
      '',
      `  Bank activity (matched):              ${rpad(fmtAmt(matchedBKTotal), 14)}`,
      `  Bank activity (near-match):           ${rpad(fmtAmt(sum(nearMatch.map(m => m.bk), 'amt')), 14)}`,
      '',
      '  Outstanding items (in GL, not yet on bank):',
    )

    // Split unmatched GL into deposits in transit and outstanding payments
    const outstandingDeposits = unmatchedGL.filter(r => r.net > 0)
    const outstandingPayments = unmatchedGL.filter(r => r.net < 0)
    const depTotal = sum(outstandingDeposits, 'net')
    const payTotal = sum(outstandingPayments, 'net')

    if (outstandingDeposits.length > 0) {
      lines.push(`    Deposits in transit       (${outstandingDeposits.length})    ${rpad(fmtAmt(depTotal), 14)}`)
    }
    if (outstandingPayments.length > 0) {
      lines.push(`    Outstanding checks/pmts   (${outstandingPayments.length})    ${rpad(fmtAmt(payTotal), 14)}`)
    }
    if (unmatchedGL.length === 0) {
      lines.push('    (none)')
    }

    lines.push(
      `  Total outstanding:                    ${rpad(fmtAmt(unmatchedGLTotal), 14)}`,
      '',
      `  ADJUSTED BANK BALANCE:                ${rpad(fmtAmt(bkTotal + unmatchedGLTotal), 14)}`,
    )

    // SECTION 4: DIFFERENCE
    const diff = (glTotal + unmatchedBKTotal) - (bkTotal + unmatchedGLTotal)
    lines.push(
      '',
      divider,
      'RECONCILIATION RESULT',
      divider,
      '',
      `  Adjusted Book Balance:                ${rpad(fmtAmt(glTotal + unmatchedBKTotal), 14)}`,
      `  Adjusted Bank Balance:                ${rpad(fmtAmt(bkTotal + unmatchedGLTotal), 14)}`,
      `  DIFFERENCE:                           ${rpad(fmtAmt(diff), 14)}`,
      `  STATUS: ${Math.abs(diff) < 0.02 ? 'RECONCILED' : 'UNRECONCILED — INVESTIGATE'}`,
    )

    // SECTION 5: DETAIL — Unmatched items
    if (unmatchedGL.length > 0) {
      lines.push(
        '',
        divider,
        'DETAIL: OUTSTANDING GL ITEMS (in books, not on bank)',
        divider,
        '',
      )
      for (const r of unmatchedGL) {
        lines.push(`  ${pad(fmtDate(r.date), 12)} ${pad(r.desc, 42)} ${rpad(fmtAmt(r.net), 14)}`)
      }
    }

    if (unmatchedBK.length > 0) {
      lines.push(
        '',
        divider,
        'DETAIL: UNRECORDED BANK ITEMS (on bank, not in books)',
        divider,
        '',
      )
      for (const cat of cats) {
        const items = bankByCategory[cat]
        if (items.length === 0) continue
        lines.push(`  --- ${CATEGORY_LABELS[cat] || cat} ---`)
        for (const r of items) {
          lines.push(`  ${pad(fmtDate(r.date), 12)} ${pad(r.desc, 42)} ${rpad(fmtAmt(r.amt), 14)}`)
        }
        lines.push('')
      }
    }

    if (nearMatch.length > 0) {
      lines.push(
        '',
        divider,
        'DETAIL: NEAR-MATCHES (review recommended)',
        divider,
        '',
      )
      for (const { gl, bk, dayDiff: dd } of nearMatch) {
        lines.push(`  GL: ${pad(fmtDate(gl.date), 12)} ${pad(gl.desc, 30)} ${rpad(fmtAmt(gl.net), 12)}`)
        lines.push(`  BK: ${pad(fmtDate(bk.date), 12)} ${pad(bk.desc, 30)} ${rpad(fmtAmt(bk.amt), 12)}  (${dd} days apart)`)
        lines.push('')
      }
    }

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
            <p className="text-xs text-gray-400 mt-0.5">Upload GL export and bank statement to reconcile</p>
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
              label="GL Export (CSV / Excel)"
              hint={"Paste Yardi/Voyager GL export here…\nExpected columns: Date, Debit, Credit, Description"}
              value={glText}
              onChange={handleGLChange}
              detected={detectedGL ? `Detected: ${detectedGL}` : null}
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <PasteZone
              label="Bank Statement (CSV / Excel)"
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
          const { matched, nearMatch, unmatchedGL, unmatchedBK, bankByCategory,
                  inTransitGL, inTransitBK, receiptDetails, periodWarning } = results
          const matchableCount = (results.gl.length - (receiptDetails?.length || 0))
          const matchRate = matchableCount > 0 ? Math.round((matched.length / matchableCount) * 100) : 0
          return (
            <div className="flex flex-col gap-4">

              {/* Period Warning */}
              {periodWarning && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-amber-500 text-lg mt-0.5">⚠</span>
                  <div>
                    <div className="text-sm font-semibold text-amber-800">Period Mismatch Detected</div>
                    <div className="text-xs text-amber-700 mt-1">{periodWarning}</div>
                  </div>
                </div>
              )}

              {/* Receipt Details Info */}
              {receiptDetails && receiptDetails.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
                  <span className="text-blue-500 text-lg mt-0.5">ℹ</span>
                  <div>
                    <div className="text-sm font-semibold text-blue-800">Deposit Totals Detected</div>
                    <div className="text-xs text-blue-700 mt-1">
                      {receiptDetails.length} individual receipt lines were excluded from matching.
                      Only deposit totals ({matched.length + nearMatch.length + unmatchedGL.filter(r => r.isDepositTotal).length} rows) are matched against bank deposits to prevent double-counting.
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <SummaryCard label="Matched" value={matched.length} color="green" />
                <SummaryCard label="Near-Match" value={nearMatch.length} color="amber" />
                <SummaryCard label="Unmatched GL" value={unmatchedGL.length} color="red" />
                <SummaryCard label="Unmatched Bank" value={unmatchedBK.length} color="red" />
                <SummaryCard label="In-Transit" value={inTransitGL.length + inTransitBK.length} color="blue" />
                <SummaryCard label="Match Rate" value={matchRate + '%'} color={matchRate >= 90 ? 'green' : matchRate >= 70 ? 'amber' : 'red'} />
              </div>

              {/* Bank Item Categories */}
              {unmatchedBK.length > 0 && Object.keys(bankByCategory).length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="text-sm font-semibold text-gray-700 mb-3">Unmatched Bank Items by Type</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    {Object.entries(bankByCategory).map(([cat, items]) => (
                      <CategorySummary key={cat} category={cat} items={items} />
                    ))}
                  </div>
                </div>
              )}

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
                  title="Outstanding GL Items (in books, not on bank)"
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
                  title="Unrecorded Bank Items (on bank, not in books)"
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

              {/* Reconciliation Balance */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-sm font-semibold text-gray-700 mb-3">Reconciliation Balance</div>
                <div className="grid md:grid-cols-2 gap-6 text-sm">
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Balance per Books (GL)</span>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Matched + near-match activity</span>
                      <span className="font-mono">{fmtAmt(matched.reduce((s,m) => s+m.gl.net, 0) + nearMatch.reduce((s,m) => s+m.gl.net, 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Outstanding GL items</span>
                      <span className="font-mono">{fmtAmt(sum(unmatchedGL, 'net'))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>+ Bank adjustments needed</span>
                      <span className="font-mono">{fmtAmt(sum(unmatchedBK, 'amt'))}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
                      <span>Adjusted Book Balance</span>
                      <span className="font-mono">{fmtAmt(
                        matched.reduce((s,m) => s+m.gl.net, 0) +
                        nearMatch.reduce((s,m) => s+m.gl.net, 0) +
                        sum(unmatchedGL, 'net') +
                        sum(inTransitGL, 'net') +
                        sum(unmatchedBK, 'amt')
                      )}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Balance per Bank</span>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Matched + near-match activity</span>
                      <span className="font-mono">{fmtAmt(matched.reduce((s,m) => s+m.bk.amt, 0) + nearMatch.reduce((s,m) => s+m.bk.amt, 0))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>Unrecorded bank items</span>
                      <span className="font-mono">{fmtAmt(sum(unmatchedBK, 'amt'))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>+ Outstanding GL items</span>
                      <span className="font-mono">{fmtAmt(sum(unmatchedGL, 'net'))}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 flex justify-between font-semibold">
                      <span>Adjusted Bank Balance</span>
                      <span className="font-mono">{fmtAmt(
                        matched.reduce((s,m) => s+m.bk.amt, 0) +
                        nearMatch.reduce((s,m) => s+m.bk.amt, 0) +
                        sum(unmatchedBK, 'amt') +
                        sum(inTransitBK, 'amt') +
                        sum(unmatchedGL, 'net')
                      )}</span>
                    </div>
                  </div>
                </div>
                {/* Final difference */}
                {(() => {
                  const adjBook = matched.reduce((s,m) => s+m.gl.net, 0) + nearMatch.reduce((s,m) => s+m.gl.net, 0) + sum(unmatchedGL, 'net') + sum(inTransitGL, 'net') + sum(unmatchedBK, 'amt')
                  const adjBank = matched.reduce((s,m) => s+m.bk.amt, 0) + nearMatch.reduce((s,m) => s+m.bk.amt, 0) + sum(unmatchedBK, 'amt') + sum(inTransitBK, 'amt') + sum(unmatchedGL, 'net')
                  const diff = adjBook - adjBank
                  return (
                    <div className={`mt-4 pt-4 border-t-2 ${Math.abs(diff) < 0.02 ? 'border-green-300' : 'border-red-300'} flex justify-between items-center`}>
                      <span className={`font-bold text-sm ${Math.abs(diff) < 0.02 ? 'text-green-700' : 'text-red-700'}`}>
                        {Math.abs(diff) < 0.02 ? 'RECONCILED' : 'DIFFERENCE (investigate)'}
                      </span>
                      <span className={`font-mono font-bold text-lg ${Math.abs(diff) < 0.02 ? 'text-green-700' : 'text-red-700'}`}>
                        {fmtAmt(diff)}
                      </span>
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
