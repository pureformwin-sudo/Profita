'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, Briefcase, BarChart3, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.email || !formData.password) {
      toast.error("Please enter both email and password")
      return
    }
    
    setIsLoading(true)

    try {
      const supabase = createClient()
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      })

      if (error) {
        toast.error(error.message)
        setIsLoading(false)
        return
      }

      if (!data.user) {
        toast.error("Login failed. Please try again.")
        setIsLoading(false)
        return
      }

      // Success - redirect to dashboard immediately
      toast.success('Welcome back!')
      router.push('/')
      router.refresh()
    } catch (err: any) {
      console.error("Login error:", err)
      toast.error(err?.message || "An unexpected error occurred. Please try again.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        {/* Glow effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-success/10 rounded-full blur-3xl" />
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          <div className="flex items-center gap-3 mb-12">
            <Image 
              src="/logo.png" 
              alt="Profita" 
              width={48} 
              height={48} 
              className="rounded-xl"
            />
            <span className="text-2xl font-bold">Profita</span>
          </div>
          
          <h1 className="text-4xl xl:text-5xl font-bold mb-4 leading-tight">
            Run your business<br />
            <span className="text-gradient">with confidence</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mb-12">
            The modern way to manage jobs, customers, invoices, and finances - all in one place.
          </p>
          
          {/* Feature cards */}
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 backdrop-blur">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">Job Tracking</p>
                <p className="text-sm text-muted-foreground">Schedule and manage all your jobs</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 backdrop-blur">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
                <BarChart3 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-medium">Financial Insights</p>
                <p className="text-sm text-muted-foreground">Track income, expenses, and profit</p>
              </div>
            </div>
            <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/50 backdrop-blur">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/20">
                <Users className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="font-medium">Customer Management</p>
                <p className="text-sm text-muted-foreground">Keep all client info organized</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <Image 
              src="/logo.png" 
              alt="Profita" 
              width={40} 
              height={40} 
              className="rounded-xl"
            />
            <span className="text-xl font-bold">Profita</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-muted-foreground mt-2">
              Sign in to continue to your dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-muted-foreground">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="h-12 bg-input border-border focus:border-primary focus:ring-primary"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm text-muted-foreground">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-12 bg-input border-border pr-12 focus:border-primary focus:ring-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-center text-muted-foreground">
              {"Don't have an account?"}{' '}
              <Link
                href="/signup"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
