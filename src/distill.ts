/**
 * Distillation — Project Memory's interpreter. This is the ONLY place meaning is
 * assigned. Producers hand over `events/0` facts (see protocol.ts); here, and
 * only here, do facts become issues, decisions, evidence, and (hypothesis-tier)
 * causal edges. Producers never express any of that.
 *
 * Everything produced starts at `observed` / `hypothesis` — never `trusted`.
 * Trust is still earned the one way it can be: defending evidence backing a
 * stated intent, judged by the constitution (lifecycle.ts).
 */
import type { ProjectMemory } from "./memory.js";
import type { FactualEvent } from "./protocol.js";
import type { EdgeState, EvidenceKind, MemoryNode, NodeType } from "./types.js";

export interface InterpretResult {
  createdNodes: number;
  createdEdges: number;
  attachedEvidence: number;
  transitions: Array<{ edge: string; from: EdgeState; to: EdgeState }>;
  log: string[];
}

export interface InterpretOptions {
  /** producer identity (namespaces derived ids so producers can't collide) */
  issuer?: string;
  /** did the event bundle's signature verify? stamped onto derived evidence */
  verified?: boolean;
}

// Which producer-native kinds map to which Project-Memory concept. This mapping
// is PM's, lives in PM, and can grow without any producer changing.
const ISSUE_KIND = /risk|issue|bug|incident|defect|problem|vuln/i;
const DECISION_KIND = /decision|adr|rationale|choice|chose|policy/i;
const OUTCOME_KIND = /test|benchmark|bench|perf|review|ci|check|verif|audit/i;
const TASK_KIND = /task|commit|pr|pull|patch|change|work|merge|fix/i;

// Ref keys a producer might use to point at each concept.
const ISSUE_REFS = ["issue", "risk", "bug", "incident", "defect"];
const DECISION_REFS = ["decision", "adr"];

type Concept = "issue" | "decision" | "task" | "outcome" | "note";

function conceptOf(kind: string): Concept {
  if (ISSUE_KIND.test(kind)) return "issue";
  if (DECISION_KIND.test(kind)) return "decision";
  if (OUTCOME_KIND.test(kind)) return "outcome";
  if (TASK_KIND.test(kind)) return "task";
  return "note";
}

function evidenceKindOf(kind: string): EvidenceKind {
  const k = kind.toLowerCase();
  if (/benchmark|bench|perf/.test(k)) return "benchmark";
  if (/review/.test(k)) return "review";
  if (/test|ci|check|verif|audit/.test(k)) return "test";
  if (/commit|patch|fix/.test(k)) return "commit";
  if (/pr|pull|merge/.test(k)) return "pr";
  if (/session/.test(k)) return "session";
  if (/attest|vouch/.test(k)) return "attestation";
  return "message";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function title(e: FactualEvent): string {
  const b = e.body ?? {};
  return str(b.title) ?? str(b.summary) ?? str(b.name) ?? e.id ?? e.kind;
}
function stanceOf(outcome: unknown): "supports" | "contradicts" {
  const o = String(outcome ?? "").toLowerCase();
  if (/fail|reject|changes-requested|error|regress|broke|worse/.test(o)) return "contradicts";
  return "supports";
}

/** The value that identifies the concept-node an event is about, or references. */
function identity(e: FactualEvent, concept: "issue" | "decision" | "task"): string | undefined {
  const refs = e.refs ?? {};
  const keys = concept === "issue" ? ISSUE_REFS : concept === "decision" ? DECISION_REFS : ["task", "commit", "pr", "change", "patch"];
  for (const k of keys) if (str(refs[k])) return refs[k];
  return e.id ?? e.contentHash;
}

export function interpretEvents(
  memory: ProjectMemory,
  events: FactualEvent[],
  opts: InterpretOptions = {},
): InterpretResult {
  const ns = opts.issuer ?? "local";
  const r: InterpretResult = { createdNodes: 0, createdEdges: 0, attachedEvidence: 0, transitions: [], log: [] };
  const ext = (concept: string, id: string): string => `${ns}/${concept}:${id}`;

  const ensureNode = (
    type: NodeType,
    externalKey: string,
    fields: { title: string; body?: string; evidenceKind?: EvidenceKind; ref?: string; signer?: string; verified?: boolean },
    at?: number,
  ): MemoryNode => {
    const existed = Boolean(memory.getNodeByExternalKey(externalKey));
    const node = memory.addNode({ type, externalKey, ...fields }, at);
    if (!existed) r.createdNodes += 1;
    return node;
  };

  // PASS 1 — create the primary concept node each event is *about*. No edges yet,
  // so cross-references resolve regardless of event order.
  for (const e of events) {
    const c = conceptOf(e.kind);
    if (c === "outcome" || c === "note") continue;
    const id = identity(e, c);
    if (!id) continue;
    if (c === "issue") ensureNode("issue", ext("issue", id), { title: title(e), body: str(e.body?.detail) ?? "" }, e.at);
    else if (c === "decision") ensureNode("decision", ext("decision", id), { title: title(e), body: str(e.body?.rationale) ?? str(e.body?.why) ?? "" }, e.at);
    else ensureNode("task", ext("task", id), { title: title(e), body: str(e.body?.detail) ?? "" }, e.at);
  }

  // PASS 2 — infer edges from refs, and fold outcome/note events into evidence.
  const evFor = (e: FactualEvent): MemoryNode => {
    const kind = evidenceKindOf(e.kind);
    const key = ext(`ev:${kind}`, e.id ?? e.contentHash ?? title(e));
    return ensureNode(
      "evidence",
      key,
      { title: title(e), evidenceKind: kind, ref: e.refs?.commit ?? e.refs?.pr ?? e.contentHash, signer: opts.issuer, verified: opts.verified },
      e.at,
    );
  };
  const attach = (evId: string, edgeId: string, stance: "supports" | "contradicts", e: FactualEvent): void => {
    const before = memory.edgeState(edgeId, e.at);
    const isNew = !memory.hasEvidenceLink(evId, edgeId, stance);
    const after = memory.addEvidence({ evidence: evId, target: edgeId, targetType: "edge", stance, actor: opts.issuer }, e.at);
    if (isNew) r.attachedEvidence += 1;
    if (after && after !== before) {
      r.transitions.push({ edge: edgeId, from: before, to: after });
      r.log.push(`${edgeId}: ${before} -> ${after} (${stance} ${e.kind})`);
    }
  };
  const addInferredEdge = (from: string, to: string, relation: "addresses" | "resolves" | "implements", intent: string | undefined, source: "observed" | "inferred", e: FactualEvent): string => {
    const existed = memory.outgoingEdges(from, relation).some((x) => x.to === to);
    const edge = memory.addEdge({ from, to, relation, intent, source }, e.at);
    if (!existed) r.createdEdges += 1;
    return edge.id;
  };

  const refsOf = (e: FactualEvent) => {
    const refs = e.refs ?? {};
    return {
      issueRef: ISSUE_REFS.map((k) => refs[k]).find(Boolean),
      decisionRef: DECISION_REFS.map((k) => refs[k]).find(Boolean),
    };
  };

  // PASS 2a — create every inferred edge from decision/task events, so that
  // outcome events (pass 2b) can bear on them regardless of event order.
  for (const e of events) {
    const c = conceptOf(e.kind);
    const { issueRef, decisionRef } = refsOf(e);
    if (c === "decision") {
      const dId = identity(e, "decision");
      const decision = dId && memory.getNodeByExternalKey(ext("decision", dId));
      if (decision && issueRef) {
        const issue = memory.getNodeByExternalKey(ext("issue", issueRef));
        if (issue) {
          const intent = str(e.body?.rationale) ?? str(e.body?.why) ?? (decision.body || undefined);
          addInferredEdge(decision.id, issue.id, "addresses", intent, "inferred", e);
        }
      }
    } else if (c === "task") {
      const tId = identity(e, "task");
      const task = tId && memory.getNodeByExternalKey(ext("task", tId));
      if (task) {
        const ev = evFor(e);
        if (issueRef) {
          const issue = memory.getNodeByExternalKey(ext("issue", issueRef));
          if (issue) attach(ev.id, addInferredEdge(task.id, issue.id, "resolves", undefined, "observed", e), "supports", e);
        }
        if (decisionRef) {
          const dec = memory.getNodeByExternalKey(ext("decision", decisionRef));
          if (dec) attach(ev.id, addInferredEdge(task.id, dec.id, "implements", undefined, "observed", e), "supports", e);
        }
      }
    }
  }

  // PASS 2b — fold outcome/note events onto the now-complete edge set.
  for (const e of events) {
    const c = conceptOf(e.kind);
    if (c === "outcome") {
      const { issueRef, decisionRef } = refsOf(e);
      const targets = new Set<string>();
      if (decisionRef) {
        const dec = memory.getNodeByExternalKey(ext("decision", decisionRef));
        if (dec) for (const edge of memory.outgoingEdges(dec.id, "addresses")) targets.add(edge.id);
      }
      if (issueRef) {
        const issue = memory.getNodeByExternalKey(ext("issue", issueRef));
        if (issue) for (const edge of memory.incomingEdges(issue.id, "addresses")) targets.add(edge.id);
      }
      if (targets.size === 0) {
        r.log.push(`skip ${e.kind} "${title(e)}": no edge to bear on`);
        continue;
      }
      const ev = evFor(e);
      const stance = stanceOf(e.body?.outcome);
      for (const edgeId of targets) attach(ev.id, edgeId, stance, e);
    } else if (c === "note") {
      // a bare fact — captured as evidence for the record, never invented into a claim
      evFor(e);
      r.log.push(`recorded ${e.kind} "${title(e)}" as evidence`);
    }
    // c === "issue": node created in pass 1; c === "decision"/"task": edges done in 2a.
  }

  return r;
}
