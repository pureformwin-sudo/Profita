'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, MessageSquare, Mail, Send, Settings, History, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import type { NotificationSettings, NotificationType, NotificationLog } from '@/lib/types'
import { DEFAULT_TEMPLATES } from '@/lib/notification-templates'

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { label: string; description: string }> = {
  lead_followup: { label: 'Lead Follow-up', description: 'Sent when a new lead is added' },
  appointment_confirmation: { label: 'Appointment Confirmation', description: 'Sent when an appointment is booked' },
  appointment_reminder: { label: 'Appointment Reminder', description: 'Sent 24 hours before appointment' },
  appointment_missed: { label: 'Missed Appointment', description: 'Sent when customer misses an appointment' },
  invoice_sent: { label: 'Invoice Sent', description: 'Sent when invoice is created' },
  payment_reminder: { label: 'Payment Reminder', description: 'Sent 3 days before invoice due date' },
  job_completed: { label: 'Job Completed', description: 'Thank you message after job is done' },
  hot_lead_alert: { label: 'Hot Lead Alert (Owner)', description: 'Alerts owner when rep adds hot lead' },
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    smsEnabled: false,
    emailEnabled: false,
    defaultChannel: 'email',
    templates: DEFAULT_TEMPLATES,
  })
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('settings')
  const [editingTemplate, setEditingTemplate] = useState<NotificationType | null>(null)
  const [testDialog, setTestDialog] = useState<{ open: boolean; channel: 'sms' | 'email'; type: NotificationType } | null>(null)
  const [testTo, setTestTo] = useState('')
  const [showSetupBanner, setShowSetupBanner] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setIsLoading(true)
    try {
      const [settingsRes, logsRes] = await Promise.all([
        fetch('/api/notifications/settings'),
        fetch('/api/notifications/logs'),
      ])
      
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(data)
      }
      
      if (logsRes.ok) {
        const data = await logsRes.json()
        setLogs(data)
      }
    } catch (error) {
      console.error('Failed to load notification settings:', error)
    }
    setIsLoading(false)
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/notifications/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      
      if (res.ok) {
        toast.success('Settings saved')
      } else {
        toast.error('Failed to save settings')
      }
    } catch (error) {
      toast.error('Failed to save settings')
    }
    setIsSaving(false)
  }

  async function handleSendTest() {
    if (!testDialog || !testTo) return
    
    try {
      const res = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: testDialog.channel,
          to: testTo,
          type: testDialog.type,
        }),
      })
      
      const data = await res.json()
      
      if (data.success) {
        toast.success(`Test ${testDialog.channel} sent!`)
        setTestDialog(null)
        setTestTo('')
      } else {
        toast.error(data.error || 'Failed to send test')
      }
    } catch (error) {
      toast.error('Failed to send test')
    }
  }

  function updateTemplate(type: NotificationType, field: 'sms' | 'email' | 'emailSubject' | 'enabled', value: string | boolean) {
    setSettings(prev => ({
      ...prev,
      templates: {
        ...prev.templates,
        [type]: {
          ...prev.templates[type],
          [field]: value,
        },
      },
    }))
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'sent': return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />
      case 'scheduled': return <Clock className="h-4 w-4 text-blue-500" />
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-4 lg:p-6 max-w-4xl mx-auto">
          <div className="h-96 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 max-w-4xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Notifications</h1>
            <p className="text-sm text-muted-foreground">SMS and Email automation settings</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <History className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            {/* Channel Toggles */}
            <div className="border border-border rounded-lg bg-card">
              <div className="p-4 border-b border-border">
                <h2 className="font-medium">Notification Channels</h2>
                <p className="text-sm text-muted-foreground">Enable SMS and/or Email notifications</p>
              </div>
              
              <div className="divide-y divide-border">
                {/* SMS Toggle */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <MessageSquare className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">SMS Notifications</p>
                      <p className="text-xs text-muted-foreground">Send text messages via Twilio</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.smsEnabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, smsEnabled: checked })}
                  />
                </div>

                {/* Email Toggle */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-xs text-muted-foreground">Send emails via Resend</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.emailEnabled}
                    onCheckedChange={(checked) => setSettings({ ...settings, emailEnabled: checked })}
                  />
                </div>
              </div>
            </div>

            {/* Default Channel */}
            <div className="border border-border rounded-lg bg-card p-4">
              <Label className="text-sm font-medium mb-2 block">Default Channel</Label>
              <Select
                value={settings.defaultChannel}
                onValueChange={(value: any) => setSettings({ ...settings, defaultChannel: value })}
              >
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email Only</SelectItem>
                  <SelectItem value="sms">SMS Only</SelectItem>
                  <SelectItem value="both">Both SMS and Email</SelectItem>
                  <SelectItem value="none">None (Manual Only)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Used when customer has no preference set
              </p>
            </div>

            {/* Twilio SMS Settings */}
            {settings.smsEnabled && (
              <div className="border border-border rounded-lg bg-card">
                <div className="p-4 border-b border-border">
                  <h2 className="font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-blue-500" />
                    Twilio SMS Setup
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your credentials from <a href="https://console.twilio.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">console.twilio.com</a>
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm mb-2 block">Account SID</Label>
                    <Input
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={settings.twilioAccountSid || ''}
                      onChange={(e) => setSettings({ ...settings, twilioAccountSid: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-2 block">Auth Token</Label>
                    <Input
                      type="password"
                      placeholder="Your Twilio Auth Token"
                      value={settings.twilioAuthToken || ''}
                      onChange={(e) => setSettings({ ...settings, twilioAuthToken: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-2 block">Phone Number</Label>
                    <Input
                      placeholder="+1234567890"
                      value={settings.twilioPhoneNumber || ''}
                      onChange={(e) => setSettings({ ...settings, twilioPhoneNumber: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Your Twilio phone number for sending SMS (~$1/month)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Resend Email Settings */}
            {settings.emailEnabled && (
              <div className="border border-border rounded-lg bg-card">
                <div className="p-4 border-b border-border">
                  <h2 className="font-medium flex items-center gap-2">
                    <Mail className="h-4 w-4 text-purple-500" />
                    Resend Email Setup
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get your API key from <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-purple-500 underline">resend.com/api-keys</a> (free: 3,000 emails/month)
                  </p>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <Label className="text-sm mb-2 block">API Key</Label>
                    <Input
                      type="password"
                      placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={settings.resendApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, resendApiKey: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-sm mb-2 block">From Email (Optional)</Label>
                    <Input
                      type="email"
                      placeholder="notifications@yourbusiness.com"
                      value={settings.resendFromEmail || ''}
                      onChange={(e) => setSettings({ ...settings, resendFromEmail: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Requires domain verification. Leave blank to use default Resend email.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? 'Saving...' : 'Save Settings'}
            </Button>
          </TabsContent>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Customize message templates. Use {"{{variable}}"} for dynamic content.
            </p>

            {(Object.entries(NOTIFICATION_TYPE_LABELS) as [NotificationType, { label: string; description: string }][]).map(([type, { label, description }]) => (
              <div key={type} className="border border-border rounded-lg bg-card">
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.templates[type]?.enabled ?? true}
                      onCheckedChange={(checked) => updateTemplate(type, 'enabled', checked)}
                    />
                    <div>
                      <p className="font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.smsEnabled && (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setTestDialog({ open: true, channel: 'sms', type })}
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Test SMS
                          </Button>
                        </DialogTrigger>
                      </Dialog>
                    )}
                    {settings.emailEnabled && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setTestDialog({ open: true, channel: 'email', type })}
                      >
                        <Mail className="h-4 w-4 mr-1" />
                        Test Email
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditingTemplate(editingTemplate === type ? null : type)}
                    >
                      {editingTemplate === type ? 'Close' : 'Edit'}
                    </Button>
                  </div>
                </div>

                {editingTemplate === type && (
                  <div className="p-4 pt-0 space-y-4 border-t border-border mt-2">
                    {/* SMS Template */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">SMS Template (160 chars recommended)</Label>
                      <Textarea
                        value={settings.templates[type]?.sms || ''}
                        onChange={(e) => updateTemplate(type, 'sms', e.target.value)}
                        rows={3}
                        className="text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(settings.templates[type]?.sms || '').length} characters
                      </p>
                    </div>

                    {/* Email Subject */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Email Subject</Label>
                      <Input
                        value={settings.templates[type]?.emailSubject || ''}
                        onChange={(e) => updateTemplate(type, 'emailSubject', e.target.value)}
                        className="text-sm"
                      />
                    </div>

                    {/* Email Template */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">Email Body</Label>
                      <Textarea
                        value={settings.templates[type]?.email || ''}
                        onChange={(e) => updateTemplate(type, 'email', e.target.value)}
                        rows={6}
                        className="text-sm"
                      />
                    </div>

                    {/* Variables Help */}
                    <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      <p className="font-medium mb-1">Available variables:</p>
                      <p className="font-mono text-[10px]">
                        {"{{customerName}}, {{businessName}}, {{repName}}, {{date}}, {{time}}, {{address}}, {{phone}}, {{invoiceNumber}}, {{amount}}, {{dueDate}}, {{paymentLink}}, {{reviewLink}}"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? 'Saving...' : 'Save Templates'}
            </Button>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <div className="border border-border rounded-lg bg-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="font-medium">Notification History</h2>
                <p className="text-sm text-muted-foreground">All sent notifications</p>
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <History className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No notifications sent yet</p>
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {statusIcon(log.status)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm">{log.customerName}</p>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                log.channel === 'sms' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'
                              }`}>
                                {log.channel.toUpperCase()}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                                {NOTIFICATION_TYPE_LABELS[log.type as NotificationType]?.label || log.type}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {log.channel === 'sms' ? log.customerPhone : log.customerEmail}
                              {log.repName && ` • Rep: ${log.repName}`}
                            </p>
                            <p className="text-xs text-muted-foreground/70 mt-1 line-clamp-2">
                              {log.message}
                            </p>
                            {log.errorMessage && (
                              <p className="text-xs text-red-500 mt-1">{log.errorMessage}</p>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.sentAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Test Dialog */}
        <Dialog open={!!testDialog} onOpenChange={(open) => !open && setTestDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Send Test {testDialog?.channel === 'sms' ? 'SMS' : 'Email'}
              </DialogTitle>
              <DialogDescription>
                Send a test notification using the {testDialog?.type && NOTIFICATION_TYPE_LABELS[testDialog.type]?.label} template
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <Label className="text-sm mb-1 block">
                  {testDialog?.channel === 'sms' ? 'Phone Number' : 'Email Address'}
                </Label>
                <Input
                  placeholder={testDialog?.channel === 'sms' ? '+1234567890' : 'you@example.com'}
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTestDialog(null)}>Cancel</Button>
              <Button onClick={handleSendTest} disabled={!testTo} className="gap-2">
                <Send className="h-4 w-4" />
                Send Test
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
