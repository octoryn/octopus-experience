import { describe, expect, it } from "vitest";
import {
  computeEdgeState,
  confidence,
  DEFAULT_HALF_LIFE_MS,
  DEFAULT_STALE_AFTER_MS,
  isHistoryOnly,
  isPrescriptive,
  isTrustedByDefault,
} from "../src/lifecycle.js";
import type {
  EvidenceKind,
  EvidenceLink,
  EvidenceStance,
  MemoryEdge,
  MemoryNode,
} from "../src/types.js";

const T0 = 1_700_000_000_000; // fixed epoch

function node(id: string, type: MemoryNode["type"], extra: Partial<MemoryNode> = {}): MemoryNode {
  return { id, type, title: id, body: "", createdAt: T0, ...extra };
}

function edge(extra: Partial<MemoryEdge> = {}): MemoryEdge {
  return {
    id: "EDGE-1",
    from: "TASK-1",
    to: "DECISION-1",
    relation: "implements",
    source: "claimed",
    createdAt: T0,
    updatedAt: T0,
    lastVerified: T0,
    ...extra,
  };
}

let linkSeq = 0;
function link(
  targetId: string,
  evidenceId: string,
  stance: EvidenceStance,
): EvidenceLink {
  return {
    id: `LINK-${++linkSeq}`,
    evidenceId,
    targetType: "edge",
    targetId,
    stance,
    createdAt: T0,
  };
}

function ev(id: string, kind: EvidenceKind): MemoryNode {
  return node(id, "evidence", { evidenceKind: kind });
}

function nodeMap(...nodes: MemoryNode[]): Map<string, MemoryNode> {
  const m = new Map<string, MemoryNode>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

const opts = (now = T0) => ({ now });

describe("edge lifecycle — the constitution", () => {
  const task = node("TASK-1", "task");
  const decision = node("DECISION-1", "decision", { lastVerified: T0 });
  const issue = node("ISSUE-1", "issue");

  it("intent only -> claimed", () => {
    const e = edge({ intent: "because it was faster" });
    const state = computeEdgeState(e, [], nodeMap(task, decision), opts());
    expect(state).toBe("claimed");
  });

  it("aligning mechanism only, no intent -> observed", () => {
    const e = edge({ intent: undefined });
    const links = [link(e.id, "EV-1", "supports")];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "commit")),
      opts(),
    );
    expect(state).toBe("observed");
  });

  it("intent + aligning trace, not defended -> hypothesis", () => {
    const e = edge({ intent: "the commit that fixed it" });
    const links = [link(e.id, "EV-1", "supports")];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "commit")),
      opts(),
    );
    expect(state).toBe("hypothesis");
  });

  it("intent + defending mechanism -> trusted", () => {
    const e = edge({ intent: "padding fixed the crash" });
    const links = [link(e.id, "EV-1", "supports")];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "benchmark")),
      opts(),
    );
    expect(state).toBe("trusted");
  });

  it("a VERIFIED human attestation defends a claim -> trusted", () => {
    const e = edge({ intent: "senior eng vouches" });
    const links = [link(e.id, "EV-1", "supports")];
    const signed = node("EV-1", "evidence", { evidenceKind: "attestation", verified: true });
    const state = computeEdgeState(e, links, nodeMap(task, decision, signed), opts());
    expect(state).toBe("trusted");
  });

  it("an UNSIGNED attestation does not defend — it is only a claim", () => {
    const e = edge({ intent: "someone says so" });
    const links = [link(e.id, "EV-1", "supports")];
    const unsigned = ev("EV-1", "attestation"); // verified undefined
    const state = computeEdgeState(e, links, nodeMap(task, decision, unsigned), opts());
    expect(state).toBe("hypothesis");
  });

  it("defended mechanism WITHOUT intent stays observed, not trusted", () => {
    const e = edge({ intent: undefined });
    const links = [link(e.id, "EV-1", "supports")];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "test")),
      opts(),
    );
    expect(state).toBe("observed");
  });

  it("contradiction with no support -> refuted (negative knowledge)", () => {
    const e = edge({ intent: "I thought X caused Y" });
    const links = [link(e.id, "EV-1", "contradicts")];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "test")),
      opts(),
    );
    expect(state).toBe("refuted");
  });

  it("contradiction WITH support -> stale (contested, not refuted)", () => {
    const e = edge({ intent: "still think this holds" });
    const links = [
      link(e.id, "EV-1", "supports"),
      link(e.id, "EV-2", "contradicts"),
    ];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "benchmark"), ev("EV-2", "test")),
      opts(),
    );
    expect(state).toBe("stale");
  });

  it("supersededBy wins even over full evidence", () => {
    const e = edge({ intent: "old but well-supported", supersededBy: "EDGE-9" });
    const links = [link(e.id, "EV-1", "supports")];
    const state = computeEdgeState(
      e,
      links,
      nodeMap(task, decision, ev("EV-1", "benchmark")),
      opts(),
    );
    expect(state).toBe("superseded");
  });

  it("bare edge (no intent, no evidence) -> hypothesis", () => {
    const e = edge({ intent: undefined, source: "inferred" });
    const state = computeEdgeState(e, [], nodeMap(task, decision), opts());
    expect(state).toBe("hypothesis");
  });

  describe("decay — prescriptions age, facts do not", () => {
    it("trusted prescription decays to stale after the threshold", () => {
      const e = edge({ from: "DECISION-1", to: "ISSUE-1", relation: "addresses", intent: "the chosen approach" });
      const links = [link(e.id, "EV-1", "supports")];
      const nm = nodeMap(decision, issue, ev("EV-1", "benchmark"));
      const fresh = computeEdgeState(e, links, nm, opts(T0));
      const old = computeEdgeState(e, links, nm, opts(T0 + DEFAULT_STALE_AFTER_MS + 1));
      expect(fresh).toBe("trusted");
      expect(old).toBe("stale");
    });

    it("a factual edge (task->issue) never decays", () => {
      const e = edge({ to: "ISSUE-1", relation: "resolves", intent: "closed it" });
      const links = [link(e.id, "EV-1", "supports")];
      const nm = nodeMap(task, issue, ev("EV-1", "test"));
      const far = computeEdgeState(e, links, nm, opts(T0 + 10 * DEFAULT_STALE_AFTER_MS));
      expect(far).toBe("trusted");
      expect(isPrescriptive(e)).toBe(false);
    });

    it("confidence halves each half-life for prescriptions, stays 1 for facts", () => {
      const presc = edge({ from: "DECISION-1", to: "ISSUE-1", relation: "addresses", intent: "x" });
      expect(confidence(presc, opts(T0))).toBeCloseTo(1, 3);
      expect(confidence(presc, opts(T0 + DEFAULT_HALF_LIFE_MS))).toBeCloseTo(0.5, 2);

      const fact = edge({ to: "ISSUE-1", relation: "resolves" });
      expect(confidence(fact, opts(T0 + 5 * DEFAULT_HALF_LIFE_MS))).toBe(1);
    });
  });

  describe("traversal predicates", () => {
    it("only trusted/observed are walked by default", () => {
      expect(isTrustedByDefault("trusted")).toBe(true);
      expect(isTrustedByDefault("observed")).toBe(true);
      expect(isTrustedByDefault("hypothesis")).toBe(false);
      expect(isTrustedByDefault("stale")).toBe(false);
    });
    it("superseded and refuted are history-only", () => {
      expect(isHistoryOnly("superseded")).toBe(true);
      expect(isHistoryOnly("refuted")).toBe(true);
      expect(isHistoryOnly("trusted")).toBe(false);
    });
  });
});
