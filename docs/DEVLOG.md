# Sygn1L2 Dev Log

## 2025-12-28 (Sydney) – Phase 1 panels, logs, and pressure
**Goal**
- Make Phase 1 feel like a ship console: panels, scanlines, scope toys.
- Add a pressure mechanic (Corruption) so Phase 1 has a win/lose loop.
- Keep everything phase-local (plugin owns gameplay + styling).

**Changes**
- Phase 1 UI rebuilt into a panel layout: header, stats, scope+osc, upgrade shop, comms/transmission.
- Added Corruption pressure (0..100) that grows over time (and slightly with progression).
- Added Purge action (spend Signal to reduce corruption) + new upgrades (Noise Canceller, Purge Manifold).
- Added defeat overlay when Corruption hits 100%.
- Added lightweight logs: comms warnings at 25/50/75% corruption, transmissions on upgrades/purge.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/state.js
- src/core/pluginLoader.js

**How to test**
1. Load Phase 1, confirm Signal ticks up.
2. Watch Corruption rise. Use Purge to reduce it.
3. Buy Noise Canceller to slow Corruption.
4. Let Corruption reach 100% to confirm defeat overlay + restart works.
5. Refresh after 10–30 seconds: offline report shows signal/corruption change.

**Notes**
- Admin functions intentionally not included (deferred).
- BUILD stamp in pluginLoader can be bumped if mobile caching shows old UI.

---

## 2025-12-28 (Sydney) – Fix cloud save persistence across browsers
**Bug**
- Logging in on a different browser/device started a fresh game.

**Cause**
- App boot runs before login, so cloud save can't be loaded yet.
- On login, the auth change handler saved the default state immediately, overwriting the user's existing cloud save.

**Fix**
- Track `lastAuthUserId` in memory.
- When auth user changes, load the cloud save first (`loadSave()`), then route/switch phase, apply offline progress, and save.
- On logout, reset to default state.

**Files touched**
- src/core/boot.js

**How to test**
1. Play Phase 1 for ~30 seconds so it autosaves.
2. Open the game in a different browser (or private window), log into the same account.
3. It should load the existing save (not reset), and show an offline report.
