'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'
import { AskAIDrawer } from '@/components/ai/ask-ai-drawer'
import { cn } from '@/lib/utils'

export function AskAIFloating({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-5 right-5 z-40 h-11 gap-2 rounded-full px-4 shadow-lg shadow-primary/20 hidden md:inline-flex',
          className,
        )}
      >
        <Sparkles className="h-4 w-4" />
        Ask AI
      </Button>
      {/* Mobile circular FAB */}
      <Button
        size="icon"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full shadow-lg shadow-primary/20 md:hidden"
        aria-label="Ask AI"
      >
        <Sparkles className="h-5 w-5" />
      </Button>
      <AskAIDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}

// Inline button version (for page headers)
export function AskAIInlineButton({ className, label = 'Ask AI' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        className={cn('gap-1.5 h-9', className)}
      >
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        {label}
      </Button>
      <AskAIDrawer open={open} onOpenChange={setOpen} />
    </>
  )
}
