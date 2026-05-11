'use client'

import { useState } from 'react'
import { ExternalLink, Copy, Check, Link2, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { generatePortalToken } from '@/lib/portal-storage'

interface CustomerPortalLinkProps {
  customerId: string
  customerName: string
}

export function CustomerPortalLink({ customerId, customerName }: CustomerPortalLinkProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [portalLink, setPortalLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const generateLink = async () => {
    setLoading(true)
    try {
      const result = await generatePortalToken(customerId, 365)
      if (result.token) {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        const link = `${baseUrl}/portal?token=${result.token}`
        setPortalLink(link)
      } else {
        toast.error(result.error || 'Failed to generate link')
      }
    } catch (err) {
      console.error('Error generating portal link:', err)
      toast.error('Failed to generate portal link')
    } finally {
      setLoading(false)
    }
  }

  const copyLink = async () => {
    if (!portalLink) return
    
    try {
      await navigator.clipboard.writeText(portalLink)
      setCopied(true)
      toast.success('Link copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      toast.error('Failed to copy link')
    }
  }

  const openLink = () => {
    if (portalLink) {
      window.open(portalLink, '_blank')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-auto py-3 flex-col gap-1">
          <Link2 className="h-4 w-4" />
          <span className="text-xs">Portal</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customer Portal Link</DialogTitle>
          <DialogDescription>
            Generate a secure access link for {customerName} to view their estimates, invoices, and service history.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!portalLink ? (
            <div className="text-center py-6">
              <Link2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-4">
                Generate a unique link that allows {customerName} to access their customer portal.
              </p>
              <Button onClick={generateLink} disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                Generate Portal Link
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Portal Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={portalLink}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyLink}
                    title="Copy link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={openLink}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Portal
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={generateLink}
                  disabled={loading}
                  title="Generate new link"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                This link is valid for 1 year. Share it with your customer via email or text.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
