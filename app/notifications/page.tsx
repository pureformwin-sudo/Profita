'use client'

import { useState, useEffect, useCallback } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Bell, CheckCircle, Clock, Briefcase, Receipt, FileText, 
  User, Calendar, Users, CreditCard, TrendingUp, Sparkles,
  Check, Trash2, MoreHorizontal, ChevronRight, AlertCircle,
  DollarSign, RefreshCw, Wallet, UserPlus, Send, Play,
  ExternalLink, Eye, PlusCircle, ArrowRight
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  getInAppNotifications, 
  markNotificationRead, 
  markAllNotificationsRead,
  clearReadNotifications,
  deleteNotification,
  generateSmartReminders,
} from '@/lib/in-app-notifications'
import { getJobs, getInvoices, getEstimates, getCustomers } from '@/lib/storage'
import type { InAppNotification, InAppNotificationCategory, InAppNotificationType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

const CATEGORY_ICONS: Record<InAppNotificationCategory, React.ReactNode> = {
  job: <Briefcase className="h-4 w-4" />,
  invoice: <Receipt className="h-4 w-4" />,
  payment: <DollarSign className="h-4 w-4" />,
  estimate: <FileText className="h-4 w-4" />,
  customer: <User className="h-4 w-4" />,
  schedule: <Calendar className="h-4 w-4" />,
  team: <Users className="h-4 w-4" />,
  plan: <CreditCard className="h-4 w-4" />,
  ai: <Sparkles className="h-4 w-4" />,
  system: <Bell className="h-4 w-4" />,
}

const CATEGORY_COLORS: Record<InAppNotificationCategory, string> = {
  job: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  invoice: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  payment: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
  estimate: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  customer: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
  schedule: 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',
  team: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
  plan: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
  ai: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  system: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

const CATEGORY_LABELS: Record<InAppNotificationCategory, string> = {
  job: 'Jobs',
  invoice: 'Invoices',
  payment: 'Payments',
  estimate: 'Estimates',
  customer: 'Customers',
  schedule: 'Schedule',
  team: 'Team',
  plan: 'Plans',
  ai: 'AI Insights',
  system: 'System',
}

// Get action buttons based on notification type
function getNotificationActions(notification: InAppNotification): { label: string; icon: React.ReactNode; href: string }[] {
  const actions: { label: string; icon: React.ReactNode; href: string }[] = []

  switch (notification.type as InAppNotificationType) {
    case 'invoice_paid':
      if (notification.invoiceId) actions.push({ label: 'View Invoice', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?view=${notification.invoiceId}` })
      if (notification.customerId) actions.push({ label: 'View Customer', icon: <User className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      break
    case 'invoice_created':
      if (notification.invoiceId) actions.push({ label: 'View Invoice', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?view=${notification.invoiceId}` })
      if (notification.invoiceId) actions.push({ label: 'Send Invoice', icon: <Send className="h-3.5 w-3.5" />, href: `/invoices?send=${notification.invoiceId}` })
      break
    case 'invoice_overdue':
      if (notification.invoiceId) actions.push({ label: 'View Invoice', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?view=${notification.invoiceId}` })
      if (notification.customerId) actions.push({ label: 'Contact Customer', icon: <User className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      break
    case 'job_created':
    case 'job_scheduled':
    case 'schedule_job_reminder':
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Eye className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      if (notification.jobId) actions.push({ label: 'Start Job', icon: <Play className="h-3.5 w-3.5" />, href: `/jobs?start=${notification.jobId}` })
      break
    case 'job_starting_soon':
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Eye className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      if (notification.jobId) actions.push({ label: 'Start Now', icon: <Play className="h-3.5 w-3.5" />, href: `/jobs?start=${notification.jobId}` })
      break
    case 'job_completed':
    case 'job_needs_invoice':
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Eye className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      if (notification.jobId) actions.push({ label: 'Create Invoice', icon: <Receipt className="h-3.5 w-3.5" />, href: `/invoices?fromJob=${notification.jobId}` })
      break
    case 'job_overdue':
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Eye className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      if (notification.jobId) actions.push({ label: 'Reschedule', icon: <Calendar className="h-3.5 w-3.5" />, href: `/jobs?edit=${notification.jobId}` })
      break
    case 'estimate_created':
      if (notification.estimateId) actions.push({ label: 'View Estimate', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?tab=estimates&view=${notification.estimateId}` })
      if (notification.estimateId) actions.push({ label: 'Send Estimate', icon: <Send className="h-3.5 w-3.5" />, href: `/invoices?tab=estimates&send=${notification.estimateId}` })
      break
    case 'estimate_accepted':
    case 'estimate_ready_to_convert':
      if (notification.estimateId) actions.push({ label: 'View Estimate', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?tab=estimates&view=${notification.estimateId}` })
      if (notification.estimateId) actions.push({ label: 'Convert to Job', icon: <ArrowRight className="h-3.5 w-3.5" />, href: `/jobs?fromEstimate=${notification.estimateId}` })
      break
    case 'estimate_needs_followup':
      if (notification.estimateId) actions.push({ label: 'View Estimate', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?tab=estimates&view=${notification.estimateId}` })
      if (notification.customerId) actions.push({ label: 'Contact Customer', icon: <User className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      break
    case 'payment_received':
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Briefcase className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      if (notification.customerId) actions.push({ label: 'View Customer', icon: <User className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      break
    case 'payment_needs_deposit':
      actions.push({ label: 'View Finances', icon: <DollarSign className="h-3.5 w-3.5" />, href: '/finances' })
      break
    case 'customer_added':
    case 'customer_due_followup':
      if (notification.customerId) actions.push({ label: 'View Customer', icon: <Eye className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      if (notification.customerId) actions.push({ label: 'Create Job', icon: <PlusCircle className="h-3.5 w-3.5" />, href: `/jobs?customerId=${notification.customerId}&action=new` })
      break
    case 'ai_upsell_opportunity':
    case 'ai_repeat_service_due':
      if (notification.customerId) actions.push({ label: 'Create Estimate', icon: <FileText className="h-3.5 w-3.5" />, href: `/invoices?customerId=${notification.customerId}&action=estimate` })
      if (notification.customerId) actions.push({ label: 'View Customer', icon: <User className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      break
    case 'schedule_today_summary':
      actions.push({ label: 'View Schedule', icon: <Calendar className="h-3.5 w-3.5" />, href: '/calendar' })
      actions.push({ label: 'View Jobs', icon: <Briefcase className="h-3.5 w-3.5" />, href: '/jobs' })
      break
    case 'team_worker_assigned':
    case 'team_worker_completed':
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Eye className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      actions.push({ label: 'View Team', icon: <Users className="h-3.5 w-3.5" />, href: '/team' })
      break
    case 'plan_renewal_upcoming':
      if (notification.customerId) actions.push({ label: 'View Customer', icon: <User className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
      actions.push({ label: 'View Plans', icon: <CreditCard className="h-3.5 w-3.5" />, href: '/plans' })
      break
    default:
      // Generic fallbacks based on linked records
      if (notification.jobId) actions.push({ label: 'View Job', icon: <Eye className="h-3.5 w-3.5" />, href: `/jobs?view=${notification.jobId}` })
      else if (notification.invoiceId) actions.push({ label: 'View Invoice', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?view=${notification.invoiceId}` })
      else if (notification.estimateId) actions.push({ label: 'View Estimate', icon: <Eye className="h-3.5 w-3.5" />, href: `/invoices?tab=estimates&view=${notification.estimateId}` })
      else if (notification.customerId) actions.push({ label: 'View Customer', icon: <Eye className="h-3.5 w-3.5" />, href: `/customers?view=${notification.customerId}` })
  }

  return actions.slice(0, 2) // Max 2 actions
}

// Get primary navigation target for clicking the notification
function getNotificationHref(notification: InAppNotification): string | null {
  // Priority: job > invoice > estimate > customer > category page
  if (notification.jobId) return `/jobs?view=${notification.jobId}`
  if (notification.invoiceId) return `/invoices?view=${notification.invoiceId}`
  if (notification.estimateId) return `/invoices?tab=estimates&view=${notification.estimateId}`
  if (notification.customerId) return `/customers?view=${notification.customerId}`
  
  // Fallback to category pages
  switch (notification.category) {
    case 'schedule': return '/calendar'
    case 'team': return '/team'
    case 'plan': return '/plans'
    case 'ai': return '/ai-growth'
    case 'payment': return '/finances'
    default: return null
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const router = useRouter()

  const loadNotifications = useCallback(async () => {
    setIsLoading(true)
    const data = await getInAppNotifications()
    setNotifications(data)
    setIsLoading(false)
  }, [])

  // Generate smart reminders on page load (once per session)
  useEffect(() => {
    const lastCheck = sessionStorage.getItem('profita:lastNotificationCheck')
    const today = new Date().toDateString()
    
    if (lastCheck !== today) {
      // Generate reminders in background
      Promise.all([getJobs(), getInvoices(), getEstimates(), getCustomers()])
        .then(([jobs, invoices, estimates, customers]) => {
          generateSmartReminders({ jobs, invoices, estimates, customers })
            .then(() => {
              sessionStorage.setItem('profita:lastNotificationCheck', today)
              loadNotifications() // Reload to show new reminders
            })
        })
    }
    
    loadNotifications()
  }, [loadNotifications])

  const unreadCount = notifications.filter(n => !n.read).length
  const readCount = notifications.filter(n => n.read).length

  const filteredNotifications = activeTab === 'all' 
    ? notifications 
    : activeTab === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications.filter(n => n.category === activeTab)

  async function handleMarkRead(notification: InAppNotification) {
    if (notification.read) return
    await markNotificationRead(notification.id)
    setNotifications(prev => prev.map(n => 
      n.id === notification.id ? { ...n, read: true } : n
    ))
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    toast.success('All notifications marked as read')
  }

  async function handleClearRead() {
    await clearReadNotifications()
    setNotifications(prev => prev.filter(n => !n.read))
    toast.success('Cleared read notifications')
  }

  async function handleDelete(notificationId: string) {
    await deleteNotification(notificationId)
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  function handleNotificationClick(notification: InAppNotification) {
    // Mark as read immediately
    handleMarkRead(notification)
    
    // Navigate to related record
    const href = getNotificationHref(notification)
    if (href) {
      router.push(href)
    } else {
      toast.info('No related record to view')
    }
  }

  function handleActionClick(e: React.MouseEvent, notification: InAppNotification, href: string) {
    e.stopPropagation()
    handleMarkRead(notification)
    router.push(href)
  }

  function formatTimeAgo(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Group notifications by date
  const groupedNotifications = filteredNotifications.reduce((groups, notification) => {
    const date = new Date(notification.createdAt)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let key: string
    if (date.toDateString() === today.toDateString()) {
      key = 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = 'Yesterday'
    } else {
      key = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
    }

    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(notification)
    return groups
  }, {} as Record<string, InAppNotification[]>)

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Notifications</h1>
              <p className="text-sm text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleMarkAllRead} disabled={unreadCount === 0}>
                <Check className="h-4 w-4 mr-2" /> Mark all as read
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearRead} disabled={readCount === 0} className="text-red-500">
                <Trash2 className="h-4 w-4 mr-2" /> Clear read notifications
              </DropdownMenuItem>
              <DropdownMenuItem onClick={loadNotifications}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full h-auto p-1 flex flex-wrap gap-1">
            <TabsTrigger value="all" className="text-xs flex-1 min-w-[60px]">
              All
              {notifications.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{notifications.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs flex-1 min-w-[60px]">
              Unread
              {unreadCount > 0 && (
                <Badge className="ml-1 text-[10px] px-1.5 bg-primary">{unreadCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="job" className="text-xs flex-1 min-w-[60px]">Jobs</TabsTrigger>
            <TabsTrigger value="invoice" className="text-xs flex-1 min-w-[60px]">Invoices</TabsTrigger>
            <TabsTrigger value="payment" className="text-xs flex-1 min-w-[60px]">Payments</TabsTrigger>
            <TabsTrigger value="ai" className="text-xs flex-1 min-w-[60px]">AI</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Bell className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold mb-1">No notifications</h3>
                  <p className="text-sm text-muted-foreground">
                    {activeTab === 'unread' 
                      ? "You're all caught up!" 
                      : "Nothing here yet. Notifications will appear as you use Profita."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedNotifications).map(([dateGroup, notifs]) => (
                  <div key={dateGroup}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">{dateGroup}</h3>
                    <Card>
                      <CardContent className="p-0 divide-y divide-border">
                        {notifs.map(notification => {
                          const actions = getNotificationActions(notification)
                          
                          return (
                            <div
                              key={notification.id}
                              className={cn(
                                "flex flex-col gap-2 p-4 hover:bg-muted/50 transition-colors cursor-pointer",
                                !notification.read && "bg-primary/5"
                              )}
                              onClick={() => handleNotificationClick(notification)}
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                                  CATEGORY_COLORS[notification.category]
                                )}>
                                  {CATEGORY_ICONS[notification.category]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className={cn(
                                      "text-sm",
                                      !notification.read && "font-semibold"
                                    )}>
                                      {notification.title}
                                    </p>
                                    {!notification.read && (
                                      <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground line-clamp-2">
                                    {notification.message}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-muted-foreground">
                                      {formatTimeAgo(notification.createdAt)}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] px-1.5">
                                      {CATEGORY_LABELS[notification.category]}
                                    </Badge>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleDelete(notification.id)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                </div>
                              </div>

                              {/* Action Buttons */}
                              {actions.length > 0 && (
                                <div className="flex gap-2 ml-12">
                                  {actions.map((action, idx) => (
                                    <Button
                                      key={idx}
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs gap-1.5"
                                      onClick={(e) => handleActionClick(e, notification, action.href)}
                                    >
                                      {action.icon}
                                      {action.label}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
