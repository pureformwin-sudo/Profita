'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  Building2, Users, Briefcase, FileText, DollarSign, 
  TrendingUp, Clock, ArrowRight, Shield, Activity
} from 'lucide-react'
import { toast } from 'sonner'
import { isSuperAdmin, getPlatformStats, type PlatformStats } from '@/lib/super-admin'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
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
        const platformStats = await getPlatformStats()
        setStats(platformStats)
      } catch (err) {
        console.error('Error loading stats:', err)
        toast.error('Failed to load platform statistics')
      } finally {
        setLoading(false)
      }
    }
    checkAccessAndLoad()
  }, [router])

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Admin Console
          </h1>
          <p className="text-muted-foreground">Platform-wide statistics and management</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          Super Admin
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalCompanies || 0}</p>
                  <p className="text-xs text-muted-foreground">Companies</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
                  <p className="text-xs text-muted-foreground">Users</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Briefcase className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalJobs || 0}</p>
                  <p className="text-xs text-muted-foreground">Jobs</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.totalInvoices || 0}</p>
                  <p className="text-xs text-muted-foreground">Invoices</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue & Growth */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-3xl font-bold">
                    ${(stats?.totalRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm text-muted-foreground">Total platform revenue (paid invoices)</p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <p className="text-lg font-semibold">${(stats?.mrr || 0).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">MRR</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{stats?.activeTrials || 0}</p>
                    <p className="text-xs text-muted-foreground">Active Trials</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              Growth
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-2xl font-bold text-emerald-500">
                      +{stats?.newCompaniesThisMonth || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">New companies this month</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-2xl font-bold text-red-500">
                      -{stats?.churnedThisMonth || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Churned this month</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <CardDescription>Manage platform resources</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/admin/companies">
                <Building2 className="h-5 w-5" />
                <span>Companies</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2">
              <Link href="/admin/users">
                <Users className="h-5 w-5" />
                <span>Users</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2 opacity-50" disabled>
              <Activity className="h-5 w-5" />
              <span>Audit Log</span>
              <Badge variant="secondary" className="text-[10px]">Soon</Badge>
            </Button>
            <Button variant="outline" className="h-auto py-4 flex-col gap-2 opacity-50" disabled>
              <DollarSign className="h-5 w-5" />
              <span>Billing</span>
              <Badge variant="secondary" className="text-[10px]">Soon</Badge>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
