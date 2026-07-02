# Project Memory（项目记忆）

**面向 AI 团队的组织级记忆。** 问的是*为什么*，而不只是*是什么*。

> Project Memory 不编造因果。它记录主张、证据，以及信任的生命周期。

今天，每一个 AI 会话都从零开始。对话记忆记住的是*一段聊天*，它不记得*这个仓库为什么长成今天这样*。Project Memory 就是缺失的那一层：多个 Agent、多个人、多个会话，跨越数月——让工作**不断累积，而不是每次重启**。

它是 [octopus-blackboard](https://github.com/octoryn/octopus-blackboard) 的姊妹项目：

```
工作发生
    │
    ▼
Blackboard        感知 —— “其他 Agent 在做什么？”     （证据捕获层）
    │  蒸馏
    ▼
Project Memory    学习 —— “我们为什么这样做？”         （因果信任层）
    │
    ▼
未来的决策
```

## 唯一的问题

不是“我们学到了什么？”，而是**“我们为什么这样做？”** 旗舰能力是 `why`——它**重建一条因果链**，而不是 `search`（后者只做检索）。

```
$ octomem why "Metal KV Cache"

why TASK-1  "Improve Metal KV Cache"
├─ implements → DECISION-1 "Pad conv weights to 64 bytes"  [· observed]
│     • commit EV-1 (supports) "a1b2c3 pad conv weights"
└─ resolves → ISSUE-1 "Metal compiler crashes on M1 Ultra"  [· observed]
   └─ addressed by → DECISION-3 "Pad conv weights to 128 bytes for M3"  [✓ trusted]
         • benchmark EV-4 (supports) "M3 stable at 128B"
```

## 纪律

整个产品就是一条规则：

> **每一条因果边都必须带有出处（provenance），否则它只能停留在 hypothesis。**

Agent 可以*提出*“某个 commit 解决了某个 issue”。但只有当**佐证性证据**（测试、基准、评审、或人工背书）支撑了所声明的意图时，系统才会把这条边升级为 **trusted**。没有证据，就没有可信的边——于是 `why` 是一份**可被辩护的因果记录**，而不是一台故事机。

信任有完整的生命周期：`claimed → hypothesis → trusted`，也会失去——`stale`（衰减/被质疑）、`superseded`（被更新的决策取代）、`refuted`（被证否，并作为*负知识*保留，防止 Agent 再次提出）。历史永不删除，只有信任会衰减。详见 [docs/edge-lifecycle.md](docs/edge-lifecycle.md)——这就是“宪法”。

三种稳定的节点类型——**Issue、Decision、Evidence**——外加 **Task** 作为只追加的出处锚点。“Knowledge” 刻意*不*存储，它是 `why` 查询的*结果*。没有知识图谱，没有需要学习的 ontology。

## 安装与运行

```bash
npm install
npm run build

# 约 2 秒看完整个理念
npm run demo

# 面向人的 CLI
node dist/cli.js why "Metal KV Cache"
node dist/cli.js search Metal --type issue
```

### 作为 MCP 服务器

```jsonc
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["/绝对路径/octopus-experience/dist/mcp.js"],
      "env": { "OCTOMEM_DB": "/绝对路径/.octomem/memory.db" }
    }
  }
}
```

工具：`remember`（记录工作 + 提出因果边）、`add_evidence` / `attest`（为边提供佐证或质疑）、`verify`（复活已 stale 的处方）、`search`、`why`。

## 状态

v0.1 —— 核心（生命周期引擎、`why` 重建、MCP 服务器、CLI）已就绪，宪法有测试覆盖。把 Blackboard 原始轨迹蒸馏为候选因果边的**蒸馏层**是下一个里程碑。

## 许可证

AGPL-3.0-or-later © Octoryn
