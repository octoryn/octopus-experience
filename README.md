# Project Memory

**Organizational memory for AI teams.** Ask *why*, not just *what*.

> Project Memory does not invent causality. It tracks claims, evidence, and the
> lifecycle of trust.

> **Part of [Octopus Core](https://github.com/octoryn) — the open infrastructure stack for governed AI.** One job per repo, along the agent lifecycle: [Scout](https://github.com/octoryn/octopus-scout) · [Observe](https://github.com/octoryn/octopus-observe) · [Experience](https://github.com/octoryn/octopus-experience) · [Blackboard](https://github.com/octoryn/octopus-blackboard) · [Runtime](https://github.com/octoryn/octopus-runtime) · [Replay](https://github.com/octoryn/octopus-replay) — with [Inspect](https://github.com/octoryn/octopus-inspect) governing every stage.
>
> **This repo — Experience · Understand:** Knowledge is earned, not stored.

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

## Memory as a by-product of work

Knowledge tools die when someone has to feed them. So no one writes the graph —
producers report **facts**, and Project Memory derives the meaning:

```
$ npm run pipeline    # abridged

a producer reports facts (no issues, no decisions-as-graph, no trust)
  risk       "p99 latency spikes under load"
  decision   {risk:L1}       "add a read-through cache"
  decision   {risk:L1}       "raise the connection pool to 500"
  benchmark  {decision:CACHE} "p99 512ms -> 90ms"       outcome: pass
  test       {decision:POOL}  "pool exhausted DB connections"  outcome: fail

Project Memory derives the graph and computes trust — by itself
  EDGE-1: claimed -> trusted    (the benchmark defended the cache fix)
  EDGE-2: claimed -> refuted    (the failing test killed the pool fix)

digest "latency"
  ## What we do (trusted)      • add a read-through cache
  ## Dead ends — do NOT retry  • raise the connection pool to 500
  ## Problems seen             • p99 latency spikes under load
```

The producer sent only facts. Project Memory created the issue and decisions,
inferred the causal edges, and let a passing benchmark promote one fix to
`trusted` while a failing test refuted the other — **no human, and no producer,
wrote "trusted."**

## Composes through protocols, never implementations

> **Independent repositories. Stable protocols. Replaceable implementations.**

Project Memory never reaches into another system's storage, code, **or ontology**.
The only way in is a signed **`events/0`** bundle (a JSON wire format of *facts* —
see [docs/protocol.md](docs/protocol.md)). Any producer — a CI job, a code host, an
agent, or [octopus-blackboard](https://github.com/octoryn/octopus-blackboard) —
emits facts; Project Memory verifies the signature and ingests them. Assume
Blackboard doesn't exist and Project Memory still makes complete sense.

A bundle carries **facts, never meaning.** A producer reports what happened —
`{ kind, refs, body }` — and never sends an issue, a decision, a causal edge, a
`stance`, or a trust level. **Project Memory alone** turns facts into that graph
and computes trust, by the constitution. (This reverses the earlier `provenance/0`
graph bundle, which leaked PM's ontology onto the wire — see
[ADR 0001](docs/adr/0001-events-not-ontology.md).)

```bash
node dist/cli.js keygen ci-bot            # -> ci-bot.actor.json (Ed25519)
node dist/cli.js ingest-bundle bundle.json   # rejects unsigned by default
node dist/cli.js digest "Metal"
```

See [docs/architecture.md](docs/architecture.md) for the full pipeline.

## Install & run

```bash
npm install
npm run build

# see the whole idea end-to-end in ~2 seconds
npm run demo        # the trust lifecycle
npm run pipeline    # memory accruing from work traces

# human CLI
node dist/cli.js why "Metal KV Cache"
node dist/cli.js ask "cache"
node dist/cli.js digest "Metal"
node dist/cli.js keygen ci-bot
node dist/cli.js ingest-bundle bundle.json
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

Tools:

- `remember` — record work and propose causal edges
- `observe` — record local first-party facts (events); PM derives the graph
- `ingest_bundle` — ingest a signed `events/0` fact bundle (the only cross-project protocol)
- `add_evidence` / `attest` — defend or contest an edge
- `verify` — revive a stale prescription
- `why` — reconstruct a causal chain
- `ask` — ranked recall with trust attached
- `digest` — a lessons brief on a topic (incl. refuted dead ends)
- `search` — plain text lookup

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

v0.4 — the core constitution (lifecycle engine, `why`), interpretation (`ask` /
`digest`), idempotent ingestion, and the open **`events/0`** fact protocol with
Ed25519-signed, tamper-evident events. Producers send facts; Project Memory alone
derives the graph (see [ADR 0001](docs/adr/0001-events-not-ontology.md)). Tested
(44 cases) and adversarially reviewed. Roadmap (naturally commercial, built *on*
the protocol): cross-project trust registries and key rotation, distributed /
federated verification, enterprise governance & compliance, hosted multi-project.

## License

Apache-2.0 © Octoryn
