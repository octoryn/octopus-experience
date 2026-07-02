/**
 * Blackboard bridge — the load-bearing half of "Awareness -> Learning".
 *
 * octopus-blackboard is the cheap, ambient evidence-capture layer: it already
 * records risks, tasks, decisions, commits and reviews as agents work. This
 * adapter distills that raw stream into Project Memory's causal graph:
 *
 *   risk      -> issue node
 *   task      -> task node
 *   decision  -> decision node (rationale becomes the edge's intent)
 *   a decision + a task + the risk that task addresses
 *             -> an INFERRED `addresses` edge (decision -> issue)
 *   related commit  -> aligning evidence  (keeps the edge a hypothesis)
 *   review approved -> defending evidence (can promote it to trusted)
 *   review rejected -> contradicting evidence (can refute it)
 *
 * Nothing is fabricated as trusted: the inferred `addresses` edge stays a
 * hypothesis until a review or benchmark defends it. Idempotent via externalKey,
 * so re-running against a growing board only adds what's new.
 */
import Database from "better-sqlite3";
import type { ProjectMemory } from "../memory.js";

export interface BlackboardIngestResult {
  issues: number;
  tasks: number;
  decisions: number;
  edges: number;
  evidence: number;
  log: string[];
}

type Row = Record<string, unknown>;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** blackboard stores timestamps as ISO text; convert to epoch ms. */
function ms(v: unknown): number | undefined {
  const s = str(v);
  if (!s) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : t;
}

/** related_tasks / related_commits are free-form text: JSON array, or delimited. */
function parseList(v: unknown): string[] {
  const s = str(v);
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(String).map((x) => x.trim()).filter(Boolean);
  } catch {
    /* not JSON — fall through */
  }
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function hasTable(db: Database.Database, name: string): boolean {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
      .get(name),
  );
}

function readAll(db: Database.Database, table: string): Row[] {
  if (!hasTable(db, table)) return [];
  return db.prepare(`SELECT * FROM ${table}`).all() as Row[];
}

export function ingestBlackboard(
  memory: ProjectMemory,
  source: string | Database.Database,
): BlackboardIngestResult {
  const db =
    typeof source === "string"
      ? new Database(source, { readonly: true, fileMustExist: true })
      : source;
  const r: BlackboardIngestResult = { issues: 0, tasks: 0, decisions: 0, edges: 0, evidence: 0, log: [] };

  try {
    // 1. risks -> issues, remembering which task_key each risk hangs off.
    const taskKeyToIssue = new Map<string, string>();
    for (const risk of readAll(db, "risks")) {
      const key = `bb:risk:${String(risk.id)}`;
      const existed = Boolean(memory.getNodeByExternalKey(key));
      const issue = memory.addNode(
        {
          type: "issue",
          title: str(risk.title) ?? "(untitled risk)",
          body: `severity: ${str(risk.severity) ?? "?"} · status: ${str(risk.status) ?? "?"}`,
          externalKey: key,
          actor: str(risk.agent_id),
        },
        ms(risk.created_at),
      );
      if (!existed) r.issues += 1;
      const tk = str(risk.task_key);
      if (tk) taskKeyToIssue.set(tk, issue.id);
    }

    // 2. tasks -> task nodes.
    const taskKeyToNode = new Map<string, string>();
    for (const task of readAll(db, "tasks")) {
      const bkey = str(task.key) ?? String(task.id);
      const key = `bb:task:${bkey}`;
      const existed = Boolean(memory.getNodeByExternalKey(key));
      const node = memory.addNode(
        {
          type: "task",
          title: str(task.title) ?? bkey,
          body: str(task.description) ?? "",
          externalKey: key,
          actor: str(task.created_by),
        },
        ms(task.created_at),
      );
      if (!existed) r.tasks += 1;
      taskKeyToNode.set(bkey, node.id);
    }

    const ensureTask = (bkey: string, at?: number): string => {
      const existing = taskKeyToNode.get(bkey);
      if (existing) return existing;
      const key = `bb:task:${bkey}`;
      const existedInDb = Boolean(memory.getNodeByExternalKey(key));
      const node = memory.addNode({ type: "task", title: bkey, externalKey: key }, at);
      taskKeyToNode.set(bkey, node.id);
      if (!existedInDb) r.tasks += 1;
      return node.id;
    };

    // 3. decisions -> decision nodes + inferred causal edges.
    for (const dec of readAll(db, "decisions")) {
      const at = ms(dec.created_at);
      const dkey = `bb:decision:${String(dec.id)}`;
      const existed = Boolean(memory.getNodeByExternalKey(dkey));
      const decision = memory.addNode(
        {
          type: "decision",
          title: str(dec.title) ?? "(untitled decision)",
          body: str(dec.rationale) ?? "",
          externalKey: dkey,
          actor: str(dec.agent_id),
        },
        at,
      );
      if (!existed) r.decisions += 1;
      const intent = str(dec.rationale);

      const relatedTasks = parseList(dec.related_tasks);
      const addressedIssues = new Set<string>();
      for (const tk of relatedTasks) {
        const taskId = ensureTask(tk, at);
        // task implements decision (provenance)
        if (!memory.outgoingEdges(taskId, "implements").some((e) => e.to === decision.id)) r.edges += 1;
        memory.addEdge({ from: taskId, to: decision.id, relation: "implements", source: "observed" }, at);
        // and the risk that task addresses becomes the issue this decision addresses
        const issueId = taskKeyToIssue.get(tk);
        if (issueId) {
          if (!memory.outgoingEdges(taskId, "resolves").some((e) => e.to === issueId)) r.edges += 1;
          memory.addEdge({ from: taskId, to: issueId, relation: "resolves", source: "observed" }, at);
          addressedIssues.add(issueId);
        }
      }

      // inferred: this decision addresses those issues — a hypothesis until defended.
      const addressEdges: string[] = [];
      for (const issueId of addressedIssues) {
        if (!memory.outgoingEdges(decision.id, "addresses").some((e) => e.to === issueId)) r.edges += 1;
        const edge = memory.addEdge(
          { from: decision.id, to: issueId, relation: "addresses", intent, source: "inferred" },
          at,
        );
        addressEdges.push(edge.id);
      }

      // related commits -> aligning evidence on the addresses edges.
      const commits = parseList(dec.related_commits);
      for (const sha of commits) {
        const evKey = `ev:commit:${sha}`;
        const existed = Boolean(memory.getNodeByExternalKey(evKey));
        const ev = memory.addNode(
          { type: "evidence", title: sha, evidenceKind: "commit", ref: sha, externalKey: evKey },
          at,
        );
        if (!existed) r.evidence += 1;
        for (const edgeId of addressEdges) {
          memory.addEvidence({ evidence: ev.id, target: edgeId, targetType: "edge", stance: "supports" }, at);
        }
      }

      // reviews on those commits -> defending / contradicting evidence.
      for (const sha of commits) {
        for (const review of readAll(db, "reviews")) {
          if (str(review.commit_sha) !== sha) continue;
          const outcome = str(review.outcome) ?? "commented";
          const stance = outcome === "approved" ? "supports" : outcome === "commented" ? undefined : "contradicts";
          if (!stance) continue;
          const revKey = `ev:review:${String(review.id)}`;
          const revExisted = Boolean(memory.getNodeByExternalKey(revKey));
          const rev = memory.addNode(
            {
              type: "evidence",
              title: `review ${outcome}: ${str(review.note) ?? sha}`,
              evidenceKind: "review",
              ref: sha,
              externalKey: revKey,
              actor: str(review.reviewer),
            },
            ms(review.created_at),
          );
          if (!revExisted) r.evidence += 1;
          for (const edgeId of addressEdges) {
            const b = memory.edgeState(edgeId, ms(review.created_at));
            const a = memory.addEvidence(
              { evidence: rev.id, target: edgeId, targetType: "edge", stance, actor: str(review.reviewer) },
              ms(review.created_at),
            );
            if (a && a !== b) r.log.push(`${edgeId}: ${b} -> ${a}  (review ${outcome})`);
          }
        }
      }
    }

    return r;
  } finally {
    if (typeof source === "string") db.close();
  }
}
