'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Check, X, ArrowRight, Shield, Zap, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const passwordRequirements = [
    { label: 'At least 8 characters', met: formData.password.length >= 8 },
    { label: 'Contains a number', met: /\d/.test(formData.password) },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(formData.password) },
  ]

  const passwordsMatch = formData.password === formData.confirmPassword && formData.confirmPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (!passwordRequirements.every(req => req.met)) {
      toast.error('Please meet all password requirements')
      return
    }

    setIsLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: formData.email,
      password: formData.password,
      options: {
        emailRedirectTo: process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`,
        data: {
          name: formData.name,
        },
      },
    })

    if (error) {
      toast.error(error.message)
      setIsLoading(false)
      return
    }

    if (data.user) {
      if (data.user.identities && data.user.identities.length === 0) {
        toast.error('An account with this email already exists')
      } else {
        // Check if this email belongs to a sales rep employee
        const { data: employee } = await supabase
          .from('employees')
          .select('id, user_id, name')
          .ilike('email', formData.email)
          .eq('role', 'sales_rep')
          .single()

        if (employee) {
          // This is a sales rep - create profile as approved and link to owner
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: formData.email,
            name: formData.name,
            status: 'approved',
            is_admin: false,
          }, { onConflict: 'id' })

          // Create the sales_rep_users link
          await fetch('/api/sales-rep/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: data.user.id,
              employeeId: employee.id,
              ownerUserId: employee.user_id,
            })
          })

          toast.success('Account created!')
          router.push('/rep')
          router.refresh()
        } else {
          // Regular owner signup - needs approval
          await supabase.from('profiles').upsert({
            id: data.user.id,
            email: formData.email,
            name: formData.name,
            status: 'pending',
            is_admin: false,
          }, { onConflict: 'id' })

          if (data.session) {
            toast.success('Account created! Awaiting admin approval.')
            router.push('/pending-approval')
            router.refresh()
          } else {
            toast.success('Account created! Please check your email to confirm your account.')
            router.push('/login')
          }
        }
      }
    }

    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        {/* Glow effects */}
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-success/10 rounded-full blur-3xl" />
        
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
            Start managing<br />
            <span className="text-gradient">your business</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mb-12">
            Join thousands of service professionals who trust Profita to run their business.
          </p>
          
          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-border bg-card/50 backdrop-blur text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 mx-auto mb-2">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <p className="text-lg font-bold">Free</p>
              <p className="text-xs text-muted-foreground">No hidden costs</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/50 backdrop-blur text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20 mx-auto mb-2">
                <Shield className="h-5 w-5 text-success" />
              </div>
              <p className="text-lg font-bold">Secure</p>
              <p className="text-xs text-muted-foreground">Data protected</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-card/50 backdrop-blur text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/20 mx-auto mb-2">
                <Clock className="h-5 w-5 text-chart-2" />
              </div>
              <p className="text-lg font-bold">24/7</p>
              <p className="text-xs text-muted-foreground">Always available</p>
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
            <h2 className="text-2xl font-bold">Create your account</h2>
            <p className="text-muted-foreground mt-2">
              Get started with your free account today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm text-muted-foreground">Full name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="h-12 bg-input border-border focus:border-primary focus:ring-primary"
                required
              />
            </div>

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
              <Label htmlFor="password" className="text-sm text-muted-foreground">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Create a password"
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
              {formData.password && (
                <div className="mt-3 space-y-1.5">
                  {passwordRequirements.map((req, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      {req.met ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={req.met ? 'text-success' : 'text-muted-foreground'}>
                        {req.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm text-muted-foreground">Confirm password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className={`h-12 bg-input border-border pr-12 focus:border-primary focus:ring-primary ${
                    formData.confirmPassword && !passwordsMatch ? 'border-destructive' : ''
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {formData.confirmPassword && !passwordsMatch && (
                <p className="text-sm text-destructive">Passwords do not match</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-medium mt-2"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Create account
                  <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-center text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
