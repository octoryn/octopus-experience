import { describe, expect, it } from "vitest";
import {
  canonicalize,
  generateActor,
  hashContent,
  signBundle,
  verifyBundle,
  type BundlePayload,
} from "../src/protocol.js";
import { ProjectMemory } from "../src/memory.js";

const T0 = 1_700_000_000_000;

describe("provenance protocol", () => {
  it("canonicalize is key-order independent", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(hashContent({ a: 1, b: 2 })).toBe(hashContent({ b: 2, a: 1 }));
  });

  it("signs and verifies a bundle", () => {
    const kp = generateActor("ci-bot");
    const bundle = signBundle({ traces: [] }, kp, T0);
    const v = verifyBundle(bundle);
    expect(v.valid).toBe(true);
    expect(v.issuer.id).toBe("ci-bot");
  });

  it("detects tampering with the payload", () => {
    const kp = generateActor("ci-bot");
    const bundle = signBundle({ traces: [{ kind: "test", title: "ok", outcome: "pass" }] }, kp, T0);
    // tamper: flip the outcome after signing
    bundle.payload.traces![0].outcome = "fail";
    expect(verifyBundle(bundle).valid).toBe(false);
  });

  it("rejects a forged issuer (signature made with a different key)", () => {
    const real = generateActor("real");
    const attacker = generateActor("attacker");
    const bundle = signBundle({ traces: [] }, real, T0);
    // claim to be someone else while keeping the original signature
    bundle.issuer = { id: "real", publicKey: attacker.actor.publicKey };
    expect(verifyBundle(bundle).valid).toBe(false);
  });
});

describe("ingestBundle", () => {
  const payload: BundlePayload = {
    nodes: [
      { key: "i", type: "issue", title: "OOM under burst", externalKey: "gh:issue:12" },
      { key: "d", type: "decision", title: "cap batch size at 64", externalKey: "gh:decision:5" },
      { key: "b", type: "evidence", title: "no OOM in 1k runs", evidenceKind: "benchmark", externalKey: "ci:bench:9" },
    ],
    edges: [{ from: "d", to: "i", relation: "addresses", intent: "smaller batches fit in memory" }],
    evidence: [{ evidence: "b", target: "EDGE-1", stance: "supports" }],
  };

  it("verifies, ingests, and stamps evidence with the signer", () => {
    const kp = generateActor("ci-bot");
    const bundle = signBundle(payload, kp, T0);
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    const r = m.ingestBundle(bundle);
    expect(r.verified).toBe(true);
    // benchmark defended the intent -> trusted
    expect(m.edgeState("EDGE-1")).toBe("trusted");
    const ev = m.getNodeByExternalKey("ci:bench:9");
    expect(ev?.signer).toBe("ci-bot");
    expect(ev?.verified).toBe(true);
    m.close();
  });

  it("rejects an unverifiable bundle by default (fail-closed)", () => {
    const kp = generateActor("ci-bot");
    const bundle = signBundle(payload, kp, T0);
    bundle.signature = "AAAA"; // corrupt
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    expect(() => m.ingestBundle(bundle)).toThrow(/rejected/); // no opts -> requireSignature defaults true
    m.close();
  });

  it("F1: an UNSIGNED bundle's benchmark stays inert — it cannot mint a trusted edge", () => {
    const kp = generateActor("attacker");
    const bundle = signBundle(payload, kp, T0);
    delete bundle.signature; // unsigned
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    const r = m.ingestBundle(bundle, { requireSignature: false }); // opt in to unsigned
    expect(r.verified).toBe(false);
    // nodes/edges are imported for the record, but the benchmark is inert:
    expect(m.edgeState("EDGE-1")).not.toBe("trusted");
    m.close();
  });

  it("F2: an UNSIGNED bundle cannot refute a locally-trusted edge", () => {
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    // locally established trusted edge (local evidence is verified === undefined)
    m.remember({
      nodes: [
        { key: "i", type: "issue", title: "leak under load" },
        { key: "d", type: "decision", title: "pool connections" },
        { key: "b", type: "evidence", title: "no leak in soak test", evidenceKind: "benchmark" },
      ],
      edges: [{ key: "e", from: "d", to: "i", relation: "addresses", intent: "pooling caps fds" }],
      evidence: [{ evidence: "b", target: "e", stance: "supports" }],
    });
    expect(m.edgeState("EDGE-1")).toBe("trusted");

    // an anonymous unsigned bundle tries to refute EDGE-1
    const attacker = generateActor("attacker");
    const attack = signBundle(
      {
        nodes: [{ key: "x", type: "evidence", title: "fake regression", evidenceKind: "test" }],
        evidence: [{ evidence: "x", target: "EDGE-1", stance: "contradicts" }],
      },
      attacker,
      T0,
    );
    delete attack.signature;
    m.ingestBundle(attack, { requireSignature: false });
    expect(m.edgeState("EDGE-1")).toBe("trusted"); // contradiction was inert
    m.close();
  });

  it("is idempotent — re-ingesting the same bundle adds nothing", () => {
    const kp = generateActor("ci-bot");
    const bundle = signBundle(payload, kp, T0);
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    m.ingestBundle(bundle);
    const again = m.ingestBundle(bundle);
    expect(again.remembered.nodes.every((n) => n.id)).toBe(true);
    // no new nodes created on the second pass (externalKey dedup)
    const count = m.search("").length;
    m.ingestBundle(bundle);
    expect(m.search("").length).toBe(count);
    m.close();
  });
});
