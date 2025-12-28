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

