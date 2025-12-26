# Mithrandir Unified API - AI Assistant Guide

This file contains project-specific instructions for AI assistants working on the Mithrandir Unified API project.

## Project Overview

Mithrandir Unified API is a TypeScript-based unified API that combines:
- **Failsafe Operations** - SSH and VNC management
- **System Monitoring** - Prometheus metrics and health checks
- **Transcription Service Routing** - HTTP client routing for microservices

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
│   ├── index.ts           # Entry point
│   ├── server.ts          # Fastify server setup
│   ├── services.ts        # Service implementations
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
- Migrated from Python failsafe API to TypeScript
- Combined failsafe operations with monitoring API
- Added transcription service routing endpoints

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
- `GET /health` - Health check
- `GET /info` - API information
- `GET /docs` - Swagger documentation (if enabled)

### Failsafe Operations
- `GET /ssh-status` - System status
- `GET /status` - Legacy alias
- `POST /restart-ssh` - Restart SSH service
- `POST /start-vnc` - Start VNC server

### Monitoring
- `GET /metrics` - Prometheus metrics
- `GET /monitoring/status` - Monitoring status
- `GET /monitoring/health` - Health check

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

