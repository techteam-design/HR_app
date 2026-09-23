import { describe, expect, it } from "vitest";

import {
  ACTION_KIND,
  ACTIONS,
  actionsFor,
  can,
  isLoginAllowed,
  NAV_ITEMS,
  navigationFor,
  ROLES,
  type Action,
  type Role,
} from "@/lib/auth/rbac";

// The full permission table. Any change to rbac.ts must be reflected here.
const EXPECTED: Record<Role, Action[]> = {
  employee: ["view_own_profile", "apply_leave"],
  manager: ["view_own_profile", "apply_leave", "approve_leave", "view_team_calendar"],
  admin: [...ACTIONS],
  hr_viewer: ["view_own_profile", "apply_leave", "view_all_records", "view_reports"],
};

const WRITE_ACTIONS = ACTIONS.filter((action) => ACTION_KIND[action] === "write");

describe("can()", () => {
  for (const role of ROLES) {
    describe(role, () => {
      for (const action of ACTIONS) {
        const allowed = EXPECTED[role].includes(action);
        it(`${allowed ? "allows" : "denies"} ${action}`, () => {
          expect(can(role, action)).toBe(allowed);
        });
      }
    });
  }

  it("actionsFor() lists exactly the expected actions for every role", () => {
    for (const role of ROLES) {
      expect(actionsFor(role).sort()).toEqual([...EXPECTED[role]].sort());
    }
  });
});

describe("hr_viewer is read-only", () => {
  it("there are write actions to check", () => {
    expect(WRITE_ACTIONS.length).toBeGreaterThan(0);
  });

  for (const action of WRITE_ACTIONS) {
    it(`can never ${action}`, () => {
      expect(can("hr_viewer", action)).toBe(false);
    });
  }

  it("has no write action at all", () => {
    expect(actionsFor("hr_viewer").filter((a) => ACTION_KIND[a] === "write")).toEqual([]);
  });

  it("cannot export data", () => {
    expect(can("hr_viewer", "export_data")).toBe(false);
  });
});

describe("role hierarchy", () => {
  it("manager has every employee permission", () => {
    for (const action of actionsFor("employee")) {
      expect(can("manager", action)).toBe(true);
    }
  });

  it("only admin has any manage_* or override action", () => {
    const adminOnly: Action[] = [
      "manage_employees",
      "manage_org",
      "manage_policies",
      "manage_approval_config",
      "override_notice",
      "export_data",
    ];
    for (const role of ROLES) {
      for (const action of adminOnly) {
        expect(can(role, action)).toBe(role === "admin");
      }
    }
  });

  it("every action is classified", () => {
    for (const action of ACTIONS) {
      expect(["self", "read", "write"]).toContain(ACTION_KIND[action]);
    }
  });
});

describe("navigationFor()", () => {
  const hrefs = (role: Role) => navigationFor(role).map((item) => item.href);

  it("every role sees the dashboard", () => {
    for (const role of ROLES) expect(hrefs(role)).toContain("/dashboard");
  });

  it("only shows items the role is allowed to use", () => {
    for (const role of ROLES) {
      for (const item of navigationFor(role)) {
        if (item.action) expect(can(role, item.action)).toBe(true);
      }
    }
  });

  it("admin sees every item", () => {
    expect(hrefs("admin")).toEqual(NAV_ITEMS.map((item) => item.href));
  });

  it("employee sees only their own pages", () => {
    expect(hrefs("employee")).toEqual([
      "/dashboard",
      "/leave/apply",
      "/leave/history",
      "/profile",
    ]);
  });

  it("manager also sees approvals and team calendar, but no admin pages", () => {
    expect(hrefs("manager")).toEqual([
      "/dashboard",
      "/leave/apply",
      "/leave/history",
      "/profile",
      "/approvals",
      "/team-calendar",
    ]);
  });

  it("hr_viewer sees reports but no admin, approval or team pages", () => {
    expect(hrefs("hr_viewer")).toEqual([
      "/dashboard",
      "/leave/apply",
      "/leave/history",
      "/profile",
      "/reports",
      "/reports/calendar",
    ]);
    expect(hrefs("hr_viewer").some((href) => href.startsWith("/admin"))).toBe(false);
  });
});

describe("isLoginAllowed()", () => {
  it("blocks a login with no linked employee", () => {
    expect(isLoginAllowed(null)).toBe(false);
    expect(isLoginAllowed(undefined)).toBe(false);
  });

  it("blocks inactive employees", () => {
    expect(isLoginAllowed({ status: "inactive" })).toBe(false);
  });

  it("allows active and probation employees", () => {
    expect(isLoginAllowed({ status: "active" })).toBe(true);
    expect(isLoginAllowed({ status: "probation" })).toBe(true);
  });
});
