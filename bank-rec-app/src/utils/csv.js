export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/)
  return lines.map(line => {
    const result = []; let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') inQ = !inQ
      else if (c === ',' && !inQ) { result.push(cur.trim().replace(/^"|"$/g, '')); cur = '' }
      else cur += c
    }
    result.push(cur.trim().replace(/^"|"$/g, ''))
    return result
  }).filter(r => r.some(c => c !== ''))
}

export function isDateLike(s) {
  return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(s) || /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(s)
}

export function parseDate(s) {
  if (!s) return null
  s = String(s).trim()
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) { const yr = m[3].length === 2 ? '20' + m[3] : m[3]; return new Date(+yr, +m[1] - 1, +m[2]) }
  m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  const d = new Date(s); return isNaN(d) ? null : d
}

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

export function detectBankName(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('bank of america') || t.includes('bofa')) return 'Bank of America'
  if (t.includes('wells fargo')) return 'Wells Fargo'
  if (t.includes('pnc')) return 'PNC'
  if (t.includes('td bank') || t.includes('toronto')) return 'TD Bank'
  if (t.includes('truist')) return 'Truist'
  if (t.includes('metro')) return 'Metro Bank'
  if (t.includes('ppac')) return 'PPAC'
  return null
}
