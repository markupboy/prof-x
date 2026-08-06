# Stack Contract — Next.js App (default)

The canonical shape. This file is the source of truth for versions and boilerplate.
Copy it; do not improvise it.

**Stack**: Next.js 16 (App Router) · React 19 · TypeScript 5.7 (strict) · Tailwind CSS
3.4 · Prisma 7 + Postgres 17 · Vitest 4 · pnpm 10

**Explicitly not in this stack** — do not reach for these without asking: Prettier,
Biome, monorepo tooling (turbo/nx/workspaces), a state manager (Redux/Zustand/Jotai), a
data-fetching library (TanStack Query/SWR), a form library, an ORM other than Prisma, or
any of Vercel/Fly/Railway/Cloudflare. Deployment is self-hosted k3s via Gitea Actions
and Argo CD.

---

## package.json

Versions are pinned exactly where the ecosystem is volatile (`next`, `react`,
`typescript`, `@types/react*`) and caret-ranged where it is not. The `pnpm.overrides`
block exists because transitive deps drag in mismatched React types, which surface as
hundreds of phantom JSX errors in `tsc --noEmit`.

```json
{
  "name": "<name>",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@10.33.0",
  "scripts": {
    "dev": "next dev --turbo",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ci": "vitest run --coverage --reporter=default --reporter=junit --outputFile.junit=test-results.xml",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.8.0",
    "@prisma/client": "^7.8.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.544.0",
    "next": "16.1.6",
    "pg": "^8.20.0",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "tailwind-merge": "^2.5.5",
    "tailwindcss-animate": "^1.0.7"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22",
    "@types/pg": "^8.20.0",
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "^5.1.4",
    "@vitest/coverage-v8": "^4.1.6",
    "eslint": "^9.39.4",
    "eslint-config-next": "^16.2.6",
    "happy-dom": "^20.7.0",
    "postcss": "^8.5.14",
    "prisma": "^7.8.0",
    "tailwindcss": "^3.4.19",
    "tsx": "^4.23.1",
    "typescript": "5.7.3",
    "vitest": "^4.1.6"
  },
  "pnpm": {
    "overrides": {
      "@types/react": "19.2.7",
      "@types/react-dom": "19.2.3"
    },
    "onlyBuiltDependencies": ["@prisma/engines", "esbuild", "prisma"]
  }
}
```

**Opt-in additions** (only when Phase 2 confirmed them):

| Need | Add |
|------|-----|
| Auth | `next-auth@^5.0.0-beta.25`, `@auth/prisma-adapter`, `bcryptjs`, `@types/bcryptjs` |
| Object storage | `minio` |
| Input validation beyond the trivial | `zod@3.25.76` (pinned — v4 is a different API) |
| Masonry / grid gallery | `react-masonry-css` |
| Image processing | `sharp` (add to `onlyBuiltDependencies`) |
| Charts | `recharts` |
| Toasts | `sonner` |

---

## Directory contract

Flat root. **No `src/`** — `@/*` maps to the repo root. This is not negotiable per
project; an import path that resolves differently in two repos is a tax on every move
between them.

```
app/
  layout.tsx  page.tsx  globals.css
  api/<thing>/route.ts        # REST handlers, one dir per resource
components/
  <thing>-card.tsx            # kebab-case, flat or one level of grouping
  ui/                         # shadcn output only, if used
hooks/
lib/
  prisma.ts                   # the ONLY PrismaClient
  api.ts                      # typed fetch wrappers the client calls
  utils.ts                    # cn()
  generated/prisma/           # gitignored; generated client
prisma/
  schema.prisma  migrations/
scripts/
  seed.ts
tests/
  setup.ts  fixtures/  mocks/
```

Conventions that matter:

- **kebab-case filenames** everywhere.
- **`route.ts` handlers** under `app/api/**`. Next 16: dynamic params are Promises —
  `const { id } = await params`.
- **Domain logic lives in `lib/`**, with a single module owning each side-effecting
  boundary. `lib/prisma.ts` is the only place a client is constructed;
  `lib/storage.ts` is the only place the bucket is touched.
- **Server-driven data.** Pagination, search, and filtering are query params applied
  server-side in the Prisma `where` — never a client-side `useMemo` over a full read.
  It works at 20 rows and dies at 20,000.
- **Tests colocate** next to source (`lib/api.test.ts`, `app/api/posts/route.test.ts`);
  `tests/` holds only `setup.ts`, `fixtures/`, and `mocks/`.

---

## Configs (verbatim)

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "target": "ES6",
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

### `next.config.mjs`

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by the Dockerfile: the runner stage copies .next/standalone.
  output: 'standalone',
}

export default nextConfig
```

Add `images.remotePatterns` when rendering remote images, and
`serverExternalPackages: ['<pkg>']` for any dependency doing dynamic requires that Next
must not bundle (`playwright-core`, `fluent-ffmpeg`, `ffmpeg-static`).

**Do not add `typescript: { ignoreBuildErrors: true }`.** It is usually added once to
unblock a deploy and never removed, after which `next build` happily ships type errors
and `pnpm typecheck` becomes the only gate that catches a broken import before prod. A
fresh project has no reason to start there. (Keep the `typecheck` script regardless; it
is faster than a build and belongs in CI either way.)

### `eslint.config.mjs`

```js
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [".next/", "node_modules/", "coverage/", "lib/generated/"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Allow _ prefixed unused vars (interface compliance, destructuring).
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "tests/**", "*.config.ts", "*.config.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default config;
```

Add `"@next/next/no-img-element": "off"` only when the app genuinely serves
user-uploaded media that `next/image` cannot optimize — with a comment saying so.

### `postcss.config.mjs`

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
  },
}

export default config
```

### `tailwind.config.ts`

```ts
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    '*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
```

### `app/globals.css`

Dark-only. **No light mode, no theme toggle** — define `:root` and stop. Do not add a
`.dark` block or a toggle unless asked.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .text-balance {
    text-wrap: balance;
  }
}

@layer base {
  :root {
    --background: 0 0% 4%;
    --foreground: 0 0% 93%;
    --card: 0 0% 7%;
    --card-foreground: 0 0% 93%;
    --popover: 0 0% 7%;
    --popover-foreground: 0 0% 93%;
    --primary: 0 0% 93%;
    --primary-foreground: 0 0% 4%;
    --secondary: 0 0% 12%;
    --secondary-foreground: 0 0% 93%;
    --muted: 0 0% 12%;
    --muted-foreground: 0 0% 55%;
    --accent: 210 10% 16%;
    --accent-foreground: 0 0% 93%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 93%;
    --border: 0 0% 14%;
    --input: 0 0% 14%;
    --ring: 210 10% 40%;
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

Give the app an identity by changing `--primary` only — one accent hue, e.g.
`340 82% 52%` for pink, or leave it near-white. Leave the neutrals alone.

### `app/layout.tsx`

```tsx
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: '<Name>',
  description: '<one line>',
}

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
```

### `lib/utils.ts`

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## Database

### `prisma/schema.prisma` — header is load-bearing

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}

datasource db {
  provider = "postgresql"
}
```

Two deliberate choices:

- **`provider = "prisma-client"`** (the new generator, not `prisma-client-js`) with an
  explicit `output` into `lib/generated/prisma`. Import it as
  `@/lib/generated/prisma/client`. The directory is gitignored, so **CI must run
  `pnpm prisma generate` before typecheck or build** or every import in `lib/` fails.
- **`datasource db` declares no `url`.** `prisma.config.ts` supplies it. This is not
  cosmetic: without that file present at runtime, `prisma migrate deploy` exits with
  "The datasource.url property is required in your Prisma config file," and because the
  container's start command is an `&&` chain, the server never starts.

Model conventions:

```prisma
model Run {
  id         Int      @id @default(autoincrement())
  name       String
  status     String   // queued | running | succeeded | failed
  startedAt  DateTime @default(now()) @map("started_at")
  finishedAt DateTime? @map("finished_at")

  steps Step[]

  @@index([status, startedAt(sort: Desc)])
  @@map("runs")
}

model Step {
  id    Int    @id @default(autoincrement())
  runId Int    @map("run_id")
  run   Run    @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@map("steps")
}
```

- `@map` / `@@map` for snake_case columns and tables against camelCase TS fields.
- `Int @id @default(autoincrement())` unless the entity has a natural external key.
- `@@index` on **every** column you filter or sort by, with `sort: Desc` on time
  columns — the index is unusable for `ORDER BY ... DESC` otherwise.
- `onDelete: Cascade` on child relations.
- Status as a `String` with the legal values in a trailing comment, **not** a Prisma
  enum — enums require a migration to add a value, which is friction on exactly the
  field that changes most.

### `prisma.config.ts`

```ts
import path from "node:path";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

const envPath = path.resolve(__dirname, ".env");
if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

### `lib/prisma.ts`

```ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 60_000,
    // Fail fast instead of hanging on the OS TCP stack when Postgres is
    // unreachable (e.g. after the container is recreated with a new IP and
    // routing is briefly stale — the source of intermittent EHOSTUNREACH
    // hangs). The driver-adapter path ignores connection-string pool params,
    // so these must live on the pg.Pool.
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    // Don't let a single stuck query pin a pool slot forever.
    statement_timeout: 15_000,
    query_timeout: 15_000,
  });
  // Surface background failures on idle clients instead of crashing the process.
  pool.on("error", (err) => {
    console.error("[prisma] idle pg client error:", err);
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

The `globalThis` cache is not a nicety — without it, Next's dev-mode module reloading
opens a new pool on every edit until Postgres refuses connections.

### `docker-compose.yml`

Local dev only; production Postgres is CloudNativePG on the cluster. **Pick a free host
port** — the low ports are usually already held by another local container, and a
collision presents as an auth failure against the wrong database rather than a bind
error.

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: <name>
    ports:
      - "<free-port>:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pgdata:
```

### `.env.example`

Commit this; never commit `.env`.

```
# Copy to .env and fill in. Values here are the local-dev defaults.
DATABASE_URL=postgresql://postgres:postgres@localhost:<free-port>/<name>
```

---

## Testing

### `vitest.config.ts`

```ts
import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    // Never run the copies of tests that `next build` emits into .next/standalone.
    exclude: [...configDefaults.exclude, ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["lib/**", "hooks/**", "components/**", "app/api/**"],
      exclude: [
        "lib/generated/**",
        "lib/prisma.ts",
        "components/ui/**",
        "**/*.test.{ts,tsx}",
        "**/*.d.ts",
      ],
    },
  },
});
```

### `vitest-env.d.ts`

```ts
// Makes Vitest's globals (describe/it/expect/vi/beforeEach/...) visible to
// TypeScript. vitest.config.ts sets `globals: true`, so tests pass at runtime
// without this — but `tsc --noEmit` and the editor's TS server have no
// declaration for them and report a "Cannot find name 'describe'" error in
// every test file.
//
// Deliberately a reference directive rather than `"types": ["vitest/globals"]`
// in tsconfig.json: that key turns TypeScript's automatic inclusion of all
// @types/* packages into an explicit allowlist, which would drop @types/node
// and break Buffer and NodeJS.Timeout. This form is purely additive.
/// <reference types="vitest/globals" />
```

### `tests/setup.ts`

```ts
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

vi.stubGlobal("open", vi.fn(() => null));
vi.stubGlobal("scrollTo", vi.fn());

// Mock next/link → plain <a>
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => {
    const { createElement } = require("react");
    return createElement("a", { href, ...props }, children);
  },
}));

// Mock next/image → plain <img>
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { createElement } = require("react");
    return createElement("img", props);
  },
}));
```

### `tests/mocks/prisma.ts`

```ts
import { vi } from "vitest";

export const prismaMock = {
  run: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
```

Route-handler tests import this mock, never a live client — the suite must run without
Postgres.

---

## `.gitignore`

```
node_modules/
.next/
.env
.env*.local
.DS_Store
/lib/generated/prisma
coverage/
test-results.xml
next-env.d.ts
tsconfig.tsbuildinfo
# Claude Code
.claude/settings.local.json
.claude/worktrees/
.mcp.json
```

---

## Dockerfile

Multi-stage on `node:22-alpine`, standalone output, non-root. Migrations run at start.

```dockerfile
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# --- Build ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Empty .env so prisma.config.ts's loader doesn't fail; real values come from
# the environment at runtime.
RUN touch .env
RUN pnpm prisma generate
RUN pnpm build

# --- Runner ---
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# lib/ carries the generated Prisma client needed at runtime; with scripts/ and
# tsconfig.json it also lets one-off maintenance scripts run via `docker compose
# exec app`.
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Prisma CLI + migrations for the startup migrate. prisma.config.ts is required,
# not optional: schema.prisma declares the datasource without a `url`, so this
# file is the only thing supplying DATABASE_URL. Without it `prisma migrate
# deploy` fails and the && chain means the server never starts.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

`.dockerignore`: `node_modules`, `.next`, `.git`, `coverage`, `.env`.

---

## CI and deploy (`--deploy` only)

Gitea Actions, not GitHub. Images go to `gitea.hoth.cc/blake/<name>`; the deploy job
pins the SHA into the `hoth.cc` repo's manifests so Argo CD sees a change and rolls out.

### `.gitea/workflows/test.yaml`

```yaml
name: Test
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4.2.0
        with:
          node-version: "24"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      # Must run before lint/typecheck/build: the generated client is gitignored
      # and imported throughout lib/.
      - run: pnpm prisma generate
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test:ci
      - run: pnpm build
```

### `.gitea/workflows/build.yaml`

```yaml
# Push-to-deploy for the k3s cluster. Builds the image, pushes it to Gitea's
# registry, then writes the new SHA into the hoth.cc manifests so Argo CD rolls
# it out. Without that write-back a bare :latest would not redeploy — Argo sees
# no manifest change.
#
# Requires two Actions secrets ON THIS REPO (each repo has its own secret store —
# putting them on hoth.cc does not work):
#   REGISTRY_TOKEN  — Gitea PAT with write:package
#   MANIFESTS_TOKEN — Gitea PAT with write access to blake/hoth.cc
name: Build and push image
on:
  push: { branches: [main], tags: ["v*"] }
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: gitea.hoth.cc
          username: ${{ github.actor }}
          password: ${{ secrets.REGISTRY_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: |
            gitea.hoth.cc/blake/<name>:latest
            gitea.hoth.cc/blake/<name>:${{ github.sha }}

  deploy: # push-to-deploy: pin the SHA into hoth.cc -> Argo rolls out
    needs: build
    runs-on: ubuntu-24.04
    if: github.ref == 'refs/heads/main'
    steps:
      - name: Pin the image SHA in the hoth.cc manifests
        run: |
          set -euo pipefail
          git clone "https://${{ github.actor }}:${{ secrets.MANIFESTS_TOKEN }}@gitea.hoth.cc/blake/hoth.cc.git" repo
          cd repo
          img="gitea.hoth.cc/blake/<name>:${{ github.sha }}"
          # Every occurrence is replaced: the app container and the migrate
          # initContainer run the same image and must never drift apart, or
          # migrations would run from a different build than the server.
          sed -i "s#image: gitea.hoth.cc/blake/<name>:.*#image: ${img}#" k8s/manifests/<name>/deployment.yaml
          git config user.name "<name> CI"; git config user.email "ci@hoth.cc"
          if git diff --quiet; then echo "already pinned"; exit 0; fi
          git commit -am "Deploy <name> @ ${GITHUB_SHA:0:7}"
          git push
```

Cluster-side notes for the `hoth.cc` manifest: `replicas: 1` with
`strategy: Recreate`, migrations as an initContainer running the same image, secrets
from Infisical, Postgres from CloudNativePG.
