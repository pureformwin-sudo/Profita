import { redirect } from 'next/navigation'

export default function PayrollPage() {
  redirect('/team?tab=payroll')
}
