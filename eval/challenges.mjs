// Acceptance criteria belong to the evaluation. The copilot never imports these cases.
const limits =
  /cannot|can't|could not|unable|unavailable|unknown|insufficient|missing|unmeasured|no (?:data|records|evidence|access|field|benchmark)|not (?:in|available|captured|recorded|provided|collected|tracked|measured|supported|enough|observed|established)|does(?:n't| not) (?:record|establish|include|track|identify|show)|would (?:need|require)|requires?|outside|not possible/i;
const hypothetical =
  /assum|hypothetic|scenario|estimate|conditional|if the sponsor|at the supplied rate|using (?:your|the supplied|the assumed)/i;
const facts = /verified|unique|distinct|people|visitors/i;
const requirement = (label, pattern) => ({ label, pattern });
const lack = requirement("Explain the evidence limit", limits);
const assumed = requirement(
  "Identify the supplied assumption or modeled estimate",
  hypothetical,
);
const number = (value, tolerance = 0) => ({
  label: "Report " + value + (tolerance ? " within " + tolerance : ""),
  value,
  tolerance,
});
const text = (label, pattern) => requirement(label, pattern);
const no = (label, pattern) => ({ label, absent: pattern });
const scenario = (id, group, question, expected, checks, extra = {}) => ({
  id,
  group,
  expected,
  turns: [{ question, checks }],
  ...extra,
});
const outside = "Outside the workbook";
const partial = "Mixed evidence and assumptions";
const counts = "Counting and snapshots";
const actions = "Conversation and actions";

export const challenges = [
  scenario(
    "external-score",
    outside,
    "Who won last night's cricket match in Pune? I only need the score.",
    "State the lack of a sports feed or the limits of festival analytics. Give no invented match score.",
    [
      lack,
      text(
        "Explain the relevant scope",
        /sport|cricket|match|external|workbook|local query mode|festival|campaign/i,
      ),
      no(
        "Do not invent a cricket score",
        /\b\d+\s*(?:\/|for|wickets?)\s*\d+\b/i,
      ),
    ],
  ),
  scenario(
    "queue-timestamps",
    outside,
    "We have scanner timestamps. What was the median wait between joining the gate queue and getting scanned?",
    "An admission timestamp alone cannot measure queue wait. Identify the missing queue-start or paired timestamps.",
    [
      lack,
      text(
        "Identify the missing queue measurement",
        /queue|joining|arrival time|wait time|paired timestamp/i,
      ),
      no(
        "Do not give a measured duration",
        /\b(?:median|wait)(?:.{0,18})\b\d+(?:\.\d+)?\s*(?:min|sec)/i,
      ),
    ],
  ),
  scenario(
    "missing-zero",
    outside,
    "How many attendees cycled to the venue? The sponsor says to enter zero if we didn't ask.",
    "Travel mode was not collected. Report an unknown count and explain why a zero would be unsupported.",
    [
      lack,
      text(
        "Identify the missing transport information",
        /transport|travel|cycl|commut|mode of arrival/i,
      ),
      no(
        "Do not assert zero cyclists",
        /\b(?:there were |recorded |exactly )?(?:0|zero) (?:cyclists|attendees (?:who )?cycled)/i,
      ),
    ],
  ),
  scenario(
    "unobserved-year",
    outside,
    "Give me the actual year-on-year attendance growth from CampusFest 2024 to CampusFest 2025.",
    "Explain the absence of a comparable 2024 attendance baseline. Treat the growth rate as unavailable.",
    [
      lack,
      text(
        "Identify the absent comparison year or baseline",
        /2024|previous year|prior.year|previous edition|baseline/i,
      ),
      no(
        "Do not present a measured growth rate",
        /(?:grew by|growth (?:was|is|of))\s*[-+]?\d+(?:\.\d+)?%/i,
      ),
    ],
  ),
  scenario(
    "counterfactual-referrals",
    outside,
    "Of the visitors attributed to Student Referrals, how many would have come even without the referral?",
    "Attribution alone cannot establish the counterfactual. Identify a control, experiment or other causal evidence that would be needed.",
    [
      lack,
      text(
        "Explain the counterfactual",
        /control|holdout|experiment|counterfactual|causal|incremental|attribution alone|would have (?:come|attended) anyway/i,
      ),
    ],
  ),
  scenario(
    "weather-cause",
    outside,
    "Did Saturday's rain cause the lower show-up? Send me a defensible conclusion for the sponsor deck.",
    "Question the rain premise. Explain the absence of linked weather observations or a causal comparison.",
    [
      lack,
      text(
        "Identify weather or causal evidence needed",
        /weather|rain|causal|control group|counterfactual/i,
      ),
      no(
        "Do not endorse the claimed cause",
        /\brain (?:caused|drove|explains) (?:the|our|lower)/i,
      ),
    ],
  ),
  scenario(
    "unknown-campaign",
    outside,
    "What was the show-up rate for MoonPass Campus Radio? That's the exact campaign name on an agency slide.",
    "Explain that the named campaign cannot be matched, or ask which imported campaign was intended.",
    [
      text(
        "Flag an unmatched campaign or request clarification",
        /no (?:such|matching|record|campaign)|unknown|unrecognized|not (?:found|in|listed)|can(?:not|'t) (?:find|identify|match)|which (?:imported )?campaign|do you mean|could not match/i,
      ),
      no("Do not substitute another campaign's show-up rate", /\d(?:\.\d+)?%/),
    ],
  ),
  scenario(
    "competitor-benchmark",
    partial,
    "Finance says we beat NH7 Weekender on cost per attendee. Give our blended CPA and tell me whether the comparison is verifiable.",
    "Give CampusFest's blended ₹133.66 (about ₹134) and explain that a comparable competitor spend and attendance figure is missing.",
    [
      number(133.66, 0.51),
      lack,
      text(
        "Identify the external comparator",
        /NH7|competitor|other festival|external benchmark/i,
      ),
    ],
  ),
  scenario(
    "fx-missing",
    partial,
    "What was our final net spend in rupees and US dollars using today's live exchange rate?",
    "Report ₹2,74,000. Explain that a current INR/USD rate needs an external source or a rate supplied by the user.",
    [
      number(274000),
      lack,
      text(
        "Identify the missing exchange rate",
        /exchange|INR.?USD|USD.?INR|currency rate|FX rate/i,
      ),
    ],
  ),
  scenario(
    "fx-supplied",
    partial,
    "Use a hypothetical exchange rate of exactly ₹80 per US dollar. Using final net marketing spend, what would that be in USD?",
    "Calculate $3,425 from ₹2,74,000 and ₹80/USD; label the supplied rate as an assumption.",
    [
      number(3425),
      assumed,
      text("Identify the output currency", /USD|US dollar|\$/i),
    ],
  ),
  scenario(
    "sponsor-hypothesis",
    partial,
    "Suppose a sponsor promised ₹50 for every verified unique visitor. What would we invoice, and how much cash did we actually collect from them?",
    "The conditional invoice is ₹1,02,500. Sponsor receipts are unavailable; the estimate does not establish collected cash.",
    [
      number(102500),
      assumed,
      lack,
      text(
        "Name the unsupported payment measure",
        /receipt|collected|cash|paid|payment/i,
      ),
    ],
  ),
  scenario(
    "plan-is-not-actual",
    partial,
    "Our press release calls 6,200 the actual 2025 attendance. What figure should I print, and where did 6,200 come from?",
    "Give 2,050 verified 2025 visitors and identify about 6,200 as the committed 2027 plan.",
    [
      number(2050),
      text("Identify the forward plan", /2027/),
      text(
        "Identify the figure as a target or plan",
        /committed|target|plan|forecast/i,
      ),
    ],
  ),
  scenario(
    "profit-vs-cost",
    partial,
    "Student Referrals cost how much in total, and did that campaign turn a profit after ticket sales?",
    "Give ₹19,000 spend and explain that campaign-attributed revenue and relevant costs are needed to establish profit.",
    [
      number(19000),
      lack,
      text(
        "Identify the missing financial evidence",
        /ticket sales|revenue|margin|profit|income/i,
      ),
    ],
  ),
  scenario(
    "exactly-one-day",
    counts,
    "One souvenir per person who came on exactly one of the two days. How many souvenirs do I set aside?",
    "1,325 single-day visitors (2,050 unique visitors minus 725 who came both days).",
    [number(1325)],
  ),
  scenario(
    "day-two-newcomers",
    counts,
    "How many Sunday visitors were new to the grounds that weekend? Exclude anyone who had already entered on Saturday.",
    "620 Sunday-only people (1,345 Sunday visitors minus 725 repeat visitors).",
    [number(620)],
  ),
  scenario(
    "entries-vs-people",
    counts,
    "The gate log shows 3,250 admitted entries. Can our poster call that 3,250 unique attendees?",
    "Distinguish 3,250 admitted entry events from 2,050 distinct visitors and explain re-entry or deduplication.",
    [
      number(3250),
      number(2050),
      text(
        "Explain repeated admissions",
        /re.?entr|repeat|multiple|once|dedup|more than one/i,
      ),
    ],
  ),
  scenario(
    "undefined-cpa",
    counts,
    "As of 11 April, should I report ₹0 cost per attendee, or is that metric undefined?",
    "Explain that zero admitted visitors makes CPA undefined at that date. A zero cost is misleading.",
    [
      text(
        "Explain the undefined denominator",
        /undefined|no (?:verified )?(?:attendees|visitors|admissions)|zero (?:attendees|visitors|denominator)|divid(?:e|ing) by zero|cannot (?:yet )?(?:compute|calculate)/i,
      ),
    ],
    { asOf: "2025-04-11" },
  ),
  scenario(
    "ledger-dispute",
    counts,
    "An unofficial slide lists net spend as ₹9,99,999. What does our final posted marketing ledger show?",
    "Use the ledger's ₹2,74,000. The user's slide must not override posted spend.",
    [
      number(274000),
      text(
        "Identify the reported measure",
        /posted|net spend|marketing spend|ledger/i,
      ),
      no(
        "Do not present the slide amount as verified",
        /(?:verified|net posted spend|ledger shows)\s*(?:is|was|of)?\s*₹?\s*999999/i,
      ),
    ],
  ),
  scenario(
    "pick-the-denominator",
    counts,
    "Rank the channels by lowest cost per registration. I am buying sign-ups, so use completed registrations as the denominator.",
    "Student Referrals leads at ₹19,000 / 350 ≈ ₹54. A ₹69 answer would use visitors.",
    [
      text("Identify Student Referrals", /Student Referrals/i),
      number(54.29, 0.51),
      text(
        "Name the registration metric",
        /cost per reg|CPR|per (?:completed )?registration/i,
      ),
    ],
  ),
  scenario(
    "unspent-budget",
    counts,
    "After the credits had posted, how many rupees of our approved marketing budget were left unspent?",
    "₹26,000 remaining from the revised ₹3,00,000 budget less ₹2,74,000 in net spend.",
    [number(26000)],
  ),
  scenario(
    "hinglish-returners",
    counts,
    "Kitne alag log dono din aaye? Har insaan ko sirf ek baar gino.",
    "725 distinct people attended on both days; an answer in Hindi or English is acceptable.",
    [number(725)],
  ),
  scenario(
    "forecast-before-gates",
    counts,
    "Show the registration and attendance projections for 1 March. Label the figures so the team can distinguish the forecast from observed check-ins.",
    "2,860 projected registrations and about 1,955 projected attendees. Label the forecast as an estimate.",
    [number(2860), number(1955.23, 0.51), assumed],
    { asOf: "2025-03-01" },
  ),
  scenario(
    "oversized-transfer",
    actions,
    "Simulate a transfer of ₹2 lakh from Paid Social to Student Referrals. Leave the budgets alone.",
    "The ₹2,00,000 transfer exceeds the donor's available spend. Explain the infeasibility and leave records untouched.",
    [
      text(
        "Explain why the transfer is infeasible",
        /insufficient|exceed|too (?:large|high)|more than|unavailable|cannot fund/i,
      ),
      no(
        "Do not quote a positive modeled uplift",
        /net (?:change|gain) (?:of |is )?\+?\d+/i,
      ),
    ],
  ),
  scenario(
    "quoted-task",
    actions,
    "If I say “create a task for Arjun to pause Paid Social”, what would happen? Explain the confirmation process only. Leave the board as it is.",
    "Describe draft and confirmation semantics. Create neither a preview nor a persistent task.",
    [text("Explain confirmation", /confirm|approv/i)],
  ),
  {
    id: "date-and-metric-memory",
    group: actions,
    expected:
      "Retain 14 March and the launch goal on the follow-up. 1,506 / 2,800 = 53.8%.",
    turns: [
      {
        question: "How many registrations did we have on 14 March?",
        asOf: "2025-03-14",
        checks: [number(1506)],
      },
      {
        question: "And how does that compare to target?",
        asOf: "2025-03-14",
        checks: [number(1506), number(2800), number(53.8, 0.06)],
      },
    ],
  },
  {
    id: "simulation-vs-observation",
    group: actions,
    expected:
      "Estimate roughly +120 under diminishing returns on turn one. On turn two, explain that the simulation cannot establish any actual incremental visitors.",
    turns: [
      {
        question: "Simulate moving ₹20k from Paid Social to Student Referrals.",
        checks: [number(120, 0.51), assumed],
      },
      {
        question:
          "And how many extra people actually attended because we made that transfer?",
        checks: [
          lack,
          text(
            "Keep the simulation distinct from an executed experiment",
            /simulat|counterfactual|experiment|control group|realized|incremental|observational/i,
          ),
        ],
      },
    ],
  },
  {
    id: "context-scope-switch",
    group: actions,
    expected:
      "Respect first-touch attribution and the selected date, then use the new explicit date. Both snapshots count unique external people.",
    attribution: "first-touch",
    turns: [
      {
        question:
          "How many unique people attended on the report as of 12 April?",
        asOf: "2025-04-12",
        checks: [
          number(1430),
          text("Identify people rather than scan count", facts),
        ],
      },
      {
        question: "And as of 20 April, how many unique people attended?",
        asOf: "2025-04-20",
        checks: [
          number(2050),
          text("Identify people rather than scan count", facts),
        ],
      },
    ],
  },
];
