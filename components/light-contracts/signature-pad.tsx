'use client'

/**
 * Signature capture: type a name in a script face, or draw with mouse/finger.
 *
 * The drawn canvas is sized from its own client rect and scaled by DPR so
 * strokes stay crisp and land under the cursor on retina and mobile. Pointer
 * events cover mouse, touch, and stylus in one code path.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { SignatureKind } from '@/lib/types'

export interface SignatureValue {
  kind: SignatureKind
  name: string
  /** PNG data URL, only for drawn signatures. */
  image: string | null
}

interface SignaturePadProps {
  /** Prefilled from the contract so the customer usually just confirms it. */
  defaultName?: string
  disabled?: boolean
  onChange: (value: SignatureValue) => void
}

export function SignaturePad({ defaultName = '', disabled, onChange }: SignaturePadProps) {
  const [kind, setKind] = useState<SignatureKind>('typed')
  const [name, setName] = useState(defaultName)
  const [hasDrawing, setHasDrawing] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  /**
   * Report the current signature upward.
   *
   * `hasInk` lets the caller assert there are strokes on the canvas even when
   * the `hasDrawing` state update hasn't flushed yet (first stroke of a draw).
   */
  const emit = useCallback(
    (next: { kind?: SignatureKind; name?: string; hasInk?: boolean }) => {
      const nextKind = next.kind ?? kind
      const inked = next.hasInk ?? hasDrawing
      const image =
        nextKind === 'drawn' && inked && canvasRef.current
          ? canvasRef.current.toDataURL('image/png')
          : null
      onChange({
        kind: nextKind,
        name: (next.name ?? name).trim(),
        image,
      })
    },
    [kind, name, hasDrawing, onChange],
  )

  /**
   * Match the backing store to the CSS box. Without the DPR scale, strokes
   * render blurry and offset from the pointer on high-density screens.
   */
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0) return

    const dpr = window.devicePixelRatio || 1
    // Preserve any existing strokes across a resize.
    const previous = hasDrawing ? canvas.toDataURL('image/png') : null

    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'

    if (previous) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
      img.src = previous
    }
  }, [hasDrawing])

  useEffect(() => {
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    return () => window.removeEventListener('resize', sizeCanvas)
    // sizeCanvas is intentionally re-created on hasDrawing change; re-running
    // on that would wipe strokes mid-draw, so only bind once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  function pointFrom(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    // Keep receiving move/up even if the finger slides off the canvas.
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    lastPoint.current = pointFrom(e)
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return
    e.preventDefault()

    const ctx = canvasRef.current?.getContext('2d')
    const from = lastPoint.current
    if (!ctx || !from) return

    const to = pointFrom(e)
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()

    lastPoint.current = to
    if (!hasDrawing) setHasDrawing(true)
  }

  function handleUp() {
    if (!drawing.current) return
    drawing.current = false
    lastPoint.current = null
    // Serialize on stroke end rather than per-move; toDataURL is expensive.
    emit({ hasInk: true })
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    // Reset the transform before clearing so the DPR scale doesn't leave a
    // sliver of old ink at the edges.
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
    setHasDrawing(false)
    onChange({ kind: 'drawn', name: name.trim(), image: null })
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signer-name" className="text-[#1a1a1a]">
          Full legal name
        </Label>
        <Input
          id="signer-name"
          value={name}
          disabled={disabled}
          autoComplete="name"
          placeholder="Jane Doe"
          className="border-[#cbd5e1] bg-white text-[#1a1a1a] placeholder:text-[#94a3b8] dark:bg-white"
          onChange={(e) => {
            setName(e.target.value)
            emit({ name: e.target.value })
          }}
        />
        <p className="text-xs text-[#64748b]">
          Recorded with your signature on both options below.
        </p>
      </div>

      <Tabs
        value={kind}
        onValueChange={(v) => {
          const next = v as SignatureKind
          setKind(next)
          emit({ kind: next })
        }}
      >
        {/* The Tabs primitive ships `dark:` variants that would render a dark
            toggle inside this white sheet, with the active segment nearly
            indistinguishable. Pin both light and dark to the same light scheme. */}
        <TabsList className="w-full bg-[#e2e8f0]">
          <TabsTrigger
            value="typed"
            disabled={disabled}
            className="flex-1 text-[#475569] data-[state=active]:bg-white data-[state=active]:text-[#0f172a] dark:text-[#475569] dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-white dark:data-[state=active]:text-[#0f172a]"
          >
            Type it
          </TabsTrigger>
          <TabsTrigger
            value="drawn"
            disabled={disabled}
            className="flex-1 text-[#475569] data-[state=active]:bg-white data-[state=active]:text-[#0f172a] dark:text-[#475569] dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-white dark:data-[state=active]:text-[#0f172a]"
          >
            Draw it
          </TabsTrigger>
        </TabsList>

        <TabsContent value="typed" className="mt-3">
          {/* Fixed light colors: this pad renders inside a white contract sheet,
              so the preview must match the ink that ends up on the document. */}
          <div className="flex min-h-28 items-center justify-center rounded-lg border border-[#cbd5e1] bg-white px-4 py-6">
            {name.trim() ? (
              <span className="font-signature text-4xl leading-tight text-[#1a1a1a]">
                {name.trim()}
              </span>
            ) : (
              <span className="text-sm text-[#94a3b8]">
                Your typed signature appears here
              </span>
            )}
          </div>
        </TabsContent>

        <TabsContent value="drawn" className="mt-3">
          <div className="rounded-lg border border-[#cbd5e1] bg-white p-2">
            <canvas
              ref={canvasRef}
              // touch-none stops the browser scrolling the page mid-stroke.
              className="h-36 w-full touch-none rounded-md bg-white"
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerCancel={handleUp}
              aria-label="Draw your signature"
              role="img"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-[#64748b]">
                {hasDrawing ? 'Signature captured.' : 'Sign with your mouse or finger.'}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearCanvas}
                disabled={disabled || !hasDrawing}
                className="text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a] dark:text-[#475569] dark:hover:bg-[#f1f5f9] dark:hover:text-[#0f172a]"
              >
                <Eraser className="mr-1.5 h-3.5 w-3.5" />
                Clear
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
