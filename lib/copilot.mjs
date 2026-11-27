import { randomUUID } from "node:crypto";
import { sql, rows, scalar, literal as L, jsonArg as J } from "./db.mjs";
import { context, date, owners, transaction } from "./service.mjs";
import { evidence, toolNames, money, measurementLimit } from "./evidence.mjs";
import { groundedReply } from "./grounded-reply.mjs";
const providerKeys = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};
const provider = () =>
  process.env.COPILOT_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "gemini");
export function modelMode() {
  const name = provider();
  return Object.hasOwn(providerKeys, name) && process.env[providerKeys[name]]?.trim()
    ? name : "local";
}
export const friday = () => {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  return d.toISOString().slice(0, 10);
};
const rules = `Answer the user's actual question from the Growth Center's evidence. Split a mixed question into its answerable and unsupported parts and address both. Use the current date scope and attribution. Preserve the subject of follow-ups unless the user changes it. Apply a campaign filter only for a named campaign or an established follow-up. Never silently substitute another campaign.
Use tools before answering. get_kpis gives the overall cumulative snapshot; get_registrations is for registration breakdowns. get_checkins returns weekend totals, entries, distinct people, day overlap and first-time visitors. get_targets includes budget remaining; get_plan_thresholds contains the forward plan. calculate_scenario computes with a rate explicitly supplied by the user. Use the tool, not mental arithmetic. Use run_readonly_query for new answerable aggregations against the published clean views. Omit irrelevant optional arguments. Retry tool errors with corrected arguments.
Use describe_data to check coverage or missing measurements. When the data can't answer the question, say so plainly. Explain specifically what the available fields measure and what additional measurement would be needed. Missing observations do not imply a measured zero. External benchmarking requires a comparable external measure. Attribution and model estimates cannot establish causality or actual effects of an intervention. Unexecuted simulations do not change records. Use describe_task_workflow for procedural, hypothetical or quoted task questions. Only an explicit task request authorizes draft_task or update_task.
After gathering evidence, write the user-facing answer yourself. Use one short paragraph per claim or limitation. Start each paragraph with [Data], [Calculation], [Assumption / estimate] or [Not in data] and end it with its tool references, e.g. [E1] [E2]. Each tool result supplies its ref, data and a formatted summary. Copy numeric facts from the cited evidence; never invent numbers, silently change units or perform arithmetic. Use clear language about why a comparison or inference is unavailable. Never claim an action was performed based on a simulation or a preview.`;
const params = {
  as_of: "YYYY-MM-DD",
  metric:
    "Metric key: cpa, cpr, regs, attendees, spend, conversion, showup, identified, confirmed, sessions, diagnosis, projection",
  campaign: "Imported campaign ID",
  by: "owner, day, week, campaign, source",
  order: "asc or desc",
  event_type: "Engagement event type",
  from: "Source campaign ID or trend start date",
  to: "Destination campaign ID",
  amount: "Positive rupee amount",
  compare_date: "Second ISO date",
  days: "Length of each period",
  grain: "day, week or month",
  sql: "A single clean-view SELECT",
  since: "Timestamp",
  title: "Task title",
  owner: "Full team member name",
  deadline: "Resolved ISO date",
  priority: "low, normal or high",
  status: "todo, doing or done",
  task_id: "Existing task UUID",
  reason: "forecast or missing",
  operation: "Arithmetic operation to apply to the database metric",
  factor: "Numeric rate explicitly supplied by the user in this question",
  unique: "true for distinct people",
};
const signatures = {
  get_kpis: "metric",
  get_funnel: "campaign",
  compare_campaigns: "metric order campaign",
  get_targets: "",
  get_spend: "campaign by compare_date",
  get_status_mix: "campaign",
  get_checkins: "campaign by unique",
  get_checkin_audit: "",
  get_registrations: "campaign by",
  get_engagement: "campaign event_type",
  get_trend: "campaign metric from grain",
  explain_change: "campaign days",
  get_alerts: "metric campaign",
  get_plan_thresholds: "",
  simulate_reallocation: "from to amount",
  calculate_scenario: "metric campaign operation factor",
  describe_task_workflow: "",
  get_win_back: "campaign",
  describe_data: "reason",
  get_change_log: "since",
  run_readonly_query: "sql",
  list_tasks: "owner campaign",
  draft_task: "title owner deadline campaign priority",
  update_task: "task_id title owner deadline campaign status priority",
};
const descriptions = {
  get_kpis: "Overall cumulative external people, registrations, attendance, spend, CPA, remaining budget and projections as of a date. No campaign filter.",
  get_registrations: "Cumulative registration total and ranked breakdown by owner, week, day or campaign.",
  get_checkins: "Verified entry events and distinct attendees. Includes total entries, total people, single-day and repeat visitors, and by day the unique and first-time visitors.",
  get_checkin_audit: "All deduplicated check-in records, denied and unverified external entries, verified admissions and distinct people for the event.",
  get_funnel: "All stages and session conversion for an imported campaign, or the whole event if campaign is omitted.",
  compare_campaigns: "Rank imported campaigns on a specified metric or diagnose the weakest campaigns.",
  get_spend: "Net posted marketing spend and credit ledger. Costs are distinct from external exchange rates, ticket revenue or receipts.",
  get_targets: "Effective goals, approved budget, remaining funds, registration attainment and pacing for a historical date.",
  get_plan_thresholds: "Forward plan committed and stretch attendance, channel assumptions and release gates.",
  calculate_scenario: "Multiply or divide an observed metric by a user-supplied factor. Returns a conditional amount; no observed revenue or payment is implied.",
  simulate_reallocation: "Estimate the effect of a proposed transfer between campaigns; makes no changes or causal measurements.",
  describe_task_workflow: "Explain draft, confirmation and completion without creating or modifying anything.",
  describe_data: "Inspect the actual event coverage, source fields and limitations. Cite this for missing attributes, external facts, causal claims or incomparable periods; explain the specific gap.",
  run_readonly_query: "Run one aggregate SELECT on clean scoped views for an unfamiliar measured question. Prefer named tools for standard metrics.",
};
const allowedParams = {
  get_kpis: {metric:["identified","regs","confirmed","attendees","spend","sessions","cpa","cpr","showup","remaining_budget","projection"]},
  get_checkins: {by:["day","source","campaign"]},
  get_registrations: {by:["owner","month","week","day","campaign"]},
  get_spend: {by:["day","week","campaign","credits"]},
  calculate_scenario: {metric:["attendees","regs","identified","confirmed","spend","sessions"],operation:["multiply","divide"]},
};
function schema(name) {
  return {
    type: "object",
    ...(name === "calculate_scenario" ? {required:["metric","operation","factor"]} : {}),
    properties: Object.fromEntries(
      ("as_of " + signatures[name])
        .trim()
        .split(" ")
        .map((k) => [
          k,
          {
            type: ["days", "amount","factor"].includes(k)
              ? "number"
              : k === "unique"
                ? "boolean"
                : "string",
            description: params[k],
            ...(allowedParams[name]?.[k] ? {enum:allowedParams[name][k]} : {}),
          },
        ]),
    ),
  };
}
const repair = "Your proposed final answer could not be traced to its sources. Answer in short tagged paragraphs, cite the E references and use only numbers from those results. Use a calculation tool if a derived value is still missing.";
async function openaiTurn(messages, instruction, tool, validate) {
  const input = messages.map(({ role, text }) => ({ role, content: text }));
  const tools = toolNames.map((name) => ({
    type: "function",
    name,
    description: descriptions[name] || name.replaceAll("_", " ") + " from current app data",
    parameters: schema(name),
    strict: false,
  }));
  for (let step = 0; step < 6; step++) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.OPENAI_API_KEY.trim(),
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini",
        instructions: instruction,
        input,
        tools,
        store: false,
        include: ["reasoning.encrypted_content"],
        tool_choice: step === 0 ? "required" : "auto",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const help = res.status === 401 ? "Check OPENAI_API_KEY in .env.local."
        : res.status === 429 ? "Check the API project's quota and rate limits."
        : "Check the configured model and its availability for your project.";
      throw Error("OpenAI returned HTTP " + res.status + ". " + help);
    }
    const { output } = await res.json();
    if (!Array.isArray(output)) throw Error("OpenAI returned no response output.");
    const calls = output.filter((item) => item.type === "function_call");
    if (!calls.length) {
      const text = output.flatMap(item => item.type === "message" ? item.content || [] : [])
        .filter(part => part.type === "output_text").map(part => part.text).join("\n");
      const answer = validate(text);
      if (answer) return answer;
      input.push(...output, {role:"user",content:repair});
      continue;
    }
    input.push(...output);
    for (const call of calls) {
      let result;
      try {
        result = await tool(call.name, JSON.parse(call.arguments));
      } catch (error) {
        result = { error: error.message };
      }
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
    }
  }
}
async function providerTurn(messages, info, tool, validate) {
  const mode = provider();
  const instruction = rules + "\nCurrent context: " + JSON.stringify(info);
  if (mode === "openai") return openaiTurn(messages, instruction, tool, validate);
  const gem = mode === "gemini",
    defs = toolNames.map((name) => ({
      name,
      description: descriptions[name] || name.replaceAll("_", " ") + " from current app data",
      ...(gem ? { parameters: schema(name) } : { input_schema: schema(name) }),
    }));
  let history = gem
    ? messages.map((x) => ({
        role: x.role === "assistant" ? "model" : "user",
        parts: [{ text: x.text }],
      }))
    : messages.map((x) => ({ role: x.role, content: x.text }));
  for (let step = 0; step < 6; step++) {
    const key = process.env[gem ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"];
    const url = gem
      ? "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash") +
        ":generateContent"
      : "https://api.anthropic.com/v1/messages";
    const body = gem
      ? {
          systemInstruction: { parts: [{ text: instruction }] },
          contents: history,
          tools: [{ functionDeclarations: defs }],
          generationConfig: { temperature: 0 },
        }
      : {
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: 1024,
          system: instruction,
          messages: history,
          tools: defs,
        };
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(gem
          ? { "x-goog-api-key": key }
          : { "x-api-key": key, "anthropic-version": "2023-06-01" }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok)
      throw Error(
        "The " +
          mode +
          " provider returned HTTP " +
          res.status +
          ". Check the model, key and quota in .env.local.",
      );
    const j = await res.json(),
      content = gem ? j.candidates?.[0]?.content?.parts : j.content;
    if (!content) throw Error("Provider returned no content");
    const calls = content.filter((x) =>
      gem ? x.functionCall : x.type === "tool_use",
    );
    if (!calls.length) {
      const answer = validate(content.filter(x=>x.text && !x.thought).map(x=>x.text).join("\n"));
      if (answer) return answer;
      history.push(gem ? {role:"model",parts:content} : {role:"assistant",content},
        gem ? {role:"user",parts:[{text:repair}]} : {role:"user",content:repair});
      continue;
    }
    history.push(
      gem ? { role: "model", parts: content } : { role: "assistant", content },
    );
    const outputs = [];
    for (const c of calls) {
      const call = gem ? c.functionCall : c;
      let result;
      try {
        result = await tool(
          call.name,
          gem ? call.args || {} : call.input || {},
        );
      } catch (e) {
        result = { error: e.message };
      }
      outputs.push(
        gem
          ? {
              functionResponse: {
                name: call.name,
                response: result,
                ...(call.id ? { id: call.id } : {}),
              },
            }
          : {
              type: "tool_result",
              tool_use_id: call.id,
              content: JSON.stringify(result),
            },
      );
    }
    history.push(
      gem
        ? { role: "user", parts: outputs }
        : { role: "user", content: outputs },
    );
  }
}
function explicitDate(q, base) {
  const iso = q.match(/\b20\d\d-\d\d-\d\d\b/);
  if (iso) return date(iso[0]);
  const m = q.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*)(?:\s+(20\d\d))?/i,
  );
  if (m) {
    const d = new Date(
      m[2] + " " + m[1] + ", " + (m[3] || base.slice(0, 4)) + " 12:00 UTC",
    );
    if (isNaN(+d) || d.getUTCDate() !== Number(m[1])) throw Error("Use a valid calendar date.");
    return d.toISOString().slice(0, 10);
  }
  return null;
}
function asksForRecommendations(question) {
  return /\b(?:what should|what do we do|recommend(?:ations?)?|how (?:can|should) (?:we|i) improve)\b/i.test(question) ||
    /\b(?:suggest|suggestions? for|suggestions? to|how to)\s+(?:(?:some|an?|campaign|budget|spend|growth|performance)\s+)*(?:improv\w*|imporv\w*|changes?|next steps?)\b/i.test(question);
}
async function localIntent(q, info, tool) {
  const s = q.toLowerCase(),
    found = info.campaigns
      .filter((x) => s.includes(x.name.toLowerCase()) || s.includes(x.alias))
      .sort((a, b) => s.indexOf(a.alias) - s.indexOf(b.alias)),
    c = found[0]?.cid || null;
  if (/creat.*task|draft.*task|assign.*task/.test(s)) {
    const owner =
      owners.find((x) => s.includes(x.split(" ")[0].toLowerCase())) ||
      info.user;
    return tool("draft_task", {
      title: q
        .replace(
          /^.*?(?:task|action item)\s+(?:for\s+\w+(?:\s+\w+)?\s+to\s+)?/i,
          "",
        )
        .replace(/\s+by friday.*$/i, "")
        .trim(),
      owner,
      campaign: c,
      deadline: /friday/.test(s) ? friday() : explicitDate(s, info.as_of),
    });
  }
  if (/next year|how many people will come in 20\d\d/.test(s)) {
    await tool("describe_data", { reason: "forecast" });
    return tool("get_plan_thresholds", {});
  }
  if (measurementLimit(q)) {
    if (/\bour\b.*\bcpa\b|\b(?:competitor|benchmark).*\bour\b.*\bcpa\b/i.test(q)) await tool("get_kpis", { metric: "cpa" });
    if (c && /cost how much|how much.*(?:cost|spend)/i.test(q)) await tool("get_spend", { campaign: c });
    return tool("describe_data", { reason: "missing" });
  }
  if (/\b(?:mov(?:e|ing)|reallocat\w*|transfer\w*)\b/.test(s) &&
      !/\b(?:actually|realized|because|caused)\b/.test(s)) {
    const v = s.match(/(?:₹|rs\.?\s*|inr\s*)?([\d,]+)\s*(k|lakh)?/);
    if (!v || found.length !== 2)
      return tool("describe_data", { reason: "transfer_inputs" });
    return tool("simulate_reallocation", {
      from: found[0].cid,
      to: found[1].cid,
      amount:
        Number(v[1].replaceAll(",", "")) *
        (v[2] === "k" ? 1000 : v[2] === "lakh" ? 100000 : 1),
    });
  }
  if (asksForRecommendations(q)) {
    const high = await tool("compare_campaigns", {
        metric: "cpa",
        order: "desc",
      }),
      low = await tool("compare_campaigns", { metric: "cpa" });
    if (!high.data?.length || low.data[0].cid === high.data[0].cid) return;
    const donor =
      high.data.slice(0, 2).find((x) => x.channel === "paid_social") ||
      high.data[0];
    return tool("simulate_reallocation", {
      from: donor.cid,
      to: low.data[0].cid,
      amount: Math.min(20000, donor.spend),
    });
  }
  if (/underperform|bottleneck|diagnos/.test(s)) {
    const r = await tool("compare_campaigns", { metric: "diagnosis" });
    if (r.data?.channels?.length)
      await tool("get_funnel", { campaign: r.data.channels[0] });
    return;
  }
  if (/scale\s*\/|threshold|trigger.*stop/.test(s)) return tool("get_alerts", { campaign: c });
  if (/\b(tasks|actions)\b/.test(s)) return tool("list_tasks", {
    owner: owners.find(x => s.includes(x.split(" ")[0].toLowerCase())) || (/\bmy\b/.test(s) ? info.user : undefined),
  });
  if (/status (?:mix|breakdown)|waitlisted|still ["“]?interested/.test(s)) return tool("get_status_mix", { campaign: c });
  if (/\bhow many check.ins\b|check.ins.*reject/.test(s) && !c) return tool("get_checkin_audit", {});
  if (/projection|forecast|on track.*attend/.test(s)) return tool("get_kpis", { metric: "projection" });
  if (/\b(?:remaining|unspent|left)\b/.test(s) && /\bbudget\b/.test(s))
    return tool("get_kpis", { metric: "remaining_budget" });
  if (/target|\bgoal\b|pace|pacing/.test(s)) return tool("get_targets", {});
  if (/both days|either day|exactly one|first.time visitors|sunday visitors|day 1|day 2|scanner|manual|entries|re.enter|check.ins/.test(s))
    return tool("get_checkins", {
      by: /scanner|manual/.test(s) ? "source" : "day",
      campaign: c,
    });
  if (/spend|credit/.test(s) && !/cost per/.test(s))
    return tool("get_spend", {
      campaign: c,
      ...(/refund|list.*credit/.test(s) ? { by: "credits" } : {}),
      ...(/final/.test(s) ? { compare_date: info.end } : {}),
    });
  if (/\b(?:most|best|highest|lowest|fewest)\b/.test(s) && /campaign|channel/.test(s) && !/cost|expensive|cheap/.test(s)) {
    const metric = /show.up/.test(s) ? "showup" : /convert|session/.test(s) ? "conversion" :
      /registration|sign.up/.test(s) ? "regs" : /attend/.test(s) ? "attendees" : null;
    if (metric) return tool("compare_campaigns",{metric, order:/lowest|fewest/.test(s) ? "asc" : "desc"});
  }
  if (/owner|busiest.*week|registration.*(?:week|month)/.test(s))
    return tool("get_registrations", {
      by: /owner/.test(s) ? "owner" : /month/.test(s) ? "month" : "week",
      campaign: c,
    });
  if (/opted|email|brochure|engagement/.test(s))
    return tool("get_engagement", {
      event_type: /opted/.test(s) ? "opted_out" : undefined,
      campaign: c,
    });
  if (/session.*reg|funnel|conversion rate/.test(s))
    return tool("get_funnel", { campaign: c || info.last_campaign });
  if (/cost per|cheapest|most expensive|show.up rate/.test(s)) {
    const metric = /cost per reg/.test(s)
      ? "cpr"
      : /show.up/.test(s)
        ? "showup"
        : "cpa";
    if (!c && !/which|low|high|cheap|expensive|rank|best|worst/.test(s))
      return tool("get_kpis", { metric });
    return tool("compare_campaigns", {
      metric,
      order: /highest|most expensive/.test(s) ? "desc" : "asc",
      campaign: c,
    });
  }
  if (/how many.*regist|registration count/.test(s))
    return c
      ? tool("get_funnel", { campaign: c })
      : tool("get_kpis", { metric: "regs" });
  if (/attend|unique people/.test(s))
    return c
      ? tool("get_funnel", { campaign: c })
      : tool("get_kpis", { metric: "attendees" });
  if (/cancel|waitlist|status mix/.test(s))
    return tool("get_status_mix", { campaign: c });
  if (/tasks|actions/.test(s)) return tool("list_tasks", {});
  if (/alert|threshold/.test(s)) return tool("get_alerts", {});
  if (/driver|chang.*week/.test(s))
    return tool("explain_change", { campaign: c });
  if (/edit|change log/.test(s)) return tool("get_change_log", {});
  if (/win.back/.test(s)) return tool("get_win_back", { campaign: c });
  return tool("describe_data", { reason: "local" });
}
function trimEvidence(r) {
  if (r.tool === "describe_data") return r;
  return { ...r, data: Array.isArray(r.data) ? r.data.slice(0, 15) : r.data };
}
function requestsTaskWrite(question) {
  const text = question
    .replace(/“[^”]*”|‘[^’]*’|"[^"]*"|(?:^|\s)'[^'\n]+'(?=\s|[.,?!]|$)/g, " ")
    .replaceAll("’", "'")
    .toLowerCase();
  const action = /\b(?:create|draft|assign|add|update|edit|mark|change|set|schedule|make)\b[^.!?]*\b(?:tasks?|action items?)\b/;
  if (!action.test(text)) return false;
  const informational = /\b(?:if i|if we|what if|suppose|hypothetical(?:ly)?|what (?:happens|would happen)|how (?:do i|does|would)|explain how|describe how)\b/;
  const negated = /\b(?:don't|do not|never|avoid|without)\b[^.!?]*\b(?:tasks?|action items?)\b/;
  return !informational.test(text) && !negated.test(text);
}
export async function chat(input, user) {
  const ctx = context({ ...input, user }),
    q = String(input.question || "").trim();
  if (!q || q.length > 3500)
    throw Error("Enter a question up to 3,500 characters.");
  const id = input.conversation || randomUUID(),
    state = await scalar(
      "select * from conversations where id=" + L(id) + "::uuid",
    );
  const follow =
    /^(and\b|what should|what do we|how does that|why\b|what about|compare that)/i.test(
      q,
    );
  const task = requestsTaskWrite(q);
  ctx.question = q;
  let clarification;
  try {
    ctx.d = (!task && explicitDate(q, ctx.d)) || (follow ? state?.state?.as_of : null) || ctx.d;
  } catch {
    clarification = "That date does not exist on the calendar. Which valid date should I use?";
  }
  const campaigns = (
    await rows("select campaign_id cid,campaign_name name from clean_campaigns")
  ).map((x) => ({
    ...x,
    alias: (x.name.includes("Creator")
      ? "creator"
      : x.name.includes("Referral")
        ? "referral"
        : x.name.toLowerCase()
    ).toLowerCase(),
  }));
  const event = await scalar("select history_start,history_end,event_starts_at,event_ends_at from clean_event limit 1");
  const calls = [],
    info = {
      as_of: ctx.d,
      attribution: ctx.a,
      user: ctx.user,
      page: input.page,
      last_campaign: state?.state?.campaign,
      last_metric: state?.state?.metric,
      last_task: state?.state?.task_id,
      campaigns,
      coverage: event,
      end: event.history_end,
      today: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }),
      friday: friday(),
    };
  let draft = null;
  function record(result) {
    const entry = { ...trimEvidence(result), ref: "E" + (calls.length+1) };
    calls.push(entry);
    return entry;
  }
  async function invoke(name, v) {
    if (!toolNames.includes(name)) throw Error("Unknown tool");
    if (name === "draft_task" || name === "update_task") {
      if (!task) return record(await evidence("describe_task_workflow", {}, ctx));
      if (draft) return calls.find(r=>r.tool==="draft_task" || r.tool==="update_task");
      if (v.campaign && !campaigns.some((x) => x.cid === v.campaign))
        throw Error("Unknown campaign");
      if (!owners.includes(v.owner || user)) throw Error("Unknown task owner");
      let existing = null;
      if (name === "update_task") {
        existing = await scalar(
          "select * from tasks where id=" + L(v.task_id) + "::uuid",
        );
        if (!existing) throw Error("Task does not exist");
      }
      const title = (v.title || existing?.title || q).trim();
      const payload = {
        title: title[0].toUpperCase() + title.slice(1),
        owner: v.owner || existing?.owner || user,
        deadline: v.deadline ? date(v.deadline) : existing?.deadline || null,
        campaign_id: v.campaign || existing?.campaign_id || null,
        priority: v.priority || existing?.priority || "normal",
        status: v.status || existing?.status || "todo",
        description: existing?.description || q,
        proposed:
          existing?.proposed ||
          (/cut|pause|stop/i.test(q) && v.campaign
            ? { status: "paused" }
            : null),
        ...(existing ? { task_id: existing.id } : {}),
      };
      draft = (await rows("select gen_random_uuid() id"))[0];
      draft = { ...draft, ...payload };
      await sql(
        "insert into drafts(id,conversation_id,payload,actor) values(" +
          L(draft.id) +
          "::uuid," +
          L(id) +
          "::uuid," +
          J(payload) +
          "," +
          L(user) +
          ")",
      );
      const r = {
        tool: name,
        parameters: v,
        data: payload,
        tag: "Data",
        answer: "Review the task draft. Confirm to save it in the manager.",
      };
      return record(r);
    }
    if (name === "describe_task_workflow" && state?.state?.draft_id && /\b(?:did you|was it|was that|cancelled|canceled|saved)\b/i.test(q)) {
      const status = await scalar("select resolution from drafts where id=" + L(state.state.draft_id) +
        "::uuid and conversation_id=" + L(id) + "::uuid and actor=" + L(user));
      if (status) {
        const answer = {cancelled:"The draft was cancelled. No task was created from it.",
          pending:"The draft is awaiting confirmation. It has not been saved as a task.",
          confirmed:"The draft was confirmed and saved to the task manager."}[status.resolution];
        return record({tool:name,parameters:{as_of:ctx.d},data:status,tag:"Data",answer});
      }
    }
    if (v.campaign) {
      const lookup = String(v.campaign).toLowerCase();
      const campaign = campaigns.find(c=>c.cid.toLowerCase()===lookup || c.name.toLowerCase()===lookup);
      if (!campaign) return record({tool:name,parameters:{...v,as_of:ctx.d,attribution:ctx.a},data:{campaigns},tag:"Not in data",answer:"No imported campaign matches the requested name or ID. Check the campaign name before comparing a rate."});
      v = {...v,campaign:campaign.cid};
    }
    const historical = !["get_plan_thresholds", "describe_data", "describe_task_workflow", "list_tasks", "get_change_log"].includes(name);
    const dates = [v.as_of || ctx.d];
    if (v.compare_date) dates.push(v.compare_date);
    if (historical && dates.some(d => d < event.history_start || d > event.history_end)) {
      return record({tool:name,parameters:{...v,as_of:ctx.d,attribution:ctx.a},data:event,tag:"Not in data",answer:"The historical workbook covers "+event.history_start+" through "+event.history_end+". A comparison outside that coverage needs another observed dataset."});
    }
    const r = await evidence(name, v, ctx);
    if (name === "describe_data" && v.reason === "transfer_inputs")
      r.answer = "A transfer estimate needs the source campaign, destination campaign and rupee amount.";
    if (name === "describe_data" && v.reason === "local") {
      r.tag = "Clarification";
      r.answer = "I couldn't match that wording in local query mode. Which campaign or metric should I look at? You can ask for a campaign recommendation, an attendance count, or a spend comparison.";
    }
    return record(r);
  }
  const messages = [
    ...(state?.messages || []).slice(-8),
    { role: "user", text: q },
  ];
  let synthesis;
  if (/\b(?:delete|remove)\s+(?:all|from)\b/i.test(q))
    clarification = "The copilot can run read-only analytics queries. The data editor handles record deletion.";
  if (/\b(?:names|details|identities)\b.*\ball\s+(?:attendees|visitors|people)\b/i.test(q))
    clarification = "The copilot reports aggregate attendance. Use the win-back screen for the limited follow-up list. I can show the visitor count by campaign or day.";
  if (task && /\band\s+(?:one|another (?:task|action item))\s+for\b/i.test(q))
    clarification = "I can prepare one task per message. Which assignment should I preview first?";
  const namedId = q.match(/\bC\d{2,}\b/i)?.[0].toUpperCase();
  if (namedId && !campaigns.some(c => c.cid.toUpperCase() === namedId))
    clarification = "No imported campaign matches " + namedId + ". Available campaigns: " + campaigns.map(c => c.cid + " " + c.name).join(", ") + ".";
  const assignee = /\b(?:tasks?|action items?)\s+for\s+([\p{L}.-]+(?:\s+[\p{Lu}][\p{L}.-]+)?)\s+to\b/u.exec(q);
  if (task && assignee && !owners.some(owner => [owner, owner.split(" ")[0], "me"].some(n => n.toLowerCase() === assignee[1].toLowerCase())))
    clarification = assignee[1] + " is not listed as a team owner. Who should own the task? Available owners: " + owners.join(", ") + ".";
  if (task && /^(?:please\s+)?(?:create|draft|add|make)\s+(?:a |an )?(?:task|action item)[.!?]?$/i.test(q))
    clarification = "What should the task cover, who should own it, and when is it due?";
  if (clarification) {
    record({tool:"validate_request", parameters:{as_of:ctx.d,attribution:ctx.a}, data:{owners}, tag:"Data", answer:clarification});
  } else if (state?.state?.draft_id && /\b(?:did you (?:create|save) it|was (?:it|that) (?:saved|cancelled|canceled))\b/i.test(q)) {
    await invoke("describe_task_workflow", {});
  } else if (modelMode() === "local") {
    if (task && info.last_task && /\b(?:mark|set)\b.*\b(?:task|it)\b.*\bdone\b/i.test(q))
      await invoke("update_task",{task_id:info.last_task,status:"done"});
    else if (!task && /\btask\b/i.test(q) && /\b(?:confirm|confirmation|process|workflow|what would happen)\b/i.test(q)) await invoke("describe_task_workflow",{});
    else await localIntent(q, info, invoke);
  }
  else synthesis = await providerTurn(messages, info, invoke, text => groundedReply(text,calls,q));
  if (!calls.length) await invoke("describe_data", { reason: modelMode() === "local" ? "local" : "ungrounded" });
  const primary = calls[0],
    rec =
      asksForRecommendations(q) &&
      calls.some((x) => x.tool === "simulate_reallocation");
  let answer = synthesis || [...new Set(calls.map((x) => "[" + x.tag + "] " + x.answer))].join("\n\n");
  if (rec && !synthesis) {
    const high = calls.find(
        (x) => x.tool === "compare_campaigns" && x.parameters.order === "desc",
      )?.data?.[0],
      low = calls.find(
        (x) => x.tool === "compare_campaigns" && x.parameters.order !== "desc",
      )?.data?.[0];
    if (high && low) {
      const ranks = calls.find(
          (x) =>
            x.tool === "compare_campaigns" && x.parameters.order === "desc",
        ).data,
        partners = ranks.find((x) => x.channel === "college_partners"),
        paid = ranks.slice(0, 2).find((x) => x.channel === "paid_social");
      const action =
        "Review new spend on " +
        high.name +
        " first. Pilot a transfer to " +
        low.name +
        ". " +
        (paid
          ? "Test a reminder or refundable deposit on " +
            paid.name +
            " and measure whether any show-up gain offsets lost registrations. "
          : "") +
        (partners && partners.cpa < high.cpa
          ? "Consider " +
            partners.name +
            " as a second destination at " +
            money(partners.cpa) +
            " per attendee. "
          : "") +
        "Recheck marginal acquisition cost and show-up before scaling.";
      answer = "[Assumption / estimate] " + action + "\n\n" + answer;
    }
  }
  const usedDate = date(primary.parameters?.as_of || ctx.d);
  const target = await scalar(
    "select target_version from fn_targets(" + L(usedDate) + "::date)",
  );
  const scope = {
    as_of: usedDate,
    attribution: ctx.a,
    target: target?.target_version || "No effective target",
    mode: modelMode(),
  };
  const nextState = {
    as_of: usedDate,
    campaign: primary.parameters.campaign || info.last_campaign,
    metric: primary.parameters.metric || info.last_metric,
    task_id: primary.tool === "list_tasks" ? (primary.data.length === 1 ? primary.data[0].id : null) : info.last_task,
    draft_id: draft?.id || state?.state?.draft_id,
  };
  await sql(
    "insert into conversations(id,state,messages) values(" +
      L(id) +
      "::uuid," +
      J(nextState) +
      "," +
      J([...messages, { role: "assistant", text: answer }]) +
      ") on conflict(id) do update set state=excluded.state,messages=excluded.messages",
  );
  return { conversation: id, answer, scope, calls, draft };
}
export async function resolveDraft(
  { draft_id, conversation, decision, edits = {} },
  user,
) {
  if (!["confirm", "cancel"].includes(decision))
    throw Error("Choose Confirm or Cancel.");
  const id = L(draft_id) + "::uuid",
    cond =
      "id=" +
      id +
      " and conversation_id=" +
      L(conversation) +
      "::uuid and actor=" +
      L(user);
  const data = await scalar("select * from drafts where " + cond);
  if (!data) throw Error("Draft unavailable for this user and conversation.");
  if (data.resolution !== "pending")
    return { saved: data.resolution === "confirmed", id: data.task_id };
  const v = {
    ...data.payload,
    ...Object.fromEntries(
      Object.entries(edits).filter(([k]) =>
        ["title", "description", "deadline", "owner", "priority"].includes(k),
      ),
    ),
  };
  if (!v.title.trim() || !owners.includes(v.owner))
    throw Error("Give the task a title and valid owner");
  if (v.deadline) date(v.deadline);
  const tid = v.task_id || randomUUID();
  const fields = {
    title: v.title,
    description: v.description,
    owner: v.owner,
    deadline: v.deadline || null,
    priority: v.priority,
    status: v.status,
    campaign_id: v.campaign_id,
    proposed: v.proposed || null,
  };
  const vals = Object.entries(fields).map(([k, value]) =>
    k === "proposed"
      ? value
        ? J(value)
        : "NULL"
      : k === "deadline"
        ? L(value) + "::date"
        : L(value),
  );
  const mutation = v.task_id
    ? "update tasks set " +
      Object.keys(fields)
        .map((k, i) => k + "=" + vals[i])
        .join(",") +
      " where id=" +
      L(tid) +
      "::uuid"
    : "insert into tasks(id,created_by,source,actor," +
      Object.keys(fields) +
      ") values(" +
      L(tid) +
      "::uuid,'AI'," +
      L(conversation) +
      "," +
      L(user) +
      "," +
      vals +
      ")";
  const res = decision === "confirm" ? "confirmed" : "cancelled";
  await transaction(
    user,
    "do $draft$ begin perform 1 from drafts where " +
      cond +
      " and resolution='pending' for update; if found then " +
      (decision === "confirm" ? mutation + ";" : "") +
      "update drafts set resolution=" +
      L(res) +
      ",task_id=" +
      L(decision === "confirm" ? tid : null) +
      "::uuid where " +
      cond +
      ";end if;end $draft$",
    true,
  );
  return scalar(
    "select resolution='confirmed' saved,task_id id from drafts where " + cond,
  );
}
