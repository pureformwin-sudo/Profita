'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
  Building2, Users, Briefcase, FileText, Search, 
  ArrowLeft, MoreHorizontal, Eye, Edit, Shield
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { 
  isSuperAdmin, 
  getAllCompanies, 
  updateCompanyPlan,
  type CompanyWithStats 
} from '@/lib/super-admin'

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
  starter: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  pro: 'bg-purple-500/10 text-purple-500 border-purple-500/30',
  enterprise: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
}

const STATUS_COLORS: Record<string, string> = {
  trialing: 'bg-blue-500/10 text-blue-500',
  active: 'bg-emerald-500/10 text-emerald-500',
  past_due: 'bg-red-500/10 text-red-500',
  canceled: 'bg-gray-500/10 text-gray-500',
  paused: 'bg-amber-500/10 text-amber-500',
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyWithStats[]>([])
  const [filteredCompanies, setFilteredCompanies] = useState<CompanyWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState<string>('all')
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
        const allCompanies = await getAllCompanies()
        setCompanies(allCompanies)
        setFilteredCompanies(allCompanies)
      } catch (err) {
        console.error('Error loading companies:', err)
        toast.error('Failed to load companies')
      } finally {
        setLoading(false)
      }
    }
    checkAccessAndLoad()
  }, [router])

  useEffect(() => {
    let filtered = companies
    
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.owner_email?.toLowerCase().includes(searchLower)
      )
    }
    
    if (planFilter !== 'all') {
      filtered = filtered.filter(c => c.plan_type === planFilter)
    }
    
    setFilteredCompanies(filtered)
  }, [search, planFilter, companies])

  async function handlePlanChange(companyId: string, newPlan: 'free' | 'starter' | 'pro' | 'enterprise') {
    const result = await updateCompanyPlan(companyId, newPlan)
    if (result.success) {
      toast.success('Plan updated')
      setCompanies(prev => prev.map(c => 
        c.id === companyId ? { ...c, plan_type: newPlan } : c
      ))
    } else {
      toast.error(result.error || 'Failed to update plan')
    }
  }

  if (!authorized) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Checking access...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Companies
          </h1>
          <p className="text-muted-foreground">Manage all companies on the platform</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={planFilter} onValueChange={setPlanFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plans</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="starter">Starter</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="enterprise">Enterprise</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{companies.length}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{companies.filter(c => c.plan_type === 'free').length}</p>
            <p className="text-xs text-muted-foreground">Free</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{companies.filter(c => c.plan_type === 'pro' || c.plan_type === 'enterprise').length}</p>
            <p className="text-xs text-muted-foreground">Paid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-2xl font-bold">{companies.filter(c => c.subscription_status === 'trialing').length}</p>
            <p className="text-xs text-muted-foreground">Trialing</p>
          </CardContent>
        </Card>
      </div>

      {/* Companies Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No companies found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  <TableHead className="text-center">Jobs</TableHead>
                  <TableHead className="text-center">Invoices</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map(company => (
                  <TableRow key={company.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{company.name}</p>
                        <p className="text-xs text-muted-foreground">{company.owner_email || 'No owner'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={company.plan_type}
                        onValueChange={(value) => handlePlanChange(company.id, value as any)}
                      >
                        <SelectTrigger className={`w-[100px] h-7 text-xs ${PLAN_COLORS[company.plan_type]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="starter">Starter</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                          <SelectItem value="enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLORS[company.subscription_status]}>
                        {company.subscription_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        {company.member_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Briefcase className="h-3 w-3 text-muted-foreground" />
                        {company.job_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        {company.invoice_count}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(company.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/companies/${company.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/companies/${company.id}/edit`}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
