# 重构台账 — dsh-plugin-file-system-zc

> **本文件是本次重构的唯一进度权威。** 会话可能被多次压缩，任何时候接手请先读本文件恢复进度。
> **记账** = 登记任务；**销账** = 标记验收通过 + commit hash + 验收证据。
> 迁移源（**只读，禁止改动**）：`../dsh-plugin-file-system` @ `3a3f89e`（master，工作树干净）

---

## 0. 目标与红线

**目标**：严格对齐 DSH 主仓规范，新建本插件，把现插件全部功能完整迁移为 TypeScript + vitest/jsdom + per-file 100% 覆盖率。

**红线（违任一条即整体不合格）**：

1. **不改动现插件任何文件** —— `dsh-plugin-file-system` 必须保持原样可运行。
2. **功能零遗失** —— 迁移后行为契约与现插件一致：`/api/fs/*` 路由形状、conversation.view 槽（id `fs`，order 12）、四层能力集、书库布局、超时口径、产物 frontmatter 格式。
3. **每阶段四门禁全绿才销账**：`typecheck` / `lint` / `test` / `coverage`（+ `build`）。
4. **每步必须 git commit**，信息格式 `type(scope): 中文摘要`。
5. **主智能体不写实现代码**，只做拆解、分配、验收、提交。

---

## 1. 账目总表

状态取值：`待办` / `进行中` / `待验收` / `已销账`

### P0 准备 · 功能基线（防遗失）

| # | 任务 | 状态 | 负责 | 验收证据 | commit |
|---|---|---|---|---|---|
| T-01 | host 侧功能基线清点 | 进行中 | 子A | 功能清单（功能点→代码位置→行为契约） | - |
| T-02 | client 侧功能基线清点 | 进行中 | 子B | 同上 | - |
| T-03 | 契约与配置基线清点 | 进行中 | 子C | 同上 | - |
| T-04 | 汇总功能基线 + 迁移映射表 | 待办 | 主 | `docs/feature-baseline.md` | - |

### P1 骨架

| # | 任务 | 状态 | 负责 | 验收证据 | commit |
|---|---|---|---|---|---|
| T-10 | `package.json`：name/exports/files/`dsh.bundle`/`dsh.client`/engines/scripts | 待办 | - | - | - |
| T-11 | tsconfig 面分离（host / client / tests 三叶 + solution-only root） | 待办 | - | - | - |
| T-12 | 构建链路（tsdown + 客户端产物） | 待办 | - | - | - |
| T-13 | vitest + jsdom + per-file 100% 覆盖率门槛 | 待办 | - | - | - |
| T-14 | 装载三件套 `cordis.patch.yml` / `agent.cordis.yml` / `preset.yml` | 待办 | - | - | - |
| T-15 | README（对齐主仓双语与结构） | 待办 | - | - | - |
| T-16 | 骨架可挂载：空插件过真 Loader 的 REAL-composition 测试 | 待办 | - | - | - |

### P2 host 纯逻辑迁移

| # | 任务 | 状态 |
|---|---|---|
| T-20 | `fs-utils`（路径解析等） | 待办 |
| T-21 | `book-store`（书库定位） | 待办 |
| T-22 | `book-index`（`index.json` upsert） | 待办 |
| T-23 | `issues`（问题台账） | 待办 |
| T-24 | `task-utils`（超时与预设） | 待办 |
| T-25 | `prompt-loader`（提示词按能力定位） | 待办 |
| T-26 | `abilities/`（四能力描述符 + skeleton + doc-render） | 待办 |
| T-27 | P2 阶段验收（四门禁 + 纯逻辑 per-file 100%） | 待办 |

### P3 host 路由与状态机

| # | 任务 | 状态 |
|---|---|---|
| T-30 | `/api/fs/*` 路由全量迁移（形状逐条比对） | 待办 |
| T-31 | 任务状态机（生成/翻译任务生命周期） | 待办 |
| T-32 | `gen-executor` / `translate-executor` | 待办 |
| T-33 | 子 agent 编排（预设、超时、工具面白名单） | 待办 |
| T-34 | host 错误通道字典化（现插件待办 #20 一并解决） | 待办 |
| T-35 | P3 阶段验收 | 待办 |

### P4 client

| # | 任务 | 状态 |
|---|---|---|
| T-40 | `md-utils`（frontmatter / 文件名，无 DOM 纯逻辑） | 待办 |
| T-41 | conversation.view 槽注册（id `fs`，order 12） | 待办 |
| T-42 | 树 / 查看 / 编辑组件迁移 | 待办 |
| T-43 | 工作区切换与 localStorage 恢复 | 待办 |
| T-44 | P4 阶段验收（jsdom 下的组件测试） | 待办 |

### P5 测试迁移

| # | 任务 | 状态 |
|---|---|---|
| T-50 | 135 例 node:test → vitest（含并发/时序类用例） | 待办 |
| T-51 | 覆盖率补齐至 per-file 100%（含分支） | 待办 |

### P6 切换上线

| # | 任务 | 状态 |
|---|---|---|
| T-60 | profile 链接切换（`~/.dsh/profiles/web`） | 待办 |
| T-61 | 重启 dsh web + 人工冒烟 4 项 | 待办 |
| T-62 | 收口：台账同步 + 交付摘要归档 | 待办 |

---

## 2. 决策记录

| # | 决策 | 依据 | 日期 |
|---|---|---|---|
| D-1 | 包名用 `dsh-plugin-file-system-zc`（**非 scoped**），不采用 `@deepseek-ai/dsh-*` | `@deepseek-ai` 是 npm scope，仅该组织成员可发布；树外包冒用无意义，社区惯例亦为非 scoped（`dshmarket`、`dsh-quality-review` 实证）。主仓 `AGENTS.md:104` 对本插件**技术上不可行** | 2026-09-11 |
| D-2 | 覆盖率按 **per-file 100%（含分支）** | 用户明确要求「真严格」，对齐主仓 `AGENTS.md:68`。注意：现插件分支口径实测 `fs-utils` 88.75%，迁移后必须补齐 | 2026-09-11 |
| D-3 | 迁移源冻结为 `3a3f89e`，全程只读 | 防止迁移期间源被改动导致基线漂移 | 2026-09-11 |
| D-4 | 工程栈：TypeScript(strict) + vitest + jsdom + tsdown + 多 tsconfig 面分离 | 对齐主仓实测栈（参照 `apps/desktop`、`dsh-market`） | 2026-09-11 |
| D-5 | 主智能体不写实现代码，只做拆解/分配/验收/提交 | 用户明确要求 | 2026-09-11 |

---

## 3. 功能基线

由 T-01 / T-02 / T-03 填充，T-04 汇总为 `docs/feature-baseline.md`。**基线完成前不得开始迁移**。

---

## 4. 验收标准

每阶段销账必须同时满足：

1. `npm run typecheck` 通过（strict，无 `any` 无理由）
2. `npm run lint` 0 错 0 警告
3. `npm test` 全绿，且**无「单独跑才过」的用例**（并发可靠性，依据官方 `docs/testing.zh.md`）
4. `npm run test:coverage` per-file 100%（含分支）
5. `npm run build` 成功
6. 行为契约与现插件逐条比对无差异（对照 `docs/feature-baseline.md`）
7. 已 git commit，且台账对应行已销账

---

## 5. 变更日志

| 日期 | 事件 |
|---|---|
| 2026-09-11 | 台账建立；目标确立；P0 三个功能清点子任务开工 |
