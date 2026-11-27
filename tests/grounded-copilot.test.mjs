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
  mockOpenAI(t, [[call("get_kpis", { metric: "attendees" })], ...Array(5).fill([unsupported])]);
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
