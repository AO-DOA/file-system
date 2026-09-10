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
| P1 骨架（T-10 P1-A / T-11 P1-B / T-12 README / T-13 skills） | **P1-A 已销账**（`1c418aa`）、**P1-B 已销账**（五门禁全绿，见 §5）；**T-13 skills 迁移进行中**（缺口见 §5）；T-12 README 待办 |
| P2 host 纯逻辑 | **T-20（P2-A）进行中**（含 D-6 核验）；T-21/T-22/T-23/T-24 待办 |
| P3 host 路由与状态机 / P4 client / P5 测试迁移 / P6 切换上线 | 待办 |

**下一步动作**：收 T-13（`skills/` 迁移）→ 与 T-11 一并销账并 commit → 收 P2-A（五门禁 + 导出面 diff + D-6 结论）→ 派 P2-B/C/D。

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

## 0.3 委派规范（多级委派）

**背景**：2026-09-11 用户指出 —— P1-B 的派发包过大（5 项任务：三件套 / 入口契约 / 占位挂载 / REAL-composition / D-6），且未授权子智能体自行分派子任务，导致其串行推进、轮次拉长。用户要求：**对多任务，应给子智能体派遣子智能体的能力**。

**规范**：

1. **任务包上限**：单个派发包**不超过 3 项**可独立验收的交付物；超过则必须先拆包，或在 prompt 中明确要求其二级委派。
2. **显式授权二级委派**：派发 prompt 中**必须**写入「你可以且应当为其中独立的工作派发你自己的子智能体（`subagent` 工具）」，并给出具体拆分建议。
3. **层级与职责**：主智能体拆阶段（P0–P6）→ 阶段子智能体拆交付物 → 交付物可再拆原子任务。**验收与记账仍只在主智能体**；中间层的子任务结论由该层子智能体汇总回报。
4. **回报义务**：使用了二级委派的子智能体，必须在报告中列出「派了哪些子任务、各自结论」，供主智能体判断是否需复核。

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
| T-10 | **P1-A 工程基础**：`package.json` / tsconfig 四面 / `.oxlintrc.json` / `vitest.config.ts` / `tsdown.config.ts` / `.gitignore` / `LICENSE` + 最小 host、client 入口桩 | **已销账** | 子P1A（主智能体代验收） | 四条命令 exit=0：typecheck / lint（0 warn 0 err）/ test（passWithNoTests）/ build（banner 自检通过）；产物头部契约为 `window.__ModuleLoader__.load({ id: "dsh-plugin-file-system-zc", ...`；覆盖率门槛 `perFile: true` + 四项 100% | `1c418aa` |
| T-11 | **P1-B 装载与挂载**：`cordis.patch.yml` / `agent.cordis.yml` / `preset.yml`（内容照 `docs/baseline/contracts.md` §B 搬）+ 占位槽（id `fs`，order 12）与占位路由 + REAL-composition 测试；**并须**① 把 host/client 的 `name` 与 `inject` 对齐 `feature-baseline.md` §2.1；② 补做 T-10 未交付的 **D-6 专项**（host/client 同 program 是否触发 `Context` 声明合并冲突） | **已销账** | 子P1B（**中止后由主智能体代验收**，守 §0.2：只跑门禁读产物，未亲自实现） | **五门禁全绿**（主智能体实测）：`typecheck` exit 0；`lint` 0 错 0 警告（4 files / 80 rules）；`test` 3 passed；`test:coverage` exit 0；`build` 成功（`client/client.js` 1.36 kB + banner 校验通过）。`tests/real-composition.spec.ts`（**178 行**）确为**真过 Loader**：`new Context()` + `ctx.plugin(Loader)` + `builtins.include` + `loader.create()/await()`，**只替换模块解析一道缝**（4 宿主服务用桩，真插件仍从 `../src/host/index.ts` 加载），断言全为外部可观测状态：Loader entry tree（row id 以 `:fs` 结尾、name 为包名）、**真 HTTP loopback**（`/api/fs/__ping` 200 + 未知路由 404，JSON 逐字比对）、槽表（`conversation.view` / `id fs` / `order 12` / label `文件系统`）、`cordis.patch.yml` 与 `package.json` 的 `dsh.bundle.patch` 一致性。**这正是源插件待办 #19 所要求的做法**（真过 Loader 而非自造 ctx 桩）——迁移版正面解决。三件套与入口契约已另行预检通过 | 见 §5 |
| T-12 | README（对齐主仓结构） | 待办 | - | - | - |
| T-13 | **`skills/` 目录迁移**（P1-B 遗留缺口）：源 5 技能 13 文件**逐字复制**到本仓 `skills/` + `package.json` 的 `files` 补 `"skills"` | 进行中 | 子P1C | `diff -r` 空输出 + sha256 对照表 + 可执行位一致 + 引用扫描结论，落盘 `docs/p1c-skills-migration.md` | - |

### P2 host 纯逻辑迁移

| # | 任务 | 状态 |
|---|---|---|
> 规格：`docs/spec-p2-pure-logic.md`。派发单元 A→B/C/D（A 为前置，其余可并行）。

| # | 任务 | 状态 |
|---|---|---|
| T-20 | **P2-A 基础层**：`fs-utils`（238 行/25 导出）+ `locale`（100 行/3 导出，72 键）+ D-6 核验 | **进行中**（子P2A，已授权二级委派） |
| T-21 | **P2-B 书库层**：`book-store` + `book-index` + `issues` | 待办 |
| T-22 | **P2-C 任务与提示词**：`task-utils` + `prompt-loader` | 待办 |
| T-23 | **P2-D 能力目录**：`abilities/` 四能力（描述符 + skeleton + doc-render）+ `registry`；`prompt.md` 原样保留 | 待办 |
| T-24 | P2 阶段验收（四门禁 + 本阶段新增文件 file 级 行/函数/分支 100%） | 待办 |

### P3 host 路由与状态机

| # | 任务 | 状态 |
|---|---|---|
> 规格：`docs/spec-p3-host-routes.md`。**本阶段风险最高**（承载 `/api/fs/*` 对外契约）。

| # | 任务 | 状态 |
|---|---|---|
| T-30 | **P3-A 路由层**：11 条 `/api/fs/*`（入参/出参/错误码逐条对照 `baseline/host.md` §A） | 待办 |
| T-31 | **P3-B 任务状态机**：4 态 / 11 迁移点 / 去重键 / sweep 兜底 | 待办 |
| T-32 | **P3-C 执行器**：`gen-executor` + `translate-executor`（子 agent 编排、动态 import、不打 `origin:subagent`） | 待办 |
| T-33 | P3 阶段验收；**并将 `src/host/index.ts` 移出 `vitest.config.ts` 覆盖率排除项**（它此时已是真实路由文件） | 待办 |

### P4 client

| # | 任务 | 状态 |
|---|---|---|
> 规格：`docs/spec-p4-client.md`。决策 **D-11：`.tsx` + JSX**。逐段对照 `baseline/client.md` 的 171 功能点。

| # | 任务 | 状态 |
|---|---|---|
| T-40 | **P4-A** `md-utils`（纯逻辑，无 DOM；file 级三 100%） | 待办 |
| T-41 | **P4-B** 槽位注册（`conversation.view` / id `fs` / order 12）+ 样式 effect + UI 骨架 | 待办 |
| T-42 | **P4-C** 树与查看器（懒加载、蓝点两种行为、12 条渲染分支） | 待办 |
| T-43 | **P4-D** 打开状态与生成/翻译（`useOpenedViewer`、读取扇出、轮询） | 待办 |
| T-44 | **P4-E** 持久化与工作区（`fs.ui.v1`、启动恢复、拖宽、工作区切换） | 待办 |
| T-45 | P4 阶段验收（jsdom 组件测试 + 171 功能点对照表） | 待办 |

### P5 测试迁移

| # | 任务 | 状态 |
|---|---|---|
> 规格：`docs/spec-p5-p6-tests-and-cutover.md`。

| # | 任务 | 状态 |
|---|---|---|
| T-50 | 135 例 node:test → vitest（**时序辅助函数语义必须保留**：`waitSettled`/`waitTaskRegistered`/`waitTaskSettled`） | 待办 |
| T-51 | 覆盖率补齐至 file 级 行/函数/**分支** 100%（含 Win32 分支等已知缺口） | 待办 |

### P6 切换上线

| # | 任务 | 状态 |
|---|---|---|
| T-60 | profile 链接切换（`~/.dsh/profiles/web`，先备份 + `--dump-config` 验层） | 待办 |
| T-61 | 重启 dsh web + 人工冒烟 4 项（**需用户在座**：重启会中断当前会话） | 待办 |
| T-62 | 收口：交付摘要（**必须显著标注 G-1 高危**、G-1~G-11 已知行为、与主仓风格的有意差异） | 待办 |

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
| 2026-09-11 | 规格体系齐备：P1 骨架 / P2 纯逻辑 / P3 路由状态机 / P4 client / P5-P6 测试与切换，五份规格全部落盘并提交 |
| 2026-09-11 | **并行任务（非本重构范围）**：会话压缩能力由子智能体实现并激活（`cmpct-2/pkg-2`）；工具 `compact_context` 经 `Tool.listTools` 验收确认**对主智能体可见**。主智能体**未使用**用户授予的破例定义权（`cmpct-1/pkg-3` 保持未激活）。决策 R-2 的"父会话不可用"判断已推翻并修正（工具注册为进程级） |
| 2026-09-11 | T-10（P1-A）产物齐备（含构建产物）但连续 8 轮仍在调试 `tsdown`/banner/vitest 配置；主智能体发送 **steer**：要求先交**最小可验收集合**（四条命令真实输出 + client 产物头部契约 + D-6 专项结论 + 卡点自述），不为完美反复调试 |
| 2026-09-11 | 主智能体对 T-10 产出做**验收预检**（读 `vitest.config.ts` / `src/host/index.ts`）：覆盖率门槛已按 D-2 正确配置（`perFile: true` + 四项 100%，注释载明实测"空集不假红、P2 首个源文件立即被门禁"）；导出形态合规（named-export、无 default）。**两项待办入账**：① **P3 必须**把 `src/host/index.ts` 移出 `vitest.config.ts` 的覆盖率排除项——它迁移后是 494 行真实路由文件，留着排除即形成覆盖缺口；② **P1-B 必须**把 host 导出的 `name` 与 `inject` 对齐 `feature-baseline.md` §2.1（`name='fs'`、`inject=['webServer','sandboxPolicy','sessions','agentLoop']`），现骨架为包名与空数组 |
| 2026-09-11 | **运维事实（影响长期任务）**：尝试主动压缩时返回 `The compaction service is not mounted in this deployment` —— 本部署**未挂载 `compaction` 服务**，故模型侧 `compact_context` 工具与人类 `/compact` 命令**均不可用**（后者 `inject=['commands','compaction']`，服务缺失即停在 PENDING）。**对策**：唯一可靠保障是「状态全部落盘」——即本台账 + `docs/` 下的基线/规格/账目；即便发生 agent-loop 侧的自动压缩，亦按 §0.1 恢复 |
| 2026-09-11 | 经用户授权，派子智能体 `956ccd03` 查明 `compaction` 未挂载的根因并尝试挂载。**约束**：不重启 dsh web（避免中断会话，重启与否留用户决定）、改动用户环境前先备份、不动本仓库与冻结迁移源 |
| 2026-09-11 | **P1-A 配置验收补充核对**（读 `tsconfig.client.json` / `tsdown.config.ts`）：① `jsx: "react-jsx"` 与 externals 中的 `react/jsx-runtime` **均已就绪** → 决策 D-11 的 `.tsx` + JSX **无需额外配置工作**；② TS 检查项**严于规格**（额外开 `noUncheckedIndexedAccess`/`exactOptionalPropertyTypes`/`noImplicitOverride`/`noFallthroughCasesInSwitch`/`noUnusedLocals`/`noUnusedParameters`）；③ **P4 待办入账**：`tsdown.config.ts:35` 的 `entry: { client: 'src/client/index.ts' }` 必须随 P4 把入口改名为 `.tsx` **同步更新**，否则构建失败 |
| 2026-09-11 | 应用户要求给出**压缩时刻的判断**（三条判据：状态已落盘 / 压力接近阈值 / 处于空窗期）→ 三条全中，判定为压缩时刻；但执行时发现本部署**未挂载 `compaction` 服务**，判断无法落地（详见上方运维事实条目） |
| 2026-09-11 | P1-B（`d5afe9fe`）跑满 4 轮**零产出**（三件套 / REAL-composition 测试 / `src` 契约对齐均未动，却在反复触碰 `package.json`/`.oxlintrc.json`/`package-lock.json`，与 T-10 的停滞模式相似）；主智能体发送**收窄 steer**：① 先搬三件套（`contracts.md` §B 有完整内容）→ ② 入口契约对齐基线 → ③ 最小 REAL-composition（只证"被真 Loader 挂载"）→ ④ D-6 可后置；并明令停止调配置、有报错就贴原文。**中止阈值**：再一轮零产出即中止并**重派更窄的子任务**（不由主智能体亲自实现，守 §0.2） |
| 2026-09-11 | **决定不与 P1-B 并行派 P2-A**：虽文件边界不重叠，但两者都会跑 `tsc -b`（写 `lib/*.tsbuildinfo` 与 host 输出）与 vitest，存在增量编译状态与构建产物的并发冲突；且并行会让验收时难以分离产物（T-10 的教训）。维持串行 |
| 2026-09-11 | **compaction 调查结案（子智能体 `956ccd03`）**：根因**不是部署缺挂载，而是消费者取错通道**——compaction 活在 **agent preset realm 内**（`packages/bundle/web-app/cordis.patch.yml:427-434` 有意把 host 平面三行 `disabled: true`），`ctx.get('compaction')` 从 realm 外取不到；正确通道为 `ctx.get('agentPresets').serviceFor(agent,'compaction')`（实测返回对象、`compactNow` 是 function）。**同时纠正主智能体两个错误判断**：①「服务未挂载」应为「消费者作用域错误」；②「`/compact` 停在 PENDING」不成立——实测 `commands.find(agent,'compact')` 为 present，人类命令本就可**用**。修复走**方案 A（改消费者，无需重启）**，已派原实现者 `3eec5d11` 执行 |
| 2026-09-11 | **P1-B 三件套验收预检**（读三个 yml）：`cordis.patch.yml` 正确（`- insert: - id: fs` + `name: dsh-plugin-file-system-zc`，**`id: fs` 与基线一致**）；`preset.yml` 正确（`name: 文件系统` / `order: 5` 与源一致）；`agent.cordis.yml` 结构正确（`skill-filesystem` 的 `customSkillDirs` 用 `new URL('skills/', baseUrl)` 相对解析 + `tool-skill`）。**发现一处缺口**：该 yml 引用 `skills/` 目录，而 zc 仓库既无 `skills/`，其 `package.json` 的 `files` 也**不含 `skills`**（源插件两者都有）→ 技能将挂到空目录。待 P1-B 报告其处置方式后定夺 |
| 2026-09-11 | **P1-B 第 2 步验收通过**：`src/host/index.ts:12,15` 已对齐基线（`name = 'fs'`、`inject = ['webServer','sandboxPolicy','sessions','agentLoop']`），`src/client/index.ts:11,14` 亦为（`name = 'fs'`、`inject = ['slots']`）——与 `feature-baseline.md` §2.1 逐字一致。`tests/fixtures/` 已建，REAL-composition 测试进行中 |
| 2026-09-11 | **compaction 修复完成**：子智能体 `3eec5d11` 对 `cmpct-2` 追加 `pkg-7` 并 update 成功（`running`）——取值通道改为 `agentPresets.serviceFor(agent,'compaction')` 优先 + host 平面回退；`execute` 改为先取 agent（`exec.agent` 优先）再取 compaction；`runDeferred` 同走新通道。schema 逐字未变，`pkg-2` 保留可回滚；排队到 idle 执行的逻辑不变。**验证判据**：下次调用应返回 `scheduled`，轮末 idle 后 host 日志出现 `compact_context (deferred): compressed - ...`；若仍为 `unavailable - no compaction instance for this agent` 则通道未通 |
| 2026-09-11 | **新增 §0.3 多级委派规范**（用户指正 P1-B 派发包过大）：① 单包 ≤3 项可独立验收交付物；② prompt 必须显式授权二级委派并给拆分建议；③ 验收与记账仍只在主智能体；④ 使用者须回报「派了哪些子任务、各自结论」。**已即时应用**：向 P1-B（`d5afe9fe`）补发授权，建议其把 D-6 与「REAL-composition 装配方法调研」派给自己的子智能体，自己只负责占位挂载收尾与汇总 |
| 2026-09-11 | **P1-B REAL-composition 测试验收预检通过**（读 `tests/real-composition.spec.ts`，157 行）：确为**真过 Loader** —— `new Context()` + `ctx.plugin(Loader)` + `loader.builtins.include` + `loader.create()`/`loader.await()`，且**只替换模块解析这一道缝**（4 个宿主服务用桩，真实插件仍从 `../src/host/index.ts` 加载，注释明载"the Loader still parses the composition, builds the entry tree and runs every lifecycle"）；断言均为**外部可观测状态**：Loader 自身 entry tree、**真 HTTP loopback 请求**（`/api/fs/__ping` 200 + 未知路由 404 + JSON 逐字比对）、槽表（`conversation.view` / `id: fs` / `order: 12` / label）。**这正是源插件待办 #19 所要求的做法**（真过 Loader，而非自造 ctx 桩），迁移版正面解决。待绿色输出后销账 |
| 2026-09-11 | **压缩能力打通并已触发**：调用 `compact_context` 返回 `status:"scheduled"`（"Compaction is queued … as soon as the current turn finishes"）——同时证明 ① 工具对主智能体**可用**；② `cmpct-2/pkg-7` 的 `agentPresets.serviceFor` 通道修复**生效**（若通道未通，返回应为 `unavailable - no compaction instance for this agent`）。压缩将在本轮结束时由 `agent/status` 处理器执行。**压缩后请按 §0.1 恢复上下文**：读本台账 → `docs/feature-baseline.md` → `docs/baseline/*.md` → `docs/spec-*.md`。当前进度快照：P0 完成、P1-A 已销账（`1c418aa`）、**P1-B 待收口**（三件套 ✓ / 契约对齐 ✓ / REAL-composition 测试 ✓ 待绿色输出 / D-6 已授权外派）、P2–P6 待办；累计 26 次提交 |
| 2026-09-11 | **会话压缩已执行**（`scheduled` 生效）。恢复后主智能体按 §0.1 读回台账，未凭记忆接续 |
| 2026-09-11 | **T-11（P1-B）收口**：子智能体 `d5afe9fe` running 多轮、产物齐备却始终不交报告（与 T-10 同款停滞模式），按已记录的中止阈值执行 `interrupt_agent`。**主智能体亲自跑五门禁验收**（属验收职责，非实现，符合 §0.2）：**全绿**。`tests/real-composition.spec.ts` 已被 P1-B 扩到 178 行（新增第 3 例：`cordis.patch.yml` 与 `package.json` 的 `dsh.bundle.patch` 一致性），真过 Loader 的断言面完整。**唯一未交付项 = D-6** → 转 P2-A 交付物 3（同一位子智能体顺手核验，避免为一次 tsc 实验单开一轮） |
| 2026-09-11 | **发现 P1-B 遗留缺口 → 新开 T-13**：`agent.cordis.yml:23` 引用 `new URL('skills/', baseUrl)`，但本仓**无 `skills/` 目录**，且 `package.json` 的 `files` 也**不含 `skills`**（源插件两者都有）。源 `skills/` 为 **5 技能 / 13 文件**（`file-doc`、`folder-doc`、`session-review`、`source-doc`、`translate-doc`）。若不管，技能会挂到空目录 = **功能遗失**（触红线 2）。派子智能体 `5917319f`（子P1C）执行逐字复制 + `files` 补齐 + 引用扫描；**明令其不得跑 npm 门禁命令**（主智能体正在并行跑，避免 tsbuildinfo/产物争用） |
| 2026-09-11 | **派发 T-20（P2-A 基础层）**：子智能体 `79438ecb`，交付物 3 项 = `locale.ts`（72 键）+ `fs-utils.ts`（25 导出，**分支覆盖须从源实测 88.75% 补到 100%，严禁 `v8 ignore` 或删逻辑回避**）+ D-6 核验。**按 §0.3 显式授权二级委派**（建议：locale / fs-utils 各派一个子任务，自己留 D-6 与收尾门禁），并要求回报二级委派清单
