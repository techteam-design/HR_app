// Leave balance for one employee, leave type and period. Pure: no database.
//
// available              = entitled + carried forward + adjustments − used
// availableAfterPending  = available − pending
// "used" is the sum of approved application days in the period; "pending" is
// the sum of pending application days. A negative result is returned as is
// (never hidden or clamped) so the UI can flag it.
// All inputs are multiples of 0.5, which JavaScript numbers add exactly.

export type BalanceInput = {
  entitled: number;
  carriedForward: number;
  adjustments: number;
  approvedDays: number;
  pendingDays: number;
};

export type Balance = {
  entitled: number;
  carriedForward: number;
  adjustments: number;
  // entitled + carried forward + adjustments: the "of X days" figure.
  total: number;
  used: number;
  pending: number;
  available: number;
  availableAfterPending: number;
};

export function computeBalance(input: BalanceInput): Balance {
  const total = input.entitled + input.carriedForward + input.adjustments;
  const available = total - input.approvedDays;
  return {
    entitled: input.entitled,
    carriedForward: input.carriedForward,
    adjustments: input.adjustments,
    total,
    used: input.approvedDays,
    pending: input.pendingDays,
    available,
    availableAfterPending: available - input.pendingDays,
  };
}

// Share of the total still available, 0–1, for progress bars.
export function availableShare(balance: Pick<Balance, "available" | "total">): number {
  if (balance.total <= 0) return 0;
  return Math.min(Math.max(balance.available / balance.total, 0), 1);
}

// 7 → "7", 3.5 → "3.5", -1 → "-1".
export function formatDays(days: number): string {
  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}
