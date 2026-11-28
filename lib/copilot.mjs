import { randomUUID } from "node:crypto";
import { sql, rows, scalar, literal as L, jsonArg as J } from "./db.mjs";
import { context, date, owners, transaction } from "./service.mjs";
import { evidence, toolNames, money, measurementLimit } from "./evidence.mjs";
import { channelMeasureNames } from "./channel-measures.mjs";
import { campaignMentions, metricRequests } from "./metric-requests.mjs";
import { checkReply, numbers, sourceValues } from "./grounded-reply.mjs";
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
Definitions (use them exactly):
- Attendees are unique verified external people admitted on 12–13 Apr 2025. Admitted entries include re-entries; check-in records also include denied and unverified scans. Never call entries or records attendees; when a user quotes an entry count as attendees, correct it.
- Walk-ins attended without a registration and no campaign gets credit for them. Campaign attendee counts are attributed attendees only. "Credit" for attendees means attribution, not money.
- Registrations exclude internal, staff and test people. Status is each registration's latest status as of the date; get_status_mix shows how many in each status attended.
- Sessions are anonymous landing-page visits, not people and not time spent. Impressions, clicks, reported reach and platform registration starts are ad-platform activity counts, not unique people; they cannot be added up or compared 1:1 with identified people or attendees. A sessions-based conversion rate is a visit rate.
- Spend is net posted marketing cost; negative ledger rows are refunds or credits. It is never revenue, ticket sales or sponsorship.
- Each campaign has one owner (see context campaigns). A question about a person ("how's Arjun doing", "Dev's campaigns") means their campaigns' results: use compare_campaigns by=owner. Campaign results reflect channel and budget, not only individual performance; never recommend HR action.
- The 2025 projection is not next year's forecast. For future years use get_plan_thresholds and present the 2027 targets as plan assumptions.
Behaviour:
- Answer every part of the question, starting with the direct answer. For an ambiguous term such as "conversion rate", give the main stages, each labelled.
- "Underperforming" questions: call compare_campaigns with metric=diagnosis (spend share vs attributed-attendee share and show-up) and metric=cpa. Never compare cost per attendee with the plan cost per registration; they have different denominators. SCALE / CHANGE / STOP labels come only from get_alerts.
- "Should X get more money / how much more": compare the two campaigns, then run simulate_reallocation with a concrete amount (e.g. ₹20,000) and report its estimate. Keep each campaign's figures attached to that campaign's name.
- Check claims and opinions the user states against evidence. Example: if a quoted "attendee" figure matches admitted entries in get_checkins, explain it counts re-entries and give the unique-people figure instead. Disagree, with numbers, when the data does not support them; do not agree because the user said it.
- Never substitute a different measure for a missing one (sponsor payments, time stayed, colleges, artists, revenue). Say it is not in the data, name what is recorded, and offer the closest available measure as a different measure. The data shows what changed, not why: say so when a cause such as exams or weather is not recorded.
- Off-topic requests (poems, weather, general knowledge): decline in one sentence and say what you can analyse. Tie general advice to what worked in this data or label it general advice.
- Derived numbers (differences, sums, shares, rates, hypotheticals) come from calculate, estimate_campaign or simulate_reallocation, never mental arithmetic. Label hypotheticals [Assumption / estimate] and state the assumption.
- Follow-ups ("why?", "who owns it?", "what about two weeks later?") keep the previous subject and date unless changed; resolve relative dates from the previous turn's date and pass as_of.
After gathering evidence, write the user-facing answer yourself. Use one short paragraph per claim or limitation. Start each paragraph with exactly one of [Data], [Calculation], [Assumption / estimate] or [Not in data] and end it with its tool references, e.g. [E1] [E2]. Each tool result supplies its ref, data and a formatted summary. Copy numeric facts from the cited evidence; never invent numbers or silently change units. Do not paste long tool lists the user did not ask for, and do not end with generic offers. Never claim an action was performed based on a simulation or a preview.`;
const params = {
  expression: "Arithmetic expression using operands from the question or earlier evidence and + - * / ( ).",
  label: "Requested quantity and unit",
  as_of: "YYYY-MM-DD",
  metric:
    "Metric key: cpa, cpr, regs, attendees, spend, conversion, showup, identified, confirmed, sessions, diagnosis, projection",
  campaign: "Imported campaign ID",
  by: "Grouping; see the tool description for allowed values",
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
  owner: "Team member who owns the task",
  deadline: "ISO date. Resolve relative days such as 'by Friday' from today in the current context (see today and friday), not from as_of",
  priority: "low, normal or high",
  status: "todo, doing or done",
  task_id: "Existing task UUID",
  reason: "forecast or missing",
  operation: "Arithmetic operation to apply to the database metric",
  factor: "Numeric rate explicitly supplied by the user in this question",
  unique: "true for distinct people",
};
const signatures = {
  get_channel_measure: "metric campaign by order",
  calculate: "expression label",
  get_kpis: "metric",
  get_funnel: "campaign",
  compare_campaigns: "metric order campaign by owner amount",
  get_targets: "",
  get_spend: "campaign by compare_date",
  get_status_mix: "campaign by",
  get_checkins: "campaign by unique",
  get_checkin_audit: "",
  get_registrations: "campaign by",
  get_engagement: "campaign event_type by",
  get_trend: "campaign metric from grain",
  explain_change: "campaign days",
  get_alerts: "metric campaign",
  get_plan_thresholds: "",
  simulate_reallocation: "from to amount",
  estimate_campaign: "operation campaign to factor",
  calculate_scenario: "metric campaign operation factor",
  describe_task_workflow: "",
  get_win_back: "campaign",
  describe_data: "reason",
  get_change_log: "since",
  run_readonly_query: "sql",
  list_tasks: "owner campaign status",
  draft_task: "title owner deadline campaign priority",
  update_task: "task_id title owner deadline campaign status priority",
};
const descriptions = {
  get_channel_measure: "Get source counts and their rate together. Use ctr for ad clicks / impressions, click_to_open for email clicks / opens, cancellation for cancelled / registrations, opt_out for distinct opt-outs / sends, and reach for anonymous summed reported reach. Group by campaign to rank or filter a named campaign.",
  calculate: "Arithmetic using literal amounts from the request or measured values already returned. Percentage of an amount is amount * percent / 100. Label the quantity and currency.",
  get_status_mix: "Latest registration status with counts attended and absent. Group by campaign to compare cancellations.",
  get_engagement: "External people's events: opted_out, registration_start, nurture_email_sent, nurture_email_opened, nurture_email_clicked, event_question_submitted. Returns event and distinct-person counts.",
  get_kpis: "Overall cumulative external people, registrations, attendance, spend, CPA, remaining budget and projections as of a date. No campaign filter.",
  get_registrations: "Cumulative registration total and ranked breakdown by owner, week, day or campaign.",
  get_checkins: "Verified entry events and distinct attendees: total entries, people, single-day and both-day visitors, re-entries and entries per person. by=day gives people and first-time visitors per day; by=source gives scanner vs manual entries and people; by=hour ranks the busiest check-in hours; by=campaign gives attributed visitors.",
  get_trend: "Time series of regs, spend, sessions or attendees by day, week or month for the event or a campaign.",
  explain_change: "Registrations in the period ending on as_of versus the previous period of the same length (days, default 7), split into spend, sessions-per-rupee and session-conversion effects. Pass as_of = last day of the week asked about.",
  get_alerts: "SCALE / CHANGE / STOP rule status per campaign: actual vs plan cost per registration, thresholds and the last two completed weekly rates.",
  get_change_log: "Audited data and settings edits with actor, time and before → after values. Use since to limit the period.",
  list_tasks: "Saved tasks, optionally filtered by owner, campaign or status (open = not done).",
  get_win_back: "Cancelled and waitlisted registrants by status, with how many can still be contacted.",
  get_checkin_audit: "All deduplicated check-in records, denied and unverified external entries, verified admissions and distinct people for the event.",
  get_funnel: "All stages for a campaign or the whole event: sessions, identified, registrations, confirmed, attendees, session → registration and registration → attendance, plus platform impressions, clicks, CTR, reported reach and platform registration starts.",
  compare_campaigns: "Rank or filter campaigns by CPA, CPR, registrations, attendance or show-up. Use by=owner to aggregate spend and attendees before calculating owner CPA. Use campaign IDs for individual results.",
  get_spend: "Net posted marketing spend and credit ledger. Costs are distinct from external exchange rates, ticket revenue or receipts.",
  get_targets: "Effective goals, approved budget, remaining funds, registration attainment and pacing for a historical date.",
  get_plan_thresholds: "The 2027 plan: committed and stretch attendance targets, channel assumptions and release gates. Use for next-year questions; these are plan assumptions, not observations.",
  calculate_scenario: "Multiply or divide an observed metric by a user-supplied factor. Returns a conditional amount; no observed revenue or payment is implied.",
  simulate_reallocation: "Estimate the effect of a proposed transfer between campaigns; makes no changes or causal measurements.",
  estimate_campaign: "Calculate a counterfactual from live scoped values. remove_campaign subtracts its spend and attendees, match_showup applies the reference campaign's rate to the source campaign, remaining_budget estimates visitors at the best measured positive campaign CPA.",
  describe_task_workflow: "Explain draft, confirmation and completion without creating or modifying anything.",
  describe_data: "Inspect the actual event coverage, source fields and limitations. Cite this for missing attributes, external facts, causal claims or incomparable periods; explain the specific gap.",
  run_readonly_query: "Run one aggregate SELECT on scoped views. clean_campaign_metrics(cid,name,owner,spend,sessions,regs,attendees,cpa,cpr,showup,conversion), clean_visitors(person_id,cid,registered,first_entry), clean_history(registration_id,person_id,cid,status), clean_registrations(registration_id,person_id,cid,registered_at,owner_name), clean_marketing(campaign_id,activity_date,reported_reach,clicks,impressions,registration_starts,marketing_spend_inr), clean_engagement(person_id,campaign_id,event_type,occurred_at). Join visits to latest status using person_id. Use explicit JOINs and single aggregated SELECTs.",
  draft_task: "Prepare a task draft for the user to confirm. Use only when the user explicitly asks to create, draft or assign a task. Creates nothing until confirmed.",
  update_task: "Prepare a draft change to an existing task for the user to confirm.",
};
const allowedParams = {
  compare_campaigns: {metric:["catalog","diagnosis","spend_above_cpa","cpa","cpr","regs","attendees","spend","showup","conversion","sessions","identified","confirmed","spend_share","attendee_share","budget","plan_cpr"],by:["owner"],order:["asc","desc"]},
  get_channel_measure: {metric:channelMeasureNames, by:["campaign"], order:["asc","desc"]},
  estimate_campaign: {operation:["remove_campaign","match_showup","remaining_budget"]},
  list_tasks: {status:["open","todo","doing","done"]},
  get_kpis: {metric:["identified","regs","confirmed","attendees","spend","sessions","cpa","cpr","showup","remaining_budget","projection"]},
  get_checkins: {by:["day","source","campaign","hour"]},
  get_registrations: {by:["owner","month","week","day","campaign"]},
  get_spend: {by:["day","week","campaign","credits"]},
  calculate_scenario: {metric:["attendees","regs","identified","confirmed","spend","sessions"],operation:["multiply","divide"]},
  draft_task: {owner:owners,priority:["low","normal","high"]},
  update_task: {owner:owners,priority:["low","normal","high"],status:["todo","doing","done"]},
};
// Resolve common relative deadlines in a task request from today's IST date.
export function relativeDeadline(question, today) {
  const s = String(question).toLowerCase(),
    base = new Date(today + "T12:00:00Z"),
    plus = (n) => {
      const d = new Date(base);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekday = s.match(/\b(?:by|on|before|this|next|due)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) {
    const gap = (days.indexOf(weekday[1]) - base.getUTCDay() + 7) % 7;
    return plus(gap + (/\bnext\s+\w+day\b/.test(weekday[0]) && gap === 0 ? 7 : 0));
  }
  if (/\b(?:by|due|before)?\s*end of (?:the )?day\b|\b(?:by|due) today\b/.test(s)) return today;
  if (/\btomorrow\b/.test(s)) return plus(1);
  if (/\b(?:next week|in a week|within a week)\b/.test(s)) return plus(7);
  return null;
}
// Map a provider's owner value (full name, first name or "me") to a team owner.
export function resolveOwner(value, user) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v || v === "me" || v === "myself") return user;
  return owners.find(o => o.toLowerCase() === v)
    || owners.find(o => o.split(" ")[0].toLowerCase() === v)
    || null;
}
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
// The last two steps forbid further tool calls so the model must write an answer from its evidence.
const maxSteps = 8;
const toolChoice = (step) => step === 0 ? "required" : step >= maxSteps - 2 ? "none" : "auto";
async function openaiTurn(messages, instruction, tool, validate) {
  const input = messages.map(({ role, text }) => ({ role, content: text }));
  const tools = toolNames.map((name) => ({
    type: "function",
    name,
    description: descriptions[name] || name.replaceAll("_", " ") + " from current app data",
    parameters: schema(name),
    strict: false,
  }));
  for (let step = 0; step < maxSteps; step++) {
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
        tool_choice: toolChoice(step),
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
      const result = validate(text);
      if (result.answer) return result.answer;
      input.push(...output, {role:"user",content:[repair,...result.problems].join("\n")});
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
  for (let step = 0; step < maxSteps; step++) {
    const key = process.env[gem ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"];
    const final = toolChoice(step) === "none";
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
          ...(final ? { toolConfig: { functionCallingConfig: { mode: "NONE" } } } : {}),
        }
      : {
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: 1024,
          system: instruction,
          messages: history,
          tools: defs,
          ...(final ? { tool_choice: { type: "none" } } : {}),
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
      const result = validate(content.filter(x=>x.text && !x.thought).map(x=>x.text).join("\n"));
      if (result.answer) return result.answer;
      const feedback = [repair,...result.problems].join("\n");
      history.push(gem ? {role:"model",parts:content} : {role:"assistant",content},
        gem ? {role:"user",parts:[{text:feedback}]} : {role:"user",content:feedback});
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

function explicitAssignments(question, info) {
  const request = question.match(/\b(?:create|draft|add|make|assign)\s+(?:(?:a|an|two|the)\s+)?(?:tasks?|action items?)\s+for\s+(.+)/i);
  if (!request) return null;
  // A trailing ", due Friday" applies to the batch. A deadline inside a clause applies to that task.
  const [assignments, sharedDeadline] = request[1].split(/,\s*due\s+/i);
  const clauses = assignments.split(/\s+and\s+(?:(?:one|another(?:\s+task)?|(?:a\s+)?task)\s+)?for\s+/i);
  const result = [];
  for (const clause of clauses) {
    const parts = /^([\p{L}.-]+(?:\s+[\p{L}.-]+)?)\s+to\s+(.+?)\s*[.!?]?$/u.exec(clause.trim());
    if (!parts) return null;
    const owner = resolveOwner(parts[1],info.user);
    if (!owner) return {error: parts[1] + " is not listed as a team owner. Available owners: " + owners.join(", ") + "."};
    const deadlineMatch = /\s+(?:by|due|on)\s+((?:(?:next|this)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow|today|\d{4}-\d{2}-\d{2})[.!]?$/i.exec(parts[2]);
    const title = (deadlineMatch ? parts[2].slice(0,deadlineMatch.index) : parts[2]).trim();
    const due = deadlineMatch?.[1] || sharedDeadline;
    const deadline = due ? relativeDeadline("due " + due, info.today) || explicitDate(due,info.today) : null;
    if ((due && !deadline) || /\b(?:by|due)\b/i.test(title)) return null;
    const found = campaignMentions(title,info.campaigns);
    if (found.length > 1 || /\band (?:one|another|a task)\b/i.test(title)) return null;
    result.push({title,owner,deadline,campaign:found[0]?.cid});
  }
  return {items:result};
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
    /^(and\b|what should|what do we|how does that|why\b|who owns (?:it|that)|what else does|what about|compare that)/i.test(
      q,
    );
  const task = requestsTaskWrite(q);
  ctx.question = q;
  let clarification;
  try {
    ctx.d = (!task && explicitDate(q, ctx.d)) || (follow ? state?.state?.as_of : null) || ctx.d;
    const shift = /^(?:and |what about )?(a|one|two|\d+) (day|week)s? (later|earlier)[?.!\s]*$/i.exec(q);
    if (!task && shift && state?.state?.as_of) {
      const d = new Date(state.state.as_of + "T12:00:00Z");
      const units = {a:1,one:1,two:2}[shift[1].toLowerCase()] || Number(shift[1]);
      d.setUTCDate(d.getUTCDate() + units * (shift[2].toLowerCase() === "week" ? 7 : 1) * (shift[3].toLowerCase() === "later" ? 1 : -1));
      ctx.d = date(d.toISOString().slice(0,10));
    }
  } catch {
    clarification = "That date does not exist on the calendar. Which valid date should I use?";
  }
  const campaigns = (
    await rows("select campaign_id cid,campaign_name name,owner_name owner from clean_campaigns")
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
  if (!task && (ctx.d < event.history_start || ctx.d > event.history_end) &&
      /\b(?:registrations?|attendees?|spend|visitors?|show.up|cpa)\b/i.test(q) && !/\b(?:will|forecast|projection|plan)\b/i.test(q))
    clarification = "The historical workbook covers " + event.history_start + " through " + event.history_end + ". That snapshot needs another observed dataset.";
  const calls = [],
    info = {
      as_of: ctx.d,
      attribution: ctx.a,
      user: ctx.user,
      page: input.page,
      last_campaign: state?.state?.campaign,
      last_metric: state?.state?.metric,
      last_tool: state?.state?.tool,
      last_owner: state?.state?.owner,
      last_task: state?.state?.task_id,
      campaigns,
      coverage: event,
      end: event.history_end,
      today: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }),
      friday: friday(),
      owners,
    };
  // Deterministic hints for questions the workbook cannot answer, so the model does not substitute a nearby measure.
  if (modelMode() !== "local") {
    const gap = measurementLimit(q);
    if (gap) info.data_gap_hint = gap;
    if (/\b(?:next year|20(?:2[6-9]|3\d))\b/i.test(q))
      info.forecast_hint = "Future attendance is not observed. Use get_plan_thresholds and label the 2027 targets as plan assumptions.";
  }
  const drafts = [];
  const toolErrors = [];
  function record(result) {
    const entry = { ...trimEvidence(result), ref: "E" + (calls.length+1) };
    calls.push(entry);
    return entry;
  }
  async function invoke(name, v, assignmentText) {
    if (!toolNames.includes(name)) throw Error("Unknown tool");
    if (name === "get_kpis" && (v.campaign || (campaignMentions(q,campaigns).length && /\b(?:cpa|cpr|cost per (?:attendee|registration))\b/i.test(q) && !/\b(?:overall|total|blended|festival|fest|compare|versus|vs)\b/i.test(q))))
      throw Error("get_kpis has festival-wide scope. Use compare_campaigns with the named campaign ID and metric.");
    if (name === "draft_task" || name === "update_task") {
      if (!task) return record(await evidence("describe_task_workflow", {}, ctx));
      if (drafts.length && !assignmentText) return calls.find(r=>r.tool==="draft_task" || r.tool==="update_task");
      if (v.campaign) {
        const lookup = String(v.campaign).trim().toLowerCase();
        const match = campaigns.find(x => x.cid.toLowerCase() === lookup || x.name.toLowerCase() === lookup);
        if (!match) throw Error("Unknown campaign. Use one of: " + campaigns.map(x => x.cid + " " + x.name).join(", "));
        v = { ...v, campaign: match.cid };
      }
      // Updates keep the existing owner unless one is named; new drafts default to the user.
      if (v.owner || name === "draft_task") {
        const owner = resolveOwner(v.owner, user);
        if (!owner) throw Error("Unknown task owner. Choose one of: " + owners.join(", "));
        v = { ...v, owner };
      }
      // Deadlines are real calendar dates counted from today in IST, as in local mode,
      // never from the historical as-of date the analytics are scoped to.
      const relative = assignmentText ? null : relativeDeadline(q, info.today);
      if (relative) v = { ...v, deadline: relative };
      else if (modelMode() !== "local" && v.deadline && v.deadline < info.today && !q.includes(v.deadline))
        v = { ...v, deadline: undefined };
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
        description: existing?.description || assignmentText || q,
        proposed:
          existing?.proposed ||
          (/^(?:pause|stop|cut)\s/i.test(title) && v.campaign && !/\b(?:alert|threshold)\b|(?:₹\s*\d|\d+\s*%)/i.test(title)
            ? { status: "paused" }
            : null),
        ...(existing ? { task_id: existing.id } : {}),
      };
      drafts.push({ id: randomUUID(), ...payload });
      const r = {
        tool: name,
        // A task draft never changes the analytics date scope of the conversation.
        parameters: { ...v, as_of: ctx.d, attribution: ctx.a },
        data: payload,
        tag: "Data",
        answer: "Review “" + payload.title + "” for " + payload.owner + ". Confirm to save it in the manager.",
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
  if (/\b(?:write|compose|make|give)\b.{0,30}\b(?:poem|song|story|joke|haiku|rap|limerick|essay)\b/i.test(q))
    clarification = "I'm the growth analyst for this campaign data, so I don't write creative pieces. I can summarise the fest's results, such as attendance, campaign performance or spend.";
  if (/\b(?:delete|remove)\s+(?:all|from)\b/i.test(q))
    clarification = "The copilot can run read-only analytics queries. The data editor handles record deletion.";
  if (/\b(?:names|details|identities)\b.*\ball\s+(?:attendees|visitors|people)\b/i.test(q))
    clarification = "The copilot reports aggregate attendance. Use the win-back screen for the limited follow-up list. I can show the visitor count by campaign or day.";
  const assignments = task ? explicitAssignments(q, info) : null;
  if (assignments?.error) clarification = assignments.error;
  const namedId = q.match(/\bC\d{2,}\b/i)?.[0].toUpperCase();
  if (namedId && !campaigns.some(c => c.cid.toUpperCase() === namedId))
    clarification = "No imported campaign matches " + namedId + ". Available campaigns: " + campaigns.map(c => c.cid + " " + c.name).join(", ") + ".";
  if (task && /^(?:please\s+)?(?:create|draft|add|make)\s+(?:a |an )?(?:task|action item)[.!?]?$/i.test(q))
    clarification = "What should the task cover, who should own it, and when is it due?";
  const targetDates = !task && /\b(?:targets?|goals?)\b/i.test(q) && /\b(?:vs|versus|compare|between)\b/i.test(q)
    ? [...q.matchAll(/\b(?:20\d\d-\d\d-\d\d|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*(?:\s+20\d\d)?)\b/gi)].map(m => m[0]) : [];
  let direct;
  if (targetDates.length === 2) {
    try { direct = targetDates.map(value => ["get_targets",{as_of:explicitDate(value,ctx.d)}]); }
    catch { clarification = "Which two valid calendar dates should I compare?"; }
  } else if (!task && /\bSCALE\b[^?]*\bSTOP\b|\bSTOP\b[^?]*\bSCALE\b|\b(?:alert|rule) status\b/.test(q)) {
    // Rule labels exist only in get_alerts; ranking CPR against the plan reproduces them incorrectly.
    direct = [["get_alerts", {}]];
  } else if (!task) direct = metricRequests(q,info,owners);
  if (clarification) {
    record({tool:"validate_request", parameters:{as_of:ctx.d,attribution:ctx.a}, data:{owners}, tag:"Data", answer:clarification});
  } else if (state?.state?.draft_id && /\b(?:did you (?:create|save) it|was (?:it|that) (?:saved|cancelled|canceled))\b/i.test(q)) {
    await invoke("describe_task_workflow", {});
  } else if (assignments?.items) {
    for (const item of assignments.items) await invoke("draft_task",item,item.title);
  } else if (task && /\b(?:each|every)\b.*\bSTOP\b/i.test(q)) {
    const alerts = await invoke("get_alerts",{});
    const stopped = Array.isArray(alerts.data) ? alerts.data.filter(x => x.label === "STOP") : [];
    if (!stopped.length && Array.isArray(alerts.data)) synthesis = "[Data] No campaign meets the STOP rule in this snapshot. No follow-up task is due. [" + alerts.ref + "]";
    for (const c of stopped) {
      const owner = campaigns.find(x => x.cid === c.cid)?.owner;
      if (!owner) throw Error("Missing campaign owner for " + c.campaign_name);
      const title = "Review the STOP alert for " + c.campaign_name;
      await invoke("draft_task",{title,owner,campaign:c.cid},title);
    }
  } else if (task && /\b(?:mark|set)\b.*\b(?:that task|it)\b.*\bdone\b/i.test(q)) {
    const confirmed = state?.state?.draft_id && await scalar("select task_id from drafts where id=" + L(state.state.draft_id) +
      "::uuid and actor="+L(user)+" and resolution='confirmed'");
    const taskId = info.last_task || confirmed?.task_id;
    if (taskId) await invoke("update_task",{task_id:taskId,status:"done"});
    else synthesis = (await invoke("list_tasks",{})).data.length ? "[Data] Which task should I mark done? [E1]" : "[Data] The task board is empty. [E1]";
  } else if (!task && /^(?:show (?:me )?my (?:open )?tasks|what (?:open )?tasks does [\p{L} .-]+ have)[?.!\s]*$/iu.test(q)) {
    const owner = resolveOwner(q.match(/tasks does (.+?) have/i)?.[1], user);
    if (owner) await invoke("list_tasks",{owner,...(/\bopen\b/i.test(q) ? {status:"open"} : {})});
    else record({tool:"validate_request",parameters:{as_of:ctx.d},data:{owners},tag:"Data",answer:"Which team owner did you mean? " + owners.join(", ")});
  } else if (direct?.length) {
    for (const [name,params] of direct) await invoke(name,params);
  } else if (modelMode() === "local") {
    if (task && info.last_task && /\b(?:mark|set)\b.*\b(?:task|it)\b.*\bdone\b/i.test(q))
      await invoke("update_task",{task_id:info.last_task,status:"done"});
    else if (!task && /\btask\b/i.test(q) && /\b(?:confirm|confirmation|process|workflow|what would happen)\b/i.test(q)) await invoke("describe_task_workflow",{});
    else await localIntent(q, info, invoke);
  }
  else synthesis = await providerTurn(messages, info, async (name, v) => {
    try {
      if (name === "calculate") {
        const evidenceValues = calls.map(sourceValues);
        const literals = new Set(numbers(q).map(x => x.value));
        for (const x of String(v.expression || "").replace(/(?<=\d),(?=\d)/g,"").match(/\d+(?:\.\d+)?|\.\d+/g) || []) {
          const n = Number(x);
          if (n === 100 || literals.has(n) || literals.has(-n) || evidenceValues.some(s => s.values.has(n) || s.percentages.has(n))) continue;
          throw Error("Operand " + x + " has no source. Retrieve its count or rate before calculating.");
        }
      }
      return await invoke(name, v);
    } catch (e) {
      toolErrors.push(name + ": " + e.message);
      throw e;
    }
  }, text => checkReply(text,calls,q));
  // Every provider tool call failed: report why instead of a generic "no evidence".
  if (!calls.length && toolErrors.length)
    record({tool:"validate_request", parameters:{as_of:ctx.d,attribution:ctx.a}, data:{errors:toolErrors},
      tag:"Not in data", answer:"I couldn't complete that request. " + toolErrors.at(-1).replace(/^\w+: /, "")});
  if (!calls.length) await invoke("describe_data", { reason: modelMode() === "local" ? "local" : "ungrounded" });
  const primary = calls[0],
    rec =
      asksForRecommendations(q) &&
      calls.some((x) => x.tool === "simulate_reallocation");
  const visible = calls.filter((c,i) => calls.findIndex(r => r.answer === c.answer && r.tag === c.tag && r.parameters.as_of === c.parameters.as_of) === i);
  const multipleDates = new Set(visible.map(c => c.parameters.as_of)).size > 1;
  let answer = synthesis || visible.map(c => "[" + c.tag + "] " + (multipleDates ? "As of " + c.parameters.as_of + ", " : "") + c.answer + " [" + c.ref + "]").join("\n\n");
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
    campaign: primary.parameters.campaign || (primary.tool === "compare_campaigns" && /\b(?:which|most|least|highest|lowest|cheapest)\b/i.test(q) ? primary.data?.[0]?.cid : null) || (follow ? info.last_campaign : null),
    owner: primary.data?.[0]?.owner || primary.parameters.owner || (follow ? info.last_owner : null),
    tool: primary.tool,
    metric: primary.parameters.metric || info.last_metric,
    task_id: drafts.length ? drafts[0].task_id || null : primary.tool === "list_tasks" ? (primary.data.length === 1 ? primary.data[0].id : null) : info.last_task,
    draft_id: drafts.length ? (drafts.length === 1 ? drafts[0].id : null) : state?.state?.draft_id,
  };
  await sql(
    "begin;" + (drafts.length ? "insert into drafts(id,conversation_id,payload,actor) values " + drafts.map(({id:draftId,...payload}) =>
      "(" + L(draftId) + "::uuid," + L(id) + "::uuid," + J(payload) + "," + L(user) + ")").join(",") + ";" : "") +
    "insert into conversations(id,state,messages) values(" +
      L(id) +
      "::uuid," +
      J(nextState) +
      "," +
      J([...messages, { role: "assistant", text: answer }]) +
      ") on conflict(id) do update set state=excluded.state,messages=excluded.messages;commit",
  );
  return { conversation: id, answer, scope, calls, draft: drafts[0] || null, drafts };
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
