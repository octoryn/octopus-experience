import { describe, expect, it } from "vitest";
import { ProjectMemory } from "../src/memory.js";

const T0 = 1_700_000_000_000;

function fresh(): ProjectMemory {
  return new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
}

describe("why traversal — regression for the adversarial review", () => {
  it("diamond graph: both parents of a shared node keep their own trusted provenance (finding #1)", () => {
    const m = fresh();
    // ISSUE <- A addresses, ISSUE <- B addresses; a shared TASK implements both.
    m.remember({
      nodes: [
        { key: "i", type: "issue", title: "Root perf issue" },
        { key: "a", type: "decision", title: "Approach A" },
        { key: "b", type: "decision", title: "Approach B" },
        { key: "ba", type: "evidence", title: "A bench", evidenceKind: "benchmark" },
        { key: "bb", type: "evidence", title: "B bench", evidenceKind: "benchmark" },
        { key: "c", type: "evidence", title: "shared commit", evidenceKind: "commit" },
        { key: "t", type: "task", title: "Shared task" },
      ],
      edges: [
        { key: "ea", from: "a", to: "i", relation: "addresses", intent: "A helps" },
        { key: "eb", from: "b", to: "i", relation: "addresses", intent: "B helps" },
        { key: "eta", from: "t", to: "a", relation: "implements", source: "observed" },
        { key: "etb", from: "t", to: "b", relation: "implements", source: "observed" },
      ],
      evidence: [
        { evidence: "ba", target: "ea", stance: "supports" },
        { evidence: "bb", target: "eb", stance: "supports" },
        { evidence: "c", target: "eta", stance: "supports" },
        { evidence: "c", target: "etb", stance: "supports" },
      ],
    });

    const why = m.why("Root perf issue");
    const topLevel = why.steps.map((s) => s.other.title);
    // Before the fix, a global visited set let the shared task consume B's edge
    // inside A's branch, dropping "Approach B" from the root's direct children.
    expect(topLevel).toContain("Approach A");
    expect(topLevel).toContain("Approach B");
    m.close();
  });

  it("free-text target prefers a causal node over a newer evidence artifact (finding #2)", () => {
    const m = fresh();
    m.remember({
      nodes: [
        { key: "i", type: "issue", title: "cache latency" },
        { key: "d", type: "decision", title: "shard cache" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "sharding helps" }],
    });
    // evidence created later — it is the newest node whose title matches "cache".
    m.remember({
      nodes: [{ type: "evidence", title: "cache benchmark", evidenceKind: "benchmark" }],
    });

    const why = m.why("cache");
    expect(why.root.type).not.toBe("evidence");
    m.close();
  });

  it("verify() on a factual edge does not rewrite the immutable ledger (finding #3)", () => {
    const m = fresh();
    m.remember({
      nodes: [
        { key: "i", type: "issue", title: "flaky test" },
        { key: "t", type: "task", title: "quarantine it" },
        { key: "c", type: "evidence", title: "commit", evidenceKind: "commit" },
      ],
      edges: [{ key: "e", from: "t", to: "i", relation: "resolves", source: "observed" }],
      evidence: [{ evidence: "c", target: "e", stance: "supports" }],
    });
    const before = m.edgeView("EDGE-1");
    m.verify("EDGE-1", T0 + 999_999); // much later
    const after = m.edgeView("EDGE-1");
    expect(after.lastVerified).toBe(before.lastVerified);
    expect(after.updatedAt).toBe(before.updatedAt);
    m.close();
  });
});
