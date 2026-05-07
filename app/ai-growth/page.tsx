'use client'

import { useEffect, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { AIGrowthHeader } from '@/components/ai-growth/header'
import { AIGrowthKPIs } from '@/components/ai-growth/kpis'
import { RepeatCustomersCard } from '@/components/ai-growth/repeat-customers-card'
import { HotLeadsCard } from '@/components/ai-growth/hot-leads-card'
import { UpsellTargetsCard } from '@/components/ai-growth/upsell-targets-card'
import { QuoteAssistant } from '@/components/ai-growth/quote-assistant'
import { GrowthCoach } from '@/components/ai-growth/growth-coach'
import { getCustomers, getJobs, getInvoices } from '@/lib/storage'
import type { Customer, Job } from '@/lib/types'

export default function AIGrowthPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      const [customersData, jobsData, invoicesData] = await Promise.all([
        getCustomers(),
        getJobs(),
        getInvoices(),
      ])
      setCustomers(customersData)
      setJobs(jobsData)
      setInvoices(invoicesData)
      setIsLoading(false)
    }
    loadData()
  }, [])

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="relative h-12 w-12 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <p className="text-muted-foreground text-sm">Analyzing your business...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
        <AIGrowthHeader />
        <AIGrowthKPIs customers={customers} jobs={jobs} invoices={invoices} />

        {/* Smart Actions Section */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Smart Actions</h2>
            <span className="text-xs text-muted-foreground">AI-detected opportunities</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <RepeatCustomersCard customers={customers} jobs={jobs} />
            <HotLeadsCard customers={customers} invoices={invoices} />
            <UpsellTargetsCard customers={customers} jobs={jobs} />
          </div>
        </div>

        {/* Quote Assistant + Growth Coach */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <QuoteAssistant />
          </div>
          <div className="lg:col-span-2">
            <GrowthCoach customers={customers} jobs={jobs} invoices={invoices} />
          </div>
        </div>
      </div>
    </AppShell>
  )
}
