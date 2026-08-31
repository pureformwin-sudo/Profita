'use client'

/**
 * Saved contracts, newest first.
 *
 * Finalized rows lose their Edit action — reopening is the deliberate,
 * separate step that unlocks them again.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { FileText, MoreHorizontal, Plus, ScrollText } from 'lucide-react'
import { formatFieldValue } from '@/lib/light-contracts'
import type { LightContract } from '@/lib/types'

interface ContractListProps {
  contracts: LightContract[]
  hasWording: boolean
  busy: boolean
  onNew: () => void
  onEdit: (contract: LightContract) => void
  onPreview: (contract: LightContract) => void
  onFinalize: (contract: LightContract) => void
  onReopen: (contract: LightContract) => void
  onDelete: (contract: LightContract) => void
  onAddWording: () => void
  /** Mint (or re-copy) the public signing link for a finalized contract. */
  onShare: (contract: LightContract) => void
  /** Copy the read-only link to an already-signed contract. */
  onCopyLink: (contract: LightContract) => void
}

export function ContractList({
  contracts,
  hasWording,
  busy,
  onNew,
  onEdit,
  onPreview,
  onFinalize,
  onReopen,
  onDelete,
  onAddWording,
  onShare,
  onCopyLink,
}: ContractListProps) {
  const [pendingDelete, setPendingDelete] = useState<LightContract | null>(null)

  if (contracts.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <div className="rounded-full bg-muted p-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-sm font-medium">No contracts yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground text-pretty">
            {hasWording
              ? 'Create a contract for a customer and the document builds itself from your saved wording.'
              : 'Start by setting up a contract type — its wording, heading and the fields it collects. Then generate one contract per customer.'}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!hasWording && (
            <Button variant="outline" onClick={onAddWording}>
              <ScrollText className="mr-1.5 h-4 w-4" />
              Add contract type
            </Button>
          )}
          <Button onClick={onNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            New contract
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {contracts.map((contract) => {
          const isFinal = contract.status === 'final'
          const isSigned = contract.status === 'signed'
          return (
            <Card key={contract.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPreview(contract)}
                      className="truncate text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {contract.customerName}
                    </button>
                    <Badge
                      variant={isSigned ? 'default' : isFinal ? 'outline' : 'secondary'}
                      className={
                        isSigned ? 'bg-success text-success-foreground border-transparent' : undefined
                      }
                    >
                      {isSigned ? 'Signed' : isFinal ? 'Final' : 'Draft'}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {contract.contractNumber}
                    </span>
                  </div>

                  {contract.serviceAddress && (
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {contract.serviceAddress}
                    </p>
                  )}

                  {/* Summarize whatever fields this contract type declares.
                      Money leads and is emphasized; the rest follow labelled,
                      so a roof wash reads "Service date Apr 3" without the
                      list knowing anything about roof washes. */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {contract.fieldDefs
                      .map((field) => ({
                        field,
                        text: formatFieldValue(field, contract.fieldValues[field.key]),
                      }))
                      .filter((entry) => entry.text)
                      .map(({ field, text }) => (
                        <span
                          key={field.key}
                          className={
                            field.type === 'money'
                              ? 'font-medium tabular-nums text-foreground'
                              : 'tabular-nums'
                          }
                        >
                          {field.type === 'money' ? text : `${field.label} ${text}`}
                        </span>
                      ))}
                  </div>

                  {isSigned && contract.signedAt && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Signed by{' '}
                      <span className="font-medium text-foreground">
                        {contract.signatureName}
                      </span>{' '}
                      on{' '}
                      {new Date(contract.signedAt).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {isFinal && contract.shareToken && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Signing link sent — awaiting customer signature
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onPreview(contract)}>
                    View
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={busy}>
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions for {contract.contractNumber}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isSigned && (
                        <DropdownMenuItem onClick={() => onCopyLink(contract)}>
                          Copy signed copy link
                        </DropdownMenuItem>
                      )}
                      {isFinal && (
                        <>
                          <DropdownMenuItem onClick={() => onShare(contract)}>
                            {contract.shareToken ? 'Copy signing link' : 'Send for signature'}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onReopen(contract)}>
                            Reopen for editing
                          </DropdownMenuItem>
                        </>
                      )}
                      {!isFinal && !isSigned && (
                        <>
                          <DropdownMenuItem onClick={() => onEdit(contract)}>
                            Edit terms
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onFinalize(contract)}
                            disabled={!hasWording}
                          >
                            Finalize
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setPendingDelete(contract)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.status === 'signed'
                ? `${pendingDelete.contractNumber} was signed by ${pendingDelete.signatureName ?? pendingDelete.customerName}. Deleting destroys the signature and the only record of this executed agreement. This cannot be undone.`
                : pendingDelete?.status === 'final'
                  ? `${pendingDelete.contractNumber} is a finalized agreement for ${pendingDelete.customerName}. Deleting removes your only record of it. This cannot be undone.`
                  : `${pendingDelete?.contractNumber} for ${pendingDelete?.customerName} will be permanently removed. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) onDelete(pendingDelete)
                setPendingDelete(null)
              }}
            >
              Delete contract
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
