const evidenceTag = /^\[(Data|Calculation|Assumption \/ estimate|Not in data)\]\s*/i;
const citation = /\[E(\d+)\]/gi;
const isoDate = /\b\d{4}-\d{2}-\d{2}\b/g;
const fractionalField = /share|rate|showup|conversion|pacing|attainment|budget_used/;

function numbers(text) {
  const normalized = String(text)
    .replace(/[०-९]/g, digit => digit.charCodeAt(0) - 0x966)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replaceAll("−", "-");
  return [...normalized.matchAll(/(?<![\w.])([-+]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*(lakhs?|crores?|thousand|k)\b)?(\s*%)?/gi)]
    .map(([, digits, unit = "", percent]) => {
      const scale = /^lakh/i.test(unit) ? 100000 : /^crore/i.test(unit) ? 10000000 : unit ? 1000 : 1;
      return { value: Number(digits) * scale, percent: Boolean(percent) };
    });
}

function sourceValues(source) {
  const values = new Set();
  const percentages = new Set();
  const dates = new Set();
  function collectText(text) {
    for (const date of text.match(isoDate) || []) dates.add(date);
    for (const { value, percent } of numbers(text.replace(isoDate, ""))) {
      (percent ? percentages : values).add(value);
    }
  }
  function collectData(value, key) {
    if (typeof value === "number") {
      for (const precision of [0, 1, 2]) {
        values.add(Number(value.toFixed(precision)));
        if (fractionalField.test(key)) percentages.add(Number((value * 100).toFixed(precision)));
      }
      values.add(value);
    } else if (value && typeof value === "object") {
      for (const [field, item] of Object.entries(value)) collectData(item, field);
    } else if (typeof value === "string" && /^\d{4}-\d\d-\d\d/.test(value)) {
      dates.add(value.slice(0, 10));
    }
  }
  collectText(source.answer);
  if (source.parameters?.as_of) dates.add(source.parameters.as_of);
  collectData(source.data, "");
  return { values, percentages, dates };
}

export function groundedReply(text, calls, question) {
  if (!calls.length || !text?.trim()) return null;
  const sources = calls.map(sourceValues);
  const paragraphs = [];
  for (const line of text.trim().split(/\n+/)) {
    if (!line.trim()) continue;
    const refs = [...new Set([...line.matchAll(citation)].map(match => Number(match[1]) - 1))];
    if (!refs.length && calls.length === 1) refs.push(0);
    if (!refs.length || refs.some(index => !sources[index])) return null;
    const statement = line.replace(citation, "").trim();
    const tag = evidenceTag.exec(statement);
    const label = tag ? tag[1] : calls[refs[0]].tag;
    const prose = statement.slice(tag?.[0].length || 0).trim();
    if (!prose) continue;

    // Only measured evidence may support numerical claims labeled as observations.
    const observed = /^(data|calculation)$/i.test(label);
    const eligible = refs.filter(i => !observed || /^(data|calculation)$/i.test(calls[i].tag));
    if (!eligible.length) return null;
    const missing = /^not in data$/i.test(label);
    for (const date of prose.match(isoDate) || []) {
      if (!eligible.some(i => sources[i].dates.has(date)) && !(missing && question.includes(date))) return null;
    }
    const numericProse = prose.replace(isoDate, "");
    for (const { value, percent } of numbers(numericProse)) {
      // Allow the requested year to identify an unavailable historical comparison.
      if (missing && !percent && Number.isInteger(value) && value >= 1900 && value <= 2100 && question.includes(String(value))) continue;
      if (eligible.some(i => (percent ? sources[i].percentages : sources[i].values).has(value))) continue;
      // A year in prose may refer to a cited ISO date.
      if (!percent && eligible.some(i => [...sources[i].dates].some(date => date.startsWith(value + "-")))) continue;
      return null;
    }
    paragraphs.push("[" + label + "] " + prose + " " + refs.map(i => "[E" + (i + 1) + "]").join(" "));
  }
  return paragraphs.length ? paragraphs.join("\n\n") : null;
}
