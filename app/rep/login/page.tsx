import { redirect } from 'next/navigation'
// Old rep-specific login is deprecated — sales reps now use the unified /login flow.
// After auth, ModeProvider automatically detects the sales_rep role and routes to /sales/map.
export default function Page() { redirect('/login') }
