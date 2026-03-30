import { useState } from 'react'

export function Section({ title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-gray-800">{title}</span>
          {badge}
        </div>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  )
}

export function Tag({ color, children }) {
  const styles = {
    green: 'bg-green-100 text-green-800 border-green-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${styles[color] || styles.gray}`}>
      {children}
    </span>
  )
}
