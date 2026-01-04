# GitHub Issues Snapshot

**Refresh this snapshot** whenever you start a planning workflow or notice major GitHub issue churn.
Run:

```bash
python3 scripts/update_github_issues_snapshot.py
```

*Generated:* 2026-01-02T12:52:40Z

## Open Issues
| # | Title | Labels | Created | Notes |
| --- | --- | --- | --- | --- |
| 17 | refactor: Extract Content-Type header constant for maintainability | enhancement | 2026-01-01 | ## Overview Refactor hardcoded `'application/json'` Content-Type headers across POST endpoints to use a shared constant for better mainta... |
| 12 | Add documentation to prevent API path mismatch issues | documentation, enhancement | 2025-12-29 | # Path Mismatch Between Unified API and transcription-palantir ## Problem The mithrandir-unified-api was experiencing 500 errors when pro... |
| 11 | CRITICAL: Dashboard stats/trends have hardcoded limit=100 causing data truncation | bug | 2025-12-29 | ## Bug Description Dashboard stats and trends endpoints have hardcoded `limit=100` parameter, causing silent data truncation when total j... |

## Recently Closed Issues
| # | Title | Closed | Notes |
| --- | --- | --- | --- |
| 19 | fix: fetch complete data for dashboard stats and trends | 2026-01-01 | No description |
| 18 | fix: Remove Content-Type header from retry endpoint | 2026-01-01 | ## Problem 500 error when retrying jobs: "Body cannot be empty when content-type is set to 'application/json'" ## Root Cause Fastify (in ... |
| 16 | fix: Add Content-Type header to retry endpoint | 2026-01-01 | ## Problem 415 Unsupported Media Type error when retrying jobs from dashboard. ## Root Cause The retry endpoint was missing the `Content-... |
| 15 | Merge pull request #13 from nbost130/feat/story-5-1-type-generation | 2026-01-01 | Feat/story 5 1 type generation |
| 14 | chore: Remove accidentally committed code review file | 2026-01-01 | No description |
