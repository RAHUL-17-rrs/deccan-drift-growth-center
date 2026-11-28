import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ensureDatabase, sql, literal } from "../lib/db.mjs";

// Pre-extracted copy of the workbooks, used where Python is unavailable
// (e.g. a Vercel function handling "Reset to original").
const snapshot = path.join(process.cwd(), "sql", "seed-data.sql");

function extract() {
  const p = spawnSync(process.env.PYTHON || "python", ["scripts/extract.py"], {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (p.status === 0) return p.stdout;
  if (fs.existsSync(snapshot)) return fs.readFileSync(snapshot, "utf8");
  throw Error(p.stderr || p.error?.message || "Python extraction failed");
}

function csvRows(text) {
  const out = [];
  let row = [],
    field = "",
    quoted = false,
    q = false;
  const push = () => {
    row.push(field === "" && !quoted ? null : field);
    field = "";
    quoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') (q = true), (quoted = true);
    else if (c === ",") push();
    else if (c === "\n") push(), out.push(row), (row = []);
    else field += c;
  }
  if (field !== "" || row.length) push(), out.push(row);
  return out;
}

const quote = (v) => (v == null ? "NULL" : "'" + v.replace(/'/g, "''") + "'");

// The pg driver cannot stream psql's inline `COPY ... FROM STDIN` data, so
// rewrite each block as batched INSERTs.
function copyToInserts(script) {
  return script.replaceAll("\r\n", "\n").replace(
    /^COPY (\S+) \(([^)]*)\) FROM STDIN[^\n]*\n([\s\S]*?)^\\\.$/gm,
    (_, table, cols, data) => {
      const rows = csvRows(data);
      const parts = [];
      for (let i = 0; i < rows.length; i += 500)
        parts.push(
          "INSERT INTO " + table + " (" + cols + ") VALUES " +
            rows
              .slice(i, i + 500)
              .map((r) => "(" + r.map(quote).join(",") + ")")
              .join(",") +
            ";",
        );
      return parts.join("\n");
    },
  );
}

// The hosted demo starts with a few illustrative tasks so the task manager is not empty.
// Local and test databases start with an empty board, which the evaluation fixtures rely on.
const sampleTasks = () =>
  process.env.GROWTH_SAMPLE_TASKS === "1" ||
  (process.env.VERCEL && process.env.GROWTH_SAMPLE_TASKS !== "0");
const sampleTaskSql =
  "insert into tasks(title,description,owner,deadline,status,priority,campaign_id,created_by,actor,source) values " +
  "('Send reminder sequence to confirmed Creator Partners registrants','Sample task: Creator Partners show-up was 50%. Test a two-step reminder before the next event.','Nisha Rao',current_date+7,'todo','high','C03','user','Pranit','sample')," +
  "('Test a ₹99 refundable deposit on Paid Social sign-ups','Sample task: Paid Social had the most registrations but a 50% show-up rate.','Arjun Verma',current_date+14,'doing','normal','C02','user','Pranit','sample')," +
  "('Share College Partnerships playbook with Campus Ambassadors','Sample task: College Partnerships had the best show-up (85.6%).','Meera Iyer',current_date-3,'done','low','C04','user','Pranit','sample');";

export async function seed(user = "Local operator") {
  await ensureDatabase();
  let data = extract();
  if (process.env.VERCEL || process.env.GROWTH_DRIVER === "pg")
    data = copyToInserts(data);
  await sql(
    "begin; select pg_advisory_xact_lock(707132); create schema if not exists growth; set local search_path=growth,public; create schema if not exists growth_audit; create table if not exists growth_audit.log(id bigint generated always as identity primary key, at timestamptz default now(), actor text, entity text, key text, before jsonb, after jsonb); drop schema growth cascade; create schema growth; set local search_path=growth,public;\n" +
      data +
      "\n" +
      fs.readFileSync("sql/metrics.sql", "utf8") +
      "\n" +
      fs.readFileSync("sql/operations.sql", "utf8") +
      (sampleTasks() ? "\n" + sampleTaskSql : "") +
      "\ninsert into growth_audit.log(actor,entity,key) values (" +
      literal(user) +
      ", 'reset','original workbooks'); commit;",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await seed();
  console.log("Original workbooks loaded and metric functions installed.");
}
