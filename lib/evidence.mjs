import { sql, rows, scalar, literal as L } from "./db.mjs";
import { args, date } from "./service.mjs";
import { channelMeasure } from "./channel-measures.mjs";
import { describeGate } from "./plan-gates.mjs";
const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const numDecimal = x => x == null ? "—" : decimalFormat.format(x);
// The workbook schema is fixed. These explanations pair missing measurements with available breakdowns.
const missingMeasures = [
  [/\b(?:gender|age|demographic)\b/i, "Age and gender are absent from person records. Attendance can be grouped by acquisition campaign or first-touch source."],
  [/\b(?:artists?|line-?up|headliners?)\b/i, "There is no artist lineup or link between performances and individual admissions. Attendance by campaign, day or hour is available."],
  [/\b(?:which|what|top)\s+(?:colleges?|institutions?)\b(?!\s+partnerships)|college name/i, "The workbook records College Partnerships as a campaign. It has no institution field per person. I can compare that campaign with the other channels."],
  [/\b(?:outside|travelled from|traveled from|home city|live in)\b.*\b(?:city|pune|town|region)\b/i, "Attendees' home locations are unavailable. Verified attendance can be grouped by day or campaign."],
  [/\b(?:ticket revenue|ticket sales|sponsors? (?:pay|paid|contribute)|sponsor(?:ship)? (?:income|revenue|receipts|payments)|roi|profit|food stalls?)\b/i, "Ticket, vendor and sponsorship receipts are absent from the ledger. It tracks campaign marketing costs. Cost per attendee is available."],
  [/\b(?:ad creative|creative.level|ad variant)\b/i, "Marketing activity is aggregated by campaign and day. Creative identifiers are unavailable. Campaign click and registration rates can be compared."],
  [/\b(?:nps|feedback|think of the fest|satisfaction)\b/i, "No attendee survey or recommendation scores were collected. Engagement records include event questions and opt-outs."],
  [/\b(?:how long.*stay|dwell time|time spent at)\b/i, "Only entry timestamps were recorded. Exit scans would be needed to measure visit duration. Repeat entries and both-day visits are available."],
  [/\b(?:why.*cancel|cancellation reasons?)\b/i, "Registration history records status changes without a cancellation reason. Cancellation counts and rates by campaign are available."],
  [/\b(?:rain|weather)\b/i, "The workbook has no weather observations or forecasts. The date and verified entries on each event day are available."],
  [/\b(?:competitor|mindspark|mood indigo|industry benchmark|average cpa for)\b/i, "There is no comparable external campaign CPA or attendance series. Compare internal campaigns, or supply a comparator with matching definitions."],
];
export function measurementLimit(question) {
  return missingMeasures.find(([pattern]) => pattern.test(question))?.[1];
}
export const num = (x) => (x == null ? "—" : nf.format(x)),
  pct = (x) =>
    x == null ? "—" : (100 * x).toFixed(1).replace(/\.0$/, "") + "%",
  money = (x) => (x == null ? "—" : (Number(x) < 0 ? "−₹" + num(-x) : "₹" + num(x)));
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
  "get_channel_measure",
  "get_kpis",
  "get_funnel",
  "compare_campaigns",
  "get_targets",
  "get_spend",
  "get_status_mix",
  "get_checkins",
  "get_checkin_audit",
  "get_registrations",
  "get_engagement",
  "get_trend",
  "explain_change",
  "get_alerts",
  "get_plan_thresholds",
  "simulate_reallocation",
  "estimate_campaign",
  "calculate_scenario",
  "calculate",
  "describe_task_workflow",
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
  const kpi = () => scalar("select k.*, budget-spend as remaining_budget, attendees-walkins as registered_attendees,ratio(regs,sessions) as conversion, " +
    "greatest(0, attendee_goal-attendees) as attendee_shortfall, greatest(0,reg_goal-regs) as registration_shortfall from fn_kpis(" + p + ") k");
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
    sessions: "landing-page sessions (anonymous visits, not people)",
    spend_share: "share of spend",
    attendee_share: "share of attributed attendees",
    budget: "campaign budget",
    plan_cpr: "planned cost per registration",
  };
  const metric = Object.hasOwn(metricNames, v.metric) ? v.metric : "cpa";
  if (name === "compare_campaigns" && v.metric && !Object.hasOwn(metricNames,v.metric) &&
      !["catalog","diagnosis","spend_above_cpa"].includes(v.metric))
    throw Error("Unknown campaign metric. Use get_channel_measure for cancellation, click, opt-out and reach measures.");
  const pretty = (m, n) =>
    ["cpa", "cpr", "spend", "budget", "plan_cpr"].includes(m)
      ? money(n)
      : ["conversion", "showup", "spend_share", "attendee_share"].includes(m)
        ? pct(n)
        : num(n);
  if (name === "get_channel_measure") {
    ({ data, answer } = await channelMeasure(v, d, a));
    tag = "Calculation";
  } else if (name === "get_kpis" || name === "get_targets") {
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
        " share. Registration shortfall: " + num(data.registration_shortfall) + ". " +
        num(data.attendees) + " verified attendees against the " + num(data.attendee_goal) +
        " attendance goal (" + pct(data.attendee_attainment) + "), " + num(data.attendee_shortfall) + " short. " +
        num(data.identified) + " identified people against " + num(data.identified_goal) +
        " (" + pct(data.identified_attainment) + "). Approved budget " + money(data.budget) + ", remaining " + money(data.remaining_budget) +
        ". Target version in effect: " + (data.target_version || "none") + ".";
    } else if (v.metric === "remaining_budget") {
      tag = "Calculation";
      answer = money(data.remaining_budget) + " remains from the approved " + money(data.budget) +
        " budget after " + money(data.spend) + " in net spend.";
    } else if (v.metric === "cpa" && data.cpa == null) {
      tag = "Calculation";
      answer = "Cost per attendee is undefined because there are no verified attendees in this snapshot. Net spend: " + money(data.spend) + ".";
    } else if (v.metric === "projection") {
      tag = "Assumption / estimate";
      answer =
        "Projected registrations " +
        num(data.projected_regs) +
        " and attendees " +
        num(data.projected_attendees) +
        " against the attendance target of " + num(data.attendee_goal) +
        ". Forecasts use the editable pace curve, assumed campaign show-up rates and expected walk-ins through the event.";
    } else if (v.metric === "regs")
      answer = num(data.regs) + " external registrations.";
    else if (v.metric === "attendees")
      answer =
        num(data.attendees) +
        " unique verified external attendees, including " +
        num(data.walkins) +
        " unattributed walk-ins.";
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
    } else if (name === "compare_campaigns" && v.metric === "spend_above_cpa") {
      if (!Number.isFinite(v.amount) || v.amount < 0) throw Error("Supply the CPA threshold in rupees.");
      const cutoff = L(v.amount) + "::numeric";
      data = await scalar(`select string_agg(name,', ' order by name) filter (where cpa>${cutoff}) campaigns,
        coalesce(sum(spend) filter (where cpa>${cutoff}),0) qualifying_spend, sum(spend) total_spend,
        ratio(coalesce(sum(spend) filter (where cpa>${cutoff}),0),sum(spend)) spend_share from fn_campaign_metrics(${p})`);
      answer = (data.campaigns || "No campaigns") + " above ₹" + numDecimal(v.amount) + " per attendee. " +
        money(data.qualifying_spend) + " of " + money(data.total_spend) + " total net spend (" + pct(data.spend_share) + ").";
      tag = "Calculation";
    } else if (name === "compare_campaigns" && v.metric === "catalog") {
      data = await rows("select cid,name,owner,regs,attendees,spend,cpa,showup from fn_campaign_metrics("+p+") where cid is not null" +
        (v.owner ? " and owner="+L(v.owner) : "") + (cid ? " and cid="+L(cid) : "") + " order by name");
      answer = data.map(x => x.name + " (" + x.cid + ") · " + x.owner + " · " + num(x.regs) + " registrations · " +
        num(x.attendees) + " attendees · " + (x.cpa == null ? "undefined CPA" : "₹" + numDecimal(x.cpa) + " per attendee") +
        " · " + pct(x.showup) + " show-up").join("\n") || "No campaigns matched in this snapshot.";
    } else if (name === "compare_campaigns" && v.by === "owner") {
      const ownerMetric = ["cpa", "cpr", "showup", "spend", "regs", "attendees", "conversion"].includes(v.metric) ? v.metric : "cpa";
      data = await rows(
        "select owner,string_agg(name,', ' order by name) campaigns,sum(spend) spend,sum(sessions) sessions,sum(regs) regs," +
          "sum(attendees) attendees,sum(registered_attendees) registered_attendees,ratio(sum(spend),sum(attendees)) cpa," +
          "ratio(sum(spend),sum(regs)) cpr,ratio(sum(registered_attendees),sum(regs)) showup,ratio(sum(regs),sum(sessions)) conversion " +
          "from fn_campaign_metrics(" + p + ") where cid is not null" + (cid ? " and cid=" + L(cid) : "") +
          (v.owner ? " and lower(owner)=" + L(v.owner.toLowerCase()) : "") +
          " group by owner order by " + ownerMetric + (v.order === "desc" ? " desc" : " asc") + " nulls last,owner",
      );
      answer = data.map(x => x.owner + " (" + x.campaigns + ") · " + pretty(ownerMetric, x[ownerMetric]) + " " + metricNames[ownerMetric] +
        " · spend " + money(x.spend) + " · " + num(x.attendees) + " attributed attendees · show-up " + pct(x.showup)).join("\n") +
        "\nOwner figures sum each owner's campaigns and exclude unattributed walk-ins. Campaign results reflect channel and budget, not only individual performance.";
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
      if (cid && data.length && ["cpa","cpr"].includes(metric)) {
        const x = data[0], perAttendee = metric === "cpa";
        answer = x.name + " · " + money(x.spend) + " net spend / " + num(perAttendee ? x.attendees : x.regs) +
          (perAttendee ? " attributed attendees" : " registrations") + " = ₹" + numDecimal(x[metric]) + " " + metricNames[metric] + ".";
      }
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
      const platform = await scalar(
        "select coalesce(sum(impressions),0) impressions,coalesce(sum(clicks),0) clicks,coalesce(sum(reported_reach),0) reported_reach," +
          "coalesce(sum(landing_page_sessions),0) sessions,coalesce(sum(registration_starts),0) platform_registration_starts," +
          "ratio(sum(clicks),sum(impressions)) ctr from clean_marketing where activity_date<=" + L(d) + "::date" +
          (cid ? " and campaign_id=" + L(cid) : ""),
      );
      data = { campaigns: data, platform };
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
            ? " Session → registration " + pct(x.conversion) + ". Registration → attendance " + pct(x.showup) + ". " +
              "Cost per registration ₹" + numDecimal(x.cpr) + ", cost per attendee ₹" + numDecimal(x.cpa) + "."
            : " Sessions are anonymous visits. Session → registration " + pct(x.conversion) +
              ". Registration → attendance " + pct(x.showup) + " (" + num(x.registered_attendees) +
              " registered visitors). An additional " + num(x.walkins) + " walk-ins attended.")
        : "No campaign activity in this snapshot.";
      answer += " Platform counts (anonymous activity, not unique people): " + num(platform.impressions) + " impressions, " +
        num(platform.clicks) + " clicks (CTR " + pct(platform.ctr) + "), reported reach " + num(platform.reported_reach) +
        " and " + num(platform.platform_registration_starts) + " platform-reported registration starts.";
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
        "select campaign_name,activity_date,marketing_spend_inr from clean_marketing where marketing_spend_inr<0 and activity_date<=" +
          L(comparison && comparison > d ? comparison : d) +
          "::date" +
          (cid ? " and campaign_id=" + L(cid) : "") +
          " order by 1",
      ),
    };
    if (comparison) {
      data.comparison = (await scalar(spendDate(comparison))).spend;
      const [early, late] = d < comparison ? [d, comparison] : [comparison, d];
      const earlySpend = d < comparison ? data.current : data.comparison,
        lateSpend = d < comparison ? data.comparison : data.current;
      data.interval = await scalar(
        "select coalesce(sum(marketing_spend_inr) filter(where marketing_spend_inr>0),0) costs," +
          "coalesce(sum(marketing_spend_inr) filter(where marketing_spend_inr<0),0) credits from clean_marketing where activity_date>" +
          L(early) + "::date and activity_date<=" + L(late) + "::date" + (cid ? " and campaign_id=" + L(cid) : ""),
      );
      const credits = data.credits.filter((x) => x.activity_date > early && x.activity_date <= late);
      data.change = Number(lateSpend) - Number(earlySpend);
      answer =
        "Net spend was " + money(earlySpend) + " on " + when(early) + " and " + money(lateSpend) + " on " + when(late) +
        (data.change === 0 ? ", unchanged." : ", a change of " + (data.change > 0 ? "+" : "") + money(data.change) + ".") +
        " Between those dates " + money(data.interval.costs) + " of new costs and " + money(data.interval.credits) +
        " of credits were posted" +
        (credits.length
          ? ": " + credits.map((x) => x.campaign_name + " " + money(x.marketing_spend_inr) + " on " + when(x.activity_date)).join(", ") + "."
          : ".") +
        (Number(data.interval.credits) < 0 && Number(data.interval.costs) === 0
          ? " The difference is entirely these credits: refunds or adjustments posted after the original costs, which lower net spend."
          : "");
    } else if (v.by === "credits") {
      data.credit_total = (await scalar("select coalesce(sum(marketing_spend_inr),0) total from clean_marketing where marketing_spend_inr<0 and activity_date<=" +
        L(d) + "::date" + (cid ? " and campaign_id=" + L(cid) : ""))).total;
      answer = data.credits.map(x => x.campaign_name + " " + money(x.marketing_spend_inr) + " on " + when(x.activity_date)).join(" · ") +
        ". Total credits: " + money(data.credit_total) + ".";
    } else
      answer =
        "Net posted spend " +
        money(data.current) +
        ". " +
        data.groups
          .slice(-7)
          .map((r) => r.bucket + " " + money(r.spend))
          .join(" · ");
    if (!cid && !comparison && v.by !== "credits") {
      const k = await kpi();
      data.budget = k.budget;
      data.remaining_budget = k.remaining_budget;
      data.budget_used = k.budget_used;
      answer += ". Approved budget " + money(k.budget) + ", " + pct(k.budget_used) + " used. " +
        (k.remaining_budget < 0 ? "Over budget by " + money(-k.remaining_budget) : money(k.remaining_budget) + " left") + ".";
    }
  } else if (name === "get_checkin_audit") {
    data = await scalar("select count(*) deduplicated_records, " +
      "count(*) filter(where c.result='denied' and p.person_type='external') external_denied, " +
      "count(*) filter(where c.verification='unverified' and p.person_type='external') external_unverified, " +
      "count(*) filter(where c.result='admitted' and c.verification='verified' and p.person_type='external') external_admitted, " +
      "count(distinct c.person_id) filter(where c.result='admitted' and c.verification='verified' and p.person_type='external') distinct_attendees " +
      "from clean_checkins c left join clean_people p using(person_id) where c.occurred_at<cutoff(" + L(d) + "::date)");
    answer = num(data.deduplicated_records) + " distinct check-in records across all person types. Among external people, " +
      num(data.external_denied) + " were denied and " + num(data.external_unverified) + " were unverified. " +
      num(data.external_admitted) + " verified admission entries represent " + num(data.distinct_attendees) + " unique attendees.";
  } else if (name === "get_checkins") {
    const groups =
      v.by === "source"
        ? "source"
        : v.by === "campaign"
          ? "cid"
          : v.by === "hour"
            ? "to_char(date_trunc('hour',occurred_at at time zone 'Asia/Kolkata'),'YYYY-MM-DD HH24')"
            : "occurred_at::date";
    const scopeEntries = "select person_id,occurred_at::date as visit_day from fn_entries(" + p + ")" + cf;
    const summary = await scalar(
      "with people as (select person_id,count(*) entries,count(distinct visit_day) as days from (" + scopeEntries +
      ") e group by person_id) select coalesce(sum(entries),0) entries,count(*) unique_people," +
      " count(*) filter(where entries>1) repeat_people,coalesce(sum(entries-1),0) repeat_entries,round(sum(entries)/nullif(count(*),0),2) entries_per_person," +
      " count(*) filter(where days=1) single_day,count(*) filter(where days>1) both from people"
    );
    const groupsByDay = !["source", "campaign", "hour"].includes(v.by);
    data = {
      ...summary,
      groups: groupsByDay ? await rows(
        "with person_days as (select visit_day,person_id,count(*) entries from (" + scopeEntries +
        ") e group by 1,2), visits as (select *,min(visit_day) over(partition by person_id) first_day from person_days) " +
        "select visit_day bucket,sum(entries) entries,count(*) people,count(*) filter(where visit_day=first_day) first_time from visits group by visit_day order by visit_day"
      ) : await rows(
        "select " +
          groups +
          " bucket,count(*) entries,count(distinct person_id) people from fn_entries(" +
          p +
          ")" +
          cf +
          " group by 1 order by " + (v.by === "hour" ? "entries desc,1" : "1"),
      ),
    };
    const hourLabel = (bucket) => {
      const [day, hour] = bucket.split(" "), h = Number(hour), twelve = (x) => (x % 12 || 12) + (x < 12 ? " am" : " pm");
      return day + " " + hour + ":00–" + String(h + 1).padStart(2, "0") + ":00 (" + twelve(h) + "–" + twelve((h + 1) % 24) + ")";
    };
    answer =
      v.by === "source"
        ? data.groups
            .map((r) => r.bucket + " " + num(r.entries) + " admitted entries / " + num(r.people) + " distinct people")
            .join(" · ") + ". A person can enter through both sources."
        : v.by === "hour"
          ? "Busiest check-in hours by admitted, verified entries: " +
            data.groups.slice(0, 5).map((r) => hourLabel(r.bucket) + " · " + num(r.entries) + " entries / " + num(r.people) + " people").join("; ") + "."
        : num(data.entries) + " admitted entries include re-entries. " + num(data.unique_people) +
          " distinct visitors attended, " + num(data.single_day) + " on exactly one day and " + num(data.both) +
          " on both days. " +
          num(data.repeat_people) + " people re-entered, accounting for " + num(data.repeat_entries) +
          " additional entries. Average entries per visitor: " + numDecimal(data.entries_per_person) + ". " +
          data.groups
            .map((r) => r.bucket + " · " + num(r.people) + " people" +
              (r.first_time == null ? "" : ", " + num(r.first_time) + " first-time visitors"))
            .join("; ") +
          ".";
  } else if (name === "get_status_mix" && v.by === "campaign") {
    data = await rows(
      "select s.cid,coalesce(c.campaign_name,'Unattributed') name,count(*) total,count(*) filter(where status='confirmed') confirmed," +
        "count(*) filter(where status='cancelled') cancelled,count(*) filter(where status='waitlisted') waitlisted," +
        "count(*) filter(where status='interested') interested,ratio(count(*) filter(where status='cancelled'),count(*)) cancellation_rate " +
        "from fn_status(" + p + ") s left join clean_campaigns c on c.campaign_id=s.cid" + (cid ? " where s.cid=" + L(cid) : "") +
        " group by 1,2 order by cancellation_rate desc nulls last,name",
    );
    answer = data.map(x => x.name + " · " + num(x.cancelled) + " cancelled of " + num(x.total) + " registrations (" +
      pct(x.cancellation_rate) + " cancellation rate) · " + num(x.confirmed) + " confirmed").join("\n") || "No matching records.";
  } else if (name === "get_status_mix") {
    data = await rows(
      "with v as (select distinct person_id from fn_visitors(" + p + ")) select s.status bucket,count(*) n," +
        "count(v.person_id) attended,count(*)-count(v.person_id) not_attended from fn_status(" + p + ") s " +
        "left join v on v.person_id=s.person_id" + (cid ? " where s.cid=" + L(cid) : "") + " group by 1 order by n desc,1",
    );
    answer = data.map(r => r.bucket + " · " + num(r.n) + " (" + num(r.attended) + " attended, " + num(r.not_attended) + " did not attend)").join("\n") ||
      "No matching records.";
    if (data.length) answer += "\nStatus is each registration's latest status as of the date. Attendance means a verified admission by that person.";
  } else if (name === "get_engagement" && v.by === "campaign") {
    const raw = await rows(
      "select e.campaign_id cid,coalesce(c.campaign_name,'Unattributed') name,e.event_type,count(*) n from clean_engagement e join fn_people(" +
        L(d) + "::date) p using(person_id) left join clean_campaigns c on c.campaign_id=e.campaign_id where e.occurred_at<cutoff(" + L(d) +
        "::date)" + (cid ? " and e.campaign_id=" + L(cid) : "") + " group by 1,2,3",
    );
    const byCampaign = new Map();
    for (const r of raw) {
      const row = byCampaign.get(r.cid) || { cid: r.cid, name: r.name };
      row[r.event_type] = r.n;
      byCampaign.set(r.cid, row);
    }
    const focus = v.event_type || "opted_out";
    data = [...byCampaign.values()].sort((x, y) => (y[focus] || 0) - (x[focus] || 0) || x.name.localeCompare(y.name));
    answer = data.map(x => x.name + " · " + Object.entries(x).filter(([k]) => !["cid", "name"].includes(k) &&
      (!v.event_type || k === v.event_type || k === "nurture_email_sent")).map(([k, n]) => k + " " + num(n)).join(", ")).join("\n") ||
      "No matching records.";
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
          month: "date_trunc('month',registered_at)::date",
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
      " bucket,count(*) n" + (name === "get_registrations" ? ",sum(count(*)) over() as total_regs" : "") +
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
    if (name === "get_registrations") answer = num(data[0]?.total_regs ?? 0) + " cumulative external registrations. " + answer;
    if (name === "get_engagement" && v.event_type === "registration_start")
      answer += " These starts are recorded events linked to identified external people. Anonymous platform starts can include multiple observations and cannot be matched one-to-one.";
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
  } else if (name === "explain_change" && ["cpa", "cpr", "spend", "attendees"].includes(v.metric)) {
    ({ data, answer } = await explainCost(v.metric, d, a, cid, Math.min(90, Math.max(1, parseInt(v.days) || 7))));
    tag = "Calculation";
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
      "select a.*,c.campaign_name,s.scale,s.stop,round(a.baseline*s.stop,2) stop_threshold from fn_alerts(" +
        p +
        "," +
        L(v.metric === "cpa" ? "cpa" : "cpr") +
        ") a join clean_campaigns c on c.campaign_id=a.cid cross join settings s" + cf + " order by a.cid",
    );
    answer = data
      .map(
        (x) =>
          x.campaign_name +
          " · " +
          x.label +
          " · " +
          money(x.actual) +
          " versus " +
          "baseline ₹" + numDecimal(x.baseline) + ". " + x.reason + ".",
      )
      .join("\n");
    if (data.length) answer += "\nSCALE requires cumulative cost at or below " + data[0].scale +
      "× plan. STOP requires both of the last two completed weeks above " + data[0].stop + "× plan.";
  } else if (name === "get_plan_thresholds") {
    data = {
      scenario: await scalar("select sum(attendees) committed,round(sum(attendees),-2) committed_rounded,sum(stretch_attendees) stretch from plan_channels"),
      gates: await rows("select * from plan_gates order by name"),
      settings: await scalar("select * from settings"),
      channels: await rows(
        "select *,ratio(spend,regs) cpr from plan_channels order by name",
      ),
    };
    answer = "This is the Deccan Drift 2027 plan, a set of targets and assumptions, not a forecast from the 2025 data. " +
      "Committed plan: " + num(data.scenario.committed) + " attendees (about " +
      num(data.scenario.committed_rounded) + "). Stretch: " + num(data.scenario.stretch) + " attendees.\nDecision gates:\n" +
      data.gates.map(describeGate).join("\n");
    tag = "Assumption / estimate";
  } else if (name === "estimate_campaign") {
    tag = "Assumption / estimate";
    if (v.operation === "remove_campaign" && cid) {
      data = await scalar(`select m.name,m.spend saved,m.attendees lost,k.attendees-m.attendees projected_attendees,
        ratio(k.spend-m.spend,k.attendees-m.attendees) projected_cpa
        from fn_campaign_metrics(${p}) m cross join fn_kpis(${p}) k where m.cid=${L(cid)}`);
      if (!data) throw Error("Choose a campaign in this snapshot.");
      answer = "Removing " + data.name + " would save " + money(data.saved) + " and remove " + num(data.lost) +
        " attributed attendees, leaving " + num(data.projected_attendees) + " attendees at " +
        (data.projected_cpa == null ? "undefined cost per attendee" : "₹" + numDecimal(data.projected_cpa) + " per attendee") +
        ". This assumes those visitors would not have attended through another channel and other spend stays fixed.";
    } else if (v.operation === "match_showup" && cid && v.to && cid !== v.to) {
      const supplied = v.factor != null;
      const rates = [...(ctx.question || "").matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m => Number(m[1]));
      if (supplied && (!rates.includes(v.factor) || v.factor < 0 || v.factor > 100)) throw Error("The assumed show-up percentage must be supplied in the question and between 0 and 100.");
      const rate = supplied ? L(v.factor)+"::numeric/100" : "b.showup";
      data = await scalar(`with m as materialized (select * from fn_campaign_metrics(${p}))
        select a.name,b.name reference,a.regs,a.registered_attendees,${rate} reference_rate,
        a.regs*(${rate}) projected,a.regs*(${rate})-a.registered_attendees gain
        from m a cross join m b where a.cid=${L(cid)} and b.cid=${L(v.to)}`);
      if (!data) throw Error("Choose two campaigns in this snapshot.");
      answer = data.gain == null ? "The reference campaign has no measurable show-up rate in this snapshot." :
        "At " + (supplied ? "the supplied " : data.reference + "'s ") + pct(data.reference_rate) + " show-up rate, " + data.name + "'s " +
        num(data.regs) + " registrations would yield about " + num(data.projected) + " registered attendees versus " +
        num(data.registered_attendees) + " observed, a change of " + num(data.gain) + ". This assumes unchanged registrations.";
    } else if (v.operation === "remaining_budget") {
      data = await scalar(`select k.budget-k.spend remaining_budget,m.name,m.cpa,
        greatest(0,k.budget-k.spend)/nullif(m.cpa,0) projected
        from fn_kpis(${p}) k left join lateral (select name,cpa from fn_campaign_metrics(${p})
        where cid is not null and cpa>0 order by cpa,name limit 1) m on true`);
      answer = data.remaining_budget == null ? "There is no approved budget for this snapshot." :
        data.remaining_budget <= 0 ? "No unspent approved budget remains." :
        money(data.remaining_budget) + " remains. " + (data.projected == null ? "There is no measured positive campaign CPA to use." :
        "At " + data.name + "'s measured ₹" + numDecimal(data.cpa) + " per attendee, that could fund about " + num(data.projected) +
        " additional attendees. This linear estimate assumes the same marginal cost. Diminishing returns could reduce the gain.");
    } else throw Error("Choose remove_campaign with a campaign, match_showup with a source and reference, or remaining_budget.");
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
  } else if (name === "calculate_scenario") {
    const eligible = ["attendees","regs","identified","confirmed","spend","sessions"];
    if (!eligible.includes(v.metric) || !["multiply","divide"].includes(v.operation)) throw Error("Choose a supported base metric and multiply or divide.");
    if (!Number.isFinite(v.factor) || v.factor < 0 || (v.operation === "divide" && v.factor === 0)) throw Error("Supply a valid scenario factor.");
    const question = ctx.question || "";
    if (!/\b(?:per|each|every|at|factor|times|multiply|multiplied|divide|divided|rate of)\b|\/\s*(?:usd|visitor|person|attendee)/i.test(question))
      throw Error("Use a scenario only for an explicit rate or multiplier. Use calculate for literal arithmetic.");
    const factors = question.replace(/\bday\s+\d+|\b20\d\d-\d\d-\d\d\b/gi,"").replace(/(?<=\d),(?=\d)/g,"").match(/(?<![\w.])[-+]?\d+(?:\.\d+)?/g) || [];
    if (!factors.some(x => Number(x) === v.factor)) throw Error("Ask the user for the rate. Scenario factors must be supplied in the current question.");
    const source = cid ? "fn_campaign_metrics("+p+") where cid="+L(cid) : "fn_kpis("+p+")";
    const op = v.operation === "multiply" ? "*" : "/";
    data = await scalar("select "+v.metric+" as base,"+L(v.factor)+"::numeric as factor,"+v.metric+op+L(v.factor)+"::numeric as result from "+source);
    if (!data) throw Error("No matching campaign for the scenario.");
    tag = "Assumption / estimate";
    answer = "Using the supplied factor " + v.factor + ", " + v.metric + " of " + num(data.base) + " " +
      (v.operation === "divide" ? "divided by" : "multiplied by") + " that factor gives " +
      new Intl.NumberFormat("en-IN",{maximumFractionDigits:2}).format(data.result) + " (conditional estimate).";
  } else if (name === "calculate") {
    const result = arithmetic(v.expression);
    data = { expression: String(v.expression), result: Number(result.toFixed(4)) };
    tag = "Calculation";
    answer = (v.label ? v.label + ": " : "") + String(v.expression).replace(/\s+/g, " ") + " = " + numDecimal(data.result) + ".";
  } else if (name === "describe_task_workflow") {
    data = {draft_saved_as_task:false, confirmation_required:true, completion_applies_proposal:true};
    answer = "A task request produces a draft for review. Confirm saves it to the task manager. Applying a proposed campaign change requires confirmation on completion. This explanation creates no draft or task.";
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
    data = {
      history: await scalar("select history_start,history_end,event_starts_at,event_ends_at from clean_event limit 1"),
      fields: await rows("select source_table,field,meaning from data_dictionary order by rid"),
      interpretation: "Admission timestamps identify observed entries. Campaign attribution is observational. Simulated transfers do not record executed interventions. External live feeds are unavailable.",
    };
    answer =
      "The data can't answer this. " +
      (v.reason === "forecast"
        ? "Future attendance is a forecast. The 2027 plan and its assumptions can provide a range."
        : measurementLimit(ctx.question || "") || "The requested measure cannot be established from the available source fields. I can compare verified attendance and marketing spend by campaign.");
    tag = "Not in data";
    if (!v.reason) {
      tag = "Data";
      answer = "The workbook dictionary lists the available source fields and their meanings.";
    }
    if (v.reason === "ungrounded") {
      answer = "The provider did not return evidence for this question. Try naming the metric, campaign or date.";
    }
    if (v.reason === "projected_spend") {
      answer = "Future marketing spend cannot be determined from posted ledger entries and task status. Pausing a campaign does not reverse its posted costs. A spend forecast needs planned daily spend and an end date for each active campaign.";
    }
  } else if (name === "get_change_log") {
    data = await rows(
      "select at,actor,entity,key,before,after from growth_audit.log " +
        "where id>=(select coalesce(max(id),0) from growth_audit.log where entity='reset') " +
        (v.since ? "and at>=" + L(v.since) + "::timestamptz " : "") +
        "order by id desc limit 15",
    );
    const diff = (x) => {
      const before = x.before || {}, after = x.after || {};
      if (!x.before) return "added";
      if (!x.after) return "deleted";
      const changed = Object.keys({ ...before, ...after }).filter(k => k !== "rid" && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
      return changed.slice(0, 4).map(k => k + " " + (before[k] ?? "—") + " → " + (after[k] ?? "—")).join(", ") || "no field change";
    };
    data = data.map(x => ({ at: x.at, actor: x.actor, entity: x.entity, key: x.key, change: diff(x) }));
    answer = data
      .map((x) => x.at + " · " + x.actor + " · " + x.entity + " " + x.key + " · " + x.change)
      .join("\n") || "No logged edits in that period.";
  } else if (name === "list_tasks") {
    data = await rows(
      "select * from tasks where true" +
        (v.owner ? " and owner=" + L(v.owner) : "") +
        (v.status === "open" ? " and status<>'done'" : v.status ? " and status="+L(v.status) : "") +
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
// Evaluates + - * / and parentheses over plain numbers without eval().
export function arithmetic(expression) {
  const text = String(expression || "").replace(/(?<=\d),(?=\d)/g, "").replace(/[×x]/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!text.trim() || text.length > 300 || /[^\d.+\-*/()\s]/.test(text)) throw Error("Use numbers with + - * / and parentheses only.");
  const tokens = text.match(/\d+(?:\.\d+)?|\.\d+|[-+*/()]/g) || [];
  let i = 0;
  const peek = () => tokens[i], next = () => tokens[i++];
  function factor() {
    const t = next();
    if (t === "-") return -factor();
    if (t === "+") return factor();
    if (t === "(") {
      const value = sum();
      if (next() !== ")") throw Error("Unbalanced parentheses.");
      return value;
    }
    if (t == null || !/^[\d.]/.test(t)) throw Error("Incomplete expression.");
    return Number(t);
  }
  function product() {
    let value = factor();
    while (peek() === "*" || peek() === "/") {
      const op = next(), right = factor();
      if (op === "/" && right === 0) throw Error("Division by zero.");
      value = op === "*" ? value * right : value / right;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (peek() === "+" || peek() === "-") value = next() === "+" ? value + product() : value - product();
    return value;
  }
  const value = sum();
  if (i !== tokens.length || !Number.isFinite(value)) throw Error("Could not evaluate the expression.");
  return value;
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

// Cost per attendee (or registration) moves only through its numerator and denominator, so a cost
// change is explained by spend and attendee changes: against the previous snapshot and against the
// original workbook (data edits since the last reset).
async function explainCost(metric, d, a, cid, days) {
  const earlier = new Date(Date.parse(d + "T00:00:00Z") - days * 86400000).toISOString().slice(0, 10);
  const denominator = metric === "cpr" ? "regs" : "attendees";
  const noun = metric === "cpr" ? "registrations" : cid ? "attributed attendees" : "attendees";
  const unit = metric === "cpr" ? "registration" : "attendee";
  const label = "cost per " + unit;
  const snapshot = (dt) => cid
    ? scalar("select name,spend,attendees,regs from fn_campaign_metrics(" + args(dt, a) + ") where cid=" + L(cid))
    : scalar("select 'Overall' as name,spend,attendees,regs from fn_kpis(" + args(dt, a) + ")");
  const before = await snapshot(earlier), after = await snapshot(d);
  if (!after) throw Error("Choose a campaign in this snapshot.");
  const edited = "coalesce(after->>'activity_date',after->>'occurred_at',after->>'registered_at',after->>'effective_at'," +
    "before->>'activity_date',before->>'occurred_at',before->>'registered_at',before->>'effective_at')";
  const edits = await scalar(
    "select count(*) filter(where entity='raw_marketing') spend_rows," +
      "coalesce(sum(coalesce((after->>'marketing_spend_inr')::numeric,0)-coalesce((before->>'marketing_spend_inr')::numeric,0)) filter(where entity='raw_marketing'),0) spend_delta," +
      "count(*) filter(where entity<>'raw_marketing') other_rows,(array_agg(actor order by id desc))[1] actor " +
      "from growth_audit.log where id>(select coalesce(max(id),0) from growth_audit.log where entity='reset') " +
      "and entity in ('raw_marketing','raw_checkins','raw_registrations','raw_history') " +
      "and coalesce((" + edited + ")::timestamptz::date," + L(d) + "::date)<=" + L(d) + "::date" +
      (cid ? " and coalesce(after->>'campaign_id',before->>'campaign_id')=" + L(cid) : ""),
  );
  const ratio = (s, n) => (Number(n) > 0 ? Number(s) / Number(n) : null);
  const rupee = (x) => (x == null ? "undefined" : (x < 0 ? "−₹" : "₹") + numDecimal(Math.abs(x)));
  const signed = (x, f) => (x > 0 ? "+" : "") + f(x);
  const s0 = Number(before?.spend ?? 0), s1 = Number(after.spend),
    n0 = Number(before?.[denominator] ?? 0), n1 = Number(after[denominator]);
  const c0 = ratio(s0, n0), c1 = ratio(s1, n1);
  const spendEffect = n0 > 0 ? (s1 - s0) / n0 : null,
    countEffect = n0 > 0 && n1 > 0 ? s1 / n1 - s1 / n0 : null;
  const lines = [
    after.name + " " + label + ": " + rupee(c0) + " on " + when(earlier) + " → " + rupee(c1) + " on " + when(d) + ".",
    "Net spend " + money(s0) + " → " + money(s1) + " (" + (s1 === s0 ? "no change" : signed(s1 - s0, money)) + "); " +
      noun + " " + num(n0) + " → " + num(n1) + " (" + (n1 === n0 ? "no change" : signed(n1 - n0, num)) + ").",
  ];
  if (c0 != null && c1 != null && c0 !== c1)
    lines.push("The spend change accounts for " + signed(spendEffect, rupee) + " per " + unit +
      " and the change in " + noun + " for " + signed(countEffect, rupee) + ".");
  const delta = Number(edits.spend_delta), spendRows = Number(edits.spend_rows), otherRows = Number(edits.other_rows);
  if (spendRows || otherRows) {
    let text = "Data edits since the last reset" + (cid ? " for this campaign" : "") + ": " +
      num(spendRows) + " marketing row" + (spendRows === 1 ? "" : "s") + " (net spend " + (delta ? signed(delta, money) : "unchanged") + ")";
    if (otherRows) text += " and " + num(otherRows) + " registration or check-in row" + (otherRows === 1 ? "" : "s");
    text += ", latest by " + edits.actor + ".";
    if (delta && !otherRows)
      text += " Against the original workbook, spend is " + money(s1 - delta) + " → " + money(s1) + " at " + num(n1) + " " + noun +
        ", so " + label + " is " + rupee(ratio(s1 - delta, n1)) + " → " + rupee(c1) + ".";
    lines.push(text);
  }
  return {
    data: { metric, from: earlier, to: d, before, after, spend_effect: spendEffect, count_effect: countEffect, edits },
    answer: lines.join("\n"),
  };
}
