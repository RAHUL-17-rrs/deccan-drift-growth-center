const evidenceTag = /^\[(Data|Calculation|Assumption \/ estimate|Not in data)\]\s*/i;
// Models sometimes stack extra labels ("[Data] [Conclusion] …") or repeat a tag mid-sentence.
// Any bracketed label other than a bare citation, e.g. "[Explanation]", "[Interpretation]" or "[Data E1]".
const strayTag = /\s*\[(?!E\d+\])[A-Za-z][A-Za-z /-]{1,30}(?:\s+E\d+)?\]\s*/g;
const citation = /\[E(\d+)\]/gi;
const isoDate = /\b\d{4}-\d{2}-\d{2}\b/g;
const fractionalField = /share|rate|showup|conversion|pacing|attainment|budget_used|ctr|percent/;
// Counting words such as "Day 1", "both 2 days" or "the second of 2 campaigns" carry no measured claim.
const trivial = new Set([0, 1, 2]);

export function numbers(text) {
  const normalized = String(text)
    .replace(/[०-९]/g, digit => digit.charCodeAt(0) - 0x966)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replaceAll("−", "-");
  return [...normalized.matchAll(/(?<![\w.])([-+]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([Ll]akhs?|[Cc]rores?|thousand|[kK]|L)\b)?(\s*%)?/g)]
    .map(([, digits, unit = "", percent]) => {
      const scale = /^(?:lakh|L$)/i.test(unit) ? 100000 : /^crore/i.test(unit) ? 10000000 : unit ? 1000 : 1;
      return { value: Number((Number(digits) * scale).toFixed(6)), percent: Boolean(percent) };
    });
}

function addValue(set, value) {
  for (const precision of [0, 1, 2]) {
    const rounded = Number(value.toFixed(precision));
    set.add(rounded);
    set.add(Math.abs(rounded));
  }
  set.add(value);
  set.add(Math.abs(value));
}

export function sourceValues(source) {
  const values = new Set();
  const percentages = new Set();
  const dates = new Set();
  function collectText(text) {
    for (const date of String(text || "").match(isoDate) || []) dates.add(date);
    for (const { value, percent } of numbers(String(text || "").replace(isoDate, ""))) {
      addValue(percent ? percentages : values, value);
    }
  }
  function collectData(value, key) {
    if (typeof value === "number") {
      addValue(values, value);
      if (fractionalField.test(key)) addValue(percentages, value * 100);
    } else if (Array.isArray(value)) {
      values.add(value.length);
      for (const item of value) collectData(item, key);
    } else if (value && typeof value === "object") {
      for (const [field, item] of Object.entries(value)) collectData(item, field);
    } else if (typeof value === "string" && /^\d{4}-\d\d-\d\d/.test(value)) {
      dates.add(value.slice(0, 10));
    } else if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
      collectData(Number(value), key);
    }
  }
  collectText(source.answer);
  if (source.parameters?.as_of) dates.add(source.parameters.as_of);
  collectData(source.data, "");
  return { values, percentages, dates };
}

// Values the user wrote may be restated (to confirm or correct them) without becoming evidence.
function questionValues(question) {
  const values = new Set(), percentages = new Set();
  for (const { value, percent } of numbers(String(question || "").replace(isoDate, ""))) addValue(percent ? percentages : values, value);
  return { values, percentages, dates: new Set(String(question || "").match(isoDate) || []) };
}

/**
 * Check that every numeric claim in a drafted reply is traceable to the evidence it cites.
 * Returns { answer } when the reply is grounded, otherwise { problems } describing each failure
 * so the model can repair its draft.
 */
export function checkReply(text, calls, question = "") {
  if (!calls.length) return { problems: ["No tool evidence was gathered. Call a tool before answering."] };
  if (!text?.trim()) return { problems: ["The reply was empty. Write the answer for the user."] };
  const sources = calls.map(sourceValues);
  const asked = questionValues(question);
  const paragraphs = [], problems = [];
  for (const line of text.trim().split(/\n+/)) {
    if (!line.trim()) continue;
    const refs = [...new Set([...line.matchAll(citation)].map(match => Number(match[1]) - 1))];
    const statement = line.replace(citation, "").trim();
    const tag = evidenceTag.exec(statement);
    const prose = statement.slice(tag?.[0].length || 0).replace(strayTag, " ").replace(/\s{2,}/g, " ").trim();
    if (!prose || /^[-*•\s]*$/.test(prose)) continue;
    const bad = refs.filter(index => !sources[index]);
    if (bad.length) {
      problems.push("“" + prose.slice(0, 60) + "…” cites " + bad.map(i => "E" + (i + 1)).join(", ") + ", which does not exist.");
      continue;
    }
    const claims = numbers(prose.replace(isoDate, "")).filter(({ value, percent }) => percent || !trivial.has(value));
    const dates = prose.match(isoDate) || [];
    if (!refs.length && calls.length === 1) refs.push(0);
    if (!refs.length && (claims.length || dates.length)) {
      problems.push("“" + prose.slice(0, 60) + "…” states numbers without citing the tool result that contains them.");
      continue;
    }
    const label = tag ? tag[1] : refs.length ? calls[refs[0]].tag : "Not in data";
    // Only measured evidence may support numerical claims labeled as observations.
    const observed = /^(data|calculation)$/i.test(label);
    const eligible = refs.filter(i => !observed || /^(data|calculation)$/i.test(calls[i].tag));
    if (refs.length && !eligible.length) {
      problems.push("“" + prose.slice(0, 60) + "…” is labelled [" + label + "] but only cites estimates. Label it [Assumption / estimate].");
      continue;
    }
    const missing = /^not in data$/i.test(label);
    const unsupported = [];
    // A real ledger amount can never establish receipts; a cost cannot express a rate.
    if (observed && /(?:cancellation|click[- ]through|click[- ]to[- ]open|opt[- ]out) rate\s*(?:(?:is|was|of|at|equals)\s*|[:=]\s*)?(?:₹|INR\s*|Rs\.?\s*)\d/i.test(prose)) {
      problems.push("A rate needs a numerator and denominator and must be expressed as a percentage. Use get_channel_measure.");
      continue;
    }
    if (observed && /\bsponsors?\s+(?:paid|contributed|gave|provided)\s+(?:us\s+)?(?:₹|INR\s*|Rs\.?\s*|\d)|\b(?:sponsorship|sponsor|ticket) (?:receipts|revenue|income)\s+(?:(?:was|were|is|totalled|totaled|of)\s+)?(?:₹|INR\s*|Rs\.?\s*|\d)/i.test(prose)) {
      problems.push("The workbook measures outbound marketing costs. Report sponsorship or ticket receipts as unavailable.");
      continue;
    }
    for (const date of dates) {
      if (!eligible.some(i => sources[i].dates.has(date)) && !asked.dates.has(date)) unsupported.push(date);
    }
    for (const { value, percent } of claims) {
      if (eligible.some(i => (percent ? sources[i].percentages : sources[i].values).has(value))) continue;
      if ((!observed || /\b(?:you (?:asked|mentioned|supplied)|your (?:example|assumption)|claimed|quoted|slide says)\b/i.test(prose))
          && (percent ? asked.percentages : asked.values).has(value)) continue;
      // Allow the requested year to identify an unavailable historical comparison.
      if (missing && !percent && Number.isInteger(value) && value >= 1900 && value <= 2100) continue;
      // A year in prose may refer to a cited ISO date.
      if (!percent && eligible.some(i => [...sources[i].dates].some(date => date.startsWith(value + "-")))) continue;
      unsupported.push(value + (percent ? "%" : ""));
    }
    if (unsupported.length) {
      problems.push("“" + prose.slice(0, 60) + "…” contains " + unsupported.join(", ") +
        ", which " + (unsupported.length > 1 ? "are" : "is") + " not in the cited results (" +
        refs.map(i => "E" + (i + 1)).join(", ") + "). Cite the result that contains each value, compute derived values with the calculate tool, or remove them.");
      continue;
    }
    paragraphs.push("[" + label + "] " + prose + (refs.length ? " " + refs.map(i => "[E" + (i + 1) + "]").join(" ") : ""));
  }
  if (problems.length) return { problems };
  return paragraphs.length ? { answer: paragraphs.join("\n\n") } : { problems: ["The reply had no content."] };
}

export function groundedReply(text, calls, question) {
  return checkReply(text, calls, question).answer || null;
}
