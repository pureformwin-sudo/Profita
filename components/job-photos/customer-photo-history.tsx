"use client"

import { useEffect, useState } from "react"
import { Loader2, ImageOff } from "lucide-react"
import { getCustomerPhotoHistory } from "@/lib/job-photos-storage"
import { photoSrc, type JobPhoto } from "@/lib/job-photos-types"
import { formatPhotoDate } from "./photo-grid"

interface CustomerPhotoHistoryProps {
  customerId: string
}

const TYPE_LABEL: Record<JobPhoto["photoType"], string> = {
  before: "Before",
  progress: "Progress",
  after: "After",
}

const TYPE_TONE: Record<JobPhoto["photoType"], string> = {
  before: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  after: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
}

export function CustomerPhotoHistory({ customerId }: CustomerPhotoHistoryProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    getCustomerPhotoHistory(customerId).then((data) => {
      if (active) {
        setPhotos(data)
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [customerId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading photos...
      </div>
    )
  }

  if (photos.length === 0) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        <ImageOff className="mx-auto mb-2 h-10 w-10 opacity-30" />
        <p>No photos yet</p>
        <p className="text-xs">Photos added to this customer&apos;s jobs will appear here.</p>
      </div>
    )
  }

  // Group by job date (newest first — already sorted desc from query)
  const grouped = photos.reduce<Record<string, JobPhoto[]>>((acc, p) => {
    const key = p.jobId
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {photos.length} photo{photos.length > 1 ? "s" : ""} across {Object.keys(grouped).length} job
        {Object.keys(grouped).length > 1 ? "s" : ""}
      </p>
      {Object.entries(grouped).map(([jobId, jobPhotos]) => (
        <div key={jobId} className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {formatPhotoDate(jobPhotos[0].uploadedAt)}
            </span>
            <span>·</span>
            <span>{jobPhotos.length} photos</span>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {jobPhotos.map((p) => (
              <a
                key={p.id}
                href={photoSrc(p.storagePath)}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(p.storagePath) || "/placeholder.svg"}
                  alt={p.caption || `${p.photoType} photo`}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
                <span
                  className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_TONE[p.photoType]}`}
                >
                  {TYPE_LABEL[p.photoType]}
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
