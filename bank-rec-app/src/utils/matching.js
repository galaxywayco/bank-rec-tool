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
 * Returns: 'wire', 'card_deposit', 'settlement', 'ach', 'fee', 'check', 'transfer', 'other'
 */
export function categorizeBankItem(desc) {
  const d = (desc || '').toUpperCase()
  // Wire transfers (PNC WT FED#, FEDWIRE, SWIFT, etc.)
  if (/\bWT\b|WIRE\s*(TRANSFER|TRF|XFER)?|FED\s*#|FEDWIRE|SWIFT/i.test(d)) return 'wire'
  // Card/payment processor deposits (Yardi card deposits, Stripe, Square, etc.)
  if (/CARD\s*DEP|YARDI\s*CARD|STRIPE|SQUARE\s*DEP|POS\s*DEP/i.test(d)) return 'card_deposit'
  // Settlement deposits (Westminster, payment processor settlements)
  if (/SETTLEMENT|SETTLE\b/i.test(d)) return 'settlement'
  // ACH deposits/payments
  if (/\bACH\b|AUTOPAY|AUTO\s*PAY|DIRECT\s*DEP|ELEC\s*(DEPOSIT|PMT)|E-?CHECK/i.test(d)) return 'ach'
  // Fees and service charges
  if (/\bFEE\b|SRVC\s*CHRG|SERVICE\s*CHARGE|ANALYSIS\s*CHRG|MAINTENANCE|MAINT\s*FEE|OVERDRAFT/i.test(d)) return 'fee'
  // Checks
  if (/^CHECK\b|^CHK\b|CHECK\s*#?\d|CHK\s*#?\d/i.test(d)) return 'check'
  // Internal transfers
  if (/\bTRANSFER\b|XFER|TRF(?!\s*FEE)/i.test(d)) return 'transfer'
  return 'other'
}

export const CATEGORY_LABELS = {
  wire: 'Wire Transfer',
  card_deposit: 'Card Deposit',
  settlement: 'Settlement',
  ach: 'ACH',
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

  const unmatchedGL = glFiltered.filter(g => !usedGL.has(g.id))

  return {
    matched, nearMatch,
    unmatchedGL,
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

/**
 * DETERMINISTIC VERIFICATION ENGINE
 *
 * Runs pure-math checks on reconciliation results. No AI, no guessing.
 * Each check returns { pass: boolean, label: string, detail: string }
 */
export function runVerification(results) {
  const checks = []
  const { matched, nearMatch, unmatchedGL, unmatchedBK,
          inTransitGL, inTransitBK, receiptDetails, gl, bk } = results

  // ── CHECK 1: Row accountability (GL) ──
  // Every parsed GL row must appear in exactly one bucket
  const glMatchable = matched.length + nearMatch.length + unmatchedGL.length + inTransitGL.length
  const glTotal = glMatchable + (receiptDetails?.length || 0)
  const glParsed = gl.length
  const glPass = glTotal === glParsed
  checks.push({
    pass: glPass,
    label: 'GL Row Accountability',
    detail: glPass
      ? `All ${glParsed} GL rows accounted for (${matched.length} matched + ${nearMatch.length} near + ${unmatchedGL.length} unmatched + ${inTransitGL.length} in-transit + ${receiptDetails?.length || 0} receipt details)`
      : `MISMATCH: ${glParsed} GL rows parsed but ${glTotal} accounted for. ${glParsed - glTotal} row(s) missing.`,
  })

  // ── CHECK 2: Row accountability (Bank) ──
  const bkTotal = matched.length + nearMatch.length + unmatchedBK.length + inTransitBK.length
  const bkParsed = bk.length
  const bkPass = bkTotal === bkParsed
  checks.push({
    pass: bkPass,
    label: 'Bank Row Accountability',
    detail: bkPass
      ? `All ${bkParsed} bank rows accounted for (${matched.length} matched + ${nearMatch.length} near + ${unmatchedBK.length} unmatched + ${inTransitBK.length} in-transit)`
      : `MISMATCH: ${bkParsed} bank rows parsed but ${bkTotal} accounted for. ${bkParsed - bkTotal} row(s) missing.`,
  })

  // ── CHECK 3: Matched amounts cross-foot ──
  // For every matched pair, GL net should equal bank amt within tolerance
  let crossFootErrors = 0
  for (const m of matched) {
    if (Math.abs(m.gl.net - m.bk.amt) > 0.02) crossFootErrors++
  }
  for (const m of nearMatch) {
    if (Math.abs(m.gl.net - m.bk.amt) > 0.02) crossFootErrors++
  }
  checks.push({
    pass: crossFootErrors === 0,
    label: 'Matched Amounts Cross-Foot',
    detail: crossFootErrors === 0
      ? `All ${matched.length + nearMatch.length} matched pairs agree within $0.02`
      : `${crossFootErrors} matched pair(s) have amount differences exceeding $0.02`,
  })

  // ── CHECK 4: No duplicate IDs ──
  const allGLIds = [
    ...matched.map(m => m.gl.id),
    ...nearMatch.map(m => m.gl.id),
    ...unmatchedGL.map(r => r.id),
    ...inTransitGL.map(r => r.id),
    ...(receiptDetails || []).map(r => r.id),
  ]
  const glDupCount = allGLIds.length - new Set(allGLIds).size
  const allBKIds = [
    ...matched.map(m => m.bk.id),
    ...nearMatch.map(m => m.bk.id),
    ...unmatchedBK.map(r => r.id),
    ...inTransitBK.map(r => r.id),
  ]
  const bkDupCount = allBKIds.length - new Set(allBKIds).size
  const noDups = glDupCount === 0 && bkDupCount === 0
  checks.push({
    pass: noDups,
    label: 'No Duplicate Assignments',
    detail: noDups
      ? 'No transaction appears in more than one bucket'
      : `${glDupCount} GL duplicate(s) and ${bkDupCount} bank duplicate(s) found — a row is counted in multiple buckets`,
  })

  // ── CHECK 5: Matched GL total = Matched Bank total ──
  const matchedGLSum = matched.reduce((s, m) => s + m.gl.net, 0)
  const matchedBKSum = matched.reduce((s, m) => s + m.bk.amt, 0)
  const matchedDiff = Math.abs(matchedGLSum - matchedBKSum)
  const matchTotalPass = matchedDiff < 0.02 * matched.length  // allow $0.02 rounding per pair
  checks.push({
    pass: matchTotalPass,
    label: 'Matched Totals Agree',
    detail: matchTotalPass
      ? `Matched GL total ($${matchedGLSum.toFixed(2)}) ≈ Matched bank total ($${matchedBKSum.toFixed(2)}), diff $${matchedDiff.toFixed(2)}`
      : `Matched GL total ($${matchedGLSum.toFixed(2)}) ≠ Matched bank total ($${matchedBKSum.toFixed(2)}), diff $${matchedDiff.toFixed(2)}`,
  })

  // ── CHECK 6: Suspicious duplicates (same amount + same date on same side) ──
  const glAmtDateMap = {}
  const suspiciousGL = []
  for (const r of gl) {
    const key = `${r.date?.toISOString()?.slice(0,10)}|${r.net.toFixed(2)}`
    if (glAmtDateMap[key]) {
      suspiciousGL.push({ existing: glAmtDateMap[key], duplicate: r })
    } else {
      glAmtDateMap[key] = r
    }
  }
  const bkAmtDateMap = {}
  const suspiciousBK = []
  for (const r of bk) {
    const key = `${r.date?.toISOString()?.slice(0,10)}|${r.amt.toFixed(2)}`
    if (bkAmtDateMap[key]) {
      suspiciousBK.push({ existing: bkAmtDateMap[key], duplicate: r })
    } else {
      bkAmtDateMap[key] = r
    }
  }
  const hasSuspicious = suspiciousGL.length > 0 || suspiciousBK.length > 0
  checks.push({
    pass: !hasSuspicious,
    label: 'Possible Duplicate Transactions',
    detail: hasSuspicious
      ? `Found ${suspiciousGL.length} GL and ${suspiciousBK.length} bank entries with same amount + date (possible double-posts). Review recommended.`
      : 'No same-amount, same-date duplicates detected',
    severity: 'warning',  // not an error, just a flag
    duplicates: hasSuspicious ? { gl: suspiciousGL, bk: suspiciousBK } : null,
  })

  // ── CHECK 7: Large unmatched items ──
  const LARGE_THRESHOLD = 50000
  const largeGL = unmatchedGL.filter(r => Math.abs(r.net) >= LARGE_THRESHOLD)
  const largeBK = unmatchedBK.filter(r => Math.abs(r.amt) >= LARGE_THRESHOLD)
  const hasLarge = largeGL.length > 0 || largeBK.length > 0
  checks.push({
    pass: !hasLarge,
    label: `Large Unmatched Items (≥$${(LARGE_THRESHOLD/1000).toFixed(0)}K)`,
    detail: hasLarge
      ? `${largeGL.length} GL and ${largeBK.length} bank unmatched items exceed $${(LARGE_THRESHOLD/1000).toFixed(0)}K. Manual review recommended.`
      : `No unmatched items exceed $${(LARGE_THRESHOLD/1000).toFixed(0)}K`,
    severity: 'warning',
    largeItems: hasLarge ? { gl: largeGL, bk: largeBK } : null,
  })

  // ── OVERALL SCORE ──
  const hardChecks = checks.filter(c => c.severity !== 'warning')
  const passCount = hardChecks.filter(c => c.pass).length
  const totalHard = hardChecks.length
  const allHardPass = passCount === totalHard

  return {
    checks,
    passCount,
    totalChecks: checks.length,
    totalHard,
    allHardPass,
    summary: allHardPass
      ? `All ${totalHard} integrity checks passed.`
      : `${totalHard - passCount} of ${totalHard} integrity checks FAILED.`,
  }
}
