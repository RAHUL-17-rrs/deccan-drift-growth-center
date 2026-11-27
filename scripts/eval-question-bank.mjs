import fs from "node:fs";
import assert from "node:assert/strict";

process.env.GROWTH_TEST = "1";
process.env.GROWTH_FIXTURE = "bank";
if (process.argv.includes("--local")) process.env.COPILOT_PROVIDER = "local";
const { chat, modelMode, resolveDraft } = await import("../lib/copilot.mjs");
const { scalar, rows, sql } = await import("../lib/db.mjs");
const { editData, manage } = await import("../lib/service.mjs");
const { seed } = await import("./seed.mjs");
const mode = modelMode();
const reportDate = "2025-04-20";
const actor = "Pranit";
const scopeArgs = "'2025-04-20','registration'";
const cases = new Map();
const demo = [];
let section, thread;
for (const line of fs.readFileSync("Copilot_Test_Questions.md", "utf8").split(/\r?\n/)) {
  const heading = /^## ([A-K])\./.exec(line);
  if (heading) section = heading[1];
  const row = /^\| ([A-J]\d+) \| (.+?) \| (.+?) \|(?: (.+?) \|)?$/.exec(line);
  if (row) cases.set(row[1], { id: row[1], prompt: row[2], expected: row[4] || row[3], turns: [], notes: [] });
  const group = /^\*\*(D\d+)\*\*$/.exec(line);
  if (group) {
    thread = { id: group[1], steps: [], expected: "", turns: [], notes: [] };
    cases.set(thread.id, thread);
  }
  const numbered = /^\d+\. (.+)/.exec(line);
  if (section === "D" && numbered) {
    const [question, expected = "Compare the named campaigns using evidence."] = numbered[1].split(/ → (.*)/);
    thread.steps.push(question);
    thread.expected += question + " → " + expected + "\n";
  }
  if (section === "K" && numbered) demo.push(numbered[1]);
}
cases.set("K", { id: "K", expected: demo.join("\n"), turns: [], notes: [] });
assert.equal(cases.size, 111, "Review the scenario mapping if the bank changes");
const clean = text => text.replaceAll("*", "").replaceAll("\x60", "").trim();
const resultFile = "eval/question-bank-transcript-" + mode + ".md";
const worksheet = [];
const state = () => scalar("select (select count(*) from tasks) tasks, (select count(*) from drafts) drafts");
let executed = 0;
const allDrafts = reply => reply?.drafts || (reply?.draft ? [reply.draft] : []);

async function ask(item, question, options = {}) {
  const turn = { question };
  item.turns.push(turn);
  try {
    const r = await chat({ as_of: reportDate, attribution: "registration", ...options, question }, options.user || actor);
    executed++;
    Object.assign(turn, { answer: r.answer, date: r.scope.as_of, target: r.scope.target, attribution: r.scope.attribution,
      tools: r.calls.map(c => c.tool), drafts: allDrafts(r).map(d => [d.title, d.owner, d.campaign_id, d.deadline, d.status]) });
    return r;
  } catch (error) {
    turn.error = [error.message, error.cause?.code].filter(Boolean).join(" ");
    if (/fetch failed|returned HTTP (401|403|429)/i.test(turn.error)) throw error;
    return null;
  }
}
async function ordinary(item) {
  let conversation;
  const question = clean(item.prompt || "").replace(/\s*\(ask with the date set to 1 April\)$/, "");
  let prompts = item.steps || (["H9","H14"].includes(item.id) ? question.split(" / ") : [question]);
  if (item.id === "I11") prompts = [cases.get("A11").prompt, cases.get("A11").prompt];
  for (const q of prompts) {
    const r = await ask(item, q, { conversation, as_of: item.id === "E10" ? "2025-04-01" : reportDate });
    if (r) conversation = r.conversation;
  }
}
async function resolve(item, reply, decision, user = actor) {
  for (const d of allDrafts(reply)) {
    const r = await resolveDraft({ conversation: reply.conversation, draft_id: d.id, decision }, user);
    item.notes.push((decision === "confirm" ? "Confirmed" : "Cancelled") + " “" + d.title + "”. Saved: " + r.saved + ".");
  }
}
async function execution() {
  let related;
  for (const id of ["G1","G2","G3","G4","G5","G6","G7","G8"]) {
    const item = cases.get(id);
    const before = await state();
    if (id === "G3") {
      await ask(item, "Show my open tasks.", { user: "Arjun Verma" });
      related = await ask(item, "What tasks does Arjun have?");
    } else if (id === "G8") {
      const r = await ask(item, cases.get("G1").prompt);
      await resolve(item, r, "cancel");
      await ask(item, "did you create it?", { conversation: r?.conversation });
    } else {
      const r = await ask(item, clean(item.prompt), { conversation: id === "G4" ? related?.conversation : undefined });
      if (id === "G1" || id === "G4") {
        item.notes.push("Before confirmation: " + JSON.stringify(await state()));
        await resolve(item, r, "confirm");
      }
      if (id === "G2") item.notes.push("STOP campaigns in fixture: " +
        await sql("select count(*) from fn_alerts(" + scopeArgs + ") where label='STOP'"));
    }
    item.notes.push("Tasks and previews: " + JSON.stringify(before) + " → " + JSON.stringify(await state()));
    if (["G1","G3","G4"].includes(id)) item.notes.push("Manager: " + JSON.stringify(await rows(
      "select title,owner,campaign_id,status,created_by,applied from tasks order by created_at")) +
      ". C03 operating status: " + await sql("select status from campaign_settings where campaign_id='C03'"));
  }
}

const add = (table, data) => editData({ table, op: "add", data }, actor);
async function fixture(id) {
  const item = cases.get(id);
  const known = ref => cases.get(ref).prompt;
  const snap = "select * from fn_kpis(" + scopeArgs + ")";
  if (id === "J1") {
    // Selecting 50 arbitrary entry rows can leave visitors who have another entry or a retry.
    const events = await rows("with singletons as (select person_id,min(event_id) event_id from fn_entries(" +
      scopeArgs + ") group by person_id having count(*)=1 and min(cid)='C02') select min(r.rid) rid from " +
      "singletons join raw_checkins r using(event_id) group by event_id having count(*)=1 order by event_id limit 50");
    assert.equal(events.length, 50);
    for (const { rid } of events) await editData({ table: "checkins", op: "delete", rid }, actor);
    assert.equal((await scalar(snap)).attendees, 2000);
    item.notes.push("Removed the sole admission for each of 50 distinct Paid Social visitors. Database attendance: 2,000.");
    return [known("A1"),known("A11"),known("E1"),"Paid Social cost per attendee?"];
  }
  if (id === "J2") {
    await add("marketing",{ campaign_id:"C05", campaign_name:"Student Referrals", activity_id:"BANK-REFERRAL", activity_date:reportDate, marketing_spend_inr:40000 });
    assert.equal((await scalar(snap)).spend, 314000);
    item.notes.push("Dated the ₹40,000 row on the selected report day so the historical snapshot includes it.");
    return [known("A11"),known("A3")];
  }
  if (id === "J3") {
    await manage({entity:"campaign",op:"add",id:"BANK-WA",data:{campaign_name:"WhatsApp Groups",channel:"community",created_at:"2025-03-01",owner_name:"Meera Iyer"}},actor);
    await add("marketing",{campaign_id:"BANK-WA", activity_id:"BANK-WA-M", activity_date:reportDate, marketing_spend_inr:600});
    const person = await scalar("select p.person_id from clean_people p where person_type='external' and not exists(select 1 from clean_registrations r where r.person_id=p.person_id) order by person_id limit 1");
    await add("registrations",{campaign_id:"BANK-WA", person_id:person.person_id, registration_id:"BANK-WA-R", registered_at:reportDate, owner_name:"Meera Iyer"});
    const m = await scalar("select spend,regs,attendees from fn_campaign_metrics(" + scopeArgs + ") where cid='BANK-WA'");
    assert.deepEqual(m,{spend:600,regs:1,attendees:0});
    item.notes.push("New campaign has ₹600 spend, 1 registration, 0 verified visitors and undefined CPA.");
    return ["List all campaigns", known("E1")];
  }
  if (id === "J4") {
    const { rid, ...data } = await scalar("select * from clean_marketing order by rid limit 1");
    await add("marketing", data);
    assert.equal((await scalar(snap)).spend, 274000);
    return [known("A3")];
  }
  if (id === "J5") {
    const { person_id } = await scalar("select person_id from clean_people where person_type='test' order by person_id limit 1");
    await add("checkins",{person_id,event_id:"BANK-TEST-ENTRY",occurred_at:"2025-04-12T18:00:00+05:30",result:"admitted",verification:"verified",source:"scanner"});
    assert.equal((await scalar(snap)).attendees, 2050);
    return [known("A1")];
  }
  if (id === "J6") {
    const { rid, ...previous } = await scalar("select * from fn_targets('2025-03-31')");
    await add("targets",{...previous,effective_at:"2025-04-01T09:00:00+05:30",unique_external_visitors_goal:2500,target_version:"April attendance revision"});
    assert.equal((await scalar(snap)).attendee_goal, 2500);
    return [known("A5"), "What was the attendance target on 31 March?"];
  }
  if (id === "J7") {
    const row = await scalar("select * from (select distinct on(registration_id) * from clean_history order by registration_id,effective_at desc,history_id desc) latest where status='cancelled' order by rid limit 1");
    await editData({table:"history",op:"edit",rid:row.rid,data:{status:"confirmed"}},actor);
    assert.equal((await scalar(snap)).confirmed, 2501);
    return [known("A6")];
  }
  if (id === "J8") {
    const alert = () => scalar("select label,baseline,weeks from fn_alerts(" + scopeArgs + ") where cid='C03'");
    const before = await alert();
    await manage({entity:"settings",op:"edit",id:"1",data:{stop:2}},actor);
    item.notes.push("Creator Partners before and after: " + JSON.stringify(before) + " → " + JSON.stringify(await alert()));
    return [known("E9")];
  }
  await manage({entity:"settings",op:"edit",id:"1",data:{stop:1.75}},actor);
  const audit = await scalar("select at,actor,entity,key from growth_audit.log order by id desc limit 1");
  item.notes.push("Latest audited edit: " + JSON.stringify(audit) + ", stop multiplier 1.5 → 1.75.");
  return ["What changed since this morning?"];
}

async function workflow() {
  const item = cases.get("K");
  let last;
  for (const line of demo.slice(0,4)) last = await ask(item,line.replace(/^"|"$/g,""),{conversation:last?.conversation});
  const drafts = allDrafts(last);
  if (drafts.length === 2 && drafts.some(d => d.owner === "Nisha Rao" && d.campaign_id === "C03") &&
      drafts.some(d => d.owner === "Arjun Verma" && d.campaign_id === "C02")) {
    await resolve(item,last,"confirm");
    const creator = await scalar("select id from tasks where owner='Nisha Rao' and campaign_id='C03' order by created_at desc limit 1");
    await manage({entity:"task",op:"edit",id:creator.id,data:{status:"done"},confirmApply:true},actor);
    item.notes.push("Manager rows: " + JSON.stringify(await rows("select title,owner,campaign_id,status,applied from tasks")));
  } else item.notes.push("The preview did not contain both requested assignments. The two-confirmation and completion steps could not be executed.");
  await ask(item,"What's our projected spend now?",{conversation:last?.conversation});
}

function writeTranscript() {
  const lines = ["# Supplied question bank — " + mode, "", "Source: Copilot_Test_Questions.md. Each prompt went through the application chat service with the selected attribution and date. Expected answers were withheld from the copilot. The scope shown below is the same metadata displayed under a reply in the dashboard.", ""];
  for (const item of cases.values()) {
    lines.push("## " + item.id, "", "**Bank expectation** " + item.expected.trim(), "");
    for (const turn of item.turns) {
      lines.push("**Asked** " + turn.question, "", turn.answer || ("**Execution error** " + turn.error), "");
      if (turn.tools) lines.push("Evidence: " + turn.tools.join(", ") + " · " + turn.date + " · " + turn.attribution + " · " + turn.target, "");
      if (turn.drafts?.length) lines.push("Draft previews: " + JSON.stringify(turn.drafts), "");
    }
    for (const note of item.notes) lines.push(note,"");
    worksheet.push({id:item.id,turns:item.turns,notes:item.notes});
  }
  fs.mkdirSync(".local", {recursive:true});
  fs.writeFileSync(".local/question-bank-" + mode + ".json", JSON.stringify(worksheet,null,2));
  fs.writeFileSync(resultFile,lines.join("\n"));
}

await seed();
try {
  assert.equal(await sql("select current_database()"), "growth_bank_test");
  for (const letter of "ABCDEFGHI") {
    if (letter === "G") {
      await execution();
      await seed();
    } else {
      const items = [...cases.values()].filter(item => item.id.startsWith(letter));
      // Only independent read-only chats overlap. A conversation's turns stay sequential.
      const batchSize = mode === "local" ? 3 : 1;
      for (let i = 0; i < items.length; i += batchSize)
        await Promise.all(items.slice(i, i + batchSize).map(ordinary));
    }
    console.log("Completed section " + letter);
  }
  for (const item of cases.values()) if (item.id.startsWith("J")) {
    await seed();
    const prompts = await fixture(item.id);
    for (const q of prompts) await ask(item,q);
    console.log("Completed " + item.id);
  }
  await seed();
  await workflow();
} finally {
  await seed();
  const restored = await scalar("select attendees,spend from fn_kpis(" + scopeArgs + ")");
  assert.deepEqual(restored,{attendees:2050,spend:274000});
  assert.deepEqual(await state(),{tasks:0,drafts:0});
}
writeTranscript();
console.log(executed + " replies across " + cases.size + " scenario transcripts (" + mode + "). Restored original fixtures. " + resultFile);
