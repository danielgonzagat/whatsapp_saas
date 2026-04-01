"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
// next/image removed — plain <img> used for upload previews (supports data URLs)
import { X, Copy, Check, Upload, ChevronDown } from "lucide-react"
import { apiFetch } from "@/lib/api"

// ============================================
// CHIP INPUT (Tags with max, Enter to add)
// ============================================

export function ChipInput({
  value = [],
  onChange,
  max = 5,
  placeholder = "Adicionar...",
  label,
}: {
  value: string[]
  onChange: (v: string[]) => void
  max?: number
  placeholder?: string
  label?: string
}) {
  const [input, setInput] = useState("")

  const handleAdd = () => {
    const t = input.trim()
    if (t && value.length < max && !value.includes(t)) {
      onChange([...value, t])
      setInput("")
    }
  }

  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">{label}</label>}
      <div className="flex gap-2">
        <input
          aria-label={label || placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAdd())}
          placeholder={value.length >= max ? `Máximo ${max}` : placeholder}
          disabled={value.length >= max}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-gray-50"
        />
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {value.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
              {tag}
              <button onClick={() => onChange(value.filter((t) => t !== tag))} className="ml-0.5 hover:text-teal-900">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// CURRENCY INPUT (R$ mask)
// ============================================

export function CurrencyInput({
  value,
  onChange,
  label,
  placeholder = "0,00",
}: {
  value: string
  onChange: (v: string) => void
  label?: string
  placeholder?: string
}) {
  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">{label}</label>}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">R$</span>
        <input
          aria-label={label || "Valor em reais"}
          type="number"
          step="0.01"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
    </div>
  )
}

// ============================================
// RADIO GROUP
// ============================================

export function RadioGroup({
  value,
  onChange,
  options,
  label,
  direction = "vertical",
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; description?: string }[]
  label?: string
  direction?: "vertical" | "horizontal"
}) {
  return (
    <div>
      {label && <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-600">{label}</label>}
      <div className={direction === "horizontal" ? "flex flex-wrap gap-3" : "space-y-2"}>
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="radio"
              name={label}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 accent-teal-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-800">{opt.label}</span>
              {opt.description && <p className="text-xs text-gray-500">{opt.description}</p>}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

// ============================================
// IMAGE UPLOAD (Drag & Drop)
// ============================================

export function ImageUpload({
  value,
  onChange,
  label,
  hint,
}: {
  value?: string | null
  onChange: (url: string) => void
  label?: string
  hint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [localPreview, setLocalPreview] = useState("")

  const handleFile = async (file: File) => {
    // Read as persistent data URL (survives re-renders, remounts, hydration)
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setLocalPreview(dataUrl)
      onChange(dataUrl)
    }
    reader.readAsDataURL(file)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const data: any = await apiFetch("/kloel/upload-generic", { method: "POST", body: formData })
      if (data?.data?.url) {
        setLocalPreview(data.data.url)
        onChange(data.data.url)
      }
    } catch (e) {
      console.error("Upload failed:", e)
    } finally {
      setUploading(false)
    }
  }

  const displayUrl = value || localPreview

  return (
    <div>
      {label && <label style={{display:"block",fontSize:11,fontWeight:600,color:"#6E6E73",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>{label}</label>}
      {displayUrl ? (
        <div style={{position:"relative",borderRadius:6,background:"rgba(255,255,255,0.04)",border:"1px solid #222226",padding:16,display:"flex",alignItems:"center",justifyContent:"center",minHeight:120}}>
          <img src={displayUrl} alt="" style={{maxWidth:"75%",maxHeight:160,objectFit:"contain",borderRadius:4,display:"block"}} />
          <button
            onClick={() => { setLocalPreview(""); onChange(""); }}
            style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.6)",border:"none",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff"}}
          >
            <X className="h-4 w-4" />
          </button>
          {uploading && <div style={{position:"absolute",bottom:8,left:"50%",transform:"translateX(-50%)",fontSize:10,color:"#E85D30",fontFamily:"'JetBrains Mono',monospace"}}>Enviando...</div>}
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) handleFile(file)
          }}
          style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:6,border:"2px dashed #222226",background:"rgba(255,255,255,0.02)",padding:"32px 20px",cursor:"pointer",transition:"border-color 150ms ease"}}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#E85D30" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "#222226" }}
        >
          <Upload style={{width:28,height:28,color:"#3A3A3F",marginBottom:8}} />
          <p style={{fontSize:13,color:"#6E6E73",margin:0}}>{uploading ? "Enviando..." : "Arraste ou clique"}</p>
          {hint && <p style={{fontSize:11,color:"#3A3A3F",marginTop:4}}>{hint}</p>}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) handleFile(file)
        if (e.target) e.target.value = ""
      }} />
    </div>
  )
}

// ============================================
// CODE SNIPPET (readonly + copy)
// ============================================

export function CodeSnippet({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current) }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {label && <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-600">{label}</label>}
      <div className="relative rounded-lg border border-gray-200 bg-gray-50 p-4">
        <pre className="overflow-x-auto text-xs text-gray-700 font-mono whitespace-pre-wrap">{code}</pre>
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md bg-white border border-gray-200 p-1.5 text-gray-500 hover:text-gray-700"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ============================================
// DATA TABLE (simple)
// ============================================

export function DataTable({
  columns,
  rows,
  emptyText = "Nenhum registro",
}: {
  columns: { key: string; label: string; width?: string; render?: (val: any, row: any) => ReactNode }[]
  rows: Record<string, any>[]
  emptyText?: string
}) {
  if (!rows.length) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50 py-12">
        <p className="text-sm text-gray-500">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600" style={{ width: col.width }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={row.id || i} className="hover:bg-gray-50">
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-gray-800">
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
