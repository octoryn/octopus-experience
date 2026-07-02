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

## Ingesting an octopus-blackboard database

```bash
node dist/cli.js ingest-blackboard /path/to/blackboard/.blackboard/board.db
node dist/cli.js digest "Metal"
```
