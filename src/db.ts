/**
 * SQLite persistence. Trust/state is never stored here — only raw nodes, edges,
 * and evidence links. State is derived on read by src/lifecycle.ts, so the store
 * is an append-friendly ledger of facts, not a cache of conclusions.
 */
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  EdgeRelation,
  EvidenceKind,
  EvidenceLink,
  EvidenceStance,
  MemoryEdge,
  MemoryNode,
  NodeType,
  WriteSource,
} from "./types.js";

export class Store {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        title         TEXT NOT NULL,
        body          TEXT NOT NULL DEFAULT '',
        created_at    INTEGER NOT NULL,
        actor         TEXT,
        external_key  TEXT UNIQUE,
        last_verified INTEGER,
        evidence_kind TEXT,
        ref           TEXT
      );
      CREATE TABLE IF NOT EXISTS edges (
        id            TEXT PRIMARY KEY,
        from_id       TEXT NOT NULL REFERENCES nodes(id),
        to_id         TEXT NOT NULL REFERENCES nodes(id),
        relation      TEXT NOT NULL,
        intent        TEXT,
        source        TEXT NOT NULL,
        actor         TEXT,
        superseded_by TEXT REFERENCES edges(id),
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        last_verified INTEGER
      );
      CREATE TABLE IF NOT EXISTS evidence_links (
        id          TEXT PRIMARY KEY,
        evidence_id TEXT NOT NULL REFERENCES nodes(id),
        target_type TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        stance      TEXT NOT NULL,
        actor       TEXT,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_edges_from ON edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to   ON edges(to_id);
      CREATE INDEX IF NOT EXISTS idx_edges_tuple ON edges(from_id, to_id, relation);
      CREATE INDEX IF NOT EXISTS idx_links_tgt  ON evidence_links(target_id);
      CREATE INDEX IF NOT EXISTS idx_nodes_extkey ON nodes(external_key);
    `);
  }

  /** Next id for a table, e.g. nextId("edges", "EDGE") -> "EDGE-7". */
  nextId(table: "edges" | "evidence_links", prefix: string): string {
    // Count is fine for a monotonic id since rows are never deleted.
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
      .get() as { n: number };
    return `${prefix}-${row.n + 1}`;
  }

  /** Next per-type node id, e.g. nextNodeId("DECISION", "decision") -> "DECISION-3". */
  nextNodeId(prefix: string, type: NodeType): string {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM nodes WHERE type = ?`)
      .get(type) as { n: number };
    return `${prefix}-${row.n + 1}`;
  }

  insertNode(n: MemoryNode): void {
    this.db
      .prepare(
        `INSERT INTO nodes (id,type,title,body,created_at,actor,external_key,last_verified,evidence_kind,ref)
         VALUES (@id,@type,@title,@body,@createdAt,@actor,@externalKey,@lastVerified,@evidenceKind,@ref)`,
      )
      .run({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        actor: n.actor ?? null,
        externalKey: n.externalKey ?? null,
        lastVerified: n.lastVerified ?? null,
        evidenceKind: n.evidenceKind ?? null,
        ref: n.ref ?? null,
      });
  }

  getNodeByExternalKey(externalKey: string): MemoryNode | undefined {
    const r = this.db
      .prepare(`SELECT * FROM nodes WHERE external_key = ?`)
      .get(externalKey) as NodeRow | undefined;
    return r ? rowToNode(r) : undefined;
  }

  findEdge(from: string, to: string, relation: string): MemoryEdge | undefined {
    const r = this.db
      .prepare(`SELECT * FROM edges WHERE from_id=? AND to_id=? AND relation=?`)
      .get(from, to, relation) as EdgeRow | undefined;
    return r ? rowToEdge(r) : undefined;
  }

  findLink(
    evidenceId: string,
    targetId: string,
    stance: string,
  ): EvidenceLink | undefined {
    const r = this.db
      .prepare(
        `SELECT * FROM evidence_links WHERE evidence_id=? AND target_id=? AND stance=?`,
      )
      .get(evidenceId, targetId, stance) as LinkRow | undefined;
    return r ? rowToLink(r) : undefined;
  }

  insertEdge(e: MemoryEdge): void {
    this.db
      .prepare(
        `INSERT INTO edges (id,from_id,to_id,relation,intent,source,actor,superseded_by,created_at,updated_at,last_verified)
         VALUES (@id,@from,@to,@relation,@intent,@source,@actor,@supersededBy,@createdAt,@updatedAt,@lastVerified)`,
      )
      .run({
        id: e.id,
        from: e.from,
        to: e.to,
        relation: e.relation,
        intent: e.intent ?? null,
        source: e.source,
        actor: e.actor ?? null,
        supersededBy: e.supersededBy ?? null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        lastVerified: e.lastVerified ?? null,
      });
  }

  insertLink(l: EvidenceLink): void {
    this.db
      .prepare(
        `INSERT INTO evidence_links (id,evidence_id,target_type,target_id,stance,actor,created_at)
         VALUES (@id,@evidenceId,@targetType,@targetId,@stance,@actor,@createdAt)`,
      )
      .run({
        id: l.id,
        evidenceId: l.evidenceId,
        targetType: l.targetType,
        targetId: l.targetId,
        stance: l.stance,
        actor: l.actor ?? null,
        createdAt: l.createdAt,
      });
  }

  setEdgeSuperseded(edgeId: string, supersededBy: string, when: number): void {
    this.db
      .prepare(`UPDATE edges SET superseded_by=?, updated_at=? WHERE id=?`)
      .run(supersededBy, when, edgeId);
  }

  touchEdgeVerified(edgeId: string, when: number): void {
    this.db
      .prepare(`UPDATE edges SET last_verified=?, updated_at=? WHERE id=?`)
      .run(when, when, edgeId);
  }

  touchNodeVerified(nodeId: string, when: number): void {
    this.db
      .prepare(`UPDATE nodes SET last_verified=? WHERE id=?`)
      .run(when, nodeId);
  }

  getNode(id: string): MemoryNode | undefined {
    const r = this.db.prepare(`SELECT * FROM nodes WHERE id=?`).get(id) as
      | NodeRow
      | undefined;
    return r ? rowToNode(r) : undefined;
  }

  getEdge(id: string): MemoryEdge | undefined {
    const r = this.db.prepare(`SELECT * FROM edges WHERE id=?`).get(id) as
      | EdgeRow
      | undefined;
    return r ? rowToEdge(r) : undefined;
  }

  allNodes(): MemoryNode[] {
    return (this.db.prepare(`SELECT * FROM nodes`).all() as NodeRow[]).map(
      rowToNode,
    );
  }

  allEdges(): MemoryEdge[] {
    return (this.db.prepare(`SELECT * FROM edges`).all() as EdgeRow[]).map(
      rowToEdge,
    );
  }

  allLinks(): EvidenceLink[] {
    return (
      this.db.prepare(`SELECT * FROM evidence_links`).all() as LinkRow[]
    ).map(rowToLink);
  }

  /** Edges touching a node in either direction. */
  edgesTouching(nodeId: string): MemoryEdge[] {
    return (
      this.db
        .prepare(`SELECT * FROM edges WHERE from_id=? OR to_id=?`)
        .all(nodeId, nodeId) as EdgeRow[]
    ).map(rowToEdge);
  }

  searchNodes(query: string, type?: NodeType): MemoryNode[] {
    const like = `%${query}%`;
    const sql = type
      ? `SELECT * FROM nodes WHERE type=? AND (title LIKE ? OR body LIKE ?) ORDER BY created_at DESC`
      : `SELECT * FROM nodes WHERE (title LIKE ? OR body LIKE ?) ORDER BY created_at DESC`;
    const rows = (
      type
        ? this.db.prepare(sql).all(type, like, like)
        : this.db.prepare(sql).all(like, like)
    ) as NodeRow[];
    return rows.map(rowToNode);
  }

  close(): void {
    this.db.close();
  }
}

interface NodeRow {
  id: string;
  type: NodeType;
  title: string;
  body: string;
  created_at: number;
  actor: string | null;
  external_key: string | null;
  last_verified: number | null;
  evidence_kind: EvidenceKind | null;
  ref: string | null;
}
interface EdgeRow {
  id: string;
  from_id: string;
  to_id: string;
  relation: EdgeRelation;
  intent: string | null;
  source: WriteSource;
  actor: string | null;
  superseded_by: string | null;
  created_at: number;
  updated_at: number;
  last_verified: number | null;
}
interface LinkRow {
  id: string;
  evidence_id: string;
  target_type: "edge" | "node";
  target_id: string;
  stance: EvidenceStance;
  actor: string | null;
  created_at: number;
}

function rowToNode(r: NodeRow): MemoryNode {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    createdAt: r.created_at,
    actor: r.actor ?? undefined,
    externalKey: r.external_key ?? undefined,
    lastVerified: r.last_verified ?? undefined,
    evidenceKind: r.evidence_kind ?? undefined,
    ref: r.ref ?? undefined,
  };
}
function rowToEdge(r: EdgeRow): MemoryEdge {
  return {
    id: r.id,
    from: r.from_id,
    to: r.to_id,
    relation: r.relation,
    intent: r.intent ?? undefined,
    source: r.source,
    actor: r.actor ?? undefined,
    supersededBy: r.superseded_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastVerified: r.last_verified ?? undefined,
  };
}
function rowToLink(r: LinkRow): EvidenceLink {
  return {
    id: r.id,
    evidenceId: r.evidence_id,
    targetType: r.target_type,
    targetId: r.target_id,
    stance: r.stance,
    actor: r.actor ?? undefined,
    createdAt: r.created_at,
  };
}
