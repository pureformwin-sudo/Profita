'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle } from 'lucide-react'
import Image from 'next/image'

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'accepted'

interface InviteData {
  id: string
  email: string
  name: string
  role: string
  companyName: string
}

export default function InvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [inviteData, setInviteData] = useState<InviteData | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  useEffect(() => {
    validateInvite()
  }, [token])
  
  const validateInvite = async () => {
    const supabase = createClient()
    
    // Look up the invite by token
    const { data, error } = await supabase
      .rpc('get_invite_by_token', { p_token: token })
    
    // RPC returns an array, get the first row
    const invite = Array.isArray(data) ? data[0] : data
    
    if (error || !invite) {
      console.error('Error validating invite:', error)
      setStatus('invalid')
      return
    }
    
    if (invite.status === 'active') {
      setStatus('accepted')
      return
    }
    
    if (invite.status !== 'invited') {
      setStatus('expired')
      return
    }
    
    setInviteData({
      id: invite.id,
      email: invite.email,
      name: invite.name,
      role: invite.role,
      companyName: invite.company_name,
    })
    setStatus('valid')
  }
  
  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    
    setIsSubmitting(true)
    
    try {
      const supabase = createClient()
      
      // Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteData!.email,
        password: password,
        options: {
          data: {
            full_name: inviteData!.name,
          },
        },
      })
      
      if (authError) {
        // If user already exists, try to sign in
        if (authError.message.includes('already registered')) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: inviteData!.email,
            password: password,
          })
          
          if (signInError) {
            toast.error('Account exists. Please sign in with your existing password.')
            setIsSubmitting(false)
            return
          }
        } else {
          throw authError
        }
      }
      
      // Accept the invite (links user_id to company_member)
      const { error: acceptError } = await supabase
        .rpc('accept_invite', { p_token: token })
      
      if (acceptError) {
        console.error('Error accepting invite:', acceptError)
        toast.error('Failed to accept invite')
        setIsSubmitting(false)
        return
      }
      
      toast.success('Welcome to the team!')
      router.push('/')
    } catch (error: any) {
      console.error('Error accepting invite:', error)
      toast.error(error.message || 'Failed to accept invite')
    } finally {
      setIsSubmitting(false)
    }
  }
  
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validating invite...</p>
        </div>
      </div>
    )
  }
  
  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>
              This invite link is invalid or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <CardTitle>Invite Expired</CardTitle>
            <CardDescription>
              This invite has expired. Please ask your team admin for a new invite.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <CardTitle>Already Accepted</CardTitle>
            <CardDescription>
              This invite has already been accepted. You can sign in with your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="Profita" width={48} height={48} className="rounded-lg" />
          </div>
          <CardTitle>Join {inviteData?.companyName}</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join as a <span className="font-medium capitalize">{inviteData?.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAcceptInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={inviteData?.name || ''} disabled />
            </div>
            
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={inviteData?.email || ''} disabled />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
              />
            </div>
            
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Accept Invite & Create Account'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
