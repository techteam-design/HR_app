import type { Progress } from "@/lib/approvals/progress";

// Approval steps with each decision's remarks, e.g.
//   Approved by Daniel Tan (level 1) · "Enjoy the break"
//   Waiting for Vaidik Dubey (level 2)
export function ApprovalProgress({ progress }: { progress: Progress }) {
  if (progress.lines.length === 0) return null;
  return (
    <ul className="space-y-0.5 text-[13px] text-plum-900">
      {progress.lines.map((line, index) => (
        <li key={index} className="break-words">
          {line.text}
          {line.remarks && <span className="text-muted"> · &ldquo;{line.remarks}&rdquo;</span>}
        </li>
      ))}
    </ul>
  );
}
