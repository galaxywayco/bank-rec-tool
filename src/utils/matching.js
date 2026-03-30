import { parseAmt, parseDate } from './csv'

/**
 * Patterns that indicate a row is a summary/total/balance row and should be excluded.
 */
const SKIP_PATTERNS = [
  /beginning\s*balance/i,
  /ending\s*balance/i,
  /net\s*change/i,
  /grand\s*total/i,
  /report\s*total/i,
  /page\s*total/i,
  /=\s*beginning/i,
  /=\s*ending/i,
]

/**
 * Check if a row looks like a summary/metadata row that should be excluded from matching.
 */
function isSummaryRow(row) {
  const text = row.join(' ')
  return SKIP_PATTERNS.some(p => p.test(text))
}

/**
 * Parse GL rows from raw parsed data, using detected column mapping.
 * Filters out metadata, summary, and zero-amount rows.
 * Keeps "Deposit Total" rows — those are the batched deposits that match bank entries.
 */
export function parseGLRows(rows, cols) {
  // Start after the header row
  const dataRows = rows.slice(cols.headerRow + 1)

  return dataRows.map((r, i) => {
    // Skip summary/balance rows
    if (isSummaryRow(r)) return null

    const debit = parseAmt(r[cols.debitCol]) || 0
    const credit = parseAmt(r[cols.creditCol]) || 0
    const net = debit - credit  // GL: debit = money in for cash account
    const desc = cols.descCol >= 0 ? (r[cols.descCol] || '').trim() : ''
    const date = parseDate(r[cols.dateCol])

    // Skip rows with no amount
    if (debit === 0 && credit === 0) return null
    // Skip rows with no date
    if (!date) return null

    return {
      id: 'gl_' + i,
      date,
      desc,
      debit, credit, net,
      control: cols.controlCol >= 0 ? (r[cols.controlCol] || '').trim() : '',
      isDepositTotal: /deposit\s*total/i.test(desc),
    }
  }).filter(Boolean)
}

/**
 * Parse bank statement rows from raw parsed data, using detected column mapping.
 * Handles both single-amount and separate debit/credit column formats.
 */
export function parseBankRows(rows, cols) {
  const dataRows = rows.slice(cols.headerRow + 1)

  return dataRows.map((r, i) => {
    let amt = null
    if (cols.amtCol >= 0) {
      amt = parseAmt(r[cols.amtCol])
    } else if (cols.debitCol >= 0 || cols.creditCol >= 0) {
      const d = cols.debitCol >= 0 ? (parseAmt(r[cols.debitCol]) || 0) : 0
      const c = cols.creditCol >= 0 ? (parseAmt(r[cols.creditCol]) || 0) : 0
      // Bank: credit = money in, debit = money out
      amt = c - d
    }

    const date = parseDate(r[cols.dateCol])
    const desc = cols.descCol >= 0 ? (r[cols.descCol] || '').trim() : ''

    // Skip rows with no amount or no date
    if (amt == null || amt === 0) return null
    if (!date) return null

    return { id: 'bk_' + i, date, desc, amt }
  }).filter(Boolean)
}

function dayDiff(a, b) {
  if (!a || !b) return 999
  return Math.round(Math.abs((a - b) / 86400000))
}

/**
 * Main matching engine.
 * Pass 1: exact amount match within 7-day window (±$0.02 tolerance)
 * Pass 2: exact amount match within 21-day window (near-match, flagged for review)
 */
export function matchTransactions(gl, bk, recMonth, recYear, transitStart, transitEnd) {
  // Separate in-transit items
  const isInTransitGL = (r) => {
    if (!r.date) return false
    const m = r.date.getMonth(), y = r.date.getFullYear(), d = r.date.getDate()
    return m === recMonth && y === recYear && d >= transitStart
  }
  const isInTransitBK = (r) => {
    if (!r.date) return false
    const m = r.date.getMonth(), y = r.date.getFullYear(), d = r.date.getDate()
    // Next month items in the first few days
    const nextMonth = recMonth === 11 ? 0 : recMonth + 1
    const nextYear = recMonth === 11 ? recYear + 1 : recYear
    if (m === nextMonth && y === nextYear && d <= transitEnd) return true
    return false
  }

  const inTransitGL = gl.filter(isInTransitGL)
  const inTransitBK = bk.filter(isInTransitBK)
  const glFiltered = gl.filter(r => !isInTransitGL(r))
  const bankFiltered = bk.filter(r => !isInTransitBK(r))

  const usedGL = new Set(), usedBK = new Set()
  const matched = [], nearMatch = []

  // Pass 1: exact match within 7-day window
  for (const b of bankFiltered) {
    if (usedBK.has(b.id)) continue
    let best = null, bestD = 8
    for (const g of glFiltered) {
      if (usedGL.has(g.id)) continue
      if (Math.abs(g.net - b.amt) <= 0.02) {
        const dd = dayDiff(g.date, b.date)
        if (dd < bestD) { bestD = dd; best = g }
      }
    }
    if (best) {
      usedGL.add(best.id); usedBK.add(b.id)
      matched.push({ gl: best, bk: b, dayDiff: bestD })
    }
  }

  // Pass 2: near-match within 21-day window
  for (const b of bankFiltered) {
    if (usedBK.has(b.id)) continue
    let best = null, bestD = 22
    for (const g of glFiltered) {
      if (usedGL.has(g.id)) continue
      if (Math.abs(g.net - b.amt) <= 0.02) {
        const dd = dayDiff(g.date, b.date)
        if (dd < bestD) { bestD = dd; best = g }
      }
    }
    if (best) {
      usedGL.add(best.id); usedBK.add(b.id)
      nearMatch.push({ gl: best, bk: b, dayDiff: bestD })
    }
  }

  return {
    matched, nearMatch,
    unmatchedGL: glFiltered.filter(g => !usedGL.has(g.id)),
    unmatchedBK: bankFiltered.filter(b => !usedBK.has(b.id)),
    inTransitGL,
    inTransitBK,
  }
}
