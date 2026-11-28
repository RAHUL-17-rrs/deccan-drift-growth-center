# Updated OpenAI question-bank run

**Completed on 28 November 2026 at 08:45 IST, after the grounding, tool and task fixes.** The application returned 134 replies across 111 scenarios with zero execution errors. Manual grading found 97 passes, 9 partial answers and 5 failures. [Graded review](question-bank-review-openai.md) · [Full transcript](question-bank-transcript-openai.md)

## Earlier completed run

**Completed on 28 November 2026 at 04:15 IST, before the fixes.** Manual grading found 56 passes, 26 partial answers and 29 failures. The per-scenario comparison is in the graded review.

## Earlier connection attempt

**Blocked on the first API request.** The application selected OpenAI with `gpt-4.1-mini` on 28 November 2026 at 03:48 IST. The question bank contains 111 scenarios. One was attempted, 110 were skipped and zero model replies were available to grade.

| First test | Recorded outcome |
|---|---|
| A1 | How many unique people attended the fest? |
| Scope | 20 April 2025, registration attribution |
| Expected | 2,050 unique attendees |
| Observed | The request to the OpenAI Responses API stopped with `fetch failed` and the underlying connection error `EACCES`. |

The runner restored the isolated `growth_bank_test` fixture. A separate database check confirmed 2,050 attendees, ₹2,74,000 in spend, zero tasks and zero drafts. The 8/27 score belongs to the earlier 27-scenario challenge run. [Earlier OpenAI report](challenge-results-openai.md)

To repeat the bank from a terminal with outbound OpenAI access, run `npm.cmd run eval:question-bank` from the project folder. A completed OpenAI run writes `eval/question-bank-transcript-openai.md`.
