# Growth Copilot after the fixes

The local chat service earned **100 passes, 8 partial answers and 3 failures** across the supplied 111 scenarios (90.1% full passes). The earlier local run earned 75 passes on the same questions (67.6%). Both runs used the seeded event, separately edited fixtures and the user-visible answer, scope and task state. This regression bank was used to guide the fixes. It does not measure accuracy on arbitrary new prompts. [Current transcript](question-bank-transcript-local-after-fixes.md) · [Earlier local review](question-bank-review.md)

A post-change **live OpenAI** run earned 97 full passes, 9 partial answers and 5 failures, up from 56 before the fixes. The direct metric and structured task paths are shared across configured providers; the remaining OpenAI gaps are mostly in model-written diagnosis answers. [Live OpenAI review](question-bank-review-openai.md)

## Manual grades

| Section | Pass | Partial | Fail |
|---|---|---|---|
| A · Basic facts | 1–15 | — | — |
| B · Counting and data traps | 1–12 | — | — |
| C · Historical snapshots | 1–10 | — | — |
| D · Follow-ups | 1, 2 | 4 | 3 |
| E · Diagnosis | 1, 3, 5, 6, 9, 10 | 2, 4, 7, 8 | — |
| F · Calculations and what-ifs | 1–9 | — | — |
| G · Task execution | 1–8 | — | — |
| H · Outside the dataset | 1–18, 20, 22 | 21 | 19 |
| I · Robustness | 1, 2, 5–11 | 4 | 3 |
| J · Changed-data fixtures | 1–9 | — | — |
| K · Demo workflow | — | K | — |

I graded each scenario as one outcome, including its follow-ups. A partial means the response supplied a material part of the answer or the run verified only part of the workflow. The run produced 134 replies and restored the test fixture to 2,050 attendees, ₹2,74,000 spend and an empty task board. [Question bank](../Copilot_Test_Questions.md) · [Transcript and fixture notes](question-bank-transcript-local-after-fixes.md)

## Verified behavior

- Creator Partners' cancellation rate came from 36 cancelled registrations divided by 350 registrations. Email click-to-open came from 409 clicks divided by 992 opens. Both used separate source counts and reported percentages. [E3](question-bank-transcript-local-after-fixes.md#e3) · [F5](question-bank-transcript-local-after-fixes.md#f5)
- With 50 Paid Social attendees removed, its direct CPA reply showed ₹93,000 divided by 290, or ₹320.69. A separate regression also added a visitor and checked that the denominator increased. [J1](question-bank-transcript-local-after-fixes.md#j1) · [Regression tests](../tests/grounded-copilot.test.mjs)
- The chatbot calculated 15% of 2,74,000 as 41,100, identified sponsor receipts as unavailable and answered the 2027 question from the forward plan. [H22](question-bank-transcript-local-after-fixes.md#h22) · [H7](question-bank-transcript-local-after-fixes.md#h7) · [I2](question-bank-transcript-local-after-fixes.md#i2)
- The demo created two separate previews, saved both confirmed assignments and applied the Creator Partners pause when its task was completed. A browser check cancelled one card, confirmed the other, completed the saved task and verified the paused campaign. [Demo workflow](question-bank-transcript-local-after-fixes.md#k) · [Browser check](../scripts/browser.mjs)

## Remaining gaps

- **D3, H19 and I3 failed.** Local mode lost the two-campaign comparison during the budget conversation. It also returned generic clarification for a personnel question and for a leading claim that Paid Social was the best campaign. [D3](question-bank-transcript-local-after-fixes.md#d3) · [H19](question-bank-transcript-local-after-fixes.md#h19) · [I3](question-bank-transcript-local-after-fixes.md#i3)
- **D4 and E2, E4, E7, E8 were partial.** D4 correctly ranked owners but did not identify which campaign drove Arjun's combined CPA. Several diagnosis replies displayed the component rates without identifying the bottleneck or explaining the trade-off. E7 supplied weekly counts and omitted the driver decomposition. [D4](question-bank-transcript-local-after-fixes.md#d4) · [E2](question-bank-transcript-local-after-fixes.md#e2) · [E7](question-bank-transcript-local-after-fixes.md#e7)
- **H21, I4 and K were partial.** The strategy redirect offered little grounded guidance. The attendance correction omitted the admission count behind the user's premise. K completed the task and pause correctly, but the bank did not separately observe the Budget and Alerts views after confirmation. [H21](question-bank-transcript-local-after-fixes.md#h21) · [I4](question-bank-transcript-local-after-fixes.md#i4) · [K](question-bank-transcript-local-after-fixes.md#k)

To repeat the local run, use `npm.cmd run eval:question-bank -- --local --label=after-fixes`. For a fresh live transcript with a configured OpenAI provider, use `npm.cmd run eval:question-bank -- --label=after-fixes`. The label keeps the previous baseline artifacts available.
