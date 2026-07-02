# Architecture decision — `provenance/0` ingestion retired for `events/0`

**Origin of the review:** an independent maintainer's critique, from octopus-blackboard's "capture, don't interpret" perspective
**Applies to:** octopus-experience / Project Memory
**Date:** 2026-07-02
**Status:** RESOLVED — criticism accepted and acted on in Project Memory v0.4.0.

> Note: the filename is retained for history. An earlier draft of this note said
> Blackboard had "rejected and deleted" the export branch — that was never
> accurate and has been corrected below.

---

## The criticism (accepted)

Reviewed against the principle **"capture, don't interpret,"** Project Memory's
`provenance/0` bundle — when used as an **ingestion** protocol — was
**ontology-shaped**. Its payload was PM's own graph vocabulary: `issue` /
`decision` / `task` / `evidence` nodes, `resolves` / `addresses` / `implements`
edges, `supports` / `contradicts` stances, an `intent` field, and `inferred`
causal edges.

A protocol shaped like that forces **every producer to interpret on Project
Memory's behalf** — a CI job, a code host, an issue tracker, an agent, or a
coordination substrate would each have to guess at issues, decisions, and causal
edges it has no authority to assert. Interpretation leaks *out* of the consumer
and *into* producers. That is backwards.

> **Protocols transport facts. Consumers derive meaning.**

## The decision

1. **The review showed** that `provenance/0`, used as an ingestion protocol,
   leaked Project Memory's ontology into producers.
2. **Project Memory accepted the criticism.**
3. **Project Memory v0.4.0 replaced graph-bundle ingestion with `events/0`
   facts-only ingestion.** Producers now send signed *factual events*
   (`{ kind, id, at, actor, refs, contentHash, body }`) — no node types, edges,
   relations, stances, or trust on the wire. Project Memory **alone** derives
   issues, decisions, evidence, hypotheses, and trusted/stale/refuted edges, in
   `src/distill.ts`. The `provenance/0` graph bundle is retired as an ingestion
   protocol and is rejected on sight. See
   [ADR 0001](../adr/0001-events-not-ontology.md) and [protocol.md](../protocol.md).
4. **Blackboard's `v0.2.0` GitHub tag exists independently.** It includes an
   `export-provenance` command that emits the old graph shape. Whether to keep,
   change, or remove that is **Blackboard's decision alone** — the repositories
   are independent, and Project Memory neither controls nor assumes anything about
   Blackboard's roadmap. *(No claim is made here that Blackboard has removed or
   will remove the feature.)*
5. **Project Memory no longer depends on any Blackboard provenance export.** It
   ingests `events/0` facts from any producer, and makes complete sense with no
   specific producer — Blackboard included — in existence.

## Boundary going forward

The same signed **factual** bundle can feed Project Memory (which computes causal
trust), an audit system (which computes compliance), and an analytics system
(which computes metrics) — none coupled, and no producer forced to think in
Project Memory's ontology. Independence is semantic, not merely lexical: no shared
database, no shared code, and no shared ontology.

---

# 架构决策 —— `provenance/0` 摄取退役,改用 `events/0`

**评审来源:** 一位独立维护者的批评,站在 octopus-blackboard「只记录,不解释」的立场
**适用于:** octopus-experience / Project Memory
**日期:** 2026-07-02
**状态:** 已解决 —— 批评被接受,并已在 Project Memory v0.4.0 中落地。

> 说明:文件名保留以存档。本备忘早先的草稿曾写「Blackboard 已拒绝并删除导出分支」
> —— 那从来就不准确,已在下文更正。

## 被接受的批评

以「只记录,不解释」为准绳评审,Project Memory 的 `provenance/0` 包——当它被当作
**摄取**协议时——是**本体导向的**。它的 payload 就是 PM 自己的图词汇:`issue` /
`decision` / `task` / `evidence` 节点,`resolves` / `addresses` / `implements` 边,
`supports` / `contradicts` 立场,`intent` 字段,以及 `inferred` 因果边。

这样形状的协议会**迫使每个生产者替 Project Memory 做解释**——CI、代码托管、issue
追踪、agent、协作底座,都得去猜它无权断言的 issue、decision 和因果边。解释从消费者
**漏出**、渗进生产者。这是反的。

> **协议传输事实;消费者推导意义。**

## 决策

1. **评审表明**:`provenance/0` 作为摄取协议,把 Project Memory 的本体泄漏进了生产者。
2. **Project Memory 接受了这一批评。**
3. **Project Memory v0.4.0 用 `events/0` 纯事实摄取取代了图包摄取。** 生产者现在只发
   签名的**事实事件**(`{ kind, id, at, actor, refs, contentHash, body }`)——线上没有
   节点类型、边、关系、立场或信任。**仅由 Project Memory** 在 `src/distill.ts` 中
   派生 issues / decisions / evidence / 假设,以及 trusted·stale·refuted 边。
   `provenance/0` 图包作为摄取协议已退役,见到即拒。见
   [ADR 0001](../adr/0001-events-not-ontology.md) 与 [protocol.md](../protocol.md)。
4. **Blackboard 的 `v0.2.0` GitHub tag 独立存在。** 它含有一个 `export-provenance`
   命令,导出旧的图形状。是否保留、修改或移除,**完全是 Blackboard 自己的决定**——
   两个仓库相互独立,Project Memory 既不控制、也不假设 Blackboard 的路线。*(此处不声称
   Blackboard 已移除或将移除该功能。)*
5. **Project Memory 不再依赖任何 Blackboard 的 provenance 导出。** 它从任意生产者摄取
   `events/0` 事实,且在没有任何特定生产者(包括 Blackboard)存在时也完全成立。

## 今后的边界

同一份签名的**事实**包,可以同时喂给 Project Memory(算因果信任)、审计系统(算合规)、
分析系统(算指标)——彼此不耦合,也没有任何生产者被迫用 Project Memory 的本体思考。
独立是**语义上的**,不只是字面上的:无共享数据库、无共享代码、无共享本体。
