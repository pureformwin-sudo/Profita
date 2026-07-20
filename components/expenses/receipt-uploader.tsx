"use client"

import { useCallback, useRef, useState } from "react"
import { Upload, Loader2, FileText, X, Paperclip } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { ExpenseAttachment } from "@/lib/types"

interface ReceiptUploaderProps {
  value: ExpenseAttachment[]
  onChange: (attachments: ExpenseAttachment[]) => void
  disabled?: boolean
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReceiptUploader({ value, onChange, disabled }: ReceiptUploaderProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setUploading(true)
      const uploaded: ExpenseAttachment[] = []
      for (const file of files) {
        try {
          const fd = new FormData()
          fd.append("file", file)
          const res = await fetch("/api/expense-receipts/upload", { method: "POST", body: fd })
          const json = await res.json()
          if (!res.ok) {
            toast.error(json.error || `Failed to upload ${file.name}`)
            continue
          }
          uploaded.push(json.attachment as ExpenseAttachment)
        } catch (err) {
          console.error("[v0] receipt upload failed:", err)
          toast.error(`Failed to upload ${file.name}`)
        }
      }
      if (uploaded.length > 0) {
        onChange([...value, ...uploaded])
        toast.success(`${uploaded.length} receipt${uploaded.length > 1 ? "s" : ""} attached`)
      }
      setUploading(false)
    },
    [value, onChange],
  )

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList).filter(
        (f) => f.type.startsWith("image/") || f.type === "application/pdf",
      )
      if (files.length === 0) {
        toast.error("Only images and PDFs are supported")
        return
      }
      uploadFiles(files)
    },
    [uploadFiles],
  )

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition",
          dragging && "border-primary bg-primary/5",
          (uploading || disabled) && "pointer-events-none opacity-70",
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Paperclip className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {uploading ? "Uploading..." : "Attach receipts"}
          </p>
          <p className="text-xs text-muted-foreground">Drag & drop or choose images / PDFs (max 15MB)</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-1.5 h-4 w-4" />
          Choose files
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((att, i) => {
            const isImage = att.contentType?.startsWith("image/")
            return (
              <li
                key={att.pathname || i}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
              >
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.url || "/placeholder.svg"}
                    alt={att.name}
                    className="h-10 w-10 flex-shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-foreground hover:underline"
                  >
                    {att.name}
                  </a>
                  <p className="text-xs text-muted-foreground">{formatSize(att.size || 0)}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  disabled={disabled}
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${att.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
