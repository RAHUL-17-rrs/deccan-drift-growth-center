"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ScanLine,
  Ticket,
  UsersRound,
  Wallet,
  ListTodo,
  Radio,
  Activity,
} from "lucide-react";
import { Trend } from "./charts";
import {
  Data,
  Row,
  Panel,
  amount as n,
  rupees as rs,
  percent as pc,
} from "./ui";

function ProgressRing({ value }: { value: number | null }) {
  const fill = Math.max(0, Math.min(1, value || 0));
  return (
    <svg className="targetRing" viewBox="0 0 58 58" aria-hidden="true">
      <circle
        cx="29"
        cy="29"
        r="24"
        fill="none"
        stroke="#ffffff29"
        strokeWidth="4"
      />
      <circle
        cx="29"
        cy="29"
        r="24"
        fill="none"
        stroke="#cfeb97"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={fill * 150.8 + " 151"}
        transform="rotate(-90 29 29)"
      />
      <path
        d="M24 37V20m0 1c4-4 7 4 12 0v9c-5 4-8-4-12 0"
        fill="none"
        stroke="#d9efb2"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function GoalLine({ value, detail }: { value: number | null; detail: string }) {
  return (
    <>
      <div className="goalLine">
        <i
          style={{
            width: Math.min(100, Math.max(0, (value || 0) * 100)) + "%",
          }}
        />
      </div>
      <small>{detail}</small>
    </>
  );
}
export function Overview({ db, go }: { db: Data; go: (p: string) => void }) {
  const k = db.kpi[0],
    channels = db.campaigns.filter((r: Row) => r.cid);
  const [window, setWindow] = useState(0),
    [rankMetric, setRankMetric] = useState("attendees");
  const recent = window ? db.trend.slice(-window) : db.trend;
  const ranked = channels
    .filter((r: Row) => r[rankMetric] != null)
    .sort((a: Row, b: Row) =>
      rankMetric === "attendees" ? b.attendees - a.attendees : a.cpa - b.cpa,
    );
  const max = Math.max(1, ...ranked.map((x: Row) => x[rankMetric]));
  const dr = db.driver[0],
    atGoal = k.attendee_goal == null ? null : k.attendees - k.attendee_goal;
  const weeks = db.trend.slice(-7),
    previous = db.trend.slice(-14, -7),
    net = (v: Row[]) => v.reduce((sum, x) => sum + x.spend, 0);
  const formatRank = rankMetric === "attendees" ? n : rs;
  const compareFunnel = k.is_estimate
    ? "Forecast from pace and expected show-up"
    : "Observed at event close";
  const stats = [
    {
      label: "Registrations",
      v: n(k.regs),
      value: k.reg_attainment,
      detail: pc(k.reg_attainment) + " of " + n(k.reg_goal) + " goal",
      Icon: Ticket,
    },
    {
      label: "Identified people",
      v: n(k.identified),
      value: k.identified_attainment,
      detail:
        pc(k.identified_attainment) + " of " + n(k.identified_goal) + " goal",
      Icon: UsersRound,
    },
    {
      label: "Net spend",
      v: rs(k.spend),
      value: k.budget_used,
      detail: pc(k.budget_used) + " of " + rs(k.budget) + " budget",
      Icon: Wallet,
    },
  ];
  return (
    <>
      <div className="stats overviewStats">
        <article className="stat lead attendance">
          <div className="statTop">
            <span>
              <ScanLine size={16} /> Unique attendees
            </span>
          </div>
          <strong>{n(k.attendees)}</strong>
          <ProgressRing value={k.attendee_attainment} />
          <small>
            <b>{pc(k.attendee_attainment)}</b> of {n(k.attendee_goal)} goal
          </small>
        </article>
        {stats.map(({ label, v, value, detail, Icon }) => (
          <article className="stat" key={label}>
            <div className="statTop">
              <span>{label}</span>
              <Icon size={16} />
            </div>
            <strong>{v}</strong>
            <GoalLine value={value} detail={detail} />
          </article>
        ))}
      </div>
      <div className="gridWide chartsRow">
        <Panel
          title="Registration pace"
          sub="Actual registrations against the expected pace."
          aside={
            <div className="seg chartRange">
              {[
                [0, "Season"],
                [42, "6w"],
                [21, "3w"],
              ].map(([val, l]) => (
                <button
                  key={val}
                  aria-pressed={val === window}
                  className={val === window ? "on" : ""}
                  onClick={() => setWindow(Number(val))}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        >
          <div className="chartReadout">
            <b>{pc(k.pacing)}</b>
            <span>of expected registrations</span>
          </div>
          <div className="legend">
            <i />
            Actual <i className="dash" />
            Expected
          </div>
          <Trend data={recent} />
        </Panel>
        <Panel
          title="Channel performance"
          sub={
            rankMetric === "attendees"
              ? "Ranked by unique verified attendees."
              : "Ranked from lowest cost per attendee."
          }
          aside={
            <button
              className="icon arrowLink"
              aria-label="Open campaign diagnosis"
              onClick={() => go("Campaigns")}
            >
              <ArrowUpRight size={16} />
            </button>
          }
        >
          <div className="seg rankSwitch">
            {[
              ["attendees", "Attendance"],
              ["cpa", "Cost / attendee"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={rankMetric === v ? "on" : ""}
                aria-pressed={rankMetric === v}
                onClick={() => setRankMetric(v)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="ranking">
            {ranked.slice(0, 5).map((r: Row, i: number) => (
              <div key={r.cid}>
                <div>
                  <span>{r.name}</span>
                  <b>{formatRank(r[rankMetric])}</b>
                </div>
                <div className="bar">
                  <i
                    style={{
                      width: (100 * r[rankMetric]) / max + "%",
                      background: [
                        "#266648",
                        "#438060",
                        "#699878",
                        "#8bab8a",
                        "#a5bd98",
                      ][i],
                    }}
                  />
                </div>
              </div>
            ))}
            {!ranked.length && (
              <p className="muted">
                Cost per attendee becomes available after verified attendance.
              </p>
            )}
          </div>
          <button className="cardLink" onClick={() => go("Campaigns")}>
            Compare all {channels.length} campaigns <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
      <div className="signalStrip">
        <div className="signalTitle">
          <Activity size={17} />
          <b>Last 7 days</b>
        </div>
        <div>
          <strong>{n(dr.current_regs)}</strong> registrations{" "}
          <small>vs {n(dr.previous_regs)} prior week</small>
        </div>
        <div>
          <strong>{rs(net(weeks))}</strong> net spend{" "}
          <small>vs {rs(net(previous))} prior week</small>
        </div>
        <button className="textBtn" onClick={() => go("Campaigns")}>
          See drivers <ArrowRight size={14} />
        </button>
      </div>
      <div className="gridWide decisionRow">
        <Panel title="Attendance outlook" sub={compareFunnel}>
          <div className="outlookGrid">
            {[
              [
                "Confirmed registrations",
                n(k.confirmed),
                "Latest status · no separate goal supplied",
              ],
              [
                "Cost per attendee",
                rs(k.cpa),
                "Budget per target attendee " +
                  rs(k.attendee_goal ? k.budget / k.attendee_goal : null),
              ],
              [
                "Projected registrations",
                n(k.projected_regs),
                "From the editable registration pace curve",
              ],
              [
                "Projected attendees",
                n(k.projected_attendees),
                k.is_estimate
                  ? "Includes assumed show-up and walk-ins"
                  : atGoal == null
                    ? "No active goal"
                    : n(Math.abs(atGoal)) +
                      (atGoal <= 0 ? " below" : " above") +
                      " visitor goal",
              ],
            ].map(([l, v, help]) => (
              <div key={l}>
                <small>{l}</small>
                <b>{v}</b>
                <span>{help}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Team actions"
          sub="Current assignments and campaign decisions."
        >
          <button className="actionRow" onClick={() => go("Manager")}>
            <span className="actionIcon">
              <ListTodo size={18} />
            </span>
            <span>
              <b>Open action items</b>
              <small>View task manager</small>
            </span>
            <strong>{n(k.open_tasks)}</strong>
            <ArrowRight size={14} />
          </button>
          <button className="actionRow" onClick={() => go("Campaigns")}>
            <span className="actionIcon">
              <Radio size={18} />
            </span>
            <span>
              <b>Stop alerts</b>
              <small>Two weeks above threshold</small>
            </span>
            <strong>
              {n(db.alerts.filter((r: Row) => r.label === "STOP").length)}
            </strong>
            <ArrowRight size={14} />
          </button>
        </Panel>
      </div>
    </>
  );
}
