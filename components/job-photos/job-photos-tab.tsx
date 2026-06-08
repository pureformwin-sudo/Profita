"use client"

import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Sparkles, Loader2, Images, GitCompareArrows, FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PhotoGrid } from "./photo-grid"
import { PhotoDropzone } from "./photo-dropzone"
import { PhotoComparison } from "./photo-comparison"
import { CompletionReportDialog } from "./completion-report-dialog"
import {
  getJobPhotos,
  uploadJobPhoto,
  deleteJobPhoto,
  updateJobPhotoCaption,
  generateSmartPhotoComparisons,
  validatePhotoFile,
} from "@/lib/job-photos-storage"
import type { JobPhoto, PhotoType } from "@/lib/job-photos-types"

interface JobPhotosTabProps {
  jobId: string
  customerId: string
  canEdit?: boolean
}

const SECTIONS: { type: PhotoType; label: string }[] = [
  { type: "before", label: "Before" },
  { type: "progress", label: "Progress" },
  { type: "after", label: "After" },
]

export function JobPhotosTab({ jobId, customerId, canEdit = true }: JobPhotosTabProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingType, setUploadingType] = useState<PhotoType | null>(null)
  const [generating, setGenerating] = useState(false)
  const [view, setView] = useState<"gallery" | "compare">("gallery")

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getJobPhotos(jobId)
    setPhotos(data)
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  const handleUpload = useCallback(
    async (photoType: PhotoType, files: File[]) => {
      const valid: File[] = []
      for (const f of files) {
        const err = validatePhotoFile(f)
        if (err) {
          toast.error(`${f.name}: ${err}`)
          continue
        }
        valid.push(f)
      }
      if (valid.length === 0) return

      setUploadingType(photoType)
      let success = 0
      for (const file of valid) {
        try {
          const photo = await uploadJobPhoto({ jobId, customerId, photoType, file })
          setPhotos((prev) => [...prev, photo])
          success++
        } catch (e: any) {
          toast.error(e.message || `Failed to upload ${file.name}`)
        }
      }
      setUploadingType(null)
      if (success > 0) {
        toast.success(`${success} ${photoType} photo${success > 1 ? "s" : ""} uploaded`)
      }
    },
    [jobId, customerId],
  )

  const handleDelete = useCallback(async (photo: JobPhoto) => {
    const prev = photo
    setPhotos((cur) => cur.filter((p) => p.id !== photo.id))
    try {
      await deleteJobPhoto(photo.id)
      toast.success("Photo deleted")
    } catch (e: any) {
      toast.error(e.message || "Failed to delete photo")
      setPhotos((cur) => [...cur, prev])
    }
  }, [])

  const handleCaption = useCallback(async (photo: JobPhoto, caption: string) => {
    setPhotos((cur) => cur.map((p) => (p.id === photo.id ? { ...p, caption } : p)))
    try {
      await updateJobPhotoCaption(photo.id, caption)
      toast.success("Caption saved")
    } catch (e: any) {
      toast.error(e.message || "Failed to save caption")
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    try {
      await generateSmartPhotoComparisons(jobId)
      toast.success("Before & after comparisons generated")
      setView("compare")
    } catch (e: any) {
      toast.error(e.message || "Could not generate comparisons")
    } finally {
      setGenerating(false)
    }
  }, [jobId])

  const before = photos.filter((p) => p.photoType === "before")
  const after = photos.filter((p) => p.photoType === "after")
  const canCompare = before.length > 0 && after.length > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading photos...
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as "gallery" | "compare")}>
          <TabsList>
            <TabsTrigger value="gallery">
              <Images className="mr-1.5 h-4 w-4" />
              Gallery
            </TabsTrigger>
            <TabsTrigger value="compare">
              <GitCompareArrows className="mr-1.5 h-4 w-4" />
              Before / After
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {canEdit && canCompare && view === "compare" && (
          <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Smart pair
          </Button>
        )}
      </div>

      {view === "gallery" ? (
        <div className="space-y-6">
          {SECTIONS.map(({ type, label }) => {
            const sectionPhotos = photos.filter((p) => p.photoType === type)
            return (
              <section key={type} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">
                    {label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {sectionPhotos.length}
                    </span>
                  </h4>
                </div>
                {canEdit && (
                  <PhotoDropzone
                    photoType={type}
                    uploading={uploadingType === type}
                    onFiles={(files) => handleUpload(type, files)}
                  />
                )}
                <PhotoGrid
                  photos={sectionPhotos}
                  canEdit={canEdit}
                  onDelete={handleDelete}
                  onCaption={handleCaption}
                  emptyLabel={`No ${label.toLowerCase()} photos yet.`}
                />
              </section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {canCompare ? (
            <PhotoComparison before={before} after={after} />
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              Add at least one before and one after photo to see the comparison.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
