'use client'

/**
 * Service contracts.
 *
 * Three surfaces: Contract types (wording, heading, prefix and the fields each
 * type collects), the per-customer Contracts list, and the printable document.
 *
 * Nothing here is service-specific — a contract's shape comes entirely from the
 * type it was created under.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { AlertTriangle, FileText, Plus, Printer, ScrollText, Send } from 'lucide-react'
import type { Customer, ContractTemplate, LightContract } from '@/lib/types'
import { getCustomers, getSettings } from '@/lib/storage'
import {
  draftFromContract,
  draftFromCustomer,
  emptyDraft,
  type ContractDraft,
  type TemplateDraft,
} from '@/lib/light-contracts'
import { ContractWordingEditor } from '@/components/light-contracts/contract-wording-editor'
import { ContractList } from '@/components/light-contracts/contract-list'
import { ContractForm } from '@/components/light-contracts/contract-form'
import { ContractDocument } from '@/components/light-contracts/contract-document'

// All three are required, in order: 021 creates the tables, 022 adds the
// customer signing columns, 023 adds the per-type metadata and custom fields.
const SETUP_SQL = [
  'scripts/migrations/021-christmas-light-contracts.sql',
  'scripts/migrations/022-contract-signing.sql',
  'scripts/migrations/023-generic-contracts.sql',
]

export default function ContractsPage() {
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [contracts, setContracts] = useState<LightContract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [company, setCompany] = useState({ name: '', phone: '', email: '' })

  const [tab, setTab] = useState('contracts')
  const [editing, setEditing] = useState<LightContract | null>(null)
  const [draft, setDraft] = useState<ContractDraft | null>(null)
  /** Which contract type a new contract is being created under. */
  const [draftTemplateId, setDraftTemplateId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      // Contracts go through the API (company scoping lives server-side);
      // customers and settings use the browser storage helpers the rest of the
      // app already uses.
      const [contractsRes, customerList, settings] = await Promise.all([
        fetch('/api/light-contracts'),
        getCustomers().catch(() => [] as Customer[]),
        getSettings().catch(() => null),
      ])

      const data = await contractsRes.json()
      if (!contractsRes.ok) throw new Error(data.error ?? 'Failed to load contracts')

      setNeedsSetup(Boolean(data.needsSetup))
      setTemplates(data.templates ?? [])
      setContracts(data.contracts ?? [])
      setCustomers(customerList)

      const p = settings?.profile
      if (p) {
        setCompany({ name: p.businessName ?? '', phone: p.phone ?? '', email: p.email ?? '' })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load contracts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const previewContract = useMemo(
    () => contracts.find((c) => c.id === previewId) ?? null,
    [contracts, previewId],
  )

  /**
   * The type behind the previewed contract.
   *
   * Only used for drafts — anything finalized renders from its own snapshot, so
   * this being null (type since deleted) can't blank out an executed document.
   */
  const previewTemplate = useMemo(
    () => templates.find((t) => t.id === previewContract?.templateId) ?? null,
    [templates, previewContract],
  )

  /** The type a draft is being written against, for live field rendering. */
  const draftTemplate = useMemo(
    () => templates.find((t) => t.id === draftTemplateId) ?? null,
    [templates, draftTemplateId],
  )

  /**
   * Which fields the form collects.
   *
   * Editing an existing contract uses its own frozen defs, so reopening an old
   * contract shows the fields it was actually written with rather than whatever
   * its type looks like today.
   */
  const formFields = useMemo(
    () => (editing ? editing.fieldDefs : draftTemplate?.fields ?? []),
    [editing, draftTemplate],
  )

  /** At least one usable type exists — required before any contract can exist. */
  const hasWording = templates.some((t) => t.body.trim())

  // -- contract types ------------------------------------------------------

  async function handleSaveTemplate(input: TemplateDraft) {
    setSaving(true)
    try {
      const res = await fetch('/api/light-contracts/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save contract type')

      const saved = data.template as ContractTemplate
      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === saved.id)
        return exists ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]
      })
      toast.success(`${saved.name} saved`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save contract type')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/light-contracts/template?id=${encodeURIComponent(templateId)}`,
        { method: 'DELETE' },
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete contract type')

      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      if (draftTemplateId === templateId) setDraftTemplateId(null)
      toast.success('Contract type deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete contract type')
    } finally {
      setSaving(false)
    }
  }

  // -- contracts -----------------------------------------------------------

  function startNew() {
    setEditing(null)
    setDraft(emptyDraft())
    // Preselect when there's only one type, so the common case skips a click.
    const usable = templates.filter((t) => t.body.trim())
    setDraftTemplateId(usable.length === 1 ? usable[0].id : null)
    setTab('editor')
  }

  function startEdit(contract: LightContract) {
    setEditing(contract)
    setDraftTemplateId(contract.templateId)
    setDraft(draftFromContract(contract))
    setTab('editor')
  }

  function pickCustomer(customer: Customer) {
    setDraft((prev) => ({ ...(prev ?? emptyDraft()), ...draftFromCustomer(customer) }))
  }

  async function handleSaveContract() {
    if (!draft) return
    setSaving(true)
    try {
      // Send the raw field values; the server re-validates and normalizes them
      // against the type's own field list rather than trusting the client.
      const payload = {
        customerId: draft.customerId,
        customerName: draft.customerName,
        serviceAddress: draft.serviceAddress,
        customerEmail: draft.customerEmail,
        customerPhone: draft.customerPhone,
        notes: draft.notes,
        fieldValues: draft.fieldValues,
      }
      const res = await fetch('/api/light-contracts', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editing ? { id: editing.id, ...payload } : { templateId: draftTemplateId, ...payload },
        ),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save contract')

      const saved = data.contract as LightContract
      setContracts((prev) =>
        editing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev],
      )
      toast.success(editing ? 'Contract updated' : `Contract ${saved.contractNumber} created`)
      setEditing(null)
      setDraft(null)
      setPreviewId(saved.id)
      setTab('preview')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save contract')
    } finally {
      setSaving(false)
    }
  }

  async function handleFinalize(contract: LightContract, action: 'finalize' | 'reopen') {
    setSaving(true)
    try {
      const res = await fetch('/api/light-contracts/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contract.id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update contract')

      const saved = data.contract as LightContract
      setContracts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)))
      toast.success(action === 'finalize' ? 'Contract finalized' : 'Contract reopened for editing')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update contract')
    } finally {
      setSaving(false)
    }
  }

  /**
   * Copy a signing URL to the clipboard.
   *
   * `navigator.clipboard` needs a secure context and can be blocked, so fall
   * back to showing the raw URL rather than failing silently.
   */
  async function copySigningLink(token: string, message: string) {
    const url = `${window.location.origin}/sign/${token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(message, { description: url })
    } catch {
      toast.info('Copy this signing link', { description: url, duration: 12000 })
    }
  }

  /** Mint the link on first send, then just re-copy it afterwards. */
  async function handleShare(contract: LightContract) {
    if (contract.shareToken) {
      await copySigningLink(contract.shareToken, 'Signing link copied')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/light-contracts/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contract.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create signing link')

      const saved = data.contract as LightContract
      setContracts((prev) => prev.map((c) => (c.id === saved.id ? saved : c)))
      if (saved.shareToken) {
        await copySigningLink(saved.shareToken, 'Signing link ready — send it to your customer')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create signing link')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(contract: LightContract) {
    setSaving(true)
    try {
      const res = await fetch(`/api/light-contracts?id=${encodeURIComponent(contract.id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete contract')

      setContracts((prev) => prev.filter((c) => c.id !== contract.id))
      if (previewId === contract.id) setPreviewId(null)
      toast.success('Contract deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete contract')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Contracts</h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Set up a contract type once, then generate a finished, signable document per
              customer.
            </p>
          </div>
          <Button onClick={startNew} disabled={needsSetup}>
            <Plus className="mr-1.5 h-4 w-4" />
            New contract
          </Button>
        </header>

        {needsSetup && (
          <Alert variant="destructive" className="print:hidden">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Database setup required</AlertTitle>
            <AlertDescription>
              The contract tables don&apos;t exist yet. Run these against your Supabase project in
              order, then reload this page:
              <span className="mt-2 flex flex-col gap-1">
                {SETUP_SQL.map((file) => (
                  <code key={file} className="font-mono text-xs">
                    {file}
                  </code>
                ))}
              </span>
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="gap-6">
            <TabsList className="print:hidden">
              <TabsTrigger value="contracts">
                <FileText className="mr-1.5 h-4 w-4" />
                Contracts
                {contracts.length > 0 && (
                  <Badge variant="secondary" className="ml-2 tabular-nums">
                    {contracts.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="editor" disabled={!draft}>
                {editing ? 'Edit terms' : 'New contract'}
              </TabsTrigger>
              <TabsTrigger value="wording">
                <ScrollText className="mr-1.5 h-4 w-4" />
                Contract types
                {!hasWording ? (
                  <span
                    className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label="No contract type set up yet"
                  />
                ) : (
                  <Badge variant="secondary" className="ml-2 tabular-nums">
                    {templates.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="preview" disabled={!previewContract}>
                <Printer className="mr-1.5 h-4 w-4" />
                Document
              </TabsTrigger>
            </TabsList>

            <TabsContent value="contracts">
              <ContractList
                contracts={contracts}
                hasWording={hasWording}
                busy={saving}
                onNew={startNew}
                onEdit={startEdit}
                onPreview={(c) => {
                  setPreviewId(c.id)
                  setTab('preview')
                }}
                onFinalize={(c) => handleFinalize(c, 'finalize')}
                onReopen={(c) => handleFinalize(c, 'reopen')}
                onDelete={handleDelete}
                onAddWording={() => setTab('wording')}
                onShare={handleShare}
                onCopyLink={(c) => {
                  if (c.shareToken) void copySigningLink(c.shareToken, 'Link copied')
                }}
              />
            </TabsContent>

            <TabsContent value="editor">
              {draft && (
                <ContractForm
                  draft={draft}
                  customers={customers}
                  editing={editing}
                  busy={saving}
                  fields={formFields}
                  templates={templates.filter((t) => t.body.trim())}
                  templateId={draftTemplateId}
                  onTemplateChange={setDraftTemplateId}
                  onChange={setDraft}
                  onPickCustomer={pickCustomer}
                  onSave={handleSaveContract}
                  onCancel={() => {
                    setDraft(null)
                    setEditing(null)
                    setTab('contracts')
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="wording">
              <ContractWordingEditor
                templates={templates}
                busy={saving}
                onSave={handleSaveTemplate}
                onDelete={handleDeleteTemplate}
              />
            </TabsContent>

            <TabsContent value="preview">
              {previewContract ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={previewContract.status === 'draft' ? 'secondary' : 'default'}
                        className={
                          previewContract.status === 'signed'
                            ? 'bg-success text-success-foreground border-transparent'
                            : undefined
                        }
                      >
                        {previewContract.status === 'signed'
                          ? 'Signed'
                          : previewContract.status === 'final'
                            ? 'Final'
                            : 'Draft'}
                      </Badge>
                      <span className="font-mono text-sm text-muted-foreground">
                        {previewContract.contractNumber}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {previewContract.status === 'draft' && (
                        <Button
                          variant="outline"
                          onClick={() => handleFinalize(previewContract, 'finalize')}
                          disabled={saving || !previewTemplate?.body?.trim()}
                        >
                          Finalize
                        </Button>
                      )}
                      {previewContract.status === 'final' && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => handleFinalize(previewContract, 'reopen')}
                            disabled={saving}
                          >
                            Reopen
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleShare(previewContract)}
                            disabled={saving}
                          >
                            <Send className="mr-1.5 h-4 w-4" />
                            {previewContract.shareToken ? 'Copy signing link' : 'Send for signature'}
                          </Button>
                        </>
                      )}
                      {/* A signed contract is immutable — no reopen, no re-send. */}
                      <Button onClick={() => window.print()}>
                        <Printer className="mr-1.5 h-4 w-4" />
                        Download / Print
                      </Button>
                    </div>
                  </div>

                  {/* Only meaningful for a draft: a finalized contract carries
                      its own frozen wording and doesn't need the template. */}
                  {previewContract.status === 'draft' &&
                    !previewTemplate?.body?.trim() && (
                      <Alert className="print:hidden">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>
                          {previewTemplate
                            ? 'No wording on this contract type yet'
                            : 'This contract type was deleted'}
                        </AlertTitle>
                        <AlertDescription>
                          {previewTemplate
                            ? 'The header and terms will render, but the body stays empty until you add wording under Contract types.'
                            : 'The wording behind this draft no longer exists. Recreate the contract under a current type.'}
                        </AlertDescription>
                      </Alert>
                    )}

                  <Card className="overflow-hidden p-0 print:border-0 print:shadow-none">
                    <ContractDocument
                      contract={previewContract}
                      templateBody={previewTemplate?.body ?? ''}
                      templateFields={previewTemplate?.fields}
                      company={company}
                    />
                  </Card>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  )
}
