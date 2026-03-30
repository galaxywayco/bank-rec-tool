import { useState, useCallback } from 'react'
import { fmtAmt, fmtDate } from '../utils/csv'
import { CATEGORY_LABELS } from '../utils/matching'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

/**
 * All available report sections with keys, labels, and default on/off.
 */
const SECTIONS = [
  { key: 'summary',      label: 'Reconciliation Summary',       default: true },
  { key: 'bookBalance',  label: 'Balance per Books (GL)',        default: true },
  { key: 'bankBalance',  label: 'Balance per Bank Statement',    default: true },
  { key: 'result',       label: 'Reconciliation Result',         default: true },
  { key: 'glDetail',     label: 'Outstanding GL Items (detail)', default: true },
  { key: 'bankDetail',   label: 'Unrecorded Bank Items (detail)',default: true },
  { key: 'nearMatch',    label: 'Near-Matches (detail)',         default: false },
  { key: 'matched',      label: 'Matched Transactions (detail)', default: false },
  { key: 'verification', label: 'Integrity Verification',        default: true },
]

function sum(rows, field) {
  return rows.reduce((s, r) => s + (r[field] || 0), 0)
}

/**
 * Build plain-text report with only selected sections.
 */
function buildTextReport(results, recMonth, recYear, selected) {
  const { matched, nearMatch, unmatchedGL, unmatchedBK, bankByCategory,
          inTransitGL, inTransitBK, receiptDetails, periodWarning, verification } = results

  const pad = (s, n) => (s || '').padEnd(n)
  const rpad = (s, n) => (s || '').padStart(n)
  const divider = '\u2500'.repeat(72)

  const matchedGLTotal = matched.reduce((s, m) => s + m.gl.net, 0)
  const matchedBKTotal = matched.reduce((s, m) => s + m.bk.amt, 0)
  const nearMatchGLTotal = nearMatch.reduce((s, m) => s + m.gl.net, 0)
  const unmatchedGLTotal = sum(unmatchedGL, 'net')
  const unmatchedBKTotal = sum(unmatchedBK, 'amt')
  const inTransitGLTotal = sum(inTransitGL, 'net')
  const inTransitBKTotal = sum(inTransitBK, 'amt')
  const glTotal = matchedGLTotal + nearMatchGLTotal + unmatchedGLTotal + inTransitGLTotal
  const bkTotal = matchedBKTotal + sum(nearMatch.map(m => m.bk), 'amt') + unmatchedBKTotal + inTransitBKTotal

  const lines = [
    'BANK RECONCILIATION REPORT',
    `${MONTHS[recMonth]} ${recYear}`,
    `Generated: ${new Date().toLocaleString()}`,
    '',
  ]

  if (selected.summary) {
    lines.push(divider, 'SECTION 1: RECONCILIATION SUMMARY', divider, '',
      `  Matched Transactions:          ${String(matched.length).padStart(5)}    ${rpad(fmtAmt(matchedBKTotal), 14)}`,
      `  Near-Match (review):           ${String(nearMatch.length).padStart(5)}    ${rpad(fmtAmt(nearMatchGLTotal), 14)}`,
      `  Unmatched GL (book only):      ${String(unmatchedGL.length).padStart(5)}    ${rpad(fmtAmt(unmatchedGLTotal), 14)}`,
      `  Unmatched Bank (bank only):    ${String(unmatchedBK.length).padStart(5)}    ${rpad(fmtAmt(unmatchedBKTotal), 14)}`,
      `  In-Transit GL:                 ${String(inTransitGL.length).padStart(5)}    ${rpad(fmtAmt(inTransitGLTotal), 14)}`,
      `  In-Transit Bank:               ${String(inTransitBK.length).padStart(5)}    ${rpad(fmtAmt(inTransitBKTotal), 14)}`,
    )
    if (receiptDetails?.length > 0) {
      lines.push(`  Receipt Detail Lines:          ${String(receiptDetails.length).padStart(5)}    (excluded from matching)`)
    }
    if (periodWarning) lines.push('', `  \u26A0 PERIOD WARNING: ${periodWarning}`)
    lines.push('')
  }

  if (selected.bookBalance) {
    const cats = Object.keys(bankByCategory || {}).sort()
    lines.push(divider, 'SECTION 2: BALANCE PER BOOKS (GL)', divider, '',
      `  Book activity (matched):               ${rpad(fmtAmt(matchedGLTotal), 14)}`,
      `  Book activity (near-match):            ${rpad(fmtAmt(nearMatchGLTotal), 14)}`,
      '', '  Adjustments needed (items on bank, not in GL):',
    )
    if (cats.length > 0) {
      for (const cat of cats) {
        const items = bankByCategory[cat]
        const catTotal = items.reduce((s, r) => s + r.amt, 0)
        lines.push(`    ${pad(CATEGORY_LABELS[cat] || cat, 24)} (${items.length})    ${rpad(fmtAmt(catTotal), 14)}`)
      }
    } else { lines.push('    (none)') }
    lines.push(`  Total bank adjustments:                ${rpad(fmtAmt(unmatchedBKTotal), 14)}`, '',
      `  ADJUSTED BOOK BALANCE:                 ${rpad(fmtAmt(glTotal + unmatchedBKTotal), 14)}`, '',
    )
  }

  if (selected.bankBalance) {
    const outDep = unmatchedGL.filter(r => r.net > 0)
    const outPay = unmatchedGL.filter(r => r.net < 0)
    lines.push(divider, 'SECTION 3: BALANCE PER BANK STATEMENT', divider, '',
      `  Bank activity (matched):               ${rpad(fmtAmt(matchedBKTotal), 14)}`,
      `  Bank activity (near-match):            ${rpad(fmtAmt(sum(nearMatch.map(m => m.bk), 'amt')), 14)}`,
      '', '  Outstanding items (in GL, not yet on bank):',
    )
    if (outDep.length > 0) lines.push(`    Deposits in transit       (${outDep.length})    ${rpad(fmtAmt(sum(outDep, 'net')), 14)}`)
    if (outPay.length > 0) lines.push(`    Outstanding checks/pmts   (${outPay.length})    ${rpad(fmtAmt(sum(outPay, 'net')), 14)}`)
    if (unmatchedGL.length === 0) lines.push('    (none)')
    lines.push(`  Total outstanding:                     ${rpad(fmtAmt(unmatchedGLTotal), 14)}`, '',
      `  ADJUSTED BANK BALANCE:                 ${rpad(fmtAmt(bkTotal + unmatchedGLTotal), 14)}`, '',
    )
  }

  if (selected.result) {
    const diff = (glTotal + unmatchedBKTotal) - (bkTotal + unmatchedGLTotal)
    lines.push(divider, 'RECONCILIATION RESULT', divider, '',
      `  Adjusted Book Balance:                 ${rpad(fmtAmt(glTotal + unmatchedBKTotal), 14)}`,
      `  Adjusted Bank Balance:                 ${rpad(fmtAmt(bkTotal + unmatchedGLTotal), 14)}`,
      `  DIFFERENCE:                            ${rpad(fmtAmt(diff), 14)}`,
      `  STATUS: ${Math.abs(diff) < 0.02 ? 'RECONCILED' : 'UNRECONCILED \u2014 INVESTIGATE'}`, '',
    )
  }

  if (selected.glDetail && unmatchedGL.length > 0) {
    lines.push(divider, 'DETAIL: OUTSTANDING GL ITEMS (in books, not on bank)', divider, '')
    for (const r of unmatchedGL) {
      lines.push(`  ${pad(fmtDate(r.date), 12)} ${pad(r.desc, 42)} ${rpad(fmtAmt(r.net), 14)}`)
    }
    lines.push('')
  }

  if (selected.bankDetail && unmatchedBK.length > 0) {
    const cats = Object.keys(bankByCategory || {}).sort()
    lines.push(divider, 'DETAIL: UNRECORDED BANK ITEMS (on bank, not in books)', divider, '')
    for (const cat of cats) {
      const items = bankByCategory[cat]
      if (!items?.length) continue
      lines.push(`  --- ${CATEGORY_LABELS[cat] || cat} ---`)
      for (const r of items) {
        lines.push(`  ${pad(fmtDate(r.date), 12)} ${pad(r.desc, 42)} ${rpad(fmtAmt(r.amt), 14)}`)
      }
      lines.push('')
    }
  }

  if (selected.nearMatch && nearMatch.length > 0) {
    lines.push(divider, 'DETAIL: NEAR-MATCHES (review recommended)', divider, '')
    for (const { gl, bk, dayDiff: dd } of nearMatch) {
      lines.push(`  GL: ${pad(fmtDate(gl.date), 12)} ${pad(gl.desc, 30)} ${rpad(fmtAmt(gl.net), 12)}`)
      lines.push(`  BK: ${pad(fmtDate(bk.date), 12)} ${pad(bk.desc, 30)} ${rpad(fmtAmt(bk.amt), 12)}  (${dd} days apart)`)
      lines.push('')
    }
  }

  if (selected.matched && matched.length > 0) {
    lines.push(divider, 'DETAIL: MATCHED TRANSACTIONS', divider, '')
    for (const { gl, bk, dayDiff: dd } of matched) {
      lines.push(`  GL: ${pad(fmtDate(gl.date), 12)} ${pad(gl.desc, 30)} ${rpad(fmtAmt(gl.net), 12)}`)
      lines.push(`  BK: ${pad(fmtDate(bk.date), 12)} ${pad(bk.desc, 30)} ${rpad(fmtAmt(bk.amt), 12)}  (${dd}d)`)
      lines.push('')
    }
  }

  if (selected.verification && verification) {
    lines.push(divider, 'INTEGRITY VERIFICATION', divider, '', `  ${verification.summary}`, '')
    for (const check of verification.checks) {
      const icon = check.pass ? 'PASS' : check.severity === 'warning' ? 'WARN' : 'FAIL'
      lines.push(`  [${icon}] ${check.label}: ${check.detail}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// Excel number formats
const FMT_ACCT = '_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)'  // Accounting
const FMT_DATE = 'm/d/yyyy'
const FMT_INT = '#,##0'

/**
 * Convert a JS Date to an Excel serial date number.
 * Excel epoch is Jan 0, 1900 (with the Lotus 1-2-3 leap year bug).
 */
function toExcelDate(d) {
  if (!d) return ''
  const epoch = new Date(1899, 11, 30) // Dec 30, 1899
  return (d - epoch) / 86400000
}

/**
 * Apply cell format to a range of cells in a worksheet.
 * colFormats is an object: { colIndex: formatString }
 * Applies from startRow to endRow (inclusive, 0-indexed).
 */
function applyFormats(ws, colFormats, startRow, endRow) {
  const range = ws['!ref'] ? XLSX_RANGE(ws['!ref']) : null
  if (!range) return
  for (let r = startRow; r <= endRow; r++) {
    for (const [c, fmt] of Object.entries(colFormats)) {
      const addr = cellAddr(r, +c)
      if (ws[addr]) ws[addr].z = fmt
    }
  }
}

/** Convert 0-indexed row,col to Excel cell address like "A1" */
function cellAddr(r, c) {
  let col = ''
  let cc = c
  do { col = String.fromCharCode(65 + (cc % 26)) + col; cc = Math.floor(cc / 26) - 1 } while (cc >= 0)
  return col + (r + 1)
}

/** Parse a range string like "A1:G100" into { sr, sc, er, ec } */
function XLSX_RANGE(ref) {
  const parts = ref.split(':')
  const decode = (s) => {
    let c = 0, r = 0, i = 0
    while (i < s.length && s.charCodeAt(i) >= 65) { c = c * 26 + (s.charCodeAt(i) - 64); i++ }
    r = parseInt(s.slice(i)) - 1
    return { r, c: c - 1 }
  }
  const s = decode(parts[0]), e = parts[1] ? decode(parts[1]) : s
  return { sr: s.r, sc: s.c, er: e.r, ec: e.c }
}

/**
 * Build a formatted transaction sheet (used for matched, near-match).
 * Columns: GL Date | GL Description | GL Amount | Bank Date | Bank Description | Bank Amount | Day Gap
 */
function buildMatchSheet(XLSX, rows, totals) {
  const data = [['GL Date', 'GL Description', 'GL Amount', 'Bank Date', 'Bank Description', 'Bank Amount', 'Day Gap']]
  for (const { gl, bk, dayDiff: dd } of rows) {
    data.push([toExcelDate(gl.date), gl.desc, gl.net, toExcelDate(bk.date), bk.desc, bk.amt, dd])
  }
  if (totals) {
    data.push([])
    data.push(['', 'TOTAL', totals.gl, '', 'TOTAL', totals.bk, ''])
  }
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 12 }, { wch: 50 }, { wch: 16 }, { wch: 8 }]
  // Format date columns (0, 3) and amount columns (2, 5)
  const lastRow = data.length - 1
  applyFormats(ws, { 0: FMT_DATE, 2: FMT_ACCT, 3: FMT_DATE, 5: FMT_ACCT, 6: FMT_INT }, 1, lastRow)
  return ws
}

/**
 * Build Excel workbook with selected sections as separate sheets.
 * All dates as Excel date serials, all amounts in accounting format.
 */
async function buildExcelWorkbook(results, recMonth, recYear, selected) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  const { matched, nearMatch, unmatchedGL, unmatchedBK, bankByCategory,
          inTransitGL, inTransitBK, receiptDetails, verification } = results

  const matchedGLTotal = matched.reduce((s, m) => s + m.gl.net, 0)
  const matchedBKTotal = matched.reduce((s, m) => s + m.bk.amt, 0)
  const nearMatchGLTotal = nearMatch.reduce((s, m) => s + m.gl.net, 0)
  const unmatchedGLTotal = sum(unmatchedGL, 'net')
  const unmatchedBKTotal = sum(unmatchedBK, 'amt')
  const inTransitGLTotal = sum(inTransitGL, 'net')
  const inTransitBKTotal = sum(inTransitBK, 'amt')

  // ── Summary sheet ──
  if (selected.summary || selected.result) {
    const data = [
      ['BANK RECONCILIATION', `${MONTHS[recMonth]} ${recYear}`],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Category', 'Count', 'Amount'],
      ['Matched', matched.length, matchedBKTotal],
      ['Near-Match', nearMatch.length, nearMatchGLTotal],
      ['Unmatched GL', unmatchedGL.length, unmatchedGLTotal],
      ['Unmatched Bank', unmatchedBK.length, unmatchedBKTotal],
      ['In-Transit GL', inTransitGL.length, inTransitGLTotal],
      ['In-Transit Bank', inTransitBK.length, inTransitBKTotal],
    ]
    if (receiptDetails?.length > 0) {
      data.push(['Receipt Details (excluded)', receiptDetails.length, sum(receiptDetails, 'net')])
    }
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 18 }]
    applyFormats(ws, { 1: FMT_INT, 2: FMT_ACCT }, 4, data.length - 1)
    XLSX.utils.book_append_sheet(wb, ws, 'Summary')
  }

  // ── Matched ──
  if (selected.matched && matched.length > 0) {
    const ws = buildMatchSheet(XLSX, matched, { gl: matchedGLTotal, bk: matchedBKTotal })
    XLSX.utils.book_append_sheet(wb, ws, 'Matched')
  }

  // ── Near-matches ──
  if (selected.nearMatch && nearMatch.length > 0) {
    const ws = buildMatchSheet(XLSX, nearMatch, null)
    XLSX.utils.book_append_sheet(wb, ws, 'Near-Match')
  }

  // ── Unmatched GL ──
  if (selected.glDetail && unmatchedGL.length > 0) {
    const data = [['Date', 'Description', 'Amount', 'Control #', 'Type']]
    for (const r of unmatchedGL) {
      data.push([toExcelDate(r.date), r.desc, r.net, r.control, r.isDepositTotal ? 'Deposit Total' : 'Payment'])
    }
    data.push([])
    data.push(['', 'TOTAL', unmatchedGLTotal, '', ''])
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 12 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 16 }]
    applyFormats(ws, { 0: FMT_DATE, 2: FMT_ACCT }, 1, data.length - 1)
    XLSX.utils.book_append_sheet(wb, ws, 'Outstanding GL')
  }

  // ── Unmatched Bank ──
  if (selected.bankDetail && unmatchedBK.length > 0) {
    const data = [['Date', 'Description', 'Amount', 'Category']]
    for (const r of unmatchedBK) {
      data.push([toExcelDate(r.date), r.desc, r.amt, CATEGORY_LABELS[r.category] || r.category])
    }
    data.push([])
    data.push(['', 'TOTAL', unmatchedBKTotal, ''])
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 12 }, { wch: 70 }, { wch: 16 }, { wch: 16 }]
    applyFormats(ws, { 0: FMT_DATE, 2: FMT_ACCT }, 1, data.length - 1)
    XLSX.utils.book_append_sheet(wb, ws, 'Unrecorded Bank')
  }

  // ── Verification ──
  if (selected.verification && verification) {
    const data = [['Check', 'Status', 'Detail']]
    for (const c of verification.checks) {
      data.push([c.label, c.pass ? 'PASS' : c.severity === 'warning' ? 'WARN' : 'FAIL', c.detail])
    }
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 30 }, { wch: 8 }, { wch: 80 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Verification')
  }

  return wb
}

/**
 * ReportModal — popup with section checkboxes + Copy / Download Excel buttons.
 */
export function ReportModal({ results, recMonth, recYear, onClose }) {
  const [selected, setSelected] = useState(() => {
    const init = {}
    for (const s of SECTIONS) init[s.key] = s.default
    return init
  })
  const [copied, setCopied] = useState(false)

  const toggle = (key) => setSelected(prev => ({ ...prev, [key]: !prev[key] }))

  const selectAll = () => {
    const next = {}
    for (const s of SECTIONS) next[s.key] = true
    setSelected(next)
  }
  const selectNone = () => {
    const next = {}
    for (const s of SECTIONS) next[s.key] = false
    setSelected(next)
  }

  const handleCopy = useCallback(() => {
    const text = buildTextReport(results, recMonth, recYear, selected)
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [results, recMonth, recYear, selected])

  const handleDownloadExcel = useCallback(async () => {
    const XLSX = await import('xlsx')
    const wb = await buildExcelWorkbook(results, recMonth, recYear, selected)
    const filename = `Bank_Rec_${MONTHS[recMonth]}_${recYear}.xlsx`
    XLSX.writeFile(wb, filename)
  }, [results, recMonth, recYear, selected])

  const [emailCopied, setEmailCopied] = useState(false)

  const handleEmail = useCallback(() => {
    const text = buildTextReport(results, recMonth, recYear, selected)
    const subject = `Bank Reconciliation \u2014 ${MONTHS[recMonth]} ${recYear}`
    // Copy full report to clipboard (avoids mailto: URL length limits)
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${text}`)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 3000)
  }, [results, recMonth, recYear, selected])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-gray-900">Export Report</div>
            <div className="text-xs text-gray-400 mt-0.5">Choose sections to include</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Section Checkboxes */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Select All</button>
            <span className="text-gray-300">|</span>
            <button onClick={selectNone} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Select None</button>
          </div>
          <div className="flex flex-col gap-2">
            {SECTIONS.map(s => (
              <label key={s.key} className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2">
                <input
                  type="checkbox"
                  checked={selected[s.key]}
                  onChange={() => toggle(s.key)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-gray-200 flex flex-wrap gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            {copied ? '\u2713 Copied!' : 'Copy to Clipboard'}
          </button>
          <button
            onClick={handleDownloadExcel}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            Download Excel
          </button>
          <button
            onClick={handleEmail}
            className="flex-1 border border-gray-300 hover:border-indigo-400 text-gray-700 hover:text-indigo-700 font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm"
          >
            {emailCopied ? '\u2713 Copied — paste into email' : 'Copy for Email'}
          </button>
        </div>
      </div>
    </div>
  )
}
