/**
 * The headline: producers emit FACTS; Project Memory derives the meaning.
 *
 *   npm run pipeline
 *
 * No one sends an issue, a decision, a causal edge, or the word "trusted". A
 * producer reports what happened — a risk was raised, two fixes were decided, a
 * benchmark passed, a test failed. Project Memory alone turns those facts into a
 * causal graph and computes trust.
 */
import { ProjectMemory } from "../src/memory.js";
import type { FactualEvent } from "../src/protocol.js";

const m = new ProjectMemory({ dbPath: ":memory:" });
const h = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`);

// Facts only. No ontology on the wire — kind/refs/body, nothing more.
const events: FactualEvent[] = [
  { kind: "risk", id: "L1", body: { title: "p99 latency spikes under load" } },
  { kind: "decision", id: "CACHE", refs: { risk: "L1" }, body: { title: "add a read-through cache", rationale: "cache absorbs the read storm" } },
  { kind: "decision", id: "POOL", refs: { risk: "L1" }, body: { title: "raise the connection pool to 500", rationale: "more connections clear the queue" } },
  { kind: "benchmark", id: "BC", refs: { decision: "CACHE" }, body: { title: "p99 512ms -> 90ms", outcome: "pass" } },
  { kind: "test", id: "TP", refs: { decision: "POOL" }, body: { title: "pool exhausted DB connections, p99 worse", outcome: "fail" } },
];

h("a producer reports facts (no issues, no decisions-as-graph, no trust)");
for (const e of events) console.log(`  ${e.kind}  ${JSON.stringify(e.refs ?? {})}  "${e.body?.title}"`);

h("Project Memory derives the graph and computes trust — by itself");
const r = m.ingestEvents(events);
console.log(`  derived: nodes ${r.createdNodes}, edges ${r.createdEdges}, evidence ${r.attachedEvidence}`);
for (const t of r.transitions) console.log(`  ${t.edge}: ${t.from} -> ${t.to}`);

h('digest "latency"');
console.log(m.digestText("latency"));

h('why "add a read-through cache"');
console.log(m.explain("add a read-through cache"));

m.close();
