// Today: the home screen. Everything that matters right now in one place —
// ask the assistant, today's quests, cards due, the lesson you're on, today's
// note — so the rest of the app can stay a tree of pages.

import { useEffect, useMemo, useState } from "react";
import { getCurriculum } from "../../../shared/course.ts";
import {
  CREATE_OPTIONS,
  PAGE_KINDS,
  TEMPLATES_SYSTEM,
  displayTitle,
  getPage,
  openDailyNote,
  type PageKind,
} from "../../../shared/model.ts";
import { ensureSkillPages, todaysQuests } from "../../../shared/skills.ts";
import { useViewContext } from "../../assistant/ChatThread.tsx";
import { Pebble } from "../../assistant/Pebble.tsx";
import { newChat, openAssistant, sendMessage, useAssistant } from "../../assistant/store.ts";
import { openTemplatePicker } from "../../components/customize/actions.tsx";
import { PageIcon } from "../../components/customize/PageIcon.tsx";
import { Avatar, Icon, timeAgo } from "../../components/ui.tsx";
import { useApp, usePages, usePeers } from "../../lib/hooks.ts";
import { isIOS, isStandalone } from "../../lib/platform.ts";
import { navigate } from "../../lib/router.ts";
import { getSettings, useSettings } from "../../lib/settings.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { courseStats, progressReader } from "../course/model.ts";
import { useDueCount } from "../registry.tsx";
import { QuestCheck } from "../skills/Overview.tsx";
import { useSkillStats, useSkillsVersion } from "../skills/useSkillXp.ts";
import { useAiAvailable } from "../tutor/ai-ui.tsx";
import "../skills/skills.css";
import "./today.css";

const MAX_QUESTS = 6;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function TodayView({ ws, onShare }: { ws: Workspace; onShare: () => void }) {
  const { openPage, createAndOpen } = useApp();
  const pages = usePages(ws);
  const settings = useSettings();
  const first = settings.identity.name.split(" ")[0];
  const recent = useMemo(
    () => [...pages].filter((p) => !p.system).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [pages],
  );
  // Every skill is a page; skills from older versions get theirs.
  useEffect(() => ensureSkillPages(ws.doc), [ws]);
  const templateCount = useMemo(() => {
    const root = pages.find((p) => p.system === TEMPLATES_SYSTEM)?.id;
    return root ? pages.filter((p) => p.parentId === root).length : 0;
  }, [pages]);

  return (
    <div className="page-column td-root">
      <header className="td-head">
        <h1>
          {greeting()}
          {first ? `, ${first}` : ""}
        </h1>
        <div className="muted">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
      </header>

      <InstallHint />
      <AskBox ws={ws} />

      <div className="td-now">
        <Quests ws={ws} />
        <div className="td-side">
          <button className="home-card accent td-tile" onClick={() => openPage(openDailyNote(ws.doc, getSettings().identity.name))}>
            <Icon name="calendar" size={20} />
            <strong>Today’s note</strong>
            <span className="small muted">Journal, plans, anything</span>
          </button>
          <ReviewTile ws={ws} />
          <CharacterTile ws={ws} />
        </div>
      </div>

      <Learning ws={ws} />

      <h3 className="home-section">Create</h3>
      <div className="td-create">
        {CREATE_OPTIONS.map((o) => (
          <button key={o.id} className="td-chip" title={o.description} onClick={() => createAndOpen(o.input)}>
            <span aria-hidden>{o.icon}</span> {o.label}
          </button>
        ))}
        <button
          className="td-chip"
          title={templateCount ? `${templateCount} saved template${templateCount === 1 ? "" : "s"} + starters` : "Meeting notes, weekly review, reading notes…"}
          onClick={() => openTemplatePicker(null)}
        >
          <span aria-hidden>📋</span> From template
        </button>
      </div>

      <div className="row td-section-row">
        <h3 className="home-section grow">Recently edited</h3>
        <Online ws={ws} onShare={onShare} />
      </div>
      {recent.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">🪨</div>
          <div>Your workspace is empty. Create a page above, or import an Obsidian vault in Settings → Import & export.</div>
        </div>
      ) : (
        <div className="recent-grid">
          {recent.map((p) => (
            <button key={p.id} className="recent-card" onClick={() => openPage(p.id)}>
              <PageIcon meta={p} className="recent-icon" />
              <span className="col" style={{ gap: 0, minWidth: 0, alignItems: "flex-start" }}>
                <span className="ellipsis" style={{ maxWidth: "100%" }}>
                  {displayTitle(p)}
                </span>
                <span className="small faint">
                  {PAGE_KINDS.find((k) => k.kind === p.kind)?.label} · {timeAgo(p.updatedAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  "Plan my day",
  "What should I focus on this week?",
  "Teach me something new",
  "Set up skills and daily quests for me",
];

/** A message box that starts a new chat with the assistant. */
function AskBox({ ws }: { ws: Workspace }) {
  const settings = useSettings();
  const name = settings.assistant.name;
  const available = useAiAvailable();
  const s = useAssistant();
  const context = useViewContext(ws);
  const [text, setText] = useState("");

  const ask = (value: string) => {
    const t = value.trim();
    openAssistant(true);
    // Without Claude connected, the panel explains how; keep what was typed.
    if (!t || !available || s.running) return;
    setText("");
    newChat();
    void sendMessage(ws, t, context(), null);
  };

  return (
    <section className="td-ask" aria-label={`Ask ${name}`}>
      <form
        className="td-ask-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <button type="button" className="td-ask-avatar" onClick={() => openAssistant(true)} title={`Open ${name}`} aria-label={`Open ${name}`}>
          <Pebble size={30} mood={s.mood} />
        </button>
        <input
          className="td-ask-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ask ${name} anything…`}
          aria-label={`Message ${name}`}
        />
        <button type="submit" className="btn btn-primary btn-sm td-ask-send" disabled={!text.trim()} aria-label="Send">
          <Icon name="arrowUp" />
        </button>
      </form>
      <div className="td-suggest">
        {SUGGESTIONS.map((t) => (
          <button key={t} type="button" className="td-suggest-chip" onClick={() => ask(t)}>
            {t}
          </button>
        ))}
      </div>
    </section>
  );
}

function Quests({ ws }: { ws: Workspace }) {
  const version = useSkillsVersion(ws);
  const name = useSettings().assistant.name;
  const quests = useMemo(() => todaysQuests(ws.doc), [ws, version]);
  const done = quests.filter((q) => q.status.done).length;
  const skills = () => navigate({ name: "view", wsId: ws.id, view: "skills" });
  return (
    <section className="card td-quests" aria-labelledby="td-quests-title">
      <div className="row td-card-head">
        <Icon name="tree" />
        <strong id="td-quests-title" className="grow">
          Quests
        </strong>
        {quests.length > 0 && (
          <span className="small muted">
            {done} of {quests.length} done
          </span>
        )}
      </div>
      {quests.length === 0 ? (
        <div className="td-quests-empty">
          <p className="small muted">
            Quests are small habits that level up your skills: “Practice guitar 20 minutes”, “Read 10 pages”. Tick them off here each
            day.
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-sm" onClick={skills}>
              <Icon name="tree" /> Open skill tree
            </button>
            <span className="small faint">or ask {name} to set some up</span>
          </div>
        </div>
      ) : (
        <div className="sk-quest-list">
          {quests.slice(0, MAX_QUESTS).map((q) => (
            <QuestCheck key={`${q.skill.id}:${q.status.quest.id}`} ws={ws} q={q} />
          ))}
          {quests.length > MAX_QUESTS && (
            <button className="btn btn-sm btn-ghost td-more" onClick={skills}>
              {quests.length - MAX_QUESTS} more in the skill tree
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewTile({ ws }: { ws: Workspace }) {
  const due = useDueCount(ws);
  return (
    <button className="home-card td-tile" onClick={() => navigate({ name: "view", wsId: ws.id, view: "learn" })}>
      <Icon name="cards" size={20} />
      <strong>{due > 0 ? `${due} card${due === 1 ? "" : "s"} to review` : "No cards due"}</strong>
      <span className="small muted">{due > 0 ? `About ${Math.max(1, Math.round(due / 4))} min` : "Write “Question :: Answer” in any page"}</span>
    </button>
  );
}

function CharacterTile({ ws }: { ws: Workspace }) {
  const stats = useSkillStats(ws);
  return (
    <button className="home-card td-tile" onClick={() => navigate({ name: "view", wsId: ws.id, view: "skills" })}>
      <Icon name="sparkle" size={20} />
      <strong>{stats.skills ? `Level ${stats.level}` : "Your character"}</strong>
      <span className="small muted">
        {stats.skills ? `${stats.title} · ${stats.skills} skill${stats.skills === 1 ? "" : "s"}` : "Level up like a D&D character"}
      </span>
    </button>
  );
}

/** Courses with their next lesson. */
function Learning({ ws }: { ws: Workspace }) {
  const { openPage, createAndOpen } = useApp();
  const pages = usePages(ws);
  const version = useSkillsVersion(ws);
  const courses = useMemo(() => {
    const out: { id: string; title: string; icon: string; next: string; level: string; done: number; total: number; at: number }[] = [];
    for (const meta of pages) {
      if (meta.kind !== "course") continue;
      const page = getPage(ws.doc, meta.id);
      const c = page ? getCurriculum(page) : null;
      if (!page || !c) continue;
      const st = courseStats(c, progressReader(page));
      if (!st.nextUp) continue;
      out.push({
        id: meta.id,
        title: displayTitle(meta),
        icon: meta.icon || "🎓",
        next: st.nextUp.lesson.title,
        level: st.nextUp.level.name,
        done: st.done,
        total: st.total,
        at: meta.updatedAt,
      });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, 3);
  }, [pages, ws, version]);

  return (
    <>
      <div className="row td-section-row">
        <h3 className="home-section grow">Keep learning</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => createAndOpen({ kind: "course", icon: "🎓" })}>
          <Icon name="plus" /> Learn something new
        </button>
      </div>
      {courses.length === 0 ? (
        <button className="card td-learn-empty" onClick={() => createAndOpen({ kind: "course", icon: "🎓" })}>
          <span className="td-learn-icon" aria-hidden>
            🎓
          </span>
          <span className="col" style={{ gap: 2, alignItems: "flex-start" }}>
            <strong>Learn anything, from scratch to the research frontier</strong>
            <span className="small muted">
              Pick a topic and Claude designs a course: a roadmap, lessons written as you reach them, quizzes and flashcards.
            </span>
          </span>
        </button>
      ) : (
        <div className="td-learn">
          {courses.map((c) => (
            <button key={c.id} className="home-card td-course" onClick={() => openPage(c.id)}>
              <span className="row" style={{ gap: 8, minWidth: 0, width: "100%" }}>
                <span className="td-learn-icon" aria-hidden>
                  {c.icon}
                </span>
                <strong className="ellipsis grow">{c.title}</strong>
              </span>
              <span className="small muted ellipsis" style={{ maxWidth: "100%" }}>
                Next: {c.next}
              </span>
              <span className="td-progress" aria-label={`${c.done} of ${c.total} lessons done`}>
                <span style={{ width: `${c.total ? (100 * c.done) / c.total : 0}%` }} />
              </span>
              <span className="small faint">
                {c.level} · {c.done}/{c.total} lessons
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function Online({ ws, onShare }: { ws: Workspace; onShare: () => void }) {
  const peers = usePeers(ws);
  return (
    <button className="btn btn-sm btn-ghost td-online" onClick={onShare} title="Share & sync — end-to-end encrypted">
      {peers.length ? (
        <>
          <span className="row" style={{ gap: 2 }}>
            {peers.slice(0, 4).map((p) => (
              <Avatar key={p.clientId} name={p.state.user.name} color={p.state.user.color} size={18} />
            ))}
          </span>
          {peers.length} online
        </>
      ) : (
        <>
          <Icon name="users" /> Invite & sync
        </>
      )}
    </button>
  );
}

/** iPhone/iPad in a Safari tab: suggest installing to the Home Screen. */
function InstallHint() {
  const [dismissed, setDismissed] = useState(() => !!localStorage.getItem("basalt:install-hint"));
  if (!isIOS || isStandalone() || dismissed) return null;
  return (
    <div className="install-hint">
      <Icon name="share" size={18} />
      <div className="grow">
        <strong>Install Basalt on this {/iPhone|iPod/.test(navigator.userAgent) ? "iPhone" : "iPad"}</strong>
        <div className="small muted">
          Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. It opens full-screen like an app and Safari keeps its data
          safe (tabs can lose website data after a week without use).
        </div>
      </div>
      <button
        className="icon-btn"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem("basalt:install-hint", "1");
          setDismissed(true);
        }}
      >
        <Icon name="x" />
      </button>
    </div>
  );
}
