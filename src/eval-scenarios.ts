/**
 * Reference scenarios for the defensible-reasoning eval.
 *
 * Each scenario encodes a claim about *earned* trust that a recall benchmark
 * cannot express: not "was the fact retrieved?" but "did the evidence justify
 * trusting it, refuting it, or aging it out — and did a dead end stay dead?"
 *
 * Contributors: add a scenario to this array. Keep it minimal and make every
 * expectation load-bearing. Prefer real lifecycle transitions (evidence
 * promotes, contradiction refutes, supersession replaces, time decays) over
 * restating the same case.
 */
import type { Scenario } from "./eval.js";

const MONTH = 30 * 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;
const STALE_AFTER = 12 * MONTH; // mirrors DEFAULT_STALE_AFTER_MS

export const REFERENCE_SCENARIOS: Scenario[] = [
  // 1. EVIDENCE-GATED TRUST -------------------------------------------------
  // A claim with only a circumstantial commit is a hypothesis; a defending
  // benchmark is what earns `trusted`. Recall would score both identically
  // ("the decision is retrievable"); only defensible reasoning distinguishes
  // them.
  {
    name: "evidence-gates-trust",
    description:
      "An aligning commit leaves a causal claim a hypothesis; a defending benchmark earns trusted.",
    remember: {
      at: T0,
      nodes: [
        { key: "i", type: "issue", title: "KV cache lock contention" },
        { key: "d", type: "decision", title: "Shard the KV cache lock" },
        { key: "commit", type: "evidence", title: "abc123 shard lock", evidenceKind: "commit" },
      ],
      edges: [
        {
          key: "eShard",
          from: "d",
          to: "i",
          relation: "addresses",
          intent: "sharding removes contention",
        },
      ],
      evidence: [{ evidence: "commit", target: "eShard", stance: "supports" }],
    },
    then: [
      // a benchmark arrives and defends the mechanism -> trusted
      {
        op: "addEvidence",
        evidenceKind: "benchmark",
        title: "1.8x throughput, contention gone",
        edge: "eShard",
        at: T0,
      },
    ],
    evaluateAt: T0,
    expect: [
      {
        edge: "eShard",
        state: "trusted",
        note: "defending benchmark + stated intent = earned trust",
      },
    ],
  },

  // 2. REFUTED DEAD END (negative knowledge) --------------------------------
  // A wrong idea, contradicted with no defense, is refuted — and MUST NOT be
  // re-walked by `why`. This is the property no recall benchmark measures:
  // keeping a disproven path out of future reasoning.
  {
    name: "refuted-dead-end-not-rewalked",
    description:
      "A contradicted, undefended claim is refuted and is not re-walked by a default why — negative knowledge stays negative.",
    remember: {
      at: T0,
      nodes: [
        { key: "i", type: "issue", title: "Latency spikes under load" },
        { key: "good", type: "decision", title: "Add a read-through cache" },
        { key: "bad", type: "decision", title: "Raise the connection pool to 500" },
        { key: "benchGood", type: "evidence", title: "p99 512ms -> 90ms", evidenceKind: "benchmark" },
        {
          key: "testBad",
          type: "evidence",
          title: "pool exhausted DB connections, latency worse",
          evidenceKind: "test",
        },
      ],
      edges: [
        {
          key: "eGood",
          from: "good",
          to: "i",
          relation: "addresses",
          intent: "cache absorbs the read load",
        },
        {
          key: "eBad",
          from: "bad",
          to: "i",
          relation: "addresses",
          intent: "more connections clear the backlog",
        },
      ],
      evidence: [
        { evidence: "benchGood", target: "eGood", stance: "supports" },
        { evidence: "testBad", target: "eBad", stance: "contradicts" },
      ],
    },
    evaluateAt: T0,
    expect: [
      { edge: "eGood", state: "trusted", note: "the defended fix is trusted" },
      {
        edge: "eBad",
        state: "refuted",
        notWalkedFrom: "Latency spikes under load",
        note: "the disproven fix is refuted AND kept out of why — no re-proposal",
      },
    ],
  },

  // 3. SUPERSESSION ---------------------------------------------------------
  // A newer trusted decision replaces an older one. The old edge is preserved
  // as history (`superseded`) but leaves the default chain — an override, not
  // an erosion. Recall would still surface the stale rule as a valid answer.
  {
    name: "supersession-replaces-not-erases",
    description:
      "A newer decision supersedes an older trusted one; the old edge is preserved but not re-walked by default.",
    remember: {
      at: T0,
      nodes: [
        { key: "i", type: "issue", title: "Metal conv weight alignment" },
        { key: "old", type: "decision", title: "Pad conv weights to 64 bytes" },
        { key: "new", type: "decision", title: "Pad conv weights to 128 bytes for M3" },
        { key: "b64", type: "evidence", title: "M1 stable at 64B", evidenceKind: "benchmark" },
        { key: "b128", type: "evidence", title: "M3 stable at 128B", evidenceKind: "benchmark" },
      ],
      edges: [
        { key: "eOld", from: "old", to: "i", relation: "addresses", intent: "64B fixes M1 crash" },
        { key: "eNew", from: "new", to: "i", relation: "addresses", intent: "M3 needs 128B" },
      ],
      evidence: [
        { evidence: "b64", target: "eOld", stance: "supports" },
        { evidence: "b128", target: "eNew", stance: "supports" },
      ],
    },
    then: [{ op: "supersede", oldEdge: "eOld", newEdge: "eNew", at: T0 + MONTH }],
    evaluateAt: T0 + MONTH,
    expect: [
      {
        edge: "eOld",
        state: "superseded",
        notWalkedFrom: "Metal conv weight alignment",
        note: "history preserved, but the replaced rule leaves the default chain",
      },
      { edge: "eNew", state: "trusted", note: "the replacement is the live answer" },
    ],
  },

  // 4. DECAY then REVIVAL ---------------------------------------------------
  // A trusted prescription nobody re-verifies decays to `stale`; a fresh
  // verification revives it to `trusted`. Trust is a function of time, not a
  // stored label — the exact axis recall benchmarks have no notion of.
  {
    name: "decay-then-reverify",
    description:
      "An unverified trusted prescription decays to stale after ~12 months; re-verification revives it to trusted.",
    remember: {
      at: T0,
      nodes: [
        { key: "i", type: "issue", title: "Throughput ceiling" },
        { key: "d", type: "decision", title: "Prefer async IO" },
        { key: "b", type: "evidence", title: "2x throughput", evidenceKind: "benchmark" },
      ],
      edges: [
        { key: "e", from: "d", to: "i", relation: "addresses", intent: "async lifts the ceiling" },
      ],
      evidence: [{ evidence: "b", target: "e", stance: "supports" }],
    },
    // re-verify AFTER the decay horizon, and evaluate at that same later moment:
    // the edge would be stale without the verify, and is trusted with it.
    then: [{ op: "verify", edge: "e", at: T0 + STALE_AFTER + MONTH }],
    evaluateAt: T0 + STALE_AFTER + MONTH,
    expect: [
      {
        edge: "e",
        state: "trusted",
        note: "re-verification reset the decay clock; without it this would be stale",
      },
    ],
  },
];
