// When a downloaded update may restart Basalt by itself (see updater.cjs): only
// when you're not using it. Kept apart from Electron so it can be tested.

/** No keyboard or mouse for this long: you've stepped away. */
const AWAY_SECONDS = 10 * 60;
/** Basalt minimized, hidden or in the background this long: you're doing something else. */
const BACKGROUND_MS = 5 * 60 * 1000;

/**
 * Whether now is a good moment to restart into the new version: you're away
 * from the computer, or Basalt has been out of the way for a while.
 * @param {{ isDestroyed(): boolean, isMinimized(): boolean, isVisible(): boolean, isFocused(): boolean } | null} win
 * @param {number} backgroundSince - when Basalt last lost focus (0: it has focus)
 * @param {number} now
 * @param {number} idleSeconds - seconds since the last keyboard or mouse input
 */
function goodMoment(win, backgroundSince, now, idleSeconds) {
  if (idleSeconds >= AWAY_SECONDS) return true;
  if (!win || win.isDestroyed()) return true;
  const outOfTheWay = win.isMinimized() || !win.isVisible() || !win.isFocused();
  return outOfTheWay && backgroundSince > 0 && now - backgroundSince >= BACKGROUND_MS;
}

module.exports = { goodMoment, AWAY_SECONDS, BACKGROUND_MS };
