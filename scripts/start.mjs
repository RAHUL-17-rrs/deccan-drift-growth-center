import { spawn } from "node:child_process";
import { ensureDatabase, sql } from "../lib/db.mjs";
import { seed } from "./seed.mjs";
await ensureDatabase();
if (!(await sql("select to_regprocedure('growth.fn_kpis(date,text)')")))
  await seed();
const prod = process.argv.includes("--production");
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    prod ? "start" : "dev",
    ...(prod ? [] : ["--webpack"]),
    "-H",
    "127.0.0.1",
    "-p",
    process.env.PORT || "3000",
  ],
  { stdio: "inherit", windowsHide: true },
);
app.on("exit", (code) => process.exit(code ?? 0));
