# Growth Copilot challenge evaluation

Provider mode: **openai**. Fresh workbook fixtures in the isolated growth_test database.

**No answer-quality score is available** across 1 executed chat turns. 0 failed their acceptance checks, 1 had execution errors and 26 were not run.

Each scenario starts a new conversation. Follow-ups reuse its ID. The checks examine the visible answer, scope, evidence trace and database side effects. Mixed questions require both a grounded answer and a useful qualification. The supplied exchange rate and sponsor fee are fictional assumptions. No case uses an external lookup or requires knowledge of a live score, rate or competitor result.

| Area | Pass | Fail | Error | Not run |
|---|---:|---:|---:|---:|
| Outside the workbook | 0 | 0 | 1 | 6 |
| Mixed evidence and assumptions | 0 | 0 | 0 | 6 |
| Counting and snapshots | 0 | 0 | 0 | 9 |
| Conversation and actions | 0 | 0 | 0 | 5 |

Numeric checks allow the stated rounding. Wording checks use patterns, so a human can use the transcripts to review equivalently worded answers or accidental matches. A transport or runtime error is reported separately from an incorrect answer.

## Outside the workbook

### external-score · Error

**Expected.** State the lack of a sports feed or the limits of festival analytics. Give no invented match score.

**Question.** Who won last night's cricket match in Pune? I only need the score.

**Execution error.** fetch failed (EACCES)

### queue-timestamps · Not run

**Expected.** An admission timestamp alone cannot measure queue wait. Identify the missing queue-start or paired timestamps.

### missing-zero · Not run

**Expected.** Travel mode was not collected. Report an unknown count and explain why a zero would be unsupported.

### unobserved-year · Not run

**Expected.** Explain the absence of a comparable 2024 attendance baseline. Treat the growth rate as unavailable.

### counterfactual-referrals · Not run

**Expected.** Attribution alone cannot establish the counterfactual. Identify a control, experiment or other causal evidence that would be needed.

### weather-cause · Not run

**Expected.** Question the rain premise. Explain the absence of linked weather observations or a causal comparison.

### unknown-campaign · Not run

**Expected.** Explain that the named campaign cannot be matched, or ask which imported campaign was intended.

## Mixed evidence and assumptions

### competitor-benchmark · Not run

**Expected.** Give CampusFest's blended ₹133.66 (about ₹134) and explain that a comparable competitor spend and attendance figure is missing.

### fx-missing · Not run

**Expected.** Report ₹2,74,000. Explain that a current INR/USD rate needs an external source or a rate supplied by the user.

### fx-supplied · Not run

**Expected.** Calculate $3,425 from ₹2,74,000 and ₹80/USD; label the supplied rate as an assumption.

### sponsor-hypothesis · Not run

**Expected.** The conditional invoice is ₹1,02,500. Sponsor receipts are unavailable; the estimate does not establish collected cash.

### plan-is-not-actual · Not run

**Expected.** Give 2,050 verified 2025 visitors and identify about 6,200 as the committed 2027 plan.

### profit-vs-cost · Not run

**Expected.** Give ₹19,000 spend and explain that campaign-attributed revenue and relevant costs are needed to establish profit.

## Counting and snapshots

### exactly-one-day · Not run

**Expected.** 1,325 single-day visitors (2,050 unique visitors minus 725 who came both days).

### day-two-newcomers · Not run

**Expected.** 620 Sunday-only people (1,345 Sunday visitors minus 725 repeat visitors).

### entries-vs-people · Not run

**Expected.** Distinguish 3,250 admitted entry events from 2,050 distinct visitors and explain re-entry or deduplication.

### undefined-cpa · Not run

**Expected.** Explain that zero admitted visitors makes CPA undefined at that date. A zero cost is misleading.

### ledger-dispute · Not run

**Expected.** Use the ledger's ₹2,74,000. The user's slide must not override posted spend.

### pick-the-denominator · Not run

**Expected.** Student Referrals leads at ₹19,000 / 350 ≈ ₹54. A ₹69 answer would use visitors.

### unspent-budget · Not run

**Expected.** ₹26,000 remaining from the revised ₹3,00,000 budget less ₹2,74,000 in net spend.

### hinglish-returners · Not run

**Expected.** 725 distinct people attended on both days; an answer in Hindi or English is acceptable.

### forecast-before-gates · Not run

**Expected.** 2,860 projected registrations and about 1,955 projected attendees. Label the forecast as an estimate.

## Conversation and actions

### oversized-transfer · Not run

**Expected.** The ₹2,00,000 transfer exceeds the donor's available spend. Explain the infeasibility and leave records untouched.

### quoted-task · Not run

**Expected.** Describe draft and confirmation semantics. Create neither a preview nor a persistent task.

### date-and-metric-memory · Not run

**Expected.** Retain 14 March and the launch goal on the follow-up. 1,506 / 2,800 = 53.8%.

### simulation-vs-observation · Not run

**Expected.** Estimate roughly +120 under diminishing returns on turn one. On turn two, explain that the simulation cannot establish any actual incremental visitors.

### context-scope-switch · Not run

**Expected.** Respect first-touch attribution and the selected date, then use the new explicit date. Both snapshots count unique external people.
