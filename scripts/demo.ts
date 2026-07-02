/**
 * End-to-end demo: one team's Metal work accumulating into causal memory.
 *
 *   npm run demo
 *
 * Shows: a claim starts as a hypothesis; defending evidence promotes it to
 * trusted; a wrong idea is refuted (negative knowledge); a decision is
 * superseded; time decays a prescription to stale; re-verification revives it;
 * and finally a second agent asks `why` and gets the whole chain.
 */
import { ProjectMemory } from "../src/memory.js";

const MONTH = 30 * 24 * 60 * 60 * 1000;
const t0 = 1_700_000_000_000;
const m = new ProjectMemory({ dbPath: ":memory:" });

function h(s: string) {
  console.log(`\n\x1b[1m${s}\x1b[0m`);
}

// 1. Claude fixes a Metal crash and records the work. -----------------------
h("1) claude-session-123 fixes a Metal crash and remembers the work");
m.remember({
  actor: "claude-session-123",
  at: t0,
  nodes: [
    { key: "issue", type: "issue", title: "Metal compiler crashes on M1 Ultra", body: "MPSGraph aborts compiling conv layers." },
    { key: "decision", type: "decision", title: "Pad conv weights to 64 bytes", body: "Align tensors to 64B before handing to MPSGraph." },
    { key: "task", type: "task", title: "Improve Metal KV Cache", body: "Fixed lock contention + weight alignment." },
    { key: "commit", type: "evidence", title: "a1b2c3 pad conv weights", evidenceKind: "commit", ref: "a1b2c3" },
  ],
  edges: [
    { key: "eDecision", from: "decision", to: "issue", relation: "addresses", intent: "misaligned conv weights crash the Metal compiler" },
    // provenance edges: observed from the captured commit, no intent claim of their own
    { key: "eImpl", from: "task", to: "decision", relation: "implements", source: "observed" },
    { key: "eResolve", from: "task", to: "issue", relation: "resolves", source: "observed" },
  ],
  evidence: [
    { evidence: "commit", target: "eDecision", stance: "supports" },
    { evidence: "commit", target: "eImpl", stance: "supports" },
    { evidence: "commit", target: "eResolve", stance: "supports" },
  ],
});
console.log("EDGE-1 (decision addresses issue) with only a commit behind it:");
console.log("  state =", m.edgeState("EDGE-1", t0), "  <- a commit only ALIGNS; not yet trusted");

// 2. A benchmark defends the claim -> trusted. ------------------------------
h("2) a benchmark defends the claim");
m.remember({
  actor: "claude-session-123",
  at: t0,
  nodes: [{ key: "bench", type: "evidence", title: "1.8x throughput, 0 crashes / 500 runs", evidenceKind: "benchmark", ref: "bench-77" }],
  evidence: [{ evidence: "bench", target: "EDGE-1", stance: "supports" }],
});
console.log("  state =", m.edgeState("EDGE-1", t0), "  <- intent + defending mechanism => trusted");

// 3. A wrong idea gets refuted (negative knowledge). ------------------------
h("3) a wrong idea is refuted and kept as negative knowledge");
m.remember({
  actor: "claude-session-456",
  at: t0 + MONTH,
  nodes: [
    { key: "bad", type: "decision", title: "Disable the Metal backend entirely", body: "Fall back to CPU." },
    { key: "disproof", type: "evidence", title: "crash gone after padding; Metal 6x faster than CPU", evidenceKind: "test" },
  ],
  edges: [{ key: "eBad", from: "bad", to: "ISSUE-1", relation: "addresses", intent: "the Metal compiler is too unstable to use" }],
  evidence: [{ evidence: "disproof", target: "eBad", stance: "contradicts" }],
});
console.log("  'Disable Metal' state =", m.edgeState("EDGE-4", t0 + MONTH), "  <- future agents won't re-propose it");

// 4. A newer decision supersedes the old one. -------------------------------
h("4) a newer decision supersedes the old padding rule");
m.remember({
  actor: "claude-session-789",
  at: t0 + 3 * MONTH,
  nodes: [
    { key: "d128", type: "decision", title: "Pad conv weights to 128 bytes for M3", body: "M3 needs 128B alignment; 64B regressed." },
    { key: "b128", type: "evidence", title: "M3 stable at 128B", evidenceKind: "benchmark" },
  ],
  edges: [{ key: "e128", from: "d128", to: "ISSUE-1", relation: "addresses", intent: "M3 requires 128-byte alignment" }],
  evidence: [{ evidence: "b128", target: "e128", stance: "supports" }],
});
m.supersede("EDGE-1", "EDGE-5", t0 + 3 * MONTH); // 64B rule superseded by 128B rule
console.log("  64B rule state =", m.edgeState("EDGE-1", t0 + 3 * MONTH), "  <- preserved as history, out of the default chain");

// 5. Time passes: the 128B prescription decays to stale. --------------------
h("5) 20 months later, unverified, the 128B rule decays to stale");
const later = t0 + 20 * MONTH;
console.log("  128B rule state =", m.edgeState("EDGE-5", later), `  conf=${m.edgeView("EDGE-5", later).confidence}`);

// 6. Re-verification revives it. --------------------------------------------
h("6) an agent re-verifies it — trust is restored");
m.verify("EDGE-5", later);
console.log("  128B rule state =", m.edgeState("EDGE-5", later), `  conf=${m.edgeView("EDGE-5", later).confidence}`);

// 7. A brand-new agent asks WHY. --------------------------------------------
h('7) a fresh agent asks:  why "Metal KV Cache"');
console.log(m.explain("Metal KV Cache", { now: later }));

h('   why "Metal compiler crashes"  (issue, trusted chain)');
console.log(m.explain("Metal compiler crashes", { now: later }));

h('   ...and with history — the refuted and superseded edges reappear');
console.log(m.explain("Metal compiler crashes", { now: later, history: true }));

m.close();
