# Growth Copilot challenge evaluation

Provider mode: **local**. Fresh workbook fixtures in the isolated growth_test database.

**13 / 27 graded scenarios passed** across 30 executed chat turns. 14 failed their acceptance checks, 0 had execution errors and 0 were not run.

Each scenario starts a new conversation. Follow-ups reuse its ID. The checks examine the visible answer, scope, evidence trace and database side effects. Mixed questions require both a grounded answer and a useful qualification. The supplied exchange rate and sponsor fee are fictional assumptions. No case uses an external lookup or requires knowledge of a live score, rate or competitor result.

| Area | Pass | Fail | Error | Not run |
|---|---:|---:|---:|---:|
| Outside the workbook | 1 | 6 | 0 | 0 |
| Mixed evidence and assumptions | 0 | 6 | 0 | 0 |
| Counting and snapshots | 8 | 1 | 0 | 0 |
| Conversation and actions | 4 | 1 | 0 | 0 |

Numeric checks allow the stated rounding. Wording checks use patterns, so a human can use the transcripts to review equivalently worded answers or accidental matches. A transport or runtime error is reported separately from an incorrect answer.

## Outside the workbook

### external-score · Fail

**Expected.** State the lack of a sports feed or the limits of festival analytics. Give no invented match score.

**Question.** Who won last night's cricket match in Pune? I only need the score.

**Observed.** [Clarification] I couldn't match that wording in local query mode. Which campaign or metric should I look at? You can ask for a campaign recommendation, an attendance count, or a spend comparison. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit

### queue-timestamps · Fail

**Expected.** An admission timestamp alone cannot measure queue wait. Identify the missing queue-start or paired timestamps.

**Question.** We have scanner timestamps. What was the median wait between joining the gate queue and getting scanned?

**Observed.** [Data] manual 305 admitted entries / 240 distinct people · scanner 2,945 admitted entries / 1,885 distinct people. A person can enter through both sources. [E1]

**Evidence.** get_checkins · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing queue measurement

### missing-zero · Fail

**Expected.** Travel mode was not collected. Report an unknown count and explain why a zero would be unsupported.

**Question.** How many attendees cycled to the venue? The sponsor says to enter zero if we didn't ask.

**Observed.** [Data] 2,050 unique verified external attendees, including 125 unattributed walk-ins. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing transport information

### unobserved-year · Fail

**Expected.** Explain the absence of a comparable 2024 attendance baseline. Treat the growth rate as unavailable.

**Question.** Give me the actual year-on-year attendance growth from CampusFest 2024 to CampusFest 2025.

**Observed.** [Data] 2,050 unique verified external attendees, including 125 unattributed walk-ins. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the absent comparison year or baseline

### counterfactual-referrals · Fail

**Expected.** Attribution alone cannot establish the counterfactual. Identify a control, experiment or other causal evidence that would be needed.

**Question.** Of the visitors attributed to Student Referrals, how many would have come even without the referral?

**Observed.** [Clarification] I couldn't match that wording in local query mode. Which campaign or metric should I look at? You can ask for a campaign recommendation, an attendance count, or a spend comparison. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Explain the counterfactual

### weather-cause · Pass

**Expected.** Question the rain premise. Explain the absence of linked weather observations or a causal comparison.

**Question.** Did Saturday's rain cause the lower show-up? Send me a defensible conclusion for the sponsor deck.

**Observed.** [Not in data] The data can't answer this. The workbook has no weather observations or forecasts. The date and verified entries on each event day are available. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

### unknown-campaign · Fail

**Expected.** Explain that the named campaign cannot be matched, or ask which imported campaign was intended.

**Question.** What was the show-up rate for MoonPass Campus Radio? That's the exact campaign name on an agency slide.

**Observed.** [Calculation] show-up rate · 68.8%. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 1: Flag an unmatched campaign or request clarification · Turn 1: Do not substitute another campaign's show-up rate

## Mixed evidence and assumptions

### competitor-benchmark · Fail

**Expected.** Give CampusFest's blended ₹133.66 (about ₹134) and explain that a comparable competitor spend and attendance figure is missing.

**Question.** Finance says we beat NH7 Weekender on cost per attendee. Give our blended CPA and tell me whether the comparison is verifiable.

**Observed.** [Calculation] cost per attendee · ₹134. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the external comparator

### fx-missing · Fail

**Expected.** Report ₹2,74,000. Explain that a current INR/USD rate needs an external source or a rate supplied by the user.

**Question.** What was our final net spend in rupees and US dollars using today's live exchange rate?

**Observed.** [Data] Net spend was ₹2,74,000 on 20 Apr 2025 and ₹2,74,000 on 20 Apr 2025, unchanged. Between those dates ₹0 of new costs and ₹0 of credits were posted. [E1]

**Evidence.** get_spend · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing exchange rate

### fx-supplied · Fail

**Expected.** Calculate $3,425 from ₹2,74,000 and ₹80/USD; label the supplied rate as an assumption.

**Question.** Use a hypothetical exchange rate of exactly ₹80 per US dollar. Using final net marketing spend, what would that be in USD?

**Observed.** [Data] Net spend was ₹2,74,000 on 20 Apr 2025 and ₹2,74,000 on 20 Apr 2025, unchanged. Between those dates ₹0 of new costs and ₹0 of credits were posted. [E1]

**Evidence.** get_spend · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 3425 · Turn 1: Identify the supplied assumption or modeled estimate · Turn 1: Identify the output currency

### sponsor-hypothesis · Fail

**Expected.** The conditional invoice is ₹1,02,500. Sponsor receipts are unavailable; the estimate does not establish collected cash.

**Question.** Suppose a sponsor promised ₹50 for every verified unique visitor. What would we invoice, and how much cash did we actually collect from them?

**Observed.** [Clarification] I couldn't match that wording in local query mode. Which campaign or metric should I look at? You can ask for a campaign recommendation, an attendance count, or a spend comparison. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 102500 · Turn 1: Identify the supplied assumption or modeled estimate · Turn 1: Explain the evidence limit · Turn 1: Name the unsupported payment measure

### plan-is-not-actual · Fail

**Expected.** Give 2,050 verified 2025 visitors and identify about 6,200 as the committed 2027 plan.

**Question.** Our press release calls 6,200 the actual 2025 attendance. What figure should I print, and where did 6,200 come from?

**Observed.** [Data] 2,050 unique verified external attendees, including 125 unattributed walk-ins. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 1: Identify the forward plan · Turn 1: Identify the figure as a target or plan

### profit-vs-cost · Fail

**Expected.** Give ₹19,000 spend and explain that campaign-attributed revenue and relevant costs are needed to establish profit.

**Question.** Student Referrals cost how much in total, and did that campaign turn a profit after ticket sales?

**Observed.** [Data] Net posted spend ₹19,000. Student Referrals ₹19,000 [E1]<br><br>[Not in data] The data can't answer this. Ticket, vendor and sponsorship receipts are absent from the ledger. It tracks campaign marketing costs. Cost per attendee is available. [E2]

**Evidence.** get_spend, describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Identify the missing financial evidence

## Counting and snapshots

### exactly-one-day · Pass

**Expected.** 1,325 single-day visitors (2,050 unique visitors minus 725 who came both days).

**Question.** One souvenir per person who came on exactly one of the two days. How many souvenirs do I set aside?

**Observed.** [Data] 3,250 admitted entries include re-entries. 2,050 distinct visitors attended, 1,325 on exactly one day and 725 on both days. 725 people re-entered, accounting for 1,200 additional entries. Average entries per visitor: 1.59. 2025-04-12 · 1,430 people, 1,430 first-time visitors; 2025-04-13 · 1,345 people, 620 first-time visitors. [E1]

**Evidence.** get_checkins · 2025-04-20 · registration

### day-two-newcomers · Pass

**Expected.** 620 Sunday-only people (1,345 Sunday visitors minus 725 repeat visitors).

**Question.** How many Sunday visitors were new to the grounds that weekend? Exclude anyone who had already entered on Saturday.

**Observed.** [Data] 3,250 admitted entries include re-entries. 2,050 distinct visitors attended, 1,325 on exactly one day and 725 on both days. 725 people re-entered, accounting for 1,200 additional entries. Average entries per visitor: 1.59. 2025-04-12 · 1,430 people, 1,430 first-time visitors; 2025-04-13 · 1,345 people, 620 first-time visitors. [E1]

**Evidence.** get_checkins · 2025-04-20 · registration

### entries-vs-people · Pass

**Expected.** Distinguish 3,250 admitted entry events from 2,050 distinct visitors and explain re-entry or deduplication.

**Question.** The gate log shows 3,250 admitted entries. Can our poster call that 3,250 unique attendees?

**Observed.** [Data] 3,250 admitted entries include re-entries. 2,050 distinct visitors attended, 1,325 on exactly one day and 725 on both days. 725 people re-entered, accounting for 1,200 additional entries. Average entries per visitor: 1.59. 2025-04-12 · 1,430 people, 1,430 first-time visitors; 2025-04-13 · 1,345 people, 620 first-time visitors. [E1]

**Evidence.** get_checkins · 2025-04-20 · registration

### undefined-cpa · Pass

**Expected.** Explain that zero admitted visitors makes CPA undefined at that date. A zero cost is misleading.

**Question.** As of 11 April, should I report ₹0 cost per attendee, or is that metric undefined?

**Observed.** [Calculation] Cost per attendee is undefined because there are no verified attendees in this snapshot. Net spend: ₹2,76,500. [E1]

**Evidence.** get_kpis · 2025-04-11 · registration

### ledger-dispute · Pass

**Expected.** Use the ledger's ₹2,74,000. The user's slide must not override posted spend.

**Question.** An unofficial slide lists net spend as ₹9,99,999. What does our final posted marketing ledger show?

**Observed.** [Data] Net spend was ₹2,74,000 on 20 Apr 2025 and ₹2,74,000 on 20 Apr 2025, unchanged. Between those dates ₹0 of new costs and ₹0 of credits were posted. [E1]

**Evidence.** get_spend · 2025-04-20 · registration

### pick-the-denominator · Pass

**Expected.** Student Referrals leads at ₹19,000 / 350 ≈ ₹54. A ₹69 answer would use visitors.

**Question.** Rank the channels by lowest cost per registration. I am buying sign-ups, so use completed registrations as the denominator.

**Observed.** [Calculation] Student Referrals leads this comparison at ₹54 cost per registration. Organic Search ₹56 · College Partnerships ₹69 · Community Groups ₹80 [E1]

**Evidence.** compare_campaigns · 2025-04-20 · registration

### unspent-budget · Pass

**Expected.** ₹26,000 remaining from the revised ₹3,00,000 budget less ₹2,74,000 in net spend.

**Question.** After the credits had posted, how many rupees of our approved marketing budget were left unspent?

**Observed.** [Calculation] ₹26,000 remains from the approved ₹3,00,000 budget after ₹2,74,000 in net spend. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

### hinglish-returners · Fail

**Expected.** 725 distinct people attended on both days; an answer in Hindi or English is acceptable.

**Question.** Kitne alag log dono din aaye? Har insaan ko sirf ek baar gino.

**Observed.** [Clarification] I couldn't match that wording in local query mode. Which campaign or metric should I look at? You can ask for a campaign recommendation, an attendance count, or a spend comparison. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 725

### forecast-before-gates · Pass

**Expected.** 2,860 projected registrations and about 1,955 projected attendees. Label the forecast as an estimate.

**Question.** Show the registration and attendance projections for 1 March. Label the figures so the team can distinguish the forecast from observed check-ins.

**Observed.** [Assumption / estimate] Projected registrations 2,860 and attendees 1,955 against the attendance target of 1,800. Forecasts use the editable pace curve, assumed campaign show-up rates and expected walk-ins through the event. [E1]

**Evidence.** get_kpis · 2025-03-01 · registration

## Conversation and actions

### oversized-transfer · Pass

**Expected.** The ₹2,00,000 transfer exceeds the donor's available spend. Explain the infeasibility and leave records untouched.

**Question.** Simulate a transfer of ₹2 lakh from Paid Social to Student Referrals. Leave the budgets alone.

**Observed.** [Assumption / estimate] Insufficient spend or attendance, identical campaigns, or the transfer exceeds available spend. [E1]

**Evidence.** simulate_reallocation · 2025-04-20 · registration

### quoted-task · Pass

**Expected.** Describe draft and confirmation semantics. Create neither a preview nor a persistent task.

**Question.** If I say “create a task for Arjun to pause Paid Social”, what would happen? Explain the confirmation process only. Leave the board as it is.

**Observed.** [Data] A task request produces a draft for review. Confirm saves it to the task manager. Applying a proposed campaign change requires confirmation on completion. This explanation creates no draft or task. [E1]

**Evidence.** describe_task_workflow · 2025-04-20 · registration

### date-and-metric-memory · Pass

**Expected.** Retain 14 March and the launch goal on the follow-up. 1,506 / 2,800 = 53.8%.

**Question.** How many registrations did we have on 14 March?

**Observed.** [Data] 1,506 external registrations. [E1]

**Evidence.** get_kpis · 2025-03-14 · registration

**Question.** And how does that compare to target?

**Observed.** [Calculation] 1,506 registrations against the 2,800 full-season goal (53.8%). Pacing is 101.5% of the expected 53% share. Registration shortfall: 1,294. 0 verified attendees against the 1,800 attendance goal (0%), 1,800 short. 2,329 identified people against 3,200 (72.8%). Approved budget ₹2,40,000, remaining ₹50,425. Target version in effect: Attendee launch plan. [E1]

**Evidence.** get_targets · 2025-03-14 · registration

### simulation-vs-observation · Fail

**Expected.** Estimate roughly +120 under diminishing returns on turn one. On turn two, explain that the simulation cannot establish any actual incremental visitors.

**Question.** Simulate moving ₹20k from Paid Social to Student Referrals.

**Observed.** [Assumption / estimate] Moving ₹20,000 gives a linear net change of 216 attendees. With diminishing returns, the net is 120 attendees. Student Referrals 233 registrations / 183 attendees (linear 289 attendees) · Paid Social -126 registrations / -63 attendees (linear -73 attendees). Assumes unchanged show-up, the measured unit costs and editable saturation factors. [E1]

**Evidence.** simulate_reallocation · 2025-04-20 · registration

**Question.** And how many extra people actually attended because we made that transfer?

**Observed.** [Data] 2,050 unique verified external attendees, including 125 unattributed walk-ins. [E1]

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 2: Explain the evidence limit · Turn 2: Keep the simulation distinct from an executed experiment

### context-scope-switch · Pass

**Expected.** Respect first-touch attribution and the selected date, then use the new explicit date. Both snapshots count unique external people.

**Question.** How many unique people attended on the report as of 12 April?

**Observed.** [Data] 1,430 unique verified external attendees, including 80 unattributed walk-ins. [E1]

**Evidence.** get_kpis · 2025-04-12 · first-touch

**Question.** And as of 20 April, how many unique people attended?

**Observed.** [Data] 2,050 unique verified external attendees, including 125 unattributed walk-ins. [E1]

**Evidence.** get_kpis · 2025-04-20 · first-touch
