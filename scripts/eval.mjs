import fs from "node:fs";
import assert from "node:assert/strict";
process.env.GROWTH_TEST = "1";
if (process.argv.includes("--local")) process.env.COPILOT_PROVIDER = "local";
const { seed } = await import("./seed.mjs");
const { chat, resolveDraft, modelMode, friday } =
  await import("../lib/copilot.mjs");
const { scalar, rows, sql } = await import("../lib/db.mjs");
const { editData, manage } = await import("../lib/service.mjs");
const { readonly } = await import("../lib/evidence.mjs");
const cases = [];
let prior, draft, before, after, changed;
const actor = "Pranit";
async function check(question, expected, fn) {
  try {
    const actual = await fn();
    cases.push({ question, expected, actual, pass: true });
    console.log("PASS", question);
  } catch (e) {
    if (modelMode() !== "local" && (e.message === "fetch failed" || /returned HTTP (401|403)/.test(e.message))) {
      throw new Error("Provider evaluation unavailable (" + (e.cause?.code || e.message) +
        "). No answer-quality score was recorded. Use --local to evaluate the local copilot.", {cause:e});
    }
    cases.push({ question, expected, actual: e.message, pass: false });
    console.log("FAIL", question, e.message);
  }
}
const ask = (question, options = {}) =>
  chat(
    { question, as_of: "2025-04-20", attribution: "registration", ...options },
    actor,
  );
async function match(q, rx, options = {}) {
  const r = await ask(q, options);
  for (const re of rx) assert.match(r.answer, re);
  assert.ok(r.calls.length);
  return r;
}
await seed();
try {
  for (const [q, expected, rx] of [
    ["How many unique people attended?", "2,050 distinct attendees", [/2,050/]],
    [
      "Which campaign has the lowest cost per attendee?",
      "Student Referrals ₹69",
      [/Student Referrals/, /₹69/],
    ],
    [
      "Which campaigns are underperforming and why?",
      "Paid Social and Creator Partners; ~55% of spend, ~27% of attributed visitors, 50% show-up",
      [/Paid Social/, /Creator Partners/, /55\.\d%/, /26\.\d%|27%/, /50%/],
    ],
  ])
    await check(q, expected, async () => {
      const r = await match(q, rx);
      if (q.includes("underperform")) {
        before = r;
        prior = r.conversation;
      }
      return r.answer;
    });
  await check(
    "What should we do?",
    "Recommendation supported by a simulator estimate",
    async () =>
      (
        await match("What should we do?", [/estimate/i, /net/i], {
          conversation: prior,
        })
      ).answer,
  );
  await check(
    "How many registrations did we have on 1 March?",
    "1,144 · launch",
    async () => {
      const r = await match("How many registrations did we have on 1 March?", [
        /1,144/,
      ]);
      prior = r.conversation;
      assert.match(r.scope.target, /launch/);
      return r.answer + " " + r.scope.target;
    },
  );
  await check(
    "And how does that compare to target?",
    "1,144 / 2,800 · 40.9% attainment · 102% pacing",
    async () =>
      (
        await match(
          "And how does that compare to target?",
          [/1,144/, /2,800/, /40\.9%/, /102(?:\.1)?%/],
          { conversation: prior },
        )
      ).answer,
  );
  const spending =
    "What was spend as of 11 April vs final, and why are they different?";
  await check(
    spending,
    "₹2,76,500 vs ₹2,74,000 and posted credits",
    async () =>
      (await match(spending, [/2,76,500/, /2,74,000/, /credit/i])).answer,
  );
  const both = "How many people came both days?";
  await check(both, "725", async () => (await match(both, [/725/])).answer);
  const move = "If we move ₹20k from Paid Social to Referrals, what happens?";
  await check(
    move,
    "Linear loss ~73 and gain ~290; diminishing net ~120",
    async () =>
      (await match(move, [/estimate/i, /120|119|121/, /-73/, /289|290/]))
        .answer,
  );
  const task =
    "Create a task for Arjun to cut Creator Partners spend by Friday";
  await check(
    task,
    "Preview only · C03 · Arjun Verma · resolved Friday",
    async () => {
      draft = await ask(task);
      assert.equal(draft.draft.owner, "Arjun Verma");
      assert.equal(draft.draft.campaign_id, "C03");
      assert.equal(draft.draft.deadline, friday());
      assert.equal(await sql("select count(*) from tasks"), "0");
      return (
        draft.draft.title +
        " · " +
        draft.draft.campaign_id +
        " · " +
        draft.draft.deadline
      );
    },
  );
  await check(
    "Confirm twice and complete the proposed change",
    "One AI task, open count 1; completion applies paused status",
    async () => {
      const params = {
        conversation: draft.conversation,
        draft_id: draft.draft.id,
        decision: "confirm",
      };
      const [a, b] = await Promise.all([
        resolveDraft(params, actor),
        resolveDraft(params, actor),
      ]);
      assert.equal(a.id, b.id);
      const t = await scalar("select * from tasks");
      assert.equal(t.created_by, "AI");
      assert.equal(t.source, draft.conversation);
      assert.equal(
        (await scalar("select * from fn_kpis('2025-04-20','registration')"))
          .open_tasks,
        1,
      );
      await assert.rejects(
        manage(
          { entity: "task", op: "edit", id: t.id, data: { status: "done" } },
          actor,
        ),
      );
      await manage(
        {
          entity: "task",
          op: "edit",
          id: t.id,
          data: { status: "done" },
          confirmApply: true,
        },
        actor,
      );
      assert.equal(
        await sql(
          "select status from campaign_settings where campaign_id='C03'",
        ),
        "paused",
      );
      return "One linked AI task, one open action, completion applied paused status";
    },
  );
  for (const q of [
    "Which artist drove the most attendance?",
    "What is the gender split?",
    "How many will attend next year?",
  ])
    await check(
      q,
      "Explains missing field or uncertain forecast",
      async () => (await match(q, [/can.t answer/i])).answer,
    );
  for (const [q, expected, rx] of [
    [
      "Which owner drove the most registrations?",
      "Meera Iyer, 970",
      [/Meera Iyer.*970/],
    ],
    ["Busiest registration week?", "24 March 2025, 354", [/2025-03-24.*354/]],
    ["How many people opted out?", "229", [/229/]],
    [
      "Scanner vs manual check-ins?",
      "2,945 scanner, 305 manual",
      [/2,945/, /305/],
    ],
    [
      "What's Organic Search's session-to-registration rate?",
      "250 / 1,893 = 13.2%",
      [/250/, /1,893/, /13.2%/],
    ],
  ])
    await check(q, expected, async () => (await match(q, rx)).answer);
  await check(
    "Edit 50 Paid Social check-ins and re-ask diagnosis",
    "Paid Social CPA rises; attributed share refreshes",
    async () => {
      const snap = () =>
        scalar(
          "select cpa,attendees from fn_campaign_metrics('2025-04-20','registration') where cid='C02'",
        );
      const old = await snap();
      await editData(
        {
          table: "checkins",
          op: "bulk",
          field: "campaign_id",
          value: "C02",
          limit: 50,
        },
        actor,
      );
      const fresh = await snap();
      assert.ok(fresh.cpa > old.cpa);
      assert.ok(fresh.attendees < old.attendees);
      after = await ask("Which campaigns are underperforming and why?");
      assert.notEqual(after.answer, before.answer);
      const rank = await ask(
        "Which campaign has the lowest cost per attendee?",
      );
      assert.equal(
        rank.calls[0].data.find((x) => x.cid === "C02").cpa,
        fresh.cpa,
      );
      changed = fresh;
      return (
        "Paid Social " +
        old.attendees +
        " → " +
        fresh.attendees +
        " visitors; CPA ₹" +
        old.cpa.toFixed(2) +
        " → ₹" +
        fresh.cpa.toFixed(2) +
        ". " +
        after.answer
      );
    },
  );
  await check(
    "Edit referral spend and re-ask lowest CPA",
    "The cheapest campaign changes to Organic Search",
    async () => {
      const row = await scalar(
        "select rid,marketing_spend_inr from raw_marketing where campaign_id='C05' order by rid limit 1",
      );
      await editData(
        {
          table: "marketing",
          op: "edit",
          rid: row.rid,
          data: { marketing_spend_inr: row.marketing_spend_inr + 10000 },
        },
        actor,
      );
      return (
        await match("Which campaign has the lowest cost per attendee?", [
          /Organic Search/,
          /₹72/,
        ])
      ).answer;
    },
  );
  await check(
    "Scoped read-only unfamiliar query",
    "As-of 1 March returns 1,144, disallowed write/system access rejected",
    async () => {
      assert.equal(
        (
          await readonly(
            "SELECT count(*) AS registrations FROM clean_registrations",
            "2025-03-01",
            "registration",
          )
        )[0].registrations,
        1144,
      );
      for (const q of [
        "DELETE FROM clean_checkins",
        "SELECT * FROM raw_checkins",
        "SELECT pg_sleep(2) FROM clean_people",
        "select * from clean_people; select * from clean_targets",
      ])
        await assert.rejects(readonly(q, "2025-03-01", "registration"));
      return "1,144; rejected four unsupported queries";
    },
  );
} finally {
  await seed();
}
await check(
  "Restore original data",
  "Final attendance 2,050; tasks cleared",
  async () => {
    assert.equal(
      await sql("select attendees from fn_kpis('2025-04-20','registration')"),
      "2050",
    );
    assert.equal(await sql("select count(*) from tasks"), "0");
    return "2,050 and 0 tasks";
  },
);
const count = cases.filter((x) => x.pass).length,
  esc = (v) =>
    String(v).replaceAll("|", "/").replace(/\s+/g, " ").slice(0, 900);
const report =
  [
    "# Growth Copilot evaluation",
    "",
    "Provider mode: **" +
      modelMode() +
      "**. Database: isolated test database, restored from both original workbooks.",
    "",
    "**" +
      count +
      " / " +
      cases.length +
      " passed (" +
      Math.round((count / cases.length) * 100) +
      "%).**",
    "",
    "| Question or workflow | Expected | Observed | Result |",
    "|---|---|---|---|",
    ...cases.map(
      (x) =>
        "| " +
        [x.question, x.expected, x.actual, x.pass ? "Pass" : "Fail"]
          .map(esc)
          .join(" | ") +
        " |",
    ),
  ].join("\n") + "\n";
fs.mkdirSync("eval", { recursive: true });
fs.writeFileSync("eval/results.md", report);
const readme = fs.readFileSync("README.md", "utf8");
const start = "<!-- copilot-results -->";
const end = "<!-- end-copilot-results -->";
if (readme.includes(start) && readme.includes(end)) {
  const results = report.slice(report.indexOf("Provider mode"));
  fs.writeFileSync("README.md", readme.slice(0,readme.indexOf(start))+
    start+"\n\n"+results+"\n"+readme.slice(readme.indexOf(end)));
}
console.log(count + "/" + cases.length + " passed (" + modelMode() + ")");
if (count !== cases.length) process.exitCode = 1;

const { evaluateChallenges } = await import("./eval-challenges.mjs");
await evaluateChallenges({ freshlySeeded: true });
