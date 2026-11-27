import { randomUUID } from "node:crypto";
import { sql, rows, scalar, literal as L, jsonArg as J } from "./db.mjs";
import { context, date, owners, transaction } from "./service.mjs";
import { evidence, toolNames, money, num, pct } from "./evidence.mjs";
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
const rules = `You are the Deccan Drift Growth Copilot. Use actual function calls for all answers. Prefer targeted tools; use describe_data and then run_readonly_query for unfamiliar answerable questions. The server formats numeric answers from tool results. Never do arithmetic or invent numbers. Distinguish activity and admissions from people. Use scope date, attribution and active targets, retain the date/metric/campaign on follow-ups. Missing fields and future facts require describe_data. Estimates are assumptions. For recommendations use compare_campaigns(metric diagnosis), compare_campaigns(metric cpa) and a justified simulate_reallocation. Draft create/update tasks for explicit task requests only. Never confirm or execute a task. Return short qualitative interpretation after sufficient evidence, avoiding any new facts. Data used, scope and evidence tags are rendered by the app. SQL fallback views: clean_people, clean_registrations (registration_id,person_id,cid,registered_at,owner_name), clean_history (latest status), clean_visitors (one row/person), clean_checkins (verified entries), clean_campaign_metrics (cid,name,spend,sessions,regs,attendees,confirmed,cpr,cpa,showup,conversion), clean_engagement, clean_marketing, clean_targets. Use explicit JOIN. Use real campaign IDs from context.`;
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
  get_registrations: "campaign by",
  get_engagement: "campaign event_type",
  get_trend: "campaign metric from grain",
  explain_change: "campaign days",
  get_alerts: "metric campaign",
  get_plan_thresholds: "",
  simulate_reallocation: "from to amount",
  get_win_back: "campaign",
  describe_data: "reason",
  get_change_log: "since",
  run_readonly_query: "sql",
  list_tasks: "owner campaign",
  draft_task: "title owner deadline campaign priority",
  update_task: "task_id title owner deadline campaign status priority",
};
function schema(name) {
  return {
    type: "object",
    properties: Object.fromEntries(
      ("as_of " + signatures[name])
        .trim()
        .split(" ")
        .map((k) => [
          k,
          {
            type: ["days", "amount"].includes(k)
              ? "number"
              : k === "unique"
                ? "boolean"
                : "string",
            description: params[k],
          },
        ]),
    ),
  };
}
async function openaiTurn(messages, instruction, tool) {
  const input = messages.map(({ role, text }) => ({ role, content: text }));
  const tools = toolNames.map((name) => ({
    type: "function",
    name,
    description: name.replaceAll("_", " ") + " from current app data",
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
    if (!calls.length) return;
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
async function providerTurn(messages, info, tool) {
  const mode = provider();
  const instruction = rules + "\nCurrent context: " + JSON.stringify(info);
  if (mode === "openai") return openaiTurn(messages, instruction, tool);
  const gem = mode === "gemini",
    defs = toolNames.map((name) => ({
      name,
      description: name.replaceAll("_", " ") + " from current app data",
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
    if (!calls.length) return;
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
    if (!isNaN(+d)) return d.toISOString().slice(0, 10);
  }
  return null;
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
  if (/artist|gender|next year|age split|college name/.test(s))
    return tool("describe_data", {
      reason: s.includes("next year") ? "forecast" : "missing",
    });
  if (/move|reallocat|transfer/.test(s)) {
    const v = s.match(/(?:₹|rs\.?\s*|inr\s*)?([\d,]+)\s*(k|lakh)?/);
    if (!v || found.length !== 2)
      throw Error("Specify the source, destination and rupee amount.");
    return tool("simulate_reallocation", {
      from: found[0].cid,
      to: found[1].cid,
      amount:
        Number(v[1].replaceAll(",", "")) *
        (v[2] === "k" ? 1000 : v[2] === "lakh" ? 100000 : 1),
    });
  }
  if (/what should|recommend|what do we do/.test(s)) {
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
  if (/target|pace|pacing/.test(s)) return tool("get_targets", {});
  if (/both days|scanner|manual|entries|check.ins/.test(s))
    return tool("get_checkins", {
      by: /scanner|manual/.test(s) ? "source" : "day",
    });
  if (/spend|credit/.test(s) && !/cost per/.test(s))
    return tool("get_spend", {
      campaign: c,
      ...(/final/.test(s) ? { compare_date: info.end } : {}),
    });
  if (/owner|busiest.*week|registration.*week/.test(s))
    return tool("get_registrations", {
      by: /owner/.test(s) ? "owner" : "week",
      campaign: c,
    });
  if (/opted|email|brochure|engagement/.test(s))
    return tool("get_engagement", {
      event_type: /opted/.test(s) ? "opted_out" : undefined,
      campaign: c,
    });
  if (/session.*reg|funnel/.test(s))
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
  if (/projection|forecast/.test(s))
    return tool("get_kpis", { metric: "projection" });
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
  const task = /\btask\b/i.test(q);
  ctx.d =
    (!task && explicitDate(q, ctx.d)) ||
    (follow ? state?.state?.as_of : null) ||
    ctx.d;
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
  const calls = [],
    info = {
      as_of: ctx.d,
      attribution: ctx.a,
      user: ctx.user,
      page: input.page,
      last_campaign: state?.state?.campaign,
      last_metric: state?.state?.metric,
      campaigns,
      end: (await scalar("select history_end from clean_event limit 1"))
        .history_end,
      today: new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      }),
      friday: friday(),
    };
  let draft = null;
  async function invoke(name, v) {
    if (!toolNames.includes(name)) throw Error("Unknown tool");
    if (name === "draft_task" || name === "update_task") {
      if (!task) throw Error("Ask explicitly for a task draft.");
      if (draft) return { draft };
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
      calls.push(r);
      return r;
    }
    const r = await evidence(name, v, ctx);
    if (name === "describe_data" && v.reason === "local")
      r.answer =
        "Local query mode could not map that question to a supported metric. Enable a model provider for open-ended questions, or ask about attendance, spend, registrations or campaigns.";
    calls.push(trimEvidence(r));
    return trimEvidence(r);
  }
  const messages = [
    ...(state?.messages || []).slice(-8),
    { role: "user", text: q },
  ];
  if (modelMode() === "local") await localIntent(q, info, invoke);
  else await providerTurn(messages, info, invoke);
  if (!calls.length) await invoke("describe_data", { reason: modelMode() === "local" ? "local" : "ungrounded" });
  const primary = calls[0],
    rec =
      /what should|recommend|what do we do/i.test(q) &&
      calls.some((x) => x.tool === "simulate_reallocation");
  let answer = calls.map((x) => "[" + x.tag + "] " + x.answer).join("\n\n");
  if (rec) {
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
