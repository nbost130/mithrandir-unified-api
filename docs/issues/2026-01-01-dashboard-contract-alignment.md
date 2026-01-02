# Issue: Prevent Unified API from drifting from Palantir pagination contract

## Summary
- `/api/dashboard/trends` broke because the Unified API silently exceeded Palantir's `limit <= 100` rule.
- Nothing in CI/automation enforces that the dashboard helper stays within Palantir's schema, so the regression wasn't caught until production.

## Impact
- A single config change (raising `DASHBOARD_PAGE_LIMIT` to 200) took down the dashboard despite Palantir rejecting such requests by design.
- Future schema changes on Palantir could silently break the Unified API again.

## Root Cause
- Palantir exposes the limit via `PaginationSchema` (`transcription-palantir/src/types/index.ts`) and OpenAPI.
- Unified API duplicated the value (`const DASHBOARD_PAGE_LIMIT = 200`) with no shared source or test coverage for the constraint.
- Contract tests/codegen focus on `/transcription/*`; dashboard helper never consumed the schema automatically.

## Proposed Plan
1. **Share the constant**: Export `MAX_JOBS_PAGE_LIMIT` (100) from `transcription-palantir`. Import it into the Unified API (or consume it via generated types) so future changes flow automatically. Document both sides pointing to the same symbol.
2. **Add regression tests**: Extend `test/server-dashboard.test.ts` with a case that calls `fetchAllJobs({ limit: 150 })` and asserts the API never forwards a number above the shared constant (verify via mock axios calls/logs).
3. **Contract gate** (optional but valuable): Add a CI check that calls Palantir `/jobs?limit=101` and expects 400, so if Palantir ever raises/lowers the cap we learn immediately.
4. **Docs update**: Note the shared limit in both repos' `CLAUDE.md`/README so operators know it's an intentional contract.

## Acceptance Criteria
- Unified API imports/derives the limit from Palantir (no magic numbers).
- Tests fail if the helper attempts to send `limit > sharedLimit`.
- CI/docs describe the shared limit and how it's checked.
