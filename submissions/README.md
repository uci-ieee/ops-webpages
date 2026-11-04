# OPS Submissions

The student submission app for OPS. Separate Next.js app inside the `ops-webpages`
repo; the rest of the repo is still the static GitHub Pages site and is untouched
by this folder.

## Why it is a separate app

GitHub Pages serves files only -- it cannot run a server, hold a database
connection, or set a session cookie. So this runs as its own app (intended for
`submit.openprojectspace.org`) and the static site links to it.

## Sign-in model

There are no passwords anywhere in this system.

- Sign-in is Google, restricted to `@uci.edu`.
- The UCInetID is the local part of the email, so signing in *proves* UCInetID
  ownership rather than asking someone to retype a password they reuse elsewhere.
- The `users` table **is** the roster. A row is what permits sign-in. Rows are
  created by the roster import (`status = "invited"`), and a first successful
  sign-in flips the row to `"active"`. Nobody can create an account by signing
  in, and there is no per-student provisioning step.

## Roles

| Role | Sees |
| --- | --- |
| `student` | Their own section and their own submissions |
| `instructor` | Only students enrolled in sections assigned to them |
| `admin` | Every user, section, and instructor assignment |

Scoping runs through two join tables: `section_instructors` (who teaches what)
and `enrollments` (who sits where). An instructor's student list is one joined
query with the instructor id in the `WHERE` clause, so there is no code path that
can return an unscoped list by accident. `instructorCanSeeStudent()` in
`src/lib/queries.ts` is the guard for per-student pages -- hiding a row from a
list is not access control.

## First-time setup

1. **Install** (from the repo root): `npm run submissions:install`

2. **Database.** Already provisioned on Neon (project `super-rain-78505887`,
   branch `production`, PostgreSQL 18.6). The project link lives in `.neon` and
   the service policy in `neon.ts`. If you need the connection strings again:
   `neon env pull` writes both `DATABASE_URL` (pooled) and
   `DATABASE_URL_UNPOOLED` (direct) into `.env.local`.

3. **Create a Google OAuth client.** console.cloud.google.com -> APIs & Services
   -> Credentials -> Create credentials -> OAuth client ID -> Web application.
   Add this exact authorized redirect URI:

   ```
   http://localhost:3000/api/auth/callback/google
   ```

4. **Fill in `submissions/.env.local`** (already created, gitignored, with an
   `AUTH_SECRET` generated and both Neon URLs in place). Only `AUTH_GOOGLE_ID`
   and `AUTH_GOOGLE_SECRET` are still blank. See `.env.local.example` for the
   full annotated list.

5. **Create the tables**: `npm run submissions:push` (from the repo root)

6. **Load a roster**: `npm run submissions:seed`

   With no `roster.csv` present this loads a demo roster at the real size OPS
   runs at -- 135 students, 12 instructors, 3 admins, 12 sections -- so the
   dashboards can be judged at actual scale.

   To load the real roster, drop a `submissions/roster.csv` in place first:

   ```csv
   ucinetid,name,role,section_code,section_name
   pantera,Peter Anteater,student,S01,Lab Section S01
   zotofficer,Zot Officer,instructor,S01,Lab Section S01
   opsadmin,OPS Admin,admin,,
   ```

   Re-running is safe; every write is an upsert.

7. **Run it**: `npm run dev` from the repo root (or `npm run dev` in here).
   http://localhost:3000

## Testing all three roles without three Google accounts

With `DEV_LOGIN="1"` in `.env.local`, the login page grows a "Dev only" box where
you can sign in as any UCInetID on the roster. Try `student001`, `instructor01`,
and `admin1`.

This is gated on `NODE_ENV === "development"`, which Next sets to `production`
for `next build`. The provider is compiled out of any deployed bundle -- it
cannot ship by accident.

## Speed

The site this links from is already slow, so this app is built to not add to it:

- Every dashboard is a server component. Page JS is ~135 B; the rest of the
  ~103 kB first load is the React runtime itself.
- No CSS framework, no webfonts, no CDN requests. One small stylesheet, system
  font stack. Nothing third-party blocks the first paint.
- JWT sessions, so a page load costs **zero** auth queries. The only per-request
  database read on a protected page is one indexed primary-key lookup to
  re-verify role -- deliberate, so demoting or disabling someone takes effect on
  their next click instead of whenever their token expires.
- Instructor and admin screens are each a fixed number of queries regardless of
  roster size. No N+1 per section.
- The connection pool is cached on `globalThis` so hot reload and warm
  serverless invocations reuse it, and is handed to `attachDatabasePool` on
  Vercel so frozen instances release connections instead of leaking them.

## Database connections

Two Neon URLs, and they are not interchangeable:

| Variable | Host | Used by |
| --- | --- | --- |
| `DATABASE_URL` | has `-pooler` | the app (`src/lib/db/index.ts`) |
| `DATABASE_URL_UNPOOLED` | no `-pooler` | `drizzle-kit push` (`drizzle.config.ts`) |

Migrations must bypass PgBouncer. Run through the pooled URL they fail with
errors that never mention pooling -- a `SET` that does not persist past its own
transaction, or a prepared-statement collision.

The driver is **node-postgres** (`pg`), not the HTTP serverless driver: these
queries run from long-lived Node server components on Vercel Fluid compute,
where a reused TCP pool beats a per-query HTTP round trip.

Both URLs pin `sslmode=verify-full`. `pg` currently treats `require` as
`verify-full` but warns that a future major will weaken it to libpq semantics;
being explicit keeps full certificate verification.

## Gotcha: dev and prod share .next

`next dev --turbopack` and `next start` both use the `.next` directory, and the
dev server overwrites the production manifest. Running `npm run dev` after
`npm run build` makes `next start` fail with
`TypeError: routesManifest.dataRoutes is not iterable`. That is not a code
problem -- rebuild before `next start`, and do not run both servers at once.

## Scripts

Run from `submissions/` (or the `submissions:*` aliases from the repo root).

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server on :3000 (Turbopack) |
| `npm run build` | Production build; fails on type errors |
| `npm run db:push` | Push `schema.ts` to the database |
| `npm run db:seed` | Load `roster.csv`, or the demo roster |
| `npm run db:studio` | Browse the database in a GUI |
| `npm run typecheck` | `tsc --noEmit` |

## Not built yet

- File upload and the submissions tables. The student page has a placeholder.
- Admin mutations: roster CSV import from the UI, role changes, section
  assignment. All read-only for now; seeding is the CSV path.
- Deployment. Nothing is wired to Vercel or to DNS, and the static site does not
  link here yet.
