'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

type InviteStatus = 'loading' | 'valid' | 'invalid' | 'expired' | 'accepted' | 'error' | 'needs_login'

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
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  
  useEffect(() => {
    validateInvite()
  }, [token])
  
  const validateInvite = async () => {
    try {
      const supabase = createClient()
      
      // Check if user is already logged in
      const { data: { user } } = await supabase.auth.getUser()
      setIsLoggedIn(!!user)
      
      // First try direct query to company_members (fallback if RPC doesn't exist)
      let invite = null
      let companyName = ''
      
      // Try RPC first
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_invite_by_token', { p_token: token })
      
      if (rpcError) {
        console.log('[v0] RPC not available, trying direct query:', rpcError.message)
        
        // Fallback: Direct query to company_members
        const { data: memberData, error: memberError } = await supabase
          .from('company_members')
          .select(`
            id,
            email,
            name,
            role,
            status,
            company_id,
            companies!inner(name)
          `)
          .eq('invite_token', token)
          .maybeSingle()
        
        if (memberError) {
          console.error('[v0] Error fetching invite:', memberError)
          setErrorMessage('Unable to validate invite. Please try again.')
          setStatus('error')
          return
        }
        
        if (!memberData) {
          setStatus('invalid')
          return
        }
        
        invite = memberData
        companyName = (memberData.companies as { name: string })?.name || 'Unknown Company'
      } else {
        // RPC worked
        const rpcInvite = Array.isArray(rpcData) ? rpcData[0] : rpcData
        if (!rpcInvite) {
          setStatus('invalid')
          return
        }
        invite = rpcInvite
        companyName = rpcInvite.company_name || 'Unknown Company'
      }
      
      // Check invite status
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
        companyName: companyName,
      })
      setStatus('valid')
      
    } catch (error) {
      console.error('[v0] Error validating invite:', error)
      setErrorMessage('An unexpected error occurred. Please try again.')
      setStatus('error')
    }
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
      
      // Try RPC first, fallback to direct update
      const { data: acceptResult, error: acceptError } = await supabase
        .rpc('accept_invite', { p_token: token })
      
      if (acceptError) {
        console.log('[v0] RPC accept_invite not available, using direct update')
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
          toast.error('Authentication failed. Please try again.')
          setIsSubmitting(false)
          return
        }
        
        // Direct update to company_members
        const { error: updateError } = await supabase
          .from('company_members')
          .update({
            user_id: user.id,
            status: 'active',
            invite_accepted_at: new Date().toISOString(),
            invite_token: null,
            updated_at: new Date().toISOString(),
          })
          .eq('invite_token', token)
        
        if (updateError) {
          console.error('[v0] Error accepting invite:', updateError)
          toast.error('Failed to accept invite')
          setIsSubmitting(false)
          return
        }
      } else if (acceptResult && !acceptResult.success) {
        toast.error(acceptResult.error || 'Failed to accept invite')
        setIsSubmitting(false)
        return
      }
      
      toast.success('Welcome to the team!')
      router.push('/')
    } catch (error: unknown) {
      console.error('[v0] Error accepting invite:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to accept invite'
      toast.error(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  const handleSignInAndAccept = async () => {
    // Store token in sessionStorage so we can use it after login
    sessionStorage.setItem('pending_invite_token', token)
    router.push(`/login?redirect=/invite/${token}`)
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
  
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <CardTitle>Something Went Wrong</CardTitle>
            <CardDescription>
              {errorMessage || 'Unable to load the invite. Please try again.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => validateInvite()} className="w-full">
              Try Again
            </Button>
            <Button variant="outline" onClick={() => router.push('/login')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
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
            You&apos;ve been invited to join as a <span className="font-medium capitalize">{inviteData?.role?.replace('_', ' ')}</span>
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
            
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href={`/login?redirect=/invite/${token}`} className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
