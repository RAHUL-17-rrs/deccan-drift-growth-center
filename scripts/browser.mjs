import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
process.env.GROWTH_TEST = "1";
const { seed } = await import("./seed.mjs");
await seed();
const port = process.env.GROWTH_BROWSER_PORT || "3149",
  url = "http://127.0.0.1:" + port;
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", port],
  {
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, GROWTH_TEST: "1" },
  },
);
let browser, page;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await wait(300);
  }
  assert.ok(ready, "Build the app before running browser tests.");
  const chrome =
    process.env.CHROME_PATH ||
    (process.platform === "win32"
      ? path.join(
          process.env.ProgramFiles,
          "Google/Chrome/Application/chrome.exe",
        )
      : undefined);
  browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
    args: ["--disable-gpu", "--disable-background-networking"],
  });
  page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.goto(url);
  const nav = async (name) => {
    await page
      .locator("nav")
      .getByRole("button", { name, exact: true })
      .click();
    await page.locator("main .content").waitFor();
  };
  await page.getByText("2,050", { exact: true }).first().waitFor();
  await page.screenshot({ path: ".local/overview.png", fullPage: true });
  console.log("PASS Overview and historical baseline");
  await page.getByLabel("As of date").fill("2025-03-01");
  await page.getByText("1,144", { exact: true }).first().waitFor();
  await page
    .getByLabel("Attribution", { exact: true })
    .selectOption("first-touch");
  await page.getByText("1,144", { exact: true }).first().waitFor();
  await page.getByLabel("As of date").fill("2025-04-20");
  await page
    .getByLabel("Attribution", { exact: true })
    .selectOption("registration");
  await page.getByText("2,050", { exact: true }).first().waitFor();
  console.log("PASS Date and attribution controls");
  for (const [name, text] of [
    ["Funnel", "Funnel by campaign"],
    ["Campaigns", "Campaign performance"],
    ["Budget", "Budget reallocation"],
    ["Win-back", "Follow-up queue"],
    ["2027 plan", "Decision gates"],
    ["Data editor", "Source records"],
    ["Task manager", "To do"],
  ]) {
    await nav(name);
    await page.getByText(text, { exact: true }).first().waitFor();
  }
  console.log("PASS All eight screens");
  await page.getByRole("button", { name: "Growth Copilot" }).click();
  await page
    .getByLabel("Copilot question")
    .fill("Create a task for Arjun to cut Creator Partners spend by Friday");
  await page.getByRole("button", { name: "Send question" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByText("Saved to task manager").waitFor();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator(".task").filter({ hasText: "Creator Partners" }).click();
  await page.getByLabel("Status", { exact: true }).selectOption("done");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.locator(".modal").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Campaigns", exact: true })
    .last()
    .click();
  await page
    .getByRole("row")
    .filter({ hasText: "Creator Partners" })
    .getByText("paused")
    .waitFor();
  console.log(
    "PASS Confirmed chat draft, manager task and applied campaign change",
  );
  await nav("Data editor");
  await page.getByLabel("Source table").selectOption("checkins");
  await page.getByLabel("Contains").fill("C02");
  await page.getByText(/matching rows · offset/).waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete filtered rows" }).click();
  await page
    .locator("tr")
    .filter({ hasText: "raw_checkins" })
    .first()
    .waitFor();
  await nav("Overview");
  await page.locator(".stat.lead strong").waitFor();
  assert.ok(
    Number(
      (await page.locator(".stat.lead strong").innerText()).replaceAll(",", ""),
    ) < 2050,
  );
  console.log("PASS Filtered data edit refreshes analytics");
  await nav("Data editor");
  page.once("dialog", (d) => d.accept("RESET"));
  const reset = page.waitForResponse((r) => r.url().endsWith("/api/reset"));
  await page.getByRole("button", { name: "Reset to original" }).click();
  const response = await reset;
  assert.ok(response.ok(), await response.text());
  await nav("Overview");
  await page.getByText("2,050", { exact: true }).first().waitFor();
  console.log("PASS Workbook reset via browser");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await nav("Budget");
  await page.getByText("Budget reallocation", { exact: true }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  console.log("PASS Mobile navigation and layout");
  assert.deepEqual(errors, []);
  console.log("PASS No browser runtime errors");
  if (process.argv.includes("--record")) {
    const {recordDemo}=await import("./record-demo.mjs");
    await recordDemo(browser,url);
  }
} catch (error) {
  if (page) {
    await page.screenshot({ path: ".local/browser-failure.png" });
    console.error((await page.locator("body").innerText()).slice(-2600));
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
  await seed();
}
