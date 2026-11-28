"use client";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  ScanLine,
  Ticket,
  UsersRound,
  Wallet,
  ListTodo,
  Radio,
  Activity,
  TrendingUp,
  Telescope,
} from "lucide-react";
import { Trend, Sparkline } from "./charts";
import {
  Data,
  Row,
  Panel,
  amount as n,
  rupees as rs,
  percent as pc,
} from "./ui";

function ProgressRing({ value }: { value: number | null }) {
  const fill = Math.max(0, Math.min(1, value || 0)),
    c = 2 * Math.PI * 52;
  return (
    <svg className="targetRing" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--success-soft)" strokeWidth="9" />
      <circle
        cx="60"
        cy="60"
        r="52"
        fill="none"
        stroke="var(--success)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={fill * c + " " + c}
        transform="rotate(-90 60 60)"
      />
    </svg>
  );
}
const ringStatus = (v: number | null) =>
  v == null ? "No goal set" : v >= 1 ? "Goal met" : v >= 0.9 ? "Near goal" : "Behind goal";
function weekly(trend: Row[], key: string) {
  const out: { x: string; v: number }[] = [];
  for (let i = 0; i < trend.length; i += 7)
    out.push({
      x: trend[i].day,
      v: trend.slice(i, i + 7).reduce((t, r) => t + (Number(r[key]) || 0), 0),
    });
  return out;
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
      detail: "of " + n(k.reg_goal) + " goal",
      Icon: Ticket,
      tone: "blue",
      color: "#3d5afe",
      series: weekly(db.trend, "regs"),
      caption: "Weekly registrations",
      link: ["View funnel", "Funnel"],
    },
    {
      label: "Identified people",
      v: n(k.identified),
      value: k.identified_attainment,
      detail: "of " + n(k.identified_goal) + " goal",
      Icon: UsersRound,
      tone: "violet",
      color: "#7a5af0",
      series: weekly(db.trend, "sessions"),
      caption: "Weekly landing sessions",
      link: ["View campaigns", "Campaigns"],
    },
    {
      label: "Net spend",
      v: rs(k.spend),
      value: k.budget_used,
      detail: "of " + rs(k.budget) + " budget",
      Icon: Wallet,
      tone: "green",
      color: "#16a06a",
      series: weekly(db.trend, "spend"),
      caption: "Weekly net spend",
      link: ["View budget", "Budget"],
    },
  ];
  return (
    <>
      <div className="stats overviewStats">
        <article className="stat lead attendance">
          <div className="statTop">
            <span>Unique attendees</span>
            <span className="chip green" aria-hidden="true">
              <ScanLine size={16} />
            </span>
          </div>
          <div className="ringWrap">
            <ProgressRing value={k.attendee_attainment} />
            <div className="ringCenter">
              <strong>{n(k.attendees)}</strong>
              <small>{ringStatus(k.attendee_attainment)}</small>
            </div>
          </div>
          <p className="ringNote">
            {pc(k.attendee_attainment)} of {n(k.attendee_goal)} attendee goal
          </p>
          <button className="statLink" onClick={() => go("Funnel")}>
            View attendance funnel <ChevronRight size={15} />
          </button>
        </article>
        {stats.map(
          ({ label, v, value, detail, Icon, tone, color, series, caption, link }) => (
            <article className={"stat " + tone} key={label}>
              <div className="statTop">
                <span>{label}</span>
                <span className={"chip " + tone} aria-hidden="true">
                  <Icon size={16} />
                </span>
              </div>
              <strong>{v}</strong>
              <div className="statMeta">
                <span
                  className={
                    "goalPill " +
                    (value == null ? "" : value >= 0.9 ? "good" : "watch")
                  }
                >
                  {pc(value)}
                </span>
                <small>{detail}</small>
              </div>
              <Sparkline data={series} color={color} label={caption} />
              <button className="statLink" onClick={() => go(link[1])}>
                {link[0]} <ChevronRight size={15} />
              </button>
            </article>
          ),
        )}
      </div>
      <div className="gridWide chartsRow">
        <Panel
          title="Registration pace"
          sub="Actual registrations against the expected pace."
          icon={<TrendingUp size={17} />}
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
          icon={<Radio size={17} />}
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
                        "#3d5afe",
                        "#5468fb",
                        "#6a6ef7",
                        "#8a86f3",
                        "#aaa3f4",
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
          <strong>{rs(net(weeks))}</strong>{" "}
          {net(weeks) < 0 ? "net spend (credits)" : "net spend"}{" "}
          <small>vs {rs(net(previous))} prior week</small>
        </div>
        <button className="textBtn" onClick={() => go("Campaigns")}>
          See drivers <ArrowRight size={14} />
        </button>
      </div>
      <div className="gridWide decisionRow">
        <Panel
          title="Attendance outlook"
          sub={compareFunnel}
          icon={<Telescope size={17} />}
        >
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
                      " attendee goal",
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
          icon={<ListTodo size={17} />}
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
