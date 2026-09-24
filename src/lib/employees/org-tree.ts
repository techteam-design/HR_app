// Pure org-chart rules. No database: callers pass every employee with their
// reporting manager id, and get back a forest that is safe to render.

export type OrgStatus = "active" | "inactive" | "probation";

export type OrgPerson = {
  id: string;
  fullName: string;
  reportingManagerId: string | null;
  status: OrgStatus;
};

// Why someone is in the "No active manager" group instead of under a manager.
export type DetachedReason = "inactive_manager" | "missing_manager" | "cycle";

export type OrgNode<T extends OrgPerson> = {
  person: T;
  children: OrgNode<T>[];
  // Direct reports shown in the full (unfiltered) tree.
  directReportCount: number;
  // false only for managers kept by a filter to show the chain above a match.
  matches: boolean;
  detachedReason: DetachedReason | null;
};

export type OrgForest<T extends OrgPerson> = {
  // Employees with no reporting manager.
  roots: OrgNode<T>[];
  // "No active manager": the manager is inactive, missing, or the reporting
  // line loops back on itself. Nobody disappears from the chart.
  detached: OrgNode<T>[];
};

function byName<T extends OrgPerson>(a: OrgNode<T>, b: OrgNode<T>): number {
  return (
    a.person.fullName.localeCompare(b.person.fullName, "en", { sensitivity: "base" }) ||
    a.person.id.localeCompare(b.person.id)
  );
}

// Ids of everyone whose reporting line loops back to themself.
function idsOnCycles(parentOf: ReadonlyMap<string, string | null>): Set<string> {
  const onCycle = new Set<string>();
  const done = new Set<string>();

  for (const start of parentOf.keys()) {
    if (done.has(start)) continue;
    // Follow the chain upward, remembering the order we saw each person in.
    const path: string[] = [];
    const indexInPath = new Map<string, number>();
    let current: string | null = start;
    while (current !== null && !done.has(current) && !indexInPath.has(current)) {
      indexInPath.set(current, path.length);
      path.push(current);
      current = parentOf.get(current) ?? null;
    }
    // Revisiting someone on this walk means everyone from there on loops.
    if (current !== null && indexInPath.has(current)) {
      for (const id of path.slice(indexInPath.get(current))) onCycle.add(id);
    }
    for (const id of path) done.add(id);
  }
  return onCycle;
}

// Builds the chart. Inactive employees are left out unless includeInactive
// is set; either way nobody reports to an inactive manager in the chart.
// Every loop terminates: each person is visited a bounded number of times,
// even when the data contains reporting cycles.
export function buildOrgTree<T extends OrgPerson>(
  people: readonly T[],
  options: { includeInactive?: boolean } = {},
): OrgForest<T> {
  const everyone = new Map(people.map((person) => [person.id, person]));
  const visible = people.filter((person) => options.includeInactive || person.status !== "inactive");

  const parentOf = new Map<string, string | null>();
  const reasonOf = new Map<string, DetachedReason>();
  for (const person of visible) {
    const managerId = person.reportingManagerId;
    if (managerId === null) {
      parentOf.set(person.id, null);
      continue;
    }
    const manager = everyone.get(managerId);
    if (!manager || managerId === person.id) {
      parentOf.set(person.id, null);
      reasonOf.set(person.id, managerId === person.id ? "cycle" : "missing_manager");
    } else if (manager.status === "inactive") {
      parentOf.set(person.id, null);
      reasonOf.set(person.id, "inactive_manager");
    } else {
      parentOf.set(person.id, managerId);
    }
  }

  // Break loops: everyone on a loop is detached; their other reports stay
  // attached underneath them.
  for (const id of idsOnCycles(parentOf)) {
    parentOf.set(id, null);
    reasonOf.set(id, "cycle");
  }

  const nodes = new Map<string, OrgNode<T>>();
  for (const person of visible) {
    nodes.set(person.id, {
      person,
      children: [],
      directReportCount: 0,
      matches: true,
      detachedReason: reasonOf.get(person.id) ?? null,
    });
  }

  const roots: OrgNode<T>[] = [];
  const detached: OrgNode<T>[] = [];
  for (const node of nodes.values()) {
    const parentId = parentOf.get(node.person.id) ?? null;
    const parent = parentId === null ? undefined : nodes.get(parentId);
    if (parent) {
      parent.children.push(node);
    } else if (node.detachedReason) {
      detached.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort(byName);
    node.directReportCount = node.children.length;
  }
  roots.sort(byName);
  detached.sort(byName);
  return { roots, detached };
}

// Keeps people who match, plus every manager above them so the reporting
// chain still makes sense. Kept managers that do not match have
// matches: false. People below a match who do not match are left out.
export function filterOrgTree<T extends OrgPerson>(
  forest: OrgForest<T>,
  predicate: (person: T) => boolean,
): OrgForest<T> {
  const prune = (list: OrgNode<T>[]): OrgNode<T>[] =>
    list.flatMap((node) => {
      const children = prune(node.children);
      const matches = predicate(node.person);
      if (!matches && children.length === 0) return [];
      return [{ ...node, children, matches }];
    });
  return { roots: prune(forest.roots), detached: prune(forest.detached) };
}

// Every node in display order (roots first, then the detached group),
// each parent before its reports.
export function flattenOrgTree<T extends OrgPerson>(forest: OrgForest<T>): OrgNode<T>[] {
  const result: OrgNode<T>[] = [];
  const visit = (list: OrgNode<T>[]) => {
    for (const node of list) {
      result.push(node);
      visit(node.children);
    }
  };
  visit(forest.roots);
  visit(forest.detached);
  return result;
}

// Ids of people whose name contains the query (case-insensitive), in
// display order. An empty query matches nobody.
export function searchOrgTree<T extends OrgPerson>(forest: OrgForest<T>, query: string): string[] {
  const needle = query.trim().toLocaleLowerCase("en");
  if (!needle) return [];
  return flattenOrgTree(forest)
    .filter((node) => node.person.fullName.toLocaleLowerCase("en").includes(needle))
    .map((node) => node.person.id);
}

// Managers above a person in the chart, top first. Empty for a root, a
// detached person, or someone not in the chart.
export function ancestorIdsOf<T extends OrgPerson>(forest: OrgForest<T>, id: string): string[] {
  const parentOf = new Map<string, string>();
  for (const node of flattenOrgTree(forest)) {
    for (const child of node.children) parentOf.set(child.person.id, node.person.id);
  }
  const ancestors: string[] = [];
  let current = parentOf.get(id);
  while (current !== undefined) {
    ancestors.unshift(current);
    current = parentOf.get(current);
  }
  return ancestors;
}
