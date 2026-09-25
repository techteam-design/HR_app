# HR & Leave Management App — Shosha Beauty Company (SBC), Singapore

Client: Shosha Beauty Company (SBC), Singapore. About 50 employees, local and foreign staff.
Note: the original proposal used the name Shushute Beauty Hub; the client has confirmed the final name is
Shosha Beauty Company (SBC). Production domain (confirmed): hr.sbcwellness.com.
Builder: Growwstacks. Mobile-first web app (PWA), no native app.

## Tech stack
- Next.js (App Router), TypeScript, Tailwind CSS
- Neon PostgreSQL (Singapore region) via Drizzle ORM + @neondatabase/serverless
- Better Auth: email + password login only
- Cloudflare R2 for employee photos (S3-compatible SDK)
- Resend for transactional email (not Gmail)
- Zod for all input validation
- Vitest for unit tests
- Deployed to Cloudflare via @opennextjs/cloudflare
- Route protection lives in src/proxy.ts (not middleware.ts)
- Other approved packages: date-fns and @date-fns/tz (date maths), tsx (runs the seed scripts), dotenv
  (loads env files for scripts and drizzle-kit), pg (dev dependency, used by drizzle-kit for migrations)

## Architecture rules (never break these)
1. No business logic in pages or components. Components only display data and collect input.
2. No database calls in src/lib/. The leave engine is pure functions: inputs in, results out.
   Exception: src/lib/auth/auth.ts may reference the database adapter for Better Auth. All other src/lib code stays database-free.
3. API routes stay thin: check session and role, validate with Zod, call a service in src/server/.
4. Services in src/server/ handle database reads/writes and call src/lib/ for calculations.
5. Role checks happen on the server in every API route. Hiding UI is convenience, not security.
6. Every leave rule in src/lib/leave-engine/ has unit tests in tests/leave-engine/.
7. Every balance-affecting write is traceable through leave_applications, approval_actions or leave_adjustments. Never silently change balances.
8. Cron jobs must be idempotent: running twice on the same day must not double-create entitlements.
9. Never hard-delete employees. Deactivate them and keep their records.

## Dates, time zone and numbers
- All business dates use the Asia/Singapore time zone. Compute "today" in Asia/Singapore, never server UTC.
- Store leave dates as DATE columns (no time part).
- Leave day counts can be 0.5, so use numeric/decimal columns, never floating point.

## Roles
- employee: own profile, own balances and history, submit own leave
- manager: employee rights + approve/reject for direct reports + team calendar
- admin: full access, including employees, org structure, policies, approval config, overrides, all reports and exports
- hr_viewer: read-only for other people's data; can view own profile and apply for own leave. Every write endpoint on other employees' data returns 403.
- Navigation: the "People" group (Employees, Org chart) needs view_all_records (admin + hr_viewer).
  The "Admin" group (Departments & branches, Leave policies, Approval setup) is admin only.
- My profile is read-only, except that every employee can upload or remove their own photo.
  /profile only ever loads the signed-in employee's own record (never an id from the URL). All other
  changes go through an HR admin.
- Admins can change or remove any employee's photo. Photo rules: JPEG/PNG/WebP, max 2 MB, private storage,
  shown via short-lived signed URLs. Self-service uses update_own_photo (every role) and /api/me/photo,
  which takes the employee only from the session; the admin routes use manage_employees. Both go through
  src/server/employee-photo.service.ts.

## Org structure
- Departments and branches are deactivated, never deleted. Deactivation is refused while any active or
  probation employee is assigned. Inactive ones are hidden from the employee form's dropdowns but still
  shown, labelled "(inactive)", on employees who already have them.
- Names are trimmed, 2–60 characters and unique case-insensitively. The database unique constraint is
  case-sensitive, so the case-insensitive check lives in src/lib/org/org-units.ts, used by the service.
- The org chart is built by the pure buildOrgTree() in src/lib/employees/org-tree.ts. People whose manager
  is inactive, missing or part of a reporting loop go into a "No active manager" group, so nobody disappears.

## Confirmed leave rules
### Annual leave
- Entitlement by service year: year 1 = 7 days, +1 day per year, 14 days from year 8 onward
- Leave year is anniversary-based (join date to join date) for BOTH local and foreign staff
- Local staff can apply only after 3 months of continuous service
- Foreign staff must apply at least 14 days in advance; admin can override per application
- Carry-forward: unused days carry to the next leave year, capped at 3 days. Days above 3 are forfeited
- Carried-forward days are shown separately from the new entitlement
- Cannot apply for more than the available balance

### MC (medical certificate) leave
- 14 days per calendar year (1 Jan to 31 Dec), for all staff
- Eligible after 1 month of service
- Pro-rated for employees who join mid-year
- No carry-forward; resets on 1 January
- Cannot apply for more than the available balance

### Unpaid leave
- Maximum 7 days per calendar year, resets on 1 January
- Tracked separately; never reduces annual or MC balances
- Always labelled "Unpaid" in history, reports and exports

### Half-day leave
- Deducts 0.5 day
- Local staff slots: morning 8:30 AM to 12:30 PM, afternoon 1:30 PM to 5:30 PM
- Foreign staff slots: morning 9:30 AM to 1:30 PM, afternoon 2:30 PM to 6:30 PM

### Approvals
- Configured per employee: single-level (one approver) or two-level (team head, then manager)
- A Level 1 rejection ends the request; it never reaches Level 2
- Balance is deducted only on final approval

### Balance and adjustments
- Balance per employee, leave type and entitlement period:
  entitled_days + carried_forward_days + sum(adjustments) - sum(approved application days)
- Adjustments (leave_adjustments) are admin-only and append-only: never edit or delete an adjustment.
  To fix a wrong adjustment, add a new one that offsets it.
- Adjustment reasons: opening_balance, correction. Every adjustment needs a note.

## Proposed leave rules (pending client confirmation)
### Leave cancellation (for Sprint 2B)
- An employee can cancel their own pending request at any time
- An employee can cancel their own approved leave only before its start date
- Admin can cancel any request, with a required note
- Balances restore automatically because they are calculated from approved applications

## Employee profile fields
Full name, employee ID, join date, date of birth, gender (male/female), phone, email, photo (R2),
designation, department, branch, classification (local/foreign), reporting manager, role,
status (active / inactive / probation).

## Out of scope (do not build)
Payroll, attendance or biometrics, native app store apps, integration with existing HR tools,
hospitalisation leave, leave encashment, shift scheduling, performance management.

## Open items (ask before assuming)
### Client questions
- Weekends and Singapore public holidays in leave day counting (blocks Sprint 2B)
- MC pro-rating rounding: up, down or nearest. Admin can set it on the Leave policies page once decided;
  a provisional default applies until then
- Who approves the owner's / top admin's leave
- Rule for which employees get single-level vs two-level approval
- Carry-forward expiry (none assumed)
- Foreign staff annual leave eligibility: 0 months, per the proposal (only local staff have the 3-month
  rule); confirm with client
- Leave cancellation rules (see "Proposed leave rules" above)
- Brand assets (PWA icons, theme colours) and the UAT sign-off person

### Internal to-dos
- src/proxy.ts runs as Node.js middleware, which OpenNext supports only experimentally. Fallbacks:
  middleware.ts on the edge runtime, or removing the proxy (the server checks are the real protection).
- Remove the temporary sign-in timing log (src/app/api/auth/[...all]/route.ts) before production.
- Add case-insensitive unique indexes on departments.name and branches.name (lower(name)); needs a
  migration. The service check already enforces this.
- Last-admin race: the admin guard reads the list of active admins and then writes separately. Two
  simultaneous demotions could leave no active admin. Unlikely at this size; fix with a transaction or lock.
- Enable Smart Placement (wrangler.jsonc "placement": { "mode": "smart" }) for production, so the Worker
  runs near the Neon Singapore database.
- Deploy production from GitHub Actions on Linux rather than from a Windows machine.
- Dev seed dates drift: seed-dev.ts computes dates from the day it first runs, and re-runs leave existing
  rows unchanged. Service lengths, and which employee counts as the mid-year joiner, go stale over time.
- Database-backed rate limiting before go-live (Sprint 4).
- R2 CORS rule for the production bucket and origin, when production is set up.
- Sprint 3 design decision: neon-http only supports db.batch (no interactive transactions), so approvals
  must prevent two concurrent approvals from exceeding a balance. Options to evaluate in Sprint 3: a
  conditional single-statement write, or the neon-serverless WebSocket driver for that path.

## Design system ("D · Lavender silk")
- Rule: use tokens and src/components/ui components; never hardcode colours (no hex/rgb in components).
- All tokens live in ONE place: the @theme block in src/app/globals.css. Change brand colours there only.
- Fonts (next/font, self-hosted, set up in src/app/layout.tsx): Playfair Display 500/600 + italic
  (font-display: titles) and Montserrat 400/500/600 (font-sans: body and UI).
- Colour tokens: bg, surface, lilac-50/100/200, brand-lilac (decorative only, never text), plum-900/700/500,
  muted, border, input-border, blush-50/500/700, sage-50/500/700,
  status-{approved,pending,rejected,cancelled}-{bg,text}. Use as bg-*, text-*, border-*, fill-*.
- Contrast: muted text is fine on bg, surface and the *-50 tints, but NOT on lilac-100 (fails 4.5:1).
- Radii: rounded-input (14px), rounded-card (24px), rounded-sheet (28px), rounded-full (pills), rounded-arch.
- Type: text-page-title (44px) / text-page-title-mobile (32px), text-section-title (24px), the eyebrow utility
  (12px uppercase), body 14–15px, small 12–13px text-muted. Headings italicise one accent word with <em>.
- Shadow: shadow-float (floating mobile nav). Motion: 150–200ms colour transitions only; reduced motion respected.
- Components (src/components/ui/): Button / ButtonLink, Input / Label / FieldError / FieldHint, Alert, Card,
  ArchCard, StatusBadge, DateTile, Avatar, Logo, SpaIllustration, SparkleDivider, PageHeader / AccentTitle,
  Sheet, Dialog, Checkbox, Select, icons. Layout pieces live in src/components/layout/ (PagePlaceholder,
  NavLinks, MobileNav, UserPanel).
- /design-preview (development only) shows every component with sample data.

## Deployment (Cloudflare Workers)
- Always build with `npm run cf:build` (also used by cf:preview and cf:deploy:staging), never a bare
  `opennextjs-cloudflare build` before deploying: OpenNext bundles .env / .env.local values into the Worker,
  and scripts/cf-strip-env.mjs removes them. The Worker must only see variables set on Cloudflare.
- Runtime variables (names in .dev.vars.example) are Worker secrets; none go in wrangler.jsonc.
- src/proxy.ts runs as Node.js middleware, which OpenNext supports only experimentally.
- TODO before production: remove the sign-in timing log in src/app/api/auth/[...all]/route.ts.

## Project status and history
### Sprint 1 (complete)
- Auth and roles: Better Auth config src/lib/auth/auth.ts, permissions src/lib/auth/rbac.ts, session
  helpers src/server/auth.service.ts (requireEmployee for pages, requireApiEmployee for APIs), src/proxy.ts,
  src/app/(auth)/login, src/app/api/auth/[...all].
- Forced password change: employees.must_change_password; src/app/(auth)/change-password,
  src/app/api/me/password, src/lib/auth/temporary-password.ts, src/server/login-account.service.ts.
- Inactive blocking: session-create hook in src/lib/auth/auth.ts, plus the employee check on every request
  in src/server/auth.service.ts.
- Employee management: src/app/(dashboard)/admin/employees, src/app/api/employees/**,
  src/server/employee.service.ts, src/validations/employee.ts, src/components/employees/,
  pure rules in src/lib/employees/ (admin-guard, reporting, profile-rules, service-length).
- Departments and branches: src/app/(dashboard)/admin/departments, src/app/api/{departments,branches}/**,
  src/server/{department,branch,org-unit}.service.ts, src/lib/org/org-units.ts, src/components/org/.
- Org chart: src/app/(dashboard)/admin/org-chart, src/server/org-chart.service.ts,
  src/lib/employees/org-tree.ts, src/components/org/org-chart.tsx.
- My profile: src/app/(dashboard)/profile/page.tsx.
- Photos: src/server/employee-photo.service.ts, src/lib/employees/photo-key.ts, src/app/api/me/photo/**,
  src/app/api/employees/[id]/photo, src/components/employees/photo-upload.tsx.
- Design system: src/app/globals.css, src/components/ui/, src/components/layout/, /design-preview.
- Seeds: src/db/seed.ts (leave policies), seed-admin.ts (first admin, production-safe),
  seed-dev.ts (dev data only, needs ALLOW_DEV_SEED=true).
- Tests: tests/{auth,employees,org,validations,utils}.
- Still placeholders: src/lib/leave-engine/*.ts (empty files) and tests/leave-engine (todo stubs); leave,
  approvals, reports and team calendar pages; /api/cron/* (return 501).

### Environments
- Local dev: Neon "dev" branch (values in .env.local), `npm run dev`.
- Staging: Cloudflare Worker "hr-app-staging" at https://hr-app-staging.techteam-b75.workers.dev.
  Uses the Neon dev branch and the R2 bucket sbc-hr-photos-dev. Secrets are set with `wrangler secret put`.
  The Workers Paid plan is active; sign-in measured at about 300 ms CPU (free plan limit is 10 ms).
- Production (not set up yet): hr.sbcwellness.com, registered at GoDaddy; DNS moves to Cloudflare in
  Sprint 3. Production R2 bucket sbc-hr-photos, Neon "production" branch.

### Sprint 1 decisions
- Logins are created only by admins (sign-up disabled). New logins and admin resets get a random
  temporary password and must change it on first sign-in. Until then, only the change-password page and
  API work. Changing a password signs out all other sessions.
- Passwords are 12–128 characters. Sessions last 7 days and are refreshed daily.
- Every failed sign-in, including for inactive or unlinked staff, shows the same generic error.
- Sign-in is limited to 5 attempts per minute per IP (cf-connecting-ip). The limit is kept in memory per
  Worker instance, not globally (database-backed limiting is Sprint 4).
- Better Auth's default scrypt hashing must stay. The seed scripts and login-account.service.ts write
  hashes in that format.
- Denied pages redirect to /dashboard?denied=1. APIs return 401 JSON when not signed in and 403 JSON when
  the role is not allowed.
- src/proxy.ts only checks that a session cookie exists. /api/auth and /api/cron are excluded.
- Admin protection: an admin cannot deactivate themself or remove their own admin role, and at least one
  active admin must always remain.
- A reporting manager change that would create a loop is refused. Employees must be at least 16 years old,
  and the join date can be at most 90 days in the future.
- Photos: the database stores only the R2 object key, and the file is shown through a presigned URL.
  If the image fails to load, Avatar shows initials.
- Cloudflare setup: images are unoptimised (the Images binding is not used); the incremental cache is
  served from static assets, so there is no KV or R2 binding; @aws-sdk/client-s3 is transpiled because of a
  Windows symlink error. The next.config.ts and wrangler.jsonc comments explain each one.

### Sprint plan
- Sprint 2A: entitlement engine, balances, opening balances, leave policies page, daily entitlement job,
  dashboard balances.
- Sprint 2B: day counting, leave application, validation, history. Waits for the day-counting answer
  (see "Open items").
- Sprint 3: approvals, notifications via Resend, notice card, DNS move to Cloudflare.
- Sprint 4: reports, exports, production go-live.

### How we work
- The user runs all terminal, database, git and Cloudflare commands themself. Claude may run tsc, eslint,
  vitest and local builds.
- Never read .env.local or .dev.vars.
- Never deploy, run migrations or run seeds unless asked.
- No schema changes without asking first.
- Every task report lists the files changed and the tsc, eslint and vitest results.
- Every task ends with a manual test plan.

## Conventions
- File names: lowercase-with-hyphens; services end in .service.ts
- Import alias: @/ points to src/
- Better Auth must be initialised lazily through getAuth(), never at module load (same pattern as getDb())
- Never commit .env.local or .dev.vars
- Ask before adding any package not listed in the tech stack