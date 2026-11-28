import { literal as L, rows } from "./db.mjs";
import { args } from "./service.mjs";

// Each rate keeps its source, numerator, denominator and units together for both
// provider tools and direct answers. Aggregate counts before calculating rates.
const measures = {
  ctr: { source: "marketing", numerator: "sum(clicks)", denominator: "sum(impressions)", units: ["clicks", "impressions"], label: "click-through rate" },
  reach: { source: "marketing", numerator: "sum(reported_reach)", units: ["reported reach observations"], label: "reported reach",
    note: "The same person may appear on multiple days or platforms. Unique people reached cannot be determined." },
  click_to_open: { source: "engagement", numerator: "count(*) filter (where event_type='nurture_email_clicked')", denominator: "count(*) filter (where event_type='nurture_email_opened')", units: ["email clicks", "opens"], label: "email click-to-open rate" },
  opt_out: { source: "engagement", numerator: "count(distinct person_id) filter (where event_type='opted_out')", denominator: "count(*) filter (where event_type='nurture_email_sent')", units: ["people who opted out", "email sends"], label: "opt-outs per send",
    note: "Engagement records do not give a reason for opting out." },
  cancellation: { source: "status", numerator: "count(*) filter (where status='cancelled')", denominator: "count(*)", units: ["cancelled registrations", "registrations"], label: "cancellation rate" },
};
export const channelMeasureNames = Object.keys(measures);
const count = new Intl.NumberFormat("en-IN", {maximumFractionDigits: 2});

export async function channelMeasure(v, d, a) {
  if (!Object.hasOwn(measures, v.metric)) throw Error("Choose a published channel measure.");
  const m = measures[v.metric];
  const p = args(d, a);
  const day = L(d) + "::date";
  const sources = {
    marketing: `select campaign_id cid,clicks,impressions,reported_reach from clean_marketing where activity_date<=${day}`,
    engagement: `select campaign_id cid,e.person_id,event_type from clean_engagement e join fn_people(${day}) p using(person_id) where e.occurred_at<cutoff(${day})`,
    status: `select r.cid,s.status from fn_regs(${p}) r left join fn_status(${p}) s using(registration_id)`,
  };
  const grouped = !!v.campaign || v.by === "campaign";
  const query = `with observations as (${sources[m.source]}),
    counts as (select ${grouped ? "cid," : ""} coalesce(${m.numerator},0) numerator
      ${m.denominator ? ", "+m.denominator+" denominator" : ""}
      from observations ${v.campaign ? "where cid="+L(v.campaign) : ""}
      ${grouped ? "group by cid" : ""})
    select ${grouped ? "c.campaign_name name,c.campaign_id cid," : ""}
      coalesce(numerator,0) numerator
      ${m.denominator ? ",coalesce(denominator,0) denominator,ratio(numerator,denominator) rate" : ""}
    from ${grouped ? "clean_campaigns c left join counts on counts.cid=c.campaign_id where c.created_at<cutoff("+day+")" : "counts"}
    ${grouped && v.campaign ? " and c.campaign_id="+L(v.campaign) : ""}
    order by ${m.denominator ? "rate" : "numerator"} ${v.order === "asc" ? "asc" : "desc"} nulls last${grouped ? ",name" : ""}`;
  const data = await rows(query);
  const answer = data.map(r => {
    const counts = count.format(r.numerator) + " " + m.units[0];
    const value = !m.denominator ? counts : counts + " / " + count.format(r.denominator) + " " + m.units[1] +
      (r.rate == null ? " (rate undefined)" : " = " + (r.rate * 100).toFixed(1) + "%");
    return (r.name || "Overall") + " · " + m.label + " · " + value;
  }).join("\n") || "No matching campaigns in this snapshot.";
  return { data, answer: answer + (m.note ? "\n" + m.note : "") };
}

