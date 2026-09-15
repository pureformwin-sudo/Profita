import { AppShell } from '@/components/app-shell'
import { runCustomerAudit } from './actions'
import { CleanupReview } from './cleanup-review'

export const dynamic = 'force-dynamic'

export default async function CustomerCleanupPage() {
  const { suggestions, counts } = await runCustomerAudit()

  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        <CleanupReview initialSuggestions={suggestions} initialCounts={counts} />
      </div>
    </AppShell>
  )
}
