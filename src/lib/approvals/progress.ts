// Approval progress text for the employee, approvers and admins, e.g.
// "Approved by Chua Mei Ling (level 1), waiting for Daniel Tan". Pure.
//
// A decision taken by an admin in place of the assigned approver says so:
// "Approved by Vaidik Dubey (admin, level 1)". On a single-level route the
// level is left out: "Approved by Daniel Tan", "Approved by Vaidik Dubey (admin)".

export type ProgressApplication = {
  status: "pending" | "approved" | "rejected" | "cancelled";
  approvalMode: "single" | "two_level";
  currentLevel: number;
  // The approver assigned to each level (after any reassignment).
  approvers: readonly { level: number; id: string; name: string }[];
};

export type ProgressAction = {
  level: number;
  action: "approved" | "rejected";
  approverId: string;
  approverName: string;
  remarks: string | null;
};

export type ProgressLine = { text: string; remarks: string | null };

export type Progress = { lines: ProgressLine[]; summary: string };

const VERB = { approved: "Approved", rejected: "Rejected" } as const;

export function approvalProgress(application: ProgressApplication, actions: readonly ProgressAction[]): Progress {
  const twoLevel = application.approvalMode === "two_level";
  const assigned = (level: number) => application.approvers.find((a) => a.level === level);
  const sorted = [...actions].sort((a, b) => a.level - b.level);

  const lines: ProgressLine[] = sorted.map((action) => {
    const byAdmin = assigned(action.level)?.id !== action.approverId;
    const tags = [byAdmin ? "admin" : null, twoLevel ? `level ${action.level}` : null].filter(Boolean);
    const suffix = tags.length > 0 ? ` (${tags.join(", ")})` : "";
    return { text: `${VERB[action.action]} by ${action.approverName}${suffix}`, remarks: action.remarks };
  });

  if (application.status === "pending") {
    const waiting = assigned(application.currentLevel === 2 ? 2 : 1);
    if (waiting) {
      lines.push({
        text: `Waiting for ${waiting.name}${twoLevel ? ` (level ${application.currentLevel})` : ""}`,
        remarks: null,
      });
    }
  }

  const summary = lines
    .map((line, index) => (index === 0 ? line.text : line.text.charAt(0).toLowerCase() + line.text.slice(1)))
    .join(", ");
  return { lines, summary };
}
