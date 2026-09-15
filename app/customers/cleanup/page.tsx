import { AppShell } from '@/components/app-shell'
import { CleanupReview } from './cleanup-review'

export default function CustomerCleanupPage() {
  return (
    <AppShell>
      <div className="p-4 lg:p-6 pb-24 lg:pb-6 space-y-6 max-w-7xl mx-auto w-full overflow-x-hidden">
        <CleanupReview />
      </div>
    </AppShell>
  )
}
