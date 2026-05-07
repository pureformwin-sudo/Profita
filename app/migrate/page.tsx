'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, CheckCircle2, Database, Loader2 } from 'lucide-react'

interface OldIncome {
  id: string
  amount: number
  date: string
  customerName: string
  jobType: string
  paymentMethod: string
  notes?: string
  createdAt: string
}

interface OldExpense {
  id: string
  amount: number
  date: string
  category: string
  description: string
  paymentMethod: string
  notes?: string
  createdAt: string
}

interface OldPendingIncome {
  id: string
  clientName: string
  amount: number
  source: string
  status: string
  expectedDate: string
  notes?: string
  createdAt: string
}

interface OldUpcomingExpense {
  id: string
  name: string
  amount: number
  category: string
  dueDate: string
  status: string
  notes?: string
  createdAt: string
}

export default function MigratePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [migrated, setMigrated] = useState(false)
  
  // Old localStorage data
  const [oldIncome, setOldIncome] = useState<OldIncome[]>([])
  const [oldExpenses, setOldExpenses] = useState<OldExpense[]>([])
  const [oldPending, setOldPending] = useState<OldPendingIncome[]>([])
  const [oldUpcoming, setOldUpcoming] = useState<OldUpcomingExpense[]>([])

  useEffect(() => {
    const supabase = createClient()
    
    // Check if user is logged in
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      
      // Load old localStorage data
      const income = localStorage.getItem('pureform_income')
      const expenses = localStorage.getItem('pureform_expenses')
      const pending = localStorage.getItem('pureform_pending_income')
      const upcoming = localStorage.getItem('pureform_upcoming_expenses')
      
      if (income) setOldIncome(JSON.parse(income))
      if (expenses) setOldExpenses(JSON.parse(expenses))
      if (pending) setOldPending(JSON.parse(pending))
      if (upcoming) setOldUpcoming(JSON.parse(upcoming))
      
      setLoading(false)
    })
  }, [router])

  const totalItems = oldIncome.length + oldExpenses.length + oldPending.length + oldUpcoming.length
  const totalIncomeAmount = oldIncome.reduce((sum, i) => sum + i.amount, 0)
  const totalExpenseAmount = oldExpenses.reduce((sum, e) => sum + e.amount, 0)

  const handleMigrate = async () => {
    if (!user) return
    
    setMigrating(true)
    const supabase = createClient()
    
    try {
      // Migrate income
      if (oldIncome.length > 0) {
        const incomeData = oldIncome.map(i => ({
          user_id: user.id,
          amount: i.amount,
          date: i.date,
          customer_name: i.customerName,
          job_type: i.jobType,
          payment_method: i.paymentMethod,
          notes: i.notes || null,
          created_at: i.createdAt,
        }))
        
        const { error } = await supabase.from('income').insert(incomeData)
        if (error) throw error
      }
      
      // Migrate expenses
      if (oldExpenses.length > 0) {
        const expenseData = oldExpenses.map(e => ({
          user_id: user.id,
          amount: e.amount,
          date: e.date,
          category: e.category,
          description: e.description,
          payment_method: e.paymentMethod,
          notes: e.notes || null,
          created_at: e.createdAt,
        }))
        
        const { error } = await supabase.from('expenses').insert(expenseData)
        if (error) throw error
      }
      
      // Migrate pending income
      if (oldPending.length > 0) {
        const pendingData = oldPending.map(p => ({
          user_id: user.id,
          client_name: p.clientName,
          amount: p.amount,
          source: p.source,
          status: p.status,
          expected_date: p.expectedDate,
          notes: p.notes || null,
          created_at: p.createdAt,
        }))
        
        const { error } = await supabase.from('pending_income').insert(pendingData)
        if (error) throw error
      }
      
      // Migrate upcoming expenses
      if (oldUpcoming.length > 0) {
        const upcomingData = oldUpcoming.map(u => ({
          user_id: user.id,
          name: u.name,
          amount: u.amount,
          category: u.category,
          due_date: u.dueDate,
          status: u.status,
          notes: u.notes || null,
          created_at: u.createdAt,
        }))
        
        const { error } = await supabase.from('upcoming_expenses').insert(upcomingData)
        if (error) throw error
      }
      
      // Clear old localStorage data after successful migration
      localStorage.removeItem('pureform_income')
      localStorage.removeItem('pureform_expenses')
      localStorage.removeItem('pureform_pending_income')
      localStorage.removeItem('pureform_upcoming_expenses')
      localStorage.removeItem('pureform_settings')
      localStorage.removeItem('pureform_users')
      localStorage.removeItem('pureform_current_user')
      
      setMigrated(true)
      toast.success('Data migrated successfully!')
      
    } catch (error: any) {
      console.error('Migration error:', error)
      toast.error('Migration failed: ' + error.message)
    } finally {
      setMigrating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (migrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Migration Complete!</CardTitle>
            <CardDescription>
              All your data has been transferred to your new account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              onClick={() => router.push('/')}
            >
              Go to Dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
            <Database className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Migrate Your Data</CardTitle>
          <CardDescription>
            Transfer your existing data to your new cloud account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {totalItems === 0 ? (
            <div className="text-center py-4">
              <p className="text-muted-foreground">No old data found to migrate.</p>
              <Button 
                className="mt-4" 
                onClick={() => router.push('/')}
              >
                Go to Dashboard
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Data Found</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-green-600">{oldIncome.length}</p>
                    <p className="text-sm text-muted-foreground">Income Records</p>
                    <p className="text-xs text-muted-foreground">${totalIncomeAmount.toLocaleString()}</p>
                  </div>
                  
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-red-600">{oldExpenses.length}</p>
                    <p className="text-sm text-muted-foreground">Expense Records</p>
                    <p className="text-xs text-muted-foreground">${totalExpenseAmount.toLocaleString()}</p>
                  </div>
                  
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-blue-600">{oldPending.length}</p>
                    <p className="text-sm text-muted-foreground">Pending Income</p>
                  </div>
                  
                  <div className="rounded-lg border p-3">
                    <p className="text-2xl font-bold text-orange-600">{oldUpcoming.length}</p>
                    <p className="text-sm text-muted-foreground">Upcoming Expenses</p>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  This will transfer all {totalItems} records to your cloud account. 
                  After migration, your data will be accessible from any device.
                </p>
              </div>
              
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => router.push('/')}
                >
                  Skip for Now
                </Button>
                <Button 
                  className="flex-1"
                  onClick={handleMigrate}
                  disabled={migrating}
                >
                  {migrating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      Migrate Data
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
