import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { challenges } from "../eval/challenges.mjs";

process.env.GROWTH_TEST = "1";
if (process.argv.includes("--local")) process.env.COPILOT_PROVIDER = "local";
const { chat, modelMode } = await import("../lib/copilot.mjs");
const { scalar } = await import("../lib/db.mjs");
const { seed } = await import("./seed.mjs");

const reportDate = "2025-04-20";
const actor = "Pranit";

// Conversation and evidence-trace writes are routine. User-facing business records
// and draft previews must stay untouched throughout these informational scenarios.
async function businessState() {
  return scalar(
    "select (select count(*) from drafts) drafts, (select count(*) from tasks) tasks, " +
      "(select coalesce(max(id),0) from growth_audit.log) audit_id",
  );
}

function answerNumbers(answer) {
  // Accept Indian grouping, Devanagari digits, normal rounding and amounts in lakhs.
  const normalized = answer
    .replace(/[०-९]/g, (x) => String(x.charCodeAt(0) - 0x966))
    .replace(/(?<=\d),(?=\d)/g, "")
    .replaceAll("−", "-");
  return [
    ...normalized.matchAll(
      /(?<![\w.])([-+]?\d+(?:\.\d+)?)(?:\s*(lakhs?|crores?|thousand|k)\b)?/gi,
    ),
  ].map(([, digits, suffix = ""]) => {
    const unit = suffix.toLowerCase();
    const multiplier = unit.startsWith("lakh")
      ? 100000
      : unit.startsWith("crore")
        ? 10000000
        : unit
          ? 1000
          : 1;
    return Number(digits) * multiplier;
  });
}

function misses(checks, response) {
  const prose = response.answer
    .replace(/\[(Data|Calculation|Not in data)\]/gi, "")
    .replace(/[’‘]/g, "'")
    .replace(/(?<=\d),(?=\d)/g, "");
  const numbers = answerNumbers(prose);
  return checks
    .filter((check) => {
      if ("value" in check)
        return !numbers.some(
          (n) => Math.abs(n - check.value) <= check.tolerance + 1e-8,
        );
      if (check.absent) return check.absent.test(prose);
      return !check.pattern.test(prose);
    })
    .map((check) => check.label);
}

async function runCase(item, mode) {
  const turns = [],
    gaps = [];
  const attribution = item.attribution || "registration";
  const before = await businessState();
  let conversation, executionError;
  for (const turn of item.turns) {
    try {
      // The UI date stays fixed. A date in a question or follow-up must be resolved
      // by the copilot without seeing the expected scope or the grading criteria.
      const response = await chat(
        {
          question: turn.question,
          conversation,
          as_of: reportDate,
          attribution,
        },
        actor,
      );
      const expectedDate = turn.asOf || item.asOf || reportDate;
      const turnGaps = misses(turn.checks, response);
      if (response.scope.as_of !== expectedDate)
        turnGaps.push("Use the " + expectedDate + " scope");
      if (response.scope.attribution !== attribution)
        turnGaps.push("Use " + attribution + " attribution");
      if (response.scope.mode !== mode)
        turnGaps.push("Use the selected provider");
      if (!response.calls.length)
        turnGaps.push("Provide a traceable source or scope check");
      if (
        !response.conversation ||
        (conversation && response.conversation !== conversation)
      )
        turnGaps.push("Keep the conversation identity");
      if (response.draft)
        turnGaps.push("Do not offer an unrequested task draft");
      gaps.push(
        ...turnGaps.map((gap) => "Turn " + (turns.length + 1) + ": " + gap),
      );
      turns.push({
        question: turn.question,
        answer: response.answer,
        scope: response.scope.as_of,
        attribution: response.scope.attribution,
        tools: response.calls.map((c) => c.tool),
      });
      conversation = response.conversation;
    } catch (e) {
      executionError = e.cause?.code
        ? e.message + " (" + e.cause.code + ")"
        : e.message;
      turns.push({ question: turn.question, error: executionError });
      break;
    }
  }
  const after = await businessState();
  if (before.drafts !== after.drafts)
    gaps.push(
      "Persisted draft count changed by " + (after.drafts - before.drafts),
    );
  if (before.tasks !== after.tasks || before.audit_id !== after.audit_id)
    gaps.push("A business record was changed");
  const status = executionError ? "Error" : gaps.length ? "Fail" : "Pass";
  return { item, turns, gaps, status, executionError };
}

function md(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replace(/\r?\n/g, "<br>");
}

function promptSheet() {
  const lines = [
    "# Growth Copilot reviewer questions",
    "",
    "Use a freshly seeded test workspace. Set the date picker to 20 April 2025. Start a new chat for each numbered scenario. Send follow-ups in the same chat and leave the date picker alone. Use registration attribution unless another mode is specified.",
    "",
    "Record the answer, its evidence and any change to the task board before opening the results. The exchange rate, sponsor offer and agency or press claims in these prompts are hypothetical.",
  ];
  let currentGroup;
  for (const [index, item] of challenges.entries()) {
    if (item.group !== currentGroup) {
      currentGroup = item.group;
      lines.push("", "## " + currentGroup);
    }
    lines.push("", "### " + (index + 1) + ". " + item.id);
    if (item.attribution)
      lines.push("", "Select **" + item.attribution + "** attribution.");
    for (const [turn, step] of item.turns.entries()) {
      lines.push("", (turn ? "**Follow-up.** " : "") + step.question);
    }
  }
  return lines.join("\n") + "\n";
}

function render(results, mode) {
  const passed = results.filter((x) => x.status === "Pass").length;
  const errors = results.filter((x) => x.status === "Error").length;
  const skipped = results.filter((x) => x.status === "Not run").length;
  const graded = results.length - errors - skipped;
  const groups = [...new Set(results.map((x) => x.item.group))];
  const lines = [
    "# Growth Copilot challenge evaluation",
    "",
    "Provider mode: **" +
      mode +
      "**. Fresh workbook fixtures in the isolated growth_test database.",
    "",
    (graded
      ? "**" + passed + " / " + graded + " graded scenarios passed**"
      : "**No answer-quality score is available**") +
      " across " +
      results.reduce((n, r) => n + r.turns.length, 0) +
      " executed chat turns. " +
      (graded - passed) +
      " failed their acceptance checks, " +
      errors +
      " had execution errors and " +
      skipped +
      " were not run.",
    "",
    "Each scenario starts a new conversation. Follow-ups reuse its ID. The checks examine the visible answer, scope, evidence trace and database side effects. Mixed questions require both a grounded answer and a useful qualification. The supplied exchange rate and sponsor fee are fictional assumptions. No case uses an external lookup or requires knowledge of a live score, rate or competitor result.",
    "",
    "| Area | Pass | Fail | Error | Not run |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const group of groups) {
    const subset = results.filter((x) => x.item.group === group);
    lines.push(
      "| " +
        [
          group,
          ...["Pass", "Fail", "Error", "Not run"].map(
            (s) => subset.filter((x) => x.status === s).length,
          ),
        ].join(" | ") +
        " |",
    );
  }
  lines.push(
    "",
    "Numeric checks allow the stated rounding. Wording checks use patterns, so a human can use the transcripts to review equivalently worded answers or accidental matches. A transport or runtime error is reported separately from an incorrect answer.",
  );
  for (const group of groups) {
    lines.push("", "## " + group);
    for (const { item, turns, gaps, status } of results.filter(
      (x) => x.item.group === group,
    )) {
      lines.push(
        "",
        "### " + item.id + " · " + status,
        "",
        "**Expected.** " + md(item.expected),
      );
      for (const turn of turns) {
        lines.push("", "**Question.** " + md(turn.question));
        if (turn.error)
          lines.push("", "**Execution error.** " + md(turn.error));
        else
          lines.push(
            "",
            "**Observed.** " + md(turn.answer),
            "",
            "**Evidence.** " +
              md(turn.tools.join(", ")) +
              " · " +
              turn.scope +
              " · " +
              turn.attribution,
          );
      }
      if (gaps.length)
        lines.push("", "**Unmet checks.** " + gaps.map(md).join(" · "));
    }
  }
  return lines.join("\n") + "\n";
}

export async function evaluateChallenges({ freshlySeeded = false } = {}) {
  if (!freshlySeeded) await seed();
  const mode = modelMode();
  const results = [];
  let unavailable;
  try {
    for (const item of challenges) {
      if (unavailable) {
        results.push({ item, turns: [], gaps: [], status: "Not run" });
        continue;
      }
      const result = await runCase(item, mode);
      results.push(result);
      console.log(
        result.status.toUpperCase(),
        item.id,
        result.executionError || result.gaps.join("; "),
      );
      if (
        mode !== "local" &&
        result.executionError &&
        /fetch failed \(EACCES\)|returned HTTP (401|403)\b/.test(
          result.executionError,
        )
      ) {
        unavailable = true;
        console.log(
          "Provider unavailable; remaining scenarios will be recorded as not run.",
        );
      }
    }
  } finally {
    await seed();
  }
  const file = "eval/challenge-results-" + mode + ".md";
  fs.mkdirSync("eval", { recursive: true });
  fs.writeFileSync("eval/reviewer-questions.md", promptSheet());
  fs.writeFileSync(file, render(results, mode));
  const passed = results.filter((x) => x.status === "Pass").length;
  const graded = results.filter(
    (x) => x.status === "Pass" || x.status === "Fail",
  ).length;
  console.log(
    (graded
      ? passed + "/" + graded + " graded challenge scenarios passed"
      : "No gradable model replies") +
      " (" +
      mode +
      "). " +
      file,
  );
  if (passed !== results.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await evaluateChallenges();
