import { isDateLike, parseAmt, findHeaderRow } from './csv'

/**
 * Normalize a header string for matching.
 */
function norm(s) { return (s || '').toLowerCase().trim().replace(/[_\-\s]+/g, ' ') }

/**
 * Find a column index by matching header names against patterns.
 * Returns the first match, or -1.
 */
function findCol(headers, patterns) {
  for (const pat of patterns) {
    const idx = headers.findIndex(h => pat.test(norm(h)))
    if (idx >= 0) return idx
  }
  return -1
}

/**
 * Detect column mapping for bank statement data.
 * Uses header-name matching first (handles Wells Fargo BAI2, BofA, PNC, etc.),
 * then falls back to content-based detection.
 */
export function detectBankCols(rows) {
  const empty = { dateCol: -1, amtCol: -1, descCol: -1, debitCol: -1, creditCol: -1, headerRow: 0 }
  if (rows.length < 2) return empty

  // Find the header row (skip any metadata rows)
  const headerRow = findHeaderRow(rows, ['date', 'debit', 'credit', 'amount', 'desc', 'tran'])
  const hdr = rows[headerRow]
  const sample = rows.slice(headerRow + 1, Math.min(headerRow + 10, rows.length))

  // --- Header-name matching (primary strategy) ---
  // Date: "As-Of Date", "Date", "Posted Date", "Trans Date", "Value Date", "Posting Date"
  let dateCol = findCol(hdr, [
    /^as.of.date$/, /^post(ed|ing)?\s*date$/, /^trans(action)?\s*date$/, /^value\s*date$/,
    /^date$/, /^eff(ective)?\s*date$/
  ])

  // Debit: "Debit Amt", "Debit", "Debit Amount", "Withdrawals", "Charge"
  let debitCol = findCol(hdr, [
    /^debit\s*am(oun)?t?$/, /^debit$/, /^withdraw/, /^charge/
  ])

  // Credit: "Credit Amt", "Credit", "Credit Amount", "Deposits"
  let creditCol = findCol(hdr, [
    /^credit\s*am(oun)?t?$/, /^credit$/, /^deposit/
  ])

  // Single amount column
  let amtCol = findCol(hdr, [
    /^amount$/, /^am(oun)?t$/, /^transaction\s*amount$/, /^ledger\s*am/
  ])

  // Description: "Description", "Tran Desc", "Memo", "Narrative", "Details"
  let descCol = findCol(hdr, [
    /^description$/, /^tran(saction)?\s*desc/, /^memo$/, /^narr/, /^detail/,
    /^particular/, /^payee/
  ])

  // --- Content-based fallback for date ---
  if (dateCol === -1) {
    for (let i = 0; i < hdr.length; i++) {
      const matches = sample.filter(r => isDateLike(r[i] || '')).length
      if (matches >= Math.min(2, sample.length)) { dateCol = i; break }
    }
  }

  // --- Content-based fallback for amounts ---
  if (amtCol === -1 && debitCol === -1) {
    for (let i = 0; i < hdr.length; i++) {
      if (i === dateCol || i === descCol) continue
      const vals = sample.map(r => parseAmt(r[i])).filter(v => v != null)
      if (vals.length >= 2) { amtCol = i; break }
    }
  }

  // --- Content-based fallback for description (longest average text) ---
  if (descCol === -1) {
    let best = -1, bestLen = 0
    for (let i = 0; i < hdr.length; i++) {
      if ([dateCol, amtCol, debitCol, creditCol].includes(i)) continue
      const avg = sample.reduce((s, r) => s + (r[i] || '').length, 0) / Math.max(sample.length, 1)
      if (avg > bestLen) { bestLen = avg; best = i }
    }
    if (bestLen > 5) descCol = best
  }

  return { dateCol, amtCol, descCol, debitCol, creditCol, headerRow }
}

/**
 * Detect column mapping for Yardi GL export data.
 * Handles metadata rows at top (property name, period, book, etc.),
 * finds the actual header row, and maps columns by name.
 */
export function detectGLCols(rows) {
  const empty = { dateCol: -1, debitCol: -1, creditCol: -1, descCol: -1, controlCol: -1, headerRow: 0 }
  if (rows.length < 2) return empty

  // Find header row — Yardi GL exports often have 3-6 metadata rows before headers
  const headerRow = findHeaderRow(rows, ['date', 'debit', 'credit', 'description', 'control', 'person'])
  const hdr = rows[headerRow]
  const sample = rows.slice(headerRow + 1, Math.min(headerRow + 15, rows.length))
    .filter(r => {
      // Skip blank rows and summary rows for sampling
      const desc = r.join(' ').toLowerCase()
      return !desc.includes('beginning balance') && !desc.includes('ending balance')
        && !desc.includes('net change') && r.some(c => c && c.trim() !== '')
    })

  // --- Header-name matching ---
  // Date
  let dateCol = findCol(hdr, [
    /^date$/, /^post(ed|ing)?\s*date$/, /^trans(action)?\s*date$/, /^period$/
  ])

  // Debit
  let debitCol = findCol(hdr, [
    /^debit$/, /^debit\s*am/, /^dr$/
  ])

  // Credit
  let creditCol = findCol(hdr, [
    /^credit$/, /^credit\s*am/, /^cr$/
  ])

  // Description: "Person/Description", "Description", "Memo"
  let descCol = findCol(hdr, [
    /person.*desc/, /^description$/, /^desc$/, /^memo$/, /^narr/, /^remarks?$/
  ])

  // Control/Reference: "Control", "Ref", "Reference", "Journal"
  let controlCol = findCol(hdr, [
    /^control$/, /^ctrl$/, /^ref(erence)?$/, /^journal/, /^j\.?e\.?\s*#?$/
  ])

  // --- Content-based fallbacks ---
  if (dateCol === -1) {
    for (let i = 0; i < hdr.length; i++) {
      const matches = sample.filter(r => isDateLike(r[i] || '')).length
      if (matches >= Math.min(2, sample.length)) { dateCol = i; break }
    }
  }

  if (debitCol === -1) {
    const candidates = []
    for (let i = 0; i < hdr.length; i++) {
      if ([dateCol, descCol, controlCol].includes(i)) continue
      const vals = sample.map(r => parseAmt(r[i])).filter(v => v != null && v >= 0)
      if (vals.length >= 1) candidates.push(i)
    }
    if (candidates.length >= 2) {
      debitCol = candidates[0]
      creditCol = candidates[1]
    }
  }

  if (descCol === -1) {
    let best = -1, bestLen = 0
    for (let i = 0; i < hdr.length; i++) {
      if ([dateCol, debitCol, creditCol, controlCol].includes(i)) continue
      const avg = sample.reduce((s, r) => s + (r[i] || '').length, 0) / Math.max(sample.length, 1)
      if (avg > bestLen) { bestLen = avg; best = i }
    }
    if (bestLen > 3) descCol = best
  }

  return { dateCol, debitCol, creditCol, descCol, controlCol, headerRow }
}
