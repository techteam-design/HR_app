"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, FieldHint, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDays } from "@/lib/leave-engine/balance";
import type { LeaveTypeCode } from "@/lib/leave-engine/constants";
import { buildDayOptions, MAX_REQUEST_RANGE_DAYS, rangeLength, totalDays, type SelectedDay } from "@/lib/leave-engine/day-selection";
import { halfDaySlotsFor, type HalfDaySlot } from "@/lib/leave-engine/half-day";
import { addDays } from "@/lib/leave-engine/iso-date";
import { periodRelation, periodsOf, type PeriodBalance } from "@/lib/leave-engine/request-period";
import { APPROVAL_ROUTE_MISSING, issuesByField, validateApplication, type IssueField } from "@/lib/leave-engine/validation";
import { cn } from "@/lib/utils/cn";
import { formatDateRange, formatDisplayDate, formatWeekdayDate } from "@/lib/utils/dates";
import type { ApplyContext, Approver } from "@/server/leave-application.service";

import { approverRoute, daysLabel, LEAVE_LABELS } from "./labels";

// The leave application form, for the employee (/leave/apply) and for an
// admin applying on someone's behalf. Rules come from the leave engine, so
// messages show as the employee fills the form; the server re-validates
// everything on submit.

type Target = { kind: "self" } | { kind: "on-behalf"; employeeId: string; canOverride: boolean };

type Success = { totalDays: number; approvers: Approver[]; leaveType: LeaveTypeCode; start: string; end: string };

type ServerErrors = Partial<Record<IssueField | "dates" | "dayType" | "reason" | "overrideReason", string>>;

// Server field errors shown inline next to their section (or, for "form",
// in the top banner). Anything else goes to the top banner.
const INLINE_FIELDS = new Set(["form", "leaveType", "startDate", "endDate", "halfDaySlot", "days", "dates", "reason", "overrideReason"]);

const DAY_TYPES = [
  { value: "full", label: "Full days" },
  { value: "half", label: "Half day" },
] as const;

export function LeaveApplicationForm({ context, target }: { context: ApplyContext; target: Target }) {
  const onBehalf = target.kind === "on-behalf";
  const { employee, today } = context;

  const [leaveType, setLeaveType] = useState<LeaveTypeCode | "">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dayType, setDayType] = useState<"full" | "half">("full");
  const [slot, setSlot] = useState<HalfDaySlot | "">("");
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [noticeOverride, setNoticeOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<Success | null>(null);

  const type = context.types.find((t) => t.code === leaveType);
  const singleDate = !!startDate && startDate === endDate;
  const halfDay = dayType === "half" && singleDate;
  const datesChosen = !!startDate && !!endDate;
  const options = useMemo(
    () => (datesChosen ? buildDayOptions({ start: startDate, end: endDate }) : []),
    [datesChosen, startDate, endDate],
  );
  const selectedDays: SelectedDay[] = halfDay
    ? [{ date: startDate, portion: 0.5 }]
    : options.filter((option) => !unticked.has(option.date)).map((option) => ({ date: option.date, portion: 1 }));
  const requested = totalDays(selectedDays);

  const noticeDays =
    type?.code === "annual" && employee.classification === "foreign" ? type.policy.advanceNoticeDaysForeign : 0;
  const noticeOverridden = onBehalf && noticeOverride && noticeDays > 0;

  // The period the ticked dates fall in, and its balance.
  const periods = type ? periodsOf(type.code, employee.joinDate, selectedDays.map((d) => d.date)) : [];
  const relation =
    type && periods.length === 1 ? periodRelation(type.code, employee.joinDate, today, periods[0]) : null;
  const periodBalance: PeriodBalance | null =
    relation === "current" ? (type?.current ?? null) : relation === "next" ? (type?.next ?? null) : null;

  const issues =
    type && datesChosen
      ? validateApplication(
          {
            leaveType: type.code,
            startDate,
            endDate,
            halfDay,
            halfDaySlot: halfDay && slot ? slot : null,
            days: selectedDays,
          },
          {
            today,
            employee,
            policy: type.policy,
            balances: [type.current, type.next].filter((b): b is PeriodBalance => b !== null),
            // Past periods (backdated MC) are checked by the server.
            partialBalances: true,
            bookedDays: context.bookedDays,
            hasApprovalRoute: context.approvalRoute !== null,
            onBehalf,
            noticeOverridden,
          },
        )
      : [];
  const live = issuesByField(issues);
  // Form-level problems (approval route, not started yet) have no section of
  // their own, so they use the top banner.
  const formIssue = live.form ?? serverErrors.form ?? (context.approvalRoute ? undefined : APPROVAL_ROUTE_MISSING);

  // Required fields are only flagged after the first submit attempt.
  const required: ServerErrors = attempted
    ? {
        leaveType: leaveType ? undefined : "Choose a leave type.",
        startDate: startDate ? undefined : "Choose a start date.",
        endDate: endDate ? undefined : "Choose an end date.",
        overrideReason:
          noticeOverridden && overrideReason.trim().length < 3
            ? "Give a reason for the override (at least 3 characters)."
            : undefined,
      }
    : {};
  const errorFor = (field: keyof ServerErrors) => required[field] ?? live[field as IssueField] ?? serverErrors[field];

  function changeDates(nextStart: string, nextEnd: string) {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setUnticked(new Set());
    setServerErrors({});
    if (!nextStart || nextStart !== nextEnd) setDayType("full");
  }

  function toggle(date: string) {
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
    setServerErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    setFormError(null);
    const incomplete = !type || !startDate || !endDate || (halfDay && !slot);
    // Problems are already shown inline next to their section.
    if (incomplete || issues.length > 0 || (noticeOverridden && overrideReason.trim().length < 3)) return;

    const body = {
      leaveType: type.code,
      startDate,
      endDate,
      dayType: halfDay ? "half" : "full",
      halfDaySlot: halfDay ? slot : null,
      dates: selectedDays.map((d) => d.date),
      reason,
      ...(onBehalf ? { noticeOverride: noticeOverridden, overrideReason } : {}),
    };
    const url = onBehalf ? `/api/employees/${target.employeeId}/applications` : "/api/leave/applications";

    setPending(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        fieldErrors?: ServerErrors;
        totalDays?: number;
        approvers?: Approver[];
      } | null;
      if (!response.ok) {
        const fieldErrors = result?.fieldErrors ?? {};
        setServerErrors(fieldErrors);
        // Errors that belong to a section show there only; the top banner is
        // for errors with no section (unexpected server errors).
        const unplaced = Object.entries(fieldErrors).filter(([field]) => !INLINE_FIELDS.has(field));
        if (Object.keys(fieldErrors).length === 0) {
          setFormError(result?.error ?? "Could not submit. Please try again.");
        } else if (unplaced.length > 0) {
          setFormError(unplaced.map(([, message]) => message).join(" "));
        }
        return;
      }
      setSuccess({
        totalDays: result?.totalDays ?? requested,
        approvers: result?.approvers ?? [],
        leaveType: type.code,
        start: selectedDays[0].date,
        end: selectedDays[selectedDays.length - 1].date,
      });
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-section-title font-medium text-plum-900">
            Request <em>submitted</em>
          </h2>
          <StatusBadge status="pending" />
        </div>
        <p className="text-[15px] text-plum-900">
          {LEAVE_LABELS[success.leaveType]}, {formatDateRange(success.start, success.end)} ·{" "}
          {daysLabel(formatDays(success.totalDays), success.totalDays)}
          {onBehalf && ` for ${employee.fullName}`}
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="eyebrow text-plum-700">Status</dt>
            <dd className="mt-1 text-[15px] text-plum-900">Pending approval</dd>
          </div>
          <div>
            <dt className="eyebrow text-plum-700">{success.approvers.length > 1 ? "Approvers" : "Approver"}</dt>
            <dd className="mt-1 text-[15px] text-plum-900">{approverRoute(success.approvers)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3 sm:flex-row">
          {onBehalf ? (
            <ButtonLink href={`/admin/employees/${target.employeeId}`}>Back to {employee.fullName}</ButtonLink>
          ) : (
            <ButtonLink href="/leave/history">View my leave history</ButtonLink>
          )}
          <Button
            variant="secondary"
            onClick={() => {
              setSuccess(null);
              setAttempted(false);
              setLeaveType("");
              changeDates("", "");
              setReason("");
              setNoticeOverride(false);
              setOverrideReason("");
            }}
          >
            Apply for more leave
          </Button>
        </div>
      </Card>
    );
  }

  const rangeTooLong = datesChosen && rangeLength(startDate, endDate) > MAX_REQUEST_RANGE_DAYS;
  const describedBy = (field: keyof ServerErrors, hint = false) =>
    errorFor(field) ? `apply-${field}-error` : hint ? `apply-${field}-hint` : undefined;
  const nextYearNote =
    relation === "next" && periods[0]
      ? type?.code === "annual"
        ? `These dates are in your next leave year (starts ${formatDisplayDate(periods[0].start)}). Checked against next year's entitlement; any carried-forward days are added when the new year starts.`
        : `These dates are in next year (starts ${formatDisplayDate(periods[0].start)}). Checked against next year's allowance.`
      : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {onBehalf && (
        <Alert tone="notice">
          Applying on behalf of {employee.fullName}. Backdating is allowed; the request goes to their approvers as
          usual.
        </Alert>
      )}
      {formIssue && <Alert>{formIssue}</Alert>}
      {formError && <Alert>{formError}</Alert>}

      <Card className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="apply-leaveType">Leave type</Label>
          <Select
            id="apply-leaveType"
            value={leaveType}
            onChange={(event) => {
              setLeaveType(event.target.value as LeaveTypeCode);
              setServerErrors({});
            }}
            invalid={!!errorFor("leaveType")}
            aria-describedby={describedBy("leaveType", !!type)}
          >
            <option value="" disabled>
              Choose a leave type
            </option>
            {context.types.map((t) => (
              <option key={t.code} value={t.code}>
                {LEAVE_LABELS[t.code]}
              </option>
            ))}
          </Select>
          {type && !errorFor("leaveType") && (
            <FieldHint id="apply-leaveType-hint">
              {type.current
                ? `${formatDays(type.current.availableAfterPending)} ${type.code === "unpaid" ? "days of allowance left" : "days available"} this ${type.code === "annual" ? "leave year" : "year"}`
                : "No leave period yet"}
              {type.current && type.current.pending > 0 && ` (after ${formatDays(type.current.pending)} pending)`}
              {type.eligibleFrom > today && ` · available from ${formatDisplayDate(type.eligibleFrom)}`}
            </FieldHint>
          )}
          <FieldError id="apply-leaveType-error">{errorFor("leaveType")}</FieldError>
        </div>

        {noticeDays > 0 && (
          <Alert tone="notice">
            Foreign staff must apply for annual leave at least {noticeDays} days ahead: the earliest start date is{" "}
            {formatDisplayDate(addDays(today, noticeDays))}.
          </Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="apply-startDate">Start date</Label>
            <Input
              id="apply-startDate"
              type="date"
              value={startDate}
              onChange={(event) => {
                const value = event.target.value;
                changeDates(value, !endDate || endDate < value ? value : endDate);
              }}
              invalid={!!errorFor("startDate")}
              aria-describedby={describedBy("startDate")}
            />
            <FieldError id="apply-startDate-error">{errorFor("startDate")}</FieldError>
          </div>
          <div className="space-y-2">
            <Label htmlFor="apply-endDate">End date</Label>
            <Input
              id="apply-endDate"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => changeDates(startDate, event.target.value)}
              invalid={!!errorFor("endDate")}
              aria-describedby={describedBy("endDate")}
            />
            <FieldError id="apply-endDate-error">{errorFor("endDate")}</FieldError>
          </div>
        </div>

        {singleDate && (
          <fieldset className="space-y-3">
            <legend className="text-[13px] font-semibold text-plum-900">Full or half day</legend>
            <div className="grid grid-cols-2 gap-3">
              {DAY_TYPES.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-3 rounded-input border border-input-border bg-surface px-4",
                    "has-[:checked]:border-plum-700 has-[:checked]:bg-lilac-50",
                  )}
                >
                  <input
                    type="radio"
                    name="dayType"
                    value={option.value}
                    checked={dayType === option.value}
                    onChange={() => setDayType(option.value)}
                    className="size-5 accent-plum-900"
                  />
                  <span className="text-sm font-semibold text-plum-900">{option.label}</span>
                </label>
              ))}
            </div>
            {halfDay && (
              <div className="space-y-2">
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Half-day slot">
                  {halfDaySlotsFor(employee.classification).map((option) => (
                    <label
                      key={option.slot}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-3 rounded-input border bg-surface px-4 py-3",
                        errorFor("halfDaySlot") ? "border-status-rejected-text" : "border-input-border",
                        "has-[:checked]:border-plum-700 has-[:checked]:bg-lilac-50",
                      )}
                    >
                      <input
                        type="radio"
                        name="halfDaySlot"
                        value={option.slot}
                        checked={slot === option.slot}
                        onChange={() => setSlot(option.slot)}
                        className="size-5 accent-plum-900"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-plum-900">{option.label}</span>
                        <span className="block text-[13px] text-muted">{option.time}</span>
                      </span>
                    </label>
                  ))}
                </div>
                <FieldError id="apply-halfDaySlot-error">{attempted || slot ? errorFor("halfDaySlot") : undefined}</FieldError>
              </div>
            )}
          </fieldset>
        )}
      </Card>

      {datesChosen && !halfDay && !rangeTooLong && options.length > 0 && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-plum-900">Your dates</h2>
            {unticked.size > 0 && (
              <button
                type="button"
                onClick={() => setUnticked(new Set())}
                className="min-h-11 text-sm font-semibold text-plum-700 hover:underline focus-visible:outline-2 focus-visible:outline-plum-700"
              >
                Tick all
              </button>
            )}
          </div>
          <FieldHint id="apply-days-hint">
            Untick any day that is already an off day for you, including public holidays you don&apos;t work.
          </FieldHint>
          <ul className="grid gap-2 sm:grid-cols-2" aria-describedby="apply-days-hint">
            {options.map((option) => (
              <li key={option.date}>
                <Checkbox
                  label={formatWeekdayDate(option.date)}
                  checked={!unticked.has(option.date)}
                  onChange={() => toggle(option.date)}
                  className="py-3"
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {datesChosen && (errorFor("days") || errorFor("dates")) && (
        <Alert>{errorFor("days") ?? errorFor("dates")}</Alert>
      )}

      {type && datesChosen && !rangeTooLong && (
        <Card className="space-y-3">
          <h2 className="font-semibold text-plum-900">Summary</h2>
          {nextYearNote && <Alert tone="notice">{nextYearNote}</Alert>}
          <dl className="grid grid-cols-3 gap-4">
            <div>
              <dt className="eyebrow text-plum-700">Selected</dt>
              <dd className="mt-1 font-display text-3xl text-plum-900">{formatDays(requested)}</dd>
              <dd className="text-[13px] text-muted">{requested === 1 ? "day" : "days"}</dd>
            </div>
            <div>
              <dt className="eyebrow text-plum-700">Balance now</dt>
              <dd className="mt-1 font-display text-3xl text-plum-900">
                {periodBalance ? formatDays(periodBalance.availableAfterPending) : "—"}
              </dd>
              <dd className="text-[13px] text-muted">
                {periodBalance && periodBalance.pending > 0 ? `after ${formatDays(periodBalance.pending)} pending` : "available"}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-plum-700">After this</dt>
              <dd
                className={cn(
                  "mt-1 font-display text-3xl",
                  periodBalance && periodBalance.availableAfterPending - requested < 0
                    ? "text-status-rejected-text"
                    : "text-plum-900",
                )}
              >
                {periodBalance ? formatDays(periodBalance.availableAfterPending - requested) : "—"}
              </dd>
              <dd className="text-[13px] text-muted">{type.code === "unpaid" ? "allowance left" : "available"}</dd>
            </div>
          </dl>
        </Card>
      )}

      <Card className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="apply-reason">Reason (optional)</Label>
          <Input
            id="apply-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            autoComplete="off"
            invalid={!!serverErrors.reason}
            aria-describedby={describedBy("reason")}
          />
          <FieldError id="apply-reason-error">{serverErrors.reason}</FieldError>
        </div>

        {onBehalf && target.canOverride && noticeDays > 0 && (
          <div className="space-y-3">
            <Checkbox
              label={`Override the ${noticeDays}-day notice rule`}
              description="Admin only. The override and its reason are recorded on the request."
              checked={noticeOverride}
              onChange={(event) => setNoticeOverride(event.target.checked)}
            />
            {noticeOverride && (
              <div className="space-y-2">
                <Label htmlFor="apply-overrideReason">Override reason</Label>
                <Input
                  id="apply-overrideReason"
                  value={overrideReason}
                  maxLength={500}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  autoComplete="off"
                  invalid={!!errorFor("overrideReason")}
                  aria-describedby={describedBy("overrideReason")}
                />
                <FieldError id="apply-overrideReason-error">{errorFor("overrideReason")}</FieldError>
              </div>
            )}
          </div>
        )}

        {context.approvalRoute && (
          <p className="text-[13px] text-muted">
            Goes to {approverRoute(context.approvalRoute.approvers)} for approval.
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link
            href={onBehalf ? `/admin/employees/${target.employeeId}` : "/dashboard"}
            className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-plum-700 hover:underline"
          >
            Cancel
          </Link>
          <Button type="submit" loading={pending} loadingText="Submitting…" disabled={!context.approvalRoute}>
            Submit request
          </Button>
        </div>
      </Card>
    </form>
  );
}
