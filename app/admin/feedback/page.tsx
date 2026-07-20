'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  ArrowLeft, Bug, Lightbulb, MessageSquare, 
  ExternalLink, Clock, CheckCircle2, Eye, XCircle
} from 'lucide-react'
import { toast } from 'sonner'
import { isSuperAdmin } from '@/lib/super-admin'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'

interface BetaFeedback {
  id: string
  user_id: string | null
  company_id: string | null
  type: 'bug' | 'feature' | 'general'
  message: string
  page_url: string | null
  user_agent: string | null
  status: 'new' | 'reviewed' | 'in_progress' | 'resolved' | 'wont_fix'
  admin_notes: string | null
  created_at: string
  updated_at: string
  user_email?: string
  company_name?: string
}

const TYPE_CONFIG = {
  bug: { icon: Bug, label: 'Bug', color: 'bg-red-500/10 text-red-600 border-red-500/30' },
  feature: { icon: Lightbulb, label: 'Feature', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
  general: { icon: MessageSquare, label: 'General', color: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
}

const STATUS_CONFIG = {
  new: { label: 'New', color: 'bg-blue-500/10 text-blue-600', icon: Clock },
  reviewed: { label: 'Reviewed', color: 'bg-purple-500/10 text-purple-600', icon: Eye },
  in_progress: { label: 'In Progress', color: 'bg-amber-500/10 text-amber-600', icon: Clock },
  resolved: { label: 'Resolved', color: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 },
  wont_fix: { label: "Won't Fix", color: 'bg-gray-500/10 text-gray-600', icon: XCircle },
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<BetaFeedback[]>([])
  const [filteredFeedback, setFilteredFeedback] = useState<BetaFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedFeedback, setSelectedFeedback] = useState<BetaFeedback | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [updating, setUpdating] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function checkAccessAndLoad() {
      const isAdmin = await isSuperAdmin()
      if (!isAdmin) {
        toast.error('Access denied - Super admin only')
        router.push('/')
        return
      }
      setAuthorized(true)
      await loadFeedback()
    }
    checkAccessAndLoad()
  }, [router])

  async function loadFeedback() {
    const supabase = createClient()
    try {
      // Get feedback with user emails and company names
      const { data, error } = await supabase
        .from('beta_feedback')
        .select(`
          *,
          profiles:user_id (email),
          companies:company_id (name)
        `)
        .order('created_at', { ascending: false })

      if (error) throw error

      const mapped = (data || []).map((f: any) => ({
        ...f,
        user_email: f.profiles?.email || 'Anonymous',
        company_name: f.companies?.name || 'N/A',
      }))

      setFeedback(mapped)
      setFilteredFeedback(mapped)
    } catch (err) {
      console.error('Error loading feedback:', err)
      toast.error('Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let filtered = feedback

    if (typeFilter !== 'all') {
      filtered = filtered.filter(f => f.type === typeFilter)
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(f => f.status === statusFilter)
    }

    setFilteredFeedback(filtered)
  }, [feedback, typeFilter, statusFilter])

  async function updateFeedbackStatus(id: string, status: string, notes?: string) {
    setUpdating(true)
    const supabase = createClient()
    
    try {
      const updateData: Record<string, unknown> = { status }
      if (notes !== undefined) {
        updateData.admin_notes = notes
      }

      const { error } = await supabase
        .from('beta_feedback')
        .update(updateData)
        .eq('id', id)

      if (error) throw error

      toast.success('Feedback updated')
      await loadFeedback()
      setSelectedFeedback(null)
    } catch (err) {
      console.error('Error updating feedback:', err)
      toast.error('Failed to update feedback')
    } finally {
      setUpdating(false)
    }
  }

  function openFeedbackDetail(f: BetaFeedback) {
    setSelectedFeedback(f)
    setAdminNotes(f.admin_notes || '')
  }

  if (!authorized) {
    return (
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const stats = {
    total: feedback.length,
    new: feedback.filter(f => f.status === 'new').length,
    bugs: feedback.filter(f => f.type === 'bug').length,
    features: feedback.filter(f => f.type === 'feature').length,
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Beta Feedback</h1>
          <p className="text-muted-foreground">Review user feedback from beta testing</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{stats.new}</div>
            <div className="text-sm text-muted-foreground">New</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.bugs}</div>
            <div className="text-sm text-muted-foreground">Bugs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-amber-600">{stats.features}</div>
            <div className="text-sm text-muted-foreground">Features</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Feedback List</CardTitle>
          <CardDescription>Click a row to view details and update status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="bug">Bug</SelectItem>
                <SelectItem value="feature">Feature</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="wont_fix">Won&apos;t Fix</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredFeedback.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>No feedback found</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="hidden md:table-cell">User</TableHead>
                    <TableHead className="hidden lg:table-cell">Page</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px] hidden sm:table-cell">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFeedback.map((f) => {
                    const typeConfig = TYPE_CONFIG[f.type]
                    const statusConfig = STATUS_CONFIG[f.status]
                    const TypeIcon = typeConfig.icon
                    
                    return (
                      <TableRow 
                        key={f.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openFeedbackDetail(f)}
                      >
                        <TableCell>
                          <Badge variant="outline" className={typeConfig.color}>
                            <TypeIcon className="h-3 w-3 mr-1" />
                            {typeConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] md:max-w-[300px] truncate">
                          {f.message}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {f.user_email}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[150px] truncate">
                          {f.page_url?.replace(/^https?:\/\/[^/]+/, '') || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={statusConfig.color}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(f.created_at), { addSuffix: true })}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedFeedback} onOpenChange={() => setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedFeedback && (
                <>
                  {(() => {
                    const TypeIcon = TYPE_CONFIG[selectedFeedback.type].icon
                    return <TypeIcon className="h-5 w-5" />
                  })()}
                  {TYPE_CONFIG[selectedFeedback?.type || 'general'].label} Feedback
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              From {selectedFeedback?.user_email} ({selectedFeedback?.company_name})
            </DialogDescription>
          </DialogHeader>

          {selectedFeedback && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Message</label>
                <p className="mt-1 text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap">
                  {selectedFeedback.message}
                </p>
              </div>

              {selectedFeedback.page_url && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Page URL</label>
                  <p className="mt-1 text-sm flex items-center gap-2">
                    <a 
                      href={selectedFeedback.page_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1"
                    >
                      {selectedFeedback.page_url.replace(/^https?:\/\/[^/]+/, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-muted-foreground">Submitted</label>
                <p className="mt-1 text-sm">
                  {new Date(selectedFeedback.created_at).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <Select 
                  value={selectedFeedback.status} 
                  onValueChange={(v) => updateFeedbackStatus(selectedFeedback.id, v)}
                  disabled={updating}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="wont_fix">Won&apos;t Fix</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Admin Notes</label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Internal notes about this feedback..."
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelectedFeedback(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => updateFeedbackStatus(selectedFeedback.id, selectedFeedback.status, adminNotes)}
                  disabled={updating}
                >
                  {updating ? 'Saving...' : 'Save Notes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
