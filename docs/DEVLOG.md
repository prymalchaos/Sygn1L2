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


## 2025-12-28 (Sydney) – Mobile double-tap zoom suppression
**Goal**
- Prevent iOS Safari double-tap zoom so rapid button tapping doesn't zoom the page.

**Changes**
- Updated viewport meta to disable user scaling.
- Added touch-action: manipulation for html/body and interactive elements.
- Added touchend/gesturestart handlers to suppress double-tap and pinch zoom.

**Files touched**
- index.html

**How to test**
1. Open game on iPhone Safari.
2. Rapidly tap Ping/Purge/Buy buttons.
3. Page should not zoom in/out on double taps.


## 2025-12-28 (Sydney) – Phase 1 telemetry + tuning block
**Goal**
- Make Phase 1 balancing fast and repeatable without guesswork.
- Keep all tunable numbers in one phase-local tuning object.

**Changes**
- Added `TUNE` object in Phase 1 for win condition, corruption, ping noise, and purge values.
- Added a dev-only Telemetry panel (toggle) showing live: corruption rate, ETA to failure, win checks/hold timer, purge stats.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js
- docs/DEVLOG.md

**How to test**
1. Log in as PrymalChaos.
2. Enter Phase 1, open DEV panel, tap “Telemetry (dev)”.
3. Confirm telemetry updates while playing (signal/sps/corruption/rate/ETAs).
4. Buy Noise Canceller and confirm corruption rate decreases.


## 2025-12-28 (Sydney) – Telemetry panel population fix
**Fix**
- Phase 1 telemetry panel now renders live metrics instead of staying blank.

**Files touched**
- src/plugins/phase1/plugin.js
- src/core/pluginLoader.js


## 2025-12-28 (Sydney) – Input responsiveness (anti-eaten taps)
**Goal**
- Make rapid button tapping reliable on iPhone Safari (Ping/Purge/Buy).

**Changes**
- Removed touchend preventDefault double-tap suppression script (it was cancelling synthetic clicks).
- Added fast-tap handler using pointerdown (touch) + click fallback for instant, reliable taps on:
  - Ping, Purge, upgrade Buy buttons, overlays.

**Files touched**
- index.html
- src/plugins/phase1/plugin.js

**How to test**
1. Open on iPhone Safari.
2. Rapid tap Ping/Purge/Buy repeatedly.
3. Taps should register nearly 1:1 (no missed presses).
