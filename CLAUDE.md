# HR & Leave Management App — Shosha Beauty Company (SBC), Brunei

Client: Shosha Beauty Company (SBC), Brunei. About 50 employees, local and foreign staff.
(Earlier notes said Singapore; the business is in Brunei. The Neon database stays in the Singapore region,
the closest region to Brunei.)
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
- All business dates use the Asia/Brunei time zone (UTC+8, no daylight saving: the same offset as
  Singapore). Compute "today" in that zone, never server UTC. The zone is ONE constant,
  BUSINESS_TIME_ZONE in src/lib/utils/dates.ts (the seed scripts import it too). "Today" is
  todayIsoInBrunei(); the hour for greetings is bruneiHour().
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
- Pro-rated for employees who join mid-year, rounded UP to the nearest 0.5 day (client decision; the
  admin sets "up" on the Leave policies page, no code change)
- No carry-forward; resets on 1 January
- Cannot apply for more than the available balance

### Unpaid leave
- Maximum 7 days per calendar year, resets on 1 January
- Tracked separately; never reduces annual or MC balances
- Always labelled "Unpaid" in history, reports and exports

### Day counting (Phase 1, client-approved "option A")
- The system has no working week and no public holiday list: public holidays are normal days to the
  system, and staff are responsible for requesting only their actual working days.
- Staff have individual rostered off days. When applying, the employee sees every date in the chosen
  range (e.g. "Mon 14 Oct"), all ticked by default, and unticks their off days and any public holiday
  that is an off day for them. Only ticked dates count (full day 1, half day 0.5).
- Automatic public holidays are Phase 2 (see "Phase 2 backlog").

### Half-day leave
- Deducts 0.5 day; only on a single-date request, with a morning or afternoon slot
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

## Leave engine formulas (as implemented, Sprint 2A)
Pure functions in src/lib/leave-engine/, tested in tests/leave-engine/. Dates are "YYYY-MM-DD" strings;
"today" is always todayIsoInBrunei() (business time zone, Asia/Brunei). Day counts are multiples of 0.5.
- Leave year (leave-year.ts): annual service year N runs from the (N-1)th anniversary of join_date to the
  day before the Nth. A 29 Feb join date has its anniversary on 28 Feb in non-leap years. MC and unpaid use
  the calendar year (1 Jan to 31 Dec). No periods exist before the join date.
- Annual entitlement (entitlement.ts): the policy table's days for the service year; any year beyond the
  highest entry uses that entry (seed: 7 to 14, 14 from year 8).
- Eligibility (eligibility.ts): eligible from = join date + the policy's eligibility months for the
  classification (seed: annual 3 local / 0 foreign, MC 1, unpaid 0); a missing day becomes the month's
  last day. Eligibility never reduces the entitlement, it only sets when applying may start (Sprint 2B).
- Carry-forward (carry-forward.ts): unused = entitled + carried forward + adjustments - approved days of the
  previous annual period, never below 0; carried = min(unused, cap); forfeited = unused - carried. With an
  expiry set, carry_forward_expires_on = new period start + N months - 1 day (none by default; balances do
  not yet apply an expiry).
- MC proration (mc-prorate.ts): joined in this calendar year: 14 x (months from the join month through
  December, join month counted in full) / 12, rounded to a half day by prorate_rounding. Joined earlier: 14.
  The client decided: round UP to the nearest half day (the admin sets prorate_rounding = "up" on the
  Leave policies page). While it is still null, "nearest" is used (PROVISIONAL_MC_ROUNDING).
  Unpaid is never prorated.
- Balance (balance.ts): available = entitled + carried forward + adjustments - used (approved days);
  available after pending = available - pending. A negative result is shown, never hidden.
- Used and pending are summed from leave_application_days by date: each ticked date's portion counts in
  the period that contains that date (usageFor in entitlement.service.ts). An application never
  crosses a period boundary, so its days are always in one period.
- Entitlement rows (src/server/entitlement.service.ts): ensureEntitlements creates the current annual, MC
  and unpaid rows for active/probation employees with INSERT ... ON CONFLICT DO NOTHING on (employee,
  type, period_start). Rows are never updated or deleted; carry-forward is fixed when the new row is
  created. ONE EXCEPTION, join-date changes: when an admin changes a join date, the employee's current
  rows (period contains today, any leave type) are deleted and regenerated from the new join date in the
  same db.batch as the employee update, but only if none of them has an adjustment or a leave application
  (any status). They are derived data with no history, so replacing them is safe. If any current row has
  activity, the change is refused ("This employee already has leave activity in the current period.
  Contact support to correct the join date."). Past-period rows are never touched
  (planJoinDateChange / joinDateChangeStatements in entitlement.service.ts).
- Classification changes need no recalculation: entitlement days do not depend on classification, and
  eligibility and the foreign advance-notice rule are computed live from the current classification. No historical backfill: with no previous-period row, carried forward is 0 (use an
  opening_balance adjustment). Runs on employee create, reactivate, every balance view, and daily.
- Adjustments attach to the employee's current period for the leave type and are refused if they would
  take the available balance below 0.
- Policy edits apply only to rows created afterwards; existing leave years are not recalculated.

## Leave applications (as implemented, Sprint 2B)
- Per-date selection (day-selection.ts): buildDayOptions({ start, end }) lists every date with its
  weekday, all selected; totalDays() sums portions; ranges are at most 60 days (MAX_REQUEST_RANGE_DAYS).
- Half-day slots (half-day.ts): local morning 8:30 AM–12:30 PM, afternoon 1:30 PM–5:30 PM; foreign
  morning 9:30 AM–1:30 PM, afternoon 2:30 PM–6:30 PM.
- Which period a date falls in (request-period.ts): annual = the service year containing the date
  (join-date anniversaries); MC and unpaid = the calendar year. Relative to TODAY's period it is
  current, next (the period right after), past, or beyond. A request is always checked against the
  period its ticked dates fall in, never today's period.
- Next period: allowed, checked against its BASE entitlement computed from the policy without any row
  (annual = that service year's days; MC = the yearly amount, prorated only if joining that year;
  unpaid = the allowance) minus pending and approved days already requested in it. Carry-forward and
  adjustments are ignored until it starts (conservative). No row is created early; the normal job
  creates it when the period starts and these applications then count automatically. The form says
  "These dates are in your next leave year (starts {date}). Checked against next year's entitlement;
  any carried-forward days are added when the new year starts." Two or more periods ahead is refused.
- Validation (validation.ts, validateApplication returns every failing rule; the form runs it live,
  the server re-runs it on submit):
  - approval workflow exists: "Your approval route hasn't been set up yet. Please contact HR."
  - end not before start; at most 60 days in the range; at least 0.5 day ticked
  - half day: a single date and a slot
  - not before the join date; first ticked date on or after eligible-from
  - backdating: annual and unpaid cannot start before today; MC may start up to 14 days in the past
    (MC_BACKDATE_DAYS, PROVISIONAL); an admin applying on behalf may backdate any type
  - foreign annual leave: first ticked date at least advance_notice_days_foreign (14) after today,
    unless an admin override applies (works across the leave-year boundary)
  - all ticked dates in ONE period (annual: one leave year; MC/unpaid: one calendar year), else split
  - balance: annual and MC need available-after-pending >= requested; unpaid needs its allowance
    (7 + adjustments) minus used and pending >= requested. Past periods need their stored row.
  - no ticked date already on the employee's own pending or approved requests (any type, per date)
    (cancelled and rejected ignored). Strict: two half days on the same date are refused too ("You
    already have a half day on {date}. To take the whole day, cancel that request and apply for a full
    day.").
- Submit (src/server/leave-application.service.ts): the application and its leave_application_days
  rows are inserted in one db.batch. start_date/end_date = first/last ticked date; total_days = sum of
  portions; status pending, current_level 1; approval_mode and the level 1/2 approvers are snapshotted
  from approval_workflows.
- Apply on behalf (admin, /admin/employees/[id]/apply, POST /api/employees/[id]/applications): same
  form and rules, backdating allowed, submitted_by = the admin. Overriding the foreign notice rule needs
  override_notice and a reason (notice_overridden, override_by, override_reason).
- Cancellation (cancellation.ts, POST /api/leave/applications/[id]/cancel): the employee cancels their
  own pending request any time, and their own approved request only before its first ticked date; an
  admin cancels any pending or approved request with a required note (cancellation_note). Rejected and
  cancelled are final. Sets status cancelled, cancelled_at, cancelled_by; balances restore
  automatically. The update is conditional on the status (and start date) it was checked against.
- APIs: GET/POST /api/leave/applications (own; the employee always comes from the session),
  POST /api/leave/applications/[id]/cancel, POST /api/employees/[id]/applications (manage_employees).

## Proposed leave rules (pending client confirmation)
### Leave cancellation (implemented as proposed in Sprint 2B; still to be confirmed)
- An employee can cancel their own pending request at any time
- An employee can cancel their own approved leave only before its start date
- Admin can cancel any request, with a required note
- Balances restore automatically because they are calculated from approved applications

## Employee profile fields
Full name, employee ID, join date, date of birth, gender (male/female), phone, email, photo (R2),
designation, department, branch, classification (local/foreign), reporting manager, role,
status (active / inactive / probation).

## Phase 2 backlog (do NOT build in Phase 1)
### Automatic public holidays
- Different rules for local and foreign staff:
  - Local staff: all Brunei public holidays are off days.
  - Foreign staff: public holidays are working days, except selected ones: Chinese New Year, Christmas
    Day, the 1st day of Ramadan, the 1st day of Hari Raya, and 1 January.
- Some dates depend on moon sighting and are only confirmed the day before, so the list must be
  editable at short notice.
- Until then (Phase 1), staff untick public holidays themselves (see "Day counting").

## Out of scope (do not build)
Payroll, attendance or biometrics, native app store apps, integration with existing HR tools,
hospitalisation leave, leave encashment, shift scheduling, performance management.

## Open items (ask before assuming)
### Client questions
- Confirm the business is in Brunei (Asia/Brunei time zone, Brunei public holidays for Phase 2).
- MC backdating window: PROVISIONAL 14 days (MC_BACKDATE_DAYS). Confirm the number, or whether MC
  should only be submitted after the sick day.
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
  conditional single-statement write, or the neon-serverless WebSocket driver for that path. The same
  applies to the adjustment negative-balance check (read, then insert) and to leave submission: it
  checks the balance and overlaps, then inserts, so two simultaneous submissions could both pass.
- Sprint 3: approvers are snapshotted at submission; decide what happens when a snapshotted approver is
  deactivated or leaves (reassign pending requests).
- The join-date activity check (withActivity) looks at application start/end dates; leave applications
  have no foreign key to entitlement rows, so a request submitted during a join-date change is not
  blocked by the database.
- Sprint 3: decide how late approvals or cancellations of previous-period leave affect the carry-forward
  already stored on the new annual row (it is fixed when that row is created).
- Go-live order: import employees with their correct join dates, then run npm run db:entitlements, then
  load opening balances as opening_balance adjustments. (Once a current row has an adjustment, its join
  date can no longer be changed in the app.)
- Carry-forward expiry is stored (carry_forward_expires_on) but not yet applied to balances.

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
- The Worker entry is custom-worker.ts (wrangler "main"). It re-exports OpenNext's fetch handler from
  .open-next/worker.js and adds scheduled() for the cron trigger "5 16 * * *" (00:05 Brunei). The
  scheduled run calls /api/cron/entitlements in-process with CRON_SECRET, so every Worker environment
  needs the CRON_SECRET secret or the daily job fails (visible under the Worker's cron events).
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
- Still placeholders after Sprint 1: leave, approvals, reports and team calendar pages;
  /api/cron/reminders (returns 501).

### Sprint 2A (complete)
- Leave engine: src/lib/leave-engine/ (iso-date, leave-year, entitlement, eligibility, carry-forward,
  mc-prorate, balance, entitlement-plan, policy-summary, constants).
- Services: src/server/entitlement.service.ts (ensureEntitlements, ensureAllEntitlements),
  src/server/leave-balance.service.ts (balances, adjustments), src/server/leave-policy.service.ts.
- Daily job: src/app/api/cron/entitlements (Bearer CRON_SECRET, constant-time check in
  src/lib/auth/cron-secret.ts), custom-worker.ts + the wrangler.jsonc trigger, and npm run db:entitlements
  (src/db/run-entitlements.ts) for a one-off run against .env.local.
- APIs: GET /api/employees/[id]/balances (view_all_records), POST /api/employees/[id]/adjustments
  (manage_employees), GET/PATCH /api/leave-policies (read view_all_records, write manage_policies),
  GET /api/leave/balances (own balances). Zod in src/validations/leave.ts.
- UI (src/components/leave/): dashboard balances (ArchCard) and leave-year card, compact balances on
  My profile, Leave balances + Adjust balance on the employee page, /admin/leave-policies.

### Sprint 2B (complete, manual testing passed)
- Schema: migration 0001 (drizzle/0001_steep_wasp.sql) adds leave_application_days (per-date rows,
  portion 1.0 or 0.5, unique per application and date, index on date) and
  leave_applications.cancellation_note and submitted_by.
- Engine (src/lib/leave-engine/): day-selection, half-day, request-period, validation, cancellation.
- Service: src/server/leave-application.service.ts (form context, submit, list, upcoming, cancel).
  Balances count used and pending per date from leave_application_days.
- APIs: GET/POST /api/leave/applications, POST /api/leave/applications/[id]/cancel,
  POST /api/employees/[id]/applications (admin on behalf).
- Pages: /leave/apply (per-date ticks, half-day slots, live summary, inline errors), /leave/history
  (filters: type, status, year; expandable dates; cancel), /admin/employees/[id]/apply; "Leave
  requests" with admin cancel on the employee page; upcoming leave on the dashboard and My profile;
  pending counts on the balance cards. Components in src/components/leave/.
- Time zone moved to Asia/Brunei (one constant, BUSINESS_TIME_ZONE).
- Polish: dates always use three-letter months ("Sep", not "Sept"); a refused submit shows each
  message once (inline in its section, the top banner only for errors with no section); a negative
  "After this" balance shows in the error colour.
- Manual testing passed: full and half days, per-date ticks, eligibility, balance, overlap (including
  the same-date half-day message), 14-day foreign notice and the admin override, next-period rules,
  cancel rules, apply on behalf, admin cancel, history filters.

### Sprint 2B decisions
- Next-period requests are checked against the BASE entitlement only (no row is created early;
  carry-forward and adjustments are ignored until the period starts). Two or more periods ahead is
  refused. See "Leave applications".
- Overlap is strict per date: a second half day on a date that already has one is refused ("You
  already have a half day on {date}. To take the whole day, cancel that request and apply for a full
  day.").
- Helpers renamed for Brunei: todayIsoInBrunei() and bruneiHour().
- Admin cancellation notes are stored (cancellation_note); on-behalf submissions record the admin
  (submitted_by).

### Open items carried to Sprint 3
- Concurrency: submission, approval and the adjustment check all read then write (neon-http has no
  interactive transactions); see "Internal to-dos".
- CRON_SECRET must be set as a Worker secret on staging (and later production), or the daily
  entitlement job fails.
- Approvals (approver screens, two-level flow, deducting on final approval) and approval emails.

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
- Sprint 2A (done): entitlement engine, balances, opening balances, leave policies page, daily
  entitlement job, dashboard balances.
- Sprint 2B (done): per-date day selection, leave application, validation, cancellation, history.
- Sprint 3 (next): approvals (approver inbox, single and two-level flow, a Level 1 rejection ends the
  request, balance deducted on final approval), notifications via Resend (including reminders,
  /api/cron/reminders), the notice card, the concurrency fix, and the DNS move to Cloudflare.
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