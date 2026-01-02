# Issue: Dashboard trends proxy exceeds Palantir page limit

## Summary
- Frontend call `GET /api/dashboard/trends?days=7` fails with HTTP 400 from the Unified API.
- Fastify returns `{ status: 'error', code: 'PROXY_ERROR' }`, tripping the admin UI's error boundary.
- Root cause: dashboard aggregation helper requests `limit=200` from Palantir's `/jobs` endpoint, but Palantir enforces `limit <= 100` via its shared pagination schema.

## Impact
- Trends chart data never loads; the entire dashboard currently renders the global 500 screen.
- Unified API logs repeated proxy errors every 30s (React Query's refresh interval).

## Root Cause Details
- `src/dashboard/helpers.ts` defines `DASHBOARD_PAGE_LIMIT = 200` and forward that limit to Palantir.
- Palantir validates `limit` using `PaginationSchema` (`transcription-palantir/src/types/index.ts:259`), which hard-caps the value at 100 -> `400 Bad Request`.

## Proposed Fix
1. Reduce the dashboard helper default (`DASHBOARD_PAGE_LIMIT`) to 100 (or clamp to Palantir's max when callers request more).
2. Add a guard in `fetchAllJobs`/`fetchJobsPage` so future callers can't exceed the upstream cap even if they override options.
3. (Optional resilience) Consider handling failed trend requests gracefully in the admin dashboard so one failing panel doesn't take down the page.

## Acceptance Criteria
- `/api/dashboard/trends?days=7` returns 200 with data when Palantir responds.
- Unified API never sends `limit > 100` to Palantir.
- Regression tests pass (`test/server-dashboard.test.ts`).
- Documented cap so future changes stay within contract.
