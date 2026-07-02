# Project Memory

**Organizational memory for AI teams.** Ask *why*, not just *what*.

> Project Memory does not invent causality. It tracks claims, evidence, and the
> lifecycle of trust.

Today, every AI session starts from zero. Conversation memory remembers *a
chat*; it does not remember *why this repository looks the way it does*. Project
Memory is the missing layer: multiple agents, multiple people, multiple sessions,
over months — accumulating instead of restarting.

It is the sibling of [octopus-blackboard](https://github.com/octoryn/octopus-blackboard):

```
Work happens
    │
    ▼
Blackboard        awareness — "what are other agents doing?"   (evidence capture)
    │  distillation
    ▼
Project Memory    learning  — "why do we do things this way?"  (causal trust)
    │
    ▼
Future decisions
```

## The one question

Not "what have we learned?" but **"why do we do things this way?"** The flagship
capability is `why`, which reconstructs a causal chain — not `search`, which only
retrieves.

```
$ octomem why "Metal KV Cache"

why TASK-1  "Improve Metal KV Cache"
├─ implements → DECISION-1 "Pad conv weights to 64 bytes"  [· observed]
│     • commit EV-1 (supports) "a1b2c3 pad conv weights"
└─ resolves → ISSUE-1 "Metal compiler crashes on M1 Ultra"  [· observed]
   └─ addressed by → DECISION-3 "Pad conv weights to 128 bytes for M3"  [✓ trusted]
         • benchmark EV-4 (supports) "M3 stable at 128B"
```

## The discipline

The whole product is one rule:

> **Every causal edge carries provenance, or it stays a hypothesis.**

An agent may *propose* that a commit resolved an issue. The system only promotes
that edge to **trusted** once defending evidence (a test, benchmark, review, or
human attestation) backs the stated intent. No evidence, no trusted edge — so
`why` is a record of defensible causality, not a story machine.

Trust has a full lifecycle: `claimed → hypothesis → trusted`, and it can be lost
— `stale` (decayed / contradicted), `superseded` (replaced by a newer decision),
or `refuted` (proven false, and kept as *negative knowledge* so agents don't
re-propose it). History is never deleted; only trust decays. See
[docs/edge-lifecycle.md](docs/edge-lifecycle.md) — the constitution.

Three stable node types — **Issue, Decision, Evidence** — plus **Task** as an
append-only provenance anchor. "Knowledge" is deliberately *not* stored; it is
the result of a `why` query. No knowledge graph, no ontology to learn.

## Install & run

```bash
npm install
npm run build

# see the whole idea end-to-end in ~2 seconds
npm run demo

# human CLI
node dist/cli.js why "Metal KV Cache"
node dist/cli.js search Metal --type issue
```

### As an MCP server

```jsonc
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["/absolute/path/to/octopus-experience/dist/mcp.js"],
      "env": { "OCTOMEM_DB": "/absolute/path/to/.octomem/memory.db" }
    }
  }
}
```

Tools: `remember` (record work + propose edges), `add_evidence` / `attest`
(defend or contest an edge), `verify` (revive a stale prescription), `search`,
and `why`.

## Library

```ts
import { ProjectMemory } from "octopus-experience";

const m = new ProjectMemory();
m.remember({
  nodes: [
    { key: "i", type: "issue", title: "KV cache lock contention" },
    { key: "d", type: "decision", title: "Shard the KV cache lock" },
    { key: "b", type: "evidence", title: "1.8x throughput", evidenceKind: "benchmark" },
  ],
  edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "sharding removes contention" }],
  evidence: [{ evidence: "b", target: "e", stance: "supports" }],
});

console.log(m.explain("Shard the KV cache lock")); // -> trusted causal chain
```

## Status

v0.1 — the core (lifecycle engine, `why` reconstruction, MCP server, CLI) with a
tested constitution. The distillation layer that turns raw Blackboard traces
into proposed edges is the next milestone.

## License

AGPL-3.0-or-later © Octoryn
