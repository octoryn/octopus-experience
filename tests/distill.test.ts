import { describe, expect, it } from "vitest";
import { ProjectMemory } from "../src/memory.js";
import type { FactualEvent } from "../src/protocol.js";

const T0 = 1_700_000_000_000;
const fresh = () => new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });

// Facts a producer might emit — no node types, no edges, no stance, no trust.
const metalFacts: FactualEvent[] = [
  { kind: "risk", id: "R1", body: { title: "Metal compiler crashes on M1" } },
  { kind: "decision", id: "D1", refs: { risk: "R1" }, body: { title: "Pad conv weights to 64 bytes", rationale: "misalignment crashes the compiler" } },
];

describe("interpretation — facts become the graph (only in PM)", () => {
  it("derives issue + decision nodes and infers a hypothesis addresses edge", () => {
    const m = fresh();
    const r = m.ingestEvents(metalFacts);
    expect(r.createdNodes).toBe(2);
    const issue = m.search("Metal compiler", "issue")[0];
    const decision = m.search("Pad conv weights", "decision")[0];
    expect(issue && decision).toBeTruthy();
    const edge = m.outgoingEdges(decision.id, "addresses").find((e) => e.to === issue.id);
    expect(edge).toBeTruthy();
    // inferred, defended by nothing yet -> a claim/hypothesis, never trusted
    expect(m.edgeState(edge!.id)).toBe("claimed");
    m.close();
  });

  it("a passing benchmark fact promotes the inferred edge to trusted; why walks it", () => {
    const m = fresh();
    m.ingestEvents([
      ...metalFacts,
      { kind: "benchmark", id: "B1", refs: { decision: "D1" }, body: { title: "1.8x, 0 crashes", outcome: "pass" } },
    ]);
    const decision = m.search("Pad conv weights", "decision")[0];
    const edge = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(edge.id)).toBe("trusted");
    expect(m.explain("Pad conv weights to 64 bytes")).toContain("trusted");
    m.close();
  });

  it("a failing test fact refutes the inferred edge", () => {
    const m = fresh();
    m.ingestEvents([
      ...metalFacts,
      { kind: "test", id: "T1", refs: { risk: "R1" }, body: { title: "still crashes", outcome: "fail" } },
    ]);
    const decision = m.search("Pad conv weights", "decision")[0];
    const edge = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(edge.id)).toBe("refuted");
    m.close();
  });

  it("a commit fact records observed provenance backed by the commit", () => {
    const m = fresh();
    m.ingestEvents([
      ...metalFacts,
      { kind: "commit", id: "abc123", refs: { risk: "R1" }, body: { title: "pad weights" } },
    ]);
    const task = m.search("pad weights", "task")[0];
    expect(task).toBeTruthy();
    const edge = m.outgoingEdges(task.id, "resolves")[0];
    expect(m.edgeState(edge.id)).toBe("observed");
    m.close();
  });

  it("an unknown kind is captured as evidence, never invented into a claim", () => {
    const m = fresh();
    const r = m.ingestEvents([{ kind: "note", id: "n1", body: { title: "MPSGraph compile is 30-40 min" } }]);
    expect(r.createdEdges).toBe(0);
    expect(m.search("MPSGraph", "evidence").length).toBe(1);
    m.close();
  });

  it("promotes correctly even when the outcome event precedes its decision in the bundle", () => {
    const m = fresh();
    // benchmark listed BEFORE the decision/risk it bears on — event order is not causal
    m.ingestEvents([
      { kind: "benchmark", id: "B1", refs: { decision: "D1" }, body: { title: "1.8x, 0 crashes", outcome: "pass" } },
      { kind: "risk", id: "R1", body: { title: "Metal compiler crashes on M1" } },
      { kind: "decision", id: "D1", refs: { risk: "R1" }, body: { title: "Pad conv weights to 64 bytes", rationale: "alignment" } },
    ]);
    const decision = m.search("Pad conv weights", "decision")[0];
    const edge = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(edge.id)).toBe("trusted");
    m.close();
  });

  it("is idempotent — re-ingesting the same facts changes nothing", () => {
    const m = fresh();
    m.ingestEvents(metalFacts);
    const again = m.ingestEvents(metalFacts);
    expect(again.createdNodes).toBe(0);
    expect(again.createdEdges).toBe(0);
    m.close();
  });
});
