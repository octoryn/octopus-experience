/**
 * The constitution, as code.
 *
 * `computeEdgeState` is a PURE function of (edge, its evidence, the node types,
 * now). Trust is never stored — it is recomputed on read. That is what lets
 * confidence decay over time without any background job: the same edge returns
 * `trusted` today and `stale` a year from now, purely from `now`.
 *
 * Rules, in priority order:
 *   1. supersededBy set                     -> superseded   (history preserved)
 *   2. contradicted, no supporting evidence  -> refuted       (proven false)
 *   3. contradicted, but some support        -> stale         (contested)
 *   4. defended mechanism + intent           -> trusted       (decays -> stale)
 *   5. any mechanism, no intent              -> observed
 *   6. intent + aligning trace               -> hypothesis
 *   7. intent only                           -> claimed
 *   8. nothing                               -> hypothesis    (bare proposal)
 */

import {
  ALIGNING_KINDS,
  DEFENDING_KINDS,
  type EdgeState,
  type EvidenceLink,
  type MemoryEdge,
  type MemoryNode,
} from "./types.js";

/** Half-life of a prescription's confidence, in ms (default ~18 months). */
export const DEFAULT_HALF_LIFE_MS = 18 * 30 * 24 * 60 * 60 * 1000;

/**
 * A trusted prescription with no re-verification for this long is downgraded to
 * `stale` by the state machine (default ~12 months). Distinct from the smooth
 * confidence curve: this is the hard "stop trusting by default" threshold.
 */
export const DEFAULT_STALE_AFTER_MS = 12 * 30 * 24 * 60 * 60 * 1000;

export interface LifecycleOptions {
  now: number;
  halfLifeMs?: number;
  staleAfterMs?: number;
}

/**
 * An edge is prescriptive if it carries a "this is still the right way" claim —
 * i.e. an `addresses` edge (a decision answering an issue). Only prescriptions
 * decay. `implements` / `resolves` / `supersedes` are factual provenance: they
 * record what happened and never decay, even though they touch a decision.
 */
export function isPrescriptive(edge: MemoryEdge): boolean {
  return edge.relation === "addresses";
}

/** epoch used for decay/verification of an edge. */
function verificationBase(edge: MemoryEdge): number {
  return edge.lastVerified ?? edge.createdAt;
}

export function isDecayed(
  edge: MemoryEdge,
  opts: LifecycleOptions,
): boolean {
  const staleAfter = opts.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  return opts.now - verificationBase(edge) > staleAfter;
}

/**
 * Confidence in the range [0, 1]. Facts never decay (always 1). Prescriptions
 * decay by half every `halfLifeMs` since last verification. Re-verifying resets
 * the clock (see ProjectMemory.verify).
 */
export function confidence(edge: MemoryEdge, opts: LifecycleOptions): number {
  if (!isPrescriptive(edge)) return 1;
  const halfLife = opts.halfLifeMs ?? DEFAULT_HALF_LIFE_MS;
  const age = Math.max(0, opts.now - verificationBase(edge));
  return Number(Math.pow(0.5, age / halfLife).toFixed(4));
}

function linksFor(
  edge: MemoryEdge,
  links: EvidenceLink[],
): { supports: EvidenceLink[]; contradicts: EvidenceLink[] } {
  const supports: EvidenceLink[] = [];
  const contradicts: EvidenceLink[] = [];
  for (const l of links) {
    if (l.targetType !== "edge" || l.targetId !== edge.id) continue;
    if (l.stance === "supports") supports.push(l);
    else contradicts.push(l);
  }
  return { supports, contradicts };
}

export function computeEdgeState(
  edge: MemoryEdge,
  links: EvidenceLink[],
  nodeById: Map<string, MemoryNode>,
  opts: LifecycleOptions,
): EdgeState {
  // 1. Explicit override always wins — a superseded edge stays visible as history.
  if (edge.supersededBy) return "superseded";

  const all = linksFor(edge, links);
  // Evidence that arrived in a bundle whose signature did NOT verify is INERT:
  // recorded for audit, but it can neither defend nor contradict. Locally
  // produced evidence (verified === undefined) and validly signed evidence
  // (verified === true) both count. This stops an unsigned/forged bundle from
  // minting trust or refuting existing edges, without disabling local traces.
  const live = (l: EvidenceLink): boolean =>
    nodeById.get(l.evidenceId)?.verified !== false;
  const supports = all.supports.filter(live);
  const contradicts = all.contradicts.filter(live);

  // Classify supporting evidence by tier.
  let hasDefending = false;
  let hasAligning = false;
  for (const l of supports) {
    const evNode = nodeById.get(l.evidenceId);
    const kind = evNode?.evidenceKind;
    if (kind === "attestation") {
      // A human vouch defends only if it is cryptographically verified —
      // an unsigned attestation is just a claim anyone could forge.
      if (evNode?.verified) hasDefending = true;
      else hasAligning = true;
    } else if (kind && DEFENDING_KINDS.has(kind)) hasDefending = true;
    else if (kind && ALIGNING_KINDS.has(kind)) hasAligning = true;
  }
  const hasSupport = supports.length > 0;
  const hasIntent = Boolean(edge.intent && edge.intent.trim().length > 0);

  // 2 & 3. A live contradiction downgrades. No defense at all -> proven false.
  if (contradicts.length > 0) {
    return hasSupport ? "stale" : "refuted";
  }

  // 4. Fully defended causal claim.
  if (hasDefending && hasIntent) {
    if (isPrescriptive(edge) && isDecayed(edge, opts)) return "stale";
    return "trusted";
  }

  // 5. Mechanism present but no stated intent — a proven fact, not a causal claim.
  if (hasDefending || hasAligning) {
    return hasIntent ? "hypothesis" : "observed";
  }

  // 6/7/8. No supporting evidence.
  return hasIntent ? "claimed" : "hypothesis";
}

/** True when `why` should walk *through* this edge by default (not just show it). */
export function isTrustedByDefault(state: EdgeState): boolean {
  return state === "trusted" || state === "observed";
}

/** States shown only in history mode, never in the default `why` chain. */
export function isHistoryOnly(state: EdgeState): boolean {
  return state === "superseded" || state === "refuted";
}
