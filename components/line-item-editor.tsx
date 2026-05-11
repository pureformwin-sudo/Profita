'use client'

import { memo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, X } from 'lucide-react'

export interface LineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

interface LineItemEditorProps {
  items: LineItem[]
  onItemsChange: (items: LineItem[]) => void
}

// Memoized single line item row to prevent re-renders
const LineItemRow = memo(function LineItemRow({
  item,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  item: LineItem
  index: number
  onUpdate: (index: number, field: keyof LineItem, value: string | number) => void
  onRemove: (index: number) => void
  canRemove: boolean
}) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <Input
        placeholder="Service or product"
        defaultValue={item.description}
        onBlur={(e) => onUpdate(index, 'description', e.target.value)}
        className="col-span-5"
      />
      <Input
        type="number"
        min="1"
        defaultValue={item.quantity || ''}
        onBlur={(e) => onUpdate(index, 'quantity', parseFloat(e.target.value) || 1)}
        className="col-span-2 text-center"
      />
      <div className="col-span-2 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
        <Input
          type="number"
          step="0.01"
          min="0"
          defaultValue={item.unitPrice || ''}
          onBlur={(e) => onUpdate(index, 'unitPrice', parseFloat(e.target.value) || 0)}
          className="pl-7"
        />
      </div>
      <div className="col-span-2 text-right font-medium text-sm">
        ${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        className="col-span-1 h-9 w-9"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
})

export const LineItemEditor = memo(function LineItemEditor({
  items,
  onItemsChange,
}: LineItemEditorProps) {
  const handleUpdate = useCallback(
    (index: number, field: keyof LineItem, value: string | number) => {
      const newItems = [...items]
      const numValue = typeof value === 'string' ? value : Number(value)
      
      if (field === 'description') {
        newItems[index] = { ...newItems[index], description: value as string }
      } else if (field === 'quantity') {
        const qty = Number(numValue) || 1
        newItems[index] = {
          ...newItems[index],
          quantity: qty,
          total: qty * newItems[index].unitPrice,
        }
      } else if (field === 'unitPrice') {
        const price = Number(numValue) || 0
        newItems[index] = {
          ...newItems[index],
          unitPrice: price,
          total: newItems[index].quantity * price,
        }
      }
      
      onItemsChange(newItems)
    },
    [items, onItemsChange]
  )

  const handleRemove = useCallback(
    (index: number) => {
      if (items.length > 1) {
        onItemsChange(items.filter((_, i) => i !== index))
      }
    },
    [items, onItemsChange]
  )

  const handleAdd = useCallback(() => {
    onItemsChange([
      ...items,
      { id: String(Date.now()), description: '', quantity: 1, unitPrice: 0, total: 0 },
    ])
  }, [items, onItemsChange])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
        <div className="col-span-5">Description</div>
        <div className="col-span-2 text-center">Qty</div>
        <div className="col-span-2 text-right">Price</div>
        <div className="col-span-2 text-right">Total</div>
        <div className="col-span-1"></div>
      </div>
      {items.map((item, index) => (
        <LineItemRow
          key={item.id}
          item={item}
          index={index}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
          canRemove={items.length > 1}
        />
      ))}
      <Button type="button" variant="outline" size="sm" onClick={handleAdd} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Add Line Item
      </Button>
    </div>
  )
})

interface TotalsSummaryProps {
  items: LineItem[]
  taxRate: number
}

export const TotalsSummary = memo(function TotalsSummary({
  items,
  taxRate,
}: TotalsSummaryProps) {
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const price = Number(item.unitPrice) || 0
    return sum + qty * price
  }, 0)
  const taxAmount = subtotal * (taxRate / 100)
  const total = subtotal + taxAmount

  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span>${subtotal.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Tax ({taxRate}%)</span>
        <span>${taxAmount.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-lg font-bold pt-2 border-t">
        <span>Total</span>
        <span className="text-primary">${total.toFixed(2)}</span>
      </div>
    </div>
  )
})
