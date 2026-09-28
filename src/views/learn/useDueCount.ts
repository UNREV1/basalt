// Live count of cards to study now (due + new available today) for a sidebar badge.
// Recomputes at most every 2 s on document changes, and once a minute as time passes.

import { useEffect, useState } from "react";
import type { Workspace } from "../../lib/workspace.ts";
import { learnerKey, useSettings } from "../../lib/settings.ts";
import { cardIndex, dueBadgeCount, getLearnSettings, learnerStore, useLearnSettings } from "./store.ts";

const THROTTLE_MS = 2000;

export function useDueCount(ws: Workspace): number {
  const key = learnerKey(useSettings().identity);
  const learnSettings = useLearnSettings();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const index = cardIndex(ws.doc);
    const store = learnerStore(ws.doc, key);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    const compute = () => {
      timer = undefined;
      last = Date.now();
      setCount(dueBadgeCount(index.cards(), store.states, getLearnSettings(), last));
    };
    const request = () => {
      if (timer !== undefined) return;
      timer = setTimeout(compute, Math.max(0, THROTTLE_MS - (Date.now() - last)));
    };
    // First count after the app has painted; parsing every page is the expensive part.
    timer = setTimeout(compute, 300);
    const offIndex = index.subscribe(request);
    const offStore = store.subscribe(request);
    const minute = setInterval(request, 60_000);
    return () => {
      offIndex();
      offStore();
      clearInterval(minute);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [ws, key, learnSettings]);

  return count;
}
