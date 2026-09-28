// Floating capsule tab bar for phones (iOS 26 / Liquid Glass style), so the
// main destinations are one thumb-tap away on iPhone and Android.

import { toggleAssistant, useAssistant } from "../assistant/store.ts";
import { useApp } from "../lib/hooks.ts";
import { navigate, type ViewName } from "../lib/router.ts";
import { useDueCount } from "../views/registry.tsx";
import { Icon } from "./ui.tsx";

export function TabBar({ active, onSearch }: { active: ViewName | null; onSearch: () => void }) {
  const { ws, createAndOpen } = useApp();
  const due = useDueCount(ws);
  const assistant = useAssistant();
  const go = (view: ViewName) => navigate({ name: "view", wsId: ws.id, view });
  const tab = (view: ViewName, icon: string, label: string, badge?: number) => (
    <button className={`tabbar-item${active === view ? " active" : ""}`} onClick={() => go(view)} aria-label={label}>
      <span className="tabbar-icon">
        <Icon name={icon} size={20} />
        {badge ? <span className="tabbar-badge">{badge > 99 ? "99+" : badge}</span> : null}
      </span>
      <span className="tabbar-label">{label}</span>
    </button>
  );
  return (
    <nav className="tabbar" aria-label="Main">
      {tab("home", "cap", "Learn", due)}
      <button className="tabbar-item" onClick={onSearch} aria-label="Search">
        <span className="tabbar-icon">
          <Icon name="search" size={20} />
        </span>
        <span className="tabbar-label">Search</span>
      </button>
      <button className="tabbar-item tabbar-new" onClick={() => createAndOpen({})} aria-label="New page">
        <span className="tabbar-icon">
          <Icon name="plus" size={22} stroke={2.2} />
        </span>
      </button>
      <button
        className={`tabbar-item${assistant.open ? " active" : ""}`}
        onClick={toggleAssistant}
        aria-label="Assistant"
        aria-pressed={assistant.open}
      >
        <span className="tabbar-icon">
          <Icon name="sparkle" size={20} />
        </span>
        <span className="tabbar-label">Ask</span>
      </button>
      {tab("skills", "tree", "Character")}
    </nav>
  );
}
