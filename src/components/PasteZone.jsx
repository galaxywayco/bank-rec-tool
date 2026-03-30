export function PasteZone({ label, hint, value, onChange, detected }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">{label}</label>
        {detected && (
          <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
            {detected}
          </span>
        )}
      </div>
      <textarea
        className="w-full h-36 p-3 text-xs font-mono border-2 border-dashed border-gray-300 rounded-lg focus:border-indigo-400 focus:outline-none bg-gray-50 resize-none transition-colors"
        placeholder={hint}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  )
}
