"use client";
import { useState, useEffect } from "react";
import {
  Activity,
} from "lucide-react";
import {
  Panel,
  Table,
  Badge,
  Row,
  Data,
  amount as n,
  rupees as rs,
  percent as pc,
  day,
  api,
  Field,
} from "./ui";

import { Trend } from "./charts";
export { Overview } from "./overview";
export function Funnel({ db }: { db: Data }) {
  const k = db.kpi[0],
    stages = [
      ["Landing sessions", k.sessions],
      ["Identified people", k.identified],
      ["Registrations", k.regs],
      ["Confirmed", k.confirmed],
      ["Attendees", k.attendees],
    ];
  return (
    <>
      <Panel
        title="Acquisition funnel"
        sub="Sessions count anonymous activity. Stage ratios compare totals across stages."
      >
        <div className="stages">
          {stages.map(([s, v], i) => (
            <div key={s}>
              <small>{s}</small>
              <strong>{n(v)}</strong>
              <div className="bar">
                <i
                  style={{
                    width: Math.max(3, (100 * v) / (stages[0][1] || 1)) + "%",
                  }}
                />
              </div>
              <small>
                {i
                  ? pc(v / (stages[i - 1][1] || Infinity)) +
                    " of previous stage"
                  : "Anonymous sessions"}
              </small>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Funnel by campaign"
        sub={"Verified attendance includes " + n(k.walkins) + " walk-ins."}
      >
        <Table
          rows={db.campaigns}
          cols={[
            ["Campaign", (r) => <b>{r.name}</b>],
            ["Sessions", (r) => n(r.sessions)],
            ["Identified", (r) => n(r.identified)],
            ["Registered", (r) => n(r.regs)],
            ["Confirmed", (r) => n(r.confirmed)],
            ["Attended", (r) => n(r.attendees)],
            ["Show-up", (r) => pc(r.showup)],
          ]}
        />
      </Panel>
      <Panel title="Latest registration status">
        <div className="miniStats">
          {db.mix.map((x: Row) => (
            <div key={x.status}>
              <small>{x.status}</small>
              <b>{n(x.n)}</b>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
export function Campaigns({
  db,
  filters,
  change,
}: {
  db: Data;
  filters: Row;
  change: (x: Row) => void;
}) {
  const [selected, setSelected] = useState(""),
    b = db.bottleneck[0],
    dr = db.driver[0],
    channels = db.campaigns.filter((x: Row) => x.cid);
  return (
    <>
      <div className="callout">
        <Activity size={21} />
        <div>
          <b>Biggest conversion gap</b>
          <p>
            {b
              ? b.name +
                " · " +
                b.stage +
                " is " +
                pc(b.rate) +
                ", versus " +
                pc(b.best_rate) +
                " for the leading campaign."
              : "No comparable conversion data."}
          </p>
        </div>
      </div>
      <Panel
        title="Campaign performance"
        sub="Select a decision to inspect its threshold and recent weeks."
        aside={
          <select
            aria-label="Alert metric"
            value={filters.metric || "cpr"}
            onChange={(e) => change({ metric: e.target.value })}
          >
            <option value="cpr">Cost / registration</option>
            <option value="cpa">Cost / attendee</option>
          </select>
        }
      >
        <Table
          rows={channels}
          cols={[
            ["Campaign", (r) => <b>{r.name}</b>],
            [
              "Decision",
              (r) => (
                <button className="plain" onClick={() => setSelected(r.cid)}>
                  <Badge
                    value={db.alerts.find((x: Row) => x.cid === r.cid)?.label}
                  />
                </button>
              ),
            ],
            ["Spend", (r) => rs(r.spend)],
            ["Regs", (r) => n(r.regs)],
            ["Attendees", (r) => n(r.attendees)],
            ["Show-up", (r) => pc(r.showup)],
            ["₹ / reg", (r) => rs(r.cpr)],
            ["₹ / visitor", (r) => rs(r.cpa)],
            ["Spend share", (r) => pc(r.spend_share)],
            ["Visitor share", (r) => pc(r.attendee_share)],
            ["Session → reg", (r) => pc(r.conversion)],
            [
              "Weekly regs",
              (r) => (
                <Spark
                  values={db.weekly
                    .filter((v: Row) => v.cid === r.cid)
                    .map((v: Row) => v.regs)}
                />
              ),
            ],
            ["Open tasks", (r) => n(r.open_tasks)],
          ]}
        />
        {selected &&
          db.alerts
            .filter((x: Row) => x.cid === selected)
            .map((x: Row) => (
              <p className="hint" key={x.cid}>
                {channels.find((r: Row) => r.cid === x.cid)?.name} · {x.reason}.
                Actual {rs(x.actual)} / plan {rs(x.baseline)}. Last two
                completed weeks {x.weeks.map(rs).join(" and ")}.
              </p>
            ))}
      </Panel>
      <Panel
        title="Registration drivers"
        sub="Sequential change across two adjacent periods ending on the selected date."
        aside={
          <div className="tools">
            <select
              aria-label="Driver campaign"
              value={filters.cid || ""}
              onChange={(e) => change({ cid: e.target.value })}
            >
              <option value="">All campaigns</option>
              {channels.map((r: Row) => (
                <option key={r.cid} value={r.cid}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Period"
              value={filters.days || 7}
              onChange={(e) => change({ days: +e.target.value })}
            >
              {[7, 14, 28].map((i) => (
                <option key={i} value={i}>
                  {i} days
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="miniStats">
          {[
            ["Registration change", dr.delta],
            ["Spend effect", dr.spend_effect],
            ["Sessions per ₹ effect", dr.efficiency_effect],
            ["Conversion effect", dr.conversion_effect],
          ].map(([l, v]) => (
            <div key={l}>
              <small>{l}</small>
              <b>{n(v)}</b>
            </div>
          ))}
        </div>
        {dr.spend_effect == null && (
          <p className="muted">
            A period has zero or negative spend or zero sessions. The individual
            effects are undefined.
          </p>
        )}
      </Panel>
    </>
  );
}
function Spark({ values }: { values: number[] }) {
  return (
    <svg
      width="72"
      height="25"
      aria-label="Weekly registration volumes"
      role="img"
    >
      <polyline
        fill="none"
        stroke="#3d5afe"
        strokeWidth="2"
        points={values
          .map(
            (v, i) =>
              (i * 70) / Math.max(1, values.length - 1) +
              "," +
              (23 - (v * 21) / Math.max(1, ...values)),
          )
          .join(" ")}
      />
    </svg>
  );
}
export function Budget({ db, scope }: { db: Data; scope: Row }) {
  const channels = db.campaigns.filter((r: Row) => r.cid),
    [from, setFrom] = useState("C02"),
    [to, setTo] = useState("C05"),
    [amount, setAmount] = useState("20000"),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setResult(null);
    setError("");
    api("simulate", { ...scope, from, to, amount })
      .then((x) => alive && setResult(x))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [from, to, amount, scope.as_of, scope.attribution, db]);
  return (
    <>
      <Panel
        title="Budget burn"
        sub="Posted spend and the budget approved on each reporting date."
      >
        <Trend data={db.trend} budget />
        <div className="legend">
          <i />
          Net spend
          <i className="dash" />
          Approved budget
        </div>
      </Panel>
      <Panel
        title="Budget reallocation"
        sub="Estimate · current show-up held constant"
      >
        <div className="tools">
          {[
            [from, setFrom, "Move from"],
            [to, setTo, "Move to"],
          ].map(([val, set, label]: any) => (
            <Field key={label} label={label}>
              <select value={val} onChange={(e) => set(e.target.value)}>
                {channels.map((r: Row) => (
                  <option key={r.cid} value={r.cid}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
          ))}
          <Field label="Transfer amount (₹)">
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>
        {error && <p role="alert">{error}</p>}
        {result && (
          <>
            <p className="hint">{result.answer}</p>
            <Table
              rows={result.data}
              cols={[
                ["Campaign", (r) => r.name],
                ["Linear Δ attendees", (r) => n(r.linear_attendees)],
                ["Diminishing Δ regs", (r) => n(r.delta_regs)],
                ["Diminishing Δ attendees", (r) => n(r.delta_attendees)],
                ["Saturation factor", (r) => r.k],
              ]}
            />
          </>
        )}
      </Panel>
      <Panel
        title="Campaign budgets"
        sub="Campaign allocations are editable in the manager."
      >
        <Table
          rows={channels}
          cols={[
            ["Campaign", (r) => r.name],
            ["Status", (r) => <Badge value={r.operating_status} />],
            ["Allocated", (r) => rs(r.budget)],
            ["Net spend", (r) => rs(r.spend)],
            ["Plan cost / reg", (r) => rs(r.plan_cpr)],
          ]}
        />
      </Panel>
      <Panel title="Target versions">
        <Table
          rows={db.versions}
          cols={[
            ["Effective", (r) => day(r.effective_at)],
            ["Version", (r) => r.target_version],
            ["Budget", (r) => rs(r.marketing_budget_inr)],
            ["Registration goal", (r) => n(r.registration_goal)],
          ]}
        />
      </Panel>
    </>
  );
}
