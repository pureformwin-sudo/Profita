'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { MessageSquare, Mail, Bell, Send, Loader2 } from 'lucide-react'
import type { NotificationType } from '@/lib/types'

interface NotificationActionsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: {
    id: string
    name: string
    phone?: string
    email?: string
    address?: string
  }
  repName?: string
  type: 'lead_created' | 'appointment_booked' | 'job_completed' | 'invoice_sent'
  businessName?: string
  jobDate?: string
  jobTime?: string
  invoiceNumber?: string
  invoiceAmount?: string
  onComplete?: () => void
}

export function NotificationActionsDialog({
  open,
  onOpenChange,
  customer,
  repName,
  type,
  businessName = 'Our Company',
  jobDate,
  jobTime,
  invoiceNumber,
  invoiceAmount,
  onComplete,
}: NotificationActionsProps) {
  const [sending, setSending] = useState(false)
  const [actions, setActions] = useState({
    sendFollowUp: type === 'lead_created',
    sendConfirmation: type === 'appointment_booked',
    sendInvoice: type === 'invoice_sent',
    sendThankYou: type === 'job_completed',
    notifyOwner: false,
  })

  const canSendSms = !!customer.phone
  const canSendEmail = !!customer.email

  const handleSend = async () => {
    setSending(true)
    
    const variables = {
      customerName: customer.name,
      businessName,
      repName: repName || 'Our Team',
      address: customer.address,
      date: jobDate,
      time: jobTime,
      invoiceNumber,
      amount: invoiceAmount,
      customerPhone: customer.phone,
      customerEmail: customer.email,
    }

    const notifications: { type: NotificationType; desc: string }[] = []

    if (actions.sendFollowUp) {
      notifications.push({ type: 'lead_followup', desc: 'follow-up' })
    }
    if (actions.sendConfirmation) {
      notifications.push({ type: 'appointment_confirmation', desc: 'confirmation' })
    }
    if (actions.sendInvoice) {
      notifications.push({ type: 'invoice_sent', desc: 'invoice' })
    }
    if (actions.sendThankYou) {
      notifications.push({ type: 'job_completed', desc: 'thank you' })
    }
    if (actions.notifyOwner) {
      notifications.push({ type: 'hot_lead_alert', desc: 'owner alert' })
    }

    let successCount = 0
    let failCount = 0

    for (const notif of notifications) {
      try {
        const res = await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerEmail: customer.email,
            type: notif.type,
            variables,
            repName,
          }),
        })
        
        const data = await res.json()
        if (data.success) {
          successCount++
        } else {
          failCount++
        }
      } catch (error) {
        failCount++
      }
    }

    setSending(false)

    if (successCount > 0) {
      toast.success(`Sent ${successCount} notification${successCount > 1 ? 's' : ''}`)
    }
    if (failCount > 0) {
      toast.error(`Failed to send ${failCount} notification${failCount > 1 ? 's' : ''}`)
    }

    onOpenChange(false)
    onComplete?.()
  }

  const handleSkip = () => {
    onOpenChange(false)
    onComplete?.()
  }

  const getTitle = () => {
    switch (type) {
      case 'lead_created': return 'Send Follow-up?'
      case 'appointment_booked': return 'Send Confirmation?'
      case 'invoice_sent': return 'Send Invoice Notification?'
      case 'job_completed': return 'Send Thank You?'
      default: return 'Send Notification?'
    }
  }

  const getDescription = () => {
    switch (type) {
      case 'lead_created': return `Send an instant follow-up to ${customer.name}`
      case 'appointment_booked': return `Confirm the appointment with ${customer.name}`
      case 'invoice_sent': return `Notify ${customer.name} about their invoice`
      case 'job_completed': return `Send a thank you message to ${customer.name}`
      default: return `Notify ${customer.name}`
    }
  }

  const hasAnyAction = Object.values(actions).some(v => v)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Contact methods available */}
          <div className="flex items-center gap-4 text-sm">
            <div className={`flex items-center gap-1.5 ${canSendSms ? 'text-blue-500' : 'text-muted-foreground'}`}>
              <MessageSquare className="h-4 w-4" />
              <span>{canSendSms ? customer.phone : 'No phone'}</span>
            </div>
            <div className={`flex items-center gap-1.5 ${canSendEmail ? 'text-purple-500' : 'text-muted-foreground'}`}>
              <Mail className="h-4 w-4" />
              <span>{canSendEmail ? 'Email' : 'No email'}</span>
            </div>
          </div>

          {/* Action checkboxes */}
          <div className="space-y-3">
            {type === 'lead_created' && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="followup"
                  checked={actions.sendFollowUp}
                  onCheckedChange={(checked) => setActions(prev => ({ ...prev, sendFollowUp: !!checked }))}
                  disabled={!canSendSms && !canSendEmail}
                />
                <Label htmlFor="followup" className="text-sm font-normal cursor-pointer">
                  Send instant follow-up message
                </Label>
              </div>
            )}

            {type === 'appointment_booked' && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="confirmation"
                  checked={actions.sendConfirmation}
                  onCheckedChange={(checked) => setActions(prev => ({ ...prev, sendConfirmation: !!checked }))}
                  disabled={!canSendSms && !canSendEmail}
                />
                <Label htmlFor="confirmation" className="text-sm font-normal cursor-pointer">
                  Send appointment confirmation
                </Label>
              </div>
            )}

            {type === 'invoice_sent' && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="invoice"
                  checked={actions.sendInvoice}
                  onCheckedChange={(checked) => setActions(prev => ({ ...prev, sendInvoice: !!checked }))}
                  disabled={!canSendSms && !canSendEmail}
                />
                <Label htmlFor="invoice" className="text-sm font-normal cursor-pointer">
                  Send invoice notification
                </Label>
              </div>
            )}

            {type === 'job_completed' && (
              <div className="flex items-center gap-3">
                <Checkbox
                  id="thankyou"
                  checked={actions.sendThankYou}
                  onCheckedChange={(checked) => setActions(prev => ({ ...prev, sendThankYou: !!checked }))}
                  disabled={!canSendSms && !canSendEmail}
                />
                <Label htmlFor="thankyou" className="text-sm font-normal cursor-pointer">
                  Send thank you / review request
                </Label>
              </div>
            )}

            {/* Always show owner alert option for lead creation */}
            {type === 'lead_created' && (
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <Checkbox
                  id="owner"
                  checked={actions.notifyOwner}
                  onCheckedChange={(checked) => setActions(prev => ({ ...prev, notifyOwner: !!checked }))}
                />
                <Label htmlFor="owner" className="text-sm font-normal cursor-pointer">
                  Alert owner (hot lead)
                </Label>
              </div>
            )}
          </div>

          {!canSendSms && !canSendEmail && (
            <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
              Add a phone number or email to send notifications
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleSkip} disabled={sending}>
            Skip
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={sending || !hasAnyAction || (!canSendSms && !canSendEmail)}
            className="gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
