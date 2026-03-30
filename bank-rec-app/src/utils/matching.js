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
 * Categorize a bank transaction by its description.
 * Returns: 'ach', 'wire', 'fee', 'check', 'transfer', 'other'
 */
export function categorizeBankItem(desc) {
  const d = (desc || '').toUpperCase()
  if (/\bWT\b|WIRE\s*(TRANSFER|TRF|XFER)?|FED\s*#|FEDWIRE|SWIFT/i.test(d)) return 'wire'
  if (/\bACH\b|AUTOPAY|AUTO\s*PAY|DIRECT\s*DEP|ELEC\s*(DEPOSIT|PMT)|E-?CHECK/i.test(d)) return 'ach'
  if (/\bFEE\b|SRVC\s*CHRG|SERVICE\s*CHARGE|ANALYSIS\s*CHRG|MAINTENANCE|MAINT\s*FEE|OVERDRAFT/i.test(d)) return 'fee'
  if (/^CHECK\b|^CHK\b|CHECK\s*#?\d|CHK\s*#?\d/i.test(d)) return 'check'
  if (/\bTRANSFER\b|XFER|TRF(?!\s*FEE)/i.test(d)) return 'transfer'
  return 'other'
}

export const CATEGORY_LABELS = {
  ach: 'ACH',
  wire: 'Wire Transfer',
  fee: 'Bank Fee',
  check: 'Check',
  transfer: 'Transfer',
  other: 'Other',
}

/**
 * Parse GL rows from raw parsed data, using detected column mapping.
 * Filters out metadata, summary, and zero-amount rows.
 * Marks "Deposit Total" rows — those are the batched deposits that match bank entries.
 */
export function parseGLRows(rows, cols) {
  const dataRows = rows.slice(cols.headerRow + 1)

  return dataRows.map((r, i) => {
    if (isSummaryRow(r)) return null

    const debit = parseAmt(r[cols.debitCol]) || 0
    const credit = parseAmt(r[cols.creditCol]) || 0
    const net = debit - credit  // GL: debit = money in for cash account
    const desc = cols.descCol >= 0 ? (r[cols.descCol] || '').trim() : ''
    const date = parseDate(r[cols.dateCol])

    if (debit === 0 && credit === 0) return null
    if (!date) return null

    return {
      id: 'gl_' + i,
      date, desc,
      debit, credit, net,
      control: cols.controlCol >= 0 ? (r[cols.controlCol] || '').trim() : '',
      isDepositTotal: /deposit\s*total/i.test(desc),
    }
  }).filter(Boolean)
}

/**
 * Separate GL rows into matchable items (deposit totals + non-deposit items like checks/wires)
 * and individual receipt lines (which roll up into deposit totals and should NOT be matched).
 *
 * Logic: if ANY deposit total rows exist, individual receipt lines (positive-net credits
 * that are NOT deposit totals) are excluded from matching to prevent double-counting.
 */
export function splitGLForMatching(glRows) {
  const hasDepositTotals = glRows.some(r => r.isDepositTotal)

  if (!hasDepositTotals) {
    return { matchable: glRows, receiptDetails: [] }
  }

  const matchable = []
  const receiptDetails = []

  for (const r of glRows) {
    if (r.isDepositTotal) {
      matchable.push(r)
    } else if (r.net > 0) {
      // Positive net = money in → individual receipt within a deposit batch
      receiptDetails.push(r)
    } else {
      // Negative net = money out (checks, wires, payments) → matchable
      matchable.push(r)
    }
  }

  return { matchable, receiptDetails }
}

/**
 * Parse bank statement rows from raw parsed data, using detected column mapping.
 * Handles both single-amount and separate debit/credit column formats.
 * Adds category to each row.
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
      amt = c - d
    }

    const date = parseDate(r[cols.dateCol])
    const desc = cols.descCol >= 0 ? (r[cols.descCol] || '').trim() : ''

    if (amt == null || amt === 0) return null
    if (!date) return null

    return { id: 'bk_' + i, date, desc, amt, category: categorizeBankItem(desc) }
  }).filter(Boolean)
}

/**
 * Detect the dominant month/year in a set of dated rows.
 * Returns { month: 0-11, year: YYYY } of the most common month.
 */
export function detectPeriod(rows) {
  const counts = {}
  for (const r of rows) {
    if (!r.date) continue
    const key = `${r.date.getFullYear()}-${r.date.getMonth()}`
    counts[key] = (counts[key] || 0) + 1
  }
  let best = null, bestCount = 0
  for (const [key, count] of Object.entries(counts)) {
    if (count > bestCount) { bestCount = count; best = key }
  }
  if (!best) return null
  const [y, m] = best.split('-')
  return { month: +m, year: +y }
}

function dayDiff(a, b) {
  if (!a || !b) return 999
  return Math.round(Math.abs((a - b) / 86400000))
}

/**
 * Main matching engine.
 *
 * Key: only matches deposit-total GL rows (not individual receipt lines)
 * against bank items, preventing double-counting.
 *
 * Pass 1: exact amount match within 7-day window (±$0.02 tolerance)
 * Pass 2: exact amount match within 21-day window (near-match, flagged for review)
 */
export function matchTransactions(gl, bk, recMonth, recYear, transitStart, transitEnd) {
  // Split GL into matchable items vs receipt detail lines
  const { matchable: glMatchable, receiptDetails } = splitGLForMatching(gl)

  // Separate in-transit items
  const isInTransitGL = (r) => {
    if (!r.date) return false
    const m = r.date.getMonth(), y = r.date.getFullYear(), d = r.date.getDate()
    return m === recMonth && y === recYear && d >= transitStart
  }
  const isInTransitBK = (r) => {
    if (!r.date) return false
    const m = r.date.getMonth(), y = r.date.getFullYear(), d = r.date.getDate()
    const nextMonth = recMonth === 11 ? 0 : recMonth + 1
    const nextYear = recMonth === 11 ? recYear + 1 : recYear
    if (m === nextMonth && y === nextYear && d <= transitEnd) return true
    return false
  }

  const inTransitGL = glMatchable.filter(isInTransitGL)
  const inTransitBK = bk.filter(isInTransitBK)
  const glFiltered = glMatchable.filter(r => !isInTransitGL(r))
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

  // Detect periods for warning
  const glPeriod = detectPeriod(gl)
  const bkPeriod = detectPeriod(bk)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  let periodWarning = null

  if (glPeriod && bkPeriod && (glPeriod.month !== bkPeriod.month || glPeriod.year !== bkPeriod.year)) {
    periodWarning = `GL data is mostly ${MONTHS[glPeriod.month]} ${glPeriod.year}, but bank data is mostly ${MONTHS[bkPeriod.month]} ${bkPeriod.year}. This may cause extra unmatched items.`
  }
  if (glPeriod && (glPeriod.month !== recMonth || glPeriod.year !== recYear)) {
    const selWarning = `Selected period is ${MONTHS[recMonth]} ${recYear}, but GL data is mostly ${MONTHS[glPeriod.month]} ${glPeriod.year}. Consider adjusting the reconciliation month.`
    periodWarning = periodWarning ? periodWarning + ' ' + selWarning : selWarning
  }

  // Categorize unmatched bank items
  const unmatchedBK = bankFiltered.filter(b => !usedBK.has(b.id))
  const bankByCategory = {}
  for (const b of unmatchedBK) {
    const cat = b.category || 'other'
    if (!bankByCategory[cat]) bankByCategory[cat] = []
    bankByCategory[cat].push(b)
  }

  return {
    matched, nearMatch,
    unmatchedGL: glFiltered.filter(g => !usedGL.has(g.id)),
    unmatchedBK,
    bankByCategory,
    inTransitGL,
    inTransitBK,
    receiptDetails,
    periodWarning,
    glPeriod,
    bkPeriod,
  }
}
