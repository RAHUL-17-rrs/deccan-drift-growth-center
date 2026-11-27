import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import {
  dashboard,
  browse,
  editData,
  manage,
  context,
  owners,
} from "../../../lib/service.mjs";
import { chat, resolveDraft, modelMode } from "../../../lib/copilot.mjs";
import { evidence } from "../../../lib/evidence.mjs";
import { seed } from "../../../scripts/seed.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Route = { params: Promise<{ action: string }> };
export async function GET(req: NextRequest, { params }: Route) {
  const { action } = await params;
  if (action !== "download")
    return NextResponse.json({ error: "Use POST" }, { status: 405 });
  const file =
    req.nextUrl.searchParams.get("file") === "plan"
      ? "DeccanDrift_Pune_2027_Model.xlsx"
      : "Attendee_Dataset.xlsx";
  return new Response(await fs.readFile(path.join(process.cwd(), file)), {
    headers: {
      "Content-Disposition": 'attachment; filename="' + file + '"',
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
export async function POST(req: NextRequest, { params }: Route) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host"))
      return NextResponse.json(
        { error: "Cross-origin request rejected" },
        { status: 403 },
      );
    if (!req.headers.get("content-type")?.includes("application/json"))
      return NextResponse.json(
        { error: "JSON body required" },
        { status: 415 },
      );
    const { action } = await params,
      v = await req.json(),
      user = req.cookies.get("growth_user")?.value
        ? decodeURIComponent(req.cookies.get("growth_user")!.value)
        : "Pranit";
    let result;
    if (action === "user") {
      if (!owners.includes(v.user)) throw Error("Unknown user");
      const res = NextResponse.json({ saved: true });
      res.cookies.set("growth_user", encodeURIComponent(v.user), {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
      return res;
    }
    if (action === "dashboard")
      result = { ...(await dashboard(v)), user, mode: modelMode() };
    else if (action === "browse") result = await browse(v);
    else if (action === "edit") result = await editData(v, user);
    else if (action === "manage") result = await manage(v, user);
    else if (action === "copilot") result = await chat(v, user);
    else if (action === "draft") result = await resolveDraft(v, user);
    else if (action === "simulate")
      result = await evidence("simulate_reallocation", v, context(v));
    else if (action === "reset") {
      if (v.confirm !== "RESET")
        throw Error("Type RESET to restore the original workbooks");
      await seed(user);
      result = { saved: true };
    } else
      return NextResponse.json({ error: "Unknown route" }, { status: 404 });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Request failed" },
      { status: 400 },
    );
  }
}
