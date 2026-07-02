import { describe, expect, it } from "vitest";
import { ProjectMemory } from "../src/memory.js";

const T0 = 1_700_000_000_000;

function seeded(): ProjectMemory {
  const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
  // trusted decision
  m.remember({
    nodes: [
      { key: "i", type: "issue", title: "cache thrash" },
      { key: "d", type: "decision", title: "add a cache tier" },
      { key: "b", type: "evidence", title: "bench 3x", evidenceKind: "benchmark" },
    ],
    edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "tiering absorbs load" }],
    evidence: [{ evidence: "b", target: "e", stance: "supports" }],
  });
  // refuted decision on the same issue
  m.remember({
    nodes: [
      { key: "d2", type: "decision", title: "drop the cache entirely" },
      { key: "t", type: "evidence", title: "latency got worse", evidenceKind: "test" },
    ],
    edges: [{ key: "e2", from: "d2", to: "ISSUE-1", relation: "addresses", intent: "the cache is the problem" }],
    evidence: [{ evidence: "t", target: "e2", stance: "contradicts" }],
  });
  return m;
}

describe("ask + digest", () => {
  it("ask ranks decisions first and annotates trust", () => {
    const m = seeded();
    const res = m.ask("cache");
    expect(res.hits[0].node.type).toBe("decision");
    const tiered = res.hits.find((h) => h.node.title === "add a cache tier");
    expect(tiered?.state).toBe("trusted");
    m.close();
  });

  it("digest separates what we trust from the dead ends we refuted", () => {
    const m = seeded();
    const d = m.digest("cache");
    expect(d.trusted.map((n) => n.title)).toContain("add a cache tier");
    expect(d.deadEnds.map((n) => n.title)).toContain("drop the cache entirely");
    m.close();
  });

  it("renders a readable brief", () => {
    const m = seeded();
    const text = m.digestText("cache");
    expect(text).toContain("What we do (trusted)");
    expect(text).toContain("Dead ends — do NOT retry");
    m.close();
  });
});
