'use client'

import { Suspense, useState, useEffect, createContext, useContext } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { 
  FileText, 
  Receipt, 
  Calendar, 
  History, 
  MessageSquarePlus,
  Menu,
  X,
  User,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { validatePortalToken, type PortalCustomer } from '@/lib/portal-storage'

// Portal context for customer data
interface PortalContextType {
  customer: PortalCustomer | null
  token: string | null
  loading: boolean
}

const PortalContext = createContext<PortalContextType>({
  customer: null,
  token: null,
  loading: true,
})

export const usePortal = () => useContext(PortalContext)

const navItems = [
  { href: '/portal', label: 'Dashboard', icon: User },
  { href: '/portal/estimates', label: 'Estimates', icon: FileText },
  { href: '/portal/invoices', label: 'Invoices', icon: Receipt },
  { href: '/portal/bookings', label: 'Bookings', icon: Calendar },
  { href: '/portal/service-history', label: 'Service History', icon: History },
  { href: '/portal/request-service', label: 'Request Service', icon: MessageSquarePlus },
]

function PortalNav({ token }: { token: string }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={`${item.href}?token=${token}`}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Mobile nav */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64">
          <div className="flex items-center gap-2 mb-6">
            <Image
              src="/logo.png"
              alt="Logo"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-semibold">Customer Portal</span>
          </div>
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={`${item.href}?token=${token}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

// Loading fallback for portal
function PortalLoadingFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading your portal...</p>
      </div>
    </div>
  )
}

// Inner layout component that uses useSearchParams
function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [customer, setCustomer] = useState<PortalCustomer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('No access token provided')
        setLoading(false)
        return
      }

      const result = await validatePortalToken(token)
      
      if (!result.valid || !result.customer) {
        setError(result.error || 'Invalid access token')
        setLoading(false)
        return
      }

      setCustomer(result.customer)
      setLoading(false)
    }

    validateToken()
  }, [token])

  if (loading) {
    return <PortalLoadingFallback />
  }

  if (error || !customer || !token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Access Denied</h1>
          <p className="text-muted-foreground mb-6">
            {error || 'Invalid or expired access link. Please contact your service provider for a new link.'}
          </p>
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            Go to Homepage
          </Button>
        </div>
      </div>
    )
  }

  return (
    <PortalContext.Provider value={{ customer, token, loading }}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <PortalNav token={token} />
              <Link href={`/portal?token=${token}`} className="flex items-center gap-2 md:hidden">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
              </Link>
              <Link href={`/portal?token=${token}`} className="hidden md:flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={32}
                  height={32}
                  className="rounded-lg"
                />
                <span className="font-semibold">{customer.companyName || 'Customer Portal'}</span>
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:block">
                Welcome, {customer.name}
              </span>
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-4 py-6 pb-24 md:pb-8">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t safe-area-pb">
          <div className="grid grid-cols-5 gap-1 px-2 py-2">
            {navItems.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={`${item.href}?token=${token}`}
                className="flex flex-col items-center gap-0.5 py-1 text-muted-foreground hover:text-primary"
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[10px]">{item.label.split(' ')[0]}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </PortalContext.Provider>
  )
}

// Main layout export with Suspense boundary
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PortalLoadingFallback />}>
      <PortalLayoutInner>{children}</PortalLayoutInner>
    </Suspense>
  )
}
