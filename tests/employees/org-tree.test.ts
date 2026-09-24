import { describe, expect, it } from "vitest";

import {
  ancestorIdsOf,
  buildOrgTree,
  filterOrgTree,
  flattenOrgTree,
  searchOrgTree,
  type OrgForest,
  type OrgNode,
  type OrgPerson,
  type OrgStatus,
} from "@/lib/employees/org-tree";

type Person = OrgPerson & { branch: string };

function person(id: string, fullName: string, managerId: string | null, status: OrgStatus = "active", branch = "Orchard"): Person {
  return { id, fullName, reportingManagerId: managerId, status, branch };
}

// Compact shape for assertions: "Name" or ["Name", [children...]].
type Shape = string | [string, Shape[]];
function shape(nodes: OrgNode<Person>[]): Shape[] {
  return nodes.map((node) =>
    node.children.length === 0 ? node.person.fullName : [node.person.fullName, shape(node.children)],
  );
}

// Aisha (owner)
// ├── Daniel (manager)
// │   ├── Maria
// │   └── Kelvin
// │       └── Zoe
// └── Priya (manager)
//     └── Arjun
// Grace (no manager)
const company: Person[] = [
  person("aisha", "Aisha Rahman", null),
  person("grace", "Grace Lim", null),
  person("daniel", "Daniel Tan", "aisha"),
  person("priya", "Priya Nair", "aisha", "active", "Tampines"),
  person("maria", "Maria Santos", "daniel"),
  person("kelvin", "Kelvin Ong", "daniel", "probation"),
  person("zoe", "Zoe Tan", "kelvin", "active", "Tampines"),
  person("arjun", "Arjun Kumar", "priya", "active", "Tampines"),
];

describe("buildOrgTree()", () => {
  it("makes everyone without a manager a root, sorted by name", () => {
    const tree = buildOrgTree(company);
    expect(tree.roots.map((n) => n.person.fullName)).toEqual(["Aisha Rahman", "Grace Lim"]);
    expect(tree.detached).toEqual([]);
  });

  it("nests reports at every level and sorts children by name", () => {
    expect(shape(buildOrgTree(company).roots)).toEqual([
      [
        "Aisha Rahman",
        [
          ["Daniel Tan", [["Kelvin Ong", ["Zoe Tan"]], "Maria Santos"]],
          ["Priya Nair", ["Arjun Kumar"]],
        ],
      ],
      "Grace Lim",
    ]);
  });

  it("sorts names case-insensitively and does not depend on input order", () => {
    const shuffled = [...company].reverse().concat(person("amy", "amy chen", "aisha"));
    const aisha = buildOrgTree(shuffled).roots[0];
    expect(aisha.children.map((n) => n.person.fullName)).toEqual(["amy chen", "Daniel Tan", "Priya Nair"]);
  });

  it("counts direct reports", () => {
    const [aisha] = buildOrgTree(company).roots;
    expect(aisha.directReportCount).toBe(2);
    expect(aisha.children[0].directReportCount).toBe(2);
    expect(aisha.children[0].children[1].directReportCount).toBe(0);
  });

  it("includes every visible person exactly once", () => {
    const ids = flattenOrgTree(buildOrgTree(company)).map((n) => n.person.id);
    expect([...ids].sort()).toEqual(company.map((p) => p.id).sort());
  });

  describe("inactive employees", () => {
    const withInactive = [...company, person("old", "Olivia Former", "daniel", "inactive")];

    it("hides inactive employees by default", () => {
      const ids = flattenOrgTree(buildOrgTree(withInactive)).map((n) => n.person.id);
      expect(ids).not.toContain("old");
    });

    it("shows them under their manager with includeInactive", () => {
      const daniel = buildOrgTree(withInactive, { includeInactive: true }).roots[0].children[0];
      expect(daniel.children.map((n) => n.person.fullName)).toContain("Olivia Former");
    });

    it("puts reports of an inactive manager in the No active manager group", () => {
      const people = [
        person("boss", "Bob Gone", null, "inactive"),
        person("a", "Alice", "boss"),
        person("b", "Ben", "boss", "probation"),
      ];
      for (const includeInactive of [false, true]) {
        const tree = buildOrgTree(people, { includeInactive });
        expect(tree.detached.map((n) => n.person.fullName)).toEqual(["Alice", "Ben"]);
        expect(tree.detached.every((n) => n.detachedReason === "inactive_manager")).toBe(true);
      }
      expect(buildOrgTree(people, { includeInactive: true }).roots.map((n) => n.person.id)).toEqual(["boss"]);
    });

    it("keeps a detached person's own reports underneath them", () => {
      const people = [
        person("boss", "Bob Gone", null, "inactive"),
        person("a", "Alice", "boss"),
        person("c", "Cara", "a"),
      ];
      expect(shape(buildOrgTree(people).detached)).toEqual([["Alice", ["Cara"]]]);
    });
  });

  it("puts employees whose manager does not exist in the No active manager group", () => {
    const tree = buildOrgTree([person("a", "Alice", "ghost")]);
    expect(tree.roots).toEqual([]);
    expect(tree.detached[0].person.id).toBe("a");
    expect(tree.detached[0].detachedReason).toBe("missing_manager");
  });

  describe("bad data: reporting cycles", () => {
    it("detaches a two-person loop without looping forever", () => {
      const people = [person("a", "Alice", "b"), person("b", "Ben", "a"), person("c", "Cara", "a")];
      const tree = buildOrgTree(people);
      expect(tree.roots).toEqual([]);
      expect(shape(tree.detached)).toEqual([["Alice", ["Cara"]], "Ben"]);
      expect(tree.detached.map((n) => n.detachedReason)).toEqual(["cycle", "cycle"]);
    });

    it("detaches someone who reports to themself", () => {
      const tree = buildOrgTree([person("a", "Alice", "a")]);
      expect(tree.detached.map((n) => [n.person.id, n.detachedReason])).toEqual([["a", "cycle"]]);
    });

    it("detaches a longer loop and leaves the rest of the company alone", () => {
      const people = [
        ...company,
        person("x", "Xavier", "z"),
        person("y", "Yasmin", "x"),
        person("z", "Zack", "y"),
        person("w", "Wendy", "x"),
      ];
      const tree = buildOrgTree(people);
      expect(tree.roots.map((n) => n.person.id)).toEqual(["aisha", "grace"]);
      expect(tree.detached.map((n) => n.person.fullName)).toEqual(["Xavier", "Yasmin", "Zack"]);
      // Wendy is not on the loop, so she stays under Xavier.
      expect(tree.detached[0].children.map((n) => n.person.fullName)).toEqual(["Wendy"]);
      expect(flattenOrgTree(tree)).toHaveLength(people.length);
    });
  });
});

describe("filterOrgTree()", () => {
  const tree = buildOrgTree(company);
  const inTampines = (p: Person) => p.branch === "Tampines";

  it("keeps the managers above a match so the chain still makes sense", () => {
    const filtered = filterOrgTree(tree, inTampines);
    expect(shape(filtered.roots)).toEqual([
      ["Aisha Rahman", [["Daniel Tan", [["Kelvin Ong", ["Zoe Tan"]]]], ["Priya Nair", ["Arjun Kumar"]]]],
    ]);
  });

  it("marks kept managers that do not match themselves", () => {
    const filtered = filterOrgTree(tree, inTampines);
    const byId = new Map(flattenOrgTree(filtered).map((n) => [n.person.id, n.matches]));
    expect(byId.get("aisha")).toBe(false);
    expect(byId.get("daniel")).toBe(false);
    expect(byId.get("kelvin")).toBe(false);
    expect(byId.get("zoe")).toBe(true);
    expect(byId.get("priya")).toBe(true);
  });

  it("drops people below a match who do not match, and whole branches with no match", () => {
    const filtered = filterOrgTree(tree, (p) => p.id === "daniel");
    expect(shape(filtered.roots)).toEqual([["Aisha Rahman", ["Daniel Tan"]]]);
  });

  it("keeps the original direct report count", () => {
    const daniel = filterOrgTree(tree, (p) => p.id === "zoe").roots[0].children[0];
    expect(daniel.children).toHaveLength(1);
    expect(daniel.directReportCount).toBe(2);
  });

  it("filters the No active manager group too", () => {
    const people = [person("a", "Alice", "ghost"), person("b", "Ben", "ghost", "active", "Tampines")];
    const filtered: OrgForest<Person> = filterOrgTree(buildOrgTree(people), inTampines);
    expect(filtered.detached.map((n) => n.person.id)).toEqual(["b"]);
  });

  it("returns an empty forest when nobody matches", () => {
    expect(filterOrgTree(tree, () => false)).toEqual({ roots: [], detached: [] });
  });
});

describe("searchOrgTree() and ancestorIdsOf()", () => {
  const tree = buildOrgTree(company);

  it("finds names case-insensitively, in display order", () => {
    expect(searchOrgTree(tree, "tan")).toEqual(["daniel", "zoe"]);
    expect(searchOrgTree(tree, "  MARIA ")).toEqual(["maria"]);
  });

  it("matches nobody for an empty query", () => {
    expect(searchOrgTree(tree, "   ")).toEqual([]);
  });

  it("lists the managers above a person, top first", () => {
    expect(ancestorIdsOf(tree, "zoe")).toEqual(["aisha", "daniel", "kelvin"]);
    expect(ancestorIdsOf(tree, "aisha")).toEqual([]);
    expect(ancestorIdsOf(tree, "nobody")).toEqual([]);
  });
});
