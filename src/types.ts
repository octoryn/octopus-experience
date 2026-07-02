/**
 * Project Memory — core domain types.
 *
 * The model is deliberately tiny: three stable node types (issue / decision /
 * evidence) plus `task` as an append-only provenance anchor. "Knowledge" is NOT
 * a stored type — it is the result of a `why` query.
 *
 * The product's whole discipline lives in one place: an edge only becomes
 * `trusted` when a claimed *intent* and a defending *mechanism* line up and
 * carry provenance. Everything else stays a hypothesis. See src/lifecycle.ts.
 */

export type NodeType = "issue" | "decision" | "task" | "evidence";

/** Directed relations between non-evidence nodes. The ontology is closed. */
export type EdgeRelation =
  | "resolves" // task -> issue      (a task resolved an issue; factual)
  | "addresses" // decision -> issue (a decision answers an issue; prescriptive)
  | "implements" // task -> decision (a task carried out a decision; factual)
  | "supersedes" // decision -> decision (a newer decision replaced an older one)
  | "relates"; // generic weak link

export type EvidenceStance = "supports" | "contradicts";

export type WriteSource =
  | "observed" // system captured it directly (commit/diff/test/message/session)
  | "inferred" // distillation induced it from observed traces
  | "claimed"; // an agent asserted intent

/**
 * Artifact kinds carried by evidence nodes. Split into two tiers by how much
 * they license:
 *  - DEFENDING kinds *demonstrate* the mechanism (a test goes green, a
 *    benchmark moves, a human vouches). They can promote an edge to `trusted`.
 *  - ALIGNING kinds are circumstantial (a commit exists, a message was sent).
 *    They can only raise an edge to `hypothesis` / `observed`.
 */
export type EvidenceKind =
  | "commit"
  | "diff"
  | "test"
  | "benchmark"
  | "pr"
  | "review"
  | "message"
  | "session"
  | "attestation";

export const DEFENDING_KINDS: ReadonlySet<EvidenceKind> = new Set([
  "test",
  "benchmark",
  "review",
  "attestation",
]);

export const ALIGNING_KINDS: ReadonlySet<EvidenceKind> = new Set([
  "commit",
  "diff",
  "pr",
  "message",
  "session",
]);

/**
 * The edge lifecycle — the "constitution".
 *  - claimed:     intent only, no supporting evidence
 *  - observed:    mechanism evidence, but no stated intent
 *  - hypothesis:  intent + aligning trace, not yet defended
 *  - trusted:     intent + defending mechanism, provenance-backed
 *  - stale:       was trustworthy; contradicted or decayed (history true, current use unsure)
 *  - superseded:  explicitly replaced by a newer decision (history preserved)
 *  - refuted:     contradicting evidence with no defense (proven false; kept as negative knowledge)
 */
export type EdgeState =
  | "claimed"
  | "observed"
  | "hypothesis"
  | "trusted"
  | "stale"
  | "superseded"
  | "refuted";

export interface MemoryNode {
  id: string; // ISSUE-1, DECISION-2, TASK-3, EV-4
  type: NodeType;
  title: string;
  body: string;
  createdAt: number; // epoch ms
  actor?: string; // who recorded it
  /**
   * Stable identity from the source system (e.g. "bb:decision:D-9", a commit
   * sha, an issue-tracker key). Unique when set — re-ingesting the same source
   * record reuses the node instead of duplicating it, which makes distillation
   * idempotent.
   */
  externalKey?: string;
  /** decision-only: when the prescription was last confirmed to still apply */
  lastVerified?: number;
  /** evidence-only */
  evidenceKind?: EvidenceKind;
  ref?: string; // commit sha, PR url, benchmark id, ...
  /** evidence-only, provenance protocol: who issued it (actor id) and whether its signature verified */
  signer?: string;
  /** true when this evidence arrived in a bundle whose signature verified */
  verified?: boolean;
  /** sha256 of the evidence content (protocol integrity / dedup) */
  contentHash?: string;
}

export interface MemoryEdge {
  id: string; // EDGE-1
  from: string; // node id
  to: string; // node id
  relation: EdgeRelation;
  /** the Claimed "because ..." — the intent axis. Never provable from artifacts. */
  intent?: string;
  source: WriteSource;
  actor?: string;
  /** set when a newer decision explicitly replaces this edge's claim */
  supersededBy?: string; // edge id
  createdAt: number;
  updatedAt: number;
  /** when this edge's supporting evidence was last confirmed (drives decay) */
  lastVerified?: number;
}

export interface EvidenceLink {
  id: string; // LINK-1
  evidenceId: string; // -> MemoryNode(type=evidence)
  targetType: "edge" | "node";
  targetId: string;
  stance: EvidenceStance;
  actor?: string;
  createdAt: number;
}
