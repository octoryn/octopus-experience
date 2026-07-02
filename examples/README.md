# Examples

## `traces.json` — distilling raw work into memory

A small stream of work traces of the kind the Blackboard bridge (or an agent)
would emit: a commit, a passing benchmark, a failing regression test.

Run the built-in pipeline demo to see traces turn into trusted / stale memory
and a lessons digest:

```bash
npm run pipeline
```

Or drive it from your own code:

```ts
import { ProjectMemory } from "octopus-experience";
import traces from "./examples/traces.json" assert { type: "json" };

const m = new ProjectMemory();

// You still need the nodes the commit references to exist — record the issue
// and the decision first (an agent would do this when it opens the work):
m.remember({
  nodes: [
    { key: "i", type: "issue", title: "KV cache lock contention" },
    { key: "d", type: "decision", title: "Shard the KV cache lock" },
  ],
  edges: [{ from: "d", to: "i", relation: "addresses", intent: "sharding removes contention" }],
});

// Then let the traces promote/refute it automatically:
const result = m.distill(traces);
console.log(result.transitions); // e.g. hypothesis -> trusted

console.log(m.digestText("cache"));
console.log(m.explain("Shard the KV cache lock"));
```

## Ingesting a signed Provenance Bundle

The only cross-project entry point is the [`provenance/0` protocol](../docs/protocol.md).
A producer signs a bundle; Project Memory verifies and ingests it — it never reads
the producer's storage.

```ts
import { ProjectMemory, generateActor, signBundle } from "octopus-experience";

const ciBot = generateActor("ci-bot");           // Ed25519 keypair
const bundle = signBundle(
  {
    nodes: [
      { key: "i", type: "issue", title: "OOM under burst", externalKey: "gh:issue:12" },
      { key: "d", type: "decision", title: "cap batch size at 64", externalKey: "gh:decision:5" },
      { key: "b", type: "evidence", title: "no OOM in 1k runs", evidenceKind: "benchmark", externalKey: "ci:bench:9" },
    ],
    edges: [{ from: "d", to: "i", relation: "addresses", intent: "smaller batches fit in memory" }],
    evidence: [{ evidence: "b", target: "EDGE-1", stance: "supports" }],
  },
  ciBot,
  Date.now(),
);

const m = new ProjectMemory();
const r = m.ingestBundle(bundle); // fail-closed: rejects an unverifiable bundle by default
console.log(r.verified, m.edgeState("EDGE-1")); // true "trusted"  (signed benchmark defended it)
```

Or from the CLI, with a bundle written to `bundle.json`:

```bash
node dist/cli.js ingest-bundle bundle.json   # rejects unsigned by default
node dist/cli.js digest "batch"
```

Blackboard is one producer among many: it emits `provenance/0` bundles via its own
`blackboard export` command — Project Memory has no knowledge of Blackboard's
schema or code.
