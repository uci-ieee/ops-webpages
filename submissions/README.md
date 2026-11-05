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

## Adding people to the roster

Nobody can sign in unless they are already on the roster, so this is how access
is granted. Two routes, same code underneath (`src/lib/roster.ts`), so they
cannot drift apart:

**Admin screen** (normal route) — sign in as an admin, go to **Admin → Import a
roster**, paste the list, submit. Accepts commas *or* tabs, so a block of cells
copied straight out of Google Sheets or Excel works as-is.

**Command line** — drop a `roster.csv` in `submissions/` and run
`npm run db:seed`.

Either way the columns are:

```csv
ucinetid,name,role,section_code,section_name
pantera,Peter Anteater,student,S01,Monday 5pm
mnguyen,"Nguyen, Marvin",instructor,S01,Monday 5pm
opsadmin,OPS Admin,admin,,
```

Only `ucinetid` is required. A full `@uci.edu` address in that column is fine —
the domain gets stripped. `role` defaults to `student`. Instructors must have a
`section_code`; sections are created on demand. Quoted fields containing commas
are handled.

Behaviour worth knowing:

- **Idempotent.** People are matched on UCInetID and updated in place, so
  re-importing the same list changes nothing and never duplicates anyone.
- **All-or-nothing.** If any line fails to parse, nothing is written and every
  problem is listed with its line number. A half-imported roster is worse than a
  rejected one.
- **Never deletes.** Importing a shorter list does not remove the people missing
  from it.
- **Never resets a signed-in account.** `status` is left alone, so someone who
  has already signed in stays `active`.

### Clearing the demo roster

The seed loads 150 synthetic accounts. **Admin → Import a roster → Remove demo
accounts** deletes them and prunes any section left empty. It matches only the
exact seed patterns (`student001…`, `instructor01…`, `admin1…3`) *and* only
accounts that have never signed in, so it cannot take a real person with it.

## File storage (Cloudflare R2)

Uploads go straight from the browser to R2 with a presigned PUT, so files never
pass through the server. Vercel's serverless request body limit is 4.5 MB, so
proxying a 50 MB video through it is not an option anyway.

Env vars (provider-neutral names, so this can be swapped):

```
S3_ENDPOINT          https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID     32 hex chars
S3_SECRET_ACCESS_KEY 64 hex chars
S3_BUCKET            ops-submission
S3_REGION            auto
STORAGE_QUOTA_BYTES  optional; defaults to 9 GB
CRON_SECRET          required for the retention sweep; see below
```

Neon Object Storage would have been the natural choice, but it only exists in
us-east-1/us-east-2/eu-central-1/ap-southeast-1 and this project's database is
in us-west-2.

### The bucket needs a CORS policy

**This is the one that will waste your afternoon.** A presigned PUT from the
browser is a cross-origin request. Without a CORS policy the browser refuses to
send it and `XMLHttpRequest` reports status `0`, which is indistinguishable from
a dropped connection — the app says "the upload was interrupted".

It cannot be set with an Object Read & Write token (403), and it cannot be
caught by a server-side test, because Node does not enforce CORS. Set it in the
dashboard: **R2 → the bucket → Settings → CORS Policy**:

```json
[
  {
    "AllowedOrigins": [
      "https://ops-submissions.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

`content-type` must be allowed because it is signed into the presigned URL. Add
any new deployment origin here too — Vercel preview deployments get unique
hostnames and will not be able to upload.

Verify without a browser:

```bash
curl -s -D - -o /dev/null -X OPTIONS \
  "$S3_ENDPOINT/$S3_BUCKET/probe" \
  -H "Origin: https://ops-submissions.vercel.app" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type" | grep -i access-control
```

Headers back means it works. `CORS not configured for this bucket` means it does
not.

### Retention sweep

`purge_after` on each submission is only a date until something acts on it.
`/api/cron/purge` is that something: it deletes files past their retention date
and sweeps objects that no submission points at.

Scheduled daily at 09:00 UTC by `vercel.json`. Vercel Cron sends
`Authorization: Bearer $CRON_SECRET`, and the endpoint **refuses to run at all**
without `CRON_SECRET` set, rather than deleting files unauthenticated. Set the
same value in Vercel, or the sweep silently never happens.

It deletes the file, never the row: `file_deleted_at` is stamped so the
submission and its review stay on record. A failed delete is left unmarked and
retried on the next run, rather than being recorded as freed while still costing
money.

Orphan sweep: a browser can finish a presigned PUT and then never confirm (tab
closed, connection dropped), leaving an object with no row. Those are invisible
to the quota, which counts rows, so nothing else would ever find them. Orphans
newer than 24 hours are left alone in case an upload is still in flight.

Check what it would do, without deleting anything:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://ops-submissions.vercel.app/api/cron/purge?dry=1"
```

Admins can also trigger it from the Storage panel on `/admin`.

### Storage ceiling

Per-file caps cannot bound the bill on their own, so `src/lib/quota.ts` enforces
an account-wide ceiling (default 9 GB, under R2's 10 GB free allowance) before
any presigned URL is issued. Past the limit, students get a clear "submissions
are paused, not your fault" message and admins see it on the admin page.

Rough sizing, 135 students: one 50 MB video each is 6.8 GB. Project 2 asks for
three videos. R2 beyond the free tier is about $0.015/GB/month with no egress
fees, so ~60 GB — the whole year with nothing ever deleted — runs about $11/year.
Raising `STORAGE_QUOTA_BYTES` is usually the better trade than making students
fight video compression.

## Deploying to Vercel

The app is not deployed yet. When you do it:

1. Import the repo at vercel.com/new, signed in on the club account.
2. **Set Root Directory to `submissions`.** This is the step people miss — the
   repo root is the static GitHub Pages site, and the build will fail without it.
3. Add environment variables (Settings → Environment Variables). `DATABASE_URL`
   and `DATABASE_URL_UNPOOLED` come from `neon env pull`; reuse the same
   `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, and
   `ALLOWED_EMAIL_DOMAIN`. **Do not set `DEV_LOGIN`** — it does nothing in a
   production build, and setting it only invites confusion.
4. Add the deployed callback URL as a second authorized redirect URI on the
   Google OAuth client: `https://<your-vercel-host>/api/auth/callback/google`.
   The localhost one stays, so local development keeps working.
5. Link it from the static site once it is live.

`trustHost: true` is already set in `src/lib/auth.ts`, which Auth.js requires in
production; without it every auth endpoint returns `UntrustedHost`.

## Not built yet

- File upload and the submissions tables. The student page has a placeholder.
- Changing a single person's role or section from the admin UI. Roster changes go
  through the import for now.
- Deployment, and a link to this app from the static site.
