# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kod is a cross-platform (Windows/Mac/Linux desktop + web + iOS/Android mobile) desktop AI client for chatting with many LLM providers. It is an Electron + React + TypeScript app forked from Chatbox Community Edition (GPLv3). The same renderer codebase targets four runtimes selected at build time via env vars (`CHATBOX_BUILD_PLATFORM` / `CHATBOX_BUILD_TARGET`): desktop (Electron), web, and mobile (Capacitor). Note: many internal identifiers, env vars, and doc references still use the "chatbox" name.

## Commands

Package manager is **pnpm** (required; Node >= 22.12). Uses `electron-vite` (not the older webpack/`.erb` setup, which is legacy).

```bash
pnpm install                 # install deps (runs .erb/scripts/postinstall)
pnpm run dev                 # start Electron app with hot reload (alias: pnpm start)
pnpm run dev:web             # run as web-only build
pnpm run dev:debug           # main process with --inspect=5858
pnpm run build               # electron-vite production build (no packaging)
pnpm run package             # build + electron-builder for current platform
pnpm run lint                # Biome lint
pnpm run lint:fix            # Biome lint --write
pnpm run format              # Biome format --write
pnpm run check               # tsc --noEmit (typecheck)
```

Testing (Vitest):

```bash
pnpm run test                # run all unit tests once
pnpm run test:watch          # watch mode
pnpm run test:ui             # Vitest UI
pnpm exec vitest run path/to/file.test.ts   # run a single test file
pnpm exec vitest run -t "test name"          # run tests matching a name
pnpm run test:integration    # integration tests (test/integration, 300s timeout)
```

Mobile builds sync via Capacitor: `pnpm run mobile:ios` / `pnpm run mobile:android`.

## Formatting / Lint Conventions

Biome (config in `biome.json`) is the single source of truth for both lint and format — there is no ESLint/Prettier in the active pipeline despite legacy config files. Key style: single quotes, no semicolons, 2-space indent, 120 col width, ES5 trailing commas, double quotes in JSX. `noExplicitAny`, `noFloatingPromises`, and `noConsole` are warnings — avoid introducing them. `lint-staged` runs `biome format` on commit via husky.

## Architecture

### Three Electron layers (`src/`)

- **`src/main/`** — Electron main process. App lifecycle (`main.ts`), windowing, tray/menu, auto-update, deep links, proxy, and privileged subsystems: `mcp/` (MCP stdio transport), `knowledge-base/` (RAG over documents, libsql/Mastra), `session-attachment-rag/`, `skills/` (installable agent skills), `sandbox/` (task/tool execution), `oauth/`, `file-parser.ts`. Persistence via `store-node.ts` (electron-store). IPC handlers are registered here (`ipcMain.handle`).
- **`src/preload/`** — `index.ts` bridges main↔renderer via `contextBridge`, exposing a typed `electronAPI` (`invoke` plus event listeners). The contract type is `ElectronIPC` in `src/shared/electron-types.ts`.
- **`src/renderer/`** — React 18 UI. Routing is **TanStack Router** (file-based, `routes/`, generated route tree). State is **Jotai atoms + Zustand stores** (`stores/`), with **TanStack React Query** for session/message caching (`chatStore.ts`).

### `src/shared/` — cross-layer, runtime-agnostic code

Imported by both main and renderer (path aliases: `@/*` → `src/renderer/*`, `@shared/*` → `src/shared/*`). Contains the core domain: types (`types.ts`, `types/`), the **provider/model system**, `defaults.ts`, and request/utils. Keep code here free of Electron- and DOM-specific APIs.

### Platform abstraction (renderer)

`src/renderer/platform/index.ts` picks one `Platform` implementation at runtime — `DesktopPlatform`, `WebPlatform`, `MobilePlatform`, or `TestPlatform` (used when `NODE_ENV=test`). All platform-divergent behavior (storage, file access, exporters, loggers) goes through the `Platform` interface (`platform/interfaces.ts`) rather than branching inline. When adding platform-specific behavior, extend the interface and implement it in each platform class.

### Storage & migrations

Storage backend varies by platform (see `docs/storage.md`): Desktop uses file store for configs + IndexedDB for sessions; Web uses IndexedDB; Mobile uses SQLite. Access goes through `src/renderer/storage/` (`BaseStorage`, `StoreStorage`, `SessionMetaStorage`, `TaskSessionStorage`, plus SQLite variants). There is a versioned config-migration system (`stores/migration.ts`) — bumping stored data shapes requires a migration step. `src/main/legacy-database-migration.ts` must be imported first in `main.ts` (before Electron `app` init).

### Provider / model system (most important domain area)

Registry-based (see `docs/adding-new-provider.md`). Providers self-register into a Map via side-effect imports in `src/shared/providers/index.ts` — **import order there determines UI display order**. To add a provider:
1. Add an entry to `ModelProviderEnum` in `src/shared/types.ts`.
2. Create a model class in `src/shared/providers/definitions/models/` (extend `OpenAICompatible` from `src/shared/models/openai-compatible.ts` for OpenAI-shaped APIs, or implement `ModelInterface`).
3. Create a definition file `src/shared/providers/definitions/<name>.ts` calling `defineProvider()`.
4. Add the side-effect import to `src/shared/providers/index.ts`.

Models are built on the **Vercel AI SDK v6** (`ai`, `@ai-sdk/*`). Model metadata is enriched from a generated snapshot (`src/shared/model-registry/snapshot.generated.ts`, regenerate with `pnpm run generate:model-snapshot`). Runtime dependencies (fetch, storage, sentry) are injected as `ModelDependencies` (built in `src/main/adapters/index.ts` for desktop) so shared model code stays platform-agnostic.

### Chat / session flow

`stores/chatStore.ts` holds session & message CRUD (React Query cached). Model invocation lives in `renderer/packages/model-calls/`, with tool calling (`tools/`, `toolsets/`), MCP integration (`packages/mcp/`), and skills (`packages/skills/`). "Task sessions" (`stores/taskSession*.ts`, `routes/task`, `main/sandbox`) are an agentic mode with tool/sandbox execution distinct from regular chat.

## Error Handling

Multi-layered (see `ERROR_HANDLING.md`): React `ErrorBoundary`, global window/promise-rejection handlers (`setup/global_error_handler.ts`), and Sentry reporting in both main and renderer. User-facing errors use i18n keys — `pnpm run sync:error-i18n-keys` keeps them in sync (`check:error-i18n-keys` verifies in CI).

## i18n

Translation source files live in `src/locales` / renderer i18n. `pnpm run translate` regenerates translations (runs i18next-parser then `script/translate.mjs`). Don't hand-edit generated locale JSON for non-source languages.

## Additional docs

The `docs/` directory has focused deep-dives worth reading before non-trivial work: `adding-new-provider.md`, `storage.md`, `rag.md`, `token-estimation.md`, `new-session-mechanism.md`, `testing.md`. Product/planning specs live in `tasks/` (PRDs) and `openspec/`.
