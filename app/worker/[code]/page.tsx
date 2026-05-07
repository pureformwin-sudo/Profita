import { redirect } from 'next/navigation'
// Code-based worker access is deprecated. Crew now sign in normally and are linked via crew_users.
export default function Page() { redirect('/crew/today') }
