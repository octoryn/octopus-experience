/**
 * ProjectMemory — the high-level API over the store + the lifecycle engine.
 *
 * Design decision (dogfooded as DECISION in scripts/demo.ts): trust is never
 * persisted. `edgeState` recomputes it from evidence + `now` on every read, so
 * decay and re-verification need no background job.
 */
import { resolveConfig, type StoreConfig } from "./config.js";
import { Store } from "./db.js";
import {
  computeEdgeState,
  confidence,
  isPrescriptive,
  type LifecycleOptions,
} from "./lifecycle.js";
import { reconstructWhy, renderWhy, type WhyOptions, type WhyResult } from "./why.js";
import type {
  EdgeRelation,
  EdgeState,
  EvidenceKind,
  EvidenceStance,
  MemoryEdge,
  MemoryNode,
  NodeType,
  WriteSource,
} from "./types.js";

export interface NodeInput {
  /** local handle so edges/evidence in the same call can reference it */
  key?: string;
  type: NodeType;
  title: string;
  body?: string;
  actor?: string;
  /** evidence-only */
  evidenceKind?: EvidenceKind;
  ref?: string;
}

export interface EdgeInput {
  key?: string;
  from: string; // node key (this call) or existing node id
  to: string;
  relation: EdgeRelation;
  intent?: string;
  source?: WriteSource;
  actor?: string;
}

export interface EvidenceInput {
  /** evidence node: key (this call) or existing id */
  evidence: string;
  /** target: edge key/id or node key/id */
  target: string;
  targetType?: "edge" | "node";
  stance?: EvidenceStance;
  actor?: string;
}

export interface RememberInput {
  nodes?: NodeInput[];
  edges?: EdgeInput[];
  evidence?: EvidenceInput[];
  actor?: string;
  /** creation timestamp (defaults to now); useful for seeding/simulation */
  at?: number;
}

export interface RememberResult {
  nodes: MemoryNode[];
  edges: Array<MemoryEdge & { state: EdgeState }>;
}

export interface EdgeView extends MemoryEdge {
  state: EdgeState;
  confidence: number;
}

export class ProjectMemory {
  private readonly store: Store;
  private readonly clock: () => number;
  readonly lifecycle: Omit<LifecycleOptions, "now">;

  constructor(
    config?: Partial<StoreConfig>,
    opts?: { clock?: () => number; lifecycle?: Omit<LifecycleOptions, "now"> },
  ) {
    this.store = new Store(resolveConfig(config).dbPath);
    this.clock = opts?.clock ?? (() => Date.now());
    this.lifecycle = opts?.lifecycle ?? {};
  }

  close(): void {
    this.store.close();
  }

  // ---- writes -------------------------------------------------------------

  addNode(input: NodeInput, at?: number): MemoryNode {
    const type = input.type;
    if (type === "evidence" && !input.evidenceKind) {
      throw new Error("evidence nodes require an evidenceKind");
    }
    const prefix = ID_PREFIX[type];
    const node: MemoryNode = {
      id: this.store.nextNodeId(prefix, type),
      type,
      title: input.title,
      body: input.body ?? "",
      createdAt: at ?? this.clock(),
      actor: input.actor,
      evidenceKind: input.evidenceKind,
      ref: input.ref,
      // a decision is a prescription: it starts life "verified now"
      lastVerified: type === "decision" ? (at ?? this.clock()) : undefined,
    };
    this.store.insertNode(node);
    return node;
  }

  addEdge(input: EdgeInput, at?: number): MemoryEdge {
    const from = this.mustNode(input.from);
    const to = this.mustNode(input.to);
    if (from.type === "evidence" || to.type === "evidence") {
      throw new Error(
        "edges connect issue/decision/task nodes; attach evidence with addEvidence",
      );
    }
    const now = at ?? this.clock();
    const edge: MemoryEdge = {
      id: this.store.nextId("edges", "EDGE"),
      from: from.id,
      to: to.id,
      relation: input.relation,
      intent: input.intent,
      source: input.source ?? (input.intent ? "claimed" : "inferred"),
      actor: input.actor,
      createdAt: now,
      updatedAt: now,
      lastVerified: now,
    };
    this.store.insertEdge(edge);
    return edge;
  }

  addEvidence(input: EvidenceInput, at?: number): EdgeState | undefined {
    const evNode = this.mustNode(input.evidence);
    if (evNode.type !== "evidence") {
      throw new Error(`node ${evNode.id} is not evidence`);
    }
    const targetType = input.targetType ?? "edge";
    const targetId =
      targetType === "edge"
        ? this.mustEdge(input.target).id
        : this.mustNode(input.target).id;
    const now = at ?? this.clock();
    this.store.insertLink({
      id: this.store.nextId("evidence_links", "LINK"),
      evidenceId: evNode.id,
      targetType,
      targetId,
      stance: input.stance ?? "supports",
      actor: input.actor,
      createdAt: now,
    });
    // Fresh supporting evidence re-verifies the edge (resets decay clock).
    if (targetType === "edge" && (input.stance ?? "supports") === "supports") {
      this.store.touchEdgeVerified(targetId, now);
    }
    return targetType === "edge" ? this.edgeState(targetId, now) : undefined;
  }

  /** Convenience: a human vouches for an edge — a first-class, attributed evidence kind. */
  attest(
    edgeId: string,
    actor: string,
    note = "human attestation",
    at?: number,
  ): EdgeState {
    const now = at ?? this.clock();
    const ev = this.addNode(
      { type: "evidence", title: note, evidenceKind: "attestation", actor },
      now,
    );
    this.addEvidence(
      { evidence: ev.id, target: edgeId, targetType: "edge", stance: "supports", actor },
      now,
    );
    return this.edgeState(edgeId, now);
  }

  /** Record that a newer edge (usually a decision) replaces an older one. */
  supersede(oldEdgeId: string, newEdgeId: string, at?: number): void {
    this.mustEdge(oldEdgeId);
    this.mustEdge(newEdgeId);
    this.store.setEdgeSuperseded(oldEdgeId, newEdgeId, at ?? this.clock());
  }

  /**
   * Re-confirm a prescription still applies today — revives stale -> trusted.
   * Facts are immutable ("history is never wrong"), so verifying a factual edge
   * is a no-op that simply returns its current state without rewriting the ledger.
   */
  verify(edgeId: string, at?: number): EdgeState {
    const now = at ?? this.clock();
    const edge = this.mustEdge(edgeId);
    if (!isPrescriptive(edge)) return this.edgeState(edge.id, now);
    this.store.touchEdgeVerified(edge.id, now);
    if (this.store.getNode(edge.from)?.type === "decision")
      this.store.touchNodeVerified(edge.from, now);
    if (this.store.getNode(edge.to)?.type === "decision")
      this.store.touchNodeVerified(edge.to, now);
    return this.edgeState(edge.id, now);
  }

  remember(input: RememberInput): RememberResult {
    const at = input.at ?? this.clock();
    const keyToId = new Map<string, string>();
    const nodes: MemoryNode[] = [];

    for (const n of input.nodes ?? []) {
      const created = this.addNode({ actor: input.actor, ...n }, at);
      if (n.key) keyToId.set(n.key, created.id);
      nodes.push(created);
    }

    const resolve = (ref: string): string => keyToId.get(ref) ?? ref;

    const edges: Array<MemoryEdge & { state: EdgeState }> = [];
    for (const e of input.edges ?? []) {
      const created = this.addEdge(
        { ...e, from: resolve(e.from), to: resolve(e.to), actor: e.actor ?? input.actor },
        at,
      );
      if (e.key) keyToId.set(e.key, created.id);
      edges.push({ ...created, state: this.edgeState(created.id, at) });
    }

    for (const ev of input.evidence ?? []) {
      this.addEvidence(
        {
          ...ev,
          evidence: resolve(ev.evidence),
          target: resolve(ev.target),
          actor: ev.actor ?? input.actor,
        },
        at,
      );
    }

    // states may have shifted once evidence landed — recompute
    return {
      nodes,
      edges: edges.map((e) => ({ ...e, state: this.edgeState(e.id, at) })),
    };
  }

  // ---- reads --------------------------------------------------------------

  private opts(now?: number): LifecycleOptions {
    return { now: now ?? this.clock(), ...this.lifecycle };
  }

  edgeState(edgeId: string, now?: number): EdgeState {
    const edge = this.mustEdge(edgeId);
    return computeEdgeState(edge, this.store.allLinks(), this.nodeMap(), this.opts(now));
  }

  edgeView(edgeId: string, now?: number): EdgeView {
    const edge = this.mustEdge(edgeId);
    const nodeById = this.nodeMap();
    const o = this.opts(now);
    return {
      ...edge,
      state: computeEdgeState(edge, this.store.allLinks(), nodeById, o),
      confidence: confidence(edge, o),
    };
  }

  why(target: string, opts?: WhyOptions & { now?: number }): WhyResult {
    const nodeId = this.resolveTarget(target);
    return reconstructWhy(nodeId, {
      nodes: this.nodeMap(),
      edges: this.store.allEdges(),
      links: this.store.allLinks(),
      lifecycle: this.opts(opts?.now),
      history: opts?.history ?? false,
      maxDepth: opts?.maxDepth ?? 6,
    });
  }

  explain(target: string, opts?: WhyOptions & { now?: number }): string {
    return renderWhy(this.why(target, opts));
  }

  search(query: string, type?: NodeType): MemoryNode[] {
    return this.store.searchNodes(query, type);
  }

  getNode(id: string): MemoryNode | undefined {
    return this.store.getNode(id);
  }

  isPrescriptive(edgeId: string): boolean {
    return isPrescriptive(this.mustEdge(edgeId));
  }

  // ---- helpers ------------------------------------------------------------

  private nodeMap(): Map<string, MemoryNode> {
    const m = new Map<string, MemoryNode>();
    for (const n of this.store.allNodes()) m.set(n.id, n);
    return m;
  }

  private mustNode(idOrKey: string): MemoryNode {
    const n = this.store.getNode(idOrKey);
    if (!n) throw new Error(`no such node: ${idOrKey}`);
    return n;
  }

  private mustEdge(id: string): MemoryEdge {
    const e = this.store.getEdge(id);
    if (!e) throw new Error(`no such edge: ${id}`);
    return e;
  }

  /**
   * Resolve a `why` target: an explicit id is honoured as-is; otherwise a text
   * query is matched to the best node, preferring causal nodes
   * (issue/decision/task) over evidence artifacts, which carry no causal chain.
   */
  private resolveTarget(target: string): string {
    if (this.store.getNode(target)) return target;
    const hits = this.store.searchNodes(target);
    if (hits.length === 0) throw new Error(`nothing matches "${target}"`);
    const causal = hits.find((n) => n.type !== "evidence");
    return (causal ?? hits[0]).id;
  }
}

const ID_PREFIX: Record<NodeType, string> = {
  issue: "ISSUE",
  decision: "DECISION",
  task: "TASK",
  evidence: "EV",
};
