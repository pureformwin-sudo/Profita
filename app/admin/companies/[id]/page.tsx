'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Building2, Users, Briefcase, FileText, ArrowLeft, 
  Calendar, DollarSign, Shield, Mail
} from 'lucide-react'
import { toast } from 'sonner'
import { 
  isSuperAdmin, 
  getCompanyDetails,
  updateCompanyPlan,
  type CompanyWithStats 
} from '@/lib/super-admin'

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-500/10 text-gray-500',
  starter: 'bg-blue-500/10 text-blue-500',
  pro: 'bg-purple-500/10 text-purple-500',
  enterprise: 'bg-amber-500/10 text-amber-500',
}

const STATUS_COLORS: Record<string, string> = {
  trialing: 'bg-blue-500/10 text-blue-500',
  active: 'bg-emerald-500/10 text-emerald-500',
  past_due: 'bg-red-500/10 text-red-500',
  canceled: 'bg-gray-500/10 text-gray-500',
  paused: 'bg-amber-500/10 text-amber-500',
}

export default function AdminCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [company, setCompany] = useState<CompanyWithStats | null>(null)
  const [members, setMembers] = useState<Array<{ id: string; email: string; role: string; joined_at: string }>>([])
  const [recentJobs, setRecentJobs] = useState<Array<{ id: string; title: string; status: string; created_at: string }>>([])
  const [recentInvoices, setRecentInvoices] = useState<Array<{ id: string; invoice_number: string; total: number; status: string }>>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
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
      
      try {
        const details = await getCompanyDetails(id)
        if (!details.company) {
          toast.error('Company not found')
          router.push('/admin/companies')
          return
        }
        setCompany(details.company)
        setMembers(details.members)
        setRecentJobs(details.recentJobs)
        setRecentInvoices(details.recentInvoices)
      } catch (err) {
        console.error('Error loading company:', err)
        toast.error('Failed to load company details')
      } finally {
        setLoading(false)
      }
    }
    checkAccessAndLoad()
  }, [id, router])

  async function handlePlanChange(newPlan: 'free' | 'starter' | 'pro' | 'enterprise') {
    if (!company) return
    const result = await updateCompanyPlan(company.id, newPlan)
    if (result.success) {
      toast.success('Plan updated')
      setCompany({ ...company, plan_type: newPlan })
    } else {
      toast.error(result.error || 'Failed to update plan')
    }
  }

  if (!authorized || loading) {
    return (
      <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Company not found</p>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/companies"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            {company.name}
          </h1>
          <p className="text-muted-foreground">{company.owner_email || 'No owner email'}</p>
        </div>
        <Badge variant="outline" className={PLAN_COLORS[company.plan_type]}>
          {company.plan_type.toUpperCase()}
        </Badge>
        <Badge variant="outline" className={STATUS_COLORS[company.subscription_status]}>
          {company.subscription_status}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{company.member_count}</p>
                <p className="text-xs text-muted-foreground">Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-2xl font-bold">{company.job_count}</p>
                <p className="text-xs text-muted-foreground">Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{company.invoice_count}</p>
                <p className="text-xs text-muted-foreground">Invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">${company.mrr}</p>
                <p className="text-xs text-muted-foreground">MRR</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Management</CardTitle>
          <CardDescription>Update the company subscription plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={company.plan_type} onValueChange={(v) => handlePlanChange(v as any)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="starter">Starter - $29/mo</SelectItem>
                <SelectItem value="pro">Pro - $79/mo</SelectItem>
                <SelectItem value="enterprise">Enterprise - Custom</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              Created: {new Date(company.created_at).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Members ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No members</p>
            ) : (
              <div className="space-y-2">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{member.email}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {member.role}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Jobs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Recent Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No jobs</p>
            ) : (
              <div className="space-y-2">
                {recentJobs.map(job => (
                  <div key={job.id} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                    <span className="text-sm truncate">{job.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {job.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Recent Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No invoices</p>
          ) : (
            <div className="grid gap-2">
              {recentInvoices.map(invoice => (
                <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <span className="font-medium">#{invoice.invoice_number}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">${invoice.total.toFixed(2)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
