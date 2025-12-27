# Sygn1L2 Dev Log

## How to use this
- Add a new entry for every change you deploy.
- Include: date/time (Sydney), what changed, why, files touched, how to test, and any gotchas.
- Keep it brutally specific so we don't re-break old fixes.

---

## 2025-12-28 (Sydney) – Phase 1 Upgrade Shop baseline
**Goal**
- Move Phase 1 from a demo counter to a real idle loop: earn signal, buy upgrades, scale.

**Changes**
- Phase 1: Added upgrade shop (SPS boost, Ping boost, SPS multiplier) and Ping Power stat.
- Core: Added build-stamp cache busting for plugin imports.
- Core: Updated default Phase 1 state schema to include pingPower + upgrades.

**Files touched**
- src/core/pluginLoader.js
- src/core/state.js
- src/plugins/phase1/plugin.js

**How to test**
1. Load the game (use a cache buster once: ?v=2 if needed).
2. Enter Phase 1.
3. Confirm Signal ticks up (SPS).
4. Tap Ping. Signal should increase by Ping Power.
5. Buy upgrades as Signal allows. SPS and Ping should increase accordingly.

**Notes**
- Admin tools intentionally deferred for now.
