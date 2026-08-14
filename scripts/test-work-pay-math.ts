/**
 * Work & Pay math tests.
 *
 * Run: node scripts/test-work-pay-math.ts
 * (Node 24 strips TypeScript natively, so no test runner dependency is needed.)
 *
 * Every worked example in the spec is encoded here. If one of these breaks, a
 * payroll number the owner sees is wrong.
 */

import {
  computeEarning,
  computeHours,
  planAllocation,
  payStatus,
  outstanding,
  round2,
  formatHours,
  type OpenEarning,
} from "../lib/work-pay-math.ts"

let pass = 0
let fail = 0

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
    console.log(`  ok   ${label}`)
  } else {
    fail++
    console.log(`  FAIL ${label}\n         expected ${e}\n         actual   ${a}`)
  }
}

const D = (t: string) => `2026-08-01T${t}:00.000Z`

console.log("=== rounding ===")
check("round2 keeps the cent float would lose (0.145)", round2(0.145), 0.15)
check("round2 of 145 exact", round2(7.25 * 20), 145)
check("round2 negative", round2(-1.005), -1.01)

console.log("=== hours ===")
check("7h15m shift, no break", computeHours({ startTime: D("08:00"), endTime: D("15:15") }).hours, 7.25)
check("9h shift minus 60m break", computeHours({ startTime: D("08:00"), endTime: D("17:00"), breakMinutes: 60 }).hours, 8)
check("30m break", computeHours({ startTime: D("08:00"), endTime: D("12:00"), breakMinutes: 30 }).hours, 3.5)
check("override wins over start/end", computeHours({ startTime: D("08:00"), endTime: D("17:00"), hoursOverride: 6 }).hours, 6)
check(
  "override is not reduced by break again",
  computeHours({ hoursOverride: 6, breakMinutes: 60 }).hours,
  6,
)
check(
  "overnight shift 21:00 -> 05:00 is 8h not negative",
  computeHours({ startTime: D("21:00"), endTime: D("05:00") }).hours,
  8,
)
check(
  "break longer than shift yields 0 and warns",
  (() => {
    const r = computeHours({ startTime: D("08:00"), endTime: D("09:00"), breakMinutes: 120 })
    return [r.hours, Boolean(r.warning)]
  })(),
  [0, true],
)
check(
  "missing times yields 0 and warns",
  (() => {
    const r = computeHours({})
    return [r.hours, Boolean(r.warning)]
  })(),
  [0, true],
)
check("formatHours 7.25", formatHours(7.25), "7h 15m")
check("formatHours whole", formatHours(8), "8h")

console.log("=== comp type 1: hourly (spec: 7.5h @ $20 = $150) ===")
check(
  "7.5h @ $20 = 150",
  computeEarning({ compType: "hourly", rate: 20, hours: { hoursOverride: 7.5 } }).amount,
  150,
)
check(
  "spec example: 7h15m @ $20 = 145",
  computeEarning({ compType: "hourly", rate: 20, hours: { startTime: D("08:00"), endTime: D("15:15") } }).amount,
  145,
)
check(
  "hourly with no rate warns",
  computeEarning({ compType: "hourly", rate: 0, hours: { hoursOverride: 5 } }).warnings.length > 0,
  true,
)

console.log("=== comp type 2: full day (spec: $180 for 8:00-17:00) ===")
{
  const r = computeEarning({
    compType: "full_day",
    rate: 180,
    hours: { startTime: D("08:00"), endTime: D("17:00") },
  })
  check("full day pays the day rate", r.amount, 180)
  check("full day still records 9 hours for analysis", r.hours, 9)
  check("longer day does not increase pay", computeEarning({ compType: "full_day", rate: 180, hours: { hoursOverride: 12 } }).amount, 180)
}

console.log("=== comp type 3: per job (spec: $75/job) ===")
check(
  "one job at standard rate = 75",
  computeEarning({ compType: "per_job", rate: 75, jobs: [{ jobId: "a", amountKind: "standard" }] }).amount,
  75,
)
check(
  "two jobs at standard rate = 150",
  computeEarning({
    compType: "per_job",
    rate: 75,
    jobs: [
      { jobId: "a", amountKind: "standard" },
      { jobId: "b", amountKind: "standard" },
    ],
  }).amount,
  150,
)
check(
  "custom amount overrides the standard rate",
  computeEarning({
    compType: "per_job",
    rate: 75,
    jobs: [
      { jobId: "a", amountKind: "standard" },
      { jobId: "b", amountKind: "custom", amount: 120 },
    ],
  }).amount,
  195,
)
check(
  "per_job with no jobs warns",
  computeEarning({ compType: "per_job", rate: 75, jobs: [] }).warnings.length > 0,
  true,
)

console.log("=== comp type 4: hourly + per job bonus (spec: $20/hr + $25 bonus) ===")
check(
  "8h @ $20 + $25 bonus = 185",
  computeEarning({
    compType: "hourly_plus_bonus",
    rate: 20,
    hours: { hoursOverride: 8 },
    jobs: [{ jobId: "a", amountKind: "bonus", amount: 25 }],
  }).amount,
  185,
)
check(
  "non-bonus jobs add no money in bonus mode (no double pay)",
  computeEarning({
    compType: "hourly_plus_bonus",
    rate: 20,
    hours: { hoursOverride: 8 },
    jobs: [
      { jobId: "a", amountKind: "standard" },
      { jobId: "b", amountKind: "standard" },
    ],
  }).amount,
  160,
)
check(
  "multiple bonuses stack",
  computeEarning({
    compType: "hourly_plus_bonus",
    rate: 20,
    hours: { hoursOverride: 8 },
    jobs: [
      { jobId: "a", amountKind: "bonus", amount: 25 },
      { jobId: "b", amountKind: "bonus", amount: 15 },
    ],
  }).amount,
  200,
)

console.log("=== comp type 5: flat (spec: $250) ===")
check("flat pays the flat amount", computeEarning({ compType: "flat", flatAmount: 250 }).amount, 250)
check(
  "flat ignores hours and rate",
  computeEarning({ compType: "flat", flatAmount: 250, rate: 999, hours: { hoursOverride: 40 } }).amount,
  250,
)

console.log("=== rounding happens once, at the end ===")
check(
  "3 x 7.333h @ 19.99 rounds once",
  computeEarning({ compType: "hourly", rate: 19.99, hours: { hoursOverride: 7.333 } }).amount,
  round2(7.333 * 19.99),
)
check(
  "hourly + bonus does not double-round",
  computeEarning({
    compType: "hourly_plus_bonus",
    rate: 19.99,
    hours: { hoursOverride: 7.333 },
    jobs: [{ jobId: "a", amountKind: "bonus", amount: 0.005 }],
  }).amount,
  round2(7.333 * 19.99 + 0.005),
)

console.log("=== partial payments (spec: earned 700, pay 400, owed 300) ===")
check("owed after partial", outstanding({ totalEarned: 700, totalPaid: 400 }), 300)
check("status after partial", payStatus({ totalEarned: 700, totalPaid: 400 }), "partial")
check("owed after the rest", outstanding({ totalEarned: 700, totalPaid: 700 }), 0)
check("status when settled", payStatus({ totalEarned: 700, totalPaid: 700 }), "paid")
check("status when nothing paid", payStatus({ totalEarned: 700, totalPaid: 0 }), "unpaid")
check("overpayment is a credit", payStatus({ totalEarned: 700, totalPaid: 800 }), "credit")
check("outstanding never goes negative", outstanding({ totalEarned: 700, totalPaid: 800 }), 0)

console.log("=== allocation: oldest earning first ===")
const open: OpenEarning[] = [
  { id: "e2", amount: 200, allocated: 0, earnedOn: "2026-08-05" },
  { id: "e1", amount: 100, allocated: 0, earnedOn: "2026-08-01" },
  { id: "e3", amount: 300, allocated: 0, earnedOn: "2026-08-09" },
]
{
  const plan = planAllocation(250, open)
  check("oldest first: 100 then 150", plan.lines, [
    { earningId: "e1", amount: 100 },
    { earningId: "e2", amount: 150 },
  ])
  check("applied all 250", plan.applied, 250)
  check("no leftover", plan.leftoverCredit, 0)
}
{
  const plan = planAllocation(1000, open)
  check("covers everything", plan.applied, 600)
  check("leftover becomes credit", plan.leftoverCredit, 400)
}
{
  const partly: OpenEarning[] = [{ id: "e1", amount: 100, allocated: 60, earnedOn: "2026-08-01" }]
  const plan = planAllocation(100, partly)
  check("respects already-allocated portion", plan.lines, [{ earningId: "e1", amount: 40 }])
  check("credit from the remainder", plan.leftoverCredit, 60)
}
{
  const cents: OpenEarning[] = [
    { id: "a", amount: 0.1, allocated: 0, earnedOn: "2026-08-01" },
    { id: "b", amount: 0.2, allocated: 0, earnedOn: "2026-08-02" },
  ]
  const plan = planAllocation(0.3, cents)
  check("cent math leaves no phantom residue", [plan.applied, plan.leftoverCredit], [0.3, 0])
}
{
  const plan = planAllocation(50, [{ id: "z", amount: 50, allocated: 50, earnedOn: "2026-08-01" }])
  check("fully paid earnings are skipped", [plan.lines.length, plan.leftoverCredit], [0, 50])
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
