# Feature Lock (Do Not Regress)

This file is a guard rail. Any patch must preserve these behaviors and UI elements.

## Core
- Modular plugin loading (phase plugins)
- Supabase auth (email + password) + username onboarding (no email confirmation)
- Cloud save persistence across browsers/devices (per user)
- Offline progress applied on return (delta from lastSeen)
- Update popup on new BUILD (cache/version awareness)

## Mobile UX
- Suppress double-tap zoom / prevent accidental zoom during spam tapping
- Fast-tap friendly buttons (high responsiveness)
- No iOS text selection/callout on gameplay buttons

## Phase 1
- Signal ticks up (SPS) + Ping adds signal
- Corruption pressure system + lose condition
- Upgrade shop + milestones progression
- Autopilot tuned: target 40%, budget 35%, offline cap 95%
- CRT/industrial skin + scanline effect
- Scope + oscilloscope canvases render and react to gameplay (ping interference spikes)
- Badge avatar popups (character comms)
- Time Trial replay: restart Phase 1 without win-loop; best/last times tracked
- Leaderboards: Global Top 10 + My Top 10 accessible from bottom buttons

## Phase 2
- Phase 2 plugin loads and Phase 1 → Phase 2 transition works
