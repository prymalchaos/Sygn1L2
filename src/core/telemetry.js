// src/core/telemetry.js
// No-op placeholder telemetry module.
//
// This file previously ended up partially overwritten in a patch,
// which can cause confusing cache/rollback symptoms in some browsers.
// Keeping it as a valid module is safer than leaving stray text here.

export function logEvent(_name, _data) {
  // Intentionally no-op (telemetry disabled).
}

export function logError(_err, _context) {
  // Intentionally no-op (telemetry disabled).
}
