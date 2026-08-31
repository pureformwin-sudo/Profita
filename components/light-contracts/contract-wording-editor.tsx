'use client'

/**
 * Editor for one contract type: its heading, number prefix, the fields it
 * collects, and its wording.
 *
 * The wording is deliberately a plain textarea: this is legal text the user
 * owns, so it is stored verbatim with no rich-text or markdown transformation.
 * The only intelligence is the placeholder reference and unknown-token warning,
 * both of which are driven by the field list edited just above it — so the
 * wording and the fields can't silently drift apart.
 */

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { AlertTriangle, Check, Copy, Plus, Trash2 } from 'lucide-react'
import {
  contractFieldsFor,
  findUnknownPlaceholders,
  isReservedFieldKey,
  normalizeFieldKey,
  placeholdersUsed,
  type ContractField,
  type TemplateDraft,
} from '@/lib/light-contracts'
import type { ContractFieldDef, ContractTemplate } from '@/lib/types'

interface ContractWordingEditorProps {
  /** Every saved contract type. */
  templates: ContractTemplate[]
  busy: boolean
  onSave: (draft: TemplateDraft) => void
  onDelete: (templateId: string) => void
}

/** Sentinel for "create a new type", since SelectItem can't take an empty value. */
const NEW_TYPE = 'new'

const ORIGIN_LABELS: Record<string, string> = {
  customer: 'From customer record',
  deal: 'Per contract',
  company: 'From your settings',
  computed: 'Automatic',
}

const FIELD_TYPE_LABELS: Record<ContractFieldDef['type'], string> = {
  text: 'Text',
  money: 'Money',
  date: 'Date',
  number: 'Number',
}

function toDraft(template: ContractTemplate | null): TemplateDraft {
  return {
    contractType: template?.contractType ?? '',
    name: template?.name ?? '',
    documentTitle: template?.documentTitle ?? '',
    numberPrefix: template?.numberPrefix ?? '',
    body: template?.body ?? '',
    fields: template?.fields ? template.fields.map((f) => ({ ...f })) : [],
  }
}

export function ContractWordingEditor({
  templates,
  busy,
  onSave,
  onDelete,
}: ContractWordingEditorProps) {
  // Which type is being edited. NEW_TYPE means an unsaved new one.
  const [selectedId, setSelectedId] = useState<string>(() => templates[0]?.id ?? NEW_TYPE)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const template = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  )

  const [draft, setDraft] = useState<TemplateDraft>(() => toDraft(template))

  // Adopt the saved row when the selection changes or a save round-trips.
  // Keyed on id + updatedAt so typing is never clobbered mid-edit.
  useEffect(() => {
    setDraft(toDraft(template))
  }, [template?.id, template?.updatedAt])

  // Once the first type saves, move the selection onto it so the editor isn't
  // left sitting on a blank "new type" form showing none of the saved work.
  useEffect(() => {
    if (selectedId === NEW_TYPE && templates.length === 1) setSelectedId(templates[0].id)
  }, [templates, selectedId])

  const saved = useMemo(() => toDraft(template), [template?.id, template?.updatedAt])
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const unknown = useMemo(
    () => findUnknownPlaceholders(draft.body, draft.fields),
    [draft.body, draft.fields],
  )

  /**
   * Fields declared but never referenced in the wording.
   *
   * Not an error — a field can legitimately appear only in the Terms box — but
   * worth surfacing, because the usual cause is a typo in the placeholder.
   */
  const unusedFields = useMemo(() => {
    const used = placeholdersUsed(draft.body)
    return draft.fields.filter(
      (f) => !used.has(f.key) && !used.has(`${f.key}_plain`) && !used.has(`${f.key}_words`),
    )
  }, [draft.body, draft.fields])

  const fieldErrors = useMemo(() => {
    const errors: string[] = []
    const seen = new Set<string>()
    for (const f of draft.fields) {
      if (!f.key) {
        errors.push('Every field needs a placeholder key.')
        continue
      }
      if (seen.has(f.key)) errors.push(`Duplicate field key "${f.key}".`)
      seen.add(f.key)
      if (isReservedFieldKey(f.key)) {
        errors.push(`"${f.key}" is reserved — pick a different key.`)
      }
    }
    if (!draft.name.trim()) errors.push('Give this contract type a name.')
    return errors
  }, [draft.fields, draft.name])

  const grouped = useMemo(() => {
    const out: Record<string, ContractField[]> = {}
    for (const f of contractFieldsFor(draft.fields)) {
      out[f.origin] ??= []
      out[f.origin].push(f)
    }
    return out
  }, [draft.fields])

  function patch(next: Partial<TemplateDraft>) {
    setDraft((d) => ({ ...d, ...next }))
  }

  function patchField(index: number, next: Partial<ContractFieldDef>) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, ...next } : f)),
    }))
  }

  function addField() {
    setDraft((d) => ({
      ...d,
      fields: [...d.fields, { key: '', label: '', type: 'text', required: false }],
    }))
  }

  function removeField(index: number) {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }))
  }

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
      <div className="flex flex-col gap-6">
        {/* Library picker -------------------------------------------------
            Switching away from unsaved edits would lose them silently, so the
            picker is disabled while dirty and explains why. */}
        {templates.length > 0 && (
          <Card className="flex flex-wrap items-end justify-between gap-4 p-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="template-picker">Editing</Label>
              <Select
                value={selectedId}
                onValueChange={setSelectedId}
                disabled={dirty || busy}
              >
                <SelectTrigger id="template-picker" className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  <SelectItem value={NEW_TYPE}>+ New contract type</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {dirty
                  ? 'Save or discard your changes before switching.'
                  : `${templates.length} contract ${templates.length === 1 ? 'type' : 'types'} saved.`}
              </p>
            </div>

            {template && (
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(true)}
                disabled={busy || dirty}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete type
              </Button>
            )}
          </Card>
        )}

        {/* Identity ------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div>
            <h2 className="text-sm font-medium">
              {template ? 'Contract type' : 'New contract type'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              How this agreement is labelled and numbered.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="template-name"
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Roof Soft Wash"
              />
              <p className="text-xs text-muted-foreground">Shown in the contract type picker.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="template-prefix">Number prefix</Label>
              <Input
                id="template-prefix"
                value={draft.numberPrefix}
                onChange={(e) =>
                  patch({
                    numberPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                  })
                }
                placeholder="RSW"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {`${draft.numberPrefix || 'LEC'}-${new Date().getFullYear()}-001`}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="template-title">Printed heading</Label>
              <Input
                id="template-title"
                value={draft.documentTitle}
                onChange={(e) => patch({ documentTitle: e.target.value })}
                placeholder="ROOF SOFT WASH AGREEMENT"
              />
              <p className="text-xs text-muted-foreground">
                Appears at the top of the document. Defaults to the name in capitals.
              </p>
            </div>
          </div>
        </Card>

        {/* Fields --------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div>
            <h2 className="text-sm font-medium">Fields collected per contract</h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Each field becomes an input on the contract form and a{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {'{{placeholder}}'}
              </code>{' '}
              you can use in the wording.
            </p>
          </div>

          {draft.fields.length === 0 ? (
            <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground text-pretty">
              No custom fields. This type will collect only customer details and additional terms.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {draft.fields.map((field, i) => (
                <li
                  key={i}
                  className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem_auto] sm:items-end"
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`field-label-${i}`} className="text-xs">
                      Label
                    </Label>
                    <Input
                      id={`field-label-${i}`}
                      value={field.label}
                      onChange={(e) => {
                        const label = e.target.value
                        // Derive the key from the label until the user edits
                        // the key directly, so the common case needs one input.
                        const autoKey =
                          !field.key || field.key === normalizeFieldKey(field.label)
                        patchField(i, autoKey ? { label, key: normalizeFieldKey(label) } : { label })
                      }}
                      placeholder="Service date"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`field-key-${i}`} className="text-xs">
                      Placeholder
                    </Label>
                    <Input
                      id={`field-key-${i}`}
                      value={field.key}
                      onChange={(e) => patchField(i, { key: normalizeFieldKey(e.target.value) })}
                      placeholder="service_date"
                      className="font-mono text-xs"
                      aria-invalid={!field.key || isReservedFieldKey(field.key)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`field-type-${i}`} className="text-xs">
                      Type
                    </Label>
                    <Select
                      value={field.type}
                      onValueChange={(v) => patchField(i, { type: v as ContractFieldDef['type'] })}
                    >
                      <SelectTrigger id={`field-type-${i}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant={field.required ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => patchField(i, { required: !field.required })}
                      aria-pressed={field.required}
                      className="text-xs"
                    >
                      {field.required ? 'Required' : 'Optional'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(i)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remove {field.label || 'field'}</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" variant="outline" size="sm" onClick={addField} className="self-start">
            <Plus className="mr-1.5 h-4 w-4" />
            Add field
          </Button>
        </Card>

        {/* Wording -------------------------------------------------------- */}
        <Card className="flex flex-col gap-4 p-4 sm:p-6">
          <div>
            <h2 className="text-sm font-medium">Contract wording</h2>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Paste your full agreement below. Use placeholders like{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                {'{{customer_name}}'}
              </code>{' '}
              wherever a value should be filled in per customer.
            </p>
          </div>

          <Textarea
            value={draft.body}
            onChange={(e) => patch({ body: e.target.value })}
            placeholder={
              'Paste your service agreement here.\n\n' +
              'Example:\n' +
              'This Agreement is entered into on {{today}} between {{company_name}} ' +
              '("Company") and {{customer_name}} ("Customer") for services at ' +
              '{{service_address}}.\n\n' +
              'FEES. Customer agrees to pay {{price}}.'
            }
            className="min-h-[26rem] resize-y font-mono text-xs leading-relaxed"
            spellCheck={false}
          />

          {unknown.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Unrecognized placeholder{unknown.length > 1 ? 's' : ''}</AlertTitle>
              <AlertDescription>
                {unknown.map((u) => `{{${u}}}`).join(', ')} won&apos;t be filled in. Add a field with
                that key above, check the spelling, or remove the braces if it&apos;s meant to be
                literal text.
              </AlertDescription>
            </Alert>
          )}

          {unusedFields.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>
                {unusedFields.length === 1 ? 'A field is' : 'Some fields are'} not used in the
                wording
              </AlertTitle>
              <AlertDescription>
                {unusedFields.map((f) => f.label || f.key).join(', ')} will still appear in the
                Terms box, but {unusedFields.length === 1 ? 'its value' : 'their values'} won&apos;t
                appear in the agreement text.
              </AlertDescription>
            </Alert>
          )}

          {fieldErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Fix before saving</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {fieldErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              {draft.body.length.toLocaleString()} characters
              {template?.updatedAt && !dirty && (
                <> · saved {new Date(template.updatedAt).toLocaleString()}</>
              )}
            </p>
            <div className="flex gap-2">
              {dirty && (
                <Button variant="ghost" onClick={() => setDraft(toDraft(template))} disabled={busy}>
                  Discard changes
                </Button>
              )}
              <Button
                onClick={() => onSave({ ...draft, id: template?.id })}
                disabled={busy || !dirty || fieldErrors.length > 0}
              >
                {busy ? 'Saving…' : template ? 'Save changes' : 'Create contract type'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Card className="h-fit p-4 sm:p-5 lg:sticky lg:top-6">
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

      {/* Existing contracts keep their own frozen copy of the wording, so
          deleting a type never alters a document that's already been issued. */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{template?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              You won&apos;t be able to create new contracts of this type. Contracts already created
              under it keep their own copy of the wording and are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (template) onDelete(template.id)
                setConfirmDelete(false)
                setSelectedId(templates.find((t) => t.id !== template?.id)?.id ?? NEW_TYPE)
              }}
            >
              Delete type
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
