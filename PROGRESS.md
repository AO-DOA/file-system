# 台账 — dsh-plugin-file-system

> **本文件只记「当前态 + 后续待办」**，保持简约。
> 时间戳规范：`YYYY-MM-DD HH:MM:SS`（用户 2026-09-11 要求）。

---

## 1. 当前状态

**迁移已完成并上线运行。**

| 项 | 值 |
|---|---|
| **入场必读**（新人 / 新子代理开工前） | [docs/agent/README.md](docs/agent/README.md)：三层存储（会话上下文 / 仓库文件 / `dsh知识库`）各放什么、谁写谁读、**入场阅读顺序**；已验证的负结果看 [docs/agent/lessons.md](docs/agent/lessons.md) |
| 包名 | `dsh-plugin-file-system`（非 scoped） |
| 仓库 | `/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system` |
| profile | `~/.dsh/profiles/web`：`dependencies` 与 `dsh.profile.bundles` 均已指向 `dsh-plugin-file-system` |
| 运行态 | dsh web 运行中，端口 3080；boot manifest 装载本插件。PID 每次重启都变：以 `~/.dsh/logs/web.log` 最近一次「启动命令」行或 `pgrep -f 'dsh web'` 为准 |
| 五项门禁 | **全绿**：typecheck 0 输出 / lint 0 错 0 警告 / **564 例** / coverage 100×4 / build 成功。数字口径：`typecheck`（exit 0、无输出）与 `npm test`（**19 spec / 564 例全过**）为 2026-09-11 字典化后**本轮实测**；`lint` / `coverage` / `build` 沿用字典化前的最近一次实测——本轮纪律未重跑这三项，故不声称其覆盖了字典化改动 |
| 五项门禁（**四段 UI 改造后重测**） | **全绿**（2026-09-11 23:29:46 实测）：`npm run typecheck` exit 0 无输出 / `npm run lint` **0 错 0 警告**（47 files、80 rules）/ `npm test` **19 spec / 582 例**全过 / `npx vitest run --coverage` = All files **100 / 100 / 100 / 100** + `node scripts/verify-coverage-scope.mjs` **19/19 ✓ 分母完整**。**`build` 未跑**（不在本段授权内，用户否决），故运行中的 `client/client.js` 仍是旧产物。上面的 564 例是字典化轮的快照，已被本行取代 |
| 五项门禁（**探针复刻 DOM 同步 + 保存判据收口后重测**） | **全绿**（2026-09-12 00:29:48 实测，工作树未提交）：范围守卫 **PASS**（改动面 = `src/client/index.tsx` / `tests/client-view.spec.ts` / `tools/ui-probe/` / `PROGRESS.md`，4 项全在授权面内、无越界）/ `npm run typecheck` exit 0 无输出 / `npm run lint` **0 错 0 警告**（48 files、80 rules）/ `npm test` **19 spec / 594 例** / `npx vitest run --coverage` = All files **100 / 100 / 100 / 100** + `node scripts/verify-coverage-scope.mjs` **19/19 ✓ 分母完整**。**`build` 未跑**（授权否决），故运行中的 `client/client.js` 仍是旧产物。**口径落差订正**：上一行记的 582 例是「四段 UI 改造后」那次的快照，其后 menu-clipping 段实测 **586 例**（见 §3 那节）、本段 **594 例**——三个数字分属三次不同的用例集快照，不是同一口径的漂移；引用门禁例数时以本行为最新。原始输出 `/tmp/verify-sync-a.txt`（运行产物，不进仓库） |
| 五项门禁（**R5 视图选择器搬动 + 窄档收纳后重测**） | **全绿**（2026-09-13 实测，工作树未提交）：范围守卫 **PASS**（改动面 = `src/client/index.tsx` / `tests/client-view.spec.ts` / `tools/ui-probe/`（2 文件）/ `docs/spec-ui-revamp.md` / `PROGRESS.md` / 新增报告，6 改 + 1 新增，全在授权面内）/ `npm run typecheck` exit 0 无输出（4.8s）/ `npm run lint` **0 错 0 警告**（4.7s）/ `npm test` **19 spec / 597 例**全过（10.5s）/ coverage All files **100 / 100 / 100 / 100** + 分母守卫 PASS（11.9s）。**`build` 未跑**（授权否决），故运行中的 `client/client.js` 仍是旧产物。完整输出 `/tmp/lian3-verify.txt`。命令：`node scripts/verify-stage.mjs --allow 'src/client/index.tsx,tests/client-view.spec.ts,tools/ui-probe/,docs/spec-ui-revamp.md,PROGRESS.md,docs/agent/reports/2026-09-13-view-picker-to-right.md'` |
| 五项门禁（**R6 分栏语义反转后重测**） | **全绿**（2026-09-13 实测，工作树未提交）：`npm run typecheck` exit 0 无输出 / `npm run lint` **0 错 0 警告**（48 files、80 rules）/ `npm test` **19 spec / 600 例**全过 / `npx vitest run --coverage` = All files **100 / 100 / 100 / 100** + `node scripts/verify-coverage-scope.mjs` **19/19 ✓ 分母完整**。几何：`--wsicon`（3857 档）与基线 `out-final-lian3.json` **逐档逐字段 0 差异**，分屏态同样 0 差异（产物 `out-split-freeze.json` / `out-split-freeze-sp.json`）。**`build` 未跑**（授权否决）⇒ 运行中的 `client/client.js` 仍是旧产物。改动面＝3 改 + 1 新增，全在授权面内；`src/host/**` 与 `tools/**` 一字未动。完整口径见 `docs/agent/reports/2026-09-13-split-freeze-target.md` |
| 五项门禁（**A 类修正：独立支改数据快照后重测**） | **全绿**（2026-09-13 实测，工作树未提交）：范围守卫 **PASS**（改动面 = `src/client/index.tsx` / `tests/client-view.spec.ts` / `docs/spec-ui-revamp.md` / `PROGRESS.md` / 报告，5 项全在授权面内、无越界）/ `npm run typecheck` exit 0 无输出 / `npm run lint` **0 错 0 警告** / `npm test` **19 spec / 603 例**全过（client spec 156 → 158，+2）/ coverage **100×4** + 分母 19/19 ✓。几何：`--wsicon` 与 `--splitpane` 两条与 R6 基线 `out-split-freeze.json` / `out-split-freeze-sp.json` **逐档逐字段 0 差异**（3857 档；DOM 结构未动，探针逐档 0 差异，产物 `out-snap.json` / `out-snap-sp.json`）。**`build` 未跑**（授权否决）⇒ 页面看不到本单改动。完整口径见报告 §12 |
| 技术栈 | TypeScript(strict) + vitest/jsdom + tsdown；产物 `lib/host/index.js` + `client/client.js` |
| 功能基线 | 171 功能点（155 已迁移 / 10 不适用 / 6 有意保留）；11 条路由三方一致；135 例逐条对账矩阵 0 处待填 |

## 2. 日常操作

```bash
npm run typecheck      # tsc -b tsconfig.json（5 个 leaf；tsconfig.base.json 经 extends 生效、本身不是 project）
npm run lint           # oxlint，0 错 0 警告
npm test               # vitest，19 spec / 582 例（2026-09-11 四段 UI 改造后实测；字典化轮为 564 例）
npm run test:coverage  # per-file 100% + scripts/verify-coverage-scope.mjs 分母守卫
npm run build          # tsc(host) → lib/host/  +  tsdown → client/  + banner 校验
```

**注意事项**
- `lib/`、`client/` **不入库**；改代码后必须 `build` 才生效——**是否还要重启，看改的是哪一半**：
  **client 免重启**（产物由 HMR watch 热更，`build` + 刷新页面即可），**host 必须重启**
  （产物是进程内 `require` 的模块）。2026-09-12 实测订正，判据与证据见本文件「改动的生效条件」一节。
- 验收 build 前先 `rm -rf lib client`——`tsc` 不清理 outDir，会留下陈旧产物。
- **并行跑 coverage 必须隔离**：`--coverage.reportsDirectory=/tmp/...`。共用 `coverage/.tmp` 会让生成崩溃（实测 4 次跑崩 3 次）。
- `dsh plugin` **现在可用**（2026-09-11 修复；已非「本机必失败」）：前提是 profile 的 `package.json` 声明了 `packageManager` —— `~/.dsh/profiles/web/package.json:4` 为 `"packageManager": "pnpm@11.7.0"`（本次新增）。改 profile 直接 `dsh plugin --profile web <pnpm 参数>` 即可：它**没有子命令**，参数原样转发给 pnpm（`apps/cli/src/plugin.ts:120,134`；`--profile <name>` 必填，至少给一个 pnpm 参数），**不再需要**手工改 `dependencies` + `dsh.profile.bundles` + 补 node_modules 软链。
- **排查线索（`ERR_PNPM_UNEXPECTED_STORE` 复发时）**：先在当前目录比 `pnpm --version` / `pnpm store path` 是否与 `node_modules/.modules.yaml` 里记录的 `storeDir` 一致——不一致就是 `packageManager` 声明缺失或版本写错。注：该 profile 的 `.modules.yaml` 现记 `"storeDir": ".../store/v11"`（**v11 这一描述属实**）。

## 2.5 会话压缩能力（PROFILE 层单文件 Cordis 插件 —— **持久，重启自动恢复**）

主智能体自己就能压缩本会话上下文，不必等人类敲 `/compact`。插件是 `~/.dsh/plugins/compact-tool.mjs`，由 `~/.dsh/profiles/web/cordis.patch.yml`（第 29–31 行：`- insert:` / `id: compact-tool` / `name: /home/xuepeng/.dsh/plugins/compact-tool.mjs`）挂在 **PROFILE 层**；profile 层注册的工具落 global layer（`core/scope/src/store.ts` 无 scope 时 `layer = this.global`），故**对所有预设/会话可见**，主智能体自己即可调用。**重启自动恢复、无需任何手工重建**：2026-09-11 05:03:19 启动（PID 516551）实测打印 `compact-tool: compact_context registered on the profile plane (agentPresets=true, agents=true)`，随后本会话实调成功——`compact_context [session-e2bde115-…] compacted 87 items (~104117 tokens), summarySeq=3750`。

**用法**：空对象 `{}`（唯一可选字段 `reason`，仅写日志）；返回 `status: scheduled` = 已排到**本轮结束后的 idle 窗口**后台执行，真实结果打在 host 日志 `compact_context [<agent id>] compacted N items (~M tokens), summarySeq=…`。
**拆卸**：删掉 patch 里那三行（`- insert:` 与 id/name），重启即恢复原状（改动前备份 `cordis.patch.yml.bak-compact-20260911-050221`）；台账与取证见 `~/.dsh/plugins/compact-tool.制作历程.md`。

**真实约束（源码取证）**
- **realm 通道**：`compaction` 活在 agent preset 的 **isolate realm** 内（`presets/standard/agent.cordis.yml:138-143` 的 `isolate: { compaction: true, toolResultPruner: true }`），host 平面不可见（主仓 `packages/bundle/web-app/cordis.patch.yml:427/430/433` 有意禁用 `compaction-basic`/`command-compact`/`tool-result-pruner` 三行）⇒ 唯一通道是 `ctx.get('agentPresets').serviceFor(agent, 'compaction')`（`packages/preset/agent-presets/src/index.ts:623`）。
- **agent 来源**：优先 `exec.agent`，fallback `agents.currentInitiator()`。
- **为何必须排队**：`compactNow` 内部走 `runMaintenance`，agent 非 idle 时抛 `ManualCompactionError('busy')` ⇒「排队到 idle」是**插件自己监听 `agent/status` 事件**实现的（载荷 `{ agent, status }`，`packages/core/agent/src/runtime-types.ts:277`），**不是**官方 API。
- 它跑在**真实 Node 进程**里，`new AbortController()` 可用——早期动态插件沙箱「没有 `AbortSignal`/`AbortController`」的限制**已不适用**。

⚠ **不要再重建退役的动态版本**（`~/.dsh/dynamic-plugins/compact-tool.host.js.retired`，以及同目录 `README.md` 里的重建三步）：它与本版注册**同名 global layer 工具 `compact_context`**，同名注册会**直接抛错**（`packages/core/tools/src/index.ts:719-721`）。

> 背景：它**历史上曾是**动态 Cordis 插件（只活在进程内存、重启即失；源码存盘在非官方约定的 `~/.dsh/dynamic-plugins/`——全仓源码搜该路径 0 命中，这正是迁移动机）。**现已迁走，不再是那个状态。**

## 3. ⚠ 已知行为与风险

### G-1 ✅ **已修复**（2026-09-11，用户要求；**本项目唯一有意的行为差异**）

**缺陷**：`POST /api/fs/delete`、`/write`、`/mkdir` 三条写路由无 `path` 必填校验。`/delete` 后果最重——`resolveIn(root, 缺失值)` 把 `abs` 解析成**工作区根**，而越权检查写作 `abs !== root && …`，**`abs === root` 恰好通过**，于是 `rm(abs, {recursive:true, force:true})` **递归删除整个工作区根**。

**修复后有两道闸门**（都插在 `resolveIn` **之后**、`rm` **之前**——先判「有没有」，再判「是不是根」）：

| 情形 | 修复前 | 现在 |
|---|---|---|
| 缺 `path` / 非字符串 / 空串 | `rm(root)` **全损**，返回 200 | 400 `path required`（**三条写路由都加**） |
| `path` 合法但解析回根（`'.'`、`'./'`、`'sub/..'`） | 同上（200，全损） | 400 `refusing to delete the workspace root`（**仅 `/delete`**） |

**`/mkdir` 与 `/write` 故意不加第二道守卫**：`mkdir root` 幂等、`write root` 报 EISDIR，都不毁数据，加了反而改变既有语义。

**运行时前后对照已证实**（非静态推理）：同一探针在修复前后各跑一次——修复前 `delete '.'` → `200 {"ok":true}`、`rootAlive=false keepAlive=false`；修复后 → `400 refusing to delete the workspace root`、`rootAlive=true keepAlive=true`。**G-1 修好后 `delete '.'` 仍能删根**，所以 G-1b 是同一缺陷的另一半，不是新需求。

**影响面**：`/mkdir`、`/delete` 无任何前端调用；`/write` 有一处（`save()`，其 `path: opened.path` 恒非空且有 `hasSource` 守卫）⇒ **页签界面行为零变化**。改动只影响直连这三条路由的脚本与集成。

**文案**：复用同文件既有的英文技术串风格（`path required` / `refusing to delete the workspace root`），**未新增 locale 键**——`tests/locale.spec.ts` 硬断言 `ZH` 恰 72 键，新增键会立刻让它变红。host 错误通道字典化属既有待办 #20，不在本次范围。

> **订正（2026-09-11 本轮）**：上段「未新增 locale 键」的前提**已被本轮的字典化取代**——`path required` 与 `refusing to delete the workspace root` 现为 `ZH.errPathRequired` / `ZH.errRefuseDeleteRoot`（第 2 批 B 类），`ZH` 已由 72 键增至 **117 键**，`tests/locale.spec.ts` 的键数硬断言同步改为 117（实测 `tests/locale.spec.ts:155` 为 `toHaveLength(117)`）。上段其余叙述是 G-1 修复时点的**历史记录**（当时确实一个键都没加），保留不改。

**验证**：测试 74 → **80 例**全绿（含 6 种缺失形态 × 3 路由、`'.'`/`'./'`/`'sub/..'` 三种回根写法，以及 `delete 'sub'` → 200 的反向对照，证明守卫只拦根自身）；`src/host/index.ts` 覆盖率由 96.93/96.21/97.56/98.07 升至 **97.05/96.4/97.56/98.15**。

### 覆盖率例外（用户裁决）

`src/host/index.ts` 与 `src/client/index.tsx` **不进 per-file 100% 门禁**（`vitest.config.ts` 的 `coverage.exclude` 显式列入，同处注释写明实测值与逐条不可达出处）。

理由：两文件剩余未覆盖语句**经逐条证明逻辑不可达**（防御性双保险与竞态兜底）——不许删、禁令不许 ignore、覆盖率门禁要求覆盖，三者不可兼得。实测（顺序 stmts/branch/funcs/lines）：`index.ts` **97.07/96.4/97.56/98.15**；`client/index.tsx` **97.96/95.68/99.16/100**。

> 数值出处是 `vitest.config.ts:37,46` 的注释（G-1 修复后的重测值），**本轮未重跑 `test:coverage`**（纪律所限），故字典化是否再移动这两个数值**未核实**。原记 `index.ts` 96.93/96.21/97.56/98.07、`client/index.tsx` 97.97/95.68/99.17/97.42 是 G-1 修复**前**的快照，已过期。另一处对不齐的读数：上节 G-1「验证」写的「升至 **97.05**/96.4/97.56/98.15」是当次快照，与配置注释现记的 stmts **97.07** 相差 0.02 个百分点——差异来源未进一步核实，引用时以配置注释为准。

`src/` 下**其余全部文件仍受 per-file 四项 100% 严格门禁**。

### 其余逐字保留的既有行为（G-2 ~ G-12）

已知缺陷登记要点：
- **G-2** kind 白名单过宽；**G-3** 目录重复请求同一 `/read`；**G-4** 切换文件静默丢弃未保存编辑；**G-5** `refreshRoot` 失败不上屏；**G-6/G-7** 资源泄漏类（`pollTask` 无 `clearTimeout`、拖拽监听无 cleanup）**P4 阶段决定主动保留未修**——该决定贯穿至交付，`src/client/index.tsx:538-539` 注释明写「不新增清理」；对该两项只写例外 b 的「允许修正」授权，非「已修」记录；**G-8~G-11** 任务表进程内 Map、未消费 View 焦点协议等。
- **G-12**：`CodeBlock` 的 `copyLabel`/`copiedLabel` 在 primitives 里是必填，而实现只传 `{code, lang}`（纯 JS 无类型检查故从未暴露）。本实现**同样不传**，仅做局部类型窄化，UI 表现一致。

### 与主仓风格的有意差异（交付时需说明）

| 差异 | 原因 |
|---|---|
| host 产物是 `lib/host/index.js` 而非 `lib/index.js` | `tsconfig.host.json` 的 `rootDir` 上提到 `src`，以解决 `../shared/locale.ts` 的跨面导入（TS6059/TS6307） |
| solution 根 `tsconfig.json` 自身无 `extends`（只有 `"files": []` + 5 条 `references`） | 根不拥有程序，只做 solution 清单；`extends` 由两个产品 leaf 各自指向 `tsconfig.base.json`（2026-09-11 提取，结构见本节末「tsconfig 五 leaf 结构」），测试 leaf 再经 leaf 间接继承 |
| 包名非 `@deepseek-ai/` scope | 该 scope 仅组织成员可发布 |
| `dsh.client` 未写 `inject` | 实测「不写与旧插件行为完全等价」——旧插件那两个名字在客户端 graph 里都不存在（空转） |

### host 错误串字典化（2026-09-11 三批收口 —— 待办 #7 / 规范报告 §4-2 结项）

三批把 host 代码里**剩余的 47 处**硬编码文案搬进 `ZH`，新增 **45 键**（逐字同文的串共用一个键，不建同值多键）；`ZH` 由 **72 键增至 117 键**（实测逐批 `72 → 84 → 94 → 117`，增量 12 / 10 / 23 = 45）。**文案逐字未变** —— 这是用户明确裁决的原则「**只搬家不改写**」，因此没有任何上屏文本发生变化，也没有新增、删除、改写任何一个字。

| 批 | commit | 分类 | 新增键 | 搬运处数 | 覆盖内容（举例） |
|---|---|---|---|---|---|
| 1 | `f46f456` | **A 类**：正常 UI 可达的用户文案 | 12 | 11 | 三个能力目录的 `throw`（folder-doc / source-doc 骨架、translate-doc 描述符：`目标不是可读文件夹/文件`、`源文档不存在/过大/已是简体中文`）、`/read` 的 `not a file` / `file too large`、`task not found` |
| 2 | `7a3253c` | **B 类**：协议/安全/防御串 | 10 | 16 | `path required`（5 条路由共用一键）、`refusing to delete the workspace root`、`path escapes workspace root`、`unknown route` / `unknown gen kind`、`body too large`、`invalid json body`、`invalid book doc rel`、`not a directory`、`cannot encode an empty project path` |
| 3 | `18dcb9f` | **C 类**：会真上屏但属开发者诊断语 | 23 | 20 | 子 agent 收尾判据（产物空/未生成/未更新/仍是骨架）、骨架与产物自检（`checkHealth` 五项 + `注解占比过低`/缩进/空行/无标记/单元越界）、`agentLoop 服务不可用`、`译文未写入目标文件` |

**三批分类口径**：A 类=正常 UI 操作可达的用户文案；B 类=协议安全防御串（只有直连 API 才会看到的拒绝语）；C 类=会真上屏、但用词是**开发者诊断语**（含「子 agent」、绝对路径、内部术语）——这一类**刻意不改成用户话术**，改了会丢掉现场信息，故值与原字面量逐字相同。
含变量的串沿用本仓既有的「前缀 + 续段」拆键先例（`errFileTooLarge` / `errSrcTooLarge`）：变量夹在固定文案中间时，中段另立 `…Mid`（三段则 `…Mid`/`…Mid2`）、尾段另立 `…End`，使整句固定文案零残留（四段例：`errFileTooLarge`、`errUnitOutOfRange`）。

**机器护栏同步升级**：`tests/locale.spec.ts` 的键数硬断言由 72 改为 **117**（实测 `:155`），并新增「同值串共键」的反查断言（实测 `:341-345`、`:408-412` 按值反查键名集合），堵住「同一句文案建了两个键」这种漂移。

**一个机制发现**：`ZH` 的类型由注解式 `export const ZH: Record<string, string>` 改为 `as const satisfies Record<string, string>` 之后，**键名拼错会从「静默 `undefined` 写进 HTTP 响应体」升级为编译期 TS2551 报错**（属性不存在），即错误从运行期上屏缺口前移到 `tsc`。（依据：`src/shared/locale.ts:4-8` 的注释与本轮三批提交；**未独立构造反例复现**——构造需要改 `src/`，超出本轮「只改台账」的纪律。）附带代价与解法：字面量对象失去索引签名，故 `t()` 里的 `LANG[lang ?? ''] ?? ZH` 需显式标注 `Record<string, string>`，host 直取拼接也不会再撞 lint 的 `restrict-plus-operands`。

### tsconfig 五 leaf 结构（2026-09-11 提取 `tsconfig.base.json` 后 —— 待办 #5 / R3 结项）

- **形态**：`tsconfig.base.json`（共享面）+ **2 个产品 leaf**（`tsconfig.host.json` / `tsconfig.client.json`）+ **3 个测试 leaf**（`tsconfig.tests.host.json` / `tsconfig.tests.client.json` / `tsconfig.tests.composition.json`），由一个只做清单的根 `tsconfig.json`（`"files": []` + 5 条 `references`）驱动 `tsc -b`。
- **继承链**（实测 `grep extends tsconfig*.json`）：`base → host → tests.host`；`base → client → tests.client`、`base → client → tests.composition`。**测试 leaf 通过 extends 链自动继承** base 的每一条，无需抄写；因此在 base 里加一个严格开关会一次到达全部 5 个 leaf。
- **base 自己不拥有程序**：不声明 `include`/`files`/`references`，也没有任何 leaf 引用它 ⇒ `tsc -b tsconfig.json` 从不把它当作 project。
- **上提的 13 项**（在两个产品 leaf 里**逐字节相同**，故只维护一份）：`target` / `module` / `moduleResolution` / `allowImportingTsExtensions` / `composite` / `strict` / `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` / `noImplicitOverride` / `noFallthroughCasesInSwitch` / `noUnusedLocals` / `noUnusedParameters` / `skipLibCheck`。
- **故意不上提的项及原因**：
  - `lib`（host `["ES2024"]`、client 另加 DOM）、`types`（host `["node"]`、client `[]`）—— 这是 host/client 的**环境边界**，上提会抹掉「一个程序看不到 cordis Context 两侧」的分野（host 就可能在无人察觉时开始用 `document`/`window`，client 开始用 `process`/`Buffer`）。
  - `jsx` / `noEmit` / `outDir` / `declaration` / `declarationDir` / `rewriteRelativeImportExtensions` / `esModuleInterop` —— 属**产物形态**，由 host 面独有（client 面从不 emit）。
  - `rootDir` —— 是**路径项**，只在与它成对的 `include` 旁边才有意义，各 leaf 自己拥有。
  - `tsBuildInfoFile` —— 必须 **per-leaf**：composite 项目共用一个 `.tsbuildinfo` 会让彼此的增量状态互相冲撞。
- **一条坑**：相对路径在 extended 配置里按**声明它的那个文件**解析（即 base 自己）⇒ base 必须留在包根、且**不得在其中加任何路径项**（加了会把全部 leaf 的基准静默挪走）。
- **证据**：`npm run typecheck` 实测 **exit 0、无输出**；`npx tsc --showConfig -p tsconfig.host.json` 实测上述 13 项与 leaf 自有项（`lib`/`types`/`rootDir`/`outDir`/`declarationDir`/`tsBuildInfoFile`…）全部就位。

### 注释与台账里的数字会漂移：写「怎么得到」比写「是多少」耐用（2026-09-11 教训）

- **现象**：`vitest.config.ts` 覆盖率注释里**写死的行号**随代码漂移 —— 本轮字典化让 `src/host/index.ts` 两处不可达语句的行号从 `453/454`、`505/506` 漂到 `485/486`、`537/538`（**+32**，commit `db252bf` 只改行号），而这期间覆盖率**百分比没有随之移动**（同一次订正未改数值行；该数值 97.07/96.4/97.56/98.15 是 G-1 加测试后的重测值，与行号漂移无关。**「字典化未移动覆盖率」属推断，本轮未重跑 `test:coverage` 核实**）。
- **同一类教训本轮出现了两次**：§1「运行态」把 PID 从写死值改为「怎么获取」（commit `433cf76`：「以 `~/.dsh/logs/web.log` 最近一次「启动命令」行或 `pgrep -f 'dsh web'` 为准」），与这里的行号是同一个病 —— 写死的是**快照**，而快照会随每次提交失效。
- **做法**：注释与台账里优先写**怎么得到**（命令、锚点符号名、判据），确需写值时一并写明**测量时点与出处**；每次改动后回扫全仓写死的数字（行号、PID、例数、覆盖率、键数）。本轮台账订正的 553→564、72 键→117 键、覆盖率快照，都是这条的实例。

### 顶栏 / 侧栏窄宽度重叠修复（2026-09-11 22:02:59 实测 —— **改动尚未提交，处于工作树**）

**状态**：`src/client/index.tsx` 做了 **5 处 CSS 声明值**改动 + 新增 **3 行说明注释**，**尚未提交**；实测 `git status --porcelain` 里**非台账的改动只有该文件一个 ` M`**（另一个 ` M` 是本台账自身；`lib/`、`client/client.js` 在 `.gitignore` 里，不在 git 状态中）。

**改了什么**（一律按选择器名记，不写行号——见上节「数字会漂移」）：`.fs-hbar` 的 `grid-template-columns` 由 `1fr auto 1fr` 改为 `auto minmax(0,1fr) auto`，并加 `overflow:hidden`；`.fs-hbar-mid` 加 `overflow:hidden`；`.fs-hbar-left` / `.fs-hbar-right` 去掉 `min-width:0`；`.fs-side` 加 `max-width:50%`。**未动 JSX / 文案 / 选择器集合 / 测试文件**（`git diff` 实测只有那 3 行注释与 5 对声明值）。

**这些数怎么得到**：headless Chrome（`/usr/bin/google-chrome --headless=new --dump-dom`）几何探针，脚本 `/tmp/verify-lian/gen3.js`（步长 10）与 `/tmp/verify-lian/gen7.js`（步长 1，另记同列重叠）；输入为工作树 `src/client/index.tsx` 的 `const CSS = […]` 逐字解析（52 条规则），基线取 `git show c7744f9:src/client/index.tsx`。判据：**可见矩形** = 元素矩形与**所有** `overflow != visible` 祖先裁剪盒求交；叶子元素可见矩形相交面积 > 0.5px² 计一次重叠，**跨列**（分属左右两列）记 `visN`、**同列**记 `sameColN`。

**口径有两套，下表各行分属不同口径，混用即失真**。上游原记「面板 200→1200、步长 1（3507 档）」是把两个口径拼成了一句话：`3507 = 501 × 7` 是「步长 1 × 7 场景」的合计，而按 200→1200 每 1px 一档应是 1001 档 —— 探针里两种扫法都不存在。
- **口径 A｜707 档**：面板宽度 1200→200、步长 10（101 档/场景）× 7 个内容场景 = 707 档（`gen3.js`）。
- **口径 B｜3507 档**：面板宽度 700→200、步长 1（501 档/场景）× 7 个内容场景 = 3507 档（`gen7.js`）。

**下列每个计数都是该口径下的实测快照，不是恒定不变量。**

| 指标 | 口径 | 基线提交 `c7744f9` | 改后（工作树） | 定性 |
|---|---|---|---|---|
| 跨列可见重叠 | A｜707 档 | 544 档 / 4758 对 | **0 档 / 0 对**（口径 B 下亦为 0 / 0） | 本次改动的目标，已达成 |
| 同列可见重叠（同一列内两元素互压） | B｜3507 档 | 1002 档 / 1002 对 | 383 档 / 383 对 | **既有残留**（基线即有），非本次回归 |
| 面板窄档下右侧按钮（翻译 / 生成解读 / 编辑 / 保存）是否可见可点 | S2 单场景、w∈[200,480]、步长 1（281 档） | 右列被裁 **6 档**（仅 w=200–205 的「翻译」；w∈[206,480] 的 275 档按钮都在，只是视觉上压在中列上） | **281 档全部**被 `.fs-hbar{overflow:hidden}` 裁掉，不可见、不可点 | **本次新引入的副作用** |

（第三行判据限定为「右列内任一按钮可见面积 ≤ 0.5px²」；若放宽为「该档任一元素被裁」的 `gone` 判据，基线为 **63/281** 档 —— 左列 63、中列 29、右列 6，被裁的是被 flex 压扁的 pill 与图标按钮，右列仍只有那 6 档。上游报告此处记「基线 0/281」，与本轮实测不符，已按实测订正。）

**既有残留 vs 新引入副作用（严格区分）**：
- **同列重叠**（口径 B｜3507 档）：基线即有 ⇒ **既有残留**。成因：`.fs-genwrap{min-width:0}` 被 flex 压到 **20.3px**（基线在 398–582 区间为恒定值），而其内 Button 的渲染宽度为 **52px**，于是「生成解读」按钮溢出压住兄弟元素「● 未保存」（dirty 标记）；最大相交 **411px²**（基线 @ 面板 700px，改后 @ 面板 555px）。命中区间：基线 S2 / S3 场景各 200–700 全域 501 档；改后 S2 398–582（185 档）、S3 415–612（198 档）；其中 398–582 区间两版各 185 档**完全相同**。
- **窄档按钮不可达**：右列按钮被裁档数由 **6/281** 变为 **281/281**（判据见上表第三行）⇒ **本次新引入的副作用**，不是既有行为。待办见 §5 #8。

**消融实验（逐条撤销单个声明）** —— 三条统一在**口径 A｜707 档**下、判据均为**跨列可见重叠**（上游转述时曾把组一的数字同时标成「同列」「跨列」，实测该组数字全部来自脚本的 `visN` 跨列口径，与同列无关）：
- 撤销 `.fs-hbar-mid{overflow:hidden}` ⇒ 跨列可见重叠 **231 档 / 797 对**（列盒重叠 0 档）⇒ 该声明**必需**。
- 恢复 `.fs-hbar-left` / `.fs-hbar-right` 的 `min-width:0` ⇒ 跨列可见重叠 **183 档 / 652 对** + **183 档列盒重叠** ⇒ 也**必需**。
- 把 `.fs-hbar` 列定义回退成 `1fr auto 1fr` ⇒ 跨列 **0 档 / 0 对** ⇒ 该改动**不是**消除重叠的必要条件，它只影响中列吸收剩余宽度。

**独立复核事实**：源码 CSS 规则与产物 `client/client.js` 逐字比对命中 52/52、`.fs-*` 选择器集合双向差集为空；`npm test` = 19 files / 564 passed；`npm run lint` 0 warnings 0 errors；`git diff` 范围仅 3 行注释 + 5 对声明值。（本轮 22:10 再复跑一次，四项逐项一致。）

**未核实**：① **未做真实 GUI 端到端** —— 只有 headless 几何探针，没有人在页面上点过；`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/` = **401**（需认证），本轮复现。② 探针用 **16×16 占位 svg**（`<rect>`）当图标，未复刻真实图标 path —— 占位图标不参与宽度计算，几何结论不受影响。③ 探针在 Linux 本机 Chrome 上渲染，绝对像素端点（如 398–582）会随字体可用性小幅移动，但「重叠 / 不重叠」的判定不依赖阈值。

**本轮数字复核（2026-09-11 22:10:01，探针复跑）**：探针与 dump 仍在 `/tmp/verify-lian/`（脚本 `gen3.js` / `gen7.js`，产物 `probe-*.html` / `dump7-*.html`），`node` + `/usr/bin/google-chrome --headless=new --dump-dom` 可直接复跑（全跑不到 5 秒）。用同脚本重跑后，`dump7-base.html` / `dump7-cur.html` 与上游产物 **md5 逐字节一致**；口径 A 的 544/4758、231/797、183/652 + 183 列盒，口径 B 的 1002/383、S2 398–582（185）/ S3 415–612（198）、最大相交 411px²、`genwrapW`=20.3px / 按钮宽 52px，**全部复现**。**唯一未能复现的上游说法**是「基线 S2 在 w≤480 的 281 档中 0 档元素被裁」（实测右列 6/281、任意元素 63/281，见上表脚注），已按实测订正。

**生效条件与后果（2026-09-12 订正）**：本节改的是 `src/`（两侧都动过，其中 client 侧为主）。**当时**照的是 `README.md`/本文件「改代码后 `build` 再重启才生效」的旧说法——那时尚未区分两半；该说法已于 2026-09-12 作废（见本文件「改动的生效条件」一节）。按**现行判据**：client 侧改动 `npm run build` + 刷新页面即生效、**不需要重启**。本节纪律为「只记账不改代码」，**未跑 build、未重启**——所以**当时确实**没有把改动推上运行态（这是历史事实，不作订正）。

### 三段（a / b）末态复测（2026-09-11 23:29:46，工作树，未提交）

**探针**：`/tmp/stage3b/gen4.js`（＝第三段 a 的 `/tmp/stage3/gen3.js` 加上 R4 的分栏按钮与分栏窗格 DOM），输入仍是工作树 `src/client/index.tsx` 的 `const CSS = […]` 逐字解析；7 场景（含 S6 超长工作区名 79 字符）× 面板 1200→701 步长 10 + 700→200 步长 1 = 551 档/场景 = **3857 档**；判别口径同上节（可见矩形 = 元素矩形与所有 `overflow != visible` 祖先裁剪盒求交）。另跑一遍全区间步长 1（**7007 档**）复核关键窗口，两者的四项指标**逐档一致**。

| 指标 | 口径 | 基线 `c7744f9` | 第三段 a 末态 | **第三段 b 末态（含 R4）** |
|---|---|---|---|---|
| 跨列可见重叠 | 与上表同（基线 707 档 / 改后 3857 档） | 544 档 / 4758 对 | **0 档 / 0 对** | **0 档 / 0 对** |
| 同列可见重叠 | 与上表同（基线 3507 档 / 改后 3857 档） | 1002 档 / 1002 对 | **0 档** | **0 档 / 0 对** |
| 右列被整块裁的下界（面板，最坏场景 S1/S2/S4/S6） | 步长 1 | 459 | 314 | **356**（R4 分栏按钮给右列 +42px 的代价；仍 ≤ 门禁 360，余量 4px） |
| 保存按钮右边缘残缺（面板 499–534） | 步长 1 | 0 档 | **110 档**（第三段 a 新引入） | **0 档**（阈值 470→550 归零） |
| 中列视图名被裁区间（S1 / S2） | 步长 1 | 200–441 / 200–459 | 200–517 / 200–534 | **200–400 / 200–400** |
| 顶栏高度集合 | 3857 档 | {48} | {48} | **{48}**（全程单行，无折行） |

**分栏开启态的顶栏几何**（新增按钮会不会改变顶栏）：同一探针加 `--splitpane` 再跑一遍 3857 档，四项指标与上表**逐档完全相同**（跨列 0 / 同列 0 / 右列整块裁 754 档 [200–356] / 顶栏高 {48}）——分栏窗格只进 `.fs-body`，顶栏 DOM 不随开关变化。另在面板 800 量了两侧窗格宽度：左 `.fs-main` 240.5px、右 `.fs-splitpane` 240.5px（占比 0.5 的 grow 分配成立）。

**两档阈值上调的依据**（逐档 diff，全区间步长 1）：
- **470→550**（工作区名让位）：499–534 那段右列残缺由 110 档归零（S1 19 档 / S2 36 档），中列被裁区间由 200–517 收到 200–358（只改这一档、不含分栏按钮时的隔离实测）；右列整块裁下界**不变**（仍 314）。
- **672→760**（右列四按钮图标化）：R4 给右列添了第四段文字后，实测最坏场景在面板 **701–720** 出现「中列视图名被裁 + 右列部分裁切」（S1 701–703、S2/S6 701–720）；收到 760 后该窗口**整段消失**（S2/S6 中列被裁区间由 200–720 收到 200–400），且逐档 diff 显示 760 相对 672 **没有任何一档变差**（变差 0 档，只有 701–720 变好）。

**本段新引入、已登记的残留**：见 §5 #10 / #11。

### 顶栏三个下拉被 `overflow` 裁剪（提交 `d84da01`；2026-09-12 00:03 用仓库探针复现）

**现象**（用户报「解读选择胶囊 图层错误」）：悬停在「解读选择」/ 视图选择器上（工作区按钮是点击式）
**看不到下拉**，屏幕上只有一条又宽又扁的深色长条——后者是浏览器**原生 `title` 气泡**（§5 #12），
与下拉无关，本段只修下拉。

**根因**：`Menu` 默认**内联**渲染（`portal = false`），面板 `.mr-list` 是 `position:absolute`
（相对锚点 root，`top:calc(100% + 4px)`）⇒ 它是 `.fs-hbar`（**第一段为消跨列重叠加的兜底裁剪**）
与 `.fs-hbar-mid` 两条 `overflow:hidden` 的**后代**，作为裁剪链内的绝对定位盒被整块切掉。
修法**不是**撤裁剪（撤了跨列重叠立刻回来，见上文消融实验），而是给三处 `Menu` 各加 `portal`
（面板挂到 `document.body`，逃出两条裁剪盒）——这也是 primitives 类型注释写明的用例：
「Use when an ancestor's overflow clipping would crop the in-place list」（`lib/types/Menu.d.ts`）。

**量级**（修复前，仓库探针 `--menus=inline`，7 场景 × 551 档 = **3857 档**，判据＝可见矩形 ∩ 全部
`overflow != visible` 祖先裁剪盒）：

| 面板 | 档数 | 承载形态 | 被整块裁 | 可见高集合 | 面板高 | 中心不可命中 |
|---|---|---|---|---|---|---|
| 视图选择器 | **3306** | `hbar` | **3306 [200–1200]** | **0**（恒零） | 176 | 3306 |
| 解读选择 | 3306 | `hbar` | 102 | **0, 6** | 232 | 180 |
| 工作区 | 3857 | `hbar` | 0 | 2 | 64 | 0 |

即**视图选择器下拉在全部有该菜单的 3306 档里整块不可见**（可见高恒 0），解读选择可见高只剩 0–6px。

**修法**：`src/client/index.tsx` 的三处 `Menu`（`genMenu` / `wsMenu` / 视图选择器）各加 `portal`，
**CSS 声明零改动**（那段 CSS 只多了 3 行注释）；`closeOnPointerLeave` **原样保留**——React 的
enter/leave 按 **fiber 树**判定，portal 出去的面板在 React 树里仍是锚点的后代，指针移进面板**不**触发
锚点 `pointerleave`（用真实 `react-dom@18` 复现：移到面板 0 次 leave，移到 React 树外的裸元素必然 leave）。

**回归证据**（修复后，同口径实测）：
- **三项铁律与修复前逐档逐字段 0 差异**（3857 档）：跨列可见重叠 **0 档** / 同列 **0 档** / 顶栏高集合
  恒 **{48}** / 右列被整块裁下界 **357**（最后被裁档 356，门禁 ≤360，余量 3px）。
- **打开态**：`portal` 形态三个面板 **0 档被裁**、可见高恒等于面板高（64 / 176 / 232）；三个面板同时
  打开时视图面板中心有 1546 档被另一个 portal 面板盖住，用 `--menu=view` 单开该数为 **0**（合成场景
  产物，不是缺陷）。
- **打开态不改变顶栏几何**：带 `--menus` 与不带的两份 JSON，3857 档 × 全部非 `menu` 字段 **0 差异**。
- 门禁 19 spec / **586 例**（较修复前 +4 例 portal 断言）+ coverage 100×4 + lint 0 错 0 警告 +
  typecheck exit 0（原始输出 `/tmp/verify-final.txt`，该段授权面只含 `src/` 与 `tests/`，未跑 build）。
- 几何数据的产物：`/tmp/menu-merge/out-full-inline-inline.json`、`out-full-portal-portal.json`
  （**运行产物不进仓库**，跑法见 `tools/ui-probe/README.md` §1.5，两行命令即可复跑）。
- 诊断报告（含订正项与诚实清单）已归档：`docs/agent/reports/2026-09-11-ui-revamp-menu-clipping.md`。

**生效条件（2026-09-12 订正）**：改的是 `src/` 的 **client 侧**。旧记录写「须 `npm run build` + 重启 dsh web」，前半对、后半错——按 2026-09-12 实测的判据，client 产物是 HMR watch 热更的静态资源，**`npm run build` + 刷新页面即生效，不需要重启**（重启多余且会中断对话）。见本文件「改动的生效条件」一节。**本轮是否已 `build`：未核实。**

**订正（本段记录，影响 §5 #12 的措辞）**：`Tooltip` 那条要求写在
规格 **§1 R2**（「三个按钮收成纯图标，且全部保留 `Tooltip` + `aria-label`」），而**§2 第 87 行已明文
把它作废**：「原文写的『原生 `<button>` + `Tooltip` + `aria-label`』是我写错了」，现行口径是
`<Button size icon title>` + 补 `aria-label`（再包一层 `Tooltip` 会**出双气泡**）。所以待办 #12 **不是**
「按规格换 Tooltip」，而是「原生 `title` 长条怎么处理」。

### 探针复刻 DOM 同步 + 保存判据收口 `canSave`（2026-09-12 00:29:48 实测 —— 工作树，未提交）

**本段三件事**（都是上一段报告的待裁决项，用户已裁决）：

1. **探针复刻 DOM 与源码对齐**（改 `tools/ui-probe/probe.js` 的 `scenario()`）：补上 **5 处**
   `.fs-tipwrap` 锚点层（工作区 / 左列两个图标按钮 / 分栏 / 编辑⇄保存），并把右列的「编辑 + 保存」
   纠正为**一个**合并按钮。此前探针量的是一个**已不存在的 DOM**（README §4 早先把它记为「复刻滞后」，
   现已改成同步日期与前后对照）。
2. **保存判据收口**：`canSave = editMode || dirty` 驱动那个合并按钮（`src/client/index.tsx`）。
3. **台账 / README 收尾**：§5 #12 销账、零消费者键记录、复刻同步日期入库。

**下面每个数字的口径**：`--wsicon` 基线口径、7 场景 × 551 档 = **3857 档**、判据＝可见矩形 ∩ 全部
`overflow != visible` 祖先裁剪盒（口径正文 `tools/ui-probe/README.md` §1）；产物
`/tmp/probe-sync/out-sync-{before,after}.json`（运行产物，**不进仓库**，两行命令可复跑）。

| 改动 | 实测收益 | 代价（如实登记） |
|---|---|---|
| 编辑/保存**合并成一个**按钮（`8d5d591` 落地，本段记账） | 右列被整块裁的下界 **357 → 307**（面板；门禁 ≤ 360）；被裁合计 **1010 → 760 档**、右列被裁 **754 → 504 档**；逐档 diff 957 档有差异、**全部是计数减少，变差 0 档**；跨列 / 同列仍 **0 档**、顶栏高集合恒 **{48}**、S0 被裁 **0** | 旧 UI 有「编辑」「保存」（更早还有「查看」）多个入口，合并后**没有「放弃编辑」入口** —— 要放弃只能靠切文件 / 切视图的隐式丢弃（G-4） |
| 判据由 `editMode` 改为 `canSave = editMode \|\| dirty` | 「进过编辑态、留了改动、又退回查看态」（如切走视图再切回源码：下拉 `onSelect` 会 `setEditMode(false)`，而 `edit` 只在**切文件**时重播种）时按钮直接显示「✓ 保存」，**一下落地**（旧判据要 2 击：先回编辑态再保存）；断言钉住「文案＝保存 / 点击触发保存 / `dirty` 随之清零」 | 编辑态与「脏查看态」共用同一个外观 ⇒ 单看截图分不出「正在编辑」还是「只是有未保存内容」 |
| 折叠态分栏失效的**根因**（`8d5d591` 修复，本段记账） | `splitParts = <>{splitBar}{splitPane}</>` 原先只写在**未折叠**分支 ⇒ 折叠文件树后点「分栏」，`splitOn` 翻真而右侧窗格根本不进 DOM。现已提成变量、两分支共渲染；兄弟顺序 `editor → splitBar → splitPane` 在两处必须一致（拖拽回调靠 `previousElementSibling` / `nextElementSibling` 测宽） | 无（jsdom 覆盖折叠 × 分栏 4 种组合；几何探针**覆盖不到折叠态**） |
| `dirty` 期间挂 `beforeunload`（`8d5d591`，本段记账） | 有未保存内容时刷新 / 关标签页 / 关窗会被拦下 | **覆盖边界**：只拦**页面级**离开；**拦不住页内切文件、切工作区、切视图**（那些走 React 状态切换，不触发 `beforeunload`）⇒ G-4 的「切换文件静默丢弃未保存编辑」照旧。要盖住得加应用内确认，本段不做 |

**复刻同步对读数的影响（同步前 / 同步后，同 flags 前后脚各跑一遍）**：跨列 0 / 同列 0 不变；被裁合计
1010 → **760 档**、右列被整块裁 754 → **504 档**、下界 357 → **307**、右列部分裁切 886 → 667；变差 0 档。
两处改动另外做了**单变量对照**：「只加 `.fs-tipwrap` 层（右列仍是两个按钮）」与「只合并按钮（锚点层替换
成恒等）」各自与对应基线**逐档逐字段 0 差异** ⇒ 这一层几何中性。**与上一段报告的差异**：那段外挂装置
（未入库的 `/tmp/e2/measure-new-dom.mjs`）记被裁合计 **790**，本段复跑得 **760**（差 30 档，占 0.8%）；
结构性指标（下界 307、右列被裁 504、跨列/同列 0、顶栏高 `{48}`）与那段一致，差异来源**未定位**
（该装置不进仓库、DOM 变体细节无法逐字核对）。**portal 未受影响**：`--menus=portal` 三个面板仍
**0 档被裁**、可见高恒等于面板高（64 / 176 / 232），且注入打开态不改顶栏四项读数（与不带 `--menus` 的
760 / 504 / 0 / 0 / `{48}` 逐档一致）。

**零消费者文案键 `btnView` / `a11yViewPick`：经裁决保留（不删）**。本段实测 `grep -rn "btnView\|a11yViewPick" src/ tests/`：`btnView` 命中 `src/shared/locale.ts:40`（定义）、`tests/locale.spec.ts:49`（对照表）、`tests/client-view.spec.ts` 的一条**反向**断言（「右列没有 aria-label＝查看 的按钮」，用的是键名）；`a11yViewPick` 命中 `locale.ts:36` 与 `locale.spec.ts:45`。即 **`src/` 里两个键都已无消费者**。保留的三条理由：① 字典是**产品文案注册表**，117 键里本就有只经直连 API / 失败
路径才出现的串（B 类协议串、C 类诊断串），「今天没有 UI 路径渲染它」不是成员判据；② 删键必须手改
`tests/locale.spec.ts` 的**三重硬断言**（键序逐位 + `toHaveLength` + 全等表），而那道断言存在的意义正是
让字典变动成为一次**刻意的、被复审的**动作，为省一个条目去重写它不划算。代价：字典里留着不再被消费的
键（明细与判别方法见经验卡 B-7）。**不要顺手删键。**

**方法论教训（本段之前的真实事故，正文见经验卡 B-4 / B-6，此处只留一句指针）**：主代理做对照实验时
**两个变量同时变**（跑了 `--menus=inline --menu=view` 却没带 `--wsicon`，对照组带了），据此把
1010 → 2013 的差异错误归因给 `--menus`，并据此要求下游「订正文档」；下游独立复现后**否证**（`--menus`
对四项读数零影响）。**对照实验必须单变量，且结论要落到可复跑的产物上。** 本段的单变量做法可直接照抄：
改复刻 DOM 时一次只动一处，另做「tipwrap 恒等 / 右列两个按钮」两份变体逐档 diff。

### 顶栏气泡：往上弹 + 悬停延迟 + 文案缩短 + 术语统一「分栏」（2026-09-12 00:46 实测 —— 工作树，未提交）

**用户原话**：「这个解释位置挡住按钮了，解释可以缩短，分屏与分栏统一术语分栏」，随后追加
「解释气泡等几秒再显示，不要直接显示」。四件事全部收口在 `src/client/index.tsx` 的 `tip()` 一处。

1. **方向往上弹**：`tip()` 新增 `side` 形参（缺省 `TIP_SIDE = 'top'`，**可按调用点覆盖**），
   顶栏 5 处气泡一律往上。**真实机制不是「翻到下方」**（任务书原话如此，与源码不符，已核）：
   `Tooltip.tsx` 的 `fit()` 在 `side === 'right'` 时**直接 return**，永不垂直翻面 —— 右侧放不下时的
   动作是**水平夹回**（`dx = innerWidth - 12 - r.right`），而夹回后的气泡横跨到锚点上方 ⇒
   「解释挡住按钮」就是这么来的。最小几何复现（真实锚点几何 + 真实 `Tooltip.module.css` + 照抄的
   定位判据）：旧文案在靠右的「分栏」按钮上气泡被夹回成 `[1197,1588]`、**压住按钮 1664px² / 1792px²（93%）**；
   改 `top` 后压住面积 **0**。脚本与读数见报告 §2.1。
2. **悬停延迟 1 秒**：`TIP_DELAY_MS = 1000`（全插件一个常量，调节点只有它）。
   primitives 的 `delayMs` **默认值是 0**（`Tooltip.tsx` 形参 `delayMs = 0`），不传就是「hover 即弹」，
   指针扫过顶栏会一路弹气泡。取 1s：比宿主测试惯例的 500ms 更「沉」，又不到让人等烦的程度。
   **键盘 focus 不受延迟影响**：`Tooltip` 的 `onFocus` 走 `cancelShow(); show()`，绕过计时器 —— 无障碍语义未动。
3. **文案缩短**：顶栏 5 处气泡只有 `a11ySplit` 需要瘦身（另外四处本来就是按钮名）。
   `分屏：把当前显示的视图复制一份只读副本到右侧；再点一次关闭`（29 字、气泡实测 **391×26px**）→
   **`分栏：右侧只读副本`**（9 字、**131×26px**，窄 **66%**）。气泡宽度不受调用方控制（只有 `maxWidth` 可调），
   只能靠缩短文案收窄；同一位置下新文案的 `right` 气泡已不再压住按钮（131px 放得下）。
4. **术语统一**：「分屏」→「分栏」（用户裁决）。面向用户与开发者的中文表述全量替换（8 文件、改前 73 处）；
   **英文标识符（`SplitGlyph` / `splitState` / `splitOn` / `splitPane` / `btnSplit` / `a11ySplit` / `.fs-splitpane` …）一律未动**。
   归档报告 `docs/agent/reports/**` 按协议**保留原词**（删旧条＝抹掉审计线索）。

**几何零影响（实测）**：`node tools/ui-probe/probe.js --wsicon` 复核 3857 档 —— 跨列 **0 档**、
同列 **0 档**、被裁合计 **760 档**、右列被整块裁 **504 档**（区间 200–306）、顶栏高集合恒 **{48}**，
与上一段（760 / 504 / 306）**逐字段一致**。气泡是 `position:fixed` 的浮层，不进布局，故读数不该动、也没动。

**未核实**（详见报告 §7）：① 真实 GUI 里**顶栏上方有没有 46px 空间**没实测（本轮未 build、未重启，
`client/client.js` 仍是旧产物）—— 气泡高 26px，`top` 成立需要锚点上方 ≥ **46px**＝26+8+12；
若不足，`Tooltip` 会翻成 `bottom`（落在按钮下方、压正文），那时应改 `TIP_SIDE` 这一个常量；
② 悬停延迟只钉住「传给 `Tooltip` 的 props = 1000」，没跑真实计时器（jsdom 无布局、无指针）。

### 改动的生效条件：client 免重启、host 必须重启（2026-09-12 01:12:33 实测订正）

**这是一条规则性/因果性错误的订正**（不是「当时做错了」的订正）。被订正的旧说法原文（本轮逐处核过）：

- `README.md` 构建产物段：「改 host 或 client 后需重跑 `npm run build` 并重启 dsh web 才生效」
- 本文件 §2 注意事项：「改代码后必须 `build` 再重启才生效」
- 本文件 §3 顶栏/侧栏窄宽度重叠修复段与 §3 三段末态复测段：「改后必须 `npm run build` 再重启 dsh web 才生效」
- 本文件 §3 探针复刻 DOM 同步段：「改的是 `src/`，运行中的页面要看到修复须 `npm run build` + 重启 dsh web」
- 验收段：「改动后需 `npm run build` 并**重启 dsh web** 才生效」

**病根**：这句话把**两半性质完全不同的产物**当成一回事说了。谁都没验过机制，只是照抄。
后果是主代理在 2026-09-12 为**纯 client** 改动连着重启了好几次 `dsh web`，每次中断一次用户对话——
**那些重启不是「失效」，是「多余 + 有代价」**（历史那里确实重启过，不改成「没重启」）。

**新结论（两半分开说）**：

| 半边 | 源码 → 产物 | 产物性质 | 生效方式 |
|---|---|---|---|
| **client** | `src/client/**` → `client/client.js` | 被 HTTP 分发的**静态资源**（本机 profile 挂着 HMR bundle watch） | `npm run build` + **刷新页面**，**不需要重启** |
| **host** | `src/host/**` → `lib/host/index.js` | Node 进程 `require` 进内存的**模块** | `npm run build` + **必须重启** dsh web |

**为什么 client 免重启（机理）**：build 一落盘，HMR 的 stat 轮询发现 mtime/size 变化 → 按内容重哈希 →
调 `clientModules.rebuilt(id)` → host **内存里的 `responses` Map 与 rev 当场更新**。旧的
`cache-control: immutable` 之所以不挡事，正是因为 rev 换了 ⇒ URL 换了 ⇒ 不吃旧缓存。

**决定性证据（2026-09-12 01:12:33 实取，只读操作）**：

- 时间线先立住：运行中的 web 进程（`pgrep -f 'dsh web'`，PID 1030993）**启动于 00:55:03**；
  而 `client/client.js` 的 mtime 是 **01:10:18**（对应提交 `d99eae4`「分栏分隔条改紧凑细线」），
  **比进程启动晚 15 分钟**、期间**没有任何重启**。
- 带 cookie 请求页面 → 取插件自身 bundle URL：
  `/plugins/??dsh-plugin-file-system/client.js&rev=df24c8832f06`
- 请求该 URL：HTTP **200**、**70251** 字节、`cache-control: public, max-age=31536000, immutable`；
  内容含**新**样式标记 `dsw-alias-border-l4` **1 处**、旧标记 `width:5px;cursor:col-resize` **0 处**。
- 与本地 `client/client.js`（70160 字节）`cmp`：**前 70160 字节逐字节相同**（对 `head -c 70160` 的切片
  `cmp` 退出码 **0**）；响应只多 **91** 字节，即 combo 追加的
  `;\n//# sourceMappingURL=/plugins/??dsh-plugin-file-system/client.js.map&rev=df24c8832f06`。
- **rev 就是内容哈希**（可独立复算）：按 `artifactRevision` 的 `framedHash('plugin-artifact', [bundle])`
  = `sha1("plugin-artifact\0" + "70160:" + bundle)` 取前 12 位 hex，得 **`df24c8832f06`**，
  与页面分发 URL 的 rev **完全相同** ⇒ 内存里的 bundle 字节**就是**那份 01:10 落盘的产物。

**源码依据**（复核时读这几处，不写死行号）：

- `packages/client/modules/src/index.ts`：`responses` 内存 Map、`IMMUTABLE_CACHE`、
  `artifactRevision` / `shortHash`（sha1 内容哈希取前 12 位）、`rebuilt(id)` 的注释
  「the HMR watch's registration hook — the only entry point through which bundle content changes reach the graph」。
- `packages/client/hmr/src/index.ts`：`bundleStat`（`statSync` 取 mtime/size）、`pollWatches`（默认 500ms）、
  `syncWatches`（遍历 `clientModules.graph().entries` 逐个装 watch）、`rehash`。

**一条伴生坑**：HMR **成功**重哈希与热更时**不写任何日志**（只有出错走 `ctx.logger.warn`）。
所以「`web.log` 里没有 HMR 记录」**不能**当成「没生效」——那正是这条错记录能被照抄很久的掩护。

**下次换环境怎么重验**（别照抄结论）：取分发 URL（页面 HTML 里的 `/plugins/??<包名>/client.js&rev=…`）→
带 cookie 请求 → 比对**新内容独有的标记串**是否出现、旧标记是否消失 → 与本地产物 `cmp` 前 N 字节。
三步任一不符，就说明那个环境的 watch 没在跑，**那时才需要重启**。

### 视图选择器搬进右列 + 窄档收纳（2026-09-13，工作树，未提交 —— **已按裁决收纳，门禁复绿**）

**需求（用户原话）**：「文件概览位置跟解读选择放在一起，统一放在右侧」；追问后裁决的次序是
「视图选择 解读选择 编辑保存 分栏 依次排序」⇒ 视图选择器由 `.fs-hbar-mid` 移到 `.fs-hbar-right`，
中列只剩路径，右列次序 = 视图选择 → 解读选择 → 编辑⇄保存 → 分栏。规格条目
§1 R5 与 **R5.1**，逐档实测与取证见 `docs/agent/reports/2026-09-13-view-picker-to-right.md`。

**口径**：`--wsicon`、7 场景 × 551 档 = **3857 档**、判据＝可见矩形 ∩ 全部 `overflow != visible` 祖先
裁剪盒（正文 `tools/ui-probe/README.md` §1）。产物：基线 `/tmp/dsh-ui-probe/out-base-b286bab.json`、
搬位置态 `/tmp/dsh-ui-probe/out-after-lian2.json`、**现值 `/tmp/dsh-ui-probe/out-final-lian3.json`**
（分屏态 `out-final-lian3-split.json`）——**运行产物不进仓库**。

| 指标 | 基线 `b286bab` | R5 纯搬位置 | **R5 + 收纳（现值）** | 门禁 |
|---|---|---|---|---|
| 跨列可见重叠 | 0 档 | 0 档 | **0 档** | 0 档 ✓ |
| 同列可见重叠 | 0 档 | 0 档 | **0 档** | 0 档 ✓ |
| 顶栏高度集合 | {48} | {48} | **{48}** | 恒单行 ✓ |
| 右列被整块裁的下界（最坏 S2/S6） | 307 | 389（**破线 29px**） | **339** | ≤360 ✓ 余量 21px |
| 被裁合计 / 右列被整块裁 | 760 / 504 | 916 / 916 | **624 / 624** | 定位用 |
| 右列部分裁切（不在门禁内） | 667 [200–350] | 1045 [200–600] | **777 [200–382]** | —— |
| 逐档 diff | — | 基线→搬：**444 档变差 / 0 档变好**（S1 217–364 / S2·S6 217–388 / S3 217–290 / S4 217–364 / S5 217–316；S0 持平） | 搬→现值：**0 档变差 / 1184 档变好**（S0 200–209、S1·S4 200–400、S2·S6 200–600、S3 200–325、S5 200–351）；基线→现值：509 变差 / 770 变好（变差全部落在 ≥210px 的档，即 R5 搬动本身的残留代价） | —— |

**成因（单档取证，`out-lian-dump389.json` 的 S2@389）**：左列已收到最小（工作区名隐藏、126px）、
中列被 `minmax(0,1fr)` 压到 **0**（列盒宽 0，路径整块不可见），右列要放
68（胶囊）+ 36 + 42.7 + 44 + 36 + 4×6(gap) = 250.7px 而容器只有 361px ⇒ 末项「分栏」raw 374.7–410.7
只剩 **0.3px** 可见。抬升对账：下界 +82px（307→389），其中新增胶囊 68 + 一处 gap 6 = 74px，
余 8px 差异未定位。**机制结论**：中列可压到 0、左列已收完 ⇒ 要过线只能减少**右列** min-content，
而右列每一项都是功能键或状态标记 ⇒ 没有免费像素（详见报告 §7）。

**同批做的 CSS 订正（都有隔离实测背书）**：
- `.fs-hbar-mid` 的 `overflow:hidden`（第一段「防视图选择器画到右列」）**删除** —— 中列不再有按钮
  ⇒ 无消费者；`out-after-nomidclip.json` vs 终版 **0 差异**，两者同去（`out-after-noboth.json`）亦
  0 差异。跨列兜底只剩 `.fs-hbar{overflow:hidden}` 一条，实测跨列仍 **0 档**。
- `.fs-viewwrap` 的 `min-width:0` **删除** —— `flex:none` 下本就不生效，`out-after-viewauto.json`
  **0 差异**。
- 复验「分栏开关不影响顶栏几何」：`--splitpane` 与不带该 flag **逐档逐字段 0 差异**。

**收纳裁决与落地（候选 B，2026-09-13 用户裁决）**：四条候选的实测下界（`--extra` 标定）B **339** /
C 315（**红线不可行**：视图胶囊是裸文本、DSH 无「视图」语义的现成图标）/ D-2 341 / D-3 291，用户裁决
**B「窄档把分栏按钮收起」**。落地做法 = **一条容器查询规则 + 分栏按钮上一个类名**（**不新增任何 DOM
元素、不改菜单内容**）：

```
@container (max-width:620px){.fs-hbar-right > .fs-tipwrap:has(.fs-splitbtn){display:none}}
```

- **阈值 620 的标定**：端点＝分栏按钮**不再被裁**的容器宽 **573px**（面板 601 − `.fs-wrap` 左右内边距
  28px；面板 ≤600 时它正是右列唯一被裁的那一项，`partRightN` 恒为 1），按本仓「约 8% 字体余量取整」的
  惯例 573 × 1.08 ≈ 619 ⇒ **620**。**生效边界实测**：面板 **≤648 收起、649 起显示**，且 649 档它是完整的
  （`--dumpW=648` / `--dumpW=649`：`fs-splitbtn` 的 raw 宽 **0** / **36.0**，后者与 vis 等宽）。
- **为什么不并进既有的 760 档**（上一单标定候选 B 时就是这么写的）：两条规则**读数逐档完全相同**
  （3857 档 × 全部字段 **0 差异**，`out-zz-lian3-T620.json` vs `out-zz-lian3-B760.json`），差别只在
  「分栏入口消失」的面板区间 —— 并进 760 会把它由 ≤648 扩到 ≤788，窄档收纳没有理由多牺牲 140 档宽度。
- **锚点用 `fs-splitbtn` 而不是 `:last-child`**：位置型选择器在右列增删项时会静静选错元素；`:has()` 从
  按钮找回外层的 `.fs-tipwrap`，把锚点层一起藏（只藏内层 `button` 会留一个 0 宽却仍占 6px gap 的层）。
- **与既有两档不打架**（实测）：`wsLabShown` 578/579、`genLabShown` 780/790 在**三份产物**
  （基线 / 搬位置 / 现值）里逐档相同；`hbarH` 3857 档恒 `{48}`。
- **交互语义只少不变**：除「窄档下分栏按钮不可见」这一条，点击 no-op / 悬停开下拉 / portal /
  closeOnPointerLeave / 编辑⇄保存 / 拖拽分栏全部原样。
- **代价（已知边界，见 §5 #14）**：容器 ≤620（面板 ≤648）时**开/关分屏的入口随按钮一起消失**。
- **兼容性 / 降级路径（2026-09-13 补登记）**：`:has()` 是**渐进增强的可选件**，本仓此前只写了「为什么
  选它」、没写「浏览器不支持它时怎么办」。事实：Chrome 105 / Safari 15.4 / Firefox 121 起才支持
  （宿主 DSH web 的支撑面照旧，本插件未新设任何浏览器要求）。**不支持 `:has()` 的浏览器上这条规则
  「选择器无法解析 ⇒ 整条规则被丢弃」而静默失效** ⇒ 分栏按钮不隐藏 ⇒ 右列整块裁下界**回到 389**
  （**破门禁 ≤360**）。**但这属「优雅降级」而非功能损坏**：所有功能键都还在，分栏按钮可见且可点，
  开/关分屏的入口反而比支持 `:has()` 的浏览器**更多**；受影响的只有这条门禁指标本身。同理，若将来
  有人把这条规则改成 `:last-child` 之类的位置型选择器（见上一条的反例），降级面会变成「静静藏错
  元素」—— 那才是真损坏，所以锚点仍必须留在 `:has()` 上。

产物：候选标定 `out-after-{B-split,...}.json`、现值 `out-final-lian3.json`（分屏态 0 差异）。

**本单未跑 `npm run build`、未重启 dsh web**（都在授权外），所以运行中的页面看不到这次搬动。

### 分栏语义反转：从「视图副本」到「冻结对象」（R6，2026-09-13，工作树，未提交）

**需求（用户原话）**：「点击 deepseekHARNESS，出现目录概览，点击分栏之后当前的目录概览右侧冻结，再点击
packages 会出现 packages 的目录概览在左侧，这样就是我的目标」；追问确认两条：右侧数据**要跟着刷新**
（同对象时）、「**拽比例 不用记得**」。规格条目 §1 **R6**，逐条判据 ↔ 实现 ↔ 断言
对照表、设计取舍与边界清单见 `docs/agent/reports/2026-09-13-split-freeze-target.md`。

**R4 的什么被反转了**：R4 冻的只有**视图类型**（`SplitState.mode`），右侧拿左侧那份 viewer 换个 mode 显示
⇒「右侧是谁」完全跟着左侧走，分栏状态只能 `Record<path, …>` 各记各的、比例也跟着按 path 记。R6 冻的是
**「对象 + 视图类型」这一对**，状态**全局一份**，比例**全局单值**。**「右侧恒只读」这条没变**（`editMode`
硬 false、`onTrDone` 传 null）。

**改了什么**（`src/client/index.tsx` +120/−57，只 client 侧；`src/host/**` 与 `tools/**` 一字未动）：

| 处 | 之前 | 现在 |
|---|---|---|
| 状态 | `Record<path, {on, mode, ratio}>` | `splitTarget: SplitTarget \| null`（= 开关）+ `splitRatio: number`（全局单值，不持久化） |
| 右侧数据源 | 无条件复用左侧 viewer | **两支**：左右同 path ⇒ 复用左侧 viewer（天然 live）；否则渲染新子组件 `SplitPane({frozen, grow})` **渲染开启那一刻的数据快照**（A 类修正：R6 时是另起一份 `useOpenedViewer(frozen.opened, null)`，已废弃） |
| 为什么用子组件 | —— | hooks 禁止条件调 hook，但**条件挂载子组件是允许的** ⇒ 独立实例只在需要时挂载，**不为未开启态造占位对象**（那会让 `useEffect` 按 `opened.path` 反复重读 host） |
| 窗格 key | `'split-' + openedPath`（左侧当前 path） | `'split-' + frozen.opened.path`（**冻结对象**）—— 绑左侧 path 会让左侧每切一次对象都卸载重建右侧 |
| 同一性判据 | —— | `opened.path`（`/tree` 的相对路径）。**不能用对象引用**：`onTrDone` 会 `setOpened(prev => ({...prev, hasDocTr:true}))` 造新引用，引用比较会在翻译成功时把「同对象」误判成「异对象」 |
| 拖拽守卫 | 左侧 `openedPath` | `splitTarget`（右侧开着就能拖，与左侧有没有对象无关） |
| 按钮 `disabled` | `!opened` | `!opened && !splitOn` —— **自主决定**：「再点一次即关闭」是唯一关闭入口，而 `refreshRoot`（刷新 / 切工作区）会 `setOpened(null)`，留 `!opened` 会把用户锁死在「左侧空 + 右侧冻着」这一态 |

**判据与断言**（`tests/client-view.spec.ts` 的 `split view: the frozen target (R4 → R6)`，client spec
152 → 155 例：删 1 例（`remembers the split per file…`）、改写 3 例、新增 4 例）：冻结对象（并断言同对象支**不重复读**源文件）/
左侧切对象右侧不动（**A 类修正：**断言异对象支渲染快照、**不再多读一次** host）/ 左侧切视图右侧不动
（正反各一次）/ 同对象时左侧重新生成文件摘要 ⇒ 右侧同一帧刷新 / 全局一份（切文件切目录都不关、
关掉后切回原对象也不自动分栏）/ 比例不按对象记 / 恒只读（`button` 与 `.fs-area` 计数）/ 边界①（点刷新
清空 `opened` 后右侧仍在、按钮仍可用）。**A 类修正新增 2 例**（156 → 158 例，2026-09-13）：切工作区后
右侧不被新 root 同名路径带跑（A-1，mock 把同名 docRel 做成两工作区内容不同）/ 冻结对象被删改名后右侧
仍显示快照、不显示读取失败文本且不新增 host 读（B-2）。

**几何实测（0 差异）**：`--wsicon`、7 场景 × 551 档 = **3857 档**，与基线 `out-final-lian3.json`
**逐档逐字段 0 差异**（跨列 0 / 同列 0 / 被裁 624 / 右列被整块裁 624、下界仍 **339** / `partRight`
777 [200–382] / `hbarH {48}`）；分屏态 `--splitpane` 与 `out-final-lian3-split.json` 同样 **0 差异**。
产物 `out-split-freeze.json` / `out-split-freeze-sp.json`。**DOM 结构没变 ⇒ 几何不该变，实测确实没变**。

**门禁**：typecheck 0 输出 / lint 0 错 0 警告 / **19 spec / 600 例** / coverage **100×4** + 分母 19/19。
**`build` 未跑**（授权否决）⇒ 页面看不到本单改动。

**边界（详见报告 §7）**：B-1 左侧对象被清空（已处理，见上表 `disabled` 一行）；B-2 冻结对象被删 / 改名
—— **2026-09-13 已修**：独立支改渲染开启那一刻的数据快照（`SplitTarget.snap`），不再重读 host ⇒
对象删了 / 改名后右侧仍显示冻结内容，不再出现读取失败文本（见 §5 #16）；B-3 切工作区后同 path 被判成
「同对象」—— **2026-09-13 已修**：`SplitTarget` 加 `curWsId`，判据改为「工作区相同且 path 相同」（见 §5 #15）；
**A-1（邻居问题）—— 2026-09-13 已修**（与 B-2 同族，见 §5 #16）：切工作区后独立支不再按当前 root
重读同名路径 —— 新 root 的同名路径带不走右侧，右侧始终显示冻结那一刻的内容；B-4 异对象支首次挂载
多读一次 host —— **已随快照改造消失**：右侧不再发起任何 `/read`，原断言由「多读一次」改为「读次数
保持不变」；B-5 窄档 ≤648px 没有开关入口（R5.1 既有边界，本单未新增第二条入口，性质不变）。
**新登记边界（A 类修正的固有代价，不修）**：开启那一刻对象若正处于生成中（文件 `genState !== 'idle'`
或目录 `fold.state === 'generating'`），右侧快照会把「生成中」定格住 —— 快照后右侧不再有轮询，
左侧生成完成右侧也不会活过来，要关掉重开。用户场景（先等生成完再开分栏）不会触发。

## 4. 回滚

```bash
# 完整备份（切换前，含 node_modules 软链与 lock）
ls ~/.dsh/backups/web-profile-before-zc-20260911-041620     # 12M
# 回滚：还原整个目录后重启
cp -a ~/.dsh/backups/web-profile-before-zc-20260911-041620/. ~/.dsh/profiles/web/
systemd-run --user --unit=dsh-restart-$(date +%s) --collect \
  --setenv=DSH_SESSION_ID="$DSH_SESSION_ID" ~/.local/bin/dsh-restart
```

步骤见上方代码块（备份 → 还原 → 重启）。

## 5. 后续待办（低优先级，均不影响运行）

| # | 待办 | 说明 |
|---|---|---|
| 1 | ~~T-62 交付摘要~~ | ✅ **2026-09-11 已完成**（commit `cf13458`；含「G-1 已加固」（唯一有意的行为差异 + 运行时前后对照）、G-2~G-12 逐字保留项、覆盖率例外；交付摘要文档已随本仓整理移除） |
| 2 | ~~`src/host/abilities/README.md` 的 4 处 `.js` 文件名~~ | ✅ **2026-09-11 已完成**（commit `a268910`；实为 **6 处**替换点 / 6 个位置 —— L16、L34 行内 3 个不同文件名、L115、L116。原记「4 处」为误） |
| 3 | ~~规格文档的 2 处行号~~ | ✅ **2026-09-11 已完成**（commit `a268910`；实为 **10 项**替换 / **9 个位置** —— 第一轮 6 处 L477/L478/L555/L559/L561/L563 + 补改 L419、L425 行内 2 项（行号 + 加粗）、L549。原记「2 处」为误。与 #2 合计 **16 项替换 / 15 个位置 / 2 文件**） |
| 4 | ~~G-1 是否开新账目修~~ | ✅ **2026-09-11 已完成**（见 §3，两道闸门 + 运行时对照 + 80 例测试） |
| 5 | ~~`R3`：两个 leaf 的 compilerOptions 手抄~~ | ✅ **2026-09-11 已完成**（commit `5c7dced`；提取 `tsconfig.base.json`，消除两个产品 leaf **逐字节相同的 13 项**——原记「6 项严格设置」为误，实际是 13 项：4 项模块方言 + `composite` + **7** 项严格开关 + `skipLibCheck`；测试 leaf 经 extends 链自动继承。实测 `npm run typecheck` exit 0 无输出、`npx tsc --showConfig -p tsconfig.host.json` 各项就位。结构与「哪些项故意不上提」见 §3） |
| 6 | ~~pnpm store v10/v11 冲突~~ | ✅ **2026-09-11 已完成**（根因：该 profile 的 `package.json` 缺 `packageManager` 声明 ⇒ `dsh plugin`（`apps/cli/src/plugin.ts:134` 用 `spawnSync('pnpm', …)` 走 PATH）拿到全局 pnpm **10.33.4**（store v10），而 `node_modules/.modules.yaml` 记的是 **store v11** ⇒ `ERR_PNPM_UNEXPECTED_STORE`；修法：`~/.dsh/profiles/web/package.json:4` 新增一行 `"packageManager": "pnpm@11.7.0"`，**只加这一行**（与备份 `~/.dsh/backups/web-profile-before-pnpmfix-20260911-052009`（12M）逐行 diff 仅此一处）；修后 profile 内 `pnpm --version` 10.33.4→**11.7.0**、`pnpm store path` store/v10→**store/v11**，`pnpm-lock.yaml` 与 `.modules.yaml` mtime 由 Sep 10 01:05 → **2026-09-11 05:20:27**，`dependencies` 与 `dsh.profile.bundles` 逐字未变。**留档坑**：pnpm 自管理缓存 `~/.local/share/pnpm/.tools/pnpm/` 只有 10.33.2 / 11.2.2 / 11.7.0 / 11.15.1，**无 10.33.4** ⇒ 将来给仍用 pnpm 10 的目录补声明必须写 `pnpm@10.33.2`（已缓存、离线可用）。**遗留**：`plugins/dsh-annotate`、`profiles/dsh-robot`、`profiles/lark`、`profiles/open-design`、`~/.understand-anything/repo/understand-anything-plugin` 五个目录的 node_modules 仍是 pnpm 10 装的且无声明，目前靠全局 10.33.4 正常工作，本次**刻意未动**） |
| 7 | ~~host 错误通道字典化（#20）~~ | ✅ **2026-09-11 已完成**（三批：`f46f456` 第1批 / `7a3253c` 第2批 / `18dcb9f` 第3批）。共 **47 处**搬运 / **45 键**新增，`ZH` 72 → **117 键**（逐批实测 72→84→94→117）。**原记「中文 25 + 英文 17」= 42 处，与实测 47 处不符（差 5 处）；差异来源未核实**。文案逐字未变（用户裁决：只搬家不改写）；总账、三批分类口径与机器护栏见 §3 |
| 8 | ~~顶栏窄档收纳（次要操作收进 `⋯` 菜单 / 折行）~~ | ✅ **2026-09-11 23:29:46 已完成**（第三段 a 的「逐级收纳」：工作区名收进 label 层 + `.fs-genwrap` 去 `min-width:0`；第三段 b 再把两档阈值收到 550 / 760。**实测口径与上节逐条相同**：右列被整块裁的下界由基线 459 压到 **356**（面板；≤ 门禁 360），跨列 / 同列可见重叠均 **0 档**（3857 档口径），顶栏高度集合恒 **{48}**、全程单行。方案**不是**原文设想的 `⋯` 菜单或折行——用户裁决「逐级收纳、保持单行」，折行方案实测会让顶栏成倍变高） |
| 9 | ~~`.fs-genwrap` 造成的同列重叠~~ | ✅ **2026-09-11 23:29:46 已完成**（第三段 a 去掉 `.fs-genwrap` 的 `min-width:0`：同列可见重叠由基线 **1002 档** → **0 档**（3857 档口径，含第三段 b 的 R4 分栏按钮后仍为 0）。代价已如实登记：右列整块裁下界由面板 284 退到 314，第三段 b 再因分栏按钮退到 356——见 §5 #11） |
| 10 | 面板 **≤400px** 时中列视图名被 `.fs-hbar-mid{overflow:hidden}` 裁掉 | **已知边界，不修**（第三段 b 用户裁决：牺牲显示、保住功能键）。区间实测：S1/S2/S4/S6 为面板 200–400、S3 为 200–252、S5 为 200–352（步长 1）。成因：中列是 `minmax(0,1fr)`，要给视图名保 min-content 就得把溢出推给右列，直接违反「右列不被整块裁」的门禁。视图选择器与路径仍在（路径给全），只是窄档下视图名被裁 |
| 11 | ~~右列整块裁下界由 314 退到 356（R4 分栏按钮给右列 +42px min-content）~~ | ✅ **2026-09-13 订正（356 → 307）**：356 是**第三段 b 当时的**读数 —— 那时右列还是独立的「编辑」+「保存」两个按钮，R4 的分栏按钮先给右列 +42px min-content、把它从 314 推到 356。`8d5d591` 把编辑/保存**合并成一个**按钮后，右列最后一档被裁由 356 退到 306 ⇒ **下界 307、余量 53px**（门禁 ≤360）。这才是现值：`tools/ui-probe/README.md` §1.2、同文件 §4 的同步前后对照表与本文件 §3 三处共用的都是 307，产物 `out-base-b286bab.json`（`--wsicon`，3857 档）。旧的「实测 356、余量仅 4px」按**历史时态**保留在此，不再作门禁依据。同一探针的 S0 场景（无打开对象）另在**面板 200–209 有 10 档右列部分裁切**（门禁口径不含此项）。**注意：本单 R5 把下界又抬到 389，见 #13。** |
| 12 | ~~顶栏的原生 `title` 气泡（挂在「解读选择」上的长条，文案即 `a11yGen`：`生成/重新生成：目录概览·文件摘要·源码注解·文章翻译`）~~ | ✅ **2026-09-12 已完成**（commit `8d5d591`；台账/探针收尾在本段工作树）：① 顶栏 **7 个按钮**的气泡统一改为 primitives 的 `Tooltip`，原生 `title` 全部撤除，并补齐 `aria-label`（`foldBtn` / `refreshBtn` 原先**只有** `title`）。锚点必须是**原生元素**——primitives 的 `Button` 在 React 18 下挂不上 ref、气泡永不渲染（经验卡 B-5）——所以每个挂气泡的按钮外面包了一层 `.fs-tipwrap`（实测几何中性，见 §3 探针那节）；② **视图选择器与解读选择两个按钮豁免不挂气泡**：它们的悬停手势已被下拉占用（`onMouseEnter` 开菜单），再挂气泡会同时弹两个浮层。**这是刻意的例外，不是遗漏**（源码注释与断言 `tooltipLabel(...) === null` 都钉住了它）。右格下面那条「反向风险」因此按「不加气泡」处置。以下是**裁决前的原始记录**（保留不改）：**待用户裁决**。它是**浏览器原生**气泡：宽度 / 深色底 / 位置 / 层级完全不受页面控制，表现为按钮下方一条又宽又扁的深色条、**压住正文**，且不受任何 `overflow` 裁剪（正是这一点让它比被裁的下拉更显眼）。**规格口径已订正（见 §3 末节「顶栏三个下拉被 `overflow` 裁剪」的末段「订正」）**：`Tooltip` 那要求写在规格 **§1 R2**，而 **§2 第 87 行已明文作废**该写法（`Button` 已透传 `title`，再包一层 `Tooltip` 会**出双气泡**）⇒ 待裁决的是「这条长条怎么处理」（缩短文案 / 只留 `aria-label` / 另设计气泡 / 维持原状），**不是**「按规格换 Tooltip」。同批一并裁决**可访问名缺口**：`foldBtn` / `refreshBtn` **只有 `title`、没有 `aria-label`**（实测 `src/client/index.tsx` 里 `IconPanelLeftOutline16` 与 `IconRefreshOutline16` 两个 `Button`），而规格 §2 现行口径要求纯图标按钮「`<Button size icon title>` + 补 `aria-label`」；`viewBtn` 只有 `title`（有可见文字，名字来自文字）；`edit` / `save` 只有 `aria-label`（无 `title`）；`genAnchor` / `wsAnchor` / `splitBtn` 两个都有。**反向风险**：`genAnchor` 悬停即开 Menu，若给它加气泡需决定关掉气泡（`disabled`）或留 `delayMs` 时差，否则悬停会同时出气泡与下拉 |
| 13 | ~~R5 视图选择器搬进右列 ⇒ 右列整块裁下界 **307 → 389**（破门禁 ≤360）~~ | ✅ **2026-09-13 已裁决并修（候选 B ⇒ 下界 339）**：用户裁决「窄档把分栏按钮收起」，落地为**一条容器查询规则（阈值 620）+ 分栏按钮上的类名 `fs-splitbtn`**（不新增元素），右列整块裁下界 **389 → 339**（✓ 门禁 ≤360，余量 21px）、被裁合计 916 → **624 档**、右列部分裁切 1045 → **777 档**；跨列 / 同列仍 **0 档**、顶栏高恒 **{48}**；相对搬位置态**变差 0 档 / 变好 1184 档**、分屏态 0 差异。阈值论证（端点 573 × 8%）、生效边界（面板 648/649）与四条候选对照见 §3 本单小节、规格 §1 R5.1，产物 `out-final-lian3.json`。**R5 搬动本身相对基线的残留代价仍在**：下界 307 → 339、变差 509 档（全部落在 ≥210px 的档）—— 一句「已修」只针对破门禁，不等于回到基线读数 |
| 14 | 窄档（面板 **≤648px**）没有开 / 关分屏的入口 | **已知边界，不修**（R5.1 收纳裁决的直接代价，写法与 #10 同源）。事实依据：`toggleSplit` 在 `src/client/index.tsx` 里的**唯一调用点**就是那个分栏按钮（**R6 订正**：这句话在 R6 之后**仍然成立** —— R6 只把拖拽改比例从 `setSplits` 换成了 `setSplitRatio`，那条路从来不碰开关；菜单与快捷键里都没有第二条路），而 `@container (max-width:620px)` 那条把整个 `.fs-tipwrap` 锚点层 `display:none`。后果：**面板已开着分屏时再把它拖到 ≤648px 就关不掉**（拖宽才回得来），这一档里也开不了新的分屏。不修的理由：门禁（右列被整块裁 ≤360）只能靠减少右列 min-content 过线，而右列每一项都是功能键或状态标记；四条候选里 B 的代价面已压到最小（并进 760 档会把失去入口的区间扩到 ≤788）。 |
| 15 | ~~切工作区后**同名的相对 path 会被判成「同一个对象」**~~ | ✅ **2026-09-13 已修（B-3）**：`SplitTarget` 加 `curWsId` 字段（开启那一刻的工作区 id，随 `selectWs` 切换变化、刷新不动），`splitSameObj` 判据改为「`frozen.curWsId === curWsId` 且 path 相同」，测试新增 `treats a same-named path in another worktree as a different object (B-3)`（两个工作区各有同名 `packages`，冻结 A 的再切 B 点开 → 右侧仍显示 A 的）。选 `curWsId` 而非 `rootPath` 的理由：它只在 `selectWs` 里变、刷新与树操作都不动它，是「切工作区」这个动作的直接标识；`rootPath` 每次 `refreshRoot` 都会重新赋值（语义上是「当前根」而非「所选工作区」），同一工作区被外部重整路径时还会漂移。**未做**：切工作区后冻结对象数据**在哪个 root 下读取**仍按 `frozen.opened.path` 走（新 root 读同名路径）—— 属另一语义问题，与 B-2 同族，登记在报告「未做/边界」里，本单未动（**A 类修正后已解，见 #16**）。详见 `docs/agent/reports/2026-09-13-split-freeze-target.md` §7 B-3 与「未做」节 |
| 16 | ~~切工作区后独立支按当前 root 重读同名路径（A-1 邻居问题）；冻结对象被删 / 改名后右侧显示读取失败文本（B-2）~~ | ✅ **2026-09-13 已修（A 类修正，快照方案）**：`SplitPane` 不再调 `useOpenedViewer` 重读 host，改为渲染**开启那一刻从左侧 viewer 拷来的数据快照**（`SplitTarget.snap`，字段 = `FsPane` 查看分支渲染所需的全部数据字段、不含方法；`toggleSplit` 拷，`editMode` 硬 false）。A-1（不依赖当前 root）与 B-2（快照不随对象删除消失）一次解掉，且**消掉独立支原有的 /read**、不新增任何 host 调用；同对象支（复用左侧 viewer、live 跟刷新）一字未动。测试：`…switching worktrees, even when the new root serves a same-named path (A-1)`（mock 把同名 docRel 做成两工作区内容不同，钉「右侧仍是冻结的 A」）+ `…after the frozen object is deleted or renamed (B-2)`（分栏后把该 path 的 /read 改 500，钉「右侧仍显示 # Full、无失败文本、读次数不变」）；B-4 旧断言由「多读一次」改为「读次数保持不变」。**固有代价（新登记边界）**：开启那一刻对象在生成中（文件 `genState !== 'idle'` / 目录 `fold.state === 'generating'`）则右侧把「生成中」定格，左侧生成完右侧也不活、要关掉重开 —— 「冻结那一刻」语义的固有代价，用户场景不触发，不修 |
| 17 | ~~目录概览（folder 层 L1）文档命名规则：同名目录跨层级互相覆盖~~ | ✅ **2026-09-13 已修（子代理执行）**：`native/system/packages` 与根下 `packages` 的「目录概览」原本都落在 `目录概览/packages.md`（folder 层 docStem 只取文件夹名 basename，与文件层 computeDocStem 不对称）。修复：目录层 stem 改走新函数 `folderDocStem(relP, root)` = `computeDocStem(relToSrcKey(relP, root))`，与文件层同一「含父目录层级」视角；`/tree` 目录节点 stem 判定与 folder-doc 能力的 docStem **共用同一函数**（消灭「UI 有圆点 / 实际无文件」再漂移）；骨架的标题 / 目录树第一行仍用 basename(abs) 显示真实目录名。实测 `node /tmp/book-collision-check.mjs` 修复前「⚠ 撞车」→ 修复后「**不撞车（5 个目录，5 个不同落点，含 3 组同名目录对照）**」。**遗留影响：旧文档孤儿化** —— 已按旧规则生成的目录概览（如那本讲不清是哪个 packages 的 `packages.md`）不再被任何目录匹配，留在书库当孤儿；UI 里对这些目录点「重新生成」即可换新命名。详细报告：`docs/agent/reports/2026-09-13-folder-doc-stem-collision.md`。**注意**：任务书授权面未列 `tests/gen-scope.spec.ts`、`tests/p3-host-routes.spec.ts`，但二者含 folder stem 断言（`/tree` 判定、gen-doc docRel、骨架树首行），不改则 test 门禁必挂 —— 本次按「发现任务书有错先订正」纳入改动面，特此记录 |

## 6. 未做且明确不做的

- **旧「目录概览」文档孤儿化（2026-09-13 命名规则变更的直接后果）** —— 规则从「文件夹 basename」改为「含父目录层级」后，按旧规则生成的目录概览（如 deepseekHARNESS 桶里那本 `目录概览/packages.md`，讲不清是 native/system/packages 还是根下 packages）不再被任何目录的 `/tree` 判定匹配（圆点消失），文件留在书库当孤儿。**不做迁移脚本**：旧文档语义本就不全，用户在 UI 对这些目录重新点「生成/重新生成」即可得到新命名文档。

## 7. 变更日志

### 2026-09-15 整理：包名去后缀 + 清迁移史 + 删技能链路

- **包名去后缀**：`dsh-plugin-file-system-zc` → `dsh-plugin-file-system`（目录改名、`package.json`、profile 两处引用、全仓 40 文件 94 处引用一次替换到底）。
- **删技能链路**：`skills/`（5 技能 / 13 文件）、`agent.cordis.yml`、`preset.yml` 全删——插件从「bundle + agent 预设」双身份退回**纯 bundle 单身份**。连带：`package.json` 的 `files` 去掉三项；`gen-executor.ts` 的 `SKILLS_ROOT` 变量与 `skillsRoot` 渲染变量删除（四层 prompt 从不引用它，宿主生成能力全在 `src/host/abilities/`，功能不变）；`~/.agents/skills/` 下 file-doc / folder-doc / source-doc 三条已断软链清除。
- **删问题台账**：`issues/`（21 篇）删除。`issuesDir()` 因目录不存在返回空串，宿主生成/翻译任务据此跳过台账步骤（该能力随之关闭；如需恢复，设 `DSH_FS_ISSUES_DIR` 指向外部目录即可）。
- **清迁移史与阶段规格**：删 `docs/` 根下全部文档——`archive/`、`baseline/`（旧仓取证三份）、`p6-cutover-runbook.md`、`delivery-summary-2026-09-11.md`、`t14-stale-refs.md`、`p1c-skills-migration.md`、`p2a-tsconfig-d6.md`、`spec-p2-pure-logic.md`、`spec-p3-host-routes.md`、`spec-p4-client.md`、`spec-p5-p6-tests-and-cutover.md`、`p5-migration-matrix.md`、`feature-baseline.md`、`spec-p1-skeleton.md`、`spec-p5-tests-detail.md`、`spec-ui-revamp.md`；`README.md` / `PROGRESS.md` 里的迁移源、旧仓对照、已删文档引用一并清除。清理后 `docs/` 只剩 `agent/`（子智能体协作体系：入场文档 + 历史报告索引）。
- **代码与测试注释**：清掉 `tests/` `src/` `tools/` 里的迁移溯源表述（「迁移自迁移源 X」「源实现」「决策 D-N」「冻结于 3a3f89e」等），改中性说法，不动逻辑与断言；报告 `docs/agent/reports/2026-09-15-clean-migration-notes-in-code.md`。
- **门禁**：typecheck / lint / test（**19 spec / 602 例**）/ coverage（**100×4**，分母 19/19）全绿；`build` 已跑（包名变更后须重建产物并通过 banner 校验）。
- **例外裁决记录**：本次用户明确裁决「`-zc` 引用全部替换**含历史快照**」，覆盖本仓「历史时态保留」惯例。
- **报告**：`docs/agent/reports/2026-09-14-rename-drop-zc.md`（改名 + 孤儿盘点）、`docs/agent/reports/2026-09-15-doc-cleanup-migration-history.md`（文档清理）。
