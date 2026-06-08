"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Loader2, Send, Copy, ExternalLink, FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { generateCompletionReport, getCompletionReport } from "@/lib/job-photos-storage"

interface CompletionReportDialogProps {
  jobId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CompletionReportDialog({ jobId, open, onOpenChange }: CompletionReportDialogProps) {
  const [technicianNotes, setTechnicianNotes] = useState("")
  const [thankYouMessage, setThankYouMessage] = useState("")
  const [send, setSend] = useState(true)
  const [channel, setChannel] = useState<"email" | "sms" | "both">("both")
  const [submitting, setSubmitting] = useState(false)
  const [reportUrl, setReportUrl] = useState<string | null>(null)

  useEffect(() => {
    if (open && jobId) {
      setReportUrl(null)
      getCompletionReport(jobId).then((r) => {
        if (r) {
          setTechnicianNotes(r.technician_notes || "")
          setThankYouMessage(r.thank_you_message || "")
          if (r.report_url) setReportUrl(r.report_url)
        }
      })
    }
  }, [open, jobId])

  const handleSubmit = async () => {
    if (!jobId) return
    setSubmitting(true)
    try {
      const result = await generateCompletionReport({
        jobId,
        technicianNotes: technicianNotes.trim() || undefined,
        thankYouMessage: thankYouMessage.trim() || undefined,
        send,
        channel,
      })
      setReportUrl(result.reportUrl)

      if (send) {
        const e = result.sent.email
        const s = result.sent.sms
        if (e?.success || s?.success) {
          toast.success("Report generated and sent to the customer")
        } else if (e?.error || s?.error) {
          toast.warning(`Report saved, but sending failed: ${e?.error || s?.error}`)
        } else {
          toast.success("Report generated. Enable email/SMS in Notification Settings to auto-send.")
        }
      } else {
        toast.success("Report generated")
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to generate report")
    } finally {
      setSubmitting(false)
    }
  }

  const copyLink = () => {
    if (!reportUrl) return
    navigator.clipboard.writeText(reportUrl)
    toast.success("Report link copied")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-primary" />
            Completion Report
          </DialogTitle>
          <DialogDescription>
            Generate a shareable report with before & after photos for the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tech-notes">Technician notes</Label>
            <Textarea
              id="tech-notes"
              value={technicianNotes}
              onChange={(e) => setTechnicianNotes(e.target.value)}
              placeholder="Summary of work performed, recommendations, etc."
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="thank-you">Thank-you message</Label>
            <Textarea
              id="thank-you"
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              placeholder="A personal note to the customer (optional)"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Send to customer</p>
              <p className="text-xs text-muted-foreground">Deliver the report link automatically</p>
            </div>
            <Switch checked={send} onCheckedChange={setSend} />
          </div>

          {send && (
            <div className="space-y-1.5">
              <Label>Delivery channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Email & SMS</SelectItem>
                  <SelectItem value="email">Email only</SelectItem>
                  <SelectItem value="sms">SMS only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {reportUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
              <span className="flex-1 truncate text-xs text-muted-foreground">{reportUrl}</span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyLink} aria-label="Copy link">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" asChild>
                <a href={reportUrl} target="_blank" rel="noreferrer" aria-label="Open report">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1.5 h-4 w-4" />
            )}
            {reportUrl ? "Update & resend" : send ? "Generate & send" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
