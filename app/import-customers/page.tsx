'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { addCustomer } from '@/lib/storage'
import { toast } from 'sonner'
import { ArrowLeft, Upload, FileUp, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function ImportCustomersPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [importMode, setImportMode] = useState<'csv' | 'manual'>('csv')
  const [csvContent, setCsvContent] = useState('')
  const [importProgress, setImportProgress] = useState<{ total: number; imported: number; errors: number }>({ total: 0, imported: 0, errors: 0 })
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualAddress, setManualAddress] = useState('')

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setCsvContent(content)
    }
    reader.readAsText(file)
  }

  const parseCSV = (csv: string) => {
    const lines = csv.trim().split('\n')
    const customers = []
    
    // Skip header if it exists
    const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0
    
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      
      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''))
      
      if (parts.length >= 1) {
        customers.push({
          name: parts[0],
          phone: parts[1] || '',
          address: parts[2] || '',
          notes: parts[3] || '',
        })
      }
    }
    
    return customers
  }

  const handleCSVImport = async () => {
    if (!csvContent.trim()) {
      toast.error('Please provide CSV content or upload a file')
      return
    }

    setIsSubmitting(true)
    const customers = parseCSV(csvContent)
    
    if (customers.length === 0) {
      toast.error('No valid customers found in CSV')
      setIsSubmitting(false)
      return
    }

    setImportProgress({ total: customers.length, imported: 0, errors: 0 })

    let imported = 0
    let errors = 0

    for (const customer of customers) {
      try {
        const result = await addCustomer({
          name: customer.name,
          phone: customer.phone || undefined,
          address: customer.address || undefined,
          notes: customer.notes || undefined,
        })

        if (result) {
          imported++
        } else {
          errors++
        }
      } catch (error) {
        errors++
      }

      setImportProgress(prev => ({ ...prev, imported: imported + errors }))
    }

    toast.success(`Imported ${imported} customers${errors > 0 ? `, ${errors} errors` : ''}`)
    setTimeout(() => router.push('/customers'), 1500)
    setIsSubmitting(false)
  }

  const handleManualAdd = async () => {
    if (!manualName.trim()) {
      toast.error('Please enter a customer name')
      return
    }

    setIsSubmitting(true)

    const result = await addCustomer({
      name: manualName,
      phone: manualPhone || undefined,
      address: manualAddress || undefined,
    })

    if (result) {
      toast.success('Customer added successfully!')
      router.push('/customers')
    } else {
      toast.error('Failed to add customer')
      setIsSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="flex-1 overflow-auto pb-20">
        <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4 animate-fade-in">
            <Link href="/customers">
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 hover-scale">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Import Customers</h1>
              <p className="text-sm text-muted-foreground">Add customers via CSV or manually</p>
            </div>
          </div>

          {/* Mode Selection */}
          <div className="flex gap-2 animate-fade-in">
            <Button
              variant={importMode === 'csv' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setImportMode('csv')}
              className="h-9 hover-scale"
            >
              <FileUp className="h-4 w-4 mr-2" />
              CSV Import
            </Button>
            <Button
              variant={importMode === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setImportMode('manual')}
              className="h-9 hover-scale"
            >
              <Upload className="h-4 w-4 mr-2" />
              Manual Add
            </Button>
          </div>

          {/* CSV Import Mode */}
          {importMode === 'csv' && (
            <Card className="animate-fade-in-up">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="csvFile" className="text-sm font-medium">
                    Upload CSV File
                  </Label>
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:bg-accent/50 transition-colors cursor-pointer">
                    <Input
                      id="csvFile"
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <label htmlFor="csvFile" className="cursor-pointer">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm font-medium">Click to upload CSV</p>
                      <p className="text-xs text-muted-foreground">or drag and drop</p>
                    </label>
                  </div>
                </div>

                {/* CSV Format Help */}
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                  <p className="text-sm font-medium text-blue-600 mb-2">CSV Format:</p>
                  <code className="text-xs bg-black/50 p-2 rounded block text-white/80 whitespace-pre">
{`Name,Phone,Address,Notes
John Doe,555-1234,123 Main St,
Jane Smith,555-5678,456 Oak Ave,Regular client`}
                  </code>
                </div>

                {/* CSV Content Editor */}
                {csvContent && (
                  <div className="space-y-2">
                    <Label htmlFor="csvContent" className="text-sm font-medium">
                      CSV Content (or paste here)
                    </Label>
                    <Textarea
                      id="csvContent"
                      value={csvContent}
                      onChange={(e) => setCsvContent(e.target.value)}
                      className="min-h-40 font-mono text-xs"
                      placeholder="Name,Phone,Address,Notes&#10;John Doe,555-1234,123 Main St,..."
                    />
                  </div>
                )}

                {/* Import Progress */}
                {importProgress.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progress: {importProgress.imported} / {importProgress.total}</span>
                      {importProgress.imported === importProgress.total && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(importProgress.imported / importProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button
                  onClick={handleCSVImport}
                  disabled={!csvContent.trim() || isSubmitting}
                  className="w-full h-11 font-semibold hover-scale"
                >
                  {isSubmitting ? 'Importing...' : 'Import Customers'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Manual Add Mode */}
          {importMode === 'manual' && (
            <Card className="animate-fade-in-up">
              <CardContent className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    Customer Name *
                  </Label>
                  <Input
                    id="name"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="John Doe"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-sm font-medium">
                    Phone Number (optional)
                  </Label>
                  <Input
                    id="phone"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="555-1234"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address" className="text-sm font-medium">
                    Address (optional)
                  </Label>
                  <Input
                    id="address"
                    value={manualAddress}
                    onChange={(e) => setManualAddress(e.target.value)}
                    placeholder="123 Main St"
                    className="h-11"
                  />
                </div>

                <Button
                  onClick={handleManualAdd}
                  disabled={!manualName.trim() || isSubmitting}
                  className="w-full h-11 font-semibold hover-scale"
                >
                  {isSubmitting ? 'Adding...' : 'Add Customer'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  )
}
