---
description: How to run tests in mithrandir-unified-api
---

# Testing in mithrandir-unified-api

## ✅ The ONLY Correct Way to Run Tests

```bash
npm test
# or
npm run test:run  # Non-watch mode for CI
```

## ❌ DO NOT Use These Commands

```bash
bun test           # FAILS - compatibility issue
npm run test:bun   # Intentionally disabled
```

## Why?

**Problem**: Bun has a compatibility issue with Fastify's `light-my-request` library, causing `ERR_HTTP_HEADERS_SENT` errors.

**Solution**: Use Node.js runtime with Vitest instead (commit ffd36b4).

## Production vs Testing

- **Production**: Uses Bun for optimal performance (`bun run dist/index.js`)
- **Testing**: Uses Node.js with Vitest (`npm test`)
- **Development**: Uses tsx watch (`npm run dev`)

## Pre-commit Hook

The pre-commit hook (`.husky/pre-commit`) automatically runs `npm test -- run` to ensure all tests pass before allowing commits.

## AI Assistant Note

// turbo-all
When working on this project:
1. Always use `npm test` for testing
2. Never use `bun test` - it will fail
3. The test suite should show "12/12 tests passing"

If tests fail, check:
- Are you using `npm test` (not `bun test`)?
- Have all route handlers been updated with `return` statements?
- See `docs/TESTING_ISSUES.md` for detailed troubleshooting
