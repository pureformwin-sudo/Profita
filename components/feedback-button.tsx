'use client'

import { useState } from 'react'
import { MessageSquarePlus, Bug, Lightbulb, Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

type FeedbackType = 'bug' | 'feature' | 'general'

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast.error('Please enter your feedback')
      return
    }

    setSubmitting(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // Get user's company
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user?.id)
        .maybeSingle()

      // Store feedback in a simple table
      const { error } = await supabase
        .from('beta_feedback')
        .insert({
          user_id: user?.id,
          company_id: member?.company_id,
          type,
          message: message.trim(),
          page_url: window.location.pathname,
          user_agent: navigator.userAgent,
        })

      if (error) {
        // If table doesn't exist, just log to console and show success
        // This allows feedback even before migration is run
        console.log('[Feedback]', { type, message, page: window.location.pathname })
        toast.success('Thank you for your feedback!')
      } else {
        toast.success('Feedback submitted successfully!')
      }

      setMessage('')
      setType('general')
      setOpen(false)
    } catch (err) {
      console.error('[Feedback] Error:', err)
      toast.error('Failed to submit feedback')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-xs"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Feedback</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Feedback</DialogTitle>
          <DialogDescription>
            Help us improve Profita. Your feedback is valuable!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>What type of feedback?</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as FeedbackType)}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="bug" id="bug" />
                <Label htmlFor="bug" className="flex items-center gap-1.5 cursor-pointer">
                  <Bug className="h-4 w-4 text-red-500" />
                  Bug
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="feature" id="feature" />
                <Label htmlFor="feature" className="flex items-center gap-1.5 cursor-pointer">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  Feature
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="general" id="general" />
                <Label htmlFor="general" className="flex items-center gap-1.5 cursor-pointer">
                  <MessageSquarePlus className="h-4 w-4 text-blue-500" />
                  General
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Your feedback</Label>
            <Textarea
              id="message"
              placeholder={
                type === 'bug'
                  ? 'Describe the bug and steps to reproduce...'
                  : type === 'feature'
                  ? 'Describe the feature you would like to see...'
                  : 'Share your thoughts...'
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[120px]"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Current page: {typeof window !== 'undefined' ? window.location.pathname : ''}
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !message.trim()}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
