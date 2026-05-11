'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { getSettings, saveSettings, resetAllData, getIncome, getExpenses, getJobs } from '@/lib/storage'
import { Settings as SettingsType, ProfitAllocation, Income, Expense, BusinessProfile } from '@/lib/types'
import { toast } from 'sonner'
import { exportToCSV } from '@/lib/export'
import { Trash2, Download, Building2, MapPin, Target, Receipt, Shield, Users, Bell, MessageSquare } from 'lucide-react'
import { useAuth } from '@/components/auth-provider'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions-context'
import { hasPermission } from '@/lib/permissions'

export default function SettingsPage() {
  const { user } = useAuth()
  const { membership } = usePermissions()
  const [settings, setSettings] = useState<SettingsType | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  
  // Check if user can access company settings
  const canAccessCompanySettings = membership && hasPermission(membership, 'manage_settings')
  const [profile, setProfile] = useState<BusinessProfile>({
    businessName: '',
    ownerName: '',
    phone: '',
    serviceArea: '',
    weeklyGoal: 1000,
    taxRate: 15,
  })
  const [allocation, setAllocation] = useState<ProfitAllocation>({
    profit: 40,
    expenses: 30,
    taxes: 20,
    misc: 10,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [incomeData, setIncomeData] = useState<Income[]>([])
  const [expenseData, setExpenseData] = useState<Expense[]>([])

  useEffect(() => {
    const loadData = async () => {
      const [currentSettings, income, expenses] = await Promise.all([
        getSettings(), 
        getIncome(), 
        getExpenses(),
      ])
      
      setSettings(currentSettings)
      if (currentSettings.profile) {
        setProfile(currentSettings.profile)
      }
      setAllocation(currentSettings.profitAllocation)
      setIncomeData(income)
      setExpenseData(expenses)

      // Check if user is admin
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_admin')
          .eq('id', user.id)
          .single()
        setIsAdmin(profile?.is_admin || false)
      }
    }
    loadData()
  }, [])

  const totalAllocation = allocation.profit + allocation.expenses + allocation.taxes + allocation.misc

  const handleSave = async () => {
    if (totalAllocation !== 100) {
      toast.error('Allocations must total 100%')
      return
    }
    if (!profile.businessName.trim()) {
      toast.error('Business name is required')
      return
    }

    setIsSaving(true)
    if (settings) {
      const newSettings = {
        ...settings,
        profitAllocation: allocation,
        profile: profile,
      }
      const success = await saveSettings(newSettings)
      if (success) {
        setSettings(newSettings)
        toast.success('Settings saved')
      } else {
        toast.error('Failed to save')
      }
    }
    setIsSaving(false)
  }

  const handleResetData = async () => {
    await resetAllData()
    toast.success('All data has been reset')
    window.location.reload()
  }

  const handleExport = () => {
    const success = exportToCSV(incomeData, expenseData, 'profita-export')
    if (success) {
      toast.success('Data exported')
    } else {
      toast.error('No data to export')
    }
  }

  if (!settings) return null

  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your business profile and preferences</p>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Admin</h2>
            <Link href="/admin/users">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-center justify-between hover:bg-primary/10 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">User Management</p>
                    <p className="text-sm text-muted-foreground">Approve or reject sign-up requests</p>
                  </div>
                </div>
                <Users className="h-5 w-5 text-muted-foreground" />
              </div>
            </Link>
          </section>
        )}

        {/* Company Settings - Owner/Admin only */}
        {canAccessCompanySettings && (
          <section className="mb-8">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Company</h2>
            <Link href="/settings/company">
              <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Company Settings</p>
                    <p className="text-sm text-muted-foreground">Business profile, services, pricing, invoicing</p>
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* Notifications Section */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Automations</h2>
          <Link href="/settings/notifications">
            <div className="rounded-xl border border-border bg-card p-5 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium">SMS & Email Notifications</p>
                  <p className="text-sm text-muted-foreground">Automate customer follow-ups, reminders, and alerts</p>
                </div>
              </div>
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
          </Link>
        </section>

        {/* Business Profile */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Business Profile</h2>
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                Business Name
              </Label>
              <Input
                placeholder="Your business name"
                value={profile.businessName}
                onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Service Area
              </Label>
              <Input
                placeholder="e.g., San Francisco Bay Area"
                value={profile.serviceArea}
                onChange={(e) => setProfile({ ...profile, serviceArea: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  Weekly Goal
                </Label>
                <Input
                  type="number"
                  step="100"
                  value={profile.weeklyGoal}
                  onChange={(e) => setProfile({ ...profile, weeklyGoal: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Tax Rate (%)
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="50"
                  step="0.5"
                  value={profile.taxRate}
                  onChange={(e) => setProfile({ ...profile, taxRate: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Profit Allocation */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Profit Allocation</h2>
          <div className="rounded-xl border border-border bg-card p-5 space-y-5">
            {/* Visual Bar */}
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div className="bg-success transition-all" style={{ width: `${allocation.profit}%` }} />
              <div className="bg-primary transition-all" style={{ width: `${allocation.expenses}%` }} />
              <div className="bg-warning transition-all" style={{ width: `${allocation.taxes}%` }} />
              <div className="bg-muted-foreground/50 transition-all" style={{ width: `${allocation.misc}%` }} />
            </div>

            {/* Allocation Inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  Profit
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={allocation.profit}
                    onChange={(e) => setAllocation({ ...allocation, profit: parseInt(e.target.value) || 0 })}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  Expenses
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={allocation.expenses}
                    onChange={(e) => setAllocation({ ...allocation, expenses: parseInt(e.target.value) || 0 })}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  Taxes
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={allocation.taxes}
                    onChange={(e) => setAllocation({ ...allocation, taxes: parseInt(e.target.value) || 0 })}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  Misc
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={allocation.misc}
                    onChange={(e) => setAllocation({ ...allocation, misc: parseInt(e.target.value) || 0 })}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${
              totalAllocation === 100 
                ? 'bg-success/10 text-success' 
                : 'bg-destructive/10 text-destructive'
            }`}>
              <span className="text-sm font-medium">Total</span>
              <span className="font-semibold">{totalAllocation}%</span>
            </div>
          </div>
        </section>

        {/* Save Button */}
        <Button 
          onClick={handleSave} 
          disabled={isSaving || totalAllocation !== 100 || !profile.businessName.trim()}
          className="w-full mb-8"
          size="lg"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>

        {/* Data & Danger Zone */}
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Data</h2>
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <Button 
              onClick={handleExport} 
              variant="outline" 
              className="w-full gap-2"
            >
              <Download className="h-4 w-4" />
              Export All Data
            </Button>

            <div className="border-t border-border pt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 gap-2">
                    <Trash2 className="h-4 w-4" />
                    Reset All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset all data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all your jobs, invoices, customers, and transactions. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
