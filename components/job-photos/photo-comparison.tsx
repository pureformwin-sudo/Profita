"use client"

import { ArrowRight } from "lucide-react"
import { photoSrc, type JobPhoto } from "@/lib/job-photos-types"

interface PhotoComparisonProps {
  before: JobPhoto[]
  after: JobPhoto[]
}

/**
 * Smart before/after pairing: pairs photos by index order so the first
 * "before" lines up with the first "after", etc. Unpaired photos still render.
 */
export function PhotoComparison({ before, after }: PhotoComparisonProps) {
  const pairCount = Math.max(before.length, after.length)
  if (pairCount === 0) return null

  const pairs = Array.from({ length: pairCount }, (_, i) => ({
    before: before[i] ?? null,
    after: after[i] ?? null,
  }))

  return (
    <div className="space-y-4">
      {pairs.map((pair, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <ComparisonSlot photo={pair.before} label="Before" tone="amber" />
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          <ComparisonSlot photo={pair.after} label="After" tone="emerald" />
        </div>
      ))}
    </div>
  )
}

function ComparisonSlot({
  photo,
  label,
  tone,
}: {
  photo: JobPhoto | null
  label: string
  tone: "amber" | "emerald"
}) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"

  return (
    <div className="space-y-1.5">
      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
        {label}
      </span>
      {photo ? (
        <div className="overflow-hidden rounded-md bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photoSrc(photo.storagePath) || "/placeholder.svg"}
            alt={photo.caption || `${label} photo`}
            className="aspect-square w-full object-cover"
            loading="lazy"
          />
          {photo.caption && (
            <p className="px-1 py-1 text-xs text-muted-foreground line-clamp-2">{photo.caption}</p>
          )}
        </div>
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-center text-xs text-muted-foreground">
          No {label.toLowerCase()} photo
        </div>
      )}
    </div>
  )
}
