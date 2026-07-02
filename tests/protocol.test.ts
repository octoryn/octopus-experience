import { describe, expect, it } from "vitest";
import {
  canonicalize,
  generateActor,
  hashContent,
  signBundle,
  verifyBundle,
  type FactualEvent,
} from "../src/protocol.js";
import { ProjectMemory } from "../src/memory.js";

const T0 = 1_700_000_000_000;
// a factory, so a test that tampers with a bundle can't mutate another test's input
const facts = (): FactualEvent[] => [
  { kind: "risk", id: "R1", body: { title: "OOM under burst" } },
  { kind: "decision", id: "D1", refs: { risk: "R1" }, body: { title: "cap batch size at 64", rationale: "smaller batches fit" } },
  { kind: "benchmark", id: "B1", refs: { decision: "D1" }, body: { title: "no OOM in 1k runs", outcome: "pass" } },
];

describe("events/0 protocol", () => {
  it("canonicalize is key-order independent", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(hashContent({ a: 1, b: 2 })).toBe(hashContent({ b: 2, a: 1 }));
  });

  it("signs and verifies a factual event bundle", () => {
    const kp = generateActor("ci-bot");
    const v = verifyBundle(signBundle(facts(), kp, T0));
    expect(v.valid).toBe(true);
    expect(v.issuer.id).toBe("ci-bot");
  });

  it("detects tampering with an event", () => {
    const kp = generateActor("ci-bot");
    const b = signBundle(facts(), kp, T0);
    b.events[2].body!.outcome = "fail";
    expect(verifyBundle(b).valid).toBe(false);
  });

  it("detects tampering with the envelope (issuedAt)", () => {
    const kp = generateActor("ci-bot");
    const b = signBundle(facts(), kp, T0);
    b.issuedAt = T0 + 1;
    expect(verifyBundle(b).valid).toBe(false);
  });

  it("rejects a forged issuer key", () => {
    const real = generateActor("real");
    const attacker = generateActor("attacker");
    const b = signBundle(facts(), real, T0);
    b.issuer = { id: "real", publicKey: attacker.actor.publicKey };
    expect(verifyBundle(b).valid).toBe(false);
  });
});

describe("ingestBundle — facts only", () => {
  it("verifies and ingests a signed events/0 bundle; PM derives the graph", () => {
    const kp = generateActor("ci-bot");
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    const r = m.ingestBundle(signBundle(facts(), kp, T0));
    expect(r.verified).toBe(true);
    // producer sent facts; PM created the issue + decision and inferred the edge,
    // which the benchmark then defended into trusted
    expect(m.search("OOM", "issue").length).toBe(1);
    const decision = m.search("cap batch size", "decision")[0];
    expect(decision).toBeTruthy();
    const edge = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(edge.id)).toBe("trusted");
    m.close();
  });

  it("REJECTS a producer-supplied causal graph (non-events/0 protocol)", () => {
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    const graphBundle = {
      protocol: "provenance/0",
      issuer: { id: "x", publicKey: "" },
      issuedAt: T0,
      payload: { nodes: [{ type: "issue", title: "smuggled" }], edges: [{ from: "a", to: "b", relation: "addresses" }] },
    } as never;
    expect(() => m.ingestBundle(graphBundle)).toThrow(/unsupported protocol/);
    m.close();
  });

  it("fail-closed: an unsigned bundle is rejected by default", () => {
    const kp = generateActor("ci-bot");
    const b = signBundle(facts(), kp, T0);
    delete b.signature;
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    expect(() => m.ingestBundle(b)).toThrow(/rejected/);
    m.close();
  });

  it("an unsigned bundle (opted in) records facts but mints no trust", () => {
    const kp = generateActor("attacker");
    const b = signBundle(facts(), kp, T0);
    delete b.signature;
    const m = new ProjectMemory({ dbPath: ":memory:" }, { clock: () => T0 });
    const r = m.ingestBundle(b, { requireSignature: false });
    expect(r.verified).toBe(false);
    const decision = m.search("cap batch size", "decision")[0];
    const edge = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(edge.id)).not.toBe("trusted"); // evidence was inert
    m.close();
  });
});
