// Page view for kind "course": an AI tutor that takes the learner from first
// principles to the research frontier. Shows setup / curriculum generation,
// then the roadmap, lesson study mode, placement test and tutor chat.

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import { courseMap, getCurriculum, type LessonStatus } from "../../../shared/course.ts";
import { displayTitle, pageMeta } from "../../../shared/model.ts";
import { Modal } from "../../components/ui.tsx";
import { useApp, useMediaQuery, usePeers, useY } from "../../lib/hooks.ts";
import type { Workspace } from "../../lib/workspace.ts";
import { ErrorNote, NoKeyPanel, scrollParent, useAiAvailable } from "../tutor/ai-ui.tsx";
import { GoalPicker, LevelPicker } from "../tutor/CourseForm.tsx";
import { startLevelIndex } from "../tutor/levels.ts";
import type { PageViewProps } from "../types.ts";
import { startCurriculum, startLesson } from "./generate.ts";
import { cancelJob, clearJob, isRunning, jobKeys, useJob, useJobStatusVersion } from "./jobs.ts";
import { LessonStudy } from "./LessonStudy.tsx";
import {
  courseInfo,
  courseStats,
  lessonRefs,
  pageAlive,
  progressReader,
  recallOpenLesson,
  rememberOpenLesson,
  TUTOR_ORIGIN,
  writeProgress,
} from "./model.ts";
import { Placement } from "./Placement.tsx";
import { Roadmap } from "./Roadmap.tsx";
import { CourseSetup, CurriculumProgress, saveCourseOptions } from "./Setup.tsx";
import { TutorChat } from "./TutorChat.tsx";
import { CoursePath } from "../lessons/CoursePath.tsx";
import "./course.css";

type Mode = { name: "roadmap" } | { name: "lesson"; lessonId: string } | { name: "placement" };

const CHAT_PREF = "basalt:tutor-chat-open";

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage unavailable; preference just isn't remembered
  }
}

export default function CourseView(props: PageViewProps) {
  const course = courseMap(props.page) as Y.Map<any> | undefined;
  useY(course);
  // Interactive courses (Brilliant-style lessons) are a path to walk; older
  // AI-tutor courses keep their roadmap and written lessons.
  if (course?.get("format") === "interactive") return <CoursePath key={props.pageId} ws={props.ws} pageId={props.pageId} page={props.page} />;
  return <CourseBody key={props.pageId} {...props} />;
}

function CourseBody({ ws, pageId, page }: PageViewProps) {
  const app = useApp();
  const course = courseMap(page) as Y.Map<any> | undefined;
  useY(course, true);
  useY(page);
  const hasKey = useAiAvailable();
  const peers = usePeers(ws);
  const desktop = useMediaQuery("(min-width: 1100px)");
  const rootRef = useRef<HTMLDivElement>(null);

  const curriculum = course ? getCurriculum(page) : null;
  const refs = useMemo(() => (curriculum ? lessonRefs(curriculum) : []), [curriculum]);
  const progressOf = progressReader(page);
  const stats = curriculum ? courseStats(curriculum, progressOf) : null;
  const info = courseInfo(page);
  const courseTitle = displayTitle(pageMeta(page)) || info.topic;

  const [mode, setModeState] = useState<Mode>(() => {
    const id = recallOpenLesson(pageId);
    return id ? { name: "lesson", lessonId: id } : { name: "roadmap" };
  });
  const setMode = (m: Mode) => {
    rememberOpenLesson(pageId, m.name === "lesson" ? m.lessonId : null);
    setModeState(m);
    const scroller = scrollParent(rootRef.current);
    if (scroller) scroller.scrollTop = 0;
  };
  const lessonRef = mode.name === "lesson" ? refs.find((r) => r.lesson.id === mode.lessonId) : undefined;

  const [chatOpen, setChatOpen] = useState(() => desktop && readPref(CHAT_PREF) === "1");
  const openChat = (open: boolean) => {
    setChatOpen(open);
    if (desktop) writePref(CHAT_PREF, open ? "1" : "0");
  };

  const hintKey = `basalt:course-placement-hint:${pageId}`;
  const [hintDismissed, setHintDismissed] = useState(() => readPref(hintKey) === "dismissed");
  const [regenOpen, setRegenOpen] = useState(false);
  const [lastFeedback, setLastFeedback] = useState<string | undefined>();

  // Curriculum generation, here or on a collaborator's device.
  const curriculumKey = jobKeys.curriculum(pageId);
  const cJob = useJob(curriculumKey);
  const generatingHere = cJob?.status === "running";
  const status = course?.get("status") as string | undefined;
  const genClient = course?.get("generatingClient") as number | undefined;
  const genPeer = status === "generating" && genClient !== ws.doc.clientID ? peers.find((p) => p.clientId === genClient) : undefined;
  const genBy = (course?.get("generatingBy") as string | undefined) || genPeer?.state.user.name || "A collaborator";
  const genStarted = (course?.get("generationStartedAt") as number | undefined) ?? Date.now();
  const interrupted = status === "generating" && !generatingHere && !genPeer;

  // Writing a lesson from any view keeps the job alive; re-render when any finishes.
  const hasPage = (lessonId: string) => pageAlive(ws.doc, progressOf(lessonId).lessonPageId);
  const writing = (lessonId: string) => isRunning(jobKeys.lesson(pageId, lessonId));
  useJobStatusVersion();

  // The open lesson can disappear when the roadmap is redesigned.
  useEffect(() => {
    if (mode.name === "lesson" && curriculum && !lessonRef) {
      rememberOpenLesson(pageId, null);
      setModeState({ name: "roadmap" });
    }
  }, [mode, curriculum, lessonRef, pageId]);

  const generate = (feedback?: string) => {
    clearJob(curriculumKey);
    setLastFeedback(feedback);
    void startCurriculum(ws, pageId, feedback);
  };

  const openLesson = (lessonId: string, opts?: { start?: boolean }) => {
    if (opts?.start && hasKey && !hasPage(lessonId) && !writing(lessonId)) {
      clearJob(jobKeys.lesson(pageId, lessonId));
      void startLesson(ws, pageId, lessonId);
    }
    setMode({ name: "lesson", lessonId });
  };

  const setStatus = (ids: string[], s: LessonStatus | "reset") => {
    ws.doc.transact(() => {
      for (const id of ids) {
        if (s === "reset") writeProgress(page, id, { status: hasPage(id) ? "in-progress" : "not-started", mastery: 0, quizzes: [] });
        else writeProgress(page, id, { status: s });
      }
    }, TUTOR_ORIGIN);
  };

  let body;
  if (!course) {
    body = (
      <div className="empty">
        <div className="empty-icon">🎓</div>
        <div>This course's data is missing. Create a new course from the Tutor.</div>
      </div>
    );
  } else if (!curriculum) {
    body = generatingHere ? (
      <CurriculumProgress topic={info.topic} chars={cJob.chars} startedAt={cJob.startedAt} onCancel={() => cancelJob(curriculumKey)} />
    ) : genPeer ? (
      <CurriculumProgress topic={info.topic} chars={0} startedAt={genStarted} by={genBy} />
    ) : (
      <CourseSetup
        ws={ws}
        page={page}
        pageId={pageId}
        hasKey={hasKey}
        error={cJob?.status === "error" ? cJob.error : undefined}
        interrupted={interrupted || cJob?.status === "cancelled"}
        onGenerate={() => generate()}
      />
    );
  } else if (stats) {
    const banner = generatingHere ? (
      <CurriculumProgress compact topic={info.topic} chars={cJob.chars} startedAt={cJob.startedAt} onCancel={() => cancelJob(curriculumKey)} />
    ) : genPeer ? (
      <CurriculumProgress compact topic={info.topic} chars={0} startedAt={genStarted} by={genBy} />
    ) : cJob?.status === "error" ? (
      <div className="co-banner-error">
        <ErrorNote message={`Couldn't redesign the roadmap: ${cJob.error}`} onRetry={hasKey ? () => generate(lastFeedback) : undefined} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => clearJob(curriculumKey)}>
          Dismiss
        </button>
      </div>
    ) : null;

    body = (
      <>
        {banner}
        {mode.name === "lesson" && lessonRef ? (
          <LessonStudy
            key={lessonRef.lesson.id}
            ws={ws}
            page={page}
            pageId={pageId}
            refs={refs}
            lessonRef={lessonRef}
            progress={progressOf(lessonRef.lesson.id)}
            hasKey={hasKey}
            courseTitle={courseTitle}
            onBack={() => setMode({ name: "roadmap" })}
            onOpenLesson={(id) => setMode({ name: "lesson", lessonId: id })}
            onAskTutor={() => openChat(true)}
          />
        ) : mode.name === "placement" ? (
          <Placement
            ws={ws}
            page={page}
            pageId={pageId}
            curriculum={curriculum}
            hasKey={hasKey}
            courseTitle={courseTitle}
            onDone={() => {
              setHintDismissed(true);
              writePref(hintKey, "dismissed");
              setMode({ name: "roadmap" });
            }}
          />
        ) : (
          <>
            <Roadmap
              key={curriculum.levels[0]?.id}
              curriculum={curriculum}
              stats={stats}
              progressOf={progressOf}
              hasPage={hasPage}
              writing={writing}
              onOpenLesson={openLesson}
              onSetStatus={setStatus}
              onOpenLessonPage={(id) => {
                const pid = progressOf(id).lessonPageId;
                if (pid) app.openPage(pid);
              }}
              onPlacement={() => setMode({ name: "placement" })}
              onRegenerate={() => setRegenOpen(true)}
              onOpenChat={() => openChat(true)}
              suggestedStartLevel={startLevelIndex(info.startLevel)}
              showPlacementHint={!hintDismissed && stats.done === 0 && stats.inProgress === 0}
              onDismissPlacementHint={() => {
                setHintDismissed(true);
                writePref(hintKey, "dismissed");
              }}
            />
            {!hasKey && (
              <NoKeyPanel
                ws={ws}
                compact
                title="Connect Claude to keep learning"
                lead="Lessons, quizzes and the tutor chat are written by Claude."
                claudePrompt={`Continue my Basalt course “${courseTitle}”: teach me the next lesson.`}
              />
            )}
          </>
        )}
      </>
    );
  }

  const chatVisible = !!curriculum && chatOpen;

  return (
    <div ref={rootRef} className={`co-root${chatVisible && desktop ? " chat-docked" : ""}`}>
      <div className="page-column co-column">{body}</div>
      {curriculum &&
        (chatVisible ? (
          <TutorChat
            ws={ws}
            page={page}
            curriculum={curriculum}
            lessonRef={lessonRef}
            hasKey={hasKey}
            courseTitle={courseTitle}
            docked={desktop}
            onClose={() => openChat(false)}
          />
        ) : (
          <button type="button" className="co-fab" onClick={() => openChat(true)} aria-label="Open tutor chat">
            <span aria-hidden>💬</span>
            <span className="co-fab-label">Ask tutor</span>
          </button>
        ))}
      {regenOpen && (
        <RegenerateModal
          ws={ws}
          page={page}
          pageId={pageId}
          onClose={() => setRegenOpen(false)}
          onConfirm={(feedback) => {
            setRegenOpen(false);
            generate(feedback);
          }}
          hasKey={hasKey}
        />
      )}
    </div>
  );
}

function RegenerateModal({
  ws,
  page,
  pageId,
  hasKey,
  onClose,
  onConfirm,
}: {
  ws: Workspace;
  page: Y.Map<any>;
  pageId: string;
  hasKey: boolean;
  onClose: () => void;
  onConfirm: (feedback: string) => void;
}) {
  const info = courseInfo(page);
  const [startLevel, setStartLevel] = useState(info.startLevel);
  const [goal, setGoal] = useState(info.goal);
  const [feedback, setFeedback] = useState("");
  return (
    <Modal
      title="Redesign the roadmap"
      width={640}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasKey}
            onClick={() => {
              saveCourseOptions(ws, page, pageId, { topic: info.topic, startLevel, goal, notes: info.notes });
              onConfirm(feedback);
            }}
          >
            Redesign
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Claude will design a new roadmap for <strong>{info.topic}</strong>. Lessons you've written stay in the sidebar, and
        progress carries over to lessons whose titles stay the same.
      </p>
      <div className="tu-field">
        <label className="tu-label" htmlFor="co-regen-feedback">
          What should change?
        </label>
        <textarea
          id="co-regen-feedback"
          className="textarea"
          rows={3}
          value={feedback}
          autoFocus
          placeholder="e.g. More emphasis on applications, add a module on numerical methods, fewer history lessons…"
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>
      <LevelPicker value={startLevel} onChange={setStartLevel} />
      <GoalPicker value={goal} onChange={setGoal} />
      {!hasKey && <div className="muted small">Add an Anthropic API key in Settings → AI to redesign the roadmap.</div>}
    </Modal>
  );
}
