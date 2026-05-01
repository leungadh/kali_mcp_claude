# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`dashboard/backend/`)
```bash
npm test                        # run all 20 tests (vitest run)
npm test -- --reporter=verbose  # with test names
npx vitest run __tests__/kali_ssh.test.js   # single test file
node server.js                  # production start
node --watch server.js          # dev mode with auto-restart
```

### Frontend (`dashboard/frontend/`)
```bash
npm run dev      # Vite dev server on :3000 (proxies /api → :3001)
npm run build    # production build to dist/
npm run lint     # ESLint
npx vitest       # frontend tests (jsdom environment)
```

### MCP server (`mcp-server/`)
```bash
uv run mcp-server/server.py    # run from repo root (loads .env two levels up)
```

---

## Architecture

### Data flow

```
User prompt → POST /api/session
  → ClaudeClient.run() [agentic loop, up to 20 iterations]
      → anthropic.messages.stream()  [streams text deltas as SSE events]
      → on tool_use: KaliSSH.exec(command)  [SSH to Kali EC2]
      → feed tool result back to Claude
  → broadcast() writes to SSE + SQLite
  → GET /api/session/:id/stream  [replays SQLite events, then subscribes live]
```

### Backend modules

**`claude_client.js`** — the agentic loop core. Uses `anthropic.messages.stream()` with `for await`; detects `tool_use` stop reason from `stream.finalMessage()`; emits typed events (`text`, `tool_call`, `tool_result`, `done`, `error`) via the `onEvent` callback. System prompt uses `cache_control: { type: 'ephemeral' }` for prompt caching. Only tool defined: `run_command`.

**`kali_ssh.js`** — wraps `ssh2` in two Promises: `exec()` and `upload()`. Both use a `settled` flag to prevent double-resolve/reject, a `clearTimeout` on every exit path, and an `fs.existsSync` guard before `fs.readFileSync` so tests can pass a non-existent key path. Constructor accepts an injectable `clientFactory` for testing.

**`session_logger.js`** — synchronous `better-sqlite3`. Two tables: `sessions` and `events`. `listSessions` orders by `created_at DESC, rowid DESC` to handle same-millisecond ties. Uses `:memory:` in tests.

**`server.js`** — two in-memory Maps: `sseClients` (sessionId → Set\<res\>) and `sessionDone` (sessionId → boolean). The background IIFE fires Claude's loop; `broadcast()` writes to both SSE clients and SQLite. Late-joining SSE clients receive all prior events replayed from SQLite before subscribing to live ones. Both Maps are deleted (not just cleared) in the `finally` block to avoid memory leaks.

### Frontend

**`App.jsx`** — `useReducer` holds `{ sessions, activeSessionId, isRunning }`. `SESSION_DONE` is dispatched inside a `useEffect([isRunning, isDone])`, not in the render body (React 18 StrictMode requirement). `isToolActive` is derived from unmatched `tool_call`/`tool_result` pairs and passed to `NetworkMap`.

**`useSessionStream.js`** — wraps `EventSource` with `useReducer`. Resets on every new `sessionId`. Returns `{ events, connected, error }` where `events` is the full accumulated array.

**`NetworkMap.jsx`** — D3 force simulation; re-runs the full `useEffect` when `isActive` changes. The dashed animated arrow is CSS `@keyframes dash` injected inline into the SVG.

**`AttackTimeline.jsx`** — pairs `tool_call`/`tool_result` events by `toolUseId` into step objects. Expandable rows via local `useState(Set)`.

### Testing patterns

Backend tests use Vitest with ESM. `ClaudeClient` and `KaliSSH` both accept injected dependencies — the test files build lightweight mock objects directly (no `vi.mock` for those modules). `server.test.js` uses `vi.mock` for the three module imports and `supertest` for HTTP assertions.

The mock SSH channel emits events via a `_emit()` method called with `setImmediate` to simulate async I/O.

### Environment variables

All read from `.env` (loaded via `dotenv/config` in backend entry). See `.env.example` for the full list. `KALI_SSH_KEY_PATH` supports `~` expansion via `.replace(/^~/, process.env.HOME)`.

### Two integration paths

The dashboard backend SSHes to Kali directly using `ssh2` — no MCP subprocess. `mcp-server/server.py` is a separate standalone FastMCP server for Claude Desktop/Code; it independently SSHes to Kali using `paramiko`.
