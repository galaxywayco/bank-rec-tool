/**
 * Smart CSV/TSV parser — auto-detects delimiter (comma vs tab).
 * Handles quoted fields, mixed delimiters, and Excel copy-paste.
 */
export function parseCSV(text) {
  if (!text || !text.trim()) return []
  const lines = text.trim().split(/\r?\n/)

  // Auto-detect delimiter: if first line has tabs and more tabs than commas, use tab
  const firstLine = lines[0]
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const delim = tabCount > 0 && tabCount >= commaCount ? '\t' : ','

  return lines.map(line => {
    const result = []; let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        if (inQ && i + 1 < line.length && line[i + 1] === '"') {
          cur += '"'; i++ // escaped quote
        } else {
          inQ = !inQ
        }
      } else if (c === delim && !inQ) {
        result.push(cur.trim().replace(/^"|"$/g, '')); cur = ''
      } else {
        cur += c
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''))
    return result
  }).filter(r => r.some(c => c !== ''))
}

/**
 * Detect whether a string looks like a date.
 * Supports: M/D/YYYY, YYYY-MM-DD, YYYYMMDD, datetime strings
 */
export function isDateLike(s) {
  if (!s) return false
  s = String(s).trim()
  // M/D/YYYY or M-D-YYYY
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return true
  // YYYY-MM-DD or YYYY/MM/DD (optionally with time)
  if (/^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(s)) return true
  // YYYYMMDD (compact — Wells Fargo, BAI2)
  if (/^\d{8}$/.test(s)) return true
  return false
}

/**
 * Parse a date string into a Date object.
 * Supports: M/D/YYYY, YYYY-MM-DD, YYYYMMDD, YYYY/MM/DD, datetime with time
 */
export function parseDate(s) {
  if (!s) return null
  s = String(s).trim()

  // YYYYMMDD (compact — Wells Fargo BAI2 format)
  let m = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  // M/D/YYYY or M-D-YYYY
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return new Date(+yr, +m[1] - 1, +m[2]) }

  // YYYY-MM-DD or YYYY/MM/DD (with optional time)
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])

  // Fallback
  const d = new Date(s); return isNaN(d) ? null : d
}

/**
 * Parse an amount string into a number.
 * Handles: $1,234.56, (1234.56), -1234.56, .00, plain numbers
 */
export function parseAmt(s) {
  if (s == null || s === '') return null
  const clean = String(s).replace(/[$,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const n = parseFloat(clean); return isNaN(n) ? null : n
}

export function fmtAmt(n) {
  if (n == null) return ''
  const abs = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + abs
}

export function fmtDate(d) {
  if (!d) return ''
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

/**
 * Try to detect the bank name from raw text content.
 */
export function detectBankName(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('bank of america') || t.includes('bofa')) return 'Bank of America'
  if (t.includes('wells fargo')) return 'Wells Fargo'
  if (t.includes('pnc')) return 'PNC'
  if (t.includes('td bank') || t.includes('toronto')) return 'TD Bank'
  if (t.includes('truist')) return 'Truist'
  if (t.includes('metro')) return 'Metro Bank'
  if (t.includes('ppac')) return 'PPAC'
  if (t.includes('chase') || t.includes('jpmorgan')) return 'Chase'
  if (t.includes('citi')) return 'Citibank'
  if (t.includes('capital one')) return 'Capital One'
  return null
}

/**
 * Find the header row index in parsed rows by looking for known keywords.
 * Returns the index of the header row, or 0 if not found.
 */
export function findHeaderRow(rows, keywords) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowLower = rows[i].map(c => (c || '').toLowerCase().trim())
    const matchCount = keywords.filter(kw => rowLower.some(c => c.includes(kw))).length
    if (matchCount >= 2) return i
  }
  return 0
}
