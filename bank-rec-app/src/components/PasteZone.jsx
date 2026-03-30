import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

/**
 * Reads a file (CSV or Excel) and returns its text content as CSV/TSV.
 * Excel files are converted to TSV so the parser can handle them.
 */
function readFile(file) {
  return new Promise((resolve, reject) => {
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          // Convert to TSV (tab-separated) so our parser handles it
          const tsv = XLSX.utils.sheet_to_csv(ws, { FS: '\t' })
          resolve({ text: tsv, fileName: file.name })
        } catch (err) {
          reject(new Error('Could not read Excel file: ' + err.message))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsArrayBuffer(file)
    } else {
      // CSV, TSV, TXT — read as text
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

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  const onFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const hasData = value && value.trim().length > 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          {fileName && (
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium truncate max-w-[160px]">
              {fileName}
            </span>
          )}
          {detected && (
            <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
              {detected}
            </span>
          )}
        </div>
      </div>

      <div
        className={`relative rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-indigo-400 bg-indigo-50'
            : hasData
            ? 'border-green-300 bg-green-50/30'
            : 'border-gray-300 bg-gray-50'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {/* Drop overlay */}
        {dragOver && (
          <div className="absolute inset-0 bg-indigo-100/80 rounded-lg flex items-center justify-center z-10">
            <span className="text-indigo-700 font-semibold text-sm">Drop file here</span>
          </div>
        )}

        {/* Textarea for paste */}
        <textarea
          className="w-full h-28 p-3 text-xs font-mono bg-transparent focus:outline-none resize-none"
          placeholder={hint}
          value={value}
          onChange={e => { setFileName(null); onChange(e.target.value) }}
        />

        {/* Bottom bar with upload button */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200/60">
          <span className="text-xs text-gray-400">
            {hasData ? `${value.split('\n').length} lines loaded` : 'Drag & drop or paste CSV / Excel'}
          </span>
          <div className="flex items-center gap-2">
            {hasData && (
              <button
                onClick={() => { onChange(''); setFileName(null); setError(null) }}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => fileInput.current?.click()}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
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
        <span className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-1.5 rounded">
          {error}
        </span>
      )}
    </div>
  )
}
