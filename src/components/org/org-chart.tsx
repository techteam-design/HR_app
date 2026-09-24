"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { unitLabel } from "@/components/employees/labels";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDownIcon, OrgChartIcon, SearchIcon } from "@/components/ui/icons";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  ancestorIdsOf,
  buildOrgTree,
  filterOrgTree,
  flattenOrgTree,
  searchOrgTree,
  type DetachedReason,
  type OrgNode,
} from "@/lib/employees/org-tree";
import { cn } from "@/lib/utils/cn";

export type OrgChartPerson = {
  id: string;
  fullName: string;
  designation: string;
  reportingManagerId: string | null;
  status: "active" | "inactive" | "probation";
  departmentId: string;
  departmentName: string;
  departmentIsActive: boolean;
  branchId: string;
  branchName: string;
  branchIsActive: boolean;
  photoUrl: string | null;
};

type Option = { id: string; name: string; isActive: boolean };
type Node = OrgNode<OrgChartPerson>;

// The first two levels are open until someone toggles them.
const DEFAULT_OPEN_DEPTH = 2;

const DETACHED_LABELS: Record<DetachedReason, string> = {
  inactive_manager: "Manager is inactive",
  missing_manager: "Manager not found",
  cycle: "Reporting loop",
};

type ViewState = {
  isOpen: (node: Node, depth: number) => boolean;
  toggle: (id: string, open: boolean) => void;
  matches: ReadonlySet<string>;
  focusId: string | null;
};

export function OrgChart({
  people,
  departments,
  branches,
}: {
  people: OrgChartPerson[];
  departments: Option[];
  branches: Option[];
}) {
  const [department, setDepartment] = useState("");
  const [branch, setBranch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  // Explicit open/closed choices; anything not listed uses the default.
  const [openState, setOpenState] = useState<ReadonlyMap<string, boolean>>(new Map());
  // Bumped to scroll to the current match again (e.g. pressing Enter).
  const [scrollRequest, setScrollRequest] = useState(0);

  const filtering = Boolean(department || branch);

  const forest = useMemo(() => {
    const full = buildOrgTree(people, { includeInactive: showInactive });
    if (!filtering) return full;
    return filterOrgTree(
      full,
      (p) => (!department || p.departmentId === department) && (!branch || p.branchId === branch),
    );
  }, [people, showInactive, filtering, department, branch]);

  const matchIds = useMemo(() => searchOrgTree(forest, query), [forest, query]);
  const focusId = matchIds.length > 0 ? matchIds[Math.min(matchIndex, matchIds.length - 1)] : null;
  const shownCount = useMemo(() => flattenOrgTree(forest).filter((n) => n.matches).length, [forest]);

  // Open every manager above a person so their card is visible.
  function reveal(id: string | null) {
    if (!id) return;
    const ancestors = ancestorIdsOf(forest, id);
    setOpenState((previous) => {
      const next = new Map(previous);
      for (const ancestor of ancestors) next.set(ancestor, true);
      return next;
    });
    setScrollRequest((n) => n + 1);
  }

  function search(value: string) {
    setQuery(value);
    setMatchIndex(0);
    reveal(searchOrgTree(forest, value)[0] ?? null);
  }

  function nextMatch() {
    if (matchIds.length === 0) return;
    const next = (matchIndex + 1) % matchIds.length;
    setMatchIndex(next);
    reveal(matchIds[next]);
  }

  // Scroll the focused card (whichever of the desktop/mobile views is
  // visible) into view. DOM only: no state changes here.
  useEffect(() => {
    if (!focusId || scrollRequest === 0) return;
    const target = Array.from(document.querySelectorAll<HTMLElement>(`[data-org-id="${focusId}"]`)).find(
      (element) => element.offsetParent !== null,
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center", inline: "center" });
  }, [focusId, scrollRequest]);

  const view: ViewState = {
    isOpen: (node, depth) => openState.get(node.person.id) ?? (filtering || depth < DEFAULT_OPEN_DEPTH),
    toggle: (id, open) => setOpenState((previous) => new Map(previous).set(id, open)),
    matches: new Set(matchIds),
    focusId,
  };

  const empty = forest.roots.length === 0 && forest.detached.length === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-card border border-border bg-surface p-4 sm:p-5">
        <div className="space-y-2">
          <Label htmlFor="org-search">Find a person</Label>
          <div className="relative">
            <SearchIcon
              width={18}
              height={18}
              className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
            />
            <Input
              id="org-search"
              type="search"
              value={query}
              onChange={(event) => search(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (matchIds.length > 1) nextMatch();
                  else reveal(focusId);
                }
              }}
              placeholder="Type a name"
              autoComplete="off"
              className="pl-11"
              aria-describedby="org-search-status"
            />
          </div>
          <div className="flex min-h-11 flex-wrap items-center gap-3">
            <p id="org-search-status" role="status" className="text-[13px] text-muted">
              {query.trim() === ""
                ? `${shownCount} ${shownCount === 1 ? "person" : "people"} shown`
                : matchIds.length === 0
                  ? "No one by that name in this view"
                  : `${Math.min(matchIndex, matchIds.length - 1) + 1} of ${matchIds.length} found`}
            </p>
            {matchIds.length > 1 && (
              <button
                type="button"
                onClick={nextMatch}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-plum-700 hover:bg-lilac-50 focus-visible:outline-2 focus-visible:outline-plum-700"
              >
                Next match
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="org-department">Department</Label>
            <Select id="org-department" value={department} onChange={(event) => setDepartment(event.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {unitLabel(d.name, d.isActive)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-branch">Branch</Label>
            <Select id="org-branch" value={branch} onChange={(event) => setBranch(event.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {unitLabel(b.name, b.isActive)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Checkbox
              label="Show inactive"
              description="Include deactivated employees"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="w-full"
            />
          </div>
        </div>
        {filtering && (
          <p className="text-[13px] text-muted">
            Managers above a matching person stay visible (faded) so the reporting line still makes sense.
          </p>
        )}
      </div>

      {empty ? (
        <div className="rounded-card bg-lilac-50 px-6 py-12 text-center">
          <OrgChartIcon width={28} height={28} className="mx-auto text-plum-500" />
          <h2 className="mt-4 font-display text-section-title font-medium text-plum-900">
            {filtering ? "No one matches" : "No employees yet"}
          </h2>
          <p className="mt-2 text-[15px] text-muted">
            {filtering ? "Try a different department or branch." : "Employees added by an admin will appear here."}
          </p>
        </div>
      ) : (
        <>
          {forest.roots.length > 0 && <ChartSection nodes={forest.roots} view={view} />}

          {forest.detached.length > 0 && (
            <section aria-labelledby="org-detached-title" className="space-y-3">
              <div>
                <h2 id="org-detached-title" className="font-display text-section-title font-medium text-plum-900">
                  No active <em>manager</em>
                </h2>
                <p className="mt-1 max-w-prose text-[15px] text-muted">
                  Their reporting manager is inactive, missing or part of a reporting loop. Open their profile to
                  choose a new manager.
                </p>
              </div>
              <ChartSection nodes={forest.detached} view={view} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

// Desktop: top-down tree. Mobile: indented, collapsible list.
function ChartSection({ nodes, view }: { nodes: Node[]; view: ViewState }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-surface p-6 md:block">
        <ul className="org-tree">
          {nodes.map((node) => (
            <TreeItem key={node.person.id} node={node} depth={0} view={view} />
          ))}
        </ul>
      </div>
      <ul className="space-y-2 md:hidden">
        {nodes.map((node) => (
          <ListItem key={node.person.id} node={node} depth={0} view={view} />
        ))}
      </ul>
    </>
  );
}

function TreeItem({ node, depth, view }: { node: Node; depth: number; view: ViewState }) {
  const open = node.children.length > 0 && view.isOpen(node, depth);
  return (
    <li>
      <PersonCard node={node} open={open} view={view} />
      {open && (
        <ul>
          {node.children.map((child) => (
            <TreeItem key={child.person.id} node={child} depth={depth + 1} view={view} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ListItem({ node, depth, view }: { node: Node; depth: number; view: ViewState }) {
  const hasChildren = node.children.length > 0;
  const open = hasChildren && view.isOpen(node, depth);
  const person = node.person;
  return (
    <li>
      <div className="flex items-stretch gap-1">
        {hasChildren ? (
          <ToggleButton node={node} open={open} view={view} className="size-11 shrink-0 self-center" />
        ) : (
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
        <Link
          href={`/admin/employees/${person.id}`}
          data-org-id={person.id}
          className={cn(cardClasses(node, view), "flex min-w-0 flex-1 items-center gap-3 p-3")}
        >
          <Avatar name={person.fullName} src={person.photoUrl} size="sm" />
          <PersonText node={node} />
        </Link>
      </div>
      {open && (
        <ul className="mt-2 ml-5 space-y-2 border-l border-lilac-200 pl-2">
          {node.children.map((child) => (
            <ListItem key={child.person.id} node={child} depth={depth + 1} view={view} />
          ))}
        </ul>
      )}
    </li>
  );
}

function cardClasses(node: Node, view: ViewState) {
  const id = node.person.id;
  return cn(
    "rounded-input border bg-surface text-left transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
    "hover:border-plum-500",
    view.focusId === id
      ? "border-plum-700 ring-2 ring-plum-700"
      : view.matches.has(id)
        ? "border-plum-500 ring-1 ring-plum-500"
        : "border-border",
    // Kept only to show the chain above a filtered match.
    !node.matches && "border-dashed opacity-60",
    node.person.status === "inactive" && "bg-bg",
  );
}

function PersonCard({ node, open, view }: { node: Node; open: boolean; view: ViewState }) {
  const person = node.person;
  return (
    <div data-org-id={person.id} className={cn(cardClasses(node, view), "w-56 p-0")}>
      <Link
        href={`/admin/employees/${person.id}`}
        className="flex items-start gap-3 rounded-input p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700"
      >
        <Avatar name={person.fullName} src={person.photoUrl} size="md" />
        <PersonText node={node} />
      </Link>
      {node.children.length > 0 && (
        <div className="border-t border-border px-2 py-1">
          <ToggleButton node={node} open={open} view={view} className="w-full justify-between px-3" showCount />
        </div>
      )}
    </div>
  );
}

function PersonText({ node }: { node: Node }) {
  const person = node.person;
  const reports = node.directReportCount;
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-semibold break-words text-plum-900">{person.fullName}</span>
      <span className="block text-[13px] break-words text-muted">{person.designation}</span>
      <span className="mt-1 block text-xs break-words text-plum-900">
        {unitLabel(person.departmentName, person.departmentIsActive)} ·{" "}
        {unitLabel(person.branchName, person.branchIsActive)}
      </span>
      <span className="mt-1 flex flex-wrap gap-1.5">
        {reports > 0 && (
          <span className="rounded-full bg-lilac-50 px-2 py-0.5 text-[11px] font-semibold text-plum-900">
            {reports} direct report{reports === 1 ? "" : "s"}
          </span>
        )}
        {person.status === "inactive" && (
          <span className="rounded-full bg-status-cancelled-bg px-2 py-0.5 text-[11px] font-semibold text-status-cancelled-text">
            Inactive
          </span>
        )}
        {node.detachedReason && (
          <span className="rounded-full bg-status-pending-bg px-2 py-0.5 text-[11px] font-semibold text-status-pending-text">
            {DETACHED_LABELS[node.detachedReason]}
          </span>
        )}
      </span>
    </span>
  );
}

function ToggleButton({
  node,
  open,
  view,
  className,
  showCount = false,
}: {
  node: Node;
  open: boolean;
  view: ViewState;
  className?: string;
  showCount?: boolean;
}) {
  const label = `${open ? "Hide" : "Show"} ${node.person.fullName}'s reports`;
  return (
    <button
      type="button"
      onClick={() => view.toggle(node.person.id, !open)}
      aria-expanded={open}
      aria-label={label}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full text-[13px] font-semibold text-plum-700",
        "transition-colors duration-150 hover:bg-lilac-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum-700",
        className,
      )}
    >
      {showCount && <span aria-hidden="true">{open ? "Hide reports" : `Show ${node.children.length}`}</span>}
      <ChevronDownIcon
        width={18}
        height={18}
        className={open ? "rotate-180" : undefined}
      />
    </button>
  );
}
