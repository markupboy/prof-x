# Stack Contract — Service + SPA (`--service`)

The service shape: a Fastify API that owns the data and the schedule, plus a Vite
React SPA it serves in production. Reach for this instead of the Next.js app when the
work is **backend-shaped** — a sync loop, a poller, an integration daemon — and the UI
is a thin window onto it. If the app is page-shaped, use `stack-app.md`.

**Stack**: Node 20 · Fastify 5 · Drizzle ORM + Postgres 16 · Vite 6 + React 18 ·
TypeScript 5.7 (strict, ESM) · npm workspaces

**Deliberate divergences from the app stack** — do not "fix" these toward the Next.js
conventions:

| | App stack | Service stack |
|---|---|---|
| Package manager | pnpm 10 | **npm** + `package-lock.json` |
| ORM | Prisma | **Drizzle** + drizzle-kit |
| DB handle | global singleton (`lib/prisma.ts`) | **injected** — `createDb(url)` passed to each route module |
| Component files | kebab-case | **PascalCase** (`ActivityRow.tsx`) |
| Path alias | `@/*` → root | **none** — relative imports only |
| Styling | Tailwind + HSL tokens | **plain CSS** + custom properties |
| Module system | Next's bundler | **ESM**, `.js` extensions on relative imports |

That last one bites: with `"type": "module"` and `moduleResolution: Bundler` on a
`tsc`-built server, every relative import must be written `./config.js` even though the
file on disk is `config.ts`.

---

## Layout

```
package.json              # workspaces: ["server", "web"]
docker-compose.yml  Dockerfile  docker-entrypoint.sh
server/
  package.json  tsconfig.json  drizzle.config.ts
  drizzle/                    # generated SQL migrations + meta/
  src/
    index.ts                  # Fastify bootstrap, cron, static SPA serving
    env.ts                    # dotenv, multi-path lookup
    config.ts                 # zod-validated config object
    migrate.ts                # programmatic migrator; the entrypoint calls this
    db/{index.ts,schema.ts}
    routes/<resource>.ts      # registerXRoutes(app, db)
web/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.tsx  App.tsx  api.ts  types.ts  styles.css
    components/<Thing>.tsx
```

---

## Manifests

### Root `package.json`

```json
{
  "name": "<name>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["server", "web"],
  "scripts": {
    "dev": "concurrently -n server,web -c blue,magenta \"npm:dev:server\" \"npm:dev:web\"",
    "dev:server": "npm run dev --workspace server",
    "dev:web": "npm run dev --workspace web",
    "build": "npm run build --workspace web && npm run build --workspace server",
    "start": "npm run start --workspace server",
    "db:start": "docker compose up -d postgres",
    "db:stop": "docker compose stop postgres",
    "db:reset": "docker compose down -v && docker compose up -d postgres",
    "db:generate": "npm run db:generate --workspace server",
    "db:migrate": "npm run db:migrate --workspace server",
    "db:push": "npm run db:push --workspace server",
    "db:studio": "npm run db:studio --workspace server"
  },
  "devDependencies": { "concurrently": "^9.1.0" }
}
```

Build order matters: `web` first, because the server's runtime static handler looks for
`web/dist`.

### `server/package.json`

```json
{
  "name": "@<name>/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@fastify/static": "^8.0.3",
    "dotenv": "^16.4.7",
    "drizzle-orm": "^0.45.2",
    "fastify": "^5.2.0",
    "node-cron": "^3.0.3",
    "pg": "^8.18.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.5",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.15.4",
    "drizzle-kit": "^0.31.4",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

### `web/package.json`

```json
{
  "name": "@<name>/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.7"
  }
}
```

---

## Configs

### `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": false,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

`web/tsconfig.json` is the same plus `"lib": ["ES2022", "DOM", "DOM.Iterable"]`,
`"jsx": "react-jsx"`, `"noEmit": true`, `"isolatedModules": true`,
`"noUnusedLocals": true`, `"noUnusedParameters": true`.

### `web/vite.config.ts`

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:4000" } },
  build: { outDir: "dist" },
});
```

### `server/drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";
import "./src/env.js";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:<port>/<name>",
  },
});
```

---

## Server modules

### `src/env.ts` — load `.env` from wherever it is

```ts
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import dotenv from "dotenv";

// Load .env from the first place it exists. The server runs with cwd=server/
// under npm workspaces, so the root .env would otherwise be missed.
const moduleDir = dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  join(process.cwd(), ".env"),
  join(moduleDir, "..", "..", ".env"), // <root>/.env from server/{src,dist}/
  join(moduleDir, "..", ".env"),
]) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}
```

### `src/config.ts` — zod-validated, fails loudly

Parse the environment once into a typed object; never read `process.env` deeper in the
app. A bad env var should stop the process at boot with a readable message, not surface
as `undefined` three layers down.

```ts
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:<port>/<name>"),
  PORT: z.coerce.number().int().positive().default(4000),
  SYNC_CRON: z.string().default("*/15 * * * *"),
  SYNC_ON_BOOT: z.string().optional().transform((v) => v === "true" || v === "1"),
});

export interface Config {
  databaseUrl: string;
  port: number;
  syncCron: string;
  syncOnBoot: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${issues}\n\nSee .env.example for required variables.`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.PORT,
    syncCron: e.SYNC_CRON,
    syncOnBoot: e.SYNC_ON_BOOT ?? false,
  };
}
```

### `src/db/index.ts` — the DB is created, not imported

```ts
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

export function createDb(databaseUrl: string): { db: DB; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  // Idle pooled connections can drop (network blip, server restart). Without a
  // handler, pg re-emits the error on the pool and crashes the process; with
  // one, the pool discards the dead client and hands out a fresh connection.
  pool.on("error", (err) => {
    console.error("pg pool: idle client error", err.message);
  });
  return { db: drizzle(pool, { schema }), pool };
}

export type DB = ReturnType<typeof drizzle<typeof schema>>;
/** The handle drizzle passes to a transaction callback. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything queries can run against: the pool-backed db or an open transaction. */
export type Queryable = DB | Tx;

export * from "./schema.js";
```

### `src/db/schema.ts` — conventions

- `pgTable` with **property names doubling as snake_case column names** (`is_bot`, not
  `isBot`) — no `@map` layer to keep in sync.
- Const-tuple enums rather than pg enums, so adding a value needs no migration:

```ts
export const RUN_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
```

- A `customType` for `timestamptz → ISO string` when the API should emit strings;
  drizzle bypasses `pg.types.setTypeParser`, so global parsers do nothing here.

### `src/routes/<resource>.ts` — register functions

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { type DB, runs } from "../db/index.js";

const ParamsSchema = z.object({ id: z.coerce.number().int() });

export function registerRunRoutes(app: FastifyInstance, db: DB): void {
  app.get("/api/runs", async () => {
    const rows = await db.select().from(runs);
    return { runs: rows };
  });

  app.get("/api/runs/:id", async (request, reply) => {
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({ error: "numeric id required" });
    }
    const rows = await db.select().from(runs).where(eq(runs.id, params.data.id));
    if (rows.length === 0) {
      return reply.status(404).send({ error: `unknown run: ${params.data.id}` });
    }
    return rows[0];
  });
}
```

Every handler validates its input with zod and returns a real status code. No handler
constructs its own DB connection.

### `src/index.ts` — bootstrap

```ts
import "./env.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cron from "node-cron";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";
import { registerRunRoutes } from "./routes/runs.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.databaseUrl);

  const app = Fastify({ logger: true });

  // Drain the pg pool on close, and translate k8s/compose signals into a
  // graceful Fastify shutdown so in-flight queries finish first.
  app.addHook("onClose", async () => {
    await pool.end();
  });
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      app.log.info(`${signal} received, shutting down`);
      void app.close().then(() => process.exit(0));
    });
  }

  registerRunRoutes(app, db);
  app.get("/api/health", async () => ({ ok: true }));

  // Serve the built SPA in production. In dev, Vite handles the UI.
  const webDist = join(moduleDir, "..", "..", "web", "dist");
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.status(404).send({ error: "not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  if (cron.validate(config.syncCron)) {
    cron.schedule(config.syncCron, () => {
      app.log.info("scheduled sync starting");
      // runSync(db, config).catch((err) => app.log.error({ err }, "sync failed"));
    });
  } else {
    app.log.warn(`invalid SYNC_CRON "${config.syncCron}"; scheduled sync disabled`);
  }

  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`<name> listening on :${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

The SPA fallback must exclude `/api/` — without that guard a typo'd API path returns
`index.html` with a 200, and the client parses HTML as JSON.

### `src/migrate.ts` — the entrypoint's migration step

```ts
import "./env.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadConfig } from "./config.js";
import { createDb } from "./db/index.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(moduleDir, "..", "drizzle"); // server/{src,dist}/../drizzle

async function main(): Promise<void> {
  const config = loadConfig();
  const { db, pool } = createDb(config.databaseUrl);
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        await pool.query("SELECT 1");
        break;
      } catch (err) {
        if (attempt >= 30) throw err;
        console.log(`waiting for postgres (attempt ${attempt}/30)...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    await migrate(db, { migrationsFolder });
    console.log("migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## Web

No CSS framework. `web/src/styles.css` defines custom-property tokens on `:root` and
the components use BEM-ish class names:

```css
:root {
  --bg: #0f1117;
  --panel: #171a23;
  --panel-2: #1f2430;
  --border: #2a3040;
  --text: #e6e9ef;
  --muted: #8b93a7;
  --accent: #6aa1ff;
  --green: #3fb950;
  --red: #f85149;
}
```

`web/src/api.ts` is a hand-rolled `fetch` wrapper — no React Query, no state manager.
`web/src/types.ts` mirrors the server's response shapes by hand; there is no codegen.

---

## Docker

4-stage `node:20-alpine`: `base` copies the three manifests for layer caching, `build`
runs `npm ci && npm run build`, `prod-deps` runs `npm ci --omit=dev`, `runtime` copies
`server/dist`, `server/drizzle`, and `web/dist`. Install `postgresql-client` in the
runtime stage for `pg_isready`. `EXPOSE 4000`.

### `docker-entrypoint.sh`

```sh
#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

# Parse connection parts out of DATABASE_URL for pg_isready.
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|^[^@]+@([^:/]+).*|\1|')
DB_PORT=$(echo "$DATABASE_URL" | sed -E 's|^[^@]+@[^:/]+:([0-9]+).*|\1|')
DB_USER=$(echo "$DATABASE_URL" | sed -E 's|^[a-z]+://([^:@]+).*|\1|')
DB_NAME=$(echo "$DATABASE_URL" | sed -E 's|.*/([^/?]+)(\?.*)?$|\1|')
[ "$DB_PORT" = "$DATABASE_URL" ] && DB_PORT=5432

echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
attempt=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -q; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "WARNING: Postgres not reachable after ${attempt} attempts; continuing anyway"
    break
  fi
  sleep 1
done

echo "Running database migrations..."
if ! node server/dist/migrate.js; then
  echo "WARNING: migrations failed; starting the server anyway"
fi

echo "Starting <name>..."
exec node server/dist/index.js
```

`docker-compose.yml` mirrors the app stack's — `postgres:16-alpine` on a free host port
with a healthcheck and a named volume.

---

## Build order and gates

The `/start-vibing` Phase 3 table maps onto this stack as:

| # | Step | Gate |
|---|------|------|
| 1 | Three `package.json` files → `npm install` at the root | exits 0 |
| 2 | tsconfigs, `vite.config.ts`, `env.ts`, `config.ts` | `npm run build` succeeds in both workspaces |
| 3 | `docker-compose.yml` → `docker compose up -d postgres` | `pg_isready` succeeds |
| 4 | `db/schema.ts` → `npm run db:generate` → `npm run db:migrate` | a file lands in `server/drizzle/` |
| 5 | `routes/<resource>.ts` + `index.ts` + `web/src/{api,App}.tsx` | the SPA renders rows from Postgres |
| 6 | — | this shape ships no test framework by default; if the user wants one, add Vitest per `stack-app.md` and say so |
| 7 | Full gate | `npm run build` green |
| 8 | `npm run dev` | `curl -sf localhost:4000/api/health` returns `{"ok":true}` and the SPA loads on 5173 |

Steps 9–12 (project `CLAUDE.md`, git, archive, deploy) are identical to `stack-app.md`.
