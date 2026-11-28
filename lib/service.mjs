import { sql, rows, scalar, literal as L, jsonArg as J } from "./db.mjs";
import { randomUUID } from "node:crypto";
export const owners = [
  "Pranit",
  "Meera Iyer",
  "Arjun Verma",
  "Nisha Rao",
  "Dev Malhotra",
];
export const raw = {
  marketing: "activity_id",
  checkins: "event_id",
  registrations: "registration_id",
  history: "history_id",
  people: "person_id",
  targets: "effective_at",
};
const plans = {
  plan_channels: "name",
  plan_gates: "name",
  pace_curve: "day",
  settings: "id",
};
export function date(x) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
    Number.isNaN(Date.parse(x)) ||
    new Date(x).toISOString().slice(0, 10) !== x
  )
    throw Error("Use a valid calendar date.");
  return x;
}
export function context(arg) {
  return {
    d: date(arg.as_of || "2025-04-20"),
    a: arg.attribution === "first-touch" ? "first-touch" : "registration",
    user: owners.includes(arg.user) ? arg.user : "Pranit",
  };
}
export const args = (d, a) => L(date(d)) + "::date," + L(a);
export async function bundle(queries) {
  const pairs = Object.entries(queries).map(
    ([k, v]) =>
      "'" +
      k +
      "',(select coalesce(json_agg(row_to_json(q)),'[]') from (" +
      v +
      ") q)",
  );
  return JSON.parse(
    await sql("select json_build_object(" + pairs.join(",") + ")"),
  );
}
export async function dashboard(input) {
  const { d, a } = context(input),
    p = args(d, a),
    cid = input.cid || null,
    days = Math.min(90, Math.max(1, Number(input.days) || 7));
  const page = input.page || "Overview";
  const q = {
    campaigns:
      "select * from fn_campaign_metrics(" +
      p +
      ") order by attendees desc,name",
    kpi: "select * from fn_kpis(" + p + ")",
  };
  if (["Overview", "Budget"].includes(page))
    q.trend = "select * from fn_trend(" + p + ")";
  if (["Overview", "Campaigns", "Funnel", "Plan"].includes(page))
    q.alerts =
      "select * from fn_alerts(" +
      p +
      "," +
      L(input.metric === "cpa" ? "cpa" : "cpr") +
      ")";
  if (["Overview", "Campaigns"].includes(page)) {
    q.driver =
      "select * from fn_drivers(" + p + "," + L(page === "Overview" ? null : cid) + "," + (page === "Overview" ? 7 : days) + ")";
    q.bottleneck = "select * from fn_bottleneck(" + p + ")";
    q.weekly = "select * from fn_weekly_campaign(" + p + ") order by week";
  }
  if (page === "Funnel")
    q.mix = "select status,count(*) n from fn_status(" + p + ") group by 1";
  if (["Manager", "Budget"].includes(page))
    q.managed =
      "select c.*,s.status,s.budget,s.plan_cpr,s.expected_showup from clean_campaigns c left join campaign_settings s using(campaign_id) order by campaign_name";
  if (page === "Manager")
    q.tasks = "select * from tasks order by created_at desc";
  if (page === "Win-back") q.people = "select * from fn_winback(" + p + ")";
  if (page === "Budget")
    q.versions =
      "select * from clean_targets where effective_at<cutoff(" +
      L(d) +
      "::date) order by effective_at";
  if (page === "Plan") {
    for (const table of Object.keys(plans))
      q[table] = "select * from " + table + " order by 1";
    q.managed =
      "select c.campaign_name,s.* from campaign_settings s join clean_campaigns c using(campaign_id) order by c.campaign_name";
  }
  if (page === "Data editor")
    q.log = "select * from growth_audit.log where id>=(select coalesce(max(id),0) from growth_audit.log where entity='reset') order by id desc limit 25";
  return bundle(q);
}
export async function metadata(table) {
  const columns = await rows(
    "select column_name as name,data_type as type,is_nullable='NO' as required from information_schema.columns where table_schema='growth' and table_name=" +
      L(table) +
      " and column_name<>'rid' order by ordinal_position",
  );
  if (!columns.length) throw Error("Unknown table");
  return columns;
}
function rawTable(name) {
  if (!Object.hasOwn(raw, name)) throw Error("Choose an editable source table");
  return "raw_" + name;
}
export async function browse(input) {
  const t = rawTable(input.table),
    columns = await metadata(t),
    filter = filterSql(columns, input.field, input.value),
    offset = Math.max(0, parseInt(input.offset) || 0);
  return {
    ...(await bundle({
      records:
        "select * from " +
        t +
        " where " +
        filter +
        " order by rid limit 35 offset " +
        offset,
      total: "select count(*) n from " + t + " where " + filter,
    })),
    columns,
  };
}
function filterSql(columns, field, value) {
  if (!value) return "true";
  if (!columns.some((c) => c.name === field))
    throw Error("Choose a filter field");
  return (
    'strpos(lower(coalesce("' +
    field +
    "\"::text,'')),lower(" +
    L(value) +
    "))>0"
  );
}
function assignment(cols, data) {
  const keys = Object.keys(data);
  if (!keys.length || keys.some((k) => !cols.some((c) => c.name === k)))
    throw Error("Unknown or empty field");
  return keys.map((k) => {
    const c = cols.find((c) => c.name === k);
    let v = data[k];
    if (v === "" || v === undefined) v = null;
    return {
      name: '"' + k + '"',
      value:
        v === null ? "NULL" : c.type === "jsonb" ? J(v) : L(v) + "::" + c.type,
    };
  });
}
function insert(t, fields) {
  return (
    "insert into " +
    t +
    "(" +
    fields.map((x) => x.name) +
    ") values(" +
    fields.map((x) => x.value) +
    ")"
  );
}
function update(t, fields, where) {
  return (
    "update " +
    t +
    " set " +
    fields.map((x) => x.name + "=" + x.value).join(",") +
    " where " +
    where
  );
}
export function transaction(user, statement, apply = false) {
  return sql(
    "begin;select set_config('growth.actor'," +
      L(user) +
      ",true);select set_config('growth.confirm_apply','" +
      (apply ? "yes" : "no") +
      "',true);" +
      statement +
      ";commit;",
  );
}
export function parseCsv(text) {
  let out = [],
    row = [],
    field = "",
    quote = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quote && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quote = !quote;
    } else if (!quote && c === ",") {
      row.push(field);
      field = "";
    } else if (!quote && c === "\n") {
      row.push(field.replace(/\r$/, ""));
      out.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (quote) throw Error("Unclosed CSV quote");
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    out.push(row);
  }
  if (out.length < 2) throw Error("CSV needs headers and records");
  const head = out.shift();
  head[0] = head[0].replace(/^\uFEFF/, "");
  if (new Set(head).size !== head.length) throw Error("Duplicate CSV header");
  return out
    .filter((r) => r.some(Boolean))
    .map((r) => {
      if (r.length !== head.length)
        throw Error("CSV row width differs from its header");
      return Object.fromEntries(head.map((v, i) => [v, r[i]]));
    });
}
export async function editData(input, user) {
  const { table, op, data = {}, rid, limit } = input,
    t = rawTable(table),
    cols = await metadata(t);
  let statement;
  if (op === "add") statement = insert(t, assignment(cols, data));
  else if (op === "edit" || op === "delete") {
    if (!Number.isSafeInteger(Number(rid)) || +rid < 1)
      throw Error("Choose a row");
    statement =
      op === "edit"
        ? update(t, assignment(cols, data), "rid=" + Number(rid))
        : "delete from " + t + " where rid=" + Number(rid);
  } else if (op === "bulk") {
    if (
      !input.value ||
      !Number.isInteger(+limit) ||
      +limit < 1 ||
      +limit > 5000
    )
      throw Error("Set a filter and a limit between 1 and 5,000");
    statement =
      "delete from " +
      t +
      " where rid in(select rid from " +
      t +
      " where " +
      filterSql(cols, input.field, input.value) +
      " order by rid limit " +
      Number(limit) +
      ")";
  } else if (op === "csv") {
    const records = parseCsv(input.csv || "");
    if (records.length > 25000)
      throw Error("Import up to 25,000 records at a time");
    statement = records.map((r) => insert(t, assignment(cols, r))).join(";");
  } else throw Error("Unknown edit");
  await transaction(user, statement);
  return { saved: true };
}
export async function manage(input, user) {
  const { entity, op, data = {}, id } = input;
  let t, key, allowed;
  if (entity === "campaign") {
    t = "raw_campaigns";
    key = "campaign_id";
    allowed = [
      "campaign_name",
      "channel",
      "owner_name",
      "planned_start_at",
      "planned_end_at",
      "objective",
      "target_audience",
    ];
  } else if (entity === "task") {
    t = "tasks";
    key = "id";
    allowed = [
      "title",
      "description",
      "owner",
      "deadline",
      "status",
      "priority",
      "campaign_id",
      "proposed",
    ];
  } else if (Object.hasOwn(plans, entity)) {
    t = entity;
    key = plans[t];
    allowed = (await metadata(t)).map((x) => x.name);
  } else throw Error("Unknown entity");
  const cols = await metadata(t);
  let fields = Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.includes(k)),
  );
  if (entity === "task") {
    if (
      fields.proposed &&
      (typeof fields.proposed !== "object" ||
        Object.keys(fields.proposed).some(
          (k) => !["status", "budget", "plan_cpr"].includes(k),
        ))
    )
      throw Error("Invalid proposed change");
    if (fields.owner && !owners.includes(fields.owner))
      throw Error("Choose a team owner");
  }
  let cid = id || randomUUID(),
    extra = "";
  if (entity === "campaign") {
    if (
      op !== "delete" &&
      (!data.campaign_name?.trim() || !owners.includes(data.owner_name))
    )
      throw Error("Campaign name and team owner are required");
    if (
      data.planned_start_at &&
      data.planned_end_at &&
      Date.parse(data.planned_start_at) > Date.parse(data.planned_end_at)
    )
      throw Error("End date must follow start date");
    if (op === "add")
      fields = {
        ...fields,
        campaign_id: cid,
        created_at: data.created_at || new Date().toISOString(),
      };
    const ownerCodes = {
      Pranit: "PRANIT",
      "Arjun Verma": "T04",
      "Meera Iyer": "T03",
      "Nisha Rao": "T05",
      "Dev Malhotra": "T06",
    };
    if (data.owner_name) fields.owner_id = ownerCodes[data.owner_name];
    const changes = Object.fromEntries(
      ["budget", "status", "plan_cpr", "expected_showup"]
        .filter((k) => k in data)
        .map((k) => [k, data[k]]),
    );
    if (op !== "delete" && Object.keys(changes).length) {
      const cfg = assignment(await metadata("campaign_settings"), changes);
      extra =
        ";insert into campaign_settings(campaign_id) values(" +
        L(cid) +
        ") on conflict do nothing;" +
        update("campaign_settings", cfg, "campaign_id=" + L(cid));
    }
    if (op === "delete") {
      const used = await sql(
        "select exists(select 1 from clean_registrations where campaign_id=" +
          L(cid) +
          " union all select 1 from clean_marketing where campaign_id=" +
          L(cid) +
          " union all select 1 from clean_checkins where campaign_id=" +
          L(cid) +
          " union all select 1 from tasks where campaign_id=" +
          L(cid) +
          ")",
      );
      if (used === "t")
        throw Error(
          "This campaign has linked records. Stop it to preserve its history.",
        );
      extra = ";delete from campaign_settings where campaign_id=" + L(cid);
    }
  }
  if (entity === "task" && op === "add")
    fields = { ...fields, id: cid, created_by: "user", actor: user };
  const where =
    '"' + key + '"=' + L(id) + "::" + cols.find((x) => x.name === key).type;
  if (op === "edit") delete fields[key];
  const stmt =
    op === "delete"
      ? "delete from " + t + " where " + where
      : op === "add"
        ? insert(t, assignment(cols, fields))
        : op === "edit"
          ? update(t, assignment(cols, fields), where)
          : null;
  if (!stmt) throw Error("Unknown operation");
  await transaction(user, stmt + extra, input.confirmApply === true);
  return { saved: true, id: cid };
}
