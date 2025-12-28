# Sygn1L2 Repo Feature Audit

Date: 2025-12-29 (Sydney)

This audit compares **docs/DEVLOG.md** expectations against the current codebase.

## Checklist

- [x] Core: Modular plugin loader (src/core/pluginLoader.js)
- [x] Phase 0: onboarding UI (email/password/username) (src/plugins/phase0_onboarding/plugin.js)
- [ ] Auth: no email confirmation required (src/plugins/phase0_onboarding/plugin.js)
  - Missing markers: src/plugins/phase0_onboarding/plugin.js: emailRedirectTo
- [x] Saving: Supabase cloud save upsert (src/core/save.js)
- [ ] Saving: cross-browser persistence (load by user id) (src/core/save.js)
  - Missing markers: src/core/save.js: auth.getUser
- [ ] Offline progress: lastSeen delta applied on boot (src/core/boot.js)
  - Missing markers: src/core/boot.js: deltaMs
- [x] Input: double-tap zoom suppression (viewport/touch-action) (index.html)
- [x] Input: fast tap helper (src/plugins/phase1/plugin.js)
- [x] Input: press-and-hold Ping auto-ping (src/plugins/phase1/plugin.js)
- [ ] Visuals: CRT skin / scanlines (src/plugins/phase1/plugin.js)
  - Missing markers: src/plugins/phase1/plugin.js: scanline
- [x] Visuals: Scope + Oscilloscope canvases render (src/plugins/phase1/plugin.js)
- [x] Visuals: Ping interferes with scope (spike) (src/plugins/phase1/plugin.js)
- [x] Gameplay: Autopilot (40% target, 35% budget, offline cap 95%) (src/plugins/phase1/plugin.js)
- [ ] UI: Telemetry panel (src/plugins/phase1/plugin.js)
  - Missing markers: src/core/telemetry.js: telemetry
- [x] Narrative: Badge avatar popups (src/plugins/phase1/plugin.js)
- [x] Progression: Milestones (src/plugins/phase1/plugin.js)
- [x] Time Trial: run lifecycle + best/last (src/core/state.js, src/plugins/phase1/plugin.js)
- [x] Leaderboards: UI + Supabase table phase_time_trials (src/plugins/phase1/plugin.js)
- [x] Phase 2 plugin exists (src/plugins/phase2/plugin.js)

## Notable findings


## Manual smoke test script

1. Hard refresh (or add `?v=...`) on GitHub Pages.
2. Log in, enter Phase 1.
3. Tap Ping rapidly, then press-and-hold Ping: should auto-ping without text selection.
4. Watch scope: amplitude should spike during taps/holding.
5. Win Phase 1, go to Phase 2, return to Phase 1: win overlay should **not** loop.
6. Open Leaderboards / My Runs at bottom: should load lists.
