/**
 * Read models built on top of the graph.
 *
 *  - `ask`    — ranked recall across issues/decisions/tasks, each annotated with
 *               how much it is currently trusted. Retrieval, with trust attached.
 *  - `digest` — materialises "Knowledge" (which is deliberately never stored) as
 *               the *result* of a query: a lessons brief on a topic that includes
 *               what we trust, what has gone stale, and — uniquely — the dead ends
 *               we refuted, so the team doesn't re-walk them.
 */
import type { ProjectMemory } from "./memory.js";
import type { EdgeState, MemoryNode } from "./types.js";

const STATE_RANK: EdgeState[] = [
  "trusted",
  "observed",
  "hypothesis",
  "stale",
  "claimed",
  "superseded",
  "refuted",
];
const rank = (s: EdgeState): number => {
  const i = STATE_RANK.indexOf(s);
  return i === -1 ? 99 : i;
};

const TYPE_RANK: Record<MemoryNode["type"], number> = {
  decision: 0,
  issue: 1,
  task: 2,
  evidence: 3,
};

export interface AskHit {
  node: MemoryNode;
  /** best state among the node's addresses edges (decisions/issues) */
  state?: EdgeState;
  confidence?: number;
}

export interface AskResult {
  query: string;
  hits: AskHit[];
}

/** For a decision (or issue), the strongest `addresses` edge it participates in. */
function trustOf(
  memory: ProjectMemory,
  node: MemoryNode,
  now?: number,
): { state?: EdgeState; confidence?: number } {
  const edges =
    node.type === "decision"
      ? memory.outgoingEdges(node.id, "addresses")
      : node.type === "issue"
        ? memory.incomingEdges(node.id, "addresses")
        : [];
  if (edges.length === 0) return {};
  const views = edges.map((e) => memory.edgeView(e.id, now));
  views.sort((a, b) => rank(a.state) - rank(b.state));
  return { state: views[0].state, confidence: views[0].confidence };
}

export function ask(memory: ProjectMemory, query: string, now?: number): AskResult {
  const hits = memory.search(query).map((node) => ({ node, ...trustOf(memory, node, now) }));
  hits.sort((a, b) => {
    const t = TYPE_RANK[a.node.type] - TYPE_RANK[b.node.type];
    if (t !== 0) return t;
    const sa = a.state ? rank(a.state) : 50;
    const sb = b.state ? rank(b.state) : 50;
    if (sa !== sb) return sa - sb;
    return b.node.createdAt - a.node.createdAt;
  });
  return { query, hits };
}

export function renderAsk(result: AskResult): string {
  if (result.hits.length === 0) return `ask "${result.query}"\n  (nothing found)`;
  const lines = [`ask "${result.query}"`];
  for (const h of result.hits) {
    const trust = h.state
      ? `  [${h.state}${h.confidence !== undefined && h.confidence < 1 ? ` ${h.confidence.toFixed(2)}` : ""}]`
      : "";
    lines.push(`  ${h.node.id}  ${h.node.type.padEnd(8)} "${h.node.title}"${trust}`);
  }
  return lines.join("\n");
}

export interface Digest {
  topic: string;
  trusted: MemoryNode[]; // decisions we currently trust
  aging: MemoryNode[]; // decisions gone stale — re-verify
  deadEnds: MemoryNode[]; // decisions refuted — do not retry
  superseded: MemoryNode[]; // replaced by newer decisions
  problems: MemoryNode[]; // issues seen
}

export function digest(memory: ProjectMemory, topic: string, now?: number): Digest {
  const seed = memory.search(topic);
  const d: Digest = { topic, trusted: [], aging: [], deadEnds: [], superseded: [], problems: [] };

  // Gather the topic's causal neighbourhood: matched decisions, plus decisions
  // that address a matched issue (their titles need not mention the topic).
  const decisions = new Map<string, MemoryNode>();
  const seenIssues = new Set<string>();
  for (const node of seed) {
    if (node.type === "issue") {
      if (!seenIssues.has(node.id)) {
        seenIssues.add(node.id);
        d.problems.push(node);
      }
      for (const e of memory.incomingEdges(node.id, "addresses")) {
        const dec = memory.getNode(e.from);
        if (dec?.type === "decision") decisions.set(dec.id, dec);
      }
    } else if (node.type === "decision") {
      decisions.set(node.id, node);
    }
  }

  for (const dec of decisions.values()) {
    const { state } = trustOf(memory, dec, now);
    if (state === "trusted" || state === "observed") d.trusted.push(dec);
    else if (state === "stale") d.aging.push(dec);
    else if (state === "refuted") d.deadEnds.push(dec);
    else if (state === "superseded") d.superseded.push(dec);
  }
  return d;
}

export function renderDigest(d: Digest): string {
  const section = (title: string, nodes: MemoryNode[], note?: (n: MemoryNode) => string): string[] => {
    if (nodes.length === 0) return [];
    const out = [``, title];
    for (const n of nodes) out.push(`  • ${n.title}${note ? note(n) : ""}`);
    return out;
  };
  const why = (n: MemoryNode) => (n.body ? `  — ${n.body.split("\n")[0]}` : "");
  const lines = [`# What we've learned about "${d.topic}"`];
  lines.push(
    ...section("## What we do (trusted)", d.trusted, why),
    ...section("## Aging — re-verify before relying on it", d.aging, why),
    ...section("## Dead ends — do NOT retry", d.deadEnds, why),
    ...section("## Superseded by newer decisions", d.superseded, why),
    ...section("## Problems seen", d.problems),
  );
  if (lines.length === 1) lines.push("", "  (no lessons recorded on this topic yet)");
  return lines.join("\n");
}
