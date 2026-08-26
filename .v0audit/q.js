const { Client } = require('pg')

;(async () => {
  const url = process.env.POSTGRES_URL_NON_POOLING.replace(/[?&]sslmode=[^&]*/, '')
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()

  // Rows that cost full search spend and returned nothing usable.
  const none = await c.query(
    `select address_used, confidence_note from lead_scores where value_basis='none'`,
  )
  console.log('=== paid but no value (basis none) ===')
  none.rows.forEach((r) => console.log('  addr:', JSON.stringify(r.address_used)))

  // Area-basis rows: paid property-level search cost, got a neighborhood median.
  const area = await c.query(
    `select address_used from lead_scores where value_basis='area' limit 6`,
  )
  console.log('=== paid, downgraded to area median ===')
  area.rows.forEach((r) => console.log('  addr:', JSON.stringify(r.address_used)))

  // How many customers remain unestimated? Drives the projected spend.
  const remaining = await c.query(`
    select count(*)::int n from customers cu
    where cu.company_id = (select company_id from lead_scores limit 1)
      and cu.id not in (select customer_id from lead_scores)
  `)
  console.log('=== remaining customers with no estimate ===')
  console.log('  count:', remaining.rows[0].n)

  const totalCust = await c.query(
    `select count(*)::int n from customers where company_id=(select company_id from lead_scores limit 1)`,
  )
  console.log('  total customers:', totalCust.rows[0].n)

  await c.end()
})().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
