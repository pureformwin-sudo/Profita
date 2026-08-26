'use client'

/**
 * Christmas lights lease contracts.
 *
 * Three surfaces: the reusable Wording (paste the agreement text once), the
 * per-customer Contracts list, and the printable document preview.
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
import { AlertTriangle, FileText, Plus, Printer, ScrollText } from 'lucide-react'
import type { Customer, ContractTemplate, LightContract } from '@/lib/types'
import { getCustomers, getSettings } from '@/lib/storage'
import {
  draftFromCustomer,
  draftToRecord,
  emptyDraft,
  type ContractDraft,
} from '@/lib/light-contracts'
import { ContractWordingEditor } from '@/components/light-contracts/contract-wording-editor'
import { ContractList } from '@/components/light-contracts/contract-list'
import { ContractForm } from '@/components/light-contracts/contract-form'
import { ContractDocument } from '@/components/light-contracts/contract-document'

const SETUP_SQL = 'scripts/021-christmas-light-contracts.sql'

export default function ContractsPage() {
  const [loading, setLoading] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [template, setTemplate] = useState<ContractTemplate | null>(null)
  const [contracts, setContracts] = useState<LightContract[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [company, setCompany] = useState({ name: '', phone: '', email: '' })

  const [tab, setTab] = useState('contracts')
  const [editing, setEditing] = useState<LightContract | null>(null)
  const [draft, setDraft] = useState<ContractDraft | null>(null)
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
      setTemplate(data.template ?? null)
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

  const hasWording = Boolean(template?.body?.trim())

  // -- template ------------------------------------------------------------

  async function handleSaveWording(body: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/light-contracts/template', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save wording')
      setTemplate(data.template)
      toast.success('Contract wording saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save wording')
    } finally {
      setSaving(false)
    }
  }

  // -- contracts -----------------------------------------------------------

  function startNew() {
    setEditing(null)
    setDraft(emptyDraft())
    setTab('editor')
  }

  function startEdit(contract: LightContract) {
    setEditing(contract)
    setDraft({
      customerId: contract.customerId,
      customerName: contract.customerName,
      serviceAddress: contract.serviceAddress ?? '',
      customerEmail: contract.customerEmail ?? '',
      customerPhone: contract.customerPhone ?? '',
      price: contract.price == null ? '' : String(contract.price),
      termYears: contract.termYears == null ? '' : String(contract.termYears),
      installDate: contract.installDate ?? '',
      takedownDate: contract.takedownDate ?? '',
      notes: contract.notes ?? '',
    })
    setTab('editor')
  }

  function pickCustomer(customer: Customer) {
    setDraft((prev) => ({ ...(prev ?? emptyDraft()), ...draftFromCustomer(customer) }))
  }

  async function handleSaveContract() {
    if (!draft) return
    setSaving(true)
    try {
      const payload = draftToRecord(draft)
      const res = await fetch('/api/light-contracts', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
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
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              Christmas Lights Contracts
            </h1>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Paste your lease wording once, then generate a finished document per customer.
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
              The contract tables don&apos;t exist yet. Run{' '}
              <code className="font-mono text-xs">{SETUP_SQL}</code> against your Supabase project,
              then reload this page.
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
                Wording
                {!hasWording && (
                  <span
                    className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500"
                    aria-label="No wording added yet"
                  />
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
              />
            </TabsContent>

            <TabsContent value="editor">
              {draft && (
                <ContractForm
                  draft={draft}
                  customers={customers}
                  editing={editing}
                  busy={saving}
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
                template={template}
                busy={saving}
                onSave={handleSaveWording}
              />
            </TabsContent>

            <TabsContent value="preview">
              {previewContract ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div className="flex items-center gap-2">
                      <Badge variant={previewContract.status === 'final' ? 'default' : 'secondary'}>
                        {previewContract.status === 'final' ? 'Final' : 'Draft'}
                      </Badge>
                      <span className="font-mono text-sm text-muted-foreground">
                        {previewContract.contractNumber}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {previewContract.status === 'draft' ? (
                        <Button
                          variant="outline"
                          onClick={() => handleFinalize(previewContract, 'finalize')}
                          disabled={saving || !hasWording}
                        >
                          Finalize
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => handleFinalize(previewContract, 'reopen')}
                          disabled={saving}
                        >
                          Reopen
                        </Button>
                      )}
                      <Button onClick={() => window.print()}>
                        <Printer className="mr-1.5 h-4 w-4" />
                        Download / Print
                      </Button>
                    </div>
                  </div>

                  {!hasWording && (
                    <Alert className="print:hidden">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>No contract wording yet</AlertTitle>
                      <AlertDescription>
                        The header and terms will render, but the body will be empty until you paste
                        your agreement text in the Wording tab.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Card className="overflow-hidden p-0 print:border-0 print:shadow-none">
                    <ContractDocument
                      contract={previewContract}
                      templateBody={template?.body ?? ''}
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
