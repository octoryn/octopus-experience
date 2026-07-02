import { describe, expect, it } from "vitest";
import { ProjectMemory } from "../src/memory.js";
import type { Trace } from "../src/distill.js";

const T0 = 1_700_000_000_000;
const fresh = () => new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });

function seedHypothesis(m: ProjectMemory) {
  // an inferred causal claim with only an aligning commit behind it -> hypothesis
  m.remember({
    nodes: [
      { key: "i", type: "issue", title: "cache miss storms" },
      { key: "d", type: "decision", title: "add an L2 cache" },
      { key: "c", type: "evidence", title: "aa11 add l2", evidenceKind: "commit" },
    ],
    edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "L2 absorbs the misses" }],
    evidence: [{ evidence: "c", target: "e", stance: "supports" }],
  });
  return m;
}

describe("distillation — memory as a by-product of work", () => {
  it("a passing benchmark promotes a hypothesis to trusted", () => {
    const m = seedHypothesis(fresh());
    expect(m.edgeState("EDGE-1")).toBe("hypothesis");

    const traces: Trace[] = [
      { kind: "benchmark", ref: "run-9", title: "hit rate 40%->95%", outcome: "pass", mentions: ["add an L2 cache"] },
    ];
    const r = m.distill(traces);
    expect(m.edgeState("EDGE-1")).toBe("trusted");
    expect(r.transitions).toContainEqual({ edge: "EDGE-1", from: "hypothesis", to: "trusted" });
    m.close();
  });

  it("a failing test refutes / contests the claim", () => {
    const m = fresh();
    m.remember({
      nodes: [
        { key: "i", type: "issue", title: "startup slow" },
        { key: "d", type: "decision", title: "preload everything" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "preloading hides latency" }],
    });
    // bare claim, no support yet
    expect(m.edgeState("EDGE-1")).toBe("claimed");
    m.distill([{ kind: "test", ref: "t1", title: "startup still 4s", outcome: "fail", mentions: ["preload everything"] }]);
    expect(m.edgeState("EDGE-1")).toBe("refuted");
    m.close();
  });

  it("a commit referencing a known issue records observed provenance", () => {
    const m = fresh();
    m.remember({ nodes: [{ type: "issue", title: "flaky auth test" }] });
    const r = m.distill([
      { kind: "commit", ref: "bb22", title: "stabilize auth test clock", mentions: ["flaky auth test"] },
    ]);
    expect(r.createdEdges).toBe(1);
    // a task was created and resolves the issue, backed by the commit -> observed
    const task = m.search("stabilize auth test clock", "task")[0];
    expect(task).toBeTruthy();
    const edge = m.outgoingEdges(task.id, "resolves")[0];
    expect(m.edgeState(edge.id)).toBe("observed");
    m.close();
  });

  it("refuses to invent links it cannot ground (no silent fabrication)", () => {
    const m = fresh();
    const r = m.distill([{ kind: "commit", ref: "c9", title: "touch something unknown", mentions: ["nonexistent topic"] }]);
    expect(r.createdEdges).toBe(0);
    expect(r.createdNodes).toBe(0);
    expect(r.log.join(" ")).toMatch(/skip/);
    m.close();
  });

  it("is idempotent — re-distilling the same traces changes nothing", () => {
    const m = seedHypothesis(fresh());
    const traces: Trace[] = [
      { kind: "benchmark", ref: "run-9", title: "hit rate 40%->95%", outcome: "pass", mentions: ["add an L2 cache"] },
    ];
    m.distill(traces);
    const second = m.distill(traces);
    expect(second.transitions).toHaveLength(0);
    expect(second.createdNodes).toBe(0);
    expect(second.createdEdges).toBe(0);
    expect(second.attachedEvidence).toBe(0);
    m.close();
  });
});
