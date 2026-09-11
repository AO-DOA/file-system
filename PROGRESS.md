# 台账 — dsh-plugin-file-system-zc

> **本文件只记「当前态 + 后续待办」**，保持简约。
> 完整过程台账（337 行：全部决策、逐条证据、验收记录、变更日志）已归档：
> [docs/archive/PROGRESS-full-2026-09-11.md](docs/archive/PROGRESS-full-2026-09-11.md)
> 时间戳规范：`YYYY-MM-DD HH:MM:SS`（用户 2026-09-11 要求）。

---

## 1. 当前状态

**迁移已完成并上线运行。**

| 项 | 值 |
|---|---|
| **入场必读**（新人 / 新子代理开工前） | [docs/agent/README.md](docs/agent/README.md)：三层存储（会话上下文 / 仓库文件 / `dsh知识库`）各放什么、谁写谁读、**入场阅读顺序**；已验证的负结果看 [docs/agent/lessons.md](docs/agent/lessons.md) |
| 包名 | `dsh-plugin-file-system-zc`（非 scoped，决策 D-1） |
| 仓库 | `/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc` |
| 迁移源（**只读，全程未改动一字节**） | `../dsh-plugin-file-system` @ `3a3f89e` |
| profile | `~/.dsh/profiles/web`：`dependencies` 与 `dsh.profile.bundles` 均已指向 `-zc` |
| 运行态 | dsh web 运行中，端口 3080；boot manifest 已装载 `-zc`（rev `ceedbcfa…`）。PID 每次重启都变：以 `~/.dsh/logs/web.log` 最近一次「启动命令」行或 `pgrep -f 'dsh web'` 为准（2026-09-11 05:18 实测 516551） |
| 五项门禁 | **全绿**：typecheck 0 输出 / lint 0 错 0 警告 / **564 例** / coverage 100×4 / build 成功。数字口径：`typecheck`（exit 0、无输出）与 `npm test`（**19 spec / 564 例全过**）为 2026-09-11 字典化后**本轮实测**；`lint` / `coverage` / `build` 沿用字典化前的最近一次实测——本轮纪律未重跑这三项，故不声称其覆盖了字典化改动 |
| 五项门禁（**四段 UI 改造后重测**） | **全绿**（2026-09-11 23:29:46 实测）：`npm run typecheck` exit 0 无输出 / `npm run lint` **0 错 0 警告**（47 files、80 rules）/ `npm test` **19 spec / 582 例**全过 / `npx vitest run --coverage` = All files **100 / 100 / 100 / 100** + `node scripts/verify-coverage-scope.mjs` **19/19 ✓ 分母完整**。**`build` 未跑**（不在本段授权内，用户否决），故运行中的 `client/client.js` 仍是旧产物。上面的 564 例是字典化轮的快照，已被本行取代 |
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
- `lib/`、`client/` **不入库**（决策 D-7）；改代码后必须 `build` 再重启才生效。
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

### 覆盖率例外（决策 D-13，用户裁决）

`src/host/index.ts` 与 `src/client/index.tsx` **不进 per-file 100% 门禁**（`vitest.config.ts` 的 `coverage.exclude` 显式列入，同处注释写明实测值与逐条不可达出处）。

理由：两文件剩余未覆盖语句**经逐条证明逻辑不可达**（源插件原样移植的防御性双保险与竞态兜底）——D-8 不许删、禁令不许 ignore、D-2 要求覆盖，三者不可兼得。实测（顺序 stmts/branch/funcs/lines）：`index.ts` **97.07/96.4/97.56/98.15**；`client/index.tsx` **97.96/95.68/99.16/100**。

> 数值出处是 `vitest.config.ts:37,46` 的注释（G-1 修复后的重测值），**本轮未重跑 `test:coverage`**（纪律所限），故字典化是否再移动这两个数值**未核实**。原记 `index.ts` 96.93/96.21/97.56/98.07、`client/index.tsx` 97.97/95.68/99.17/97.42 是 G-1 修复**前**的快照，已过期。另一处对不齐的读数：上节 G-1「验证」写的「升至 **97.05**/96.4/97.56/98.15」是当次快照，与配置注释现记的 stmts **97.07** 相差 0.02 个百分点——差异来源未进一步核实，引用时以配置注释为准。

`src/` 下**其余全部文件仍受 per-file 四项 100% 严格门禁**。

### 其余逐字保留的既有行为（G-2 ~ G-12）

详见 `docs/feature-baseline.md` §4 的登记表。要点：
- **G-2** kind 白名单过宽；**G-3** 目录重复请求同一 `/read`；**G-4** 切换文件静默丢弃未保存编辑；**G-5** `refreshRoot` 失败不上屏；**G-6/G-7** 资源泄漏类（`pollTask` 无 `clearTimeout`、拖拽监听无 cleanup）**P4 阶段决定主动保留未修**——该决定贯穿至交付，`src/client/index.tsx:538-539` 注释明写「不新增清理」；`docs/feature-baseline.md` §4 对该两项只写 D-8 例外 b 的「允许修正」授权，非「已修」记录；**G-8~G-11** 任务表进程内 Map、未消费 View 焦点协议等。
- **G-12**：`CodeBlock` 的 `copyLabel`/`copiedLabel` 在 primitives 里是必填，而源插件只传 `{code, lang}`（纯 JS 无类型检查故从未暴露）。迁移版**同样不传**，仅做局部类型窄化，UI 表现与源一致。

### 与主仓风格的有意差异（交付时需说明）

| 差异 | 原因 |
|---|---|
| host 产物是 `lib/host/index.js` 而非 `lib/index.js` | `tsconfig.host.json` 的 `rootDir` 上提到 `src`，以解决 `../shared/locale.ts` 的跨面导入（TS6059/TS6307） |
| solution 根 `tsconfig.json` 自身无 `extends`（只有 `"files": []` + 5 条 `references`） | 根不拥有程序，只做 solution 清单；`extends` 由两个产品 leaf 各自指向 `tsconfig.base.json`（2026-09-11 提取，结构见本节末「tsconfig 五 leaf 结构」），测试 leaf 再经 leaf 间接继承 |
| 包名非 `@deepseek-ai/` scope | 该 scope 仅组织成员可发布（决策 D-1） |
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

**生效条件与后果**：改后必须 `npm run build` 再重启 dsh web 才生效（依据 `README.md` 内关于构建生效的说明——按本文件规范不写死行号；本节纪律为「只记账不改代码」，**未跑 build、未重启**）。

### 三段（a / b）末态复测（2026-09-11 23:29:46，工作树，未提交）

**探针**：`/tmp/stage3b/gen4.js`（＝第三段 a 的 `/tmp/stage3/gen3.js` 加上 R4 的分屏按钮与分屏窗格 DOM），输入仍是工作树 `src/client/index.tsx` 的 `const CSS = […]` 逐字解析；7 场景（含 S6 超长工作区名 79 字符）× 面板 1200→701 步长 10 + 700→200 步长 1 = 551 档/场景 = **3857 档**；判别口径同上节（可见矩形 = 元素矩形与所有 `overflow != visible` 祖先裁剪盒求交）。另跑一遍全区间步长 1（**7007 档**）复核关键窗口，两者的四项指标**逐档一致**。

| 指标 | 口径 | 基线 `c7744f9` | 第三段 a 末态 | **第三段 b 末态（含 R4）** |
|---|---|---|---|---|
| 跨列可见重叠 | 与上表同（基线 707 档 / 改后 3857 档） | 544 档 / 4758 对 | **0 档 / 0 对** | **0 档 / 0 对** |
| 同列可见重叠 | 与上表同（基线 3507 档 / 改后 3857 档） | 1002 档 / 1002 对 | **0 档** | **0 档 / 0 对** |
| 右列被整块裁的下界（面板，最坏场景 S1/S2/S4/S6） | 步长 1 | 459 | 314 | **356**（R4 分屏按钮给右列 +42px 的代价；仍 ≤ 门禁 360，余量 4px） |
| 保存按钮右边缘残缺（面板 499–534） | 步长 1 | 0 档 | **110 档**（第三段 a 新引入） | **0 档**（阈值 470→550 归零） |
| 中列视图名被裁区间（S1 / S2） | 步长 1 | 200–441 / 200–459 | 200–517 / 200–534 | **200–400 / 200–400** |
| 顶栏高度集合 | 3857 档 | {48} | {48} | **{48}**（全程单行，无折行） |

**分屏开启态的顶栏几何**（新增按钮会不会改变顶栏）：同一探针加 `--splitpane` 再跑一遍 3857 档，四项指标与上表**逐档完全相同**（跨列 0 / 同列 0 / 右列整块裁 754 档 [200–356] / 顶栏高 {48}）——分屏窗格只进 `.fs-body`，顶栏 DOM 不随开关变化。另在面板 800 量了两侧窗格宽度：左 `.fs-main` 240.5px、右 `.fs-splitpane` 240.5px（占比 0.5 的 grow 分配成立）。

**两档阈值上调的依据**（逐档 diff，全区间步长 1）：
- **470→550**（工作区名让位）：499–534 那段右列残缺由 110 档归零（S1 19 档 / S2 36 档），中列被裁区间由 200–517 收到 200–358（只改这一档、不含分屏按钮时的隔离实测）；右列整块裁下界**不变**（仍 314）。
- **672→760**（右列四按钮图标化）：R4 给右列添了第四段文字后，实测最坏场景在面板 **701–720** 出现「中列视图名被裁 + 右列部分裁切」（S1 701–703、S2/S6 701–720）；收到 760 后该窗口**整段消失**（S2/S6 中列被裁区间由 200–720 收到 200–400），且逐档 diff 显示 760 相对 672 **没有任何一档变差**（变差 0 档，只有 701–720 变好）。

**本段新引入、已登记的残留**：见 §5 #10 / #11。

## 4. 回滚

```bash
# 完整备份（切换前，含 node_modules 软链与 lock）
ls ~/.dsh/backups/web-profile-before-zc-20260911-041620     # 12M
# 回滚：还原整个目录后重启
cp -a ~/.dsh/backups/web-profile-before-zc-20260911-041620/. ~/.dsh/profiles/web/
systemd-run --user --unit=dsh-restart-$(date +%s) --collect \
  --setenv=DSH_SESSION_ID="$DSH_SESSION_ID" ~/.local/bin/dsh-restart
```

步骤与风险详见 [docs/p6-cutover-runbook.md](docs/p6-cutover-runbook.md)（582 行）。

## 5. 后续待办（低优先级，均不影响运行）

| # | 待办 | 说明 |
|---|---|---|
| 1 | ~~T-62 交付摘要~~ | ✅ **2026-09-11 已完成**（commit `cf13458`；新增 `docs/delivery-summary-2026-09-11.md`，实测 **238 行**。含「G-1 已加固」（唯一有意的行为差异 + 运行时前后对照）+ G-2~G-12 逐字保留项 + 与主仓风格差异 + D-13 覆盖率例外 + 回滚；文内对未独立核实项逐条显式标注「（转述，未独立核实）」） |
| 2 | ~~`src/host/abilities/README.md` 的 4 处 `.js` 文件名~~ | ✅ **2026-09-11 已完成**（commit `a268910`；实为 **6 处**替换点 / 6 个位置 —— L16、L34 行内 3 个不同文件名、L115、L116。原记「4 处」为误） |
| 3 | ~~`docs/spec-p5-tests-detail.md` 的 2 处行号~~ | ✅ **2026-09-11 已完成**（commit `a268910`；实为 **10 项**替换 / **9 个位置** —— 第一轮 6 处 L477/L478/L555/L559/L561/L563 + 补改 L419、L425 行内 2 项（行号 + 加粗）、L549。原记「2 处」为误。与 #2 合计 **16 项替换 / 15 个位置 / 2 文件**） |
| 4 | ~~G-1 是否开新账目修~~ | ✅ **2026-09-11 已完成**（见 §3，两道闸门 + 运行时对照 + 80 例测试） |
| 5 | ~~`R3`：两个 leaf 的 compilerOptions 手抄~~ | ✅ **2026-09-11 已完成**（commit `5c7dced`；提取 `tsconfig.base.json`，消除两个产品 leaf **逐字节相同的 13 项**——原记「6 项严格设置」为误，实际是 13 项：4 项模块方言 + `composite` + **7** 项严格开关 + `skipLibCheck`；测试 leaf 经 extends 链自动继承。实测 `npm run typecheck` exit 0 无输出、`npx tsc --showConfig -p tsconfig.host.json` 各项就位。结构与「哪些项故意不上提」见 §3） |
| 6 | ~~pnpm store v10/v11 冲突~~ | ✅ **2026-09-11 已完成**（根因：该 profile 的 `package.json` 缺 `packageManager` 声明 ⇒ `dsh plugin`（`apps/cli/src/plugin.ts:134` 用 `spawnSync('pnpm', …)` 走 PATH）拿到全局 pnpm **10.33.4**（store v10），而 `node_modules/.modules.yaml` 记的是 **store v11** ⇒ `ERR_PNPM_UNEXPECTED_STORE`；修法：`~/.dsh/profiles/web/package.json:4` 新增一行 `"packageManager": "pnpm@11.7.0"`，**只加这一行**（与备份 `~/.dsh/backups/web-profile-before-pnpmfix-20260911-052009`（12M）逐行 diff 仅此一处）；修后 profile 内 `pnpm --version` 10.33.4→**11.7.0**、`pnpm store path` store/v10→**store/v11**，`pnpm-lock.yaml` 与 `.modules.yaml` mtime 由 Sep 10 01:05 → **2026-09-11 05:20:27**，`dependencies` 与 `dsh.profile.bundles` 逐字未变。**留档坑**：pnpm 自管理缓存 `~/.local/share/pnpm/.tools/pnpm/` 只有 10.33.2 / 11.2.2 / 11.7.0 / 11.15.1，**无 10.33.4** ⇒ 将来给仍用 pnpm 10 的目录补声明必须写 `pnpm@10.33.2`（已缓存、离线可用）。**遗留**：`plugins/dsh-annotate`、`profiles/dsh-robot`、`profiles/lark`、`profiles/open-design`、`~/.understand-anything/repo/understand-anything-plugin` 五个目录的 node_modules 仍是 pnpm 10 装的且无声明，目前靠全局 10.33.4 正常工作，本次**刻意未动**） |
| 7 | ~~host 错误通道字典化（#20）~~ | ✅ **2026-09-11 已完成**（三批：`f46f456` 第1批 / `7a3253c` 第2批 / `18dcb9f` 第3批）。共 **47 处**搬运 / **45 键**新增，`ZH` 72 → **117 键**（逐批实测 72→84→94→117）。**原记「中文 25 + 英文 17」= 42 处，与实测 47 处不符（差 5 处）；差异来源未核实**。文案逐字未变（用户裁决：只搬家不改写）；总账、三批分类口径与机器护栏见 §3 |
| 8 | ~~顶栏窄档收纳（次要操作收进 `⋯` 菜单 / 折行）~~ | ✅ **2026-09-11 23:29:46 已完成**（第三段 a 的「逐级收纳」：工作区名收进 label 层 + `.fs-genwrap` 去 `min-width:0`；第三段 b 再把两档阈值收到 550 / 760。**实测口径与上节逐条相同**：右列被整块裁的下界由基线 459 压到 **356**（面板；≤ 门禁 360），跨列 / 同列可见重叠均 **0 档**（3857 档口径），顶栏高度集合恒 **{48}**、全程单行。方案**不是**原文设想的 `⋯` 菜单或折行——用户裁决「逐级收纳、保持单行」，折行方案实测会让顶栏成倍变高） |
| 9 | ~~`.fs-genwrap` 造成的同列重叠~~ | ✅ **2026-09-11 23:29:46 已完成**（第三段 a 去掉 `.fs-genwrap` 的 `min-width:0`：同列可见重叠由基线 **1002 档** → **0 档**（3857 档口径，含第三段 b 的 R4 分屏按钮后仍为 0）。代价已如实登记：右列整块裁下界由面板 284 退到 314，第三段 b 再因分屏按钮退到 356——见 §5 #11） |
| 10 | 面板 **≤400px** 时中列视图名被 `.fs-hbar-mid{overflow:hidden}` 裁掉 | **已知边界，不修**（第三段 b 用户裁决：牺牲显示、保住功能键）。区间实测：S1/S2/S4/S6 为面板 200–400、S3 为 200–252、S5 为 200–352（步长 1）。成因：中列是 `minmax(0,1fr)`，要给视图名保 min-content 就得把溢出推给右列，直接违反「右列不被整块裁」的门禁。视图选择器与路径仍在（路径给全），只是窄档下视图名被裁 |
| 11 | 右列整块裁下界由 314 退到 **356**（R4 分屏按钮给右列 +42px min-content） | **已知残留，随功能引入**。判据与口径见上节表格第三行：门禁要求下界 ≤360，实测 356、**余量仅 4px**（口径 A 的绝对像素端点会随字体渲染小幅移动，换字体族需复测）。同一探针的 S0 场景（无打开对象、右列只有分屏按钮）另在**面板 200–209 有 10 档右列部分裁切**（可见但不完整，门禁口径不含此项）。进一步消解只能把分屏按钮挪去左列或再收一档，代价都是挤掉别的东西，本段未做 |

## 6. 未做且明确不做的

- **`translate-doc` / `session-review` 两个技能仍不可见** —— 切换前就不可见（`~/.agents/skills/` 下实测共 **18 条软链、目标全部存在**，其中指向本插件的只有 `folder-doc`/`file-doc`/`source-doc` 三条；这两个名字在该目录下**没有任何条目**，既非活链也非断链），保持行为等价。
- **旧插件仓 `../dsh-plugin-file-system` 保留** —— 冻结于 `3a3f89e`、工作树干净，可作回滚参照。
