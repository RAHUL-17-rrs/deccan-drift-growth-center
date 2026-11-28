import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { groundedReply } from "../lib/grounded-reply.mjs";

process.env.GROWTH_TEST = "1";
const { seed } = await import("../scripts/seed.mjs");
const { scalar } = await import("../lib/db.mjs");
const { chat } = await import("../lib/copilot.mjs");
const { evidence } = await import("../lib/evidence.mjs");

const ctx = { d: "2025-04-20", a: "registration", user: "Pranit" };
const ask = (question, options = {}) =>
  chat({ question, as_of: ctx.d, attribution: ctx.a, ...options }, ctx.user);
const tasks = () => scalar("select (select count(*) from tasks) tasks, (select count(*) from drafts) drafts");

before(async () => {
  await seed();
  // The mocked adapters run in this test process and never use project credentials.
  process.env.OPENAI_API_KEY = process.env.ANTHROPIC_API_KEY = process.env.GEMINI_API_KEY = "test-placeholder";
});
after(async () => { await seed(); });

function call(name, args) {
  return { type: "function_call", name, arguments: JSON.stringify(args), call_id: name };
}
function message(text) {
  return { type: "message", role: "assistant", content: [{ type: "output_text", text }] };
}
function mockOpenAI(t, replies) {
  process.env.COPILOT_PROVIDER = "openai";
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const index = requests.push(JSON.parse(init.body)) - 1;
    assert.ok(index < replies.length, "Unexpected extra model turn");
    return Response.json({ output: replies[index] });
  });
  return requests;
}

test("OpenAI shows both the measured CPA and why an external comparison is unavailable", async t => {
  const answer = "[Calculation] Our blended cost per attendee is ₹134. [E1]\n\n" +
    "[Not in data] The workbook has no competitor CPA for the same event period. [E2]";
  const requests = mockOpenAI(t, [
    [call("get_kpis", { metric: "cpa" }), call("describe_data", { reason: "missing" })],
    [message(answer)],
  ]);
  const reply = await ask("How does our CPA compare with the other festival?");
  assert.equal(reply.answer, answer);
  assert.deepEqual(reply.calls.map(r => r.ref), ["E1", "E2"]);
  const outputs = requests[1].input.filter(item => item.type === "function_call_output");
  assert.equal(Math.round(JSON.parse(outputs[0].output).data.cpa), 134);
  assert.equal(reply.scope.mode, "openai");
});

test("An unsupported amount is retried and replaced by a sourced answer", async t => {
  const answer = "[Calculation] ₹26,000 remains in the approved budget. [E1]";
  const requests = mockOpenAI(t, [
    [call("get_kpis", { metric: "remaining_budget" })],
    [message("[Calculation] ₹99,999 remains in the approved budget. [E1]")],
    [message(answer)],
  ]);
  const reply = await ask("How much of the budget do we have left?");
  assert.equal(requests.length, 3);
  assert.equal(reply.answer, answer);
});

test("Repeatedly unsupported replies fall back to the database summary", async t => {
  const unsupported = message("[Data] We had 87,654 visitors. [E1]");
  mockOpenAI(t, [[call("get_kpis", { metric: "attendees" })], ...Array(7).fill([unsupported])]);
  const reply = await ask("How many visitors attended?");
  assert.match(reply.answer, /2,050/);
  assert.doesNotMatch(reply.answer, /87,654/);
});

for (const provider of ["anthropic", "gemini"]) {
  test(provider + " also returns the explanation after tool execution", async t => {
    process.env.COPILOT_PROVIDER = provider;
    const answer = "[Data] The weekend drew 2,050 unique visitors. [E1]";
    const gemini = provider === "gemini";
    let turn = 0;
    t.mock.method(globalThis, "fetch", async () => {
      assert.ok(turn < 2);
      const first = turn++ === 0;
      if (gemini) {
        const parts = first ? [{ functionCall: { name: "get_kpis", args: { metric: "attendees" } } }] : [{ text: answer }];
        return Response.json({ candidates: [{ content: { parts } }] });
      }
      const content = first ? [{ type: "tool_use", id: "1", name: "get_kpis", input: { metric: "attendees" } }] :
        [{ type: "text", text: answer }];
      return Response.json({ content });
    });
    assert.equal((await ask("How many unique visitors came this weekend?")).answer, answer);
    assert.equal(turn, 2);
  });
}

test("A simulation cannot supply a measured uplift, even alongside a real observation", () => {
  const calls = [
    { tag: "Assumption / estimate", answer: "Projected gain of 120 attendees.", data: { gain: 120 } },
    { tag: "Data", answer: "2,050 unique attendees.", data: { attendees: 2050 } },
  ];
  assert.equal(groundedReply("[Data] The transfer brought in 120 additional people. [E1] [E2]", calls, ""), null);
  assert.equal(groundedReply("[Data] Attendance increased 2050%. [E2]", calls, ""), null);
  assert.ok(groundedReply("[Assumption / estimate] The transfer is projected to add 120 attendees. [E1]", calls, ""));
});

test("Weekend admissions distinguish entry events, individuals, overlap and first arrivals", async () => {
  const full = (await evidence("get_checkins", { by: "day" }, ctx)).data;
  assert.deepEqual([full.entries, full.unique_people, full.single_day, full.both], [3250, 2050, 1325, 725]);
  assert.deepEqual(full.groups.map(r => [r.people, r.first_time]), [[1430, 1430], [1345, 620]]);
  const saturday = (await evidence("get_checkins", { as_of: "2025-04-12" }, ctx)).data;
  assert.equal(saturday.groups.length, 1);
  assert.equal(saturday.both, 0);
});

test("The short request from the dashboard produces a measured recommendation in local mode", async () => {
  process.env.COPILOT_PROVIDER = "local";
  const reply = await ask("suggest imporve");
  assert.equal(reply.scope.mode, "local");
  assert.ok(reply.calls.some(c => c.tool === "compare_campaigns"));
  assert.ok(reply.calls.some(c => c.tool === "simulate_reallocation"));
  assert.match(reply.answer, /Student Referrals/);
  assert.match(reply.answer, /\[Assumption \/ estimate\]/);
  assert.equal(reply.draft, null);
});

test("Conditional calculations use the requested factor and reject an invented exchange rate", async () => {
  const args = { metric: "spend", operation: "divide", factor: 80 };
  const usd = await evidence("calculate_scenario", args, { ...ctx, question: "Convert the spend at ₹80/USD." });
  assert.equal(usd.data.result, 3425);
  assert.equal(usd.tag, "Assumption / estimate");
  const fee = await evidence("calculate_scenario", { metric: "attendees", operation: "multiply", factor: 37.5 },
    { ...ctx, question: "What would we invoice at ₹37.50 per verified visitor?" });
  assert.equal(fee.data.result, 76875);
  await assert.rejects(evidence("calculate_scenario", args, { ...ctx, question: "Convert spend at today's rate." }), /supplied/);
});

test("A quoted request stays read-only even if the provider tries to draft a task", async t => {
  const before = await tasks();
  mockOpenAI(t, [[call("draft_task", { title: "Pause Paid Social" })],
    [message("[Data] An explicit request opens a preview. Confirming saves the task. [E1]")]]);
  const reply = await ask("If I type “create a task to pause Paid Social”, what would happen?");
  assert.equal(reply.draft, null);
  assert.equal(reply.calls[0].tool, "describe_task_workflow");
  assert.deepEqual(await tasks(), before);
});

test("An actual task request creates exactly one preview and no saved task", async t => {
  const before = await tasks();
  mockOpenAI(t, [[call("draft_task", { title: "Review campaign budgets", owner: "Pranit" })],
    [message("[Data] Review your draft and confirm to save it. [E1]")]]);
  const reply = await ask("Please create a task to review campaign budgets.");
  assert.equal(reply.draft.title, "Review campaign budgets");
  assert.deepEqual(await tasks(), { tasks: before.tasks, drafts: before.drafts + 1 });
});

test("OpenAI task drafts resolve a first-name owner, campaign name and 'by Friday' from today", async t => {
  const { friday } = await import("../lib/copilot.mjs");
  const requests = mockOpenAI(t, [
    // The model's real failing call: a first name and a Friday counted from the historical as-of date.
    [call("draft_task", { title: "Cut Creator Partners spend", owner: "Arjun", deadline: "2025-04-25", campaign: "Creator Partners" })],
    [message("[Data] Review the task draft and confirm to save it. [E1]")],
  ]);
  const reply = await ask("Please draft a task to cut Creator Partners spend by Friday. Assign it to Arjun.");
  assert.equal(reply.draft.owner, "Arjun Verma");
  assert.equal(reply.draft.campaign_id, "C03");
  assert.equal(reply.draft.deadline, friday());
  // "Cut" without an amount attaches no automatic campaign change; only pause or stop does.
  assert.equal(reply.draft.proposed, null);
  assert.equal(reply.scope.as_of, ctx.d);
  const tool = requests[0].tools.find(x => x.name === "draft_task");
  assert.ok(tool.parameters.properties.owner.enum.includes("Arjun Verma"));
});

test("Task drafts attach a budget change for a cut with an amount and a status change only for pause", async t => {
  mockOpenAI(t, [
    [call("draft_task", { title: "Cut Creator Partners spend by ₹10,000", owner: "Nisha Rao", campaign: "C03" })],
    [message("[Data] Review the task draft. [E1]")],
    [call("draft_task", { title: "Pause Creator Partners", owner: "Nisha Rao", campaign: "C03" })],
    [message("[Data] Review the task draft. [E1]")],
  ]);
  // The seeded allocation splits ₹3,00,000 by 2025 net spend: ₹59,000 / ₹2,74,000 → ₹64,500.
  const cut = await ask("Please draft a task for Nisha to cut Creator Partners spend by ₹10,000.");
  assert.deepEqual(cut.draft.proposed, { budget: 54500 });
  const pause = await ask("Please draft a task for Nisha to pause Creator Partners.");
  assert.deepEqual(pause.draft.proposed, { status: "paused" });
});

test("An unknown owner returns the valid owners to the model, and a failed request explains why", async t => {
  const bad = call("draft_task", { title: "Audit tracking", owner: "Arjun Singh" });
  const requests = mockOpenAI(t, [[bad], ...Array(7).fill([message("[Data] Done.")])]);
  const reply = await ask("Please create a task to audit Community Groups tracking.");
  const output = requests[1].input.find(item => item.type === "function_call_output").output;
  assert.match(output, /Choose one of: Pranit, Meera Iyer, Arjun Verma/);
  assert.equal(reply.draft, null);
  assert.match(reply.answer, /Unknown task owner/);
});

test("Relative deadlines and owner names resolve deterministically", async () => {
  const { relativeDeadline, resolveOwner } = await import("../lib/copilot.mjs");
  const today = "2026-11-28"; // a Saturday
  assert.equal(relativeDeadline("cut spend by Friday", today), "2026-12-04");
  assert.equal(relativeDeadline("brief leads next week", today), "2026-12-05");
  assert.equal(relativeDeadline("call them tomorrow", today), "2026-11-29");
  assert.equal(relativeDeadline("due next Saturday", today), "2026-12-05");
  assert.equal(relativeDeadline("audit tracking", today), null);
  assert.equal(resolveOwner("meera", "Pranit"), "Meera Iyer");
  assert.equal(resolveOwner("me", "Nisha Rao"), "Nisha Rao");
  assert.equal(resolveOwner("Arjun Singh", "Pranit"), null);
});

test("Direct measures keep their denominators and campaign filters in OpenAI mode", async t => {
  mockOpenAI(t, []);
  for (const [question, expected] of [
    ["Which campaign has the highest cancellation rate?", /Creator Partners[^\n]*36 cancelled registrations \/ 350 registrations = 10\.3%/],
    ["Compare CTR for C02 vs C05", /Paid Social[^\n]*2\.1%[\s\S]*Student Referrals[^\n]*4\.8%|Student Referrals[^\n]*4\.8%[\s\S]*Paid Social[^\n]*2\.1%/],
    ["What is the email click-to-open rate?", /409 email clicks \/ 992 opens = 41\.2%/],
    ["How many people opted out of emails?", /229 people who opted out/],
    ["C02 cost per attendee?", /Paid Social[^\n]*340 attributed attendees = ₹273\.53/],
    ["Calculate 12.5 percent of INR 48,000", /6,000/],
    ["What's 15% of 2,74,000?", /41,100/],
    ["What was our sponsorship income?", /receipts are absent/],
    ["How many people will come in 2027?", /\[Assumption \/ estimate\].*Deccan Drift 2027 plan.*not a forecast[\s\S]*Holdback[^\n]*: 5%[\s\S]*Sponsor gate[^\n]*: ₹175\b/],
    ["Spend as of 11 Apr vs final, why different?", /₹2,76,500 on 11 Apr 2025[\s\S]*₹2,74,000 on 20 Apr 2025[\s\S]*Creator Partners −₹2,000 on 16 Apr 2025[\s\S]*Student Referrals −₹500 on 18 Apr 2025[\s\S]*entirely these credits/],
    ["Why did Paid Social's cost per attendee change?", /Paid Social cost per attendee: ₹273\.53 on 13 Apr 2025 → ₹273\.53 on 20 Apr 2025/],
    ["How's Arjun doing?", /Arjun Verma[^\n]*₹200[^\n]*₹1,07,000[^\n]*535/],
  ]) {
    const reply = await ask(question);
    assert.match(reply.answer,expected,question);
    assert.ok(reply.calls.length,question);
  }
});

test("A changed campaign count recalculates its CPA and leaves the blended denominator separate", async t => {
  mockOpenAI(t, []);
  const {sql} = await import("../lib/db.mjs");
  // One additional verified entry for a registered person who has never entered.
  const row = await scalar("select r.person_id,r.registration_id from fn_regs('2025-04-20','registration') r where cid='C02' and not exists (select 1 from fn_visitors('2025-04-20','registration') v where v.person_id=r.person_id) limit 1");
  const {literal:L} = await import("../lib/db.mjs");
  try {
    await sql("insert into raw_checkins(event_id,person_id,registration_id,campaign_id,occurred_at,result,verification,source) values ('REGRESSION-CPA'," +
      L(row.person_id) + "," + L(row.registration_id) + ",'C02','2025-04-12T18:00:00+05:30','admitted','verified','scanner')");
    const reply = await ask("What was the CPA for Paid Social?");
    assert.match(reply.answer,/341 attributed attendees = ₹272\.73/);
    const early = await ask("What was the CPA for C02?",{as_of:"2025-04-11"});
    assert.match(early.answer,/no eligible|undefined/i);
  } finally { await sql("delete from raw_checkins where event_id='REGRESSION-CPA'"); }
});

test("Counterfactuals use scoped observations and label assumptions", async t => {
  mockOpenAI(t,[]);
  for (const [q,expected] of [
    ["What if we had never run Creator Partners?", [/59,000/,/175 attributed attendees/,/1,875/,/114\.67/]],
    ["If Paid Social's show-up were as good as Referrals' (78.6%), how many more attendees?", [/78\.6%/,/680/,/534/,/194/]],
    ["How much budget is left and how many attendees could it buy at our best CPA?", [/26,000/,/69\.09/,/376/,/linear estimate/]],
  ]) {
    const r = await ask(q);
    assert.equal(r.calls[0].tool,"estimate_campaign");
    assert.match(r.answer,/^\[Assumption \/ estimate\]/);
    for (const value of expected) assert.match(r.answer,value);
  }
});

test("Unsupported campaign measures cannot silently become CPA, and spend cannot verify receipts", async () => {
  await assert.rejects(evidence("compare_campaigns",{metric:"cancellation_rate"},ctx),/get_channel_measure/);
  const ledger = [{tool:"get_spend",tag:"Data",answer:"Net posted spend ₹2,74,000.",data:{spend:274000}}];
  assert.equal(groundedReply("[Data] Sponsors paid ₹2,74,000. [E1]",ledger,"How much did the sponsors pay?"),null);
});

test("A provider cannot turn an unsupported operand into a cited result", async t => {
  const requests = mockOpenAI(t,[[call("calculate",{expression:"987654 * 100"})],
    [call("get_kpis",{metric:"attendees"})],[message("[Data] There were 2,050 attendees. [E1]")]]);
  const r = await ask("How large was the verified festival audience?");
  assert.match(requests[1].input.find(x=>x.type==="function_call_output").output,/987654 has no source/);
  assert.equal(r.calls[0].tool,"get_kpis");
});

test("Each assignment can be confirmed independently and only its own change is proposed", async t => {
  mockOpenAI(t, []);
  const {resolveDraft} = await import("../lib/copilot.mjs");
  const before = await tasks();
  const r = await ask("Create a task for Nisha to pause Creator Partners and one for Arjun to test a ₹99 deposit on Paid Social, due next Friday.");
  assert.deepEqual(r.drafts.map(d => [d.owner,d.campaign_id,d.proposed]),[
    ["Nisha Rao","C03",{status:"paused"}],["Arjun Verma","C02",null],
  ]);
  assert.deepEqual(await tasks(),{tasks:before.tasks,drafts:before.drafts+2});
  const act = (draft,decision) => resolveDraft({draft_id:draft.id,conversation:r.conversation,decision},ctx.user);
  assert.equal((await act(r.drafts[0],"cancel")).saved,false);
  const saved = await act(r.drafts[1],"confirm");
  assert.equal((await act(r.drafts[1],"confirm")).id,saved.id);
  assert.equal((await tasks()).tasks,before.tasks+1);
  const list = await ask("What tasks does Arjun have?");
  const done = await ask("Mark that task as done.",{conversation:list.conversation});
  assert.equal(done.draft.task_id,saved.id);
  assert.equal(done.draft.owner,"Arjun Verma");
  await resolveDraft({draft_id:done.draft.id,conversation:done.conversation,decision:"confirm"},ctx.user);
  assert.equal((await scalar("select status from tasks where id='"+saved.id+"'")).status,"done");
});
