// Today's quests in a dock panel (loaded on demand with the skill tree code).

import { useMemo } from "react";
import { todaysQuests } from "../../../shared/skills.ts";
import { useApp } from "../../lib/hooks.ts";
import { navigate } from "../../lib/router.ts";
import { QuestCheck } from "../../views/skills/Overview.tsx";
import { useSkillsVersion } from "../../views/skills/useSkillXp.ts";
import "../../views/skills/skills.css";

export default function QuestsPanel() {
  const { ws } = useApp();
  const version = useSkillsVersion(ws);
  const quests = useMemo(() => todaysQuests(ws.doc), [ws, version]);
  if (!quests.length) {
    return (
      <div className="dock-empty small faint">
        No quests yet.{" "}
        <button className="link-button" onClick={() => navigate({ name: "view", wsId: ws.id, view: "skills" })}>
          Open the skill tree
        </button>
      </div>
    );
  }
  const done = quests.filter((q) => q.status.done).length;
  return (
    <div className="dock-quests">
      <div className="small faint dock-quests-count">
        {done} of {quests.length} done today
      </div>
      {quests.map((q) => (
        <QuestCheck key={`${q.skill.id}:${q.status.quest.id}`} ws={ws} q={q} compact />
      ))}
    </div>
  );
}
