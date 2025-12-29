# Changelog

## [2025-12-28b] - 2025-12-28
### Added
- Phase 1 console layout: panels, scanlines, scope+osc visuals.
- Corruption pressure + defeat overlay + restart.
- Comms/transmission logs.
- New upgrades: Noise Canceller, Purge Manifold.
- Purge action (burn signal to reduce corruption).

### Changed
- Phase 1 state schema bumped to 3 with corruption + logs + new upgrades.
- Plugin loader includes BUILD cache-busting for phase modules.


## [save-persistence] - 2025-12-28
### Fixed
- Prevent overwriting an existing cloud save with a fresh default state when logging in on a new browser/device.


## [2025-12-28d] - 2025-12-28
### Added
- Phase 1 dev-only telemetry panel (live rate/ETAs/win checks).
### Changed
- Phase 1 tuning values centralized into a `TUNE` object for easier balancing.
- Plugin loader BUILD bumped for cache busting.


### Fixed
- Phase 1 telemetry panel now displays metrics (was empty).


## [2025-12-28d] - 2025-12-28
### Added
- Phase 1 milestone system (one-time beats) persisted via phase-local flags/stats.
- Telemetry shows fired milestones.

### Changed
- Plugin loader BUILD bumped to force fresh phase module loads.

## [2025-12-28e] - 2025-12-28
### Added
- Phase 2 Engineering prototype: Power + Heat + Reroute loop, Vent action, overheat lockout, upgrades, logs.
### Changed
- Default state schema bumped to 5 with Phase 2 state fields.
- Plugin loader BUILD bumped for cache-busting.

## [2025-12-28h] - 2025-12-28
### Added
- Phase 1 animated scopes:
  - CRT sine-wave scope display with corruption noise and ping kick.
  - Lissajous oscilloscope that becomes a perfect circle at 100% synchronicity.
### Changed
- Plugin loader BUILD bumped for cache-busting.

## [2025-12-28i] - 2025-12-28
### Fixed
- Phase 1 render crash after replacing scope/osc with canvases (legacy text scope update is now guarded).

## [2025-12-28j] - 2025-12-28
### Fixed
- Phase 1 scopes blank on some mobile layouts due to 0px canvas sizing; added sizing fallbacks and dev-only dimension debug.

## [2025-12-28k] - 2025-12-28
### Fixed
- Restored Phase 1 CRT skin after scope patches overwrote styling.
- Scopes now render even if requestAnimationFrame is throttled on mobile; added canvas debug label.

## [2025-12-28j] - 2025-12-28
### Added
- Phase 1 time trial reset (preserves best time, records last time).
- Phase 2: Restart Phase 1 (Time Trial) navigation.
### Fixed
- Win overlay no longer repeats when revisiting Phase 1 after Phase 2 unlock.

## [2025-12-28k] - 2025-12-28
### Fixed
- Restored Phase 1 milestone popups with procedural CRT badge avatars (lost in earlier patch overwrite).

## [2025-12-28k] - 2025-12-28
### Fixed
- Phase 1 boot crash: "Can't find variable: line" (badge popup hook now runs inside pushLog).

## [2025-12-28l] - 2025-12-28
### Added
- Phase 1 Time Trial panel (run/best/last).
- Phase 1 leaderboard modal (global + personal top 10) backed by Supabase `phase_time_trials`.
### Changed
- Phase 1 win flow submits one run per runId (submittedRunId guard).

## [2025-12-29a] - 2025-12-29
### Added
- Phase 1 Time Trial panel (RUN/LAST/BEST).
- Bottom buttons: Leaderboards / My Runs.
### Fixed
- Phase 1 win overlay no longer re-triggers when revisiting Phase 1 after Phase 2 unlock.
- Time trial duration no longer records as 0ms.

## [2025-12-29b] - 2025-12-29
### Fixed
- Phase 1 boot crash: "Can't find variable: attachFastTap".

## [2025-12-29c] - 2025-12-29
### Fixed
- Phase 1 boot crash: "Can't find variable: root" (leaderboard wiring now runs inside mount; imports restored to top-level).

## [2025-12-29d] - 2025-12-29
### Fixed
- iOS: press-and-hold Ping no longer selects the "PING" label (prevents input disruption).

## [2025-12-29d] - 2025-12-29
### Added
- Phase 1: press-and-hold Ping auto-ping (scales with Ping Boost).
- docs/FEATURE_LOCK.md and refreshed docs/AUDIT.md.
### Fixed
- iOS long-press selecting “PING” text (disabled selection + preventDefault on pointerdown).
### Changed
- Phase 1 scope ping interference spike strengthened.

## [2025-12-29d] - 2025-12-29
### Fixed
- Phase 1 purge warning no longer spams popups when corruption remains high (cooldown + persisted flags).
### Changed
- Phase 1 hold-to-ping balanced with fatigue (diminishing ping power + extra heat + slight rate slow).

## [2025-12-29d] - 2025-12-29
### Fixed
- SYSTEM FAILURE: Restart Phase button now works reliably on mobile (tap/hold protection + proper state reset).

## [2025-12-29d] - 2025-12-29
### Added
- Phase 1: Hold-Press Actuator (unlocks hold-to-ping) and Thermal Bleed Valve (faster fatigue cooloff).
- Phase 1: Fatigue HUD (bar + %).
### Fixed
- Popup spam reduced: popups now require explicit `//POPUP` lines + cooldown/rate limit.
### Changed
- Hold ping balance: slightly higher fatigue/heat.

## [2025-12-29e] - 2025-12-29
### Fixed
- Hold-to-ping no longer works before unlock; Hold-Press Actuator gated until 50 signal.
- Time Trial RUN clock updates live.
### Added
- Analogue VU-style fatigue meter with cooloff ETA.

