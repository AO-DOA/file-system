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

## 0.1 会话恢复指引（**压缩后先读这里**）

本任务长期运行、会话可能被多次压缩。**全部状态已落盘**，按顺序读以下文件即可无损恢复：

1. **本文件** `PROGRESS.md` —— 进度权威：账目总表（§1）+ 决策记录（§2）
2. `docs/feature-baseline.md` —— 功能基线与迁移映射表，P2–P5 的派发依据
3. `docs/baseline/{host,client,contracts}.md` —— 三份逐行功能清点（含行号与契约）
4. `docs/spec-p1-skeleton.md`、`docs/spec-p2-pure-logic.md` —— 各阶段执行规格

**进度快照**（更新于 2026-09-11）：

| 阶段 | 状态 |
|---|---|
| P0 功能基线（T-01~T-04） | **完成**，四份文档已提交 |
| P1 骨架（T-10 P1-A / T-11 P1-B / T-12 README） | P1-A 进行中，其余待办 |
| P2 host 纯逻辑 | 规格已就绪（`spec-p2-pure-logic.md`），待 P1-A 完成后派发 |
| P3 host 路由与状态机 / P4 client / P5 测试迁移 / P6 切换上线 | 待办 |

**下一步动作**：验收 T-10（P1-A 骨架，四条命令 + 产物头部契约）→ 销账并提交 → 派发 T-11（P1-B 装载与挂载）→ 派发 P2-A。

**三条最易丢的约束**：① 迁移源 `../dsh-plugin-file-system` **只读**，冻结于 `3a3f89e`；② 主智能体**不写实现代码**，只做拆解/分配/验收/提交；③ 每步必须**记账（更新本文件）+ commit**。

---

## 0.2 主智能体行为边界（**硬约束**，2026-09-11 因违规追加）

**背景**：2026-09-11 在「让模型能自主压缩会话」的调查中，主智能体亲自读源码、跑 `cordis_inspect_*` 查契约、并亲自 `cordis_define` 了插件草案，**违反**用户设定的「主智能体只做任务拆解、分配、验收与 git 保存；具体查询与重构交子智能体执行」。

**禁止（主智能体不得亲自执行）**：

1. 为理解或实现某项技术而**读源码、跑 `cordis_inspect_*`、查 Service/Event/Slot/Tool 契约**；
2. **编写实现代码**（含动态插件的 `code.host` / `code.client`）；
3. 为写规格而**预先调研技术细节**——规格只写「做什么 + 验收标准」，不替子智能体决定「怎么做」（不得把 `node:test→vitest` 之类的映射表、API 签名清单预先塞进规格）。

**允许**：

1. 拆解任务、定义验收标准、编写**任务级**规格；
2. 派发、steer、验收（读子任务的**产出物**用于核对，不据此自行推导实现）；
3. 写台账、决策记录、账目销账；
4. `git add` / `git commit`；
5. 仅在子任务不可用、或用户明确指示时亲自执行——**且必须在台账记录例外与原因**。

**违规记录**：见决策 R-1。

---

## 1. 账目总表

状态取值：`待办` / `进行中` / `待验收` / `已销账`

### P0 准备 · 功能基线（防遗失）

| # | 任务 | 状态 | 负责 | 验收证据 | commit |
|---|---|---|---|---|---|
| T-01 | host 侧功能基线清点 | **已销账** | 子A | `docs/baseline/host.md`（141 行）；11 条路由全表；11 迁移点；18 风险；1 高危（G-1） | git log |
| T-02 | client 侧功能基线清点 | **已销账** | 子B | `docs/baseline/client.md`（261 行）；171 功能点；72 个 i18n key 闭环校验通过；10 项不一致裁决点 | git log |
| T-03 | 契约与配置基线清点 | **已销账** | 子C | `docs/baseline/contracts.md`（391 行）；含 2026-09-11 实测 lint/test/coverage 数据与纯逻辑导出面 | git log |
| T-04 | 汇总功能基线 + 迁移映射表 | **已销账** | 主 | `docs/feature-baseline.md`：逐字保留清单 / 必改清单 / G-1~G-11 登记 / 迁移映射表 | git log |

### P1 骨架

> 执行规格见 `docs/spec-p1-skeleton.md`（含官方依据与验收标准）。派发单元：**P1-A 工程基础**、**P1-B 装载与挂载**。

| # | 任务 | 状态 | 负责 | 验收证据 | commit |
|---|---|---|---|---|---|
| T-10 | **P1-A 工程基础**：`package.json` / tsconfig 四面 / `.oxlintrc.json` / `vitest.config.ts` / `tsdown.config.ts` / `.gitignore` / `LICENSE` + 最小 host、client 入口桩 | 进行中 | 子P1A | 四门禁可跑通 + 产物头部契约自检 | - |
| T-11 | **P1-B 装载与挂载**：`cordis.patch.yml` / `agent.cordis.yml` / `preset.yml` + 占位槽（id `fs`，order 12）与占位路由 + REAL-composition 测试 | 待办 | - | 过真 Loader 挂载，断言外部可观测状态 | - |
| T-12 | README（对齐主仓结构） | 待办 | - | - | - |

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
| D-6 | tsconfig 采用 **三 leaf + solution-only root**（`tsc -b` 驱动）；**待实测** host/client 是否触发 cordis `Context` 声明合并冲突——若无冲突，按 `packages/AGENTS.md:23`「ordinary two-entry Client plugins do not split」退回两文件结构 | `<checkout>/docs/development.zh.md:68,74`、`<checkout>/packages/AGENTS.md:23` | 2026-09-11 |
| D-7 | 构建产物**不入库**（`.gitignore` 含 `lib/`、`client/`） | 主仓「源平面 vs 产物平面不混」`AGENTS.md:120`。与参照实现 `dsh-market`（提交 `client.js`）相反，需在交付摘要中说明差异 | 2026-09-11 |
| D-8 | **迁移遵循行为等价**：默认逐字保留现插件行为（含既有缺陷），不趁机改功能。仅两类例外：(a) **无任何引用的死代码**（T-02 实测：`cardDismissed`/`setCardDismissed`、`genStatus`、未消费的 `isMdFile`/`isBookFile`/`picker`、4 个无 JS 引用的 CSS 类）可删；(b) **资源泄漏类**（拖拽 `mousemove`/`mouseup` 无 cleanup、`pollTask` 的 `setTimeout` 无 `clearTimeout`）在 jsdom 测试下必然暴露，可修正但**必须单独记账**并在交付摘要中列明行为差异 | 用户要求「功能不能遗失」；例外依据见 T-02 报告「附加」第 1/2/3/8 项 | 2026-09-11 |
| D-9 | T-02 报告提出的 7 项**真实缺陷**（目录重复请求同一 `/read`、切换文件静默丢弃未保存编辑、`refreshRoot` 失败不上屏、未消费 `conversation.view` owner props 等）**本轮不修**，按 D-8 逐字保留，仅在 `docs/feature-baseline.md` 中登记为「已知行为」，留待迁移完成后由用户决定是否开新账目修正 | 行为等价优先；避免重构与改bug耦合导致无法判定回归来源 | 2026-09-11 |
| D-10 | **高危缺陷的处置**：`POST /delete` 无 `path` 必填校验 → `path` 缺失时 `abs === root` 并 `rm(recursive:true, force:true)`，**可递归删除整个工作区根**（`src/host/index.js:258-262`）；`POST /write`、`POST /mkdir` 同样无必填校验。**决定：按 D-8 逐字保留**——依据是这三条路由**无任何 client 调用**（T-01 已 grep 证实），暴露面仅限直连 API；迁移目标是行为等价，不是修 bug。**但必须**在 `docs/feature-baseline.md` 与最终交付摘要中**显著标注为「已知高危」**，由用户决定是否另开账目修正 | 用户要求「功能不能遗失」；T-01 报告 §A 路由表与 §F-3 迁移风险 | 2026-09-11 |
| D-11 | client 采用 **`.tsx` + JSX**（`jsx: react-jsx`）替换现有 `React.createElement`；`react/jsx-runtime` 必须进 tsdown externals | 用户要求「严格按主仓规范重构」；主仓 client 与参照实现 `dsh-market` 均为 `.tsx`。风险由「逐段对照 createElement 实参顺序」+「171 功能点对照验收」控制。规格见 `docs/spec-p4-client.md` | 2026-09-11 |
| R-1 | **流程违规记录**：主智能体在「会话压缩能力」任务中亲自做源码调研（读 `command-compact` 实现、跑 `cordis_inspect_*` 查 `compaction`/`Agent` 契约、读 `ToolDefinition` 定义）并亲自 `cordis_define` 了插件草案 `cmpct-1/pkg-1`，违反用户设定的指挥边界。**改进**：追加 §0.2 硬约束；剩余实现全部移交子智能体接管。**后续纪律**：一切技术调研与实现一律派子智能体，主智能体只做拆解、派发、验收、记账、提交 | 用户直接指正 | 2026-09-11 |
| R-2 | **委派的边界（实测发现，已修正）**：① **插件生命周期**归定义它的会话（子智能体的 `cmpct-2/pkg-2` 归其会话）；② 但**工具注册是进程级的**——子智能体注册的 `compact_context` 在主智能体会话中同样可见（证据：主智能体尝试 `cordis_run` 自己的同名 Package 时报 `tool "compact_context" is already registered`）。**结论**：凡「给主智能体新增运行时能力」的任务，**纯委派即可闭环**，无需主智能体亲自 define。先前"父会话不可用"的判断**已推翻**。未使用的 `cmpct-1/pkg-3` 保持未激活 | 主智能体 run 冲突报错 + 子智能体 `3eec5d11` 报告 | 2026-09-11 |

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
| 2026-09-11 | 取得主仓 tsconfig 面结构的官方依据（`docs/development.zh.md:58-74`）；写入 **P1 骨架执行规格** `docs/spec-p1-skeleton.md`；P1 细化为 P1-A / P1-B 两个派发单元；新增决策 D-6、D-7 |
| 2026-09-11 | T-02 验收并落盘（`docs/baseline/client.md`，261 行）；新增决策 D-8/D-9/D-10（迁移等价原则、7 项真实缺陷保留、高危缺陷 `/delete` 保留并须显著标注） |
| 2026-09-11 | T-01 验收并落盘（`docs/baseline/host.md`，141 行）；**T-04 汇总完成**（`docs/feature-baseline.md`：逐字保留清单 / 必改清单 / G-1~G-11 已知行为登记 / 迁移映射表）；修正 host.md 一处笔误 `<stdem>`→`<stem>` |
