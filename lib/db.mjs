import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

export const root = process.cwd();
for (const file of [".env.local", ".env"])
  if (fs.existsSync(file)) process.loadEnvFile(file);
const test = process.env.GROWTH_TEST === "1";
const cluster = path.join(root, ".growth-pg");
const port = process.env.GROWTH_PG_PORT || "55437";
const privateDir = path.join(root, ".local");
const passwordFile = path.join(privateDir, "pg-password");
const dbname = test ? "growth_test" : "growth_center";
function binary(name) {
  const win = path.join(
    process.env.ProgramFiles || "C:/Program Files",
    "PostgreSQL",
    "16",
    "bin",
    name + ".exe",
  );
  return process.env.PG_BIN
    ? path.join(process.env.PG_BIN, name)
    : fs.existsSync(win)
      ? win
      : name;
}
function auth() {
  if (process.env.DATABASE_URL && !test)
    return { args: [process.env.DATABASE_URL], env: {} };
  return {
    args: ["-h", "127.0.0.1", "-p", port, "-U", "growth"],
    env: {
      PGPASSWORD: fs.existsSync(passwordFile)
        ? fs.readFileSync(passwordFile, "utf8").trim()
        : "",
    },
  };
}
export function literal(x) {
  return x == null
    ? "NULL"
    : "convert_from(decode('" +
        Buffer.from(String(x)).toString("base64") +
        "','base64'),'UTF8')";
}
export function jsonArg(x) {
  return literal(JSON.stringify(x)) + "::jsonb";
}
// Hosted mode (e.g. Vercel + Neon): no psql binary is available, so use the
// pg driver and reproduce psql's `-qAt` text output (rows of every statement,
// columns joined by "|", raw text values, NULL as empty).
const hosted = () =>
  !test && !!process.env.DATABASE_URL && (process.env.VERCEL || process.env.GROWTH_DRIVER === "pg");
let pool;
async function driverSql(statement) {
  if (!pool) {
    const { default: pg } = await import("pg");
    pool = new pg.Pool({
      // Direct (unpooled) connection: evidence queries create temp tables in
      // one transaction and read them in the next, which a transaction-mode
      // pooler (PgBouncer) can route to a different backend.
      connectionString:
        process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
      max: 3,
      idleTimeoutMillis: 10000,
      types: { getTypeParser: () => (v) => v },
    });
  }
  const client = await pool.connect();
  try {
    const res = await client.query({
      text:
        "set timezone='Asia/Kolkata';set search_path=growth,public;set jit=off;set enable_nestloop=off;\n" +
        statement,
      rowMode: "array",
    });
    // psql ran each call in a fresh session; drop temp objects so a reused
    // pooled client does not let them shadow the real growth views.
    await client.query("discard temp");
    client.release();
    return (Array.isArray(res) ? res : [res])
      .flatMap((r) => (r.rows || []).map((row) => row.map((v) => v ?? "").join("|")))
      .join("\n")
      .trim();
  } catch (e) {
    client.release(true);
    throw new Error(("ERROR:  " + e.message).slice(0, 1200));
  }
}
export function sql(statement, admin = false) {
  if (hosted()) return driverSql(statement);
  const conn = auth(),
    local = test || !process.env.DATABASE_URL;
  const args = [
    ...conn.args,
    ...(local ? ["-d", admin ? "postgres" : dbname] : []),
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn(binary("psql"), args, {
      windowsHide: true,
      env: {
        ...process.env,
        ...conn.env,
        PGCLIENTENCODING: "UTF8",
        PGOPTIONS:
          "-c timezone=Asia/Kolkata -c search_path=growth,public -c jit=off -c enable_nestloop=off",
      },
    });
    let out = "",
      err = "";
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    proc.stdout.on("data", (s) => (out += s));
    proc.stderr.on("data", (s) => (err += s));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code
        ? reject(
            new Error(
              (err.match(/ERROR:[\s\S]*/)?.[0] || err)
                .replace(/CONTEXT:[\s\S]*/, "")
                .slice(0, 1200),
            ),
          )
        : resolve(out.trim()),
    );
    proc.stdin.on("error", () => {});
    proc.stdin.end(statement);
  });
}
export async function rows(statement) {
  return JSON.parse(
    await sql("select coalesce(json_agg(q),'[]') from (" + statement + ") q;"),
  );
}
export async function scalar(statement) {
  return JSON.parse(
    (await sql("select to_json(q) from (" + statement + ") q;")) || "null",
  );
}
export async function ensureDatabase() {
  if (process.env.DATABASE_URL && !test) {
    await sql("select 1");
    return;
  }
  fs.mkdirSync(privateDir, { recursive: true });
  if (!fs.existsSync(passwordFile))
    fs.writeFileSync(passwordFile, randomBytes(32).toString("hex"), {
      flag: "wx",
    });
  if (!fs.existsSync(path.join(cluster, "PG_VERSION"))) {
    const proc = spawnSync(
      binary("initdb"),
      [
        "-D",
        cluster,
        "-U",
        "growth",
        "--locale=C",
        "--encoding=UTF8",
        "--auth=scram-sha-256",
        "--pwfile=" + passwordFile,
      ],
      { windowsHide: true, encoding: "utf8" },
    );
    if (proc.status !== 0)
      throw Error(proc.stderr || "PostgreSQL initdb unavailable. Set PG_BIN.");
  }
  try {
    await sql("select 1", true);
  } catch {
    const proc = spawn(
      binary("postgres"),
      ["-D", cluster, "-p", port, "-h", "127.0.0.1"],
      {
        windowsHide: true,
        detached: true,
        stdio: [
          "ignore",
          fs.openSync(path.join(privateDir, "postgres.log"), "a"),
          fs.openSync(path.join(privateDir, "postgres.log"), "a"),
        ],
      },
    );
    proc.unref();
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await pause(250);
      try {
        await sql("select 1", true);
        ready = true;
        break;
      } catch {}
    }
    if (!ready)
      throw Error("Local PostgreSQL could not start. See .local/postgres.log.");
  }
  const hba = path.join(cluster, "pg_hba.conf"),
    rules = fs.readFileSync(hba, "utf8");
  if (/^host\s+.*\btrust\s*$/m.test(rules)) {
    await sql(
      "alter role growth password '" +
        fs.readFileSync(passwordFile, "utf8").trim() +
        "'",
      true,
    );
    fs.writeFileSync(
      hba,
      rules.replace(/^((?:host|local)\s+.*?)\btrust\s*$/gm, "$1scram-sha-256"),
    );
    await sql("select pg_reload_conf()", true);
  }
  if (
    !(await sql(
      "select 1 from pg_database where datname='" + dbname + "'",
      true,
    ))
  )
    await sql("create database " + dbname, true);
}
