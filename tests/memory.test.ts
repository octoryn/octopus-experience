import { beforeEach, describe, expect, it } from "vitest";
import { ProjectMemory } from "../src/memory.js";
import { DEFAULT_STALE_AFTER_MS } from "../src/lifecycle.js";

const T0 = 1_700_000_000_000;

function fresh(): ProjectMemory {
  return new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
}

describe("ProjectMemory — integration", () => {
  let m: ProjectMemory;
  beforeEach(() => {
    m = fresh();
  });

  it("remember: a claimed edge with an aligning commit is a hypothesis, not trusted", () => {
    const r = m.remember({
      nodes: [
        { key: "i", type: "issue", title: "Metal compiler crashes on M1 Ultra" },
        { key: "d", type: "decision", title: "Pad conv weights to 64 bytes" },
        { key: "c", type: "evidence", title: "abc123", evidenceKind: "commit" },
      ],
      edges: [
        { key: "e", from: "d", to: "i", relation: "addresses", intent: "padding fixes the crash" },
      ],
      evidence: [{ evidence: "c", target: "e", stance: "supports" }],
    });
    expect(r.edges[0].state).toBe("hypothesis");
  });

  it("defending evidence promotes hypothesis -> trusted, and why walks it", () => {
    const r = m.remember({
      nodes: [
        { key: "i", type: "issue", title: "KV cache lock contention" },
        { key: "d", type: "decision", title: "Shard the KV cache lock" },
        { key: "b", type: "evidence", title: "1.8x throughput", evidenceKind: "benchmark" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "sharding removes contention" }],
      evidence: [{ evidence: "b", target: "e", stance: "supports" }],
    });
    expect(r.edges[0].state).toBe("trusted");

    const why = m.why("KV cache");
    expect(why.root.id).toMatch(/^(ISSUE|DECISION)-/);
    const rendered = m.explain("Shard the KV cache lock");
    expect(rendered).toContain("trusted");
  });

  it("contradicting evidence with no support -> refuted, hidden from default why", () => {
    const r = m.remember({
      nodes: [
        { key: "d", type: "decision", title: "Disable the cache entirely" },
        { key: "i", type: "issue", title: "Latency spikes" },
        { key: "t", type: "evidence", title: "latency unchanged", evidenceKind: "test" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "cache was the cause" }],
      evidence: [{ evidence: "t", target: "e", stance: "contradicts" }],
    });
    expect(r.edges[0].state).toBe("refuted");

    const def = m.explain("Latency spikes");
    expect(def).not.toContain("Disable the cache");
    const hist = m.explain("Latency spikes", { history: true });
    expect(hist).toContain("refuted");
  });

  it("supersede: replaced edge leaves the default chain but is preserved in history", () => {
    m.remember({
      nodes: [
        { key: "old", type: "decision", title: "Use SQLite" },
        { key: "new", type: "decision", title: "Use Postgres" },
        { key: "i", type: "issue", title: "Storage engine" },
        { key: "b1", type: "evidence", title: "sqlite bench", evidenceKind: "benchmark" },
      ],
      edges: [
        { key: "eOld", from: "old", to: "i", relation: "addresses", intent: "local-first" },
        { key: "eNew", from: "new", to: "i", relation: "addresses", intent: "need concurrency" },
      ],
      evidence: [{ evidence: "b1", target: "eOld", stance: "supports" }],
    });
    const eOld = m.search("Use SQLite")[0];
    expect(eOld).toBeTruthy();

    // find the edge id for the old decision and supersede it
    // (edges created in order: EDGE-1 = eOld, EDGE-2 = eNew)
    m.supersede("EDGE-1", "EDGE-2");
    expect(m.edgeState("EDGE-1")).toBe("superseded");

    const def = m.explain("Storage engine");
    expect(def).not.toContain("Use SQLite");
    const hist = m.explain("Storage engine", { history: true });
    expect(hist).toContain("superseded");
  });

  it("decay then verify: trusted -> stale over time -> trusted again after re-verification", () => {
    m.remember({
      nodes: [
        { key: "d", type: "decision", title: "Prefer async IO" },
        { key: "i", type: "issue", title: "Throughput ceiling" },
        { key: "b", type: "evidence", title: "2x throughput", evidenceKind: "benchmark" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "async lifts the ceiling" }],
      evidence: [{ evidence: "b", target: "e", stance: "supports" }],
    });
    expect(m.edgeState("EDGE-1", T0)).toBe("trusted");

    const later = T0 + DEFAULT_STALE_AFTER_MS + 1;
    expect(m.edgeState("EDGE-1", later)).toBe("stale");

    m.verify("EDGE-1", later);
    expect(m.edgeState("EDGE-1", later)).toBe("trusted");
  });

  it("attest: a human vouch promotes a bare claim to trusted", () => {
    const r = m.remember({
      nodes: [
        { key: "d", type: "decision", title: "Keep the retry budget at 3" },
        { key: "i", type: "issue", title: "Flaky upstream" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "3 is empirically enough" }],
    });
    expect(r.edges[0].state).toBe("claimed");
    expect(m.attest("EDGE-1", "ran")).toBe("trusted");
  });

  it("evidence nodes require a kind", () => {
    expect(() =>
      m.remember({ nodes: [{ type: "evidence", title: "oops" }] }),
    ).toThrow(/evidenceKind/);
  });
});
