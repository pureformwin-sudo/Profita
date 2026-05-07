'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { needsOnboarding } from '@/lib/onboarding-storage'
import { createClient, getCachedUser } from '@/lib/supabase/client'

/**
 * Hook to check if the current user needs to complete onboarding.
 * Only applies to company owners who haven't completed onboarding.
 * 
 * Returns:
 * - checking: true while the check is in progress
 * - needsSetup: true if user should be redirected to onboarding
 */
export function useOnboardingCheck() {
  const router = useRouter()
  const pathname = usePathname()
  const [checking, setChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    // Skip check on onboarding page itself
    if (pathname.startsWith('/onboarding')) {
      setChecking(false)
      return
    }

    async function checkOnboarding() {
      try {
        const user = await getCachedUser()
        if (!user) {
          setChecking(false)
          return
        }

        // Check if user is a company owner
        const supabase = createClient()
        const { data: company } = await supabase
          .from('companies')
          .select('id, onboarding_completed')
          .eq('owner_user_id', user.id)
          .maybeSingle()

        // If user is not a company owner (could be team member), skip
        if (!company) {
          setChecking(false)
          return
        }

        // If owner but onboarding not complete, redirect
        if (company.onboarding_completed === false) {
          setNeedsSetup(true)
          router.replace('/onboarding')
          return
        }

        setChecking(false)
      } catch (error) {
        console.error('Error checking onboarding status:', error)
        setChecking(false)
      }
    }

    checkOnboarding()
  }, [pathname, router])

  return { checking, needsSetup }
}
