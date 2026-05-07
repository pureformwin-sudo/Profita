import { createClient, getCachedUser } from '@/lib/supabase/client'

export type DayData = {
  doors: number
  leads: number
  closes: number
  revenue: number
  area: string
  areaLocked: boolean
  checklist: boolean[]
  startTime: string | null
}

export type D2DDayRecord = DayData & { date: string }

export const EMPTY_DAY: DayData = {
  doors: 0,
  leads: 0,
  closes: 0,
  revenue: 0,
  area: '',
  areaLocked: false,
  checklist: [false, false, false, false, false],
  startTime: null,
}

function mapRow(row: Record<string, unknown>): D2DDayRecord {
  return {
    date: row.date as string,
    doors: Number(row.doors) || 0,
    leads: Number(row.leads) || 0,
    closes: Number(row.closes) || 0,
    revenue: Number(row.revenue) || 0,
    area: (row.area as string) || '',
    areaLocked: Boolean(row.area_locked),
    checklist: Array.isArray(row.checklist)
      ? (row.checklist as boolean[])
      : [false, false, false, false, false],
    startTime: (row.start_time as string | null) ?? null,
  }
}

// Returns the day's data, OR null if there's no row for that date yet.
// Throws on auth/db error so callers don't treat errors as "empty day"
// (which would let a subsequent save wipe cloud data).
export async function loadDay(date: string): Promise<DayData | null> {
  const user = await getCachedUser()
  if (!user) throw new Error('not_authenticated')
  const supabase = createClient()
  const { data, error } = await supabase
    .from('d2d_days')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', date)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = mapRow(data as Record<string, unknown>)
  return {
    doors: row.doors,
    leads: row.leads,
    closes: row.closes,
    revenue: row.revenue,
    area: row.area,
    areaLocked: row.areaLocked,
    checklist: row.checklist,
    startTime: row.startTime,
  }
}

export async function saveDay(date: string, data: DayData): Promise<void> {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    console.error('[D2D] No authenticated user')
    return
  }

  const payload = {
    user_id: user.id,
    date,
    doors: data.doors,
    leads: data.leads,
    closes: data.closes,
    revenue: data.revenue,
    area: data.area,
    area_locked: data.areaLocked,
    checklist: data.checklist,
    start_time: data.startTime,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('d2d_days')
    .upsert(payload, { onConflict: 'user_id,date' })

  if (error) {
    console.error('[D2D] Save failed:', error.message)
  } else {
    console.log('[D2D] Saved successfully for', date)
  }
}

export async function loadHistory(): Promise<D2DDayRecord[]> {
  const user = await getCachedUser()
  if (!user) return []
  const supabase = createClient()
  const { data, error } = await supabase
    .from('d2d_days')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(365)
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(mapRow)
}
