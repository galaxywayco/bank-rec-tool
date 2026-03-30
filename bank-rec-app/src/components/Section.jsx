import { useState } from 'react'

export function Section({ title, badge, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-surface-2/60 hover:bg-surface-3/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-slate-200">{title}</span>
          {badge}
        </div>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="border-t border-border-subtle">{children}</div>}
    </div>
  )
}

export function Tag({ color, children }) {
  const styles = {
    green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    red: 'bg-red-500/15 text-red-400 border-red-500/20',
    amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    gray: 'bg-white/5 text-slate-400 border-white/10',
    blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  }
  return (
    <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full border ${styles[color] || styles.gray}`}>
      {children}
    </span>
  )
}
