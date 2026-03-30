import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

function readFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const tsv = XLSX.utils.sheet_to_csv(ws, { FS: '\t' })
          resolve({ text: tsv, fileName: file.name })
        } catch (err) {
          reject(new Error('Could not read Excel file: ' + err.message))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => resolve({ text: e.target.result, fileName: file.name })
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    }
  })
}

export function PasteZone({ label, hint, value, onChange, detected }) {
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState(null)
  const [error, setError] = useState(null)
  const fileInput = useRef(null)

  const handleFile = useCallback(async (file) => {
    setError(null)
    try {
      const { text, fileName: name } = await readFile(file)
      setFileName(name)
      onChange(text)
    } catch (err) {
      setError(err.message)
    }
  }, [onChange])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true) }, [])
  const onDragLeave = useCallback(() => setDragOver(false), [])
  const onFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const hasData = value && value.trim().length > 0

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-300">{label}</label>
        <div className="flex items-center gap-2">
          {fileName && (
            <span className="text-[11px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full font-medium truncate max-w-[160px]">
              {fileName}
            </span>
          )}
          {detected && (
            <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium">
              {detected}
            </span>
          )}
        </div>
      </div>

      <div
        className={`relative rounded-xl border-2 border-dashed transition-all duration-200 ${
          dragOver
            ? 'border-blue-500/50 bg-blue-500/5'
            : hasData
            ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
            : 'border-white/8 bg-surface-2/40 hover:border-white/12'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {dragOver && (
          <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-blue-400 font-semibold text-sm">Drop file here</span>
            </div>
          </div>
        )}

        <textarea
          className="w-full h-28 p-3.5 text-xs font-mono bg-transparent text-slate-400 placeholder-slate-600 focus:outline-none resize-none focus:text-slate-300"
          placeholder={hint}
          value={value}
          onChange={e => { setFileName(null); onChange(e.target.value) }}
        />

        <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-white/[0.04]">
          <span className="text-[11px] text-slate-600">
            {hasData ? (
              <span className="text-slate-500">{value.split('\n').length} lines loaded</span>
            ) : (
              'Drag & drop or paste CSV / Excel'
            )}
          </span>
          <div className="flex items-center gap-2.5">
            {hasData && (
              <button
                onClick={() => { onChange(''); setFileName(null); setError(null) }}
                className="text-[11px] text-slate-500 hover:text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => fileInput.current?.click()}
              className="text-[11px] font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/15 px-3 py-1.5 rounded-lg transition-all"
            >
              Upload File
            </button>
          </div>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls"
          className="hidden"
          onChange={onFileSelect}
        />
      </div>

      {error && (
        <span className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
          {error}
        </span>
      )}
    </div>
  )
}
