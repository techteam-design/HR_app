# HR & Leave Management App — Shushute Beauty Hub

Client: Shushute Beauty Hub, Singapore. About 50 employees, local and foreign staff.
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

## Employee profile fields
Full name, employee ID, join date, date of birth, gender (male/female), phone, email, photo (R2),
designation, department, branch, classification (local/foreign), reporting manager, role,
status (active / inactive / probation).

## Out of scope (do not build)
Payroll, attendance or biometrics, native app store apps, integration with existing HR tools,
hospitalisation leave, leave encashment, shift scheduling, performance management.

## Still open / later (ask before assuming)
- MC pro-rating rounding rule (up, down or nearest)
- Carry-forward expiry: none assumed unless the client says otherwise
- Per-employee approval level assignment rule
- Domain, brand assets, UAT sign-off person
- Deactivating an employee must also delete all of that user's sessions (build this with the deactivate action)
- Database-backed rate limiting before go-live (Sprint 4)
- hr_viewer needs read-only employee list and profile views (Sprint 1 employee pages)
- Client to confirm who approves the owner's / top admin's leave

## Conventions
- File names: lowercase-with-hyphens; services end in .service.ts
- Import alias: @/ points to src/
- Better Auth must be initialised lazily through getAuth(), never at module load (same pattern as getDb())
- Never commit .env.local or .dev.vars
- Ask before adding any package not listed in the tech stack