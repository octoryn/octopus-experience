/**
 * Distillation — the layer that makes memory a *by-product of work*.
 *
 * Agents (or the Blackboard bridge) hand the distiller raw observed traces:
 * commits, tests, benchmarks, reviews, messages. The distiller proposes nodes
 * and edges from them — but ONLY ever at the `observed` / `hypothesis` tier,
 * plus supporting/contradicting evidence. It never fabricates a `trusted` edge.
 * Trust is still earned the one way it can be: defending evidence backing a
 * stated intent. So distillation is "the agent proposes, the system proves" made
 * automatic.
 *
 * Every rule is transparent: it logs what it matched and, crucially, what it
 * SKIPPED (an unresolved mention is never silently turned into a fact). Noise is
 * worse than nothing, so the distiller refuses to invent links it can't ground.
 */
import type { ProjectMemory } from "./memory.js";
import type { EdgeState, EvidenceKind, EvidenceStance, MemoryNode } from "./types.js";

export interface Trace {
  /** the artifact kind — commit/test/benchmark/pr/review/message/session */
  kind: EvidenceKind;
  /** stable ref (sha, PR url, run id); used to make the evidence idempotent */
  ref?: string;
  /** commit message, test name, review summary, ... */
  title: string;
  actor?: string;
  at?: number;
  /** ids or text of existing nodes this trace is about (e.g. "ISSUE-1", "metal crash") */
  mentions?: string[];
  /** for test/benchmark/review: pass/approve vs fail/reject */
  outcome?: "pass" | "fail";
  /** attach directly to a specific edge instead of resolving via mentions */
  targetEdge?: string;
}

export interface DistillResult {
  createdNodes: number;
  createdEdges: number;
  attachedEvidence: number;
  /** edges whose state moved as a result (e.g. hypothesis -> trusted, -> refuted) */
  transitions: Array<{ edge: string; from: EdgeState; to: EdgeState }>;
  /** human-readable log — what each trace did, and what it skipped and why */
  log: string[];
}

const MECHANISM_OUTCOME: Record<"pass" | "fail", EvidenceStance> = {
  pass: "supports",
  fail: "contradicts",
};

export class Distiller {
  constructor(private readonly memory: ProjectMemory) {}

  run(traces: Trace[]): DistillResult {
    const result: DistillResult = {
      createdNodes: 0,
      createdEdges: 0,
      attachedEvidence: 0,
      transitions: [],
      log: [],
    };
    for (const trace of traces) {
      if (trace.outcome || trace.targetEdge) this.outcomeRule(trace, result);
      else this.provenanceRule(trace, result);
    }
    return result;
  }

  /**
   * A test / benchmark / review outcome becomes supporting or contradicting
   * evidence on the edges it bears on — the rule that actually promotes a
   * hypothesis to trusted, or refutes a wrong idea.
   */
  private outcomeRule(trace: Trace, r: DistillResult): void {
    const stance = trace.outcome ? MECHANISM_OUTCOME[trace.outcome] : "supports";
    const targets = this.resolveOutcomeTargets(trace);
    if (targets.length === 0) {
      r.log.push(`skip ${trace.kind} "${trace.title}": no edge to attach to`);
      return;
    }
    const ev = this.ensureEvidence(trace, r);
    for (const edgeId of targets) {
      const before = this.memory.edgeState(edgeId, trace.at);
      const isNew = !this.memory.hasEvidenceLink(ev.id, edgeId, stance);
      const after = this.memory.addEvidence(
        { evidence: ev.id, target: edgeId, targetType: "edge", stance, actor: trace.actor },
        trace.at,
      );
      if (isNew) r.attachedEvidence += 1;
      if (after && after !== before) {
        r.transitions.push({ edge: edgeId, from: before, to: after });
        r.log.push(`${edgeId}: ${before} -> ${after}  (${stance} ${trace.kind})`);
      }
    }
  }

  /**
   * A commit / PR that references an issue or a decision records that work
   * happened: a task node plus an `observed` provenance edge, grounded by the
   * commit itself. No intent is invented — provenance is fact, not a causal claim.
   */
  private provenanceRule(trace: Trace, r: DistillResult): void {
    // Only issue/decision/task nodes can anchor a provenance edge; a mention that
    // resolves to an evidence artifact (or nothing) is not something to build on.
    const refs = (trace.mentions ?? [])
      .map((m) => this.resolveNode(m))
      .filter((n): n is MemoryNode => Boolean(n) && n!.type !== "evidence");
    if (refs.length === 0) {
      r.log.push(`skip ${trace.kind} "${trace.title}": nothing it references is known yet`);
      return;
    }
    const taskKey = trace.ref ? `task:${trace.ref}` : `task:${trace.title}`;
    const existedBefore = Boolean(this.memory.getNodeByExternalKey(taskKey));
    const task = this.memory.addNode(
      { type: "task", title: trace.title, externalKey: taskKey, actor: trace.actor },
      trace.at,
    );
    if (!existedBefore) r.createdNodes += 1;

    const ev = this.ensureEvidence(trace, r);
    for (const ref of refs) {
      const relation = ref.type === "decision" ? "implements" : "resolves";
      const before = this.memory.outgoingEdges(task.id, relation).some((e) => e.to === ref.id);
      const edge = this.memory.addEdge(
        { from: task.id, to: ref.id, relation, source: "observed", actor: trace.actor },
        trace.at,
      );
      if (!before) r.createdEdges += 1;
      const newLink = !this.memory.hasEvidenceLink(ev.id, edge.id, "supports");
      this.memory.addEvidence(
        { evidence: ev.id, target: edge.id, targetType: "edge", stance: "supports", actor: trace.actor },
        trace.at,
      );
      if (newLink) r.attachedEvidence += 1;
      r.log.push(`${task.id} -${relation}-> ${ref.id}  [${this.memory.edgeState(edge.id, trace.at)}]`);
    }
  }

  // ---- helpers ------------------------------------------------------------

  private resolveOutcomeTargets(trace: Trace): string[] {
    if (trace.targetEdge) return [trace.targetEdge];
    const out = new Set<string>();
    for (const m of trace.mentions ?? []) {
      const node = this.resolveNode(m);
      if (!node) continue;
      if (node.type === "decision") {
        for (const e of this.memory.outgoingEdges(node.id, "addresses")) out.add(e.id);
      } else if (node.type === "issue") {
        for (const e of this.memory.incomingEdges(node.id, "addresses")) out.add(e.id);
      }
    }
    return [...out];
  }

  /** Resolve a mention to an existing node — never invents one. */
  private resolveNode(mention: string): MemoryNode | undefined {
    const direct = this.memory.getNode(mention);
    if (direct) return direct;
    const hits = this.memory.search(mention);
    return hits.find((n) => n.type !== "evidence") ?? hits[0];
  }

  private ensureEvidence(trace: Trace, r: DistillResult): MemoryNode {
    const key = `ev:${trace.kind}:${trace.ref ?? trace.title}`;
    const existed = Boolean(this.memory.getNodeByExternalKey(key));
    const node = this.memory.addNode(
      {
        type: "evidence",
        title: trace.title,
        evidenceKind: trace.kind as EvidenceKind,
        ref: trace.ref,
        externalKey: key,
        actor: trace.actor,
      },
      trace.at,
    );
    if (!existed) r.createdNodes += 1;
    return node;
  }
}
