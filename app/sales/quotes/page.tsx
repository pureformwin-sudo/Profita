'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  FileText,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Send,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  DollarSign,
  User,
  Calendar,
  AlertCircle,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getQuotes, updateQuote, deleteQuote } from '@/lib/quotes-storage'
import { QUOTE_STATUS_LABELS, type Quote, type QuoteStatus } from '@/lib/quotes-types'
import { cn } from '@/lib/utils'

const STATUS_ICON: Record<QuoteStatus, typeof Clock> = {
  draft: FileText,
  sent: Send,
  viewed: Clock,
  accepted: CheckCircle2,
  declined: XCircle,
  expired: XCircle,
}

const STATUS_COLOR: Record<QuoteStatus, string> = {
  draft: 'bg-slate-500/15 text-slate-400',
  sent: 'bg-blue-500/15 text-blue-400',
  viewed: 'bg-amber-500/15 text-amber-400',
  accepted: 'bg-emerald-500/15 text-emerald-400',
  declined: 'bg-rose-500/15 text-rose-400',
  expired: 'bg-gray-500/15 text-gray-400',
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function SalesQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [tablesMissing, setTablesMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all')

  const loadData = async () => {
    setLoading(true)
    const { data, tablesMissing } = await getQuotes()
    setQuotes(data)
    setTablesMissing(tablesMissing)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return quotes.filter((quote) => {
      if (statusFilter !== 'all' && quote.status !== statusFilter) return false
      if (!q) return true
      return (
        (quote.lead_name || '').toLowerCase().includes(q) ||
        (quote.lead_address || '').toLowerCase().includes(q) ||
        String(quote.quote_number).includes(q)
      )
    })
  }, [quotes, search, statusFilter])

  const stats = useMemo(() => {
    const pending = quotes.filter((q) => ['draft', 'sent', 'viewed'].includes(q.status))
    const accepted = quotes.filter((q) => q.status === 'accepted')
    const totalValue = accepted.reduce((sum, q) => sum + q.total, 0)
    return {
      pending: pending.length,
      accepted: accepted.length,
      totalValue,
    }
  }, [quotes])

  const handleMarkSent = async (quote: Quote) => {
    const ok = await updateQuote(quote.id, { status: 'sent', sent_at: new Date().toISOString() })
    if (ok) {
      toast.success('Quote marked as sent')
      loadData()
    } else {
      toast.error('Failed to update quote')
    }
  }

  const handleDelete = async (quote: Quote) => {
    const ok = await deleteQuote(quote.id)
    if (ok) {
      toast.success('Quote deleted')
      setQuotes((prev) => prev.filter((q) => q.id !== quote.id))
    } else {
      toast.error('Failed to delete quote')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (tablesMissing) {
    return (
      <div className="p-4 lg:p-6 max-w-4xl mx-auto">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <AlertCircle className="h-10 w-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-2">Database Setup Required</h2>
          <p className="text-sm text-muted-foreground">
            Run the migration script to create the quotes table.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Quotes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {quotes.length} total quotes
          </p>
        </div>
        <Button asChild>
          <Link href="/sales/quotes/new">
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Pending</span>
            </div>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Won</span>
            </div>
            <div className="text-2xl font-bold">{stats.accepted}</div>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <DollarSign className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Value</span>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {(Object.entries(QUOTE_STATUS_LABELS) as [QuoteStatus, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Quote List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-1">No quotes yet</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Create your first quote to start closing deals.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/sales/quotes/new">
              <Plus className="h-4 w-4 mr-2" />
              Create Quote
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((quote) => {
            const StatusIcon = STATUS_ICON[quote.status]
            return (
              <Card key={quote.id} className="group hover:border-primary/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Left */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className={cn('text-[10px] uppercase tracking-wider', STATUS_COLOR[quote.status])}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {QUOTE_STATUS_LABELS[quote.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          #{quote.quote_number}
                        </span>
                      </div>

                      <h3 className="font-semibold truncate">
                        {quote.lead_name || 'Unknown Lead'}
                      </h3>
                      {quote.lead_address && (
                        <p className="text-sm text-muted-foreground truncate">
                          {quote.lead_address}
                        </p>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(quote.created_at)}
                        </span>
                        {quote.valid_until && (
                          <span>Expires {formatDate(quote.valid_until)}</span>
                        )}
                      </div>
                    </div>

                    {/* Right */}
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-foreground">
                        {formatCurrency(quote.total)}
                      </div>
                      <div className="flex items-center gap-1 mt-2">
                        {quote.status === 'draft' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-blue-500 hover:text-blue-400"
                            onClick={() => handleMarkSent(quote)}
                          >
                            <Send className="h-3 w-3 mr-1" />
                            Send
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-rose-500 hover:text-rose-400"
                          onClick={() => handleDelete(quote)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
