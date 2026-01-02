# Issue: Trends panel failure takes down entire admin dashboard

## Summary
- When `/api/dashboard/trends` fails (e.g., query 400), the dashboard throws the global "500" error boundary because `Overview` doesn't handle query errors locally.
- Operators lose access to stats/activity even though only one widget is unhealthy.

## Proposed Fix
1. Update `src/features/dashboard/components/overview.tsx`:
   - Grab `error` and `isError` from `useQuery`.
   - Render an inline alert/empty state when the query fails, with optional retry button.
   - Keep the rest of the dashboard mounted.
2. Consider logging the error to Sentry (if available) for observability.
3. Add a unit test (React Testing Library) that simulates a rejected query and verifies the inline error renders instead of crashing.

## Acceptance Criteria
- Trends request failures no longer trigger the global 500 boundary.
- UI communicates that trends are unavailable and offers a retry.
- Tests cover the error state.
