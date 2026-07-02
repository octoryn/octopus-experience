/**
 * `why` — the flagship. Reconstruct the causal chain behind a node.
 *
 * Default behaviour walks *through* trusted/observed edges only; hypothesis,
 * claimed and stale edges are SHOWN (so cold-start `why` isn't empty) but marked
 * and not traversed. superseded/refuted are hidden unless `history` is set —
 * they are preserved, never deleted (refuted is negative knowledge).
 */
import {
  computeEdgeState,
  confidence,
  isHistoryOnly,
  isTrustedByDefault,
  type LifecycleOptions,
} from "./lifecycle.js";
import type {
  EdgeState,
  EvidenceLink,
  EvidenceStance,
  MemoryEdge,
  MemoryNode,
} from "./types.js";

export interface WhyOptions {
  history?: boolean;
  maxDepth?: number;
}

export interface WhyContext {
  nodes: Map<string, MemoryNode>;
  edges: MemoryEdge[];
  links: EvidenceLink[];
  lifecycle: LifecycleOptions;
  history: boolean;
  maxDepth: number;
}

export interface WhyEvidence {
  node: MemoryNode;
  stance: EvidenceStance;
}

export interface WhyStep {
  edge: MemoryEdge;
  state: EdgeState;
  confidence: number;
  /** node reached by following this edge away from its parent */
  other: MemoryNode;
  /** phrasing direction relative to parent: does the edge point out of, or into, the parent? */
  direction: "out" | "in";
  evidence: WhyEvidence[];
  walked: boolean; // did we traverse through it?
  children: WhyStep[];
}

export interface WhyResult {
  root: MemoryNode;
  rootEvidence: WhyEvidence[];
  steps: WhyStep[];
  history: boolean;
}

function evidenceForTarget(
  targetId: string,
  ctx: WhyContext,
): WhyEvidence[] {
  const out: WhyEvidence[] = [];
  for (const l of ctx.links) {
    if (l.targetId !== targetId) continue;
    const node = ctx.nodes.get(l.evidenceId);
    if (node) out.push({ node, stance: l.stance });
  }
  return out;
}

export function reconstructWhy(nodeId: string, ctx: WhyContext): WhyResult {
  const root = ctx.nodes.get(nodeId);
  if (!root) throw new Error(`no such node: ${nodeId}`);

  // Visited state is tracked PER PATH, not globally: a shared edge must be able
  // to appear under each parent it explains (diamonds), while a node already on
  // the current path is skipped to break cycles. A global visited set would
  // collapse the tree into an order-dependent snake and drop real provenance.
  const expand = (
    currentId: string,
    depth: number,
    pathNodes: Set<string>,
    pathEdges: Set<string>,
  ): WhyStep[] => {
    if (depth <= 0) return [];
    const steps: WhyStep[] = [];
    for (const edge of ctx.edges) {
      if (pathEdges.has(edge.id)) continue;
      const touchesOut = edge.from === currentId;
      const touchesIn = edge.to === currentId;
      if (!touchesOut && !touchesIn) continue;

      const otherId = touchesOut ? edge.to : edge.from;
      if (pathNodes.has(otherId)) continue; // cycle guard on this path
      const other = ctx.nodes.get(otherId);
      if (!other) continue;

      const state = computeEdgeState(edge, ctx.links, ctx.nodes, ctx.lifecycle);
      if (isHistoryOnly(state) && !ctx.history) continue;

      const walk = ctx.history || isTrustedByDefault(state);
      steps.push({
        edge,
        state,
        confidence: confidence(edge, ctx.lifecycle),
        other,
        direction: touchesOut ? "out" : "in",
        evidence: evidenceForTarget(edge.id, ctx),
        walked: walk,
        children: walk
          ? expand(
              otherId,
              depth - 1,
              new Set([...pathNodes, otherId]),
              new Set([...pathEdges, edge.id]),
            )
          : [],
      });
    }
    // Trusted first, then by recency — the strongest explanation leads.
    steps.sort((a, b) => rank(a.state) - rank(b.state) || b.edge.createdAt - a.edge.createdAt);
    return steps;
  };

  return {
    root,
    rootEvidence: evidenceForTarget(nodeId, ctx),
    steps: expand(nodeId, ctx.maxDepth, new Set([nodeId]), new Set()),
    history: ctx.history,
  };
}

function rank(state: EdgeState): number {
  const order: EdgeState[] = [
    "trusted",
    "observed",
    "hypothesis",
    "stale",
    "claimed",
    "superseded",
    "refuted",
  ];
  const i = order.indexOf(state);
  return i === -1 ? 99 : i;
}

// ---- rendering ------------------------------------------------------------

const GLYPH: Record<EdgeState, string> = {
  trusted: "✓ trusted",
  observed: "· observed",
  hypothesis: "? hypothesis",
  stale: "⚠ stale",
  claimed: "~ claimed",
  superseded: "⤺ superseded",
  refuted: "✗ refuted",
};

const RELATION_PHRASE: Record<string, [string, string]> = {
  // [out phrasing, in phrasing]
  resolves: ["resolves", "resolved by"],
  addresses: ["addresses", "addressed by"],
  implements: ["implements", "implemented by"],
  supersedes: ["supersedes", "superseded by"],
  relates: ["relates to", "relates to"],
};

function phrase(step: WhyStep): string {
  const p = RELATION_PHRASE[step.edge.relation] ?? [step.edge.relation, step.edge.relation];
  return step.direction === "out" ? p[0] : p[1];
}

function tag(step: WhyStep): string {
  const bits = [GLYPH[step.state]];
  if (step.confidence < 1) bits.push(`conf ${step.confidence.toFixed(2)}`);
  if (!step.walked && !isHistoryOnly(step.state)) bits.push("not walked");
  return `[${bits.join(" · ")}]`;
}

export function renderWhy(result: WhyResult): string {
  const lines: string[] = [];
  lines.push(`why ${result.root.id}  "${result.root.title}"`);
  for (const ev of result.rootEvidence) {
    lines.push(`   • evidence: ${ev.node.evidenceKind ?? "note"} ${ev.node.id} (${ev.stance}) "${ev.node.title}"`);
  }

  const walk = (steps: WhyStep[], prefix: string): void => {
    steps.forEach((step, i) => {
      const last = i === steps.length - 1;
      const branch = last ? "└─" : "├─";
      const cont = last ? "   " : "│  ";
      lines.push(
        `${prefix}${branch} ${phrase(step)} → ${step.other.id} "${step.other.title}"  ${tag(step)}`,
      );
      for (const ev of step.evidence) {
        lines.push(
          `${prefix}${cont}   • ${ev.node.evidenceKind ?? "note"} ${ev.node.id} (${ev.stance}) "${ev.node.title}"`,
        );
      }
      walk(step.children, prefix + cont);
    });
  };
  walk(result.steps, "");

  if (result.steps.length === 0 && result.rootEvidence.length === 0) {
    lines.push("   (no causal history recorded yet)");
  }
  if (!result.history) {
    lines.push("");
    lines.push("— trusted chain only; run with history to see superseded / refuted edges —");
  }
  return lines.join("\n");
}
