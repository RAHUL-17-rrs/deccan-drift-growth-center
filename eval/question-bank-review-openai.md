# Growth Copilot evaluation · OpenAI

**97 of 111 scenarios passed (87.4%), 9 were partial and 5 failed.** The OpenAI-mode application (`gpt-4.1-mini`) returned 134 replies with zero execution errors in the run completed on 28 November 2026 at 08:45 IST. The earlier run that morning (04:15 IST) passed 56, with 26 partial and 29 failed. All basic-fact, counting, snapshot, calculation and task-workflow sections now pass apart from one partial. Diagnosis (section E) remains the weakest area at 2/10 full passes. [Completed transcript](question-bank-transcript-openai.md)

The local-mode review of the same 111 scenarios after the fixes awarded 100 full passes. The two modes share the evidence tools, task workflow and direct metric routes. They differ where the model writes the answer. [Local review after fixes](question-bank-review-local-after-fixes.md) · [Earlier local review](question-bank-review.md)

## Results by section

| Section | Pass | Partial | Fail | Earlier run (P / Pa / F) |
|---|---:|---:|---:|---|
| A · Basic facts | 14 | 1 | 0 | 13 / 0 / 2 |
| B · Cleaning and counting | 12 | 0 | 0 | 1 / 5 / 6 |
| C · Historical snapshots | 10 | 0 | 0 | 7 / 2 / 1 |
| D · Follow-ups | 3 | 1 | 0 | 1 / 2 / 1 |
| E · Diagnosis | 2 | 6 | 2 | 5 / 2 / 3 |
| F · Calculations and what-ifs | 9 | 0 | 0 | 3 / 2 / 4 |
| G · Task execution | 8 | 0 | 0 | 3 / 0 / 5 |
| H · Outside the dataset | 21 | 0 | 1 | 11 / 5 / 6 |
| I · Robustness | 10 | 0 | 1 | 7 / 3 / 1 |
| J · After data edits | 7 | 1 | 1 | 5 / 4 / 0 |
| K · Demo workflow | 1 | 0 | 0 | 0 / 1 / 0 |
| **Total** | **97** | **9** | **5** | **56 / 26 / 29** |

| Bank acceptance group | Full passes | Full-pass rate | Target | Earlier |
|---|---:|---:|---:|---:|
| A–C | 36/37 | 97.3% | 100% | 56.8% |
| D–G | 22/31 | 71.0% | 90% | 38.7% |
| H–I | 31/33 | 93.9% | 90% | 54.5% |
| J | 7/9 | 77.8% | 100% | 55.6% |

## What changed between the runs

| Failure in the earlier run | Change |
|---|---|
| About a third of replies were raw tool summaries. The grounding check rejected figures the user had typed (“Day 1”, “3,250”, “15%”), and the retry did not say which number failed. | The check now returns each failing value and the reason, accepts values restated from the question, ignores counting words 0–2 and strips stray labels. The model gets up to eight steps; the last two force a written answer. [Reply validation](../lib/grounded-reply.mjs) · [Chat loop](../lib/copilot.mjs) |
| Measures with no tool: opt-outs, CTR, reach, peak check-in hour, cancellation rate, cancelled-but-attended, owner CPA. | New groupings and the channel-measure tool cover each one with numerator, denominator and unit. B4, A14, E3, F5, F6, C10, B11 and D4 now pass. [Evidence tools](../lib/evidence.mjs) |
| Measure substitution: sponsor receipts from marketing spend, sessions as time on site, the 2025 total as a 2027 forecast. | The prompt defines each measure, and the validator rejects receipts and cost-as-rate claims. H7, H10, H13 and I2 now pass. |
| Arithmetic done in prose (H22 returned 767,200,000). | A `calculate` tool whose operands must come from evidence or the question. A counterfactual tool handles F2–F4. |
| Task owners and multiple tasks per message. | First names resolve to the roster, “by Friday” resolves to a date, and one message can produce several drafts. G1–G4, G8 and K now complete end to end. |

## Remaining issues

These grades are from the 08:45 run. Fixes for E9/J8, H20, I4, D3 and E1 were made after it. Each was re-asked once in a live spot check and answered correctly, but the full bank has not been re-run since.

| Scenario | Problem in this run | Status |
|---|---|---|
| E9, J8 | The model compared each campaign's CPR with the plan and said nothing triggers. The alert labels were never retrieved. | SCALE/CHANGE/STOP questions now go directly to the alerts tool. The spot check returned the correct labels and thresholds. |
| H20 | Wrote the poem, tagging each line as Data. | Creative-writing requests now get a fixed decline. Verified in the spot check. |
| I4 | Restated 2,050 but then added 2,800 registrations and 125 walk-ins to give 2,925. | Prompt rule to correct a quoted entry count. The spot check answered 3,250 entries versus 2,050 people. |
| D3 | The sizing turn attributed Campus Ambassadors' figures to Paid Social and declined to give an amount. | Prompt rule to answer “how much more” with the simulator. The spot check gave ₹20k → +120 and ₹50k → +226. |
| E1, J1, J3, K | Compared cost per attendee with the plan's cost per registration (₹93.75). | Prompt rule added; the spot check still mentioned the plan CPR once. Open. |
| E2 | Named sessions → registration as the biggest drop-off. The bank wants registration → attendance for the weak campaigns. | Open. |
| E4, E8, E6 | Returned the correct funnel or opt-out figures without stating the conclusion. | Open. |
| E7, E10 | E7 did not say the data shows what changed rather than why. E10 did not label the show-up assumption. | Open. |
| J2 | Reported ₹3,14,000 spend without warning that it exceeds the ₹3,00,000 budget. | Open. |
| A7 | Added the two daily counts as “total people over two days: 2,775” next to the correct 2,050. | Open. |
| B11, B12 | Correct answers (0 and 575), but shown as a status table rather than stated. | Graded pass; wording could be more direct. |

## Grading and verification

- I reviewed the complete transcript against the supplied bank. A pass requires the primary requested outcome with the appropriate scope and essential qualification. A partial supplies a meaningful part but misses a required calculation, qualification, comparison or action. A material false claim can fail a scenario even when a related number is correct. Optional bonuses earn no extra credit. [Question bank](../Copilot_Test_Questions.md)
- The unit of scoring is one scenario, including server-handled replies as the user sees them. Many replies in this run came from direct routes (status mix, channel measures, owner comparison, describe-data) rather than model prose.
- I checked these figures against the seeded PostgreSQL data: CTR 2.1% and 4.8%, opt-outs 117 of 450, 575 confirmed no-shows, zero cancelled attendees, Creator Partners cancellation 10.3%, the 400-entry peak hour and owner CPA of ₹69 / ₹94 / ₹200 / ₹221.
- This is one live run, manually graded by the same reviewer who made the fixes, using a bank that guided those fixes. It shows behaviour on these prompts, not accuracy on new ones. Re-run the bank, and paraphrases of the highest-risk cases, to measure consistency.

## Scenario-by-scenario review

### A · Basic facts

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [A1](question-bank-transcript-openai.md#a1) | Pass | 2,050 distinct attendees, separated from 3,250 entries. |
| [A2](question-bank-transcript-openai.md#a2) | Pass | 2,800 external registrations. |
| [A3](question-bank-transcript-openai.md#a3) | Pass | ₹2,74,000, with budget and ₹26,000 remaining. |
| [A4](question-bank-transcript-openai.md#a4) | Pass | ₹133.66 via the calculate tool. |
| [A5](question-bank-transcript-openai.md#a5) | Pass | 2,050 of 2,200, 93.2%, 150 short. |
| [A6](question-bank-transcript-openai.md#a6) | Pass | All four status counts match. |
| [A7](question-bank-transcript-openai.md#a7) | Partial | Day counts 1,430 and 1,345 correct, but also called their sum of 2,775 “total people over two days”. |
| [A8](question-bank-transcript-openai.md#a8) | Pass | 725. |
| [A9](question-bank-transcript-openai.md#a9) | Pass | Paid Social, 680. |
| [A10](question-bank-transcript-openai.md#a10) | Pass | Campus Ambassadors 390, College Partnerships 385. |
| [A11](question-bank-transcript-openai.md#a11) | Pass | Student Referrals, ₹69. |
| [A12](question-bank-transcript-openai.md#a12) | Pass | College Partnerships, 85.6%. |
| [A13](question-bank-transcript-openai.md#a13) | Pass | 3,625 against 3,600, 100.7%. |
| [A14](question-bank-transcript-openai.md#a14) | Pass | 229 people opted out. |
| [A15](question-bank-transcript-openai.md#a15) | Pass | Scanner 2,945 and manual 305 entries. |

### B · Cleaning and counting

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [B1](question-bank-transcript-openai.md#b1) | Pass | 3,370 records → 3,250 verified entries → 2,050 people. |
| [B2](question-bank-transcript-openai.md#b2) | Pass | 725 people re-entered, 1,200 extra entries. |
| [B3](question-bank-transcript-openai.md#b3) | Pass | 50 denied and 30 unverified. |
| [B4](question-bank-transcript-openai.md#b4) | Pass | 6,66,297 reach observations; unique reach cannot be determined. |
| [B5](question-bank-transcript-openai.md#b5) | Pass | Confirmed about 11.4% and noted sessions are anonymous visits. |
| [B6](question-bank-transcript-openai.md#b6) | Pass | 5,548 anonymous platform starts versus 3,075 identified-person events; not matchable one to one. |
| [B7](question-bank-transcript-openai.md#b7) | Pass | Dev Malhotra, 275 attributed attendees, walk-ins excluded. |
| [B8](question-bank-transcript-openai.md#b8) | Pass | 125 unattributed walk-ins. |
| [B9](question-bank-transcript-openai.md#b9) | Pass | ₹2,76,500 → ₹2,74,000 with the −₹2,000 and −₹500 credits. |
| [B10](question-bank-transcript-openai.md#b10) | Pass | All four credits and the −₹6,500 total. |
| [B11](question-bank-transcript-openai.md#b11) | Pass | Cancelled: 0 attended. Shown as a status table. |
| [B12](question-bank-transcript-openai.md#b12) | Pass | Confirmed: 575 did not attend. Shown as a status table. |

### C · Historical snapshots

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [C1](question-bank-transcript-openai.md#c1) | Pass | 1,144. |
| [C2](question-bank-transcript-openai.md#c2) | Pass | ₹73,475. |
| [C3](question-bank-transcript-openai.md#c3) | Pass | 0 attendees as of 11 April. |
| [C4](question-bank-transcript-openai.md#c4) | Pass | 2,800 under the launch plan, 3,200 under the revised plan, budget ₹2.4L → ₹3L. |
| [C5](question-bank-transcript-openai.md#c5) | Pass | 36. |
| [C6](question-bank-transcript-openai.md#c6) | Pass | 115. |
| [C7](question-bank-transcript-openai.md#c7) | Pass | All four status counts. |
| [C8](question-bank-transcript-openai.md#c8) | Pass | Week of 24 March, 354. |
| [C9](question-bank-transcript-openai.md#c9) | Pass | 96 / 1,018 / 1,223 / 463. |
| [C10](question-bank-transcript-openai.md#c10) | Pass | 12 April 6–7 pm, 400 entries. |

### D · Follow-ups

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [D1](question-bank-transcript-openai.md#d1) | Pass | Kept 1 March (40.9%, 102.1% pacing), then 1,562 against the revised 3,200 goal. |
| [D2](question-bank-transcript-openai.md#d2) | Pass | Creator Partners ₹337; 50% show-up, ₹168.57 CPR, 8.6% conversion; Nisha Rao; Community Groups ₹96.97 at 82.5%. |
| [D3](question-bank-transcript-openai.md#d3) | Partial | First two turns correct (Referrals, 3.96× cheaper). The sizing turn quoted Campus Ambassadors' spend and attendees as Paid Social's and gave no amount. |
| [D4](question-bank-transcript-openai.md#d4) | Pass | Arjun ₹200 from ₹1,07,000 / 535; owners ranked ₹69 / ₹94 / ₹200 / ₹221. |

### E · Diagnosis

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [E1](question-bank-transcript-openai.md#e1) | Partial | Named Creator Partners and Paid Social with 50% show-up, but compared CPA with plan CPR, grouped Campus Ambassadors with them and omitted the spend and attendee shares. |
| [E2](question-bank-transcript-openai.md#e2) | Fail | Named sessions → registration as the biggest drop-off instead of registration → attendance. |
| [E3](question-bank-transcript-openai.md#e3) | Pass | Creator Partners 36/350 = 10.3%, then Paid Social 8.8%. |
| [E4](question-bank-transcript-openai.md#e4) | Partial | Showed 12.9% conversion and 50% show-up but did not state that show-up is the problem. |
| [E5](question-bank-transcript-openai.md#e5) | Pass | Campus Ambassadors 14.1%, then 13.6% and 13.2%. |
| [E6](question-bank-transcript-openai.md#e6) | Partial | 117/450 = 26.0% against 8.6–18.9% for others, and no reason recorded. Did not say whether it is a problem. |
| [E7](question-bank-transcript-openai.md#e7) | Partial | 249 → 174 with driver effects. Presented the decomposition as the cause without saying the data shows what changed, not why. |
| [E8](question-bank-transcript-openai.md#e8) | Partial | Showed 8.6% and 85.6% with ₹80.52 CPA but gave no explanation. |
| [E9](question-bank-transcript-openai.md#e9) | Fail | Said no campaign triggers anything, from a CPR comparison. Fixed after the run (direct alerts route). |
| [E10](question-bank-transcript-openai.md#e10) | Partial | Projected 2,072 against 2,200, but without the show-up assumption and partly tagged as Data. |

### F · Calculations and what-ifs

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [F1](question-bank-transcript-openai.md#f1) | Pass | Estimate: −63 / +183, net about +120; linear −73 / +289; assumptions stated. |
| [F2](question-bank-transcript-openai.md#f2) | Pass | Save ₹59,000, lose 175, 1,875 attendees at ₹114.67, with the counterfactual assumption. |
| [F3](question-bank-transcript-openai.md#f3) | Pass | 534 versus 340, +194, labelled an estimate. |
| [F4](question-bank-transcript-openai.md#f4) | Pass | ₹26,000 at ₹69.09 → about 376, linear, diminishing returns noted. |
| [F5](question-bank-transcript-openai.md#f5) | Pass | 409 / 992 = 41.2%. |
| [F6](question-bank-transcript-openai.md#f6) | Pass | 2.1% and 4.8% with counts. |
| [F7](question-bank-transcript-openai.md#f7) | Pass | ₹1,52,000 of ₹2,74,000, 55.5%. |
| [F8](question-bank-transcript-openai.md#f8) | Pass | 400. |
| [F9](question-bank-transcript-openai.md#f9) | Pass | 1.59. |

### G · Task execution

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [G1](question-bank-transcript-openai.md#g1) | Pass | Draft for Arjun Verma, C03, due 4 December; saved with created_by AI after confirmation. Did not note that Nisha owns Creator Partners. |
| [G2](question-bank-transcript-openai.md#g2) | Pass | Checked the alerts: no campaign on STOP, so no task. |
| [G3](question-bank-transcript-openai.md#g3) | Pass | Listed the new task on both turns. |
| [G4](question-bank-transcript-openai.md#g4) | Pass | Confirmation draft, then done; the C03 pause applied. |
| [G5](question-bank-transcript-openai.md#g5) | Pass | Asked for task, owner and deadline. |
| [G6](question-bank-transcript-openai.md#g6) | Pass | Rahul is not an owner; listed valid owners. |
| [G7](question-bank-transcript-openai.md#g7) | Pass | Refused; pointed to the data editor. |
| [G8](question-bank-transcript-openai.md#g8) | Pass | Draft created, cancelled, and the follow-up said no task was created. |

### H · Outside the dataset

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [H1](question-bank-transcript-openai.md#h1) | Pass | No line-up data; offered attendance by campaign, day or hour. |
| [H2](question-bank-transcript-openai.md#h2) | Pass | No gender field; offered campaign or first-touch source. |
| [H3](question-bank-transcript-openai.md#h3) | Pass | No age field. |
| [H4](question-bank-transcript-openai.md#h4) | Pass | College Partnerships is a campaign, not an institution field. |
| [H5](question-bank-transcript-openai.md#h5) | Pass | Home locations unavailable. |
| [H6](question-bank-transcript-openai.md#h6) | Pass | No ticket receipts; ledger tracks marketing costs. |
| [H7](question-bank-transcript-openai.md#h7) | Pass | No sponsorship receipts. |
| [H8](question-bank-transcript-openai.md#h8) | Pass | Activity is aggregated by campaign and day. |
| [H9](question-bank-transcript-openai.md#h9) | Pass | No survey or NPS; offered event questions and opt-outs. |
| [H10](question-bank-transcript-openai.md#h10) | Pass | Only entry timestamps; offered re-entries and both-day visits. |
| [H11](question-bank-transcript-openai.md#h11) | Pass | No vendor sales. |
| [H12](question-bank-transcript-openai.md#h12) | Pass | No cancellation reason; offered cancellation rates by campaign. |
| [H13](question-bank-transcript-openai.md#h13) | Pass | 2027 committed plan of about 6,200 and stretch 10,332, labelled an estimate. Also listed plan gates that were not asked for. |
| [H14](question-bank-transcript-openai.md#h14) | Pass | No weather data, on both prompts. |
| [H15](question-bank-transcript-openai.md#h15) | Pass | No competitor data; described what a comparison needs. |
| [H16](question-bank-transcript-openai.md#h16) | Pass | No external CPA benchmark. |
| [H17](question-bank-transcript-openai.md#h17) | Pass | Headliner impact cannot be judged from the data. |
| [H18](question-bank-transcript-openai.md#h18) | Pass | No revenue, so no ROI; offered cost per attendee. |
| [H19](question-bank-transcript-openai.md#h19) | Pass | Ranked owners by CPA, said budget and channel affect results and the data is not a basis for firing. |
| [H20](question-bank-transcript-openai.md#h20) | Fail | Wrote the poem. Fixed after the run. |
| [H21](question-bank-transcript-openai.md#h21) | Pass | Said the data holds no Gen Z evidence and offered campaign analysis instead. |
| [H22](question-bank-transcript-openai.md#h22) | Pass | 41,100 via the calculate tool. |

### I · Robustness

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [I1](question-bank-transcript-openai.md#i1) | Pass | Rejected 5,000; restated 2,050. |
| [I2](question-bank-transcript-openai.md#i2) | Pass | Gave the 2027 plan figures as an estimate. |
| [I3](question-bank-transcript-openai.md#i3) | Pass | Most registrations, but higher CPR and 50% show-up; not the best on efficiency. |
| [I4](question-bank-transcript-openai.md#i4) | Fail | Stated 2,050, then added registrations and walk-ins to give 2,925. Fixed after the run. |
| [I5](question-bank-transcript-openai.md#i5) | Pass | Gave both stages, 11.4% and 68.8%, labelled. |
| [I6](question-bank-transcript-openai.md#i6) | Pass | No C09; listed C01–C07. |
| [I7](question-bank-transcript-openai.md#i7) | Pass | Asked for a valid date. |
| [I8](question-bank-transcript-openai.md#i8) | Pass | Gave the data range. |
| [I9](question-bank-transcript-openai.md#i9) | Pass | Refused; read-only. |
| [I10](question-bank-transcript-openai.md#i10) | Pass | Aggregates only; pointed to the win-back screen. |
| [I11](question-bank-transcript-openai.md#i11) | Pass | ₹69 on both turns. |

### J · After data edits

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [J1](question-bank-transcript-openai.md#j1) | Pass | 2,000 attendees; Paid Social ₹320.69 at about 43% show-up; Referrals still lowest. |
| [J2](question-bank-transcript-openai.md#j2) | Partial | Organic Search ₹72 and ₹3,14,000 spend, but no over-budget warning. |
| [J3](question-bank-transcript-openai.md#j3) | Pass | WhatsApp Groups listed with its own figures. Its CPA showed as “undefined”. |
| [J4](question-bank-transcript-openai.md#j4) | Pass | Spend unchanged at ₹2,74,000. |
| [J5](question-bank-transcript-openai.md#j5) | Pass | Still 2,050. |
| [J6](question-bank-transcript-openai.md#j6) | Pass | 2,500 target and 0.82 on 20 April; 2,200 on 31 March. |
| [J7](question-bank-transcript-openai.md#j7) | Pass | 2,501 confirmed, 182 cancelled. |
| [J8](question-bank-transcript-openai.md#j8) | Fail | Said nothing triggers, from a CPR comparison; Creator Partners is CHANGE. Fixed after the run. |
| [J9](question-bank-transcript-openai.md#j9) | Pass | Change log with actor, time and stop 1.5 → 1.75. |

### K · Demo workflow

| Scenario | Grade | Evidence from the run |
|---|---|---|
| [K](question-bank-transcript-openai.md#k) | Pass | Diagnosed the two weak campaigns, simulated +120, drafted both tasks in one message, saved both, applied the Creator Partners pause, and explained that projected spend needs planned daily spend. The recommendation turn was generic and compared CPA with plan CPR. |
