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

## [2025-12-28g] - 2025-12-28
### Added
- Phase 1 Autopilot (AUTOPILOT CORE upgrade + toggle) that auto-purges to hold corruption at 40% using 35% of earned signal.
### Changed
- Offline corruption is capped at 95% (no hard-loss while away).
- Plugin loader BUILD bumped for cache-busting.
