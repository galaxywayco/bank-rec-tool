export function SummaryCard({ label, value, color }) {
  const colors = {
    green: 'text-green-700',
    red: 'text-red-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    gray: 'text-gray-700',
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${colors[color] || 'text-gray-800'}`}>{value}</div>
    </div>
  )
}
