# The Defensible-Reasoning Eval

Project Memory ships a small evaluation for the property that makes it different
from a memory store: **defensible causal provenance** — evidence-gated trust and
negative knowledge. It is deliberately *not* a recall benchmark.

## What recall benchmarks measure — and what they miss

Long-context and long-term memory benchmarks (LongMemEval and its kin) score one
thing: **retrieval**. Given a haystack of prior turns, did the system surface the
right needle? That is a lookup — "what did we say?" It has no notion of whether a
retrieved claim is *earned*, *contradicted*, *replaced*, or *stale*. A recall
benchmark will happily reward a system for confidently retrieving a fact that was
later disproven.

Project Memory's whole thesis is the question recall cannot ask: not *what* did we
learn, but **why do we do it this way, and can we defend it?** So the eval scores
the axes recall ignores:

| axis | recall benchmark | this eval |
| ---- | ---------------- | --------- |
| retrieve a stored fact | ✅ measured | not the point |
| did evidence *earn* trust? | ✗ invisible | ✅ `trusted` only with a defending mechanism |
| was a claim *refuted*? | ✗ invisible | ✅ contradiction → `refuted` |
| does a dead end stay dead? | ✗ invisible | ✅ refuted/superseded edges are **not re-walked** |
| did trust *decay*? | ✗ invisible | ✅ unverified prescription → `stale`, revived by re-verify |
| was a rule *superseded*? | ✗ invisible | ✅ replaced, preserved as history, out of the live chain |

The headline property is **negative knowledge**: a disproven path must not be
re-proposed or re-traversed. A recall system, asked again, would cheerfully
resurface the dead end. Project Memory keeps it out of `why` by construction, and
the eval asserts exactly that.

## The scenario format

A scenario is a **declarative** description of input facts plus the trust
outcomes those facts should produce. It is ingested through the real
`ProjectMemory` API — no mocks, no reaching into internal state — and then the
runner recomputes trust and scores every expectation.

```ts
import type { Scenario } from "octopus-experience/eval";

const scenario: Scenario = {
  name: "refuted-dead-end-not-rewalked",
  description: "a contradicted, undefended claim is refuted and not re-walked",
  remember: {
    at: T0,
    nodes: [
      { key: "i", type: "issue", title: "Latency spikes under load" },
      { key: "bad", type: "decision", title: "Raise the connection pool to 500" },
      { key: "t", type: "evidence", title: "pool exhausted DB connections", evidenceKind: "test" },
    ],
    edges: [
      { key: "eBad", from: "bad", to: "i", relation: "addresses", intent: "more connections clear the backlog" },
    ],
    evidence: [{ evidence: "t", target: "eBad", stance: "contradicts" }],
  },
  evaluateAt: T0,
  expect: [
    {
      edge: "eBad",
      state: "refuted",              // the trust outcome the facts must produce
      notWalkedFrom: "Latency spikes under load", // ...and it must NOT be re-walked
    },
  ],
};
```

- **`remember`** — the input facts as a single `RememberInput`. Edge `key`s are
  the handles expectations reference.
- **`then`** *(optional)* — ordered follow-up operations against the real API:
  `supersede`, `verify`, `attest` (signed or unsigned), and `addEvidence` (late
  evidence). This is how a scenario exercises supersession, decay/revival, and
  human attestation.
- **`evaluateAt`** *(optional)* — the `now` at which trust is scored. Set it past
  the decay horizon to score staleness.
- **`expect`** — the assertions:
  - **`state`** — the lifecycle state the edge must reach (`trusted`,
    `refuted`, `stale`, `superseded`, `hypothesis`, `claimed`, `observed`).
  - **`notWalkedFrom`** — a `why` target whose default causal chain must **not**
    traverse this edge. This is the dead-end / negative-knowledge assertion.

## Running it

```ts
import { runEval, renderEvalReport } from "octopus-experience/eval";

const report = runEval();               // uses the bundled reference scenarios
console.log(renderEvalReport(report));
process.exit(report.pass ? 0 : 1);
```

Pass your own scenarios to `runEval(scenarios)`, or score one with
`runScenario(scenario)`. Each expectation is scored independently, so a report
tells you *which* transition failed, not just that a scenario did.

## The reference set

Four scenarios, each isolating one defensible-reasoning property:

1. **`evidence-gates-trust`** — an aligning commit leaves a claim a `hypothesis`;
   a defending benchmark earns `trusted`. (Trust is earned, not asserted.)
2. **`refuted-dead-end-not-rewalked`** — a contradicted, undefended claim is
   `refuted` **and** kept out of `why`. (Negative knowledge stays negative.)
3. **`supersession-replaces-not-erases`** — a newer decision `supersedes` an
   older trusted one; the old edge is preserved as history but leaves the live
   chain. (Override, not erosion.)
4. **`decay-then-reverify`** — an unverified prescription decays to `stale` after
   ~12 months; re-verification revives it to `trusted`. (Trust is a function of
   time, not a stored label.)

## Contributing scenarios

Add a `Scenario` to `REFERENCE_SCENARIOS` in
[`src/eval-scenarios.ts`](../src/eval-scenarios.ts). Keep it minimal and make
every expectation load-bearing — prefer a real lifecycle transition over
restating a case already covered. The format is the contract; the runner and the
scenario library are decoupled so contributors touch only the scenario file.
