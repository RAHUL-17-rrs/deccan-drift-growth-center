# Supplied question bank assessment

**Local query mode completed 134 chat turns across 111 scenarios. The review found 75 passes, 14 partial answers and 22 failures.** All 15 basic facts passed. Multi-turn analysis, owner-level questions and unfamiliar calculations fell below the bank's acceptance targets. [Question bank](../Copilot_Test_Questions.md) · [Full answers, evidence traces and task outcomes](question-bank-transcript-local.md)

The initial OpenAI attempt on A1 encountered `EACCES` before a model reply. A subsequent live run completed the same 111 scenarios and received 56 passes, 26 partial answers and 29 failures; after the fixes a second live run received 97 passes, 9 partial answers and 5 failures. The earlier 8/27 score used the separate challenge suite. [OpenAI question-bank review](question-bank-review-openai.md) · [Earlier OpenAI challenge report](challenge-results-openai.md)

## Grades

These are human-reviewed scenario grades. A pass requires the primary requested result, appropriate units, date and attribution, and the relevant qualification or action outcome. A partial answer supplies a meaningful part while leaving a material part unanswered. A failure gives an unrelated result or misses the main request. A generic clarification earns credit for an off-topic redirect when the question calls for one. Optional bonuses are omitted from scoring. Numbers below are the item numbers within each section.

| Section | Pass | Partial | Fail |
|---|---|---|---|
| A · Basic facts | 1–15 | — | — |
| B · Cleaning and counting | 1, 2, 3, 5, 10 | 6 | 4, 7, 8, 9, 11, 12 |
| C · Historical snapshots | 1, 2, 3, 5–9 | 4 | 10 |
| D · Multi-turn | — | 1, 2 | 3, 4 |
| E · Diagnosis | 1, 5, 9 | 2, 7, 8, 10 | 3, 4, 6 |
| F · Calculations | 1, 8, 9 | 3, 4, 5 | 2, 6, 7 |
| G · Task execution | 1, 3–8 | — | 2 |
| H · Outside the dataset | 1–18, 20 | 21 | 19, 22 |
| I · Robustness | 1, 2, 5–7, 9–11 | 4 | 3, 8 |
| J · Changed data | 1, 2, 4–8 | — | 3, 9 |
| K · Demo workflow | — | K | — |

Against the bank's pass bars, A–C scored **28/37** (goal 100%), D–G **13/31** (goal 90%), H–I **27/33** (goal 90%) and J **7/9** (goal 100%). A partial scenario receives no full-pass credit. The scope line displayed beneath each chat reply counts toward grounding. For J1 and J2, the grade covers the explicit re-asked questions. Some supporting per-campaign figures in the key appear only in the tool output.

## Where the remaining work matters

| Priority | Observed behavior | Improvement to test next |
|---|---|---|
| 1 · Choose the requested metric and denominator | B7 returned 2,050 festival visitors for Dev's campaigns, whose attributed attendance was 275. B8 interpreted campaign “credit” as financial credits. D4 ranked owners by registrations when asked for cost per attendee. B11, B12 and E3 returned status counts without joining those statuses to attendance or calculating cancellation rates. | Resolve the requested measure, entity and grouping together. Calculate owner CPA from summed spend divided by summed attributed attendees. Join the latest registration status to verified visitors for attendance questions. |
| 2 · Carry context across turns and dates | D1 handled 1 March but lost “two weeks later.” D2 identified Creator Partners, then lost the subject of “Why?” and “Who owns it?” C4 answered only the first target date. I8 asked for clarification on an explicit 2024 date. | Persist the selected campaign or comparison pair and prior metric. Resolve relative dates against the preceding turn, return both snapshots for comparisons and check historical coverage before routing. |
| 3 · Calculate derived measures in the database | B4 omitted summed reported reach (666,297 anonymous activity counts). B6 gave only the identified registration-start count. C10 missed the 400-entry peak from 18:00 to 19:00 on 12 April. F5 returned the email counts without the 41.2% click-to-open rate. F6 missed both CTRs. H22 missed ₹41,100. | Add tool-backed aggregates for distinct people, time buckets, platform vs identified events, rates and explicit percentage arithmetic. Check the numerator, denominator and units in the rendered reply. |
| 4 · Finish the decision the user asked about | D3 never completed a two-campaign comparison. E7 listed both weekly registration counts without decomposing the change. E10 projected 2,072 attendees but omitted the comparison with the 2,200 target. F4 gave the remaining budget without estimating its buying power. I4 corrected attendance without explaining the source of 3,250. | Answer each part of the question, including why a cause is unknown, what the estimate assumes or what threshold is missed. Use a simulator or calculation tool for the derived result. |
| 5 · Complete operational workflows | G2 returned registration totals when there were no STOP campaigns. J3 missed a newly added campaign in the catalog. J9 missed the logged settings edit. K handled diagnosis, recommendation and simulation but requested one task per message and answered a projected-spend question with posted spend. | Route STOP and change-history questions to their respective tools. List campaigns even when CPA is undefined. Support independently reviewable drafts for both assignments and distinguish posted spend from a forward spend projection. |

## Verified fixes

- The exact dashboard input `suggest imporve` now returns a recommendation backed by campaign rankings and a simulated transfer. On original fixtures, Student Referrals costs about ₹69 per attendee. A ₹20,000 transfer from Paid Social yields an estimated net gain of about 120 under diminishing returns. The recommendation leaves campaign budgets unchanged.
- A12 now ranks College Partnerships first at 85.6% show-up. B2 distinguishes 725 people who returned from their 1,200 additional entries. I7 requests a valid date for 30 February.
- G5 asks for missing task details and G6 asks for a valid assignee when given Rahul. G4 saved the confirmed completion, marked the task done and applied the proposed pause to C03. G8 verified the persisted cancellation and correctly reported that it created no task.
- The provider adapters now preserve the model's explanation after tool calls. Mocked OpenAI tests verify that a ₹134 internal CPA can appear alongside an explanation that competitor CPA is unavailable, and that an unsupported amount triggers a retry. Live model selection and answer quality still need the new bank run. [Regression tests](../tests/grounded-copilot.test.mjs)

## Corrections and setup decisions

- **B2.** The key's subtraction counts repeated admission events. Counting distinct people with more than one verified admission gives **725 people**. They account for **1,200 re-entries**.
- **E9, G2 and J8.** The two completed Creator Partners weekly CPRs were ₹129.79 and ₹225.93. The default STOP threshold is ₹140.625 for **both** weeks. Its actual status is CHANGE, and the original fixture has zero STOP campaigns. At a 2× threshold it is still CHANGE. J8 receives credit for reflecting the edited threshold and the correct status.
- **J1.** Deleting an arbitrary entry for a person can leave another admission. The test removed the sole admission for each of 50 distinct Paid Social visitors, checked total attendance of 2,000 and observed the new ₹321 Paid Social CPA.
- **J2 and J3.** The ₹40,000 referral row was dated 20 April 2025 so it falls within the selected historical report. For the new WhatsApp Groups campaign the fixture used ₹600 spend and one registration. Its zero verified visitors make CPA undefined, while it still belongs in the campaign catalog.
- **G3 and K.** “My open tasks” ran as Arjun, and “What tasks does Arjun have?” ran as Pranit. The browser recording shows K's actual stopping point. The joint request yielded no two-task preview, so there was nothing to confirm or apply in that workflow. [Demo recording](../demo/question-bank-K.webm)

## Reproduce

Run `npm.cmd run eval:question-bank` to test the configured provider, or append `-- --local` for local query mode. The runner reads the supplied Markdown, withholds the expected answers from the chatbot, reuses the same chat for follow-ups, resets between changed-data fixtures and checks that attendance, spend, tasks and drafts are restored. The transcript is written to `eval/question-bank-transcript-<mode>.md`. Review new transcripts against the bank before assigning a new score.
