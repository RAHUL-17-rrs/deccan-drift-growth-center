# Growth Copilot challenge evaluation

Provider mode: **openai**. Fresh workbook fixtures in the isolated growth_test database.

**22 / 27 graded scenarios passed** across 30 executed chat turns. 5 failed their acceptance checks, 0 had execution errors and 0 were not run.

Each scenario starts a new conversation. Follow-ups reuse its ID. The checks examine the visible answer, scope, evidence trace and database side effects. Mixed questions require both a grounded answer and a useful qualification. The supplied exchange rate and sponsor fee are fictional assumptions. No case uses an external lookup or requires knowledge of a live score, rate or competitor result.

| Area | Pass | Fail | Error | Not run |
|---|---:|---:|---:|---:|
| Outside the workbook | 5 | 2 | 0 | 0 |
| Mixed evidence and assumptions | 4 | 2 | 0 | 0 |
| Counting and snapshots | 9 | 0 | 0 | 0 |
| Conversation and actions | 4 | 1 | 0 | 0 |

Numeric checks allow the stated rounding. Wording checks use patterns, so a human can use the transcripts to review equivalently worded answers or accidental matches. A transport or runtime error is reported separately from an incorrect answer.

## Outside the workbook

### external-score · Pass

**Expected.** State the lack of a sports feed or the limits of festival analytics. Give no invented match score.

**Question.** Who won last night's cricket match in Pune? I only need the score.

**Observed.** [Not in data] The available data does not include real-time sports scores or any information about last night's cricket match in Pune. Therefore, I cannot provide the score or winner of that match. My data focuses on event registrations, attendance, and marketing campaign metrics. If you have questions related to those, I can help. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

### queue-timestamps · Pass

**Expected.** An admission timestamp alone cannot measure queue wait. Identify the missing queue-start or paired timestamps.

**Question.** We have scanner timestamps. What was the median wait between joining the gate queue and getting scanned?

**Observed.** [Data] The current data dictionary and available clean views do not include explicit fields or measurements for the queue join time or wait time until scanning at the event gate entrance. The data covers registrations, check-ins, scan sources, and admission timestamps (verified entries), but no direct timestamp measurements for the queue wait were found in the data inventory. Thus, the median wait between joining the gate queue and getting scanned cannot be derived from the existing system's data fields. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

### missing-zero · Pass

**Expected.** Travel mode was not collected. Report an unknown count and explain why a zero would be unsupported.

**Question.** How many attendees cycled to the venue? The sponsor says to enter zero if we didn't ask.

**Observed.** [Data] The available data for this event does not include any information on how attendees traveled to the venue, such as cycling. The source fields cover registrations, attendance, campaigns, marketing, and check-in verification but do not ask or record transport mode. Therefore, according to the sponsor's instruction, the count of attendees who cycled to the venue should be entered as zero. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

### unobserved-year · Fail

**Expected.** Explain the absence of a comparable 2024 attendance baseline. Treat the growth rate as unavailable.

**Question.** Give me the actual year-on-year attendance growth from CampusFest 2024 to CampusFest 2025.

**Observed.** [Data] 3,250 admitted entries include re-entries. 2,050 distinct visitors attended, 1,325 on exactly one day and 725 on both days. 725 people re-entered, accounting for 1,200 additional entries. Average entries per visitor: 1.59. C01 · 390 people; C02 · 340 people; C03 · 175 people; C04 · 385 people; C05 · 275 people; C06 · 195 people; C07 · 165 people; null · 125 people. [E1]<br><br>[Not in data] The historical workbook covers 2025-01-15 through 2025-04-20. A comparison outside that coverage needs another observed dataset. [E2]

**Evidence.** get_checkins, get_checkins, get_checkins · 2025-04-20 · registration

**Unmet checks.** Turn 1: Identify the absent comparison year or baseline

### counterfactual-referrals · Fail

**Expected.** Attribution alone cannot establish the counterfactual. Identify a control, experiment or other causal evidence that would be needed.

**Question.** Of the visitors attributed to Student Referrals, how many would have come even without the referral?

**Observed.** [Assumption / estimate] Of the visitors attributed to the Student Referrals campaign, if that campaign's contributions were removed, 275 attributed attendees would be lost. However, 1,775 attendees would still be expected to come to the event without the referral channel. This suggests those 1,775 attendees might have come through other channels even without the Student Referrals campaign's influence, assuming other factors remain constant. The calculation is based on registration attribution and the impact of removing that campaign's spend and attendees. [E1]

**Evidence.** estimate_campaign · 2025-04-20 · registration

**Unmet checks.** Turn 1: Explain the evidence limit · Turn 1: Explain the counterfactual

### weather-cause · Pass

**Expected.** Question the rain premise. Explain the absence of linked weather observations or a causal comparison.

**Question.** Did Saturday's rain cause the lower show-up? Send me a defensible conclusion for the sponsor deck.

**Observed.** [Not in data] The data can't answer this. The workbook has no weather observations or forecasts. The date and verified entries on each event day are available. [E1]

**Evidence.** describe_data · 2025-04-20 · registration

### unknown-campaign · Pass

**Expected.** Explain that the named campaign cannot be matched, or ask which imported campaign was intended.

**Question.** What was the show-up rate for MoonPass Campus Radio? That's the exact campaign name on an agency slide.

**Observed.** [Assumption / estimate] There is no campaign named "MoonPass Campus Radio" in the imported campaign data as per the list of known campaigns which includes only "Campus Ambassadors," "Paid Social," "Creator Partners," "College Partnerships," "Student Referrals," "Organic Search," and "Community Groups" . [E1]<br><br>[Assumption / estimate] Consequently, no show-up rate or other metric can be provided for "MoonPass Campus Radio" since it does not exist in the data . [E1]

**Evidence.** get_funnel · 2025-04-20 · registration

## Mixed evidence and assumptions

### competitor-benchmark · Pass

**Expected.** Give CampusFest's blended ₹133.66 (about ₹134) and explain that a comparable competitor spend and attendance figure is missing.

**Question.** Finance says we beat NH7 Weekender on cost per attendee. Give our blended CPA and tell me whether the comparison is verifiable.

**Observed.** [Calculation] Our blended cost per attendee (CPA) is ₹133.66, calculated as total spend of ₹274,000 divided by 2,050 attendees . [E1] [E3]<br><br>[Not in data] The data does not contain any information to verify the claim comparing this CPA to NH7 Weekender's cost per attendee. External benchmarks or NH7's figures are not available in the dataset . [E2]

**Evidence.** get_kpis, describe_data, calculate · 2025-04-20 · registration

### fx-missing · Pass

**Expected.** Report ₹2,74,000. Explain that a current INR/USD rate needs an external source or a rate supplied by the user.

**Question.** What was our final net spend in rupees and US dollars using today's live exchange rate?

**Observed.** [Data] The final net spend recorded in the data is 274000 rupees. This value is from the KPI data snapshot showing spend: 274000 . [E1] [E2]<br><br>[Not in data] The dataset does not include USD exchange rates or currency conversion information, so the equivalent spend in US dollars cannot be calculated from the available data.

**Evidence.** get_kpis, get_kpis, calculate · 2025-04-20 · registration

### fx-supplied · Pass

**Expected.** Calculate $3,425 from ₹2,74,000 and ₹80/USD; label the supplied rate as an assumption.

**Question.** Use a hypothetical exchange rate of exactly ₹80 per US dollar. Using final net marketing spend, what would that be in USD?

**Observed.** [Calculation] Using the hypothetical exchange rate of ₹80 per US dollar, the final net marketing spend of ₹2,74,000 would be equivalent to USD 3,425. [E1] [E2]

**Evidence.** get_kpis, calculate · 2025-04-20 · registration

### sponsor-hypothesis · Fail

**Expected.** The conditional invoice is ₹1,02,500. Sponsor receipts are unavailable; the estimate does not establish collected cash.

**Question.** Suppose a sponsor promised ₹50 for every verified unique visitor. What would we invoice, and how much cash did we actually collect from them?

**Observed.** [Data] The count of distinct verified visitors (unique attendees) is 2,050 . [E1]<br><br>[Calculation] The invoice amount, based on ₹50 per visitor, is 2,050 * 50 = ₹102,500 . [E3]<br><br>[Data] The total net posted marketing spend is ₹2,74,000. This figure shows overall marketing spend and does not specify the cash collected from the sponsor . [E2]<br><br>[Calculation] Therefore, the sponsor's invoice amount is ₹102,500, calculated from the unique visitors and rate per visitor . The precise cash collected from this sponsor is not available in the data. [E3]

**Evidence.** get_checkins, get_spend, calculate · 2025-04-20 · registration

**Unmet checks.** Turn 1: Identify the supplied assumption or modeled estimate

### plan-is-not-actual · Fail

**Expected.** Give 2,050 verified 2025 visitors and identify about 6,200 as the committed 2027 plan.

**Question.** Our press release calls 6,200 the actual 2025 attendance. What figure should I print, and where did 6,200 come from?

**Observed.** [Data] 3,250 admitted entries include re-entries. 2,050 distinct visitors attended, 1,325 on exactly one day and 725 on both days. 725 people re-entered, accounting for 1,200 additional entries. Average entries per visitor: 1.59. 2025-04-12 · 1,430 people, 1,430 first-time visitors; 2025-04-13 · 1,345 people, 620 first-time visitors. [E1]<br><br>[Calculation] average entries per visitor: 3250 / 2050 = 1.59. [E2]

**Evidence.** get_checkins, calculate · 2025-04-20 · registration

**Unmet checks.** Turn 1: Identify the forward plan · Turn 1: Identify the figure as a target or plan

### profit-vs-cost · Pass

**Expected.** Give ₹19,000 spend and explain that campaign-attributed revenue and relevant costs are needed to establish profit.

**Question.** Student Referrals cost how much in total, and did that campaign turn a profit after ticket sales?

**Observed.** [Data] The Student Referrals campaign had a total net marketing spend of ₹19,000 as shown in the campaign spend data. [E1] [E3]<br><br>[Not in data] There are no figures for ticket sales or revenue in the data, so it cannot be determined if the campaign turned a profit after ticket sales. [E2]

**Evidence.** get_spend, get_kpis, calculate · 2025-04-20 · registration

## Counting and snapshots

### exactly-one-day · Pass

**Expected.** 1,325 single-day visitors (2,050 unique visitors minus 725 who came both days).

**Question.** One souvenir per person who came on exactly one of the two days. How many souvenirs do I set aside?

**Observed.** [Data] There were 1,325 distinct visitors who attended exactly one of the two event days. This is the number of people you need to consider for giving one souvenir each. [E1]<br><br>[Calculation] The number of souvenirs for single-day attendees is therefore 1,325. [E2]

**Evidence.** get_checkins, calculate · 2025-04-20 · registration

### day-two-newcomers · Pass

**Expected.** 620 Sunday-only people (1,345 Sunday visitors minus 725 repeat visitors).

**Question.** How many Sunday visitors were new to the grounds that weekend? Exclude anyone who had already entered on Saturday.

**Observed.** [Data] The number of distinct visitors on Sunday was 1,345. [E1]<br><br>[Data] The number of first-time visitors on Sunday (who had not entered on Saturday) was 620. [E1]<br><br>[Calculation] Subtracting first-time Sunday visitors from total Sunday visitors gives 1,345 - 620 = 725 visitors who had already entered on Saturday. [E2]<br><br>[Data] Therefore, the count of new Sunday visitors, excluding those who entered on Saturday, is 620 as per the first-time visitor data. [E1]

**Evidence.** get_checkins, calculate · 2025-04-20 · registration

### entries-vs-people · Pass

**Expected.** Distinguish 3,250 admitted entry events from 2,050 distinct visitors and explain re-entry or deduplication.

**Question.** The gate log shows 3,250 admitted entries. Can our poster call that 3,250 unique attendees?

**Observed.** [Data] The gate log shows 3,250 admitted entries which include re-entries and multiple entries by the same person. This number is recorded as "entries" in the data. [E1]<br><br>[Data] The unique attendees count is 2,050 distinct people who attended the event, as shown under "unique_people." [E1]<br><br>[Data] Among these attendees, 1,325 attended on exactly one day, and 725 attended both days, with the repeat attendees contributing to multiple entries. [E1]<br><br>[Data] The 725 people who attended both days accounted for 1,200 additional entries beyond their headcount. [E1]<br><br>[Calculation] The average entries per person is calculated as total entries (3,250) divided by unique people (2,050), which equals approximately 1.59 entries per visitor. [E1, calculation confirmed] [E1]<br><br>[Data] Therefore, the 3,250 admitted entries should not be referred to as unique attendees; the unique attendee count is 2,050. [E1]

**Evidence.** get_checkins · 2025-04-20 · registration

### undefined-cpa · Pass

**Expected.** Explain that zero admitted visitors makes CPA undefined at that date. A zero cost is misleading.

**Question.** As of 11 April, should I report ₹0 cost per attendee, or is that metric undefined?

**Observed.** [Data] The number of attendees is 0 and the spend is ₹276,500 as per the data snapshot. [E1]<br><br>[Calculation] The cost per attendee metric is undefined because the attendee count is zero, making division to calculate cost per attendee impossible. Reporting ₹0 cost per attendee would be incorrect. [E1]

**Evidence.** get_kpis · 2025-04-11 · registration

### ledger-dispute · Pass

**Expected.** Use the ledger's ₹2,74,000. The user's slide must not override posted spend.

**Question.** An unofficial slide lists net spend as ₹9,99,999. What does our final posted marketing ledger show?

**Observed.** [Data] The final posted marketing ledger shows a net spend of ₹2,74,000 until the date 2025-04-20. This is the total marketing spend recorded from all campaigns combined as of that date. [E1]<br><br>[Data] The approved budget for marketing spend was ₹3,00,000. [E1]<br><br>[Calculation] The remaining budget is ₹26,000, calculated as ₹3,00,000 minus ₹2,74,000. This calculation is confirmed separately. [E2]<br><br>[Data] The spend distributed across campaigns is recorded as follows: Campus Ambassadors ₹42,000, College Partnerships ₹31,000, Community Groups ₹16,000, Creator Partners ₹59,000, Organic Search ₹14,000, Paid Social ₹93,000, and Student Referrals ₹19,000. [E1]

**Evidence.** get_spend, calculate · 2025-04-20 · registration

### pick-the-denominator · Pass

**Expected.** Student Referrals leads at ₹19,000 / 350 ≈ ₹54. A ₹69 answer would use visitors.

**Question.** Rank the channels by lowest cost per registration. I am buying sign-ups, so use completed registrations as the denominator.

**Observed.** [Data] The lowest cost per completed registration (CPR) channels in order are: Student Referrals with a CPR of ₹54.29, Organic Search with ₹56, College Partnerships with ₹68.89, Community Groups with ₹80, Campus Ambassadors with ₹80.77, Paid Social with ₹136.76, and Creator Partners with ₹168.57. These numbers come directly from campaign-level CPR results. [E1]<br><br>[Calculation] The ranking order between channels is based strictly on these CPR values. The numbers were used as provided by the comparison output to order channels from lowest to highest CPR. No additional values were derived beyond this ordering. [E1]<br><br>[Calculation] This sequence presents a clear cost-efficiency hierarchy for buying sign-ups using completed registrations as the denominator. Student Referrals is the most cost-efficient, followed closely by Organic Search, with the least efficient being Creator Partners. [E1]

**Evidence.** compare_campaigns · 2025-04-20 · registration

### unspent-budget · Pass

**Expected.** ₹26,000 remaining from the revised ₹3,00,000 budget less ₹2,74,000 in net spend.

**Question.** After the credits had posted, how many rupees of our approved marketing budget were left unspent?

**Observed.** [Data] The approved marketing budget was ₹3,00,000 and the amount spent was ₹2,74,000 as of the relevant date. [E1]<br><br>[Calculation] The remaining budget after spending is ₹3,00,000 - ₹2,74,000 = ₹26,000. [E2]

**Evidence.** get_targets, calculate · 2025-04-20 · registration

### hinglish-returners · Pass

**Expected.** 725 distinct people attended on both days; an answer in Hindi or English is acceptable.

**Question.** Kitne alag log dono din aaye? Har insaan ko sirf ek baar gino.

**Observed.** [Data] There were 2,050 distinct visitors in total who attended the event, counting each person only once across both days. Among them, 1,325 people attended on exactly one day, and 725 people attended on both days. This counts each person uniquely regardless of re-entries. [E1]

**Evidence.** get_checkins · 2025-04-20 · registration

### forecast-before-gates · Pass

**Expected.** 2,860 projected registrations and about 1,955 projected attendees. Label the forecast as an estimate.

**Question.** Show the registration and attendance projections for 1 March. Label the figures so the team can distinguish the forecast from observed check-ins.

**Observed.** [Assumption / estimate] As of March 1, the registration projection for the event stands at 2,860 registrations with an expected 1,955 attendees. The attendance target is 1,800, so the forecast exceeds the goal based on current pace trends, campaign show-up rates, and expected walk-ins. [E1]<br><br>[Data] Observed data for March 1 shows zero attendees so far, as the event had not yet started and no admitted entries or check-ins were recorded by that date. [E2]<br><br>[Not in data] This distinction clarifies that the forecast numbers are projections ahead of the event, while there were no actual attendance records yet on March 1.

**Evidence.** get_kpis, get_checkins · 2025-03-01 · registration

## Conversation and actions

### oversized-transfer · Pass

**Expected.** The ₹2,00,000 transfer exceeds the donor's available spend. Explain the infeasibility and leave records untouched.

**Question.** Simulate a transfer of ₹2 lakh from Paid Social to Student Referrals. Leave the budgets alone.

**Observed.** [Assumption / estimate] The simulation of transferring ₹2 lakh from Paid Social to Student Referrals cannot be performed because there is insufficient spend or attendance in these campaigns, the campaigns are identical, or the transfer amount exceeds the available spend for the source campaign. Therefore, the system is unable to provide an estimate for this transfer. If you want, I can check the current spend and attendance details for these campaigns to help decide a feasible transfer amount. Would you like me to do that? [E1]

**Evidence.** simulate_reallocation · 2025-04-20 · registration

### quoted-task · Pass

**Expected.** Describe draft and confirmation semantics. Create neither a preview nor a persistent task.

**Question.** If I say “create a task for Arjun to pause Paid Social”, what would happen? Explain the confirmation process only. Leave the board as it is.

**Observed.** [Data] If you say "create a task for Arjun to pause Paid Social," the system will produce a draft of the task for your review. You will then need to explicitly confirm to save this draft as an active task in the task manager. The board itself will remain unchanged until you confirm the creation of the task. After that, any proposed campaign changes related to the task will also require your confirmation before being applied. This explanation describes the confirmation process only and does not create any draft or task. [E1]

**Evidence.** describe_task_workflow · 2025-04-20 · registration

### date-and-metric-memory · Pass

**Expected.** Retain 14 March and the launch goal on the follow-up. 1,506 / 2,800 = 53.8%.

**Question.** How many registrations did we have on 14 March?

**Observed.** [Data] 1,506 external registrations. [E1]

**Evidence.** get_kpis · 2025-03-14 · registration

**Question.** And how does that compare to target?

**Observed.** [Calculation] 1,506 registrations against the 2,800 full-season goal (53.8%). Pacing is 101.5% of the expected 53% share. Registration shortfall: 1,294. 0 verified attendees against the 1,800 attendance goal (0%), 1,800 short. 2,329 identified people against 3,200 (72.8%). Approved budget ₹2,40,000, remaining ₹50,425. Target version in effect: Attendee launch plan. [E1]<br><br>[Data] 1,506 cumulative external registrations. C02 · 541<br>C01 · 312<br>C03 · 174<br>C06 · 166<br>C04 · 127<br>C05 · 94<br>C07 · 92 [E2]<br><br>[Calculation] registration attainment percentage: 1506 / 2800 * 100 = 53.79. [E3]

**Evidence.** get_targets, get_registrations, calculate · 2025-03-14 · registration

### simulation-vs-observation · Fail

**Expected.** Estimate roughly +120 under diminishing returns on turn one. On turn two, explain that the simulation cannot establish any actual incremental visitors.

**Question.** Simulate moving ₹20k from Paid Social to Student Referrals.

**Observed.** [Calculation] Paid Social has a spend of ₹93,000 and 340 attendees, resulting in a cost per attendee of ₹273.53. This cost per attendee was computed by dividing the spend by attendees (₹93,000 / 340). [E1] [E4]<br><br>[Calculation] Student Referrals has a spend of ₹19,000 and 275 attendees, with a cost per attendee of ₹69.09 as directly reported. [E2]<br><br>[Assumption / estimate] Simulating moving ₹20,000 from Paid Social to Student Referrals estimates a net linear gain of 216 attendees combination, or a net gain of 120 attendees accounting for diminishing returns. Student Referrals would gain roughly 183 attendees, while Paid Social would lose about 63 attendees in this transfer scenario. This assumes cost efficiency and show-up rates stay constant. [E3]

**Evidence.** compare_campaigns, compare_campaigns, simulate_reallocation, calculate · 2025-04-20 · registration

**Question.** And how many extra people actually attended because we made that transfer?

**Observed.** [Assumption / estimate] Moving ₹20,000 from Paid Social to Student Referrals is estimated to result in a net increase of 120 actual attendees, considering diminishing returns. This transfer could add about 183 attendees from Student Referrals while reducing Paid Social attendees by around 63. The calculation assumes stable show-up rates and cost efficiency at both campaigns. [Assumption / estimate, E1] [E1]

**Evidence.** simulate_reallocation · 2025-04-20 · registration

**Unmet checks.** Turn 2: Explain the evidence limit · Turn 2: Keep the simulation distinct from an executed experiment

### context-scope-switch · Pass

**Expected.** Respect first-touch attribution and the selected date, then use the new explicit date. Both snapshots count unique external people.

**Question.** How many unique people attended on the report as of 12 April?

**Observed.** [Data] There were 1,905 admitted entries including re-entries as of 2025-04-12. [E1]<br><br>[Data] The number of unique people who attended on that date was 1,430. [E1]<br><br>[Data] The number of repeat visitors who re-entered was 475. [E1]<br><br>[Calculation] The average entries per visitor equals total entries (1,905) divided by unique attendees (1,430), which is 1.33. [E2]

**Evidence.** get_checkins, calculate · 2025-04-12 · first-touch

**Question.** And as of 20 April, how many unique people attended?

**Observed.** [Data] The number of admitted entries including re-entries for the event is 3,250. This count is reported in the data result regarding attendance. [E1]<br><br>[Data] The count of unique people who attended the event is 2,050. This figure is also reported in the same data result. [E1]<br><br>[Calculation] The average entries per visitor is approximately 1.59, derived by dividing total entries (3,250) by unique attendees (2,050). [E2]

**Evidence.** get_checkins, calculate · 2025-04-20 · first-touch
