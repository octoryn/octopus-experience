/**
 * The v0.2 headline: memory as a by-product of work.
 *
 *   npm run pipeline
 *
 * No one writes "trusted" by hand. Agents propose; raw work traces (benchmarks,
 * tests, reviews) promote or refute those proposals; then anyone can ask for a
 * lessons digest — including the dead ends, so they aren't re-walked.
 */
import { ProjectMemory } from "../src/memory.js";

const m = new ProjectMemory({ dbPath: ":memory:" });
const h = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// Two agents propose competing fixes for the same issue — both just claims.
h("agents propose two competing fixes (claims, unproven)");
m.remember({
  actor: "claude-1",
  nodes: [
    { key: "i", type: "issue", title: "p99 latency spikes under load" },
    { key: "d1", type: "decision", title: "add a read-through cache" },
    { key: "d2", type: "decision", title: "raise the connection pool to 500" },
    { key: "c1", type: "evidence", title: "e11 add cache", evidenceKind: "commit" },
    { key: "c2", type: "evidence", title: "e22 bump pool", evidenceKind: "commit" },
  ],
  edges: [
    { from: "d1", to: "i", relation: "addresses", intent: "cache absorbs the read storm" },
    { from: "d2", to: "i", relation: "addresses", intent: "more connections clear the queue" },
  ],
  evidence: [
    { evidence: "c1", target: "EDGE-1", stance: "supports" },
    { evidence: "c2", target: "EDGE-2", stance: "supports" },
  ],
});
console.log("  cache fix :", m.edgeState("EDGE-1"), "  pool fix :", m.edgeState("EDGE-2"), " (both hypotheses)");

// Work happens. Raw traces flow in (as the Blackboard bridge would supply them).
h("work traces arrive — the system decides, not the authors");
const result = m.distill([
  { kind: "benchmark", ref: "bench-cache", title: "p99 512ms -> 90ms", outcome: "pass", mentions: ["add a read-through cache"] },
  { kind: "test", ref: "load-pool", title: "pool at 500 exhausted DB connections, p99 worse", outcome: "fail", mentions: ["raise the connection pool to 500"] },
]);
for (const t of result.transitions) console.log(`  ${t.edge}: ${t.from} -> ${t.to}`);
console.log("  cache fix :", m.edgeState("EDGE-1"), "  pool fix :", m.edgeState("EDGE-2"));

// Anyone — human or a brand-new agent — asks what the team has learned.
h('digest "latency"');
console.log(m.digestText("latency"));

h('why "add a read-through cache"');
console.log(m.explain("add a read-through cache"));

m.close();
