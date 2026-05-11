import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Setup Your Business - Profita',
  description: 'Set up your business profile to get started with Profita.',
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Minimal layout - no app shell, just centered content
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 py-4 px-6">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">P</span>
          </div>
          <span className="font-semibold text-lg">Profita</span>
        </div>
      </header>
      
      {/* Content */}
      <main className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  )
}
