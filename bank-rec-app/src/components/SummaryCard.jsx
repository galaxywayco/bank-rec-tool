export function SummaryCard({ label, value, color, sub }) {
  const accents = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    gray: 'text-slate-300',
  }
  const bars = {
    green: 'bg-emerald-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    blue: 'bg-blue-500',
    gray: 'bg-slate-500',
  }
  return (
    <div className="glass-card p-4 relative overflow-hidden group">
      <div className={`absolute top-0 left-0 w-full h-[2px] ${bars[color] || 'bg-slate-600'} opacity-60`} />
      <div className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1.5 font-mono tabular-nums ${accents[color] || 'text-slate-200'}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
    </div>
  )
}
