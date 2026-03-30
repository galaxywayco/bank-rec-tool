import { parseAmt, parseDate } from './csv'
import { detectGLCols, detectBankCols } from './columns'

export function parseGLRows(rows, cols) {
  return rows.slice(1).map((r, i) => {
    const debit = parseAmt(r[cols.debitCol]) || 0
    const credit = parseAmt(r[cols.creditCol]) || 0
    return {
      id: 'gl_' + i,
      date: parseDate(r[cols.dateCol]),
      desc: cols.descCol >= 0 ? (r[cols.descCol] || '') : '',
      debit, credit,
      net: credit - debit,
      control: cols.controlCol >= 0 ? (r[cols.controlCol] || '') : '',
    }
  }).filter(r => r.net !== 0 || r.debit !== 0 || r.credit !== 0)
}

export function parseBankRows(rows, cols) {
  return rows.slice(1).map((r, i) => {
    let amt = null
    if (cols.amtCol >= 0) amt = parseAmt(r[cols.amtCol])
    else if (cols.debitCol >= 0 || cols.creditCol >= 0) {
      const d = cols.debitCol >= 0 ? (parseAmt(r[cols.debitCol]) || 0) : 0
      const c = cols.creditCol >= 0 ? (parseAmt(r[cols.creditCol]) || 0) : 0
      amt = c - d
    }
    return { id: 'bk_' + i, date: parseDate(r[cols.dateCol]), desc: cols.descCol >= 0 ? (r[cols.descCol] || '') : '', amt }
  }).filter(r => r.amt != null && r.amt !== 0)
}

function dayDiff(a, b) {
  if (!a || !b) return 999
  return Math.abs((a - b) / 86400000)
}

export function runReconciliation(glText, bankText, recMonth, recYear, transitStart, transitEnd) {
  const { parseCSV } = require('./csv')
  return null // placeholder — see App.jsx for inline usage
}

export function matchTransactions(gl, bk, recMonth, recYear, transitStart, transitEnd) {
  const glFiltered = gl.filter(r => {
    if (!r.date) return true
    const same = r.date.getMonth() === recMonth && r.date.getFullYear() === recYear
    return !(same && r.date.getDate() >= transitStart)
  })
  const bankFiltered = bk.filter(r => {
    if (!r.date) return true
    const same = r.date.getMonth() === recMonth && r.date.getFullYear() === recYear
    if (same && r.date.getDate() >= transitStart) return false
    if (same && r.date.getDate() <= transitEnd) return false
    return true
  })

  const usedGL = new Set(), usedBK = new Set()
  const matched = [], nearMatch = []

  bankFiltered.forEach(bk => {
    if (usedBK.has(bk.id)) return
    let best = null, bestD = 8
    glFiltered.forEach(gl => {
      if (usedGL.has(gl.id)) return
      if (Math.abs(gl.net - bk.amt) <= 0.02) {
        const dd = dayDiff(gl.date, bk.date)
        if (dd < bestD) { bestD = dd; best = gl }
      }
    })
    if (best) { usedGL.add(best.id); usedBK.add(bk.id); matched.push({ gl: best, bk, dayDiff: bestD }) }
  })

  bankFiltered.forEach(bk => {
    if (usedBK.has(bk.id)) return
    let best = null, bestD = 22
    glFiltered.forEach(gl => {
      if (usedGL.has(gl.id)) return
      if (Math.abs(gl.net - bk.amt) <= 0.02) {
        const dd = dayDiff(gl.date, bk.date)
        if (dd < bestD) { bestD = dd; best = gl }
      }
    })
    if (best) { usedGL.add(best.id); usedBK.add(bk.id); nearMatch.push({ gl: best, bk, dayDiff: bestD }) }
  })

  return {
    matched, nearMatch,
    unmatchedGL: glFiltered.filter(gl => !usedGL.has(gl.id)),
    unmatchedBK: bankFiltered.filter(bk => !usedBK.has(bk.id)),
    inTransitGL: gl.filter(g => !glFiltered.find(x => x.id === g.id)),
    inTransitBK: bk.filter(b => !bankFiltered.find(x => x.id === b.id)),
  }
}
