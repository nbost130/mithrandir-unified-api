# Mithrandir Unified API

Enhanced TypeScript-based unified API gateway for Mithrandir system management with transcription project management.

## Features

- 🚀 **Dashboard Analytics** - System metrics, job statistics, activity tracking, and trend visualization
- 🔄 **Transcription Proxy** - Full CRUD operations for transcription job management
- 🛡️ **Resilient Architecture** - Circuit breakers, retry logic, and comprehensive error handling
- 📊 **Production Monitoring** - Structured logging, request tracking, and performance metrics
- ✅ **Comprehensive Testing** - Full test coverage for all API endpoints

> **Issue Tracking:** GitHub Issues is the source of truth for roadmap + bug tracking. For offline agents, see [`docs/github-issues.md`](./docs/github-issues.md) and refresh it with `python3 scripts/update_github_issues_snapshot.py` whenever you start workflow-init/PRD planning or notice major issue churn.

## Tech Stack

- **Runtime**: Bun (development & production) / Node.js (testing)
- **Framework**: Fastify
- **Language**: TypeScript
- **Testing**: Vitest
- **Quality**: Husky pre-commit hooks

## Why Two Runtimes?

This project uses a **hybrid approach** for optimal development experience:

| Use Case | Runtime | Why |
|----------|---------|-----|
| **Development** | Bun | ⚡ 3x faster startup, instant hot reload |
| **Testing** | Node.js | 🛡️ Better compatibility with Fastify test utilities |
| **Production** | Bun | 🚀 2-3x faster HTTP performance, lower memory |

### Background

Bun has a known compatibility issue with Fastify's `light-my-request` library (used by `fastify.inject()` for testing), causing `ERR_HTTP_HEADERS_SENT` errors in tests. The application works perfectly in production with Bun, so we:
- ✅ Use Bun for development (fast iteration)
- ✅ Use Node.js for tests (reliable, no compatibility issues)
- ✅ Deploy with Bun (optimal performance)

See [Issue #7](https://github.com/nbost130/mithrandir-unified-api/issues/7) for full technical details.

## Prerequisites

- **Bun** >= 1.0.0 ([install](https://bun.sh))
- **Node.js** >= 18.0.0 (for testing)
- **Redis** (for BullMQ queue management)

## Installation

```bash
# Clone the repository
git clone https://github.com/nbost130/mithrandir-unified-api.git
cd mithrandir-unified-api

# Install dependencies (uses npm, works with Bun)
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
```

## Development

```bash
# Start development server with hot reload (Bun)
bun --watch src/index.ts

# Or use the npm script
npm run dev

# The server will start at http://localhost:8889
```

## Testing

```bash
# Run tests (uses Node.js/Vitest)
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage

# Alternative: Run with Bun (not recommended due to compatibility issues)
npm run test:bun
```

### Test Results
```
✓ test/server.test.ts (2 tests)
✓ test/server-dashboard.test.ts (4 tests)
✓ test/server-transcription.test.ts (6 tests)

Test Files  3 passed (3)
Tests  12 passed (12)
```

## Production

```bash
# Build TypeScript
npm run build

# Start production server (Bun)
bun src/index.ts

# Or use compiled JavaScript (Node.js)
npm start
```

## API Endpoints

### System Routes
- `GET /health` - Health check with system metrics
- `GET /info` - API version and endpoint documentation

### Dashboard Routes
- `GET /api/dashboard/stats` - Job statistics and system metrics
- `GET /api/dashboard/activity?limit=N` - Recent activity feed
- `GET /api/dashboard/trends?days=N` - Historical trend data

### Transcription Proxy Routes
- `GET /transcription/jobs` - List all transcription jobs
- `POST /transcription/jobs` - Create new transcription job
- `GET /transcription/jobs/:id` - Get specific job details
- `PUT /transcription/jobs/:id` - Update job (full replacement)
- `PATCH /transcription/jobs/:id` - Update job (partial)
- `DELETE /transcription/jobs/:id` - Delete job
- `POST /transcription/jobs/:id/retry` - Retry failed job

## Configuration

Key environment variables (see `.env.example` for full list):

```bash
# Server
PORT=8889
HOST=0.0.0.0

# Transcription API (proxied service)
TRANSCRIPTION_API_URL=http://transcription-service:3000

# Logging
LOG_LEVEL=info
```

## Architecture

### Response Handling Pattern

All route handlers use a consistent pattern to prevent double-send errors:

```typescript
// ✅ CORRECT - Always return reply
fastify.get('/endpoint', async (request, reply) => {
  return reply.code(200).send({ data });
});

// ❌ WRONG - Missing return causes implicit response
fastify.get('/endpoint', async (request, reply) => {
  reply.code(200).send({ data }); // Fastify will try to send again!
});
```

### API Type Generation

This project uses TypeScript types generated from the Transcription Palantir OpenAPI specification for type-safe API integration.

**Regenerate types after Transcription Palantir API updates:**

```bash
# Generate types from local API (default)
npm run generate:types

# Or specify custom API URL
TRANSCRIPTION_API_URL=http://palantir.tailnet:3001 npm run generate:types
```

**Generated file:** `src/types/palantir.d.ts`

**Usage example:**
```typescript
import type { paths, components } from './types/palantir';

type JobsResponse = paths['/api/v1/jobs']['get']['responses']['200']['content']['application/json'];
type Job = components['schemas']['Job'];
```

**When to regenerate:**
- After updating Transcription Palantir API
- When TypeScript compilation errors indicate type mismatches
- Before deploying consumer changes

See [Transcription Palantir: Consumer Type Generation Guide](https://github.com/nbost130/transcription-palantir/blob/main/docs/CONSUMER_TYPE_GENERATION.md) for complete documentation.

### Error Handling

- **Proxy errors**: Intelligently mapped from upstream services
- **Circuit breaker**: Prevents cascading failures
- **Structured logging**: All errors logged with request context
- **Graceful shutdown**: SIGTERM/SIGINT handlers for clean exits

## Contributing

### Pre-commit Hooks

Husky runs tests before each commit to ensure code quality:

```bash
# Tests must pass before commit
git commit -m "Your changes"
# → Runs: npm test
```

### Code Style

- Use TypeScript strict mode
- Follow existing patterns for route handlers
- Add tests for new endpoints
- Update API documentation in README

## Troubleshooting

### Tests fail with "ERR_HTTP_HEADERS_SENT"

**Solution**: Use Node.js for tests, not Bun:
```bash
npm test        # ✅ works
npm run test:bun  # ❌ fails due to Bun bug
```

### Port already in use

```bash
# Find and kill process on port 8889
lsof -ti:8889 | xargs kill -9
```

### Redis connection errors

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Start Redis if needed
redis-server
```

## License

MIT

## Links

- [GitHub Repository](https://github.com/nbost130/mithrandir-unified-api)
- [Issue Tracker](https://github.com/nbost130/mithrandir-unified-api/issues)
- [Fastify Documentation](https://fastify.dev)
- [Bun Documentation](https://bun.sh/docs)
