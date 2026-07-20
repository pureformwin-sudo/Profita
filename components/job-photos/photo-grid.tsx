"use client"

import { useState } from "react"
import { Trash2, Pencil, Check, X, Maximize2, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { photoSrc, type JobPhoto } from "@/lib/job-photos-types"
import { cn } from "@/lib/utils"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

interface PhotoCardProps {
  photo: JobPhoto
  canEdit?: boolean
  onDelete?: (photo: JobPhoto) => void
  onCaption?: (photo: JobPhoto, caption: string) => void
  onOpen?: (photo: JobPhoto) => void
}

export function PhotoCard({ photo, canEdit = true, onDelete, onCaption, onOpen }: PhotoCardProps) {
  const [editing, setEditing] = useState(false)
  const [caption, setCaption] = useState(photo.caption ?? "")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const url = photoSrc(photo.storagePath)

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => onOpen?.(photo)}
        className="relative block aspect-square w-full overflow-hidden bg-muted"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url || "/placeholder.svg"}
          alt={photo.caption || `${photo.photoType} photo`}
          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          loading="lazy"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition group-hover:bg-foreground/20 group-hover:opacity-100">
          <Maximize2 className="h-5 w-5 text-background" />
        </span>
      </button>

      <div className="space-y-2 p-3">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption"
              className="h-8 text-sm"
              autoFocus
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                onCaption?.(photo, caption.trim())
                setEditing(false)
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                setCaption(photo.caption ?? "")
                setEditing(false)
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="min-h-5 text-sm text-foreground">
            {photo.caption || <span className="text-muted-foreground">No caption</span>}
          </p>
        )}

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formatDate(photo.uploadedAt)}
          </span>
          {canEdit && !editing && (
            <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setEditing(true)}
                aria-label="Edit caption"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                aria-label="Delete photo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the photo from the job. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete?.(photo)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface PhotoGridProps {
  photos: JobPhoto[]
  canEdit?: boolean
  onDelete?: (photo: JobPhoto) => void
  onCaption?: (photo: JobPhoto, caption: string) => void
  emptyLabel?: string
}

export function PhotoGrid({ photos, canEdit, onDelete, onCaption, emptyLabel }: PhotoGridProps) {
  const [preview, setPreview] = useState<JobPhoto | null>(null)

  if (photos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyLabel ?? "No photos yet."}
      </p>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p) => (
          <PhotoCard
            key={p.id}
            photo={p}
            canEdit={canEdit}
            onDelete={onDelete}
            onCaption={onCaption}
            onOpen={setPreview}
          />
        ))}
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="capitalize">
              {preview?.photoType} photo
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-lg bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(preview.storagePath) || "/placeholder.svg"}
                  alt={preview.caption || `${preview.photoType} photo`}
                  className="max-h-[70vh] w-full object-contain"
                />
              </div>
              {preview.caption && (
                <p className="text-sm text-foreground">{preview.caption}</p>
              )}
              <p className="text-xs text-muted-foreground">{formatDate(preview.uploadedAt)}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export { formatDate as formatPhotoDate }

export function photoTypeAccent(type: JobPhoto["photoType"]) {
  return cn(
    type === "before" && "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    type === "progress" && "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20",
    type === "after" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
  )
}
