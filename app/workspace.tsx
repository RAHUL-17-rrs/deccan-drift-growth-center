"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Filter,
  Radio,
  Wallet,
  PanelsTopLeft,
  UserRoundCog,
  Route,
  Database,
  ChevronsUpDown,
  Sparkles,
  Menu,
  MapPin,
  CalendarDays,
} from "lucide-react";
import { Overview, Funnel, Campaigns, Budget } from "./analytics";
import { Operations, DataEditor } from "./operations";
import { Copilot } from "./chat";
import { api, Row, Data, owners } from "./ui";
const groups = [
  [
    "Analytics",
    [
      ["Overview", LayoutDashboard],
      ["Funnel", Filter],
      ["Campaigns", Radio],
      ["Budget", Wallet],
    ],
  ],
  [
    "Operations",
    [
      ["Manager", PanelsTopLeft],
      ["Win-back", UserRoundCog],
      ["Plan", Route],
      ["Data editor", Database],
    ],
  ],
] as const;
const headings: Row = {
  Overview: "Growth overview",
  Funnel: "Acquisition funnel",
  Campaigns: "Campaign diagnosis",
  Budget: "Marketing budget",
  Manager: "Campaign & task manager",
  "Win-back": "Win-back list",
  Plan: "2027 growth plan",
  "Data editor": "Data editor",
};
const desc: Row = {
  Overview: "Attendance, acquisition and spend across your festival campaigns.",
  Funnel: "Follow the journey from first visit to verified admission.",
  Campaigns:
    "Compare channel efficiency and investigate changes in registrations.",
  Budget: "Track approved funds, net spend and possible reallocations.",
  Manager: "Coordinate campaign ownership and follow through on team actions.",
  "Win-back": "Review eligible follow-ups by registration status.",
  Plan: "Market-led attendance targets, channel investments and decision gates.",
  "Data editor":
    "Inspect source data and review changes to the historical back-test.",
};
export default function Workspace() {
  const [page, setPage] = useState("Overview"),
    [date, setDate] = useState("2025-04-20"),
    [attr, setAttr] = useState("registration"),
    [db, setDb] = useState<Data | null>(null),
    [revision, setRevision] = useState(0),
    [filters, setFilters] = useState<Row>({}),
    [chat, setChat] = useState(false),
    [nav, setNav] = useState(false),
    [loading, setLoading] = useState(false),
    [error, err] = useState(""),
    [user, setUser] = useState("Pranit");
  const refresh = useCallback(() => setRevision((v) => v + 1), []),
    scope = { page, as_of: date, attribution: attr };
  const go = (p: string) => {
    if (!(p in headings)) return;
    setPage(p);
    window.location.hash = encodeURIComponent(p);
    setNav(false);
  };
  useEffect(() => {
    const read = () => {
      const p = decodeURIComponent(location.hash.slice(1));
      if (p in headings) setPage(p);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    let live = true;
    setLoading(true);
    err("");
    api("dashboard", { ...scope, ...filters })
      .then((x) => {
        if (live) {
          setDb({ ...x, _page: page, _date: date, _attr: attr });
          setUser(x.user);
        }
      })
      .catch((e) => live && err(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [page, date, attr, revision, filters]);
  const ready =
    db && db._page === page && db._date === date && db._attr === attr;
  // Not every page's response carries KPIs or alerts; keep the last known counts.
  const counts = useRef<Row>({});
  if (ready && db.kpi?.[0]) counts.current.Manager = db.kpi[0].open_tasks || 0;
  if (ready && Array.isArray(db.alerts))
    counts.current.Campaigns = db.alerts.filter(
      (r: Row) => r.label === "STOP",
    ).length;
  const badges = counts.current;
  const snapshot = new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <div className="shell">
      {nav && (
        <button
          className="navShade"
          aria-label="Close navigation"
          onClick={() => setNav(false)}
        />
      )}
      <aside className={"sidebar " + (nav ? "shown" : "")}>
        <div className="brand">
          <div className="brandMark" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div>
            <b>Deccan Drift</b>
            <span>Growth Center</span>
          </div>
        </div>
        <nav>
          {groups.map(([group, items]) => (
            <div key={group}>
              <h3>{group}</h3>
              {items.map(([name, Icon]) => (
                <button
                  aria-current={page === name ? "page" : undefined}
                  className={name === page ? "active" : ""}
                  key={name}
                  onClick={() => go(name)}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  {name === "Plan"
                    ? "2027 plan"
                    : name === "Manager"
                      ? "Task manager"
                      : name}
                  {badges[name] > 0 && (
                    <span
                      className={"navBadge" + (name === "Campaigns" ? " alert" : "")}
                      aria-hidden="true"
                    >
                      {badges[name]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="eventBlock">
          <span className="eventIcon">
            <FlagIcon />
          </span>
          <div>
            <b>Festival workspace</b>
            <small>Pune, India</small>
          </div>
        </div>
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {user
              .split(" ")
              .map((s) => s[0])
              .join("")}
          </span>
          <label>
            <small>Signed in as</small>
            <select
              aria-label="Current user"
              value={user}
              onChange={async (e) => {
                try {
                  await api("user", { user: e.target.value });
                  setUser(e.target.value);
                  refresh();
                } catch (e: any) {
                  err(e.message);
                }
              }}
            >
              {owners.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <ChevronsUpDown size={14} aria-hidden="true" />
        </div>
      </aside>
      <div className="main">
        <main aria-busy={loading}>
          <header className="pageHead">
            <button
              className="icon mobile"
              aria-label="Open navigation"
              onClick={() => setNav(true)}
            >
              <Menu size={20} />
            </button>
            <div className="titleBlock">
              <div className="titleRow">
                <h1>{headings[page]}</h1>
                <span className="edition">
                  {page === "Plan" ? "Deccan Drift 2027" : "CampusFest 2025"}
                </span>
              </div>
              <p>{desc[page]}</p>
            </div>
            <div className="headActions">
              <label className="scopeControl">
                <CalendarDays size={15} aria-hidden="true" />
                <span>As of</span>
                <input
                  aria-label="As of date"
                  type="date"
                  value={date}
                  min="2025-01-15"
                  max="2025-04-20"
                  onChange={(e) => {
                    if (e.target.value) setDate(e.target.value);
                  }}
                />
              </label>
              <label className="scopeControl">
                <span>Attribution</span>
                <select
                  aria-label="Attribution"
                  value={attr}
                  onChange={(e) => setAttr(e.target.value)}
                >
                  <option value="registration">Registration</option>
                  <option value="first-touch">First touch</option>
                </select>
              </label>
              <button className="copilotBtn" onClick={() => setChat(true)}>
                <Sparkles size={16} aria-hidden="true" />
                Growth Copilot
              </button>
            </div>
          </header>
          {error && (
            <div role="alert" className="error">
              {error} <button onClick={refresh}>Retry</button>
            </div>
          )}
          {!ready && !error ? (
            <div className="loading" role="status">
              Loading workspace…
            </div>
          ) : (
            ready && (
              <div className="content" key={page}>
                {page === "Overview" ? (
                  <Overview db={db} go={go} />
                ) : page === "Funnel" ? (
                  <Funnel db={db} />
                ) : page === "Campaigns" ? (
                  <Campaigns
                    db={db}
                    filters={filters}
                    change={(v) => setFilters({ ...filters, ...v })}
                  />
                ) : page === "Budget" ? (
                  <Budget db={db} scope={scope} />
                ) : page === "Data editor" ? (
                  <DataEditor db={db} refresh={refresh} />
                ) : (
                  <Operations
                    page={page}
                    db={db}
                    scope={scope}
                    refresh={refresh}
                  />
                )}
              </div>
            )
          )}
          <footer className="pageFoot">
            <span>
              Snapshot at end of {snapshot}, India Standard Time
            </span>
            <span>
              Target:{" "}
              {(ready && db.kpi?.[0]?.target_version?.replace("Attendee ", "")) ||
                "—"}
            </span>
          </footer>
        </main>
      </div>
      {chat && (
        <Copilot
          scope={scope}
          user={user}
          mode={db?.mode || "local"}
          close={() => setChat(false)}
          refresh={refresh}
        />
      )}
    </div>
  );
}
function FlagIcon() {
  return <MapPin size={17} />;
}
