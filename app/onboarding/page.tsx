'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Wrench, DollarSign, Users, FileText, Check, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  getCompanyOnboarding,
  saveCompanyInfo,
  saveServicesConfig,
  savePricingGoals,
  saveSalesConfig,
  saveInvoicingConfig,
  completeOnboarding,
  skipOnboarding,
  DEFAULT_SERVICES,
  DEFAULT_JOB_TYPES,
  DEFAULT_PAYMENT_METHODS,
  INDUSTRY_OPTIONS,
  TEAM_SIZE_OPTIONS,
  type CompanyOnboardingData,
} from '@/lib/onboarding-storage'

const STEPS = [
  { id: 1, title: 'Company Info', icon: Building2, description: 'Basic business details' },
  { id: 2, title: 'Services', icon: Wrench, description: 'What you offer' },
  { id: 3, title: 'Pricing & Goals', icon: DollarSign, description: 'Rates and targets' },
  { id: 4, title: 'Sales Team', icon: Users, description: 'D2D settings' },
  { id: 5, title: 'Invoicing', icon: FileText, description: 'Payment settings' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)
  const [data, setData] = useState<CompanyOnboardingData | null>(null)

  // Form state
  const [companyName, setCompanyName] = useState('')
  const [industry, setIndustry] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [website, setWebsite] = useState('')
  const [serviceArea, setServiceArea] = useState('')
  const [teamSize, setTeamSize] = useState('')
  
  const [services, setServices] = useState<string[]>([])
  const [jobTypes, setJobTypes] = useState<string[]>(DEFAULT_JOB_TYPES)
  const [newService, setNewService] = useState('')
  
  const [hourlyRate, setHourlyRate] = useState('')
  const [minimumCharge, setMinimumCharge] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [weeklyRevenue, setWeeklyRevenue] = useState('')
  const [monthlyRevenue, setMonthlyRevenue] = useState('')
  
  const [usesSalesForce, setUsesSalesForce] = useState(false)
  const [doorsPerDay, setDoorsPerDay] = useState('')
  const [leadsPerWeek, setLeadsPerWeek] = useState('')
  
  const [invoicePrefix, setInvoicePrefix] = useState('INV-')
  const [paymentTerms, setPaymentTerms] = useState('30')
  const [paymentMethods, setPaymentMethods] = useState<string[]>(DEFAULT_PAYMENT_METHODS)

  // Load existing data
  useEffect(() => {
    async function loadData() {
      try {
        const companyData = await getCompanyOnboarding()
        if (companyData) {
          // If already completed, redirect to dashboard
          if (companyData.onboardingCompleted) {
            router.replace('/')
            return
          }
          
          setData(companyData)
          // Resume from last step
          setStep(Math.max(1, (companyData.onboardingStep || 0) + 1))
          
          // Populate form fields
          setCompanyName(companyData.name || '')
          setIndustry(companyData.industry || '')
          setPhone(companyData.phone || '')
          setEmail(companyData.email || '')
          setAddress(companyData.address || '')
          setWebsite(companyData.website || '')
          setServiceArea(companyData.serviceArea || '')
          setTeamSize(companyData.teamSize || '')
          setServices(companyData.servicesOffered?.length ? companyData.servicesOffered : [])
          setJobTypes(companyData.defaultJobTypes?.length ? companyData.defaultJobTypes : DEFAULT_JOB_TYPES)
          setHourlyRate(companyData.defaultPricing?.hourlyRate?.toString() || '')
          setMinimumCharge(companyData.defaultPricing?.minimumCharge?.toString() || '')
          setTaxRate(companyData.taxSettings?.taxRate?.toString() || '')
          setWeeklyRevenue(companyData.revenueGoals?.weeklyTarget?.toString() || '')
          setMonthlyRevenue(companyData.revenueGoals?.monthlyTarget?.toString() || '')
          setUsesSalesForce(companyData.usesSalesForce || false)
          setDoorsPerDay(companyData.salesGoals?.doorsPerDay?.toString() || '')
          setLeadsPerWeek(companyData.salesGoals?.leadsPerWeek?.toString() || '')
          setInvoicePrefix(companyData.invoiceSettings?.prefix || 'INV-')
          setPaymentTerms(companyData.invoiceSettings?.paymentTermsDays?.toString() || '30')
          setPaymentMethods(companyData.paymentMethods?.length ? companyData.paymentMethods : DEFAULT_PAYMENT_METHODS)
        }
      } catch (error) {
        console.error('Error loading onboarding data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [router])

  const handleNext = async () => {
    setSaving(true)
    try {
      let success = false
      
      switch (step) {
        case 1:
          if (!companyName.trim()) {
            toast.error('Company name is required')
            setSaving(false)
            return
          }
          success = await saveCompanyInfo({
            name: companyName,
            industry: industry || undefined,
            phone: phone || undefined,
            email: email || undefined,
            address: address || undefined,
            website: website || undefined,
            serviceArea: serviceArea || undefined,
            teamSize: teamSize || undefined,
          })
          break
          
        case 2:
          success = await saveServicesConfig({
            servicesOffered: services,
            defaultJobTypes: jobTypes,
          })
          break
          
        case 3:
          success = await savePricingGoals({
            defaultPricing: {
              hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
              minimumCharge: minimumCharge ? parseFloat(minimumCharge) : undefined,
              taxRate: taxRate ? parseFloat(taxRate) : undefined,
            },
            revenueGoals: {
              weeklyTarget: weeklyRevenue ? parseFloat(weeklyRevenue) : undefined,
              monthlyTarget: monthlyRevenue ? parseFloat(monthlyRevenue) : undefined,
            },
            jobGoals: {},
          })
          break
          
        case 4:
          success = await saveSalesConfig({
            usesSalesForce,
            salesGoals: usesSalesForce ? {
              doorsPerDay: doorsPerDay ? parseInt(doorsPerDay) : undefined,
              leadsPerWeek: leadsPerWeek ? parseInt(leadsPerWeek) : undefined,
            } : undefined,
          })
          break
          
        case 5:
          success = await saveInvoicingConfig({
            invoiceSettings: {
              prefix: invoicePrefix,
              paymentTermsDays: parseInt(paymentTerms),
            },
            taxSettings: {
              taxRate: taxRate ? parseFloat(taxRate) : 0,
              taxEnabled: !!taxRate,
            },
            paymentMethods,
          })
          if (success) {
            success = await completeOnboarding()
            if (success) {
              toast.success('Setup complete! Welcome to Profita.')
              router.replace('/')
              return
            }
          }
          break
      }
      
      if (success) {
        setStep(step + 1)
      } else {
        toast.error('Failed to save. Please try again.')
      }
    } catch (error) {
      console.error('Error saving step:', error)
      toast.error('An error occurred. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleSkip = async () => {
    setSaving(true)
    try {
      const success = await skipOnboarding()
      if (success) {
        toast.success('Setup skipped. You can configure settings later.')
        router.replace('/')
      } else {
        toast.error('Failed to skip. Please try again.')
      }
    } catch (error) {
      console.error('Error skipping onboarding:', error)
      toast.error('An error occurred.')
    } finally {
      setSaving(false)
    }
  }

  const toggleService = (service: string) => {
    setServices(prev => 
      prev.includes(service) 
        ? prev.filter(s => s !== service)
        : [...prev, service]
    )
  }

  const addCustomService = () => {
    if (newService.trim() && !services.includes(newService.trim())) {
      setServices([...services, newService.trim()])
      setNewService('')
    }
  }

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods(prev =>
      prev.includes(method)
        ? prev.filter(m => m !== method)
        : [...prev, method]
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Progress */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Step {step} of {STEPS.length}</span>
            <button 
              onClick={handleSkip}
              disabled={saving}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip setup
            </button>
          </div>
          
          {/* Step indicators */}
          <div className="flex gap-2">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`flex-1 h-1.5 rounded-full transition-colors ${
                  s.id < step ? 'bg-primary' : s.id === step ? 'bg-primary/50' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          
          {/* Step labels - desktop only */}
          <div className="hidden md:flex justify-between">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-2 text-sm ${
                  s.id === step ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                  s.id < step 
                    ? 'bg-primary text-primary-foreground' 
                    : s.id === step 
                      ? 'bg-primary/20 text-primary border border-primary' 
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {s.id < step ? <Check className="w-3 h-3" /> : s.id}
                </div>
                <span className="hidden lg:inline">{s.title}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {(() => {
                const StepIcon = STEPS[step - 1].icon
                return <StepIcon className="h-5 w-5 text-primary" />
              })()}
              {STEPS[step - 1].title}
            </CardTitle>
            <CardDescription>{STEPS[step - 1].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Company Info */}
            {step === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name *</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Your business name"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select value={industry} onValueChange={setIndustry}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        {INDUSTRY_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="teamSize">Team Size</Label>
                    <Select value={teamSize} onValueChange={setTeamSize}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team size" />
                      </SelectTrigger>
                      <SelectContent>
                        {TEAM_SIZE_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">Business Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@yourbusiness.com"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address">Business Address</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St, City, State"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="serviceArea">Service Area</Label>
                    <Input
                      id="serviceArea"
                      value={serviceArea}
                      onChange={(e) => setServiceArea(e.target.value)}
                      placeholder="e.g., Greater Seattle Area"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourbusiness.com"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Services */}
            {step === 2 && (
              <>
                <div className="space-y-3">
                  <Label>Services You Offer</Label>
                  <p className="text-sm text-muted-foreground">Select the services your business provides</p>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_SERVICES.map(service => (
                      <Badge
                        key={service}
                        variant={services.includes(service) ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5 text-sm"
                        onClick={() => toggleService(service)}
                      >
                        {services.includes(service) && <Check className="w-3 h-3 mr-1" />}
                        {service}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Custom services */}
                  {services.filter(s => !DEFAULT_SERVICES.includes(s)).map(service => (
                    <Badge
                      key={service}
                      variant="default"
                      className="cursor-pointer px-3 py-1.5 text-sm"
                      onClick={() => toggleService(service)}
                    >
                      <Check className="w-3 h-3 mr-1" />
                      {service}
                    </Badge>
                  ))}
                  
                  <div className="flex gap-2 mt-3">
                    <Input
                      value={newService}
                      onChange={(e) => setNewService(e.target.value)}
                      placeholder="Add custom service"
                      onKeyDown={(e) => e.key === 'Enter' && addCustomService()}
                    />
                    <Button type="button" variant="outline" onClick={addCustomService}>
                      Add
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label>Default Job Types</Label>
                  <div className="flex flex-wrap gap-2">
                    {['Residential', 'Commercial', 'Storefront', 'Industrial'].map(type => (
                      <Badge
                        key={type}
                        variant={jobTypes.includes(type) ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5 text-sm"
                        onClick={() => setJobTypes(prev => 
                          prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                        )}
                      >
                        {jobTypes.includes(type) && <Check className="w-3 h-3 mr-1" />}
                        {type}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Pricing & Goals */}
            {step === 3 && (
              <>
                <div className="space-y-4">
                  <h4 className="font-medium">Default Pricing</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hourlyRate">Hourly Rate ($)</Label>
                      <Input
                        id="hourlyRate"
                        type="number"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        placeholder="75"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="minimumCharge">Minimum Charge ($)</Label>
                      <Input
                        id="minimumCharge"
                        type="number"
                        value={minimumCharge}
                        onChange={(e) => setMinimumCharge(e.target.value)}
                        placeholder="100"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="taxRate">Tax Rate (%)</Label>
                    <Input
                      id="taxRate"
                      type="number"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      placeholder="8.5"
                      className="max-w-[200px]"
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-medium">Revenue Goals</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="weeklyRevenue">Weekly Target ($)</Label>
                      <Input
                        id="weeklyRevenue"
                        type="number"
                        value={weeklyRevenue}
                        onChange={(e) => setWeeklyRevenue(e.target.value)}
                        placeholder="5000"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="monthlyRevenue">Monthly Target ($)</Label>
                      <Input
                        id="monthlyRevenue"
                        type="number"
                        value={monthlyRevenue}
                        onChange={(e) => setMonthlyRevenue(e.target.value)}
                        placeholder="20000"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Step 4: Sales Team */}
            {step === 4 && (
              <>
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <Label htmlFor="salesForce">Enable Sales Force Features</Label>
                    <p className="text-sm text-muted-foreground">
                      Door-to-door tracking, leads, territories, and sales analytics
                    </p>
                  </div>
                  <Switch
                    id="salesForce"
                    checked={usesSalesForce}
                    onCheckedChange={setUsesSalesForce}
                  />
                </div>
                
                {usesSalesForce && (
                  <div className="space-y-4 animate-fade-in">
                    <h4 className="font-medium">Sales Goals</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="doorsPerDay">Doors per Day (per rep)</Label>
                        <Input
                          id="doorsPerDay"
                          type="number"
                          value={doorsPerDay}
                          onChange={(e) => setDoorsPerDay(e.target.value)}
                          placeholder="50"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="leadsPerWeek">Leads per Week (per rep)</Label>
                        <Input
                          id="leadsPerWeek"
                          type="number"
                          value={leadsPerWeek}
                          onChange={(e) => setLeadsPerWeek(e.target.value)}
                          placeholder="20"
                        />
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      You can configure territories and assign reps after setup in Settings.
                    </p>
                  </div>
                )}
                
                {!usesSalesForce && (
                  <p className="text-sm text-muted-foreground">
                    You can enable Sales Force features later in Company Settings if your business grows.
                  </p>
                )}
              </>
            )}

            {/* Step 5: Invoicing */}
            {step === 5 && (
              <>
                <div className="space-y-4">
                  <h4 className="font-medium">Invoice Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="invoicePrefix">Invoice Number Prefix</Label>
                      <Input
                        id="invoicePrefix"
                        value={invoicePrefix}
                        onChange={(e) => setInvoicePrefix(e.target.value)}
                        placeholder="INV-"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="paymentTerms">Payment Terms (days)</Label>
                      <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">Due on Receipt</SelectItem>
                          <SelectItem value="7">Net 7</SelectItem>
                          <SelectItem value="14">Net 14</SelectItem>
                          <SelectItem value="30">Net 30</SelectItem>
                          <SelectItem value="60">Net 60</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label>Accepted Payment Methods</Label>
                  <div className="flex flex-wrap gap-2">
                    {['Cash', 'Card', 'Check', 'Zelle', 'Venmo', 'PayPal', 'Bank Transfer'].map(method => (
                      <Badge
                        key={method}
                        variant={paymentMethods.includes(method) ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5 text-sm"
                        onClick={() => togglePaymentMethod(method)}
                      >
                        {paymentMethods.includes(method) && <Check className="w-3 h-3 mr-1" />}
                        {method}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <p className="text-sm text-foreground">
                    You&apos;re all set! Click &quot;Complete Setup&quot; to start using Profita. 
                    You can always change these settings later.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => setStep(step - 1)}
            disabled={step === 1 || saving}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          
          <Button onClick={handleNext} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            {step === STEPS.length ? 'Complete Setup' : 'Continue'}
            {step !== STEPS.length && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
