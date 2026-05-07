'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import Image from 'next/image'

export default function PendingApprovalPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected' | 'checking'>('checking')

  useEffect(() => {
    const checkStatus = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('status')
        .eq('id', user.id)
        .single()

      if (profile) {
        setStatus(profile.status)
        if (profile.status === 'approved') {
          toast.success('Your account has been approved!')
          router.push('/')
          router.refresh()
        } else if (profile.status === 'rejected') {
          setStatus('rejected')
        }
      }
    }

    checkStatus()
    const interval = setInterval(checkStatus, 5000) // Check every 5 seconds
    return () => clearInterval(interval)
  }, [router])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <Image 
            src="/logo.png" 
            alt="Profita" 
            width={64} 
            height={64} 
            className="rounded-xl"
          />
        </div>

        {status === 'checking' && (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Checking status...</h1>
              <p className="text-muted-foreground">Please wait</p>
            </div>
            <div className="flex justify-center">
              <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          </>
        )}

        {status === 'pending' && (
          <>
            <div className="space-y-2">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Clock className="h-8 w-8 text-amber-500" />
                </div>
              </div>
              <h1 className="text-2xl font-bold">Awaiting Approval</h1>
              <p className="text-muted-foreground">
                Thank you for signing up! Your account is pending approval from an administrator.
              </p>
            </div>
            
            <div className="bg-secondary/50 rounded-lg p-4 text-sm text-muted-foreground space-y-2">
              <p>This usually takes 1-2 business hours. We'll automatically log you in as soon as your account is approved.</p>
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </>
        )}

        {status === 'rejected' && (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Application Rejected</h1>
              <p className="text-muted-foreground">
                Unfortunately, your sign-up request was not approved at this time.
              </p>
            </div>

            <div className="bg-red-500/10 rounded-lg p-4 text-sm text-red-600">
              Please contact support if you believe this is an error.
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={handleLogout}
            >
              Return to Login
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
