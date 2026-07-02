import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ProjectMemory } from "../src/memory.js";
import { ingestBlackboard } from "../src/adapters/blackboard.js";

const fresh = () => new ProjectMemory({ dbPath: ":memory:" });

/** A minimal octopus-blackboard-shaped database for the bridge to distill. */
function board(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE risks (id TEXT, title TEXT, severity TEXT, status TEXT, task_key TEXT, agent_id TEXT, created_at TEXT);
    CREATE TABLE tasks (id TEXT, key TEXT, title TEXT, description TEXT, created_by TEXT, created_at TEXT);
    CREATE TABLE decisions (id TEXT, agent_id TEXT, title TEXT, rationale TEXT, evidence TEXT, related_commits TEXT, related_tasks TEXT, created_at TEXT);
    CREATE TABLE reviews (id TEXT, commit_sha TEXT, reviewer_type TEXT, reviewer TEXT, outcome TEXT, note TEXT, created_at TEXT);
  `);
  const iso = "2026-01-01T00:00:00.000Z";
  db.prepare(`INSERT INTO risks VALUES (?,?,?,?,?,?,?)`).run("R1", "Metal crash on M1 Ultra", "high", "open", "T-metal", "claude", iso);
  db.prepare(`INSERT INTO tasks VALUES (?,?,?,?,?,?)`).run("t1", "T-metal", "Fix Metal crash", "pad conv weights", "claude", iso);
  db.prepare(`INSERT INTO decisions VALUES (?,?,?,?,?,?,?,?)`).run(
    "D1", "claude", "Pad conv weights to 64 bytes", "misalignment crashes the compiler", null,
    JSON.stringify(["sha-pad"]), JSON.stringify(["T-metal"]), iso,
  );
  return db;
}

describe("blackboard bridge", () => {
  it("distills risks/tasks/decisions into a causal graph with an inferred addresses edge", () => {
    const m = fresh();
    const r = ingestBlackboard(m, board());
    expect(r.issues).toBe(1);
    expect(r.tasks).toBe(1);
    expect(r.decisions).toBe(1);

    const issue = m.search("Metal crash", "issue")[0];
    const decision = m.search("Pad conv weights", "decision")[0];
    expect(issue).toBeTruthy();
    expect(decision).toBeTruthy();

    // decision -> issue is INFERRED with only a commit behind it: a hypothesis.
    const addr = m.outgoingEdges(decision.id, "addresses").find((e) => e.to === issue.id);
    expect(addr).toBeTruthy();
    expect(m.edgeState(addr!.id)).toBe("hypothesis");
    m.close();
  });

  it("an approved review is defending evidence — it promotes the inferred edge to trusted", () => {
    const m = fresh();
    const db = board();
    db.prepare(`INSERT INTO reviews VALUES (?,?,?,?,?,?,?)`).run(
      "rev1", "sha-pad", "human", "ran", "approved", "confirmed the fix", "2026-01-02T00:00:00.000Z",
    );
    ingestBlackboard(m, db);
    const decision = m.search("Pad conv weights", "decision")[0];
    const addr = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(addr.id)).toBe("trusted");

    // and it shows up as a lesson we trust
    const d = m.digest("Metal");
    expect(d.trusted.map((n) => n.title)).toContain("Pad conv weights to 64 bytes");
    m.close();
  });

  it("a rejected review contests a supported claim (-> stale)", () => {
    const m = fresh();
    const db = board();
    db.prepare(`INSERT INTO reviews VALUES (?,?,?,?,?,?,?)`).run(
      "rev2", "sha-pad", "human", "ran", "rejected", "regressed on M3", "2026-01-03T00:00:00.000Z",
    );
    ingestBlackboard(m, db);
    const decision = m.search("Pad conv weights", "decision")[0];
    const addr = m.outgoingEdges(decision.id, "addresses")[0];
    expect(m.edgeState(addr.id)).toBe("stale");
    m.close();
  });

  it("synthesises a task referenced by a decision but absent from the tasks table, and counts it once", () => {
    const m = fresh();
    const db = board();
    // a decision referencing a task key that has no row in `tasks`
    db.prepare(`INSERT INTO decisions VALUES (?,?,?,?,?,?,?,?)`).run(
      "D2", "claude", "Cache MPSGraph compilations", "compilation is slow", null, null,
      JSON.stringify(["T-ghost"]), "2026-01-01T00:00:00.000Z",
    );
    const first = ingestBlackboard(m, db);
    // T-metal (from tasks) + T-ghost (synthesised) = 2
    expect(first.tasks).toBe(2);
    const again = ingestBlackboard(m, db);
    expect(again.tasks).toBe(0);
    m.close();
  });

  it("is idempotent — re-ingesting the same board adds nothing new", () => {
    const m = fresh();
    const db = board();
    ingestBlackboard(m, db);
    const again = ingestBlackboard(m, db);
    expect(again.issues).toBe(0);
    expect(again.tasks).toBe(0);
    expect(again.decisions).toBe(0);
    expect(again.edges).toBe(0);
    expect(again.evidence).toBe(0);
    m.close();
  });
});
