'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { 
  Building2, 
  Wrench, 
  DollarSign, 
  Users, 
  FileText, 
  Check, 
  ArrowLeft,
  Loader2,
  Globe,
  MapPin,
  Phone,
  Mail,
} from 'lucide-react'
import Link from 'next/link'
import { usePermissions } from '@/lib/permissions-context'
import { hasPermission } from '@/lib/permissions'
import {
  getCompanyOnboarding,
  updateCompanySettings,
  DEFAULT_SERVICES,
  DEFAULT_PAYMENT_METHODS,
  INDUSTRY_OPTIONS,
  TEAM_SIZE_OPTIONS,
  type CompanyOnboardingData,
} from '@/lib/onboarding-storage'

export default function CompanySettingsPage() {
  const router = useRouter()
  const { membership, loading: permLoading } = usePermissions()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
  const [jobTypes, setJobTypes] = useState<string[]>([])
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
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])

  // Permission check
  const canAccess = membership && hasPermission(membership, 'manage_settings')

  // Load existing data
  useEffect(() => {
    async function loadData() {
      try {
        const companyData = await getCompanyOnboarding()
        if (companyData) {
          setData(companyData)
          
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
          setJobTypes(companyData.defaultJobTypes?.length ? companyData.defaultJobTypes : [])
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
        console.error('Error loading company data:', error)
        toast.error('Failed to load company settings')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const handleSave = async () => {
    if (!companyName.trim()) {
      toast.error('Company name is required')
      return
    }
    
    setSaving(true)
    try {
      const success = await updateCompanySettings({
        name: companyName,
        industry: industry || undefined,
        phone: phone || undefined,
        email: email || undefined,
        address: address || undefined,
        website: website || undefined,
        serviceArea: serviceArea || undefined,
        teamSize: teamSize || undefined,
        servicesOffered: services,
        defaultJobTypes: jobTypes,
        defaultPricing: {
          hourlyRate: hourlyRate ? parseFloat(hourlyRate) : undefined,
          minimumCharge: minimumCharge ? parseFloat(minimumCharge) : undefined,
        },
        revenueGoals: {
          weeklyTarget: weeklyRevenue ? parseFloat(weeklyRevenue) : undefined,
          monthlyTarget: monthlyRevenue ? parseFloat(monthlyRevenue) : undefined,
        },
        usesSalesForce,
        salesGoals: usesSalesForce ? {
          doorsPerDay: doorsPerDay ? parseInt(doorsPerDay) : undefined,
          leadsPerWeek: leadsPerWeek ? parseInt(leadsPerWeek) : undefined,
        } : {},
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
        toast.success('Company settings saved')
      } else {
        toast.error('Failed to save settings')
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      toast.error('An error occurred')
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

  // Loading state
  if (loading || permLoading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    )
  }

  // Permission denied
  if (!canAccess) {
    return (
      <AppShell>
        <div className="p-4 lg:p-6 max-w-2xl mx-auto">
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Access Denied</CardTitle>
              <CardDescription>
                You don&apos;t have permission to access company settings. 
                Only owners and admins can manage company settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/settings">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 max-w-2xl mx-auto w-full space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Company Settings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Configure your business profile and preferences
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="profile" className="text-xs">
              <Building2 className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="services" className="text-xs">
              <Wrench className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Services</span>
            </TabsTrigger>
            <TabsTrigger value="pricing" className="text-xs">
              <DollarSign className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Pricing</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">
              <Users className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Sales</span>
            </TabsTrigger>
            <TabsTrigger value="invoicing" className="text-xs">
              <FileText className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Invoicing</span>
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Company Profile</CardTitle>
                <CardDescription>Basic information about your business</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                    <Select value={industry || "none"} onValueChange={(v) => setIndustry(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select industry</SelectItem>
                        {INDUSTRY_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="teamSize">Team Size</Label>
                    <Select value={teamSize || "none"} onValueChange={(v) => setTeamSize(v === "none" ? "" : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select team size</SelectItem>
                        {TEAM_SIZE_OPTIONS.map(opt => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      Phone
                    </Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      Business Email
                    </Label>
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
                  <Label htmlFor="address" className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    Business Address
                  </Label>
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
                    <Label htmlFor="website" className="flex items-center gap-2">
                      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                      Website
                    </Label>
                    <Input
                      id="website"
                      type="url"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourbusiness.com"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Services Tab */}
          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Services & Job Types</CardTitle>
                <CardDescription>Configure the services your business offers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Services You Offer</Label>
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
                  </div>
                  
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pricing & Goals</CardTitle>
                <CardDescription>Set your default rates and business targets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Default Pricing</h4>
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
                  <h4 className="font-medium text-sm">Revenue Goals</h4>
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales Tab */}
          <TabsContent value="sales" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sales Force Settings</CardTitle>
                <CardDescription>Configure door-to-door sales features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                  <div className="space-y-1">
                    <Label htmlFor="salesForce">Enable Sales Force Features</Label>
                    <p className="text-sm text-muted-foreground">
                      D2D tracking, leads, territories, and sales analytics
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
                    <h4 className="font-medium text-sm">Sales Goals</h4>
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
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoicing Tab */}
          <TabsContent value="invoicing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Invoice & Payment Settings</CardTitle>
                <CardDescription>Configure invoicing preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Invoice Settings</h4>
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
                      <Label htmlFor="paymentTerms">Payment Terms</Label>
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Save Button - Fixed at bottom on mobile */}
        <div className="sticky bottom-20 lg:bottom-0 bg-background pt-4 pb-2">
          <Button 
            onClick={handleSave} 
            disabled={saving || !companyName.trim()}
            className="w-full"
            size="lg"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
