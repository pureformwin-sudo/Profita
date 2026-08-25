// Exercises the real estimator module (not a reimplementation) on live data.
process.env.NEXT_RUNTIME = 'nodejs'
async function main() {
  const { estimateHomeValue, hasOwnLocality } = await import('../lib/home-value-estimator')
  const cases = [
    '10543 Keats Ave Clovis, CA 93619',  // complete -> expect property
    '3096 Kenosha Ave',                   // no locality -> must NOT be property
  ]
  for (const addr of cases) {
    console.log(`\n##### ${addr}`)
    console.log('hasOwnLocality:', hasOwnLocality(addr))
    try {
      const r = await estimateHomeValue(addr)
      console.log('basis           :', r.basis)
      console.log('confidence      :', r.confidence)
      console.log('estimate        :', r.estimateUsd)
      console.log('range           :', r.lowUsd, '-', r.highUsd)
      console.log('localityAssumed :', r.localityAssumed)
      console.log('searches        :', r.searchCount)
      console.log('note            :', r.note.slice(0,200))
      if (r.localityAssumed && r.basis === 'property') console.log('!!! GUARD FAILED')
      else if (r.localityAssumed) console.log('>>> guard held: demoted to', r.basis)
    } catch (e) {
      console.log('ERROR:', e instanceof Error ? e.message : e)
    }
  }
}
main()
