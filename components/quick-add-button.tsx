'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus, DollarSign, MinusCircle, Briefcase, FileText, Users } from 'lucide-react'
import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function QuickAddButton() {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground hidden lg:inline-flex"
        >
          <Plus className="h-4 w-4" />
          Add New
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <Link href="/add-income" onClick={() => setOpen(false)}>
          <DropdownMenuItem className="cursor-pointer gap-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-success/15">
              <DollarSign className="h-4 w-4 text-success" />
            </div>
            <div>
              <span className="font-medium text-sm">Add Income</span>
              <p className="text-xs text-muted-foreground">Record a payment</p>
            </div>
          </DropdownMenuItem>
        </Link>
        <Link href="/add-expense" onClick={() => setOpen(false)}>
          <DropdownMenuItem className="cursor-pointer gap-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/15">
              <MinusCircle className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <span className="font-medium text-sm">Add Expense</span>
              <p className="text-xs text-muted-foreground">Record a cost</p>
            </div>
          </DropdownMenuItem>
        </Link>
        <DropdownMenuSeparator />
        <Link href="/jobs" onClick={() => setOpen(false)}>
          <DropdownMenuItem className="cursor-pointer gap-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15">
              <Briefcase className="h-4 w-4 text-primary" />
            </div>
            <div>
              <span className="font-medium text-sm">New Job</span>
              <p className="text-xs text-muted-foreground">Create a job</p>
            </div>
          </DropdownMenuItem>
        </Link>
        <Link href="/invoices" onClick={() => setOpen(false)}>
          <DropdownMenuItem className="cursor-pointer gap-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-chart-2/15">
              <FileText className="h-4 w-4 text-chart-2" />
            </div>
            <div>
              <span className="font-medium text-sm">New Invoice</span>
              <p className="text-xs text-muted-foreground">Bill a customer</p>
            </div>
          </DropdownMenuItem>
        </Link>
        <Link href="/customers" onClick={() => setOpen(false)}>
          <DropdownMenuItem className="cursor-pointer gap-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-chart-4/15">
              <Users className="h-4 w-4 text-chart-4" />
            </div>
            <div>
              <span className="font-medium text-sm">New Customer</span>
              <p className="text-xs text-muted-foreground">Add a client</p>
            </div>
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
