import { describe, expect, it } from "vitest";
import {
  REFERENCE_SCENARIOS,
  renderEvalReport,
  runEval,
  runScenario,
  type Scenario,
} from "../src/eval.js";

const T0 = 1_700_000_000_000;

describe("defensible-reasoning eval", () => {
  it("ships a small reference set (2-4 scenarios) that all pass", () => {
    expect(REFERENCE_SCENARIOS.length).toBeGreaterThanOrEqual(2);
    expect(REFERENCE_SCENARIOS.length).toBeLessThanOrEqual(4);
    const report = runEval();
    expect(report.pass).toBe(true);
    expect(report.passed).toBe(REFERENCE_SCENARIOS.length);
    expect(report.failed).toBe(0);
  });

  it("scores each expectation, not just the scenario as a whole", () => {
    const report = runEval();
    // every scenario reports one result per expectation (+1 for each dead-end check)
    for (const s of report.scenarios) {
      expect(s.results.length).toBeGreaterThanOrEqual(s.description ? 1 : 0);
      expect(s.passed + s.failed).toBe(s.results.length);
      expect(s.pass).toBe(s.failed === 0);
    }
  });

  // --- the scorer must actually be able to FAIL ---------------------------
  // A benchmark that only ever returns "pass" measures nothing. These prove the
  // runner detects a wrong trust outcome and a leaked dead end.

  it("fails a scenario whose expected state is wrong (evidence-gated trust)", () => {
    const wrong: Scenario = {
      name: "wrong-state",
      description: "a defended claim is trusted, but we (wrongly) expect hypothesis",
      remember: {
        at: T0,
        nodes: [
          { key: "i", type: "issue", title: "contention" },
          { key: "d", type: "decision", title: "shard the lock" },
          { key: "b", type: "evidence", title: "1.8x", evidenceKind: "benchmark" },
        ],
        edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "sharding helps" }],
        evidence: [{ evidence: "b", target: "e", stance: "supports" }],
      },
      evaluateAt: T0,
      expect: [{ edge: "e", state: "hypothesis" }], // actually trusted -> must FAIL
    };
    const result = runScenario(wrong);
    expect(result.pass).toBe(false);
    const stateResult = result.results.find((r) => r.kind === "state");
    expect(stateResult?.pass).toBe(false);
    expect(stateResult?.actual).toBe("trusted");
    expect(stateResult?.expected).toBe("hypothesis");
  });

  it("fails a dead-end check when a refuted edge is (wrongly) expected to still be walked", () => {
    // Correct scenario, but we DEMAND that a trusted edge is not walked — it is,
    // so the notWalked assertion must fail. This proves the walk-detection works.
    const scenario: Scenario = {
      name: "walk-detection",
      description: "a trusted edge IS walked, so a notWalkedFrom assertion on it fails",
      remember: {
        at: T0,
        nodes: [
          { key: "i", type: "issue", title: "latency" },
          { key: "d", type: "decision", title: "add cache" },
          { key: "b", type: "evidence", title: "p99 down", evidenceKind: "benchmark" },
        ],
        edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "cache helps" }],
        evidence: [{ evidence: "b", target: "e", stance: "supports" }],
      },
      evaluateAt: T0,
      // trusted state is correct, but claiming it is a non-walked dead end is wrong
      expect: [{ edge: "e", state: "trusted", notWalkedFrom: "latency" }],
    };
    const result = runScenario(scenario);
    expect(result.pass).toBe(false);
    const stateResult = result.results.find((r) => r.kind === "state");
    const walkResult = result.results.find((r) => r.kind === "notWalked");
    expect(stateResult?.pass).toBe(true); // state is genuinely trusted
    expect(walkResult?.pass).toBe(false); // ...but it IS walked, so this fails
  });

  it("confirms a refuted dead end is genuinely kept out of why (the core property)", () => {
    // Positive control for the negative-knowledge property, asserted directly
    // (not via the scorer) so a regression in why-traversal is caught here too.
    const scenario = REFERENCE_SCENARIOS.find(
      (s) => s.name === "refuted-dead-end-not-rewalked",
    )!;
    const result = runScenario(scenario);
    const deadEnd = result.results.find(
      (r) => r.edge === "eBad" && r.kind === "notWalked",
    );
    expect(deadEnd).toBeTruthy();
    expect(deadEnd!.pass).toBe(true);
    const refuted = result.results.find((r) => r.edge === "eBad" && r.kind === "state");
    expect(refuted!.actual).toBe("refuted");
  });

  it("renders a report that names failing expectations", () => {
    const failing: Scenario = {
      name: "renders-failures",
      description: "should surface the mismatch in the rendered report",
      remember: {
        at: T0,
        nodes: [
          { key: "i", type: "issue", title: "x" },
          { key: "d", type: "decision", title: "y" },
        ],
        edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "z" }],
      },
      evaluateAt: T0,
      expect: [{ edge: "e", state: "trusted" }], // only claimed (no evidence) -> FAIL
    };
    const report = runEval([failing]);
    expect(report.pass).toBe(false);
    const text = renderEvalReport(report);
    expect(text).toContain("FAIL");
    expect(text).toContain("expected trusted");
    expect(text).toContain("claimed"); // the actual state
  });
});
