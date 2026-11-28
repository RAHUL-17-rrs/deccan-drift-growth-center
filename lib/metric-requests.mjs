import { measurementLimit } from "./evidence.mjs";

const exactMetrics = [
  ["click_to_open", /\b(?:email\s+)?(?:click[- ]to[- ]open(?:\s+rate)?|ctor)\b/i],
  ["ctr", /\b(?:ctr|click[- ]through(?:\s+rate)?)\b/i],
  ["cancellation", /\b(?:cancellation rate|cancel(?:led|ed) registration rate)\b/i],
  ["opt_out", /\b(?:opt(?:ed)?[- ]out(?:s| rate)?|unsubscrib(?:es|ed))\b/i],
  ["reach", /\b(?:reported |unique |total )?reach\b/i],
  ["cpa", /\b(?:cpa|cost per (?:attendee|visitor))\b/i],
  ["cpr", /\b(?:cpr|cost per (?:registration|sign[- ]?up))\b/i],
];

export function campaignMentions(text, campaigns) {
  const parts = text.toLowerCase().match(/[\p{L}\d]+/gu) || [];
  const words = " " + parts.join(" ") + " ";
  return campaigns.flatMap(c => {
    const names = [c.name, c.cid, c.alias].filter(Boolean).map(n => n.toLowerCase());
    const name = names.find(n => words.includes(" " + n + " ") || words.includes(" " + n + "s "));
    return name ? [{ ...c, matched: name }] : [];
  });
}

// Only take a direct path if the complete request fits the supported scope.
// Unrecognized qualifiers and compound analyses go through the provider.
export function metricRequests(question, info, owners) {
  const q = question.trim().toLowerCase().replace(/[’‘]/g, "'");
  const plan = (name, args = {}) => [[name, args]];
  if (/^(?:what(?:'s| has)? changed|show (?:me )?(?:the )?(?:changes|edits)) since (?:this morning|midnight|today)[?.!\s]*$/.test(q))
    return plan("get_change_log",{since:info.today+"T00:00:00+05:30"});
  if (/^(?:list|show)(?: me)? (?:all |the )?campaigns[?.!\s]*$/.test(q))
    return plan("compare_campaigns",{metric:"catalog"});
  if (info.last_campaign && /^who (?:owns|manages) (?:it|that campaign)[?.!\s]*$/.test(q))
    return plan("compare_campaigns",{metric:"catalog",campaign:info.last_campaign});
  if (info.last_owner && /^what else does (?:she|he|that owner|they) (?:own|manage)\b/.test(q))
    return plan("compare_campaigns",{metric:"catalog",owner:info.last_owner});
  if (info.last_tool === "get_targets" && /^(?:and |what about )?(?:a|one|two|\d+) (?:day|week)s? (?:earlier|later)[?.!\s]*$/.test(q))
    return plan("get_targets");
  if (/^(?:what(?:'s| is) (?:our |the )?|show (?:me )?)(?:projected|forecast) spend(?: now)?[?.!\s]*$/.test(q))
    return plan("describe_data",{reason:"projected_spend"});
  const amount = /^(?:(?:what(?:'s| is)|how much is|calculate|find|work out)\s+)?(-?\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+of\s+(?:(₹|rs\.?|inr)\s*)?(-?[\d,]+(?:\.\d+)?)(?:\s*(k|thousand|lakhs?|crores?))?[?!.\s]*$/i.exec(q);
  if (amount) {
    const scale = {k:1000, thousand:1000, lakh:100000, lakhs:100000, crore:10000000, crores:10000000}[amount[4]] || 1;
    return plan("calculate", {expression: amount[3].replaceAll(",", "") + (scale === 1 ? "" : " * " + scale) + " * " + amount[1] + " / 100", label: amount[2] ? "Amount in INR" : "Result"});
  }
  if (/\b(?:attend|come|turnout|attendance)\w*\b/.test(q) && /\b(?:next year|next edition|in 20\d\d)\b/.test(q) &&
      /\b(?:will|forecast|guess|predict|expected)\b/.test(q) && !/\b(?:vs|versus|compare|and)\b/.test(q)) {
    const year = q.match(/\bin (20\d\d)\b/)?.[1] || String(Number(info.today.slice(0,4))+1);
    if (year === "2027") return plan("get_plan_thresholds");
    return plan("describe_data", {reason: "forecast"});
  }
  if (measurementLimit(q) && !/\b(?:if|suppose|assuming|compare|versus|and|but|per|promise\w*|would we invoice)\b/.test(q) &&
      !/\b(?:how many|what was|what is|how much)\b.*\b(?:spend|cpa|cost per)\b/.test(q)) return plan("describe_data", {reason:"missing"});

  const found = campaignMentions(q, info.campaigns);
  if (info.last_campaign && /^why[?.!\s]*$/.test(q) && info.last_tool === "compare_campaigns")
    return plan("get_funnel",{campaign:info.last_campaign});
  if (found.length === 1 && /show[- ]up/.test(q) && /\b(?:clicks|sessions?)\b/.test(q) && !/\b(?:if|compare|versus|week|month|estimate|suppose)\b/.test(q))
    return plan("get_funnel",{campaign:found[0].cid});
  const threshold = /^(?:what|which) (?:%|percentage|share) of (?:our |total )?spend .*?\b(?:cpa|cost per attendee) (?:above|over|greater than)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)[?.!\s]*$/.exec(q);
  if (threshold && !found.length) return plan("compare_campaigns",{metric:"spend_above_cpa",amount:Number(threshold[1].replaceAll(",",""))});
  if (info.attribution === "registration" && !found.length && /\bwalk[- ]ins?\b/.test(q) &&
      /\b(?:how many|which campaign gets credit)\b/.test(q) && !/\b(?:if|cost|by day|spend|exclude|last week)\b/.test(q))
    return plan("get_kpis",{metric:"attendees"});
  if (info.as_of >= info.coverage.event_ends_at.slice(0,10) && /\bspend\b.*\b(?:down|drop|declin|fall)\w*\b.*\bafter (?:the )?(?:fest|event)\b/.test(q))
    return plan("get_spend",{compare_date:info.coverage.event_ends_at.slice(0,10),...(found.length===1 ? {campaign:found[0].cid} : {})});
  if (/\bregistration starts?\b/.test(q) && /\b(?:engagement|identified)\b/.test(q) && /\b(?:marketing|platform|anonymous)\b/.test(q) && found.length <= 1) {
    const scope = found[0] ? {campaign:found[0].cid} : {};
    return [["get_funnel",scope], ["get_engagement",{...scope,event_type:"registration_start"}]];
  }
  if (found.length && /\bopt[- ]outs?\b/.test(q) && /\b(?:most|problem|compare|rate)\b/.test(q) && !/\b(?:forecast|if|would|last week|monthly)\b/.test(q))
    return plan("get_channel_measure",{metric:"opt_out",by:"campaign"});
  if (found.length === 1 && /^(?:what if|suppose) we (?:had )?(?:never (?:run|ran)|hadn't run|had not run|removed|dropped)\s+/.test(q) &&
      q.replace(/[?.!]$/,"").endsWith(found[0].matched))
    return plan("estimate_campaign",{operation:"remove_campaign",campaign:found[0].cid});
  if (found.length === 2 && /\bshow[- ]up\b.+\b(?:as good as|matched|were the same as)\b/.test(q) &&
      !/\b(?:spend|budget|transfer|next year|weekly|monthly)\b/.test(q)) {
    const [subject,reference] = found.slice().sort((a,b) => q.indexOf(a.matched)-q.indexOf(b.matched));
    const supplied = q.match(/\((\d+(?:\.\d+)?)\s*%\)/);
    if (q.includes("%") && !supplied) return null;
    return plan("estimate_campaign",{operation:"match_showup",campaign:subject.cid,to:reference.cid,...(supplied ? {factor:Number(supplied[1])} : {})});
  }
  if (!found.length && /\b(?:budget.*(?:left|remain|unspent)|(?:leftover|remaining|unspent) budget)\b/.test(q) &&
      /\b(?:best|lowest|cheapest) (?:cpa|cost per attendee)\b/.test(q) && /\b(?:attendees|visitors|people)\b/.test(q) &&
      !/\b(?:if|except|excluding|double|percent)\b|[\d%]/.test(q))
    return plan("estimate_campaign",{operation:"remaining_budget"});
  if (!found.length) {
    if (/^(?:how many (?:people )?(?:re[- ]?entered|came back in)|what(?:'s| is) the average number of entries per attendee)[?.!\s]*$/.test(q))
      return plan("get_checkins",{by:"day"});
    if (/^(?:how many check[- ]?ins were (?:there|rejected)|how many denied (?:entries|check[- ]?ins))[?.!\s]*$/.test(q))
      return plan("get_checkin_audit");
    if (/^(?:scanner (?:vs\.?|versus) manual check[- ]?ins|how many (?:manual|scanner) check[- ]?ins)[?.!\s]*$/.test(q))
      return plan("get_checkins",{by:"source"});
    if (/\b(?:busiest|peak) check[- ]?in hour\b[?.!\s]*$/.test(q)) return plan("get_checkins",{by:"hour"});
    if (/^(?:did anyone who cancel(?:led|ed) still (?:show up|attend)|how many confirmed registrants (?:didn't|did not) (?:show up|attend))[?.!\s]*$/.test(q))
      return plan("get_status_mix");
    if (/^how many registrations did we have (?:as of|on) (?:\d{1,2} [a-z]+(?: 20\d\d)?|20\d\d-\d\d-\d\d)[?.!\s]*$/.test(q)) return plan("get_kpis",{metric:"regs"});
  }
  const owner = owners.find(o => q.split(/[^a-z]+/).includes(o.split(" ")[0].toLowerCase()));
  if ((owner || /\bowners?\b/.test(q)) && !/\b(?:task|tasks|would|if|hire|fire|weekly|monthly|between|except|excluding)\b/.test(q) &&
      /^(?:how(?:'s| is) [a-z ]+ doing|(?:rank|compare) (?:all |the )?owners? by (?:cpa|cost per attendee)|how many attendees did [a-z ']+ campaigns? bring)[?.!\s]*$/.test(q))
    return plan("compare_campaigns", {by:"owner",metric:"cpa",...(owner ? {owner} : {})});

  const match = exactMetrics.find(([,pattern]) => pattern.test(q));
  if (!match) return null;
  const [metric, pattern] = match;
  let rest = q.replace(pattern, " ");
  for (const c of found) {
    for (const name of [c.name, c.cid, c.matched]) rest = rest.replaceAll(name.toLowerCase(), " ");
  }
  rest = rest.replace(/\bis that how many people we reached\b/, " ")
    .replace(/\b(?:what|what's|whats|is|was|were|are|the|for|of|in|our|did|do|we|have|had|has|which|with|at|a|how|many|people|from|emails?|total|overall|blended|all|across|campaigns?|channels?|show|me|give|calculate|compare|by|each|versus|vs|and|highest|lowest|best|worst|rank|please|rate|s)\b/g, " ")
    .replace(/[\s?!'.,-]/g,"");
  if (rest || (!found.length && /\b(?:its|that campaign)\b/.test(q))) return null;
  const grouped = /\b(?:which|by|each|rank|highest|lowest|best|worst)\b/.test(q);
  const order = /\b(?:highest|worst)\b/.test(q) ? "desc" : "asc";
  if (["cpa","cpr"].includes(metric)) {
    if (!found.length && !grouped) return null;
    return (found.length ? found : [{}]).map(c => ["compare_campaigns", {metric,order,...(c.cid ? {campaign:c.cid} : {})}]);
  }
  return (found.length ? found : [{}]).map(c => ["get_channel_measure", {metric,
    ...(c.cid ? {campaign:c.cid} : grouped ? {by:"campaign"} : {}),
    ...(/\b(?:lowest|highest)\b/.test(q) ? {order} : {})}]);
}
