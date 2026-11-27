import { sql, rows, scalar, literal as L } from "./db.mjs";
import { args, date } from "./service.mjs";
const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
export const num = (x) => (x == null ? "—" : nf.format(x)),
  pct = (x) =>
    x == null ? "—" : (100 * x).toFixed(1).replace(/\.0$/, "") + "%",
  money = (x) => (x == null ? "—" : "₹" + num(x));
const when = (s) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(s));
const describe = (x) =>
  Object.entries(x)
    .filter(([, v]) => v != null)
    .map(
      ([k, v]) =>
        k.replaceAll("_", " ") +
        " " +
        (typeof v === "number"
          ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(
              v,
            )
          : String(v)),
    )
    .join(" · ");
export const toolNames = [
  "get_kpis",
  "get_funnel",
  "compare_campaigns",
  "get_targets",
  "get_spend",
  "get_status_mix",
  "get_checkins",
  "get_registrations",
  "get_engagement",
  "get_trend",
  "explain_change",
  "get_alerts",
  "get_plan_thresholds",
  "simulate_reallocation",
  "get_win_back",
  "describe_data",
  "get_change_log",
  "run_readonly_query",
  "list_tasks",
  "draft_task",
  "update_task",
];
export async function evidence(name, v, ctx) {
  const d = date(v.as_of || ctx.d),
    a = ctx.a,
    p = args(d, a),
    cid = v.campaign || null,
    cf = cid ? " where cid=" + L(cid) : "";
  let data,
    answer,
    tag = "Data",
    draft;
  const kpi = () => scalar("select * from fn_kpis(" + p + ")");
  const metricNames = {
    cpa: "cost per attendee",
    cpr: "cost per registration",
    showup: "show-up rate",
    conversion: "session-to-registration rate",
    spend: "net spend",
    regs: "registrations",
    attendees: "unique attendees",
    identified: "identified people",
    confirmed: "confirmed registrations",
    sessions: "sessions",
    spend_share: "share of spend",
    attendee_share: "share of attributed attendees",
    budget: "campaign budget",
    plan_cpr: "planned cost per registration",
  };
  const metric = Object.hasOwn(metricNames, v.metric) ? v.metric : "cpa";
  const pretty = (m, n) =>
    ["cpa", "cpr", "spend", "budget", "plan_cpr"].includes(m)
      ? money(n)
      : ["conversion", "showup", "spend_share", "attendee_share"].includes(m)
        ? pct(n)
        : num(n);
  if (name === "get_kpis" || name === "get_targets") {
    data = await kpi();
    if (name === "get_targets") {
      tag = "Calculation";
      answer =
        num(data.regs) +
        " registrations against the " +
        num(data.reg_goal) +
        " full-season goal (" +
        pct(data.reg_attainment) +
        "). Pacing is " +
        pct(data.pacing) +
        " of the expected " +
        pct(data.pace_share) +
        " share.";
    } else if (v.metric === "projection") {
      tag = "Assumption / estimate";
      answer =
        "Projected registrations " +
        num(data.projected_regs) +
        " and attendees " +
        num(data.projected_attendees) +
        ". Forecasts use the editable pace curve, expected campaign show-up and walk-ins through the event.";
    } else if (v.metric === "regs")
      answer = num(data.regs) + " external registrations.";
    else if (v.metric === "attendees")
      answer =
        num(data.attendees) +
        " unique verified external attendees, including " +
        num(data.walkins) +
        " walk-ins.";
    else if (
      Object.hasOwn(metricNames, v.metric) &&
      Object.hasOwn(data, v.metric)
    ) {
      tag = ["cpa", "cpr", "showup"].includes(v.metric)
        ? "Calculation"
        : "Data";
      answer =
        metricNames[v.metric] + " · " + pretty(v.metric, data[v.metric]) + ".";
    } else
      answer =
        num(data.identified) +
        " identified people, " +
        num(data.regs) +
        " registrations, " +
        num(data.confirmed) +
        " confirmed and " +
        num(data.attendees) +
        " unique attendees. Net spend " +
        money(data.spend) +
        ".";
  } else if (name === "get_funnel" || name === "compare_campaigns") {
    if (v.metric === "diagnosis") {
      data = await scalar("select * from fn_diagnosis(" + p + ")");
      answer = data.names
        ? data.names +
          " account for " +
          pct(data.spend_share) +
          " of spend and " +
          pct(data.attendee_share) +
          " of attributed attendees. Their combined registration → attendance rate is " +
          pct(data.showup) +
          "."
        : "There is insufficient attendance to rank cost per attendee.";
      tag = "Calculation";
    } else if (name === "compare_campaigns") {
      data = await rows(
        "select * from fn_campaign_metrics(" +
          p +
          ") where cid is not null and " +
          metric +
          " is not null" +
          (cid ? " and cid=" + L(cid) : "") +
          " order by " +
          metric +
          (v.order === "desc" ? " desc" : " asc") +
          ",name",
      );
      answer = data.length
        ? data[0].name +
          " leads this comparison at " +
          pretty(metric, data[0][metric]) +
          " " +
          metricNames[metric] +
          ". " +
          data
            .slice(1, 4)
            .map((x) => x.name + " " + pretty(metric, x[metric]))
            .join(" · ")
        : "No eligible campaign has a measurable " + metricNames[metric] + ".";
      tag = "Calculation";
    } else {
      data = await rows(
        "select * from fn_campaign_metrics(" +
          p +
          ")" +
          cf +
          " order by attendees desc",
      );
      const x = cid ? data.find((r) => r.cid) : await kpi();
      answer = x
        ? (cid ? x.name : "All campaigns") +
          " recorded " +
          num(x.sessions) +
          " anonymous sessions, " +
          num(x.identified) +
          " identified people, " +
          num(x.regs) +
          " registrations, " +
          num(x.confirmed) +
          " confirmed and " +
          num(x.attendees) +
          " attendees." +
          (cid
            ? " Session → registration " + pct(x.conversion) + "."
            : " Includes " + num(x.walkins) + " walk-ins.")
        : "No campaign activity in this snapshot.";
    }
  } else if (name === "get_spend") {
    const comparison = v.compare_date ? date(v.compare_date) : null,
      group =
        v.by === "day"
          ? "activity_date"
          : v.by === "week"
            ? "date_trunc('week',activity_date)::date"
            : "campaign_name";
    const spendDate = (dt) =>
      "select coalesce(sum(marketing_spend_inr),0) spend from clean_marketing where activity_date<=" +
      L(dt) +
      "::date" +
      (cid ? " and campaign_id=" + L(cid) : "");
    data = {
      current: (await scalar(spendDate(d))).spend,
      groups: await rows(
        "select " +
          group +
          " bucket,sum(marketing_spend_inr) spend from clean_marketing where activity_date<=" +
          L(d) +
          "::date" +
          (cid ? " and campaign_id=" + L(cid) : "") +
          " group by 1 order by 1",
      ),
      credits: await rows(
        "select activity_date,marketing_spend_inr from clean_marketing where marketing_spend_inr<0 and activity_date<=" +
          L(comparison && comparison > d ? comparison : d) +
          "::date" +
          (cid ? " and campaign_id=" + L(cid) : "") +
          " order by 1",
      ),
    };
    if (comparison) {
      data.comparison = (await scalar(spendDate(comparison))).spend;
      answer =
        money(data.current) +
        " on " +
        when(d) +
        " and " +
        money(data.comparison) +
        " on " +
        when(comparison) +
        ". Posted credits in the interval: " +
        data.credits
          .filter((x) => x.activity_date > (d < comparison ? d : comparison))
          .map(
            (x) =>
              money(x.marketing_spend_inr) + " on " + when(x.activity_date),
          )
          .join(", ") +
        ".";
    } else
      answer =
        "Net posted spend " +
        money(data.current) +
        ". " +
        data.groups
          .slice(-7)
          .map((r) => r.bucket + " " + money(r.spend))
          .join(" · ");
  } else if (name === "get_checkins") {
    const groups =
      v.by === "source"
        ? "source"
        : v.by === "campaign"
          ? "cid"
          : "occurred_at::date";
    data = {
      groups: await rows(
        "select " +
          groups +
          " bucket,count(*) entries,count(distinct person_id) people from fn_entries(" +
          p +
          ")" +
          cf +
          " group by 1 order by 1",
      ),
      both: (
        await scalar(
          "select count(*) n from (select person_id from fn_entries(" +
            p +
            ")" +
            cf +
            " group by 1 having count(distinct occurred_at::date)>1)x",
        )
      ).n,
    };
    answer =
      v.by === "source"
        ? data.groups
            .map((r) => r.bucket + " " + num(v.unique ? r.people : r.entries))
            .join(" · ") +
          (v.unique
            ? " distinct visitors by source."
            : " admitted, verified entries.")
        : num(data.both) +
          " unique people came both days. " +
          data.groups
            .map((r) => r.bucket + " · " + num(r.people) + " people")
            .join("; ") +
          ".";
  } else if (
    name === "get_registrations" ||
    name === "get_status_mix" ||
    name === "get_engagement"
  ) {
    let group,
      from,
      cond = "";
    if (name === "get_registrations") {
      group =
        {
          owner: "owner_name",
          week: "date_trunc('week',registered_at)::date",
          day: "registered_at::date",
          campaign: "cid",
        }[v.by] || "cid";
      from = "fn_regs(" + p + ")";
      cond = cf;
    }
    if (name === "get_status_mix") {
      group = "status";
      from = "fn_status(" + p + ")";
      cond = cf;
    }
    if (name === "get_engagement") {
      group = "event_type";
      from =
        "clean_engagement e join fn_people(" +
        L(d) +
        "::date) p using(person_id)";
      cond =
        " where e.occurred_at<cutoff(" +
        L(d) +
        "::date)" +
        (v.event_type ? " and e.event_type=" + L(v.event_type) : "") +
        (cid ? " and e.campaign_id=" + L(cid) : "");
    }
    data = await rows(
      "select " +
        group +
        " bucket,count(*) n" +
        (name === "get_engagement" ? ",count(distinct person_id) people" : "") +
        " from " +
        from +
        cond +
        " group by 1 order by n desc,bucket",
    );
    answer =
      data
        .slice(0, 8)
        .map(
          (r) =>
            r.bucket +
            " · " +
            num(r.n) +
            (r.people != null ? " events / " + num(r.people) + " people" : ""),
        )
        .join("\n") || "No matching records.";
  } else if (name === "get_trend") {
    const column = ["regs", "spend", "sessions", "attendees"].includes(v.metric)
        ? v.metric
        : "regs",
      grain = ["day", "week", "month"].includes(v.grain) ? v.grain : "week",
      start = date(v.from || "2025-01-15");
    data = await rows(
      "select date_trunc('" +
        grain +
        "',day)::date period,sum(" +
        column +
        ") value from fn_trend(" +
        p +
        "," +
        L(cid) +
        ") where day>=" +
        L(start) +
        "::date group by 1 order by 1",
    );
    answer = data
      .map((x) => x.period + " · " + pretty(column, x.value))
      .join("\n");
  } else if (name === "explain_change") {
    const days = Math.min(90, Math.max(1, parseInt(v.days) || 7));
    data = await scalar(
      "select * from fn_drivers(" + p + "," + L(cid) + "," + days + ")",
    );
    answer =
      "Registrations changed from " +
      num(data.previous_regs) +
      " to " +
      num(data.current_regs) +
      ". " +
      (data.spend_effect == null
        ? "Spend or sessions were zero or negative in a comparison period, so the three effects cannot be separated."
        : "Sequential contributions in registrations: spend " +
          num(data.spend_effect) +
          ", sessions per rupee " +
          num(data.efficiency_effect) +
          ", session conversion " +
          num(data.conversion_effect) +
          ".");
    tag = "Calculation";
  } else if (name === "get_alerts") {
    data = await rows(
      "select * from fn_alerts(" +
        p +
        "," +
        L(v.metric === "cpa" ? "cpa" : "cpr") +
        ")" +
        cf,
    );
    answer = data
      .map(
        (x) =>
          x.cid +
          " · " +
          x.label +
          " · " +
          money(x.actual) +
          " versus " +
          money(x.baseline),
      )
      .join("\n");
  } else if (name === "get_plan_thresholds") {
    data = {
      gates: await rows("select * from plan_gates order by name"),
      settings: await scalar("select * from settings"),
      channels: await rows(
        "select *,ratio(spend,regs) cpr from plan_channels order by name",
      ),
    };
    answer = data.gates
      .map(
        (x) =>
          x.name + " · " + x.rule + " · " + num(x.value) + " × " + x.multiplier,
      )
      .join("\n");
    tag = "Assumption / estimate";
  } else if (name === "simulate_reallocation") {
    const amount = Number(v.amount);
    if (!Number.isFinite(amount) || amount <= 0)
      throw Error("Choose a positive transfer amount.");
    data = await rows(
      "select * from fn_simulate(" +
        p +
        "," +
        L(v.from) +
        "," +
        L(v.to) +
        "," +
        amount +
        ")",
    );
    tag = "Assumption / estimate";
    answer = data.length
      ? "Moving " +
        money(amount) +
        " gives a linear net change of " +
        num(data[0].net_linear) +
        " attendees. With diminishing returns, the net is " +
        num(data[0].net_diminishing) +
        " attendees. " +
        data
          .map(
            (x) =>
              x.name +
              " " +
              num(x.delta_regs) +
              " registrations / " +
              num(x.delta_attendees) +
              " attendees (linear " +
              num(x.linear_attendees) +
              " attendees)",
          )
          .join(" · ") +
        ". Assumes unchanged show-up, the measured unit costs and editable saturation factors."
      : "Insufficient spend or attendance, identical campaigns, or the transfer exceeds available spend.";
  } else if (name === "get_win_back") {
    data = await rows(
      "select status,count(*) n,count(*) filter(where not opted_out) contactable from fn_winback(" +
        p +
        ")" +
        cf +
        " group by 1",
    );
    answer = data.map(describe).join("\n");
  } else if (name === "describe_data") {
    data = await rows(
      "select source_table,field,meaning from data_dictionary order by rid",
    );
    answer =
      "The data can't answer this. " +
      (v.reason === "forecast"
        ? "Future attendance is a forecast. The 2027 plan and its assumptions can provide a range."
        : "That attribute is absent from the workbook. A linked person or programme field would be needed. Campaign attribution and verified attendance are available.");
    tag = "Not in data";
    if (!v.reason) {
      tag = "Data";
      answer = "The workbook dictionary lists the available source fields and their meanings.";
    }
    if (v.reason === "ungrounded") {
      answer = "The provider did not return evidence for this question. Try naming the metric, campaign or date.";
    }
  } else if (name === "get_change_log") {
    data = await rows(
      "select at,actor,entity,key,before,after from growth_audit.log " +
        (v.since ? "where at>=" + L(v.since) + "::timestamptz " : "") +
        "order by id desc limit 15",
    );
    answer = data
      .map((x) => x.at + " · " + x.actor + " · " + x.entity + " " + x.key)
      .join("\n");
  } else if (name === "list_tasks") {
    data = await rows(
      "select * from tasks where true" +
        (v.owner ? " and owner=" + L(v.owner) : "") +
        (cid ? " and campaign_id=" + L(cid) : "") +
        " order by created_at desc limit 50",
    );
    answer = data.length
      ? data.map((x) => x.title + " · " + x.owner + " · " + x.status).join("\n")
      : "No matching tasks.";
  } else if (name === "run_readonly_query") {
    data = await readonly(v.sql, d, a);
    answer = data.length
      ? data.slice(0, 12).map(describe).join("\n")
      : "The query returned no rows.";
    tag = "Calculation";
  } else throw Error("Unknown evidence tool");
  return {
    tool: name,
    parameters: { ...v, as_of: d, attribution: a },
    data,
    tag,
    answer,
    draft,
  };
}
const scoped = {
  clean_people: (d) => "select * from fn_people(" + d + ")",
  clean_registrations: (d, p) => "select * from fn_regs(" + p + ")",
  clean_history: (d, p) => "select * from fn_status(" + p + ")",
  clean_checkins: (d, p) => "select * from fn_entries(" + p + ")",
  clean_visitors: (d, p) => "select * from fn_visitors(" + p + ")",
  clean_campaign_metrics: (d, p) =>
    "select * from fn_campaign_metrics(" + p + ")",
  clean_marketing: (d) =>
    "select * from growth.clean_marketing where activity_date<=" + d,
  clean_engagement: (d) =>
    "select e.* from growth.clean_engagement e join fn_people(" +
    d +
    ") p using(person_id) where occurred_at<cutoff(" +
    d +
    ")",
  clean_targets: (d) => "select * from fn_targets(" + d + ")",
};
export async function readonly(query, d, a) {
  const s = String(query || "")
    .trim()
    .replace(/;$/, "");
  if (
    s.length > 3500 ||
    !/^select\s/i.test(s) ||
    /[;\\\x00]|--|\/\*|\$|"|::/.test(s)
  )
    throw Error("Use a single SELECT over the documented clean views.");
  const stripped = s.replace(/'(?:[^']|'')*'/g, "''");
  if (
    /[^a-z0-9_\s.,()'*/+%<>=!-]/i.test(stripped) ||
    /\b(?:into|with|copy|set|show|execute|insert|update|delete|table|values|pg_\w*|information_schema|public|growth|lateral|generate_series|union)\b/i.test(
      stripped,
    )
  )
    throw Error("Only scoped analytics SELECTs are allowed.");
  const funcs = new Set(
    "count sum avg min max round nullif coalesce abs lower upper distinct in over filter date_trunc extract cast as from where select on and or".split(
      " ",
    ),
  );
  for (const m of stripped.matchAll(/\b([a-z_]\w*)\s*\(/gi))
    if (!funcs.has(m[1].toLowerCase()))
      throw Error("Unsupported query function");
  const names = [
    ...new Set(
      Array.from(stripped.matchAll(/\b(?:from|join)\s+([\w.]+)/gi), (m) =>
        m[1].toLowerCase(),
      ),
    ),
  ];
  if (!names.length || names.some((n) => !Object.hasOwn(scoped, n)))
    throw Error("Use only published clean views.");
  if (
    /\bfrom\s+[^()]*?,\s*[a-z_]\w*(?:\s|$)/i.test(
      stripped.split(/\b(?:where|group|order|limit)\b/i)[0],
    )
  )
    throw Error("Use explicit JOINs.");
  const ds = L(d) + "::date",
    p = args(d, a);
  const prep = names
    .map(
      (n) =>
        "create temp table " +
        n +
        " as " +
        scoped[n](ds, p) +
        ";grant select on pg_temp." +
        n +
        " to growth_reader;",
    )
    .join("\n");
  return JSON.parse(
    await sql(
      "begin;set local search_path=growth,pg_temp,pg_catalog;set local statement_timeout='3000ms';" +
        prep +
        "commit;begin read only;set local role growth_reader;set local search_path=pg_temp,pg_catalog;set local statement_timeout='1200ms';select coalesce(json_agg(q),'[]') from (select * from (" +
        s +
        ") inner_query limit 80)q;rollback;",
    ),
  );
}
