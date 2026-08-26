'use client'

/**
 * The paste-your-contract-here surface.
 *
 * Deliberately a plain textarea: this is legal text the user owns, so it is
 * stored verbatim with no rich-text or markdown transformation. The only
 * intelligence is the placeholder reference and an unknown-token warning.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import { CONTRACT_FIELDS, findUnknownPlaceholders } from '@/lib/light-contracts'
import type { ContractTemplate } from '@/lib/types'

interface ContractWordingEditorProps {
  template: ContractTemplate | null
  busy: boolean
  onSave: (body: string) => void
}

const ORIGIN_LABELS: Record<string, string> = {
  customer: 'From customer record',
  deal: 'Per contract',
  company: 'From your settings',
  computed: 'Automatic',
}

export function ContractWordingEditor({ template, busy, onSave }: ContractWordingEditorProps) {
  const [body, setBody] = useState(template?.body ?? '')
  const [copied, setCopied] = useState<string | null>(null)

  // Adopt the saved wording once it arrives, without clobbering local edits.
  useEffect(() => {
    setBody(template?.body ?? '')
  }, [template?.id, template?.updatedAt])

  const dirty = body !== (template?.body ?? '')
  const unknown = useMemo(() => findUnknownPlaceholders(body), [body])

  const grouped = useMemo(() => {
    const out: Record<string, typeof CONTRACT_FIELDS> = {}
    for (const f of CONTRACT_FIELDS) {
      out[f.origin] ??= []
      out[f.origin].push(f)
    }
    return out
  }, [])

  async function copyToken(key: string) {
    const token = `{{${key}}}`
    try {
      await navigator.clipboard.writeText(token)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1200)
    } catch {
      toast.error('Could not copy. Type the placeholder manually.')
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <div>
          <h2 className="text-sm font-medium">Contract wording</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Paste your full lease agreement below. Use placeholders like{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {'{{customer_name}}'}
            </code>{' '}
            wherever a value should be filled in per customer.
          </p>
        </div>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            'Paste your Christmas lights lease agreement here.\n\n' +
            'Example:\n' +
            'This Agreement is entered into on {{today}} between {{company_name}} ' +
            '("Company") and {{customer_name}} ("Customer") for holiday lighting ' +
            'services at {{service_address}}.\n\n' +
            'TERM. This Agreement shall remain in effect for {{term_years_words}}.\n\n' +
            'FEES. Customer agrees to pay {{price}} per season. Installation will ' +
            'occur on or about {{install_date}}, and removal on or about ' +
            '{{takedown_date}}.'
          }
          className="min-h-[26rem] resize-y font-mono text-xs leading-relaxed"
          spellCheck={false}
        />

        {unknown.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unrecognized placeholder{unknown.length > 1 ? 's' : ''}</AlertTitle>
            <AlertDescription>
              {unknown.map((u) => `{{${u}}}`).join(', ')} won&apos;t be filled in. Check the spelling
              against the field list, or remove the braces if it&apos;s meant to be literal text.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {body.length.toLocaleString()} characters
            {template?.updatedAt && !dirty && (
              <> · saved {new Date(template.updatedAt).toLocaleString()}</>
            )}
          </p>
          <div className="flex gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setBody(template?.body ?? '')} disabled={busy}>
                Discard changes
              </Button>
            )}
            <Button onClick={() => onSave(body)} disabled={busy || !dirty}>
              {busy ? 'Saving…' : 'Save wording'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="h-fit p-4 sm:p-5">
        <h2 className="text-sm font-medium">Available fields</h2>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          Click to copy a placeholder.
        </p>

        <div className="mt-4 space-y-4">
          {Object.entries(grouped).map(([origin, fields]) => (
            <div key={origin}>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {ORIGIN_LABELS[origin] ?? origin}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {fields.map((f) => (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => copyToken(f.key)}
                      className="group flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs">{`{{${f.key}}}`}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {f.label}
                          {f.hint ? ` — ${f.hint}` : ''}
                        </span>
                      </span>
                      {copied === f.key ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                      <span className="sr-only">Copy {`{{${f.key}}}`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-md border border-dashed bg-muted/40 px-3 py-2.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground text-pretty">
            Empty values render as{' '}
            <Badge variant="outline" className="mx-0.5 font-mono text-[10px]">
              [ Price ]
            </Badge>{' '}
            so a missing figure is obvious rather than silently blank.
          </p>
        </div>
      </Card>
    </div>
  )
}
