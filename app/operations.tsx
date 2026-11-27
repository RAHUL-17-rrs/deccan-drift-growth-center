"use client";
import { useState, useEffect } from "react";
import {
  Plus,
  Download,
  Upload,
  RefreshCw,
  SlidersHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  Row,
  Data,
  Table,
  Panel,
  Modal,
  Field,
  Badge,
  api,
  owners,
  amount as n,
  rupees as rs,
  percent as pc,
  day,
  csvDownload,
} from "./ui";
type DialogSpec = {
  title: string;
  data: Row;
  fields: string[];
  save: (v: Row) => Promise<void>;
  remove?: () => Promise<void>;
  options?: Record<string, string[]>;
  labels?: Row;
  confirm?: boolean;
};
const captions: Row = {
  cid: "Campaign",
  campaign_id: "Linked campaign",
  plan_cpr: "Plan cost / registration (₹)",
  expected_showup: "Expected show-up (0–1)",
  created_at: "Visible from",
  budget: "Allocated budget (₹)",
  proposed: "Proposed campaign change (JSON)",
  k: "Diminishing returns factor",
  paid_k: "Paid Social factor",
  scale: "Scale multiplier",
  stop: "Stop multiplier",
  walkins: "Expected walk-ins",
  share: "Expected registration share (0–1)",
};
const label = (s: string) =>
  captions[s] || s.replaceAll("_", " ").replace(/^./, (x) => x.toUpperCase());
function Form({ spec, close }: { spec: DialogSpec; close: () => void }) {
  const [v, set] = useState<Row>({
      ...spec.data,
      proposed:
        typeof spec.data.proposed === "object" && spec.data.proposed
          ? JSON.stringify(spec.data.proposed)
          : spec.data.proposed,
    }),
    [error, err] = useState(""),
    [busy, working] = useState(false);
  const save = async () => {
    working(true);
    err("");
    try {
      const data = Object.fromEntries(spec.fields.map((k) => [k, v[k] ?? ""]));
      if ("proposed" in data)
        data.proposed = data.proposed ? JSON.parse(data.proposed) : null;
      await spec.save(data);
      close();
    } catch (e: any) {
      err(e.message);
    } finally {
      working(false);
    }
  };
  return (
    <Modal title={spec.title} onClose={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="formGrid">
          {spec.fields.map((k) => (
            <Field key={k} label={spec.labels?.[k] || label(k)}>
              {spec.options?.[k] ? (
                <select
                  value={v[k] ?? ""}
                  onChange={(e) => set({ ...v, [k]: e.target.value })}
                >
                  {spec.options[k].map((o) => {
                    const [value, ...rest] = o.split("|");
                    return (
                      <option key={o} value={value}>
                        {rest.join("|") || value || "Unassigned"}
                      </option>
                    );
                  })}
                </select>
              ) : [
                  "description",
                  "rule",
                  "signal",
                  "proposed",
                  "objective",
                ].includes(k) ? (
                <textarea
                  value={v[k] ?? ""}
                  placeholder={
                    k === "proposed" ? '{"status":"paused"}' : undefined
                  }
                  onChange={(e) => set({ ...v, [k]: e.target.value })}
                />
              ) : (
                <input
                  aria-label={label(k)}
                  type={
                    ["day", "deadline", "activity_date"].includes(k)
                      ? "date"
                      : /(_at)$/.test(k)
                        ? "text"
                        : "text"
                  }
                  value={v[k] ?? ""}
                  onChange={(e) => set({ ...v, [k]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="modalFoot">
          {spec.remove && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (!confirm("Delete this record?")) return;
                try {
                  await spec.remove!();
                  close();
                } catch (e: any) {
                  err(e.message);
                }
              }}
            >
              <Trash2 size={15} />
              Delete
            </button>
          )}
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
const campaignFields = [
  "campaign_name",
  "channel",
  "owner_name",
  "created_at",
  "planned_start_at",
  "planned_end_at",
  "budget",
  "status",
  "plan_cpr",
  "expected_showup",
];
const taskFields = [
  "title",
  "description",
  "owner",
  "deadline",
  "priority",
  "status",
  "campaign_id",
  "proposed",
];
export function Operations({
  page,
  db,
  scope,
  refresh,
}: {
  page: string;
  db: Data;
  scope: Row;
  refresh: () => void;
}) {
  const [spec, setSpec] = useState<DialogSpec | null>(null),
    [tab, setTab] = useState("Tasks"),
    [mode, setMode] = useState("Board"),
    [owner, setOwner] = useState(""),
    [campaign, setCampaign] = useState(""),
    [overdue, setOverdue] = useState(false);
  const channels = db.campaigns.filter((x: Row) => x.cid),
    channelOpts = ["", ...channels.map((r: Row) => r.cid + "|" + r.name)];
  const edit = (
    entity: string,
    id: any,
    r: Row,
    fields: string[],
    options: Record<string, string[]> = {},
  ) => {
    const op = id == null ? "add" : "edit";
    setSpec({
      title: (id == null ? "New " : "Edit ") + entity.replaceAll("_", " "),
      data: r,
      fields,
      options,
      save: async (v) => {
        const apply =
          entity === "task" && v.status === "done" && v.proposed && !r.applied;
        if (
          apply &&
          !confirm(
            "Completing this task applies its proposed campaign change. Apply and complete?",
          )
        )
          throw Error("Completion cancelled.");
        await api("manage", { entity, op, id, data: v, confirmApply: !!apply });
        refresh();
      },
      remove:
        id != null && ["campaign", "task", "pace_curve"].includes(entity)
          ? async () => {
              await api("manage", { entity, op: "delete", id });
              refresh();
            }
          : undefined,
    });
  };
  function task(r?: Row) {
    edit(
      "task",
      r?.id,
      { owner: db.user, status: "todo", priority: "normal", ...r },
      taskFields,
      {
        owner: owners,
        status: ["todo", "doing", "done"],
        priority: ["low", "normal", "high"],
        campaign_id: channelOpts,
      },
    );
  }
  function campaignForm(r?: Row) {
    edit(
      "campaign",
      r?.campaign_id,
      {
        owner_name: db.user,
        status: "active",
        created_at: scope.as_of + "T00:00:00+05:30",
        ...r,
      },
      r ? campaignFields.filter((x) => x !== "created_at") : campaignFields,
      { owner_name: owners, status: ["active", "paused", "stopped"] },
    );
  }
  const filters = (
    <div className="tools">
      <select
        aria-label="Filter owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      >
        <option value="">All owners</option>
        {owners.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <select
        aria-label="Filter campaign"
        value={campaign}
        onChange={(e) => setCampaign(e.target.value)}
      >
        <option value="">All campaigns</option>
        {channels.map((c: Row) => (
          <option key={c.cid} value={c.cid}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
  const taskRows = (db.tasks || []).filter(
    (t: Row) =>
      (!owner || t.owner === owner) &&
      (!campaign || t.campaign_id === campaign) &&
      (!overdue ||
        (t.deadline &&
          t.deadline <
            new Date().toLocaleDateString("en-CA", {
              timeZone: "Asia/Kolkata",
            }) &&
          t.status !== "done")),
  );
  const wb = (db.people || []).filter(
    (t: Row) =>
      (!owner || t.owner_name === owner) && (!campaign || t.cid === campaign),
  );
  const icon = (cb: () => void) => (
    <button className="icon" aria-label="Edit record" onClick={cb}>
      <Pencil size={15} />
    </button>
  );
  return (
    <>
      {page === "Manager" && (
        <>
          <div className="toolbar">
            <div className="seg">
              {["Tasks", "Campaigns"].map((x) => (
                <button
                  className={tab === x ? "on" : ""}
                  key={x}
                  onClick={() => setTab(x)}
                >
                  {x}
                </button>
              ))}
            </div>
            <button
              className="primary"
              onClick={() => (tab === "Tasks" ? task() : campaignForm())}
            >
              <Plus size={16} />
              New {tab === "Tasks" ? "task" : "campaign"}
            </button>
          </div>
          {tab === "Tasks" ? (
            <>
              <div className="toolbar">
                {filters}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={overdue}
                    onChange={(e) => setOverdue(e.target.checked)}
                  />
                  Overdue only
                </label>
                <div className="seg">
                  {["Board", "Table"].map((x) => (
                    <button
                      className={mode === x ? "on" : ""}
                      key={x}
                      onClick={() => setMode(x)}
                    >
                      {x}
                    </button>
                  ))}
                </div>
              </div>
              {mode === "Board" ? (
                <div className="board">
                  {["todo", "doing", "done"].map((s, i) => (
                    <section key={s}>
                      <header>
                        <i className={"dot dot" + i} />
                        <b>{["To do", "In progress", "Done"][i]}</b>
                        <span>
                          {taskRows.filter((x: Row) => x.status === s).length}
                        </span>
                      </header>
                      {taskRows
                        .filter((x: Row) => x.status === s)
                        .map((t: Row) => (
                          <button
                            className="task"
                            key={t.id}
                            onClick={() => task(t)}
                          >
                            <small>
                              {channels.find(
                                (c: Row) => c.cid === t.campaign_id,
                              )?.name || "General"}
                            </small>
                            <b>{t.title}</b>
                            <small>
                              {t.owner} · {day(t.deadline)}
                            </small>
                            <Badge value={t.priority} />
                          </button>
                        ))}
                      <button
                        className="textBtn"
                        onClick={() => task({ status: s })}
                      >
                        <Plus size={15} />
                        Add task
                      </button>
                    </section>
                  ))}
                </div>
              ) : (
                <Panel title="Action items">
                  <Table
                    rows={taskRows}
                    cols={[
                      [
                        "Title",
                        (r) => (
                          <button className="textBtn" onClick={() => task(r)}>
                            {r.title}
                          </button>
                        ),
                      ],
                      ["Owner", (r) => r.owner],
                      ["Deadline", (r) => day(r.deadline)],
                      ["Priority", (r) => <Badge value={r.priority} />],
                      ["Status", (r) => <Badge value={r.status} />],
                      ["Created by", (r) => r.created_by],
                      ["Applied", (r) => (r.applied ? "Yes" : "—")],
                    ]}
                  />
                </Panel>
              )}
            </>
          ) : (
            <Panel title="Campaign directory">
              <Table
                rows={db.managed}
                cols={[
                  [
                    "Campaign",
                    (r) => (
                      <button
                        className="textBtn"
                        onClick={() => campaignForm(r)}
                      >
                        {r.campaign_name}
                      </button>
                    ),
                  ],
                  ["Owner", (r) => r.owner_name],
                  ["Status", (r) => <Badge value={r.status || "active"} />],
                  ["Budget", (r) => rs(r.budget)],
                  ["Start", (r) => day(r.planned_start_at)],
                  ["End", (r) => day(r.planned_end_at)],
                  ["Edit", (r) => icon(() => campaignForm(r))],
                ]}
              />
            </Panel>
          )}
        </>
      )}
      {page === "Win-back" && (
        <Panel
          title="Follow-up queue"
          sub={
            n(wb.length) +
            " people with a latest cancelled or waitlisted status."
          }
          aside={
            <button onClick={() => csvDownload("win-back.csv", wb)}>
              <Download size={15} />
              Export CSV
            </button>
          }
        >
          {filters}
          <Table
            rows={wb}
            cols={[
              [
                "Person",
                (r) => (
                  <>
                    <b>{r.person_name}</b>
                    <small className="under">{r.person_id}</small>
                  </>
                ),
              ],
              ["Campaign", (r) => r.name],
              ["Owner", (r) => r.owner_name],
              ["Status", (r) => <Badge value={r.status} />],
              ["Contact", (r) => (r.opted_out ? "Opted out" : "Eligible")],
              [
                "Action",
                (r) => (
                  <button
                    disabled={r.opted_out}
                    onClick={() =>
                      task({
                        title: "Follow up with " + r.person_name,
                        description:
                          "Review " +
                          r.status +
                          " registration for " +
                          r.person_id,
                        owner: r.owner_name,
                        campaign_id: r.cid,
                      })
                    }
                  >
                    Create follow-up
                  </button>
                ),
              ],
            ]}
          />
        </Panel>
      )}
      {page === "Plan" && (
        <>
          <Panel
            title="Deccan Drift Pune 2027"
            sub="Forward plan · 13–14 February 2027 · Agriculture College Ground"
          >
            <div className="miniStats">
              {["Committed", "Stretch"].map((s, i) => {
                const total = (k: string) =>
                  db.plan_channels.reduce(
                    (v: number, r: Row) =>
                      v + Number(r[(i ? "stretch_" : "") + k] || 0),
                    0,
                  );
                return (
                  <div key={s}>
                    <small>{s} attendance</small>
                    <b>{n(total("attendees"))}</b>
                    <small>
                      {n(total("regs"))} registrations · {rs(total("spend"))}
                    </small>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel
            title="Channel plan"
            sub="Workbook values retain full precision. Edit a channel to revise the forward scenario."
          >
            <Table
              rows={db.plan_channels}
              cols={[
                ["Channel", (r) => <b>{r.name}</b>],
                ["Registrations", (r) => n(r.regs)],
                ["Show-up", (r) => pc(r.showup)],
                ["Spend", (r) => rs(r.spend)],
                ["₹ / reg", (r) => rs(r.regs ? r.spend / r.regs : null)],
                [
                  "Early signal",
                  (r) => <span className="long">{r.signal || r.bet}</span>,
                ],
                [
                  "Edit",
                  (r) =>
                    icon(() =>
                      edit(
                        "plan_channels",
                        r.name,
                        r,
                        Object.keys(r).filter((k) => k !== "name"),
                      ),
                    ),
                ],
              ]}
            />
          </Panel>
          <Panel title="Decision gates">
            <Table
              rows={db.plan_gates}
              cols={[
                ["Gate", (r) => r.name],
                ["Timing", (r) => r.timing],
                ["Rule", (r) => <span className="long">{r.rule}</span>],
                ["Value", (r) => r.value],
                ["Multiplier", (r) => r.multiplier],
                [
                  "Edit",
                  (r) =>
                    icon(() =>
                      edit("plan_gates", r.name, r, [
                        "timing",
                        "rule",
                        "value",
                        "multiplier",
                      ]),
                    ),
                ],
              ]}
            />
          </Panel>
          <Panel
            title="Historical back-test settings"
            sub="These inputs control forecasts, simulator estimates and campaign decisions in the 2025 workspace."
            aside={
              <button
                onClick={() =>
                  edit("settings", 1, db.settings[0], [
                    "scale",
                    "stop",
                    "k",
                    "paid_k",
                    "walkins",
                  ])
                }
              >
                <SlidersHorizontal size={15} />
                Edit thresholds
              </button>
            }
          >
            <p className="hint">
              Scale at ≤ {db.settings[0].scale}× plan · stop above{" "}
              {db.settings[0].stop}× for two consecutive completed weeks ·{" "}
              {n(db.settings[0].walkins)} expected walk-ins.
            </p>
            <Table
              rows={db.managed}
              cols={[
                ["Campaign", (r) => r.campaign_name],
                ["Status", (r) => <Badge value={r.status} />],
                ["Allocation", (r) => rs(r.budget)],
                [
                  "Plan ₹ / reg",
                  (r) =>
                    r.plan_cpr == null
                      ? "Active target baseline"
                      : rs(r.plan_cpr),
                ],
                ["Expected show-up", (r) => pc(r.expected_showup)],
              ]}
            />
          </Panel>
          <Panel
            title="Editable registration pace curve"
            aside={
              <button
                onClick={() => edit("pace_curve", null, {}, ["day", "share"])}
              >
                <Plus size={15} />
                Add point
              </button>
            }
          >
            <Table
              rows={db.pace_curve}
              cols={[
                ["Date", (r) => day(r.day)],
                ["Expected cumulative share", (r) => pc(r.share)],
                [
                  "Edit",
                  (r) => icon(() => edit("pace_curve", r.day, r, ["share"])),
                ],
              ]}
            />
          </Panel>
        </>
      )}
      {spec && <Form spec={spec} close={() => setSpec(null)} />}
    </>
  );
}
export function DataEditor({ db, refresh }: { db: Data; refresh: () => void }) {
  const [table, setTable] = useState("marketing"),
    [field, setField] = useState("campaign_id"),
    [value, setValue] = useState(""),
    [offset, setOffset] = useState(0),
    [limit, setLimit] = useState("50"),
    [records, setRecords] = useState<Data | null>(null),
    [spec, setSpec] = useState<DialogSpec | null>(null),
    [error, err] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setRecords(null);
    err("");
    api("browse", { table, field, value, offset })
      .then((r) => live && setRecords(r))
      .catch((e) => live && err(e.message));
    return () => {
      live = false;
    };
  }, [table, field, value, offset, db]);
  const perform = async (action: string, payload: Row) => {
    setBusy(true);
    err("");
    try {
      await api(action, payload);
      if (action === "reset") {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith("growth-chat-"))
          .forEach((key) => sessionStorage.removeItem(key));
      }
      refresh();
    } catch (e: any) {
      err(e.message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (r: Row | null) => {
    if (!records) return;
    setSpec({
      title: r ? "Edit source row" : "Add source row",
      data: r || {},
      fields: records.columns.map((x: Row) => x.name),
      save: async (v) => {
        await api("edit", {
          table,
          op: r ? "edit" : "add",
          rid: r?.rid,
          data: v,
        });
        refresh();
      },
      remove: r
        ? async () => {
            await api("edit", { table, op: "delete", rid: r.rid });
            refresh();
          }
        : undefined,
    });
  };
  const tables: Row = {
    marketing: "Daily marketing",
    checkins: "Check-ins",
    registrations: "Registrations",
    history: "Registration history",
    people: "People",
    targets: "Targets",
  };
  return (
    <>
      <Panel
        title="Source records"
        sub="Browse the original imported rows, including retry copies."
        aside={
          <a className="button" href="/api/download">
            <Download size={14} />
            Original workbook
          </a>
        }
      >
        <div className="tools">
          <Field label="Source table">
            <select
              value={table}
              onChange={(e) => {
                setTable(e.target.value);
                setValue("");
                setOffset(0);
                setField(
                  ({ people: "person_id", targets: "target_version" } as Row)[
                    e.target.value
                  ] || "campaign_id",
                );
              }}
            >
              {Object.entries(tables).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Filter field">
            <select
              value={field}
              onChange={(e) => {
                setField(e.target.value);
                setOffset(0);
              }}
            >
              {(records?.columns || [{ name: field }]).map((x: Row) => (
                <option key={x.name}>{x.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Contains">
            <input
              value={value}
              placeholder="Filter value"
              onChange={(e) => {
                setValue(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <button disabled={!records || busy} onClick={() => edit(null)}>
            <Plus size={15} />
            Add row
          </button>
        </div>
        {records ? (
          <>
            <Table
              rows={records.records}
              cols={[
                [
                  "Edit",
                  (r) => (
                    <button
                      className="icon"
                      aria-label={"Edit row " + r.rid}
                      onClick={() => edit(r)}
                    >
                      <Pencil size={14} />
                    </button>
                  ),
                ],
                ...(records.columns.map((x: Row) => [
                  label(x.name),
                  (r: Row) => String(r[x.name] ?? "—"),
                ]) as [string, (r: Row) => string][]),
              ]}
            />
            <div className="toolbar">
              <small>
                {n(records.total[0].n)} matching rows · offset {offset}
              </small>
              <div className="tools">
                <button
                  disabled={!offset}
                  onClick={() => setOffset(offset - 35)}
                >
                  Previous
                </button>
                <button
                  disabled={offset + 35 >= records.total[0].n}
                  onClick={() => setOffset(offset + 35)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p>Loading rows…</p>
        )}
      </Panel>
      <Panel title="Import and bulk changes">
        <div className="tools">
          <label className="button">
            <Upload size={14} />
            Append CSV
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && confirm("Append CSV rows to " + tables[table] + "?"))
                  await perform("edit", {
                    op: "csv",
                    table,
                    csv: await f.text(),
                  });
                e.target.value = "";
              }}
            />
          </label>
          <Field label="Filtered delete limit">
            <input
              type="number"
              min="1"
              max="5000"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
          <button
            className="danger"
            disabled={!value || busy}
            onClick={() => {
              if (
                confirm(
                  "Delete up to " +
                    limit +
                    " raw rows where " +
                    field +
                    " contains “" +
                    value +
                    "”?",
                )
              )
                perform("edit", {
                  op: "bulk",
                  table,
                  field,
                  value,
                  limit: +limit,
                });
            }}
          >
            Delete filtered rows
          </button>
          <button
            disabled={busy}
            onClick={() => {
              const confirmValue = prompt(
                "Reset source data, plans, tasks and chats from the workbooks. Audit history is retained. Type RESET to confirm.",
              );
              if (confirmValue === "RESET")
                perform("reset", { confirm: confirmValue });
            }}
          >
            <RefreshCw size={14} />
            Reset to original
          </button>
        </div>
      </Panel>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <Panel title="Change log">
        <Table
          rows={db.log}
          cols={[
            [
              "When (IST)",
              (r) =>
                new Date(r.at).toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                }),
            ],
            ["Actor", (r) => r.actor],
            ["Table", (r) => r.entity],
            ["Record", (r) => r.key],
            [
              "Change",
              (r) => (
                <details>
                  <summary>Before / after</summary>
                  <pre>
                    {JSON.stringify(
                      { before: r.before, after: r.after },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ),
            ],
          ]}
        />
      </Panel>
      {spec && <Form spec={spec} close={() => setSpec(null)} />}
    </>
  );
}
