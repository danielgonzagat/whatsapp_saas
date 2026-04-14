/**
 * React 19 → React 18 Internals Shim for Polotno
 *
 * Polotno SDK (v2.x) was compiled against React 18 which exposed internals at:
 *   React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
 *
 * React 19 renamed this to:
 *   React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
 *
 * And removed ReactCurrentBatchConfig entirely.
 *
 * This shim creates backward-compatible aliases so Polotno can work with React 19.
 * MUST be imported BEFORE any Polotno import.
 */

import React from 'react';

const React19Internals = (React as any)
  .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

if (React19Internals && !(React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED) {
  (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
    ReactCurrentOwner: React19Internals, // In React 18, ReactCurrentOwner was a separate object; in 19 it's merged
    ReactCurrentBatchConfig: { transition: null }, // Stub — Polotno reads this for concurrent mode detection
    ReactCurrentDispatcher: React19Internals, // Used by hooks internally
    ...React19Internals,
  };
}
