# Mithrandir Unified API - AI Assistant Guide

This file contains project-specific instructions for AI assistants working on the Mithrandir Unified API project.

## Project Overview

Mithrandir Unified API is a TypeScript-based unified API that provides:
- **Dashboard Analytics** - System statistics and monitoring for the admin interface
- **Transcription Service Routing** - HTTP client proxy for the Palantir transcription service

**Tech Stack:**
- **TypeScript** - Type-safe development
- **Fastify** - High-performance web framework
- **BullMQ** - Job queue management
- **Redis** - State management (via ioredis)
- **Bun** - Fast JavaScript runtime and package manager

## Development Workflow

### Local Development
- **Location:** `/Users/nbost/dev/mithrandir-unified-api`
- **Environment:** Development (`.env`)
- **Run:** `bun run dev` (watch mode with tsx)
- **Build:** `bun run build` (compiles TypeScript to `dist/`)
- **Start:** `bun run start` (runs compiled JavaScript)

### Production Deployment
- **Location:** `mithrandir:~/mithrandir-unified-api`
- **Environment:** Production (`.env` on server)
- **Port:** 8080 (default)

### Project Structure

```
mithrandir-unified-api/
├── src/                    # TypeScript source files
│   ├── config/            # Configuration modules
│   │   └── validation.ts  # Environment variable validation
│   ├── lib/               # Shared libraries
│   │   └── apiClient.ts   # Resilient API client with circuit breaker
│   ├── index.ts           # Entry point
│   ├── server.ts          # Fastify server setup and routes
│   └── types.ts           # TypeScript type definitions
├── dist/                   # Compiled JavaScript (gitignored)
├── logs/                   # Application logs (gitignored)
├── node_modules/           # Dependencies (gitignored)
├── .env                    # Environment variables (gitignored)
├── .gitignore             # Git ignore rules
├── package.json           # Project configuration
├── tsconfig.json          # TypeScript configuration
└── CLAUDE.md              # This file
```

## Migration History

**December 28, 2025:**
- **Removed all failsafe functionality** (SSH/VNC management endpoints)
- Deleted `src/services.ts` entirely (SystemService class with sudo usage)
- Removed VNC_PASSWORD requirement from environment configuration
- Simplified health check to basic uptime and system status
- Focused API scope: Dashboard analytics + transcription service routing only
- **Security improvement**: Eliminated sudo dependency and VNC attack surface
- **Architecture simplification**: API now relies entirely on Tailscale network-level security

**December 26, 2025:**
- Consolidated TypeScript source from `mithrandir-api-ts` into `mithrandir-unified-api`
- Added proper `.gitignore` and source control for TypeScript files
- Fixed TypeScript compilation errors (pino logger syntax)
- Archived old migration directories:
  - `mithrandir-api-ts` (original TypeScript source)
  - `mithrandir-typescript-migration` (migration scripts)
  - `mithrandir-core` (core library)
  - `mithrandir` (legacy directory)
- Archive location: `~/Archive/mithrandir-migration-20251226.tar.gz`

**November 22, 2025:**
- Migrated from Python to TypeScript
- Added transcription service routing endpoints
- Initial unified API implementation

## Development Guidelines

### Making Changes

1. **Edit TypeScript source** in `src/` directory
2. **Test locally** with `bun run dev`
3. **Build** with `bun run build` to verify compilation
4. **Commit changes** to git with descriptive messages
5. **Deploy to production** (process TBD - currently manual)

### Code Style

- Use TypeScript strict mode
- Follow Fastify best practices
- Use pino logger with object syntax: `log.error({ error }, 'message')`
- Prefer async/await over callbacks
- Use proper error handling with try/catch

### Environment Variables

- `PORT` - Server port (default: 8080 production, 8889 dev)
- `HOST` - Server host (default: 0.0.0.0)
- Additional variables defined in `.env` (not committed to git)

## API Endpoints

### Health & Status
- `GET /health` - Health check with system uptime
- `GET /info` - API information and available endpoints

### Dashboard Analytics
- `GET /api/dashboard/stats` - Dashboard statistics (job counts, system uptime)
- `GET /api/dashboard/activity` - Recent activity feed (job updates)
- `GET /api/dashboard/trends` - Historical trend data for jobs

### Transcription Service Proxy (Palantir)
- `GET /transcription/jobs` - List transcription jobs (with optional filters)
- `POST /transcription/jobs` - Create new transcription job
- `GET /transcription/jobs/:id` - Get specific job details
- `PUT /transcription/jobs/:id` - Update job (full replacement)
- `PATCH /transcription/jobs/:id` - Update job (partial, e.g., priority)
- `DELETE /transcription/jobs/:id` - Delete job
- `POST /transcription/jobs/:id/retry` - Retry failed job

## Common Tasks

### Install Dependencies
```bash
cd ~/dev/mithrandir-unified-api
bun install
```

### Run Development Server
```bash
bun run dev
```

### Build for Production
```bash
bun run build
```

### Run Production Build Locally
```bash
bun run start
```

## Troubleshooting

### TypeScript Compilation Errors
- Check `tsconfig.json` for proper configuration
- Ensure all dependencies have type definitions
- Use `bun run build` to see detailed errors

### Runtime Errors
- Check logs in `logs/` directory
- Verify environment variables in `.env`
- Ensure Redis is running (if using BullMQ features)

## Related Projects

- **transcription-palantir** - Transcription service that this API routes to
- **mithrandir-admin** - Admin dashboard (separate project)

## Notes

- This project uses **Bun** instead of npm/yarn for faster performance
- The production deployment only had compiled `dist/` files until Dec 26, 2025
- Source files are now properly version controlled in git
- Old migration artifacts are archived and removed from active directories

