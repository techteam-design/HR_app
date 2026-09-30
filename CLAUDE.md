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
- employee: own profile, own balances and history, submit own leave, and the team calendar (everyone's
  APPROVED leave only, shown as "On leave" with no leave type; see "Team calendar")
- manager (team heads use the manager role too): employee rights + approve/reject the requests
  assigned to them + team calendar
- admin: the owner; exactly one in production. Full access, including employees, org structure,
  policies, approval config, overrides, all reports and exports, and deciding ANY pending request at its
  current level (decide_any_leave). The admin takes NO leave: no apply_leave, no Apply/History pages,
  no own balances or upcoming leave, no approval route. The admin still applies on staff's behalf.
  Admin entitlement rows are kept (harmless) but hidden in the UI; Sprint 4 reports must exclude admins.
- hr_viewer: read-only for other people's data (including the team calendar and the approval setup);
  can view own profile and apply for own leave. Every write endpoint on other employees' data returns 403.
- Navigation: the "People" group (Employees, Org chart) needs view_all_records (admin + hr_viewer).
  The "Admin" group (Departments & branches, Leave policies) is admin only, except Approval setup,
  which hr_viewer sees read-only (page guard view_all_records, edits manage_approval_config).
  "Approvals" (approve_leave: managers and admin) shows a pending-count badge, hidden at 0 (admin:
  company-wide pending; others: requests waiting for them).
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

### Approvals (as implemented, Sprint 3A)
- Route resolution order, everywhere (submission, approval setup, warnings; pure resolveApprovalRoute()
  in src/lib/approvals/route-resolution.ts): per-employee override > managers' rule > branch default >
  no route. The first source that applies is validated; an invalid one never falls through.
  - Admin: no route needed.
  - Manager: single level, approved by the "Managers' leave approver" setting (approval_settings, must
    be an active admin); when unset and there is exactly one active admin, that admin; otherwise "No
    route". The branch default never applies to managers.
  - Employee and hr_viewer: their branch's default route (branch_approval_routes), single level or two
    levels (team head, then manager).
  - Override (approval_route_overrides): any person; "reset to default" deletes it.
- Approvers must be active (or probation) managers or admins; nobody approves themself; level 1 and
  level 2 differ (Zod + src/lib/approvals/route-config.ts + DB CHECKs). A branch default that makes
  someone their own approver shows "Own approver" for that person until an override is set.
- Submission re-resolves the route; a missing or invalid route shows "Your approval route hasn't been
  set up yet. Please contact HR."
- The current level's snapshotted approver decides; an admin may decide any pending request at its
  current level (recorded as the admin; progress says "Approved by X (admin, level 1)").
- Level 1 approval on a two-level route moves the request to level 2. Any rejection ends it (a level 1
  rejection never reaches level 2). Remarks optional to approve, required to reject.
- Balance counts only on final approval. At final approval, balance (approved days only; other pending
  requests do not count) and overlap are re-checked for the period the dates fall in; if they no longer
  fit, approval is blocked with a clear message (src/lib/leave-engine/final-approval.ts).
- Route changes (branch default, override, reset, managers' approver, an applicant's branch or role
  change) move pending requests for levels not yet decided: at level 1 the request takes the new route
  as a whole; at level 2 level 1 stands and level 2 goes to the new route's final approver (even if
  that person approved level 1). Invalid new routes move nothing. Every move is recorded in
  approval_reassignments (append-only, with cause and changed_by), in the same db.batch as the change.
- Approver protection: a manager cannot become employee/hr_viewer, and an admin cannot change role or be
  deactivated, while they approve anyone (branch default, override, managers' approver incl. the
  only-admin fallback, or pending requests waiting for them). The message lists whom they approve.

### Balance and adjustments
- Balance per employee, leave type and entitlement period:
  entitled_days + carried_forward_days + sum(adjustments) - sum(approved application days)
- Adjustments (leave_adjustments) are admin-only and append-only: never edit or delete an adjustment.
  To fix a wrong adjustment, add a new one that offsets it.
- Adjustment reasons: opening_balance, correction (manual, admin only; refused if they would take the
  available balance below 0). Every adjustment needs a note.
- System reason carry_forward_recalculation: when annual leave of a previous leave year is finally
  approved or cancelled after the next year's row exists (its carry-forward was fixed at creation), a
  correcting adjustment (new carried - stored carried - earlier corrections) is added to the next-year
  row in the same transaction, created_by = the actor. Exempt from the no-negative rule. The displayed
  forfeited days are recomputed when a row has corrections (the stored value is never changed).

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
- Submit (src/server/leave-application.service.ts): runs in the employee's locked transaction (see
  "Concurrency"); balance and overlaps are re-checked inside it, then the application and its
  leave_application_days rows are inserted. start_date/end_date = first/last ticked date; total_days =
  sum of portions; status pending, current_level 1; approval_mode and the level 1/2 approvers are
  snapshotted from the resolved route. Admins cannot be the applicant (409).
- Apply on behalf (admin, /admin/employees/[id]/apply, POST /api/employees/[id]/applications): same
  form and rules, backdating allowed, submitted_by = the admin. Overriding the foreign notice rule needs
  override_notice and a reason (notice_overridden, override_by, override_reason).
- Cancellation (cancellation.ts, POST /api/leave/applications/[id]/cancel, any signed-in user; the
  service decides; CHANGED in Sprint 3A): the employee cancels their own request only while PENDING
  (including after level 1 approval); staff can NOT cancel approved leave. An approver on the request's
  route (level 1 or 2) cancels APPROVED leave at any time (pending: reject instead); an admin cancels any
  pending or approved request. Both need a note (cancellation_note). Rejected and cancelled are final.
  Runs in the locked transaction; the update is conditional on the status it was checked against;
  balances restore automatically (plus the carry-forward correction above when needed). Cancel is
  offered on the approver queue ("Decided by me"), the team calendar detail and the employee page.
- APIs: GET/POST /api/leave/applications (own; the employee always comes from the session),
  POST /api/leave/applications/[id]/cancel, POST /api/employees/[id]/applications (manage_employees).

## Concurrency (as implemented, Sprint 3A)
- Balance-affecting writes (submit, apply on behalf, final approval, cancel, adjustments) run in
  withEmployeeLock (src/db/transaction.ts): the Neon WebSocket driver (Pool with max 1, created and
  closed within the request, as Workers require), one transaction, SET LOCAL lock_timeout '5s', then
  pg_advisory_xact_lock(5301, hashtext(employee_id)), then the re-check and the writes. runLocked
  (leave-period.service.ts) maps a lock timeout to 409 "please try again". Everything else stays on
  neon-http (getDb()).
- Non-final decisions (level 1 approval, rejections) are one conditional statement on neon-http:
  UPDATE ... WHERE status = 'pending' AND current_level = expected, feeding the approval_actions INSERT.
  The unique (application_id, level) index blocks double decisions.
- npm run db:race-check (dev only) fires two over-balance submissions and a double approval at once
  against the dev database and expects exactly one of each to succeed.

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
- Carry-forward expiry (none assumed)
- Foreign staff annual leave eligibility: 0 months, per the proposal (only local staff have the 3-month
  rule); confirm with client
- Brand assets (PWA icons, theme colours) and the UAT sign-off person

### Internal to-dos
- src/proxy.ts runs as Node.js middleware, which OpenNext supports only experimentally. Fallbacks:
  middleware.ts on the edge runtime, or removing the proxy (the server checks are the real protection).
- Remove the temporary sign-in timing log (src/app/api/auth/[...all]/route.ts) before production.
- Add case-insensitive unique indexes on departments.name and branches.name (lower(name)); needs a
  migration. The service check already enforces this.
- Last-admin race: the admin guard reads the list of active admins and then writes separately. Two
  simultaneous demotions could leave no active admin. Unlikely at this size; fix with a transaction or lock.
- Worker placement: REPLACED the earlier "enable Smart Placement" to-do with an explicit region hint,
  done on staging (see "Performance (end of Sprint 3A)"). Production's wrangler config must carry the
  same line: "placement": { "region": "aws:ap-southeast-1" }.
- Remove the temporary PERF_TIMING timing log before production (see "Deployment").
- Deploy production from GitHub Actions on Linux rather than from a Windows machine.
- Dev seed dates drift: seed-dev.ts computes join dates from the day it runs, and re-runs leave existing
  rows unchanged. Run npm run db:reset:dev to refresh the scenarios (see "Dev data").
- Database-backed rate limiting before go-live (Sprint 4).
- R2 CORS rule for the production bucket and origin, when production is set up.
- An employee promoted to admin keeps any pending requests with their current approvers (admins need
  no route, so nothing is reassigned); they can still be decided or cancelled.
- Removing a branch default leaves that branch's pending requests with their current approvers.
- The join-date activity check (withActivity) looks at application start/end dates; leave applications
  have no foreign key to entitlement rows, so a request submitted during a join-date change is not
  blocked by the database.
- Carry-forward corrections reach only the next leave year (not a year after that), and the annual
  balance card's "includes N carried forward" still shows the stored carried days (the correction is
  in the adjustments, so totals are right).
- Go-live order: import employees with their correct join dates, then run npm run db:entitlements, then
  load opening balances as opening_balance adjustments. (Once a current row has an adjustment, its join
  date can no longer be changed in the app.)
- Carry-forward expiry is stored (carry_forward_expires_on) but not yet applied to balances.
- Before UAT (Sprint 4): add a dev scenario for the carry-forward correction (a seeded previous-year
  annual row for one employee), so late approvals/cancellations of previous-year leave can be tested
  by hand. The reset only creates current-period rows today.

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
- The balance-affecting writes open a WebSocket to Neon per request (Pool created and closed in the
  request); no Hyperdrive or extra binding is used.
- After migrations 0002/0003 (approval_workflows dropped), older Worker builds fail on leave submission:
  redeploy staging whenever the dev database is migrated.
- Placement: wrangler.jsonc has "placement": { "region": "aws:ap-southeast-1" }, so the Worker runs next
  to the Neon database (AWS Singapore) instead of near the user. Chosen over Smart Placement, which
  needs steady traffic to engage (low on staging) and leaves 1% of requests unplaced. Check it with the
  cf-placement response header ("remote-…" = placed). Placement only affects fetch requests, not the
  cron. Use the same line for production.
- Temporary timing log (PERF_TIMING, remove before production): src/db/perf-timing.ts plus hooks marked
  "PERF_TIMING" in src/db/index.ts, src/db/transaction.ts and custom-worker.ts. Off unless PERF_TIMING=1.
  It times every Neon round trip (HTTP queries/batches and the WebSocket transaction; SQL text only,
  never parameter values) and logs one JSON line per request ("event":"perf_timing", with path, kind,
  status, db count/waitMs and the ordered queries) plus a Server-Timing header. Staging: `npx wrangler
  secret put PERF_TIMING` (value 1), watch with `npx wrangler tail hr-app-staging`, turn off with
  `npx wrangler secret delete PERF_TIMING`. Local: PERF_TIMING=1 in .env.local and restart npm run dev
  (lines in the dev terminal with the route name; no header, status or total time locally).

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
- Photos (/api/upload is the admin's presigned upload URL for any employee's photo, manage_employees):
  src/server/employee-photo.service.ts, src/lib/employees/photo-key.ts, src/app/api/me/photo/**,
  src/app/api/employees/[id]/photo, src/components/employees/photo-upload.tsx.
- Design system: src/app/globals.css, src/components/ui/, src/components/layout/, /design-preview.
- Seeds: src/db/seed.ts (leave policies), seed-admin.ts (first admin, production-safe),
  seed-dev.ts (dev data only, needs ALLOW_DEV_SEED=true; see "Dev data").
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

### Sprint 3A (complete, manual testing passed)
- Schema: migration 0002 (drizzle/0002_approval_routes.sql) adds approval_settings (one row: the
  managers' leave approver), branch_approval_routes, approval_route_overrides, approval_reassignments
  (+ enum approval_reassignment_cause), adjustment_reason carry_forward_recalculation, CHECKs on
  leave_applications (mode vs level 2 and level, not own approver) and approval_actions (reject needs
  remarks), and an index on approval_actions (approver_id, acted_at). Migration 0003 drops
  approval_workflows (replaced by the overrides).
- Pure rules: src/lib/approvals/ (route-resolution, route-config, decision, progress, reassignment),
  src/lib/leave-engine/ (final-approval, carry-forward-correction, cancellation rewritten),
  src/lib/calendar/month-grid.ts, src/lib/overview/activity.ts. rbac: admin loses apply_leave, new
  admin-only decide_any_leave, view_team_calendar for every role, NavItem badge.
- Services: approval-route.service.ts (resolver inputs, routes, reassignment, setup page),
  approval.service.ts (queue, decisions, nav count), leave-period.service.ts (period balance reads on
  a Reader, runLocked, carry-forward correction), team-calendar.service.ts, leave-overview.service.ts;
  leave-application / leave-balance / employee services updated. src/db/transaction.ts (withEmployeeLock).
- APIs: PUT /api/approval-routes/settings, PUT/DELETE /api/approval-routes/branches/[branchId],
  PUT/DELETE /api/approval-routes/employees/[id], POST /api/approval-routes/employees/bulk (all
  manage_approval_config); POST /api/approvals/[id] (approve_leave; {action, remarks, expectedLevel});
  the cancel route now only needs a session.
- Pages: /approvals (Waiting for me, All pending for admin, Decided by me), /admin/approval-config
  (managers' approver, branch defaults, employee routes with filters, inline and bulk overrides, reset),
  /team-calendar (month grid; list per day on mobile; approved solid, pending outlined; detail with
  Cancel), admin/hr_viewer dashboard overview (today by branch, next 7 days, pending, by branch, recent
  activity, quick links), route card on the employee page, approval progress on history and
  dashboard. Components in src/components/approvals, calendar, overview.
- Dev data: npm run db:reset:dev (see "Dev data"); db:seed is insert-only (never overwrites policies).
- Tests: tests/approvals, tests/calendar, tests/overview, tests/db/transaction, new engine and
  validation tests; cancellation and rbac tests updated for the new rules.
- Manual testing passed: routes and setup, single- and two-level approvals, rejection, admin deciding
  in place, managers' leave, final-approval balance check, cancellation rules, route changes and
  reassignment, overview, team calendar for all roles with the employee restrictions.
  npm run db:race-check PASSED.

### Sprint 3A decisions
- Client decisions:
  - The admin (owner) takes no leave.
  - Approval routes are set per branch (branch defaults; per-employee overrides win over everything).
    Branch defaults cover employees and HR viewers.
  - Managers' leave goes to the admin (the "Managers' leave approver" setting; fallback: the only
    active admin).
  - Staff cancel pending requests only; approvers and the admin cancel approved leave (the admin also
    cancels pending; note required).
  - Every role sees the team calendar. Employees see approved leave only, shown as "On leave" with no
    leave type; their branch filter defaults to their own branch.
- Late approvals/cancellations of previous-year annual leave correct the next year's carry-forward with
  a system adjustment (option C).
- "On leave today" counts approved leave only; the next 7 days also show pending (labelled). Staff
  counts exclude admins.
- The manager's team calendar = direct reports + everyone they approve (routes) + anyone whose request
  is snapshotted to them.

### Team calendar (Sprint 3A change request)
- Every role opens /team-calendar (view_team_calendar for all). What each role gets is decided in
  team-calendar.service.ts (calendarScopeFor): admin and hr_viewer "everyone", managers "team" (direct
  reports + everyone they approve + snapshotted requests), both with approved + pending and leave types;
  employees "company": everyone's APPROVED leave only, department and branch filters, branch defaulting
  to their own ("all" = every branch).
- Employees never receive the leave type, status, request id, reason, remarks, cancellation notes or
  balances: the SQL asks for approved only and every employee entry goes through publicEntries()
  (src/lib/calendar/entries.ts), which builds the entry field by field. No detail dialog, no Cancel.
- Display: codes AL / MC / UL in the balance card tints (annual lilac, MC blush, unpaid sage);
  approved solid, pending outlined + "Pending"; half days "½ AM/PM"; employees see a neutral
  "On leave". Month cells show photo + "Maria S." + chips, max 3 then "+N more" (opens the day).
  Month | List toggle remembered in sessionStorage; under 640px it starts on List (month cells then
  show avatars only; tap a day for its list). Legend per role.
- Cancel labels: "Cancel request" only for staff cancelling their own pending request (no note);
  approvers and the admin always see "Cancel leave" (note required), including the admin cancelling a
  pending request.

### Performance (end of Sprint 3A)
- Cause: every database call is a separate HTTPS round trip to Neon in Singapore, and the Worker ran
  near the user (India/Brunei), about 165 ms per query, with most queries awaited one after another.
- Decision: pin the Worker next to the database with an explicit placement region hint
  ("placement": { "region": "aws:ap-southeast-1" }, see "Deployment"), not Smart Placement.
- Measured on staging with PERF_TIMING, before -> after placement:
  - Neon query: ~165 ms -> 7–10 ms
  - Employee dashboard: 1.3–2.3 s -> 63–90 ms
  - /leave/apply: 2.1 s -> 66 ms
  - Sign-in: 1.4 s -> 35 ms
  - Sign-out: 2.1 s -> 72 ms
- Also fixed:
  - /approvals: the entitlement check runs once for everyone in the queue
    (ensureEntitlementsWith), and all balances come from one db.batch (periodBalances in
    leave-period.service.ts, same rules as periodBalance). The query count no longer grows with the
    queue (it was 17 queries for 2 pending requests); tests/approvals/queue-queries.test.ts.
  - Sign-in and sign-out do one full page load (window.location.replace) instead of router.replace +
    router.refresh, which rendered the dashboard twice.
- Deferred optional fixes (Sprint 4 polish; measure with PERF_TIMING first):
  - Better Auth session cookie cache (removes the session and user lookups on most requests; revoked
    sessions stay valid on other devices for up to the cache time).
  - Balance chain from 5 sequential queries to 3: return the rows from ensureEntitlements, sum the
    carry-forward recalculations in usageFor, pass the employee in, load policies in parallel or cached.
  - Add joinDate and branchId to the session employee columns (drops findEntitlementEmployee and the
    team calendar's own-branch lookup).
  - Small items: team-calendar request details in one batch; approval setup 3 calls -> 1; employee
    page queries in parallel; fewer statements inside the submit lock; a limit on the overview's
    pending list.

### Open items carried forward from Sprint 3A
- Sprint 3B scope:
  - Resend email notifications (submit, approve, reject, level 2 handoff) and the pending-approval
    reminder cron (/api/cron/reminders, still 501; needs a second cron trigger in custom-worker.ts and
    wrangler.jsonc). The resend package is not installed yet, and the email templates are empty .tsx
    files (React Email is not an approved package).
  - The notice card.
  - DNS move of hr.sbcwellness.com to Cloudflare.
- Mobile polish: to review later.
- Carry-forward dev scenario before UAT (Sprint 4); see "Internal to-dos".
- Performance polish (Sprint 4): the deferred optional fixes in "Performance (end of Sprint 3A)".
- Redeploy staging after the Sprint 3A commit (the dev database no longer has approval_workflows).

### Dev data
- WARNING: staging uses the SAME Neon dev branch as local dev. Resetting dev data also resets staging.
- `npm run db:reset:dev` (src/db/reset-dev.ts): needs ALLOW_DEV_SEED=true, refuses NODE_ENV=production,
  prints the database host and asks you to type RESET DEV. Deletes all app data and all Better Auth
  users/sessions/accounts (schema kept), then runs db:seed (MC rounds up), db:seed:admin, db:seed:dev
  and db:entitlements. Running it twice gives the same result.
- The team (seed-dev.ts, join dates relative to today in Brunei; logins use SEED_DEV_PASSWORD at
  @example.test, except the admin, who uses SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD):
  - Admin (seed-admin login): the ONLY admin; Branch A, Management. Takes no leave.
  - Grace Lim: hr_viewer, Branch A, local, ~4 years. Reports to the admin.
  - Daniel Tan: manager, Branch A, local, ~6 years. Reports to the admin.
  - Priya Nair: employee, Branch A, local, ~9 years (14 days annual).
  - Siti Rahman: employee, Branch A, local, ~2 years, +2 days opening-balance adjustment.
  - Kelvin Ong: employee, Branch B, local, joined 2 months ago (annual not yet eligible, MC eligible).
  - Maria Santos: employee, Branch B, foreign, ~3 years.
  - Nguyen Thi Lan: employee, Branch B, foreign, joined 2 weeks ago (annual allowed, MC not yet).
  - The five employees report to Daniel. Departments: Management, Beauty Therapy.
- Routes: Branch A default single level (Daniel); Branch B default two-level (Daniel, then the admin);
  managers' leave approver = the admin; no overrides. No leave applications are seeded.
- Tests never depend on seeded users (they use in-memory fixtures).

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
- Sprint 3A (done): approval routes and setup, approver queue, two-level flow, final-approval
  re-check, new cancellation rules, team calendar, admin/HR overview, the concurrency fix.
- Sprint 3B (next): notifications via Resend (including reminders, /api/cron/reminders), the notice
  card, and the DNS move to Cloudflare.
- Sprint 4: reports, exports, production go-live.

### How we work
- The user runs all terminal, database, git and Cloudflare commands themself. Claude may run tsc, eslint,
  vitest and local builds.
- Never read .env.local or .dev.vars.
- Never deploy, run migrations or run seeds unless asked.
- No schema changes without asking first.
- Every task report lists the files changed and the tsc, eslint and vitest results.
- Run tsc before `npm run cf:build`, or after deleting .open-next/: custom-worker.ts imports
  .open-next/worker.js, and with allowJs tsc follows it into the whole bundle and runs out of memory.
  tsconfig is intentionally left as is.
- Every task ends with a manual test plan.

## Conventions
- File names: lowercase-with-hyphens; services end in .service.ts
- Import alias: @/ points to src/
- Better Auth must be initialised lazily through getAuth(), never at module load (same pattern as getDb())
- Never commit .env.local or .dev.vars
- Ask before adding any package not listed in the tech stack