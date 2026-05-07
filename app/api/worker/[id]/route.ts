import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Create supabase admin client lazily to avoid build-time errors
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: employeeId } = await params

  try {
    // Get employee info
    const { data: employee, error: empError } = await getSupabaseAdmin()
      .from('employees')
      .select('id, name, role, user_id, pay_rate, pay_type')
      .eq('id', employeeId)
      .single()

    if (empError || !employee) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    // Only allow workers (not sales reps)
    if (employee.role === 'sales_rep') {
      return NextResponse.json({ error: 'This portal is for workers only' }, { status: 403 })
    }

    // Get jobs assigned to this worker
    const { data: jobWorkers, error: jobsError } = await getSupabaseAdmin()
      .from('job_workers')
      .select(`
        id,
        job_id,
        amount_earned,
        hours_worked,
        paid,
        paid_at,
        notes,
        jobs(id, date, job_type, status, price, notes, customers(name, address, phone))
      `)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })

    if (jobsError) {
      console.error('Jobs error:', jobsError)
      return NextResponse.json({ error: 'Failed to load jobs' }, { status: 500 })
    }

    // Format jobs - calculate 20% commission
    const jobs = (jobWorkers || [])
      .filter(jw => jw.jobs)
      .map(jw => {
        const job = jw.jobs as unknown as { 
          id: string; date: string; job_type: string; status: string; 
          price: number; notes?: string;
          customers: { name: string; address?: string; phone?: string } | null
        }
        const price = job.price || 0
        // 20% commission
        const commission = price * 0.20
        return {
          id: jw.id,
          jobId: jw.job_id,
          date: job.date,
          jobType: job.job_type || 'Service',
          status: job.status,
          price: price,
          notes: job.notes,
          amountEarned: commission, // 20% commission
          hoursWorked: jw.hours_worked,
          paid: jw.paid || false,
          paidAt: jw.paid_at,
          customer: job.customers || { name: 'Unknown' }
        }
      })

    return NextResponse.json({
      worker: {
        id: employee.id,
        name: employee.name,
      },
      jobs,
    })
  } catch (error) {
    console.error('Worker API error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST - Update job status or mark payment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: employeeId } = await params
  
  try {
    const body = await request.json()
    const { action, jobId, jobWorkerId, paymentMethod, status } = body

    // Verify employee exists
    const { data: employee } = await getSupabaseAdmin()
      .from('employees')
      .select('id, user_id')
      .eq('id', employeeId)
      .single()

    if (!employee) {
      return NextResponse.json({ error: 'Worker not found' }, { status: 404 })
    }

    if (action === 'update_status') {
      // Update job status (scheduled -> in_progress -> completed)
      const { error } = await getSupabaseAdmin()
        .from('jobs')
        .update({ status })
        .eq('id', jobId)

      if (error) {
        console.error('Update status error:', error)
        return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
      }
      
      return NextResponse.json({ success: true })
    }

    if (action === 'mark_paid') {
      // Update job status to completed
      const { error: jobError } = await getSupabaseAdmin()
        .from('jobs')
        .update({ status: 'completed' })
        .eq('id', jobId)

      if (jobError) {
        console.error('Job update error:', jobError)
        return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
      }

      // Get job details for income record
      const { data: job } = await getSupabaseAdmin()
        .from('jobs')
        .select('*, customers(name)')
        .eq('id', jobId)
        .single()

      if (job) {
        // Record income with payment method
        await getSupabaseAdmin()
          .from('income')
          .insert({
            user_id: job.user_id,
            job_id: jobId,
            amount: job.price,
            job_type: job.job_type,
            customer_name: job.customers?.name || 'Unknown',
            payment_method: paymentMethod,
            payment_status: 'paid',
            date: new Date().toISOString().split('T')[0],
          })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Worker POST error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
