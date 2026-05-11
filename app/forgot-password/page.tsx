'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    // Simulate password reset
    await new Promise(resolve => setTimeout(resolve, 1000))

    toast.success('Reset link sent!')
    setSubmitted(true)
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-[oklch(0.55_0.2_250)] relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,oklch(0.55_0.2_250)_0%,oklch(0.45_0.22_260)_100%)]" />
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="flex items-center gap-3 mb-8">
            <Image
              src="/logo.png"
              alt="PROFITA"
              width={48}
              height={48}
              className="rounded-xl object-contain"
              style={{ width: 'auto', height: 'auto', maxWidth: 48, maxHeight: 48 }}
            />
            <span className="text-2xl font-bold text-white">PROFITA</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-bold text-white mb-4">
            Reset your password
          </h1>
          <p className="text-lg text-white/80 max-w-md">
            No worries, we&apos;ll send you reset instructions.
          </p>
        </div>
        {/* Decorative circles */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-white/10" />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/5" />
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <Image
              src="/logo.png"
              alt="PROFITA"
              width={40}
              height={40}
              className="rounded-xl object-contain"
              style={{ width: 'auto', height: 'auto', maxWidth: 40, maxHeight: 40 }}
            />
            <span className="text-xl font-bold text-foreground">PROFITA</span>
          </div>

          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          {!submitted ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-foreground">Forgot password?</h2>
                <p className="text-muted-foreground mt-2">
                  Enter your email and we&apos;ll send you a link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-12 rounded-xl bg-muted/50 border-border focus:border-[oklch(0.55_0.2_250)] focus:ring-[oklch(0.55_0.2_250)]"
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-[oklch(0.55_0.2_250)] hover:bg-[oklch(0.45_0.22_260)] text-white font-medium transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Send reset link'}
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Check your email</h2>
              <p className="text-muted-foreground mb-8">
                We sent a password reset link to<br />
                <span className="font-medium text-foreground">{email}</span>
              </p>
              <Button
                onClick={() => setSubmitted(false)}
                variant="outline"
                className="rounded-xl"
              >
                Didn&apos;t receive the email? Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
