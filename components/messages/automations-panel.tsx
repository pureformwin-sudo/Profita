'use client'

/**
 * Automations tab on the Messages page.
 *
 * Lists every automation type from the code registry and lets each one be
 * enabled and edited. Saves are explicit — auto-save has caused data loss in
 * trackers here before, and silently turning on something that texts customers
 * would be worse.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Clock,
  Loader2,
  Zap,
  CheckCircle2,
  MinusCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import {
  getAutomationType,
  findUnsupportedTokens,
  type AutomationConfig,
} from '@/lib/message-automations'

type HistoryRow = {
  id: string
  automationType: string
  customerName: string | null
  outcome: 'sent' | 'skipped' | 'failed'
  detail: string | null
  createdAt: string
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
]

/**
 * Delay presets in minutes, measured from the automation's trigger event.
 *
 * The trailing noun comes from the registry (`delayNoun`), so the same list
 * reads correctly as "after completion" or "after booking".
 */
const DELAY_STEPS = [
  { value: 0, label: 'Immediately' },
  { value: 2, label: '2 minutes after' },
  { value: 15, label: '15 minutes after' },
  { value: 30, label: '30 minutes after' },
  { value: 60, label: '1 hour after' },
  { value: 90, label: '1.5 hours after' },
  { value: 120, label: '2 hours after' },
  { value: 240, label: '4 hours after' },
  { value: 1440, label: '1 day after' },
]

function delayOptionsFor(noun: string) {
  return DELAY_STEPS.map((step) => ({
    value: step.value,
    label: step.value === 0 ? step.label : `${step.label} ${noun}`,
  }))
}

function hourLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

export function AutomationsPanel() {
  const [configs, setConfigs] = useState<AutomationConfig[]>([])
  const [reviewLink, setReviewLink] = useState('')
  const [website, setWebsite] = useState('')
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [savingType, setSavingType] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/automations')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load automations')
      setConfigs(data.configs ?? [])
      setReviewLink(data.reviewLink ?? '')
      setWebsite(data.website ?? '')
      setHistory(data.history ?? [])
      setNeedsSetup(Boolean(data.needsSetup))
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load automations')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function update(type: string, patch: Partial<AutomationConfig>) {
    setConfigs((prev) =>
      prev.map((c) => (c.automationType === type ? { ...c, ...patch } : c)),
    )
  }

  async function save(config: AutomationConfig) {
    setSavingType(config.automationType)
    try {
      const res = await fetch('/api/automations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, reviewLink, website }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Failed to save')
      toast.success(
        config.enabled
          ? `${getAutomationType(config.automationType)?.label} is on`
          : `${getAutomationType(config.automationType)?.label} saved (off)`,
      )
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save automation')
    } finally {
      setSavingType(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="text-sm">Loading automations…</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {needsSetup && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-medium text-destructive">
              Automations tables are missing
            </p>
            <p className="text-sm text-muted-foreground">
              Run{' '}
              <code className="font-mono text-xs">
                scripts/migrations/019-message-automations.sql
              </code>{' '}
              in Supabase, then reload this page.
            </p>
          </CardContent>
        </Card>
      )}

      {configs.map((config) => {
        const def = getAutomationType(config.automationType)
        if (!def) return null

        const isSaving = savingType === config.automationType
        const needsReviewLink =
          def.requiredTokens.includes('review_link') &&
          config.messageBody.includes('{{review_link}}')
        const missingReviewLink = needsReviewLink && !reviewLink.trim()
        const needsWebsite =
          def.requiredTokens.includes('website') &&
          config.messageBody.includes('{{website}}')
        const missingWebsite = needsWebsite && !website.trim()
        const badTokens = findUnsupportedTokens(def, config.messageBody)
        const delayOptions = delayOptionsFor(def.delayNoun)

        return (
          <Card key={config.automationType}>
            <CardHeader className="pb-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
                    {def.label}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{def.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={config.enabled ? 'default' : 'secondary'}>
                    {config.enabled ? 'Active' : 'Off'}
                  </Badge>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={(v) =>
                      update(config.automationType, { enabled: v })
                    }
                    aria-label={`Enable ${def.label}`}
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{def.triggerLabel}</span>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor={`body-${config.automationType}`}>Message</Label>
                <Textarea
                  id={`body-${config.automationType}`}
                  value={config.messageBody}
                  onChange={(e) =>
                    update(config.automationType, { messageBody: e.target.value })
                  }
                  rows={4}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Available placeholders:{' '}
                  {def.supportedTokens.map((t) => `{{${t}}}`).join(', ')}
                </p>
                {badTokens.length > 0 && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                    <span>
                      {'Unknown placeholder: '}
                      {badTokens.map((t) => `{{${t}}}`).join(', ')}. This would be sent
                      as literal text.
                    </span>
                  </p>
                )}
              </div>

              {needsReviewLink && (
                <div className="space-y-2">
                  <Label htmlFor="review-link">Google review link</Label>
                  <Input
                    id="review-link"
                    value={reviewLink}
                    onChange={(e) => setReviewLink(e.target.value)}
                    placeholder="https://g.page/r/…/review"
                  />
                  {missingReviewLink ? (
                    <p className="text-xs text-destructive flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        Required — sends are skipped until this is filled in, so no
                        customer receives a broken link.
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Replaces {'{{review_link}}'} in the message.
                    </p>
                  )}
                </div>
              )}

              {needsWebsite && (
                <div className="space-y-2">
                  <Label htmlFor="website-link">Website link</Label>
                  <Input
                    id="website-link"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                  {missingWebsite ? (
                    <p className="text-xs text-destructive flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>
                        Required — sends are skipped until this is filled in, so no
                        customer receives a broken link.
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Replaces {'{{website}}'} in the message. Shared with your business
                      profile.
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`delay-${config.automationType}`}>Send delay</Label>
                  <Select
                    value={String(config.delayMinutes)}
                    onValueChange={(v) =>
                      update(config.automationType, { delayMinutes: Number(v) })
                    }
                  >
                    <SelectTrigger id={`delay-${config.automationType}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {delayOptions.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`tz-${config.automationType}`}>Time zone</Label>
                  <Select
                    value={config.timezone}
                    onValueChange={(v) => update(config.automationType, { timezone: v })}
                  >
                    <SelectTrigger id={`tz-${config.automationType}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace('America/', '').replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`start-${config.automationType}`}>
                    Send no earlier than
                  </Label>
                  <Select
                    value={String(config.quietHoursStart)}
                    onValueChange={(v) =>
                      update(config.automationType, { quietHoursStart: Number(v) })
                    }
                  >
                    <SelectTrigger id={`start-${config.automationType}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {hourLabel(h)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`end-${config.automationType}`}>
                    Send no later than
                  </Label>
                  <Select
                    value={String(config.quietHoursEnd)}
                    onValueChange={(v) =>
                      update(config.automationType, { quietHoursEnd: Number(v) })
                    }
                  >
                    <SelectTrigger id={`end-${config.automationType}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {hourLabel(h)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {`A send falling outside this window waits for the next opening rather than texting overnight. `}
                {config.cooldownDays > 0
                  ? `Each customer receives this at most once per ${config.cooldownDays} days, and once per job.`
                  : 'Sent once per job — a customer with two bookings gets one message for each.'}
              </p>

              <div className="flex justify-end">
                <Button onClick={() => void save(config)} disabled={isSaving}>
                  {isSaving && (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                  )}
                  Save changes
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent automated messages</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing yet. Completed jobs will appear here once an automation runs.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {row.outcome === 'sent' ? (
                      <CheckCircle2
                        className="h-4 w-4 text-primary shrink-0"
                        aria-hidden="true"
                      />
                    ) : row.outcome === 'skipped' ? (
                      <MinusCircle
                        className="h-4 w-4 text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                    ) : (
                      <XCircle
                        className="h-4 w-4 text-destructive shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-sm truncate">
                      {row.customerName ?? 'Unknown customer'}
                    </span>
                    {/* With more than one automation type, the customer name
                        alone doesn't say which message was sent. */}
                    <Badge variant="outline" className="shrink-0 text-xs font-normal">
                      {getAutomationType(row.automationType)?.label ??
                        row.automationType}
                    </Badge>
                    {row.detail && (
                      <span className="text-xs text-muted-foreground truncate">
                        {row.detail}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(row.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
