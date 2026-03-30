import { isDateLike, parseAmt } from './csv'

export function detectBankCols(rows) {
  if (rows.length < 2) return { dateCol: -1, amtCol: -1, descCol: -1, debitCol: -1, creditCol: -1 }
  const hdr = rows[0].map(h => (h || '').toLowerCase())
  const sample = rows.slice(1, Math.min(8, rows.length))
  let dateCol = -1, amtCol = -1, descCol = -1, debitCol = -1, creditCol = -1

  hdr.forEach((h, i) => {
    if (/date|posted|posting|trans.*date/.test(h) && dateCol === -1) dateCol = i
    if (/^amount$|^amt$/.test(h) && amtCol === -1) amtCol = i
    if (/desc|memo|narr|detail|particular/.test(h) && descCol === -1) descCol = i
    if (/debit|withdraw|charge/.test(h) && debitCol === -1) debitCol = i
    if (/credit|deposit/.test(h) && creditCol === -1) creditCol = i
  })

  if (dateCol === -1) hdr.forEach((_, i) => {
    if (dateCol !== -1) return
    if (sample.filter(r => isDateLike(r[i] || '')).length >= 2) dateCol = i
  })

  if (amtCol === -1 && debitCol === -1) hdr.forEach((_, i) => {
    if (amtCol !== -1) return
    const vals = sample.map(r => parseAmt(r[i])).filter(v => v != null)
    if (vals.length >= 2) amtCol = i
  })

  if (descCol === -1) {
    let best = -1, bestLen = 0
    hdr.forEach((_, i) => {
      if (i === dateCol || i === amtCol || i === debitCol || i === creditCol) return
      const avg = sample.reduce((s, r) => s + (r[i] || '').length, 0) / sample.length
      if (avg > bestLen) { bestLen = avg; best = i }
    })
    descCol = best
  }
  return { dateCol, amtCol, descCol, debitCol, creditCol }
}

export function detectGLCols(rows) {
  if (rows.length < 2) return { dateCol: -1, debitCol: -1, creditCol: -1, descCol: -1, controlCol: -1 }
  const hdr = rows[0].map(h => (h || '').toLowerCase())
  const sample = rows.slice(1, Math.min(8, rows.length))
  let dateCol = -1, debitCol = -1, creditCol = -1, descCol = -1, controlCol = -1

  hdr.forEach((h, i) => {
    if (/date|post/.test(h) && dateCol === -1) dateCol = i
    if (/debit/.test(h) && debitCol === -1) debitCol = i
    if (/credit/.test(h) && creditCol === -1) creditCol = i
    if (/desc|memo|narr|trans/.test(h) && descCol === -1) descCol = i
    if (/control|ctrl|ref|type/.test(h) && controlCol === -1) controlCol = i
  })

  if (dateCol === -1) hdr.forEach((_, i) => {
    if (dateCol !== -1) return
    if (sample.filter(r => isDateLike(r[i] || '')).length >= 2) dateCol = i
  })

  if (debitCol === -1) {
    const found = []
    hdr.forEach((_, i) => {
      const vals = sample.map(r => parseAmt(r[i])).filter(v => v != null && v >= 0)
      if (vals.length >= 1) found.push(i)
    })
    if (found.length >= 2) { debitCol = found[0]; creditCol = found[1] }
  }

  if (descCol === -1) {
    let best = -1, bestLen = 0
    hdr.forEach((_, i) => {
      if (i === dateCol || i === debitCol || i === creditCol || i === controlCol) return
      const avg = sample.reduce((s, r) => s + (r[i] || '').length, 0) / sample.length
      if (avg > bestLen) { bestLen = avg; best = i }
    })
    descCol = best
  }
  return { dateCol, debitCol, creditCol, descCol, controlCol }
}
