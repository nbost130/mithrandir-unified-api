#!/bin/bash
# Test wrapper script to prevent accidentally using 'bun test'
# This script should be added to .agent/workflows for AI assistant guidance

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  CRITICAL: Testing Strategy for mithrandir-unified-api"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ CORRECT:  npm test          # Uses Node.js + Vitest"
echo "✅ CORRECT:  npm run test:run  # Non-watch mode"
echo ""
echo "❌ WRONG:    bun test          # FAILS - Compatibility issue"
echo "❌ WRONG:    npm run test:bun  # Intentionally disabled"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 Why? Bun has compatibility issues with Fastify's"
echo "   light-my-request library, causing ERR_HTTP_HEADERS_SENT"
echo "   errors in tests. This was fixed in commit ffd36b4."
echo ""
echo "🔗 See: docs/TESTING_ISSUES.md for full details"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
