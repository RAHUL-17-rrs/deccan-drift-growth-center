"use client";
import { useState, useEffect, useRef } from "react";
import { Sparkles, Send, Check, ChevronRight } from "lucide-react";
import { Modal, Row, api, day, Field, owners, rupees } from "./ui";
export function Copilot({
  scope,
  user,
  mode,
  close,
  refresh,
}: {
  scope: Row;
  user: string;
  mode: string;
  close: () => void;
  refresh: () => void;
}) {
  const storage = "growth-chat-" + user,
    [messages, setMessages] = useState<Row[]>([]),
    [conversation, setId] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, err] = useState(""),
    [edit, setEdit] = useState(""),
    [draftEdits, update] = useState<Row>({});
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(storage) || "{}");
      setMessages(s.messages || []);
      setId(s.id || "");
    } catch {}
  }, [storage]);
  function persist(items: Row[], id: string) {
    setMessages(items);
    setId(id);
    try {
      sessionStorage.setItem(
        storage,
        JSON.stringify({ messages: items.slice(-20), id }),
      );
    } catch {}
  }
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);
  async function send(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    err("");
    setText("");
    const next = [...messages, { q }];
    setMessages(next);
    try {
      const r = await api("copilot", {
        ...scope,
        question: q,
        conversation: conversation || undefined,
      });
      persist([...next.slice(0, -1), { q, ...r }], r.conversation);
    } catch (e: any) {
      err(e.message);
      setText(q);
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }
  async function resolve(m: Row, draft: Row, decision: string) {
    setBusy(true);
    err("");
    try {
      const r = await api("draft", {
        conversation: m.conversation,
        draft_id: draft.id,
        decision,
        edits: edit === draft.id ? draftEdits : {},
      });
      persist(
        messages.map((x) =>
          x === m
            ? {
                ...x,
                resolutions: { ...x.resolutions, [draft.id]: r.saved ? "Saved to task manager" : "Cancelled" },
              }
            : x,
        ),
        conversation,
      );
      setEdit("");
      refresh();
    } catch (e: any) {
      err(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Growth Copilot" onClose={close} drawer>
      <div className="chatInfo">
        <span className="statusDot" />
        {mode === "local" ? "Local query mode" : mode + " · API configured"}
        <button
          className="textBtn"
          onClick={() => {
            persist([], "");
            err("");
          }}
        >
          New chat
        </button>
      </div>
      <div className="chatScroll">
        {!messages.length && (
          <div className="welcome">
            <span className="aiMark">
              <Sparkles size={25} />
            </span>
            <h2>Ask about your campaigns</h2>
            <p>
              Explore a metric, compare channels or draft a task for your team.
            </p>
            {[
              "Which campaigns are underperforming and why?",
              "How many people came both days?",
              "How many registrations did we have on 1 March?",
            ].map((q) => (
              <button key={q} onClick={() => send(q)}>
                {q}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div className="turn" key={i}>
            <div className="bubble userBubble">{m.q}</div>
            {m.answer && (
              <>
                <div className="botName">
                  <Sparkles size={15} />
                  Growth Copilot
                </div>
                <div className="bubble answer">{m.answer}</div>
                <small className="scopeNote">
                  {day(m.scope.as_of)} · {m.scope.target} ·{" "}
                  {m.scope.attribution} attribution · {m.scope.mode}
                </small>
                <details className="trace">
                  <summary>
                    Data used · {m.calls.length}{" "}
                    {m.calls.length === 1 ? "tool" : "tools"}
                  </summary>
                  {m.calls.map((r: Row, j: number) => (
                    <details key={j}>
                      <summary>{r.ref ? r.ref + " · " : ""}{r.tool}</summary>
                      <pre>
                        {JSON.stringify(
                          { parameters: r.parameters, result: r.data },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                </details>
                {(m.drafts || (m.draft ? [m.draft] : [])).map((draft: Row) => (
                  <section className="draft" key={draft.id}>
                    <b>Task draft</b>
                    {edit === draft.id ? (
                      <>
                        {["title", "owner", "deadline"].map((k) => (
                          <Field key={k} label={k}>
                            {k === "owner" ? (
                              <select
                                value={draftEdits[k]}
                                onChange={(e) =>
                                  update({ ...draftEdits, [k]: e.target.value })
                                }
                              >
                                {owners.map((o) => (
                                  <option key={o}>{o}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={k === "deadline" ? "date" : "text"}
                                value={draftEdits[k] || ""}
                                onChange={(e) =>
                                  update({ ...draftEdits, [k]: e.target.value })
                                }
                              />
                            )}
                          </Field>
                        ))}
                      </>
                    ) : (
                      <>
                        <p>{draft.title}</p>
                        <small>
                          {draft.owner} · {day(draft.deadline)} ·{" "}
                          {draft.campaign_id || "General"}
                        </small>
                        {draft.proposed && (
                          <p>
                            On completion ·{" "}
                            {draft.proposed.status
                              ? "set campaign to " + draft.proposed.status
                              : draft.proposed.budget != null
                                ? "set allocation to " + rupees(draft.proposed.budget)
                                : JSON.stringify(draft.proposed)}
                          </p>
                        )}
                      </>
                    )}
                    {m.resolutions?.[draft.id] || m.resolved ? (
                      <div className="hint">{m.resolutions?.[draft.id] || m.resolved}</div>
                    ) : (
                      <div className="tools">
                        <button
                          disabled={busy}
                          className="primary"
                          onClick={() => resolve(m, draft, "confirm")}
                        >
                          <Check size={14} />
                          Confirm
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setEdit(draft.id);
                            update(draft);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => resolve(m, draft, "cancel")}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </section>
                ))}
              </>
            )}
          </div>
        ))}
        {busy && (
          <p className="muted" role="status">
            Checking the data…
          </p>
        )}
        <div ref={bottom} />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chatInput"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <input
          aria-label="Copilot question"
          placeholder="Ask a question…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          className="primary"
          disabled={busy || !text.trim()}
          aria-label="Send question"
        >
          <Send size={16} />
        </button>
      </form>
    </Modal>
  );
}
