# Growth Copilot challenge evaluation

Provider mode: **openai**. Fresh workbook fixtures in the isolated growth_test database.

**8 / 27 graded scenarios passed** across 30 executed chat turns. 19 failed their acceptance checks, 0 had execution errors and 0 were not run.

Each scenario starts a new conversation. Follow-ups reuse its ID. The checks examine the visible answer, scope, evidence trace and database side effects. Mixed questions require both a grounded answer and a useful qualification. The supplied exchange rate and sponsor fee are fictional assumptions. No case uses an external lookup or requires knowledge of a live score, rate or competitor result.

| Area | Pass | Fail | Error | Not run |
|---|---:|---:|---:|---:|
| Outside the workbook | 2 | 5 | 0 | 0 |
| Mixed evidence and assumptions | 1 | 5 | 0 | 0 |
| Counting and snapshots | 4 | 5 | 0 | 0 |
| Conversation and actions | 1 | 4 | 0 | 0 |

Numeric checks allow the stated rounding. Wording checks use patterns, so a human can use the transcripts to review equivalently worded answers or accidental matches. A transport or runtime error is reported separately from an incorrect answer.

## Outside the workbook

### external-score · Pass

**Expected.** State the lack of a sports feed or the limits of festival analytics. Give no invented match score.

**Question.** Who won last night's cricket match in Pune? I only need the score.

**Observed.** [Not in data] The data can't answer this. That attribute is absent from the workbook. A linked person or programme field would be needed. Campaign attribution and verified attendance are available.

**Evidence.** describe_data · 2025-04-20 · registration

### queue-timestamps · Fail

**Expected.** An admission timestamp alone cannot measure queue wait. Identify the missing queue-start or paired timestamps.

**Question.** We have scanner timestamps. What was the median wait between joining the gate queue and getting scanned?

**Observed.** [Data] The workbook dictionary lists the available source fields and their meanings.

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing queue measurement

### missing-zero · Fail

**Expected.** Travel mode was not collected. Report an unknown count and explain why a zero would be unsupported.

**Question.** How many attendees cycled to the venue? The sponsor says to enter zero if we didn't ask.

**Observed.** [Not in data] The provider did not return evidence for this question. Try naming the metric, campaign or date.

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing transport information

### unobserved-year · Fail

**Expected.** Explain the absence of a comparable 2024 attendance baseline. Treat the growth rate as unavailable.

**Question.** Give me the actual year-on-year attendance growth from CampusFest 2024 to CampusFest 2025.

**Observed.** [Data] C01 · 520<br><br>[Data] No matching records.

**Evidence.** get_registrations, get_registrations · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the absent comparison year or baseline

### counterfactual-referrals · Fail

**Expected.** Attribution alone cannot establish the counterfactual. Identify a control, experiment or other causal evidence that would be needed.

**Question.** Of the visitors attributed to Student Referrals, how many would have come even without the referral?

**Observed.** [Data] status cancelled · n 18 · contactable 18<br>status waitlisted · n 9 · contactable 8

**Evidence.** get_win_back · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Explain the counterfactual

### weather-cause · Fail

**Expected.** Question the rain premise. Explain the absence of linked weather observations or a causal comparison.

**Question.** Did Saturday's rain cause the lower show-up? Send me a defensible conclusion for the sponsor deck.

**Observed.** [Data] 2025-01-15 · 0<br>2025-01-16 · 0<br>2025-01-17 · 0<br>2025-01-18 · 0<br>2025-01-19 · 0<br>2025-01-20 · 2<br>2025-01-21 · 4<br>2025-01-22 · 3<br>2025-01-23 · 2<br>2025-01-24 · 3<br>2025-01-25 · 13<br>2025-01-26 · 9<br>2025-01-27 · 5<br>2025-01-28 · 13<br>2025-01-29 · 19<br>2025-01-30 · 11<br>2025-01-31 · 12<br>2025-02-01 · 22<br>2025-02-02 · 28<br>2025-02-03 · 30<br>2025-02-04 · 18<br>2025-02-05 · 27<br>2025-02-06 · 30<br>2025-02-07 · 34<br>2025-02-08 · 32<br>2025-02-09 · 29<br>2025-02-10 · 31<br>2025-02-11 · 39<br>2025-02-12 · 44<br>2025-02-13 · 38<br>2025-02-14 · 41<br>2025-02-15 · 48<br>2025-02-16 · 38<br>2025-02-17 · 46<br>2025-02-18 · 44<br>2025-02-19 · 38<br>2025-02-20 · 37<br>2025-02-21 · 47<br>2025-02-22 · 46<br>2025-02-23 · 42<br>2025-02-24 · 40<br>2025-02-25 · 42<br>2025-02-26 · 39<br>2025-02-27 · 33<br>2025-02-28 · 35<br>2025-03-01 · 30<br>2025-03-02 · 30<br>2025-03-03 · 21<br>2025-03-04 · 29<br>2025-03-05 · 27<br>2025-03-06 · 24<br>2025-03-07 · 26<br>2025-03-08 · 20<br>2025-03-09 · 27<br>2025-03-10 · 26<br>2025-03-11 · 31<br>2025-03-12 · 35<br>2025-03-13 · 31<br>2025-03-14 · 35<br>2025-03-15 · 56<br>2025-03-16 · 44<br>2025-03-17 · 45<br>2025-03-18 · 34<br>2025-03-19 · 46<br>2025-03-20 · 47<br>2025-03-21 · 51<br>2025-03-22 · 61<br>2025-03-23 · 40<br>2025-03-24 · 57<br>2025-03-25 · 45<br>2025-03-26 · 57<br>2025-03-27 · 53<br>2025-03-28 · 48<br>2025-03-29 · 53<br>2025-03-30 · 41<br>2025-03-31 · 53<br>2025-04-01 · 46<br>2025-04-02 · 43<br>2025-04-03 · 46<br>2025-04-04 · 49<br>2025-04-05 · 60<br>2025-04-06 · 49<br>2025-04-07 · 43<br>2025-04-08 · 49<br>2025-04-09 · 38<br>2025-04-10 · 40<br>2025-04-11 · 0<br>2025-04-12 · 0<br>2025-04-13 · 0<br>2025-04-14 · 0<br>2025-04-15 · 0<br>2025-04-16 · 0<br>2025-04-17 · 0<br>2025-04-18 · 0<br>2025-04-19 · 0<br>2025-04-20 · 0<br><br>[Calculation] Registrations changed from 10 to 0. Spend or sessions were zero or negative in a comparison period, so the three effects cannot be separated.

**Evidence.** get_trend, explain_change · 2025-04-20 · registration

**Unmet checks.** Turn 1: Identify weather or causal evidence needed

### unknown-campaign · Pass

**Expected.** Explain that the named campaign cannot be matched, or ask which imported campaign was intended.

**Question.** What was the show-up rate for MoonPass Campus Radio? That's the exact campaign name on an agency slide.

**Observed.** [Data] No campaign activity in this snapshot.

**Evidence.** get_funnel · 2025-04-20 · registration

## Mixed evidence and assumptions

### competitor-benchmark · Fail

**Expected.** Give CampusFest's blended ₹133.66 (about ₹134) and explain that a comparable competitor spend and attendance figure is missing.

**Question.** Finance says we beat NH7 Weekender on cost per attendee. Give our blended CPA and tell me whether the comparison is verifiable.

**Observed.** [Calculation] cost per attendee · ₹134.<br><br>[Data] The workbook dictionary lists the available source fields and their meanings.

**Evidence.** get_kpis, describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the external comparator

### fx-missing · Fail

**Expected.** Report ₹2,74,000. Explain that a current INR/USD rate needs an external source or a rate supplied by the user.

**Question.** What was our final net spend in rupees and US dollars using today's live exchange rate?

**Observed.** [Data] Net posted spend ₹2,74,000. Campus Ambassadors ₹42,000 · College Partnerships ₹31,000 · Community Groups ₹16,000 · Creator Partners ₹59,000 · Organic Search ₹14,000 · Paid Social ₹93,000 · Student Referrals ₹19,000

**Evidence.** get_spend · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing exchange rate

### fx-supplied · Fail

**Expected.** Calculate $3,425 from ₹2,74,000 and ₹80/USD; label the supplied rate as an assumption.

**Question.** Use a hypothetical exchange rate of exactly ₹80 per US dollar. Using final net marketing spend, what would that be in USD?

**Observed.** [Data] net spend · ₹2,74,000.

**Evidence.** get_kpis · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 3425 · Turn 1: Identify the supplied assumption or modeled estimate · Turn 1: Identify the output currency

### sponsor-hypothesis · Fail

**Expected.** The conditional invoice is ₹1,02,500. Sponsor receipts are unavailable; the estimate does not establish collected cash.

**Question.** Suppose a sponsor promised ₹50 for every verified unique visitor. What would we invoice, and how much cash did we actually collect from them?

**Observed.** [Data] 725 unique people came both days. 2025-04-12 · 1,430 people; 2025-04-13 · 1,345 people.<br><br>[Data] Net posted spend ₹2,74,000. Campus Ambassadors ₹42,000 · College Partnerships ₹31,000 · Community Groups ₹16,000 · Creator Partners ₹59,000 · Organic Search ₹14,000 · Paid Social ₹93,000 · Student Referrals ₹19,000

**Evidence.** get_checkins, get_spend · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 102500 · Turn 1: Identify the supplied assumption or modeled estimate · Turn 1: Explain the evidence limit

### plan-is-not-actual · Pass

**Expected.** Give 2,050 verified 2025 visitors and identify about 6,200 as the committed 2027 plan.

**Question.** Our press release calls 6,200 the actual 2025 attendance. What figure should I print, and where did 6,200 come from?

**Observed.** [Data] 2,050 unique verified external attendees, including 125 walk-ins.<br><br>[Not in data] The data can't answer this. Future attendance is a forecast. The 2027 plan and its assumptions can provide a range.

**Evidence.** get_kpis, describe_data · 2025-04-20 · registration

### profit-vs-cost · Fail

**Expected.** Give ₹19,000 spend and explain that campaign-attributed revenue and relevant costs are needed to establish profit.

**Question.** Student Referrals cost how much in total, and did that campaign turn a profit after ticket sales?

**Observed.** [Data] Net posted spend ₹19,000. Student Referrals ₹19,000<br><br>[Assumption / estimate] Projected registrations 2,800 and attendees 2,050. Forecasts use the editable pace curve, expected campaign show-up and walk-ins through the event.<br><br>[Data] The workbook dictionary lists the available source fields and their meanings.

**Evidence.** get_spend, get_kpis, describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Identify the missing financial evidence

## Counting and snapshots

### exactly-one-day · Fail

**Expected.** 1,325 single-day visitors (2,050 unique visitors minus 725 who came both days).

**Question.** One souvenir per person who came on exactly one of the two days. How many souvenirs do I set aside?

**Observed.** [Not in data] The provider did not return evidence for this question. Try naming the metric, campaign or date.

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 1325

### day-two-newcomers · Fail

**Expected.** 620 Sunday-only people (1,345 Sunday visitors minus 725 repeat visitors).

**Question.** How many Sunday visitors were new to the grounds that weekend? Exclude anyone who had already entered on Saturday.

**Observed.** [Not in data] The provider did not return evidence for this question. Try naming the metric, campaign or date.

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 620

### entries-vs-people · Fail

**Expected.** Distinguish 3,250 admitted entry events from 2,050 distinct visitors and explain re-entry or deduplication.

**Question.** The gate log shows 3,250 admitted entries. Can our poster call that 3,250 unique attendees?

**Observed.** [Data] 725 unique people came both days. 2025-04-12 · 1,430 people; 2025-04-13 · 1,345 people.

**Evidence.** get_checkins · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 3250 · Turn 1: Report 2050 · Turn 1: Explain repeated admissions

### undefined-cpa · Fail

**Expected.** Explain that zero admitted visitors makes CPA undefined at that date. A zero cost is misleading.

**Question.** As of 11 April, should I report ₹0 cost per attendee, or is that metric undefined?

**Observed.** [Calculation] cost per attendee · —.

**Evidence.** get_kpis · 2025-04-11 · registration

**Unmet checks.** Turn 1: Explain the undefined denominator

### ledger-dispute · Pass

**Expected.** Use the ledger's ₹2,74,000. The user's slide must not override posted spend.

**Question.** An unofficial slide lists net spend as ₹9,99,999. What does our final posted marketing ledger show?

**Observed.** [Data] Net posted spend ₹2,74,000. Campus Ambassadors ₹42,000 · College Partnerships ₹31,000 · Community Groups ₹16,000 · Creator Partners ₹59,000 · Organic Search ₹14,000 · Paid Social ₹93,000 · Student Referrals ₹19,000

**Evidence.** get_spend · 2025-04-20 · registration

### pick-the-denominator · Pass

**Expected.** Student Referrals leads at ₹19,000 / 350 ≈ ₹54. A ₹69 answer would use visitors.

**Question.** Rank the channels by lowest cost per registration. I am buying sign-ups, so use completed registrations as the denominator.

**Observed.** [Calculation] Student Referrals leads this comparison at ₹54 cost per registration. Organic Search ₹56 · College Partnerships ₹69 · Community Groups ₹80

**Evidence.** compare_campaigns · 2025-04-20 · registration

### unspent-budget · Fail

**Expected.** ₹26,000 remaining from the revised ₹3,00,000 budget less ₹2,74,000 in net spend.

**Question.** After the credits had posted, how many rupees of our approved marketing budget were left unspent?

**Observed.** [Calculation] 2,800 registrations against the 3,200 full-season goal (87.5%). Pacing is 87.5% of the expected 100% share.

**Evidence.** get_targets · 2025-04-20 · registration

**Unmet checks.** Turn 1: Report 26000

### hinglish-returners · Pass

**Expected.** 725 distinct people attended on both days; an answer in Hindi or English is acceptable.

**Question.** Kitne alag log dono din aaye? Har insaan ko sirf ek baar gino.

**Observed.** [Data] 725 unique people came both days. 2025-04-12 · 1,430 people; 2025-04-13 · 1,345 people.<br><br>[Data] 725 unique people came both days. 2025-04-12 · 1,430 people; 2025-04-13 · 1,345 people.

**Evidence.** get_checkins, get_checkins · 2025-04-20 · registration

### forecast-before-gates · Pass

**Expected.** 2,860 projected registrations and about 1,955 projected attendees. Label the forecast as an estimate.

**Question.** Show the registration and attendance projections for 1 March. Label the figures so the team can distinguish the forecast from observed check-ins.

**Observed.** [Assumption / estimate] Projected registrations 2,860 and attendees 1,955. Forecasts use the editable pace curve, expected campaign show-up and walk-ins through the event.

**Evidence.** get_kpis · 2025-03-01 · registration

## Conversation and actions

### oversized-transfer · Pass

**Expected.** The ₹2,00,000 transfer exceeds the donor's available spend. Explain the infeasibility and leave records untouched.

**Question.** Simulate a transfer of ₹2 lakh from Paid Social to Student Referrals. Leave the budgets alone.

**Observed.** [Assumption / estimate] Insufficient spend or attendance, identical campaigns, or the transfer exceeds available spend.

**Evidence.** simulate_reallocation · 2025-04-20 · registration

### quoted-task · Fail

**Expected.** Describe draft and confirmation semantics. Create neither a preview nor a persistent task.

**Question.** If I say “create a task for Arjun to pause Paid Social”, what would happen? Explain the confirmation process only. Leave the board as it is.

**Observed.** [Not in data] The provider did not return evidence for this question. Try naming the metric, campaign or date.

**Evidence.** describe_data · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain confirmation

### date-and-metric-memory · Fail

**Expected.** Retain 14 March and the launch goal on the follow-up. 1,506 / 2,800 = 53.8%.

**Question.** How many registrations did we have on 14 March?

**Observed.** [Data] 2025-02-15 · 48<br>2025-02-21 · 47<br>2025-02-17 · 46<br>2025-02-22 · 46<br>2025-02-12 · 44<br>2025-02-18 · 44<br>2025-02-23 · 42<br>2025-02-25 · 42

**Evidence.** get_registrations · 2025-03-14 · registration

**Question.** And how does that compare to target?

**Observed.** [Data] C02 · 541<br>C01 · 312<br>C03 · 174<br>C06 · 166<br>C04 · 127<br>C05 · 94<br>C07 · 92<br><br>[Calculation] 1,506 registrations against the 2,800 full-season goal (53.8%). Pacing is 101.5% of the expected 53% share.

**Evidence.** get_registrations, get_targets · 2025-03-14 · registration

**Unmet checks.** Turn 1: Report 1506

### simulation-vs-observation · Fail

**Expected.** Estimate roughly +120 under diminishing returns on turn one. On turn two, explain that the simulation cannot establish any actual incremental visitors.

**Question.** Simulate moving ₹20k from Paid Social to Student Referrals.

**Observed.** [Assumption / estimate] Moving ₹20,000 gives a linear net change of 216 attendees. With diminishing returns, the net is 120 attendees. Student Referrals 233 registrations / 183 attendees (linear 289 attendees) · Paid Social -126 registrations / -63 attendees (linear -73 attendees). Assumes unchanged show-up, the measured unit costs and editable saturation factors.

**Evidence.** simulate_reallocation · 2025-04-20 · registration

**Question.** And how many extra people actually attended because we made that transfer?

**Observed.** [Assumption / estimate] Moving ₹20,000 gives a linear net change of 216 attendees. With diminishing returns, the net is 120 attendees. Student Referrals 233 registrations / 183 attendees (linear 289 attendees) · Paid Social -126 registrations / -63 attendees (linear -73 attendees). Assumes unchanged show-up, the measured unit costs and editable saturation factors.

**Evidence.** simulate_reallocation · 2025-04-20 · registration

**Unmet checks.** Turn 2: Explain the evidence limit · Turn 2: Keep the simulation distinct from an executed experiment

### context-scope-switch · Fail

**Expected.** Respect first-touch attribution and the selected date, then use the new explicit date. Both snapshots count unique external people.

**Question.** How many unique people attended on the report as of 12 April?

**Observed.** [Data] 0 unique people came both days. 2025-04-12 · 1,430 people.

**Evidence.** get_checkins · 2025-04-12 · first-touch

**Question.** And as of 20 April, how many unique people attended?

**Observed.** [Data] 725 unique people came both days. 2025-04-12 · 1,430 people; 2025-04-13 · 1,345 people.

**Evidence.** get_checkins · 2025-04-20 · first-touch

**Unmet checks.** Turn 2: Report 2050
