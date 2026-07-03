/**
 * Defensible-reasoning eval — the benchmark recall does NOT measure.
 *
 * Recall benchmarks (LongMemEval and friends) ask: *did the system retrieve the
 * fact?* They score a needle-in-a-haystack lookup. They cannot score whether a
 * causal claim is *earned* — whether evidence promoted it to `trusted`, whether a
 * contradiction *refuted* it, or whether a dead end is *kept out* of future
 * reasoning. That is exactly Experience's differentiator: evidence-gated trust and
 * negative knowledge.
 *
 * This module scores that. A scenario is a DECLARATIVE description of input facts
 * plus the trust outcomes those facts *should* produce. The runner ingests the
 * scenario through the real `ProjectMemory` API (no mocks, no internal reach-in),
 * recomputes trust, and asserts:
 *
 *   1. each named causal edge reached its expected lifecycle state
 *      (`trusted` / `refuted` / `stale` / `superseded` / `hypothesis` / ...),
 *   2. a refuted / superseded dead end is NOT re-walked by `why` — negative
 *      knowledge stays negative, so agents don't re-propose or re-traverse it.
 *
 * Zero runtime deps. Contributors add scenarios; the format is the contract.
 */
import { ProjectMemory } from "./memory.js";
import type { RememberInput } from "./memory.js";
import { generateActor } from "./protocol.js";
import { REFERENCE_SCENARIOS } from "./eval-scenarios.js";
import type { WhyResult, WhyStep } from "./why.js";
import type { EdgeState, EvidenceKind, EvidenceStance } from "./types.js";

export { REFERENCE_SCENARIOS };

/**
 * An expectation about ONE causal edge, keyed by the edge `key` used in the
 * scenario's `remember` block. This is the unit an eval scores.
 */
export interface EdgeExpectation {
  /** the edge `key` from the scenario's remember/edges */
  edge: string;
  /**
   * The lifecycle state the edge must reach. This is the core assertion: did the
   * evidence earn `trusted`, or did a contradiction drive `refuted`?
   */
  state: EdgeState;
  /**
   * When set, the edge must NOT be walked by a default `why` from the given
   * target — i.e. a dead end must not be re-traversed. Use for `refuted` /
   * `superseded` edges (negative knowledge). The value is a `why` target (a node
   * id or free-text) whose default chain must not walk through this edge.
   */
  notWalkedFrom?: string;
  /** optional human note explaining what this expectation encodes */
  note?: string;
}

/**
 * A step to apply AFTER the initial `remember`, expressed against the real API.
 * Edge/node references use scenario keys (resolved to ids by the runner) OR raw
 * ids. This keeps scenarios declarative while still exercising the full lifecycle
 * (supersession, decay, re-verification, human attestation, late evidence).
 */
export type ScenarioStep =
  | { op: "supersede"; oldEdge: string; newEdge: string; at?: number }
  | { op: "verify"; edge: string; at?: number }
  | { op: "attest"; edge: string; attester: string; signed?: boolean; at?: number }
  | {
      op: "addEvidence";
      evidenceKind: EvidenceKind;
      title: string;
      edge: string;
      stance?: EvidenceStance;
      at?: number;
    };

export interface Scenario {
  name: string;
  /** what this scenario proves — surfaced in reports */
  description: string;
  /** the facts, as a single remember() call. Edge `key`s are referenced by expectations. */
  remember: RememberInput;
  /** ordered follow-up operations (supersede / verify / attest / late evidence) */
  then?: ScenarioStep[];
  /**
   * The `now` at which trust is evaluated. Defaults to the scenario's `remember.at`
   * (or the memory clock). Set this ahead of ingestion to score DECAY.
   */
  evaluateAt?: number;
  /** the expected trust outcomes */
  expect: EdgeExpectation[];
}

export interface ExpectationResult {
  edge: string;
  kind: "state" | "notWalked";
  pass: boolean;
  expected: string;
  actual: string;
  note?: string;
}

export interface ScenarioResult {
  name: string;
  description: string;
  pass: boolean;
  results: ExpectationResult[];
  passed: number;
  failed: number;
}

export interface EvalReport {
  scenarios: ScenarioResult[];
  total: number;
  passed: number;
  failed: number;
  pass: boolean;
}

/** Does any walked path from `why` traverse `edgeId`? (Only walked steps count.) */
function edgeIsWalked(result: WhyResult, edgeId: string): boolean {
  const walk = (steps: WhyStep[]): boolean => {
    for (const s of steps) {
      if (s.edge.id === edgeId && s.walked) return true;
      if (s.walked && walk(s.children)) return true;
    }
    return false;
  };
  return walk(result.steps);
}

/** Run one scenario through the real API and score every expectation. */
export function runScenario(scenario: Scenario): ScenarioResult {
  const memory = new ProjectMemory({ dbPath: ":memory:" });
  try {
    return scoreScenario(memory, scenario);
  } finally {
    memory.close();
  }
}

function scoreScenario(memory: ProjectMemory, scenario: Scenario): ScenarioResult {
  // 1. Ingest the facts. remember() returns edges in input order, which lets us
  //    map each scenario edge `key` to the id the store assigned it.
  const remembered = memory.remember(scenario.remember);
  const edgeKeyToId = new Map<string, string>();
  const inputEdges = scenario.remember.edges ?? [];
  inputEdges.forEach((e, i) => {
    if (e.key) edgeKeyToId.set(e.key, remembered.edges[i].id);
  });
  const resolveEdge = (ref: string): string => edgeKeyToId.get(ref) ?? ref;

  // 2. Apply follow-up steps, in order, against the real API.
  for (const step of scenario.then ?? []) {
    applyStep(memory, step, resolveEdge);
  }

  const at = scenario.evaluateAt ?? scenario.remember.at;

  // 3. Score each expectation.
  const results: ExpectationResult[] = [];
  for (const exp of scenario.expect) {
    const edgeId = resolveEdge(exp.edge);

    // 3a. state assertion
    let actualState: string;
    try {
      actualState = memory.edgeState(edgeId, at);
    } catch (err) {
      actualState = `<error: ${(err as Error).message}>`;
    }
    results.push({
      edge: exp.edge,
      kind: "state",
      pass: actualState === exp.state,
      expected: exp.state,
      actual: actualState,
      note: exp.note,
    });

    // 3b. dead-end assertion: the edge must not be re-walked by default `why`.
    if (exp.notWalkedFrom !== undefined) {
      let walked: boolean;
      try {
        const why = memory.why(exp.notWalkedFrom, { now: at });
        walked = edgeIsWalked(why, edgeId);
      } catch (err) {
        walked = false; // an unreachable target trivially does not re-walk it
      }
      results.push({
        edge: exp.edge,
        kind: "notWalked",
        pass: !walked,
        expected: "not re-walked by why",
        actual: walked ? "RE-WALKED (dead end leaked into reasoning)" : "not re-walked",
        note: exp.note,
      });
    }
  }

  const failed = results.filter((r) => !r.pass).length;
  return {
    name: scenario.name,
    description: scenario.description,
    pass: failed === 0,
    results,
    passed: results.length - failed,
    failed,
  };
}

function applyStep(
  memory: ProjectMemory,
  step: ScenarioStep,
  resolveEdge: (ref: string) => string,
): void {
  switch (step.op) {
    case "supersede":
      memory.supersede(resolveEdge(step.oldEdge), resolveEdge(step.newEdge), step.at);
      return;
    case "verify":
      memory.verify(resolveEdge(step.edge), step.at);
      return;
    case "attest": {
      // A signed vouch is cryptographically attributable, so it can DEFEND an
      // edge to trusted; an unsigned vouch is inert (anyone could forge it).
      const attester = step.signed ? generateActor(step.attester) : step.attester;
      memory.attest(resolveEdge(step.edge), attester, "human attestation", step.at);
      return;
    }
    case "addEvidence": {
      const ev = memory.addNode(
        { type: "evidence", title: step.title, evidenceKind: step.evidenceKind },
        step.at,
      );
      memory.addEvidence(
        { evidence: ev.id, target: resolveEdge(step.edge), targetType: "edge", stance: step.stance ?? "supports" },
        step.at,
      );
      return;
    }
  }
}

/**
 * Run a set of scenarios and produce a pass/fail report. This is the public
 * entry point (also re-exported from `octopus-experience/eval`).
 *
 * Defaults to the bundled reference scenarios so `runEval()` with no args is a
 * complete, runnable benchmark.
 */
export function runEval(scenarios: Scenario[] = REFERENCE_SCENARIOS): EvalReport {
  const results = scenarios.map(runScenario);
  const passed = results.filter((r) => r.pass).length;
  return {
    scenarios: results,
    total: results.length,
    passed,
    failed: results.length - passed,
    pass: passed === results.length,
  };
}

/** Human-readable rendering of an eval report (for CLI / CI logs). */
export function renderEvalReport(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("Defensible-reasoning eval");
  lines.push("");
  for (const s of report.scenarios) {
    lines.push(`${s.pass ? "PASS" : "FAIL"}  ${s.name}  (${s.passed}/${s.results.length})`);
    lines.push(`      ${s.description}`);
    for (const r of s.results) {
      if (r.pass) continue;
      const label = r.kind === "state" ? `edge ${r.edge} state` : `edge ${r.edge} dead-end`;
      lines.push(`   ✗  ${label}: expected ${r.expected}, got ${r.actual}`);
    }
  }
  lines.push("");
  lines.push(
    `${report.passed}/${report.total} scenarios passed` +
      (report.pass ? "" : `  — ${report.failed} FAILED`),
  );
  return lines.join("\n");
}
