"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronUp } from "lucide-react";
import {
  ReactNode,
  ReactElement,
  cloneElement,
  isValidElement,
  useId,
  useState,
} from "react";
export type Row = Record<string, any>;
export type Data = Record<string, any>;
export const amount = (n: any) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
export const rupees = (n: any) => (n == null ? "—" : "₹" + amount(n));
export const percent = (n: any) =>
  n == null ? "—" : (n * 100).toFixed(1).replace(/\.0$/, "") + "%";
export const day = (s: string) =>
  s
    ? new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
export const owners = [
  "Pranit",
  "Meera Iyer",
  "Arjun Verma",
  "Nisha Rao",
  "Dev Malhotra",
];
export async function api(route: string, v: Row) {
  const r = await fetch("/api/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(v),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Request failed");
  return j;
}
export function Panel({
  title,
  aside,
  children,
  sub,
  icon,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  sub?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(true),
    bodyId = useId();
  return (
    <section className={"panel" + (open ? "" : " collapsed")}>
      <div className="panelHead">
        {icon && (
          <span className="panelIcon" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="panelTitle">
          <h2>{title}</h2>
          {sub && open && <p>{sub}</p>}
        </div>
        {open && aside}
        <button
          className="icon collapseBtn"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={(open ? "Collapse " : "Expand ") + title}
          onClick={() => setOpen(!open)}
        >
          <ChevronUp size={16} />
        </button>
      </div>
      <div className="panelBody" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
export function Table({
  cols,
  rows,
  empty = "No matching records.",
}: {
  cols: [string, (r: Row) => ReactNode][];
  rows: Row[];
  empty?: string;
}) {
  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            {cols.map(([t], i) => (
              <th key={i}>{t}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.rid ?? r.id ?? r.cid ?? i}>
              {cols.map(([, fn], j) => (
                <td key={j}>{fn(r) ?? "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">{empty}</p>}
    </div>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={"badge " + (value || "").toLowerCase().replaceAll(" ", "-")}
    >
      {value?.toLowerCase() || "—"}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  drawer = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
}) {
  return (
    <Dialog.Root open onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className={drawer ? "drawer" : "modal"}
          aria-describedby={undefined}
        >
          <div className="modalHead">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="icon" aria-label="Close">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id: string }>, { id })
        : children}
    </div>
  );
}
export function csvDownload(filename: string, items: Row[]) {
  if (!items.length) return;
  const keys = Object.keys(items[0]);
  const safe = (v: any) =>
    '"' +
    String(v ?? "")
      .replace(/^([=+@-])/, "'$1")
      .replaceAll('"', '""') +
    '"';
  const url = URL.createObjectURL(
    new Blob(
      [
        [keys, ...items.map((r) => keys.map((k) => r[k]))]
          .map((r) => r.map(safe).join(","))
          .join("\r\n"),
      ],
      { type: "text/csv;charset=utf-8" },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
