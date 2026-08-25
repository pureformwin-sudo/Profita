'use client'

import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AutomationsPanel } from '@/components/messages/automations-panel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  MessageSquare,
  Search,
  Send,
  Users,
  BanIcon,
  PhoneOff,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
} from 'lucide-react'

type AudienceEntry = {
  id: string
  kind: 'customer' | 'lead' | 'adhoc'
  name: string | null
  phone: string | null
  normalizedPhone: string
  optedOut: boolean
  duplicateOf: string[]
}

type AudienceStats = {
  totalRows: number
  unusablePhone: number
  optedOut: number
  duplicatesCollapsed: number
  sendable: number
}

type SendOutcome = {
  recipientId: string
  name: string | null
  normalizedPhone: string | null
  status: 'sent' | 'failed' | 'skipped'
  skipReason?: string
  error?: string
}

const STOP_FOOTER = ' Reply STOP to opt out.'

export default function MessagesPage() {
  const [loading, setLoading] = useState(true)
  const [fromNumber, setFromNumber] = useState<string | null>(null)
  const [entries, setEntries] = useState<AudienceEntry[]>([])
  const [stats, setStats] = useState<AudienceStats | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [body, setBody] = useState('Hi {{first_name}}, ')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [appendFooter, setAppendFooter] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [results, setResults] = useState<SendOutcome[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/quo/audience', { cache: 'no-store' })
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setLoadError(json?.error ?? 'Failed to load recipients')
          return
        }
        setFromNumber(json.fromNumber ?? null)
        setEntries(json.entries ?? [])
        setStats(json.stats ?? null)
      } catch {
        if (!cancelled) setLoadError('Failed to load recipients')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const eligible = useMemo(() => entries.filter((e) => !e.optedOut), [entries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return eligible
    return eligible.filter(
      (e) =>
        (e.name ?? '').toLowerCase().includes(q) ||
        e.normalizedPhone.includes(q.replace(/\D/g, '')),
    )
  }, [eligible, search])

  const charCount = body.length + (appendFooter ? STOP_FOOTER.length : 0)
  const segments = Math.max(1, Math.ceil(charCount / 160))

  // A template that references a name will render "Hi ," for anyone unnamed.
  const missingNameCount = useMemo(() => {
    if (!/\{\{\s*(first_)?name\s*\}\}/i.test(body)) return 0
    return [...selected].filter((p) => {
      const e = eligible.find((x) => x.normalizedPhone === p)
      return !(e?.name ?? '').trim()
    }).length
  }, [body, selected, eligible])

  function toggle(phone: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(phone)) next.delete(phone)
      else next.add(phone)
      return next
    })
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((e) => e.normalizedPhone)))
  }

  function preview(entry: AudienceEntry | undefined) {
    // With nobody selected, substituting an empty string renders "Hi ," which
    // reads like a bug. Fall back to a clearly-fake sample name so the operator
    // sees the real shape of the message before picking recipients. Once a
    // recipient IS selected the preview uses their actual name.
    const name = (entry?.name ?? '').trim() || 'Sam Rivera'
    const first = name.split(/\s+/)[0]
    let out = body
      .replace(/\{\{\s*first_name\s*\}\}/gi, first)
      .replace(/\{\{\s*name\s*\}\}/gi, name)
    if (appendFooter && !/\bstop\b/i.test(out)) out += STOP_FOOTER
    return out
  }

  async function runBulkSend() {
    setSending(true)
    setResults(null)
    try {
      const phones = [...selected]
      const res = await fetch('/api/quo/send-bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body,
          phones,
          confirmCount: phones.length,
          appendStopFooter: appendFooter,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? 'Bulk send failed')
        return
      }
      setResults(json.results ?? [])
      const s = json.summary
      toast.success(`Sent ${s.sent} of ${s.total}`, {
        description:
          s.failed || s.skipped
            ? `${s.failed} failed, ${s.skipped} skipped`
            : 'All messages delivered to Quo',
      })
      setSelected(new Set())
    } catch (err) {
      toast.error('Bulk send failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSending(false)
      setConfirmOpen(false)
    }
  }

  const firstSelected = eligible.find((e) => selected.has(e.normalizedPhone))

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <MessageSquare className="h-6 w-6 text-primary" aria-hidden="true" />
              Messages
            </h1>
            <p className="text-sm text-muted-foreground">
              Text clients from your Quo line without leaving Profita.
            </p>
          </div>
          {fromNumber && (
            <Badge variant="secondary" className="font-mono">
              Sending from {fromNumber}
            </Badge>
          )}
        </header>

        <Tabs defaultValue="compose" className="space-y-6">
          <TabsList>
            <TabsTrigger value="compose">Compose</TabsTrigger>
            <TabsTrigger value="automations">Automations</TabsTrigger>
          </TabsList>

          <TabsContent value="automations" className="mt-0">
            <AutomationsPanel />
          </TabsContent>

          <TabsContent value="compose" className="space-y-6 mt-0">

        {loadError && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-sm text-destructive">{loadError}</CardContent>
          </Card>
        )}

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              label="Ready to text"
              value={stats.sendable}
            />
            <StatCard
              icon={<Copy className="h-4 w-4" aria-hidden="true" />}
              label="Duplicates merged"
              value={stats.duplicatesCollapsed}
              hint="Same number on multiple records"
            />
            <StatCard
              icon={<PhoneOff className="h-4 w-4" aria-hidden="true" />}
              label="No valid number"
              value={stats.unusablePhone}
            />
            <StatCard
              icon={<BanIcon className="h-4 w-4" aria-hidden="true" />}
              label="Opted out"
              value={stats.optedOut}
              hint="Excluded automatically"
            />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Composer */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Compose</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="msg-body">Message</Label>
                <Textarea
                  id="msg-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  placeholder="Hi {{first_name}}, ..."
                  className="resize-none"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {'Use '}
                    <code className="rounded bg-muted px-1 py-0.5">{'{{first_name}}'}</code>
                    {' or '}
                    <code className="rounded bg-muted px-1 py-0.5">{'{{name}}'}</code>
                  </span>
                  <span>
                    {charCount} chars &middot; {segments} segment{segments === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={appendFooter}
                  onCheckedChange={(v) => setAppendFooter(Boolean(v))}
                  className="mt-0.5"
                />
                <span>
                  Append &quot;Reply STOP to opt out&quot;
                  <span className="block text-xs text-muted-foreground">
                    Recommended for bulk sends. Replies are honored automatically.
                  </span>
                </span>
              </label>

              {missingNameCount > 0 && (
                <p className="text-xs text-amber-500 dark:text-amber-400">
                  {missingNameCount} selected contact
                  {missingNameCount === 1 ? ' has' : 's have'} no name on file, so the
                  greeting will read &quot;Hi ,&quot;.
                </p>
              )}

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Preview
                </Label>
                <div className="rounded-lg bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {preview(firstSelected) || (
                    <span className="text-muted-foreground">Nothing to preview yet.</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {firstSelected
                    ? `Shown for ${firstSelected.name?.trim() || firstSelected.normalizedPhone}`
                    : 'Sample name shown until you select a recipient.'}
                </p>
              </div>

              <Button
                className="w-full"
                disabled={selected.size === 0 || !body.trim() || sending}
                onClick={() => setConfirmOpen(true)}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                {sending
                  ? 'Sending...'
                  : `Send to ${selected.size} recipient${selected.size === 1 ? '' : 's'}`}
              </Button>
            </CardContent>
          </Card>

          {/* Recipients */}
          <Card className="lg:col-span-3">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Recipients</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllFiltered}>
                    Select all {search ? 'shown' : ''}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(new Set())}
                    disabled={selected.size === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or number"
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading contacts
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No matching contacts with a valid phone number.
                </p>
              ) : (
                <ul className="divide-y max-h-[26rem] overflow-y-auto -mx-2">
                  {filtered.map((e) => {
                    const isSel = selected.has(e.normalizedPhone)
                    return (
                      <li key={e.normalizedPhone}>
                        <label className="flex items-center gap-3 px-2 py-2.5 cursor-pointer hover:bg-muted/50 rounded-md">
                          <Checkbox checked={isSel} onCheckedChange={() => toggle(e.normalizedPhone)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {e.name?.trim() || (
                                <span className="text-muted-foreground italic">No name</span>
                              )}
                            </span>
                            <span className="block text-xs text-muted-foreground font-mono">
                              {e.normalizedPhone}
                            </span>
                          </span>
                          {e.duplicateOf.length > 0 && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              +{e.duplicateOf.length} dupe
                              {e.duplicateOf.length === 1 ? '' : 's'}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs shrink-0 capitalize">
                            {e.kind}
                          </Badge>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {results && results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Last send</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {results.map((r, i) => (
                  <li
                    key={`${r.recipientId}-${i}`}
                    className="flex items-center gap-3 py-2"
                  >
                    {r.status === 'sent' ? (
                      <CheckCircle2
                        className="h-4 w-4 text-emerald-500 shrink-0"
                        aria-hidden="true"
                      />
                    ) : r.status === 'failed' ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" aria-hidden="true" />
                    ) : (
                      <MinusCircle
                        className="h-4 w-4 text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex-1 min-w-0 truncate">
                      {r.name?.trim() || r.normalizedPhone}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {r.status === 'skipped' ? r.skipReason : r.status === 'failed' ? r.error : 'sent'}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send to {selected.size} {selected.size === 1 ? 'person' : 'people'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  This sends a real text from {fromNumber ?? 'your Quo line'} to{' '}
                  {selected.size} distinct number{selected.size === 1 ? '' : 's'}. It cannot
                  be undone.
                </p>
                <div className="rounded-md bg-muted p-3 text-sm text-foreground whitespace-pre-wrap break-words">
                  {preview(firstSelected)}
                </div>
                <p className="text-xs">
                  {segments > 1
                    ? `Each message is ${segments} SMS segments.`
                    : 'Each message is 1 SMS segment.'}{' '}
                  Opted-out contacts are always excluded.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                runBulkSend()
              }}
              disabled={sending}
            >
              {sending ? 'Sending...' : `Send ${selected.size}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  )
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {icon}
          {label}
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}
