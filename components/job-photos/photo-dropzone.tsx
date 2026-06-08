"use client"

import { useCallback, useRef, useState } from "react"
import { Upload, Loader2, ImagePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PhotoType } from "@/lib/job-photos-types"

interface PhotoDropzoneProps {
  photoType: PhotoType
  uploading: boolean
  onFiles: (files: File[]) => void
}

export function PhotoDropzone({ photoType, uploading, onFiles }: PhotoDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return
      const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"))
      if (files.length > 0) onFiles(files)
    },
    [onFiles],
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-6 text-center transition",
        dragging && "border-primary bg-primary/5",
        uploading && "pointer-events-none opacity-70",
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        ) : (
          <ImagePlus className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {uploading ? "Uploading..." : `Add ${photoType} photos`}
        </p>
        <p className="text-xs text-muted-foreground">Drag & drop or choose images</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="mr-1.5 h-4 w-4" />
        Choose files
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />
    </div>
  )
}
