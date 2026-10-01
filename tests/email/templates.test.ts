import { describe, expect, it } from "vitest";

import { renderEmail } from "@/lib/email/templates/layout";
import {
  approvedEmail,
  cancelledEmail,
  datesText,
  level2PendingEmail,
  reminderEmail,
  requestSubmittedEmail,
  revokedEmail,
  type LeaveFacts,
} from "@/lib/email/templates/leave";

const FACTS: LeaveFacts = {
  employeeName: "Priya Nair",
  code: "annual",
  startDate: "2026-10-12",
  endDate: "2026-10-16",
  totalDays: 4,
  isHalfDay: false,
  halfDaySlot: null,
  halfDayStart: null,
  halfDayEnd: null,
  reason: "Family trip",
};
const HALF: LeaveFacts = {
  ...FACTS,
  startDate: "2026-10-12",
  endDate: "2026-10-12",
  totalDays: 0.5,
  isHalfDay: true,
  halfDaySlot: "morning",
  halfDayStart: "08:00",
  halfDayEnd: "12:00",
};
const URL = "https://hr.example/approvals";
const PLAIN = { intendedFor: null, subjectPrefix: "" };

describe("subjects", () => {
  it("are short and specific", () => {
    expect(requestSubmittedEmail(FACTS, { levelText: null, submittedByName: null, url: URL }).subject).toBe(
      "Leave request from Priya Nair: 12–16 Oct",
    );
    expect(level2PendingEmail(FACTS, { level1ApproverName: "Daniel Tan", remarks: null, url: URL }).subject).toBe(
      "Leave request for your approval: Priya Nair, 12–16 Oct",
    );
    expect(approvedEmail(FACTS, { approverName: "Daniel Tan", remarks: null, override: null, url: URL }).subject).toBe(
      "Your leave is approved: 12–16 Oct",
    );
    expect(revokedEmail(FACTS, { adminName: "Vaidik Dubey", reason: "Mistake", url: URL }).subject).toBe(
      "Approval revoked: your leave on 12–16 Oct",
    );
    expect(cancelledEmail(FACTS, { cancelledByName: "Vaidik Dubey", note: null, wasApproved: false, url: URL }).subject).toBe(
      "Your leave request was cancelled: 12–16 Oct",
    );
  });
});

describe("content", () => {
  it("half days show the stored times, not the current settings", () => {
    expect(datesText(HALF)).toBe("Mon 12 Oct 2026, morning, 8:00 AM – 12:00 PM");
  });

  it("Approve anyway quotes the admin's reason", () => {
    const content = approvedEmail(FACTS, {
      approverName: "Vaidik Dubey",
      remarks: null,
      override: { adminName: "Vaidik Dubey", reason: "Cover arranged" },
      url: URL,
    });
    expect(content.quote).toEqual({ label: "Reason from Vaidik Dubey", text: "Cover arranged" });
  });

  it("never mentions a balance", () => {
    const emails = [
      requestSubmittedEmail(FACTS, { levelText: "level 1", submittedByName: "Vaidik Dubey", url: URL }),
      approvedEmail(FACTS, { approverName: "Daniel Tan", remarks: "Enjoy", override: null, url: URL }),
      reminderEmail([{ ...FACTS, waitingDays: 3 }], { url: URL }),
    ];
    for (const content of emails) {
      const { html, text } = renderEmail(content, PLAIN);
      expect(`${html}\n${text}`.toLowerCase()).not.toContain("balance");
    }
  });

  it("the reminder digest lists every request with how long it waited", () => {
    const content = reminderEmail(
      [
        { ...FACTS, waitingDays: 3 },
        { ...HALF, employeeName: "Kelvin Ong", waitingDays: 2 },
      ],
      { url: URL },
    );
    expect(content.subject).toBe("2 leave requests waiting for you");
    const { text } = renderEmail(content, PLAIN);
    expect(text).toContain("- Priya Nair · Annual leave");
    expect(text).toContain("Waiting 3 days");
    expect(text).toContain("Mon 12 Oct 2026, morning, 8:00 AM – 12:00 PM (0.5 days)");
    expect(reminderEmail([{ ...FACTS, waitingDays: 2 }], { url: URL }).subject).toBe("1 leave request waiting for you");
  });
});

describe("renderEmail()", () => {
  const content = requestSubmittedEmail(
    { ...FACTS, employeeName: "Ali <script>", reason: 'Say "hi" & bye' },
    { levelText: null, submittedByName: null, url: URL },
  );

  it("escapes every value in the HTML", () => {
    const { html } = renderEmail(content, PLAIN);
    expect(html).not.toContain("<script>");
    expect(html).toContain("Ali &lt;script&gt;");
    expect(html).toContain("Say &quot;hi&quot; &amp; bye");
  });

  it("shows the intended recipient at the top when redirected, in both versions", () => {
    const rendered = renderEmail(content, { intendedFor: "Daniel Tan <daniel.tan@example.test>", subjectPrefix: "[DEV] " });
    expect(rendered.subject.startsWith("[DEV] Leave request from")).toBe(true);
    expect(rendered.html).toContain("Intended for: Daniel Tan &lt;daniel.tan@example.test&gt;");
    expect(rendered.text.startsWith("Intended for: Daniel Tan <daniel.tan@example.test>")).toBe(true);
  });

  it("has one button and a plain-text link", () => {
    const { html, text } = renderEmail(content, PLAIN);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(text).toContain(`Review request: ${URL}`);
  });
});
