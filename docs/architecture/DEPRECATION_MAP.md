# Kloel Deprecation Map

> Tracks each symbol marked as deprecated, with its replacement and migration deadline.

| Deprecated symbol | Replacement | Deadline | Status |
|---|---|---|---|
| `LoginDto` / `RefreshDto` / `ChangePasswordDto` admin-variants at `backend/src/admin/auth/dto/{login,refresh,change-password}.dto.ts` (P1 dup #37) | Renamed to `AdminLoginDto` / `AdminRefreshDto` / `AdminChangePasswordDto` (same paths, admin-specific stricter validators preserved: `MaxLength(320)` email, mandatory refreshToken with `MinLength(10) MaxLength(500)`, password `MinLength(12) MaxLength(128)` + lower/upper/digit/symbol regex). User-auth variants at `backend/src/auth/dto/{login,refresh}.dto.ts` remain canonical and unchanged. KYC variant `ChangePasswordDto` at `backend/src/kyc/dto/change-password.dto.ts` renamed to `KycChangePasswordDto` for symmetry — distinct shape (currentPassword + newPassword 8-255, no complexity regex). All importers updated. | 2026-05-27 | RESOLVED 2026-05-27 — class renames complete, all 338 auth specs pass (`src/auth` + `src/admin/auth`), zero new TSC errors. Admin and user auth flows remain distinct per security posture — no shape consolidation. |
