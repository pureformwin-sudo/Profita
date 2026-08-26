import type { Metadata, Viewport } from 'next'
import { Inter, Geist_Mono, Great_Vibes } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/components/auth-provider'
import { ModeProvider } from '@/lib/mode-context'
import { PermissionsProvider } from '@/lib/permissions-context'
import { JobTimerProvider } from '@/lib/job-timer-context'
import { ApprovalGate } from '@/components/approval-gate'
import './globals.css'

const _inter = Inter({ subsets: ["latin"], variable: '--font-inter' });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
// Script face for typed contract signatures. Single weight — it's only ever
// used to render a signed name, never body copy.
const signatureFont = Great_Vibes({
  subsets: ['latin'],
  weight: '400',
  variable: '--signature-family',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#151519',
}

export const metadata: Metadata = {
  title: 'Profita - Business Management',
  description: 'The modern way to manage your service business. Track jobs, customers, finances, and team - all in one place.',
  generator: 'v0.app',
  keywords: ['business management', 'service business', 'job tracking', 'invoicing', 'finance tracker', 'Profita'],
  authors: [{ name: 'Profita' }],
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'Profita - Business Management',
    description: 'The modern way to manage your service business.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`bg-background overflow-x-hidden ${signatureFont.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased overflow-x-hidden w-full min-h-screen" suppressHydrationWarning>
        <AuthProvider>
          <ModeProvider>
            <PermissionsProvider>
              <JobTimerProvider>
                <ApprovalGate>
                  {children}
                </ApprovalGate>
              </JobTimerProvider>
            </PermissionsProvider>
          </ModeProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: 'oklch(0.16 0.01 260)',
                border: '1px solid oklch(0.24 0.01 260)',
                color: 'oklch(0.95 0 0)',
              },
            }}
          />
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
