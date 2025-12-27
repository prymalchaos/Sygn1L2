2025-12-27
- Baseline architecture committed
- Modular plugin system created
- Supabase auth + saves wired
## 2025-12-27 — Milestone 1 complete: Onboarding + Save + Offline + Dev Panel v1
- Implemented Phase 0 onboarding with login/signup and username profile creation (profiles table).
- Core boot now gates gameplay by profile existence.
- Implemented offline progression pipeline (dtMs since lastSeenAt) via plugin applyOfflineProgress hook.
- Added save triggers: autosave interval + visibilitychange + pagehide.
- Phase 1 plugin includes idle loop, offline summary, and Dev Panel v1 restricted to username PrymalChaos.

