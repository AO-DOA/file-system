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
| 包名 | `dsh-plugin-file-system-zc`（非 scoped，决策 D-1） |
| 仓库 | `/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc` |
| 迁移源（**只读，全程未改动一字节**） | `../dsh-plugin-file-system` @ `3a3f89e` |
| profile | `~/.dsh/profiles/web`：`dependencies` 与 `dsh.profile.bundles` 均已指向 `-zc` |
| 运行态 | dsh web 运行中，端口 3080；boot manifest 已装载 `-zc`（rev `ceedbcfa…`）。PID 每次重启都变：以 `~/.dsh/logs/web.log` 最近一次「启动命令」行或 `pgrep -f 'dsh web'` 为准（2026-09-11 05:18 实测 516551） |
| 五项门禁 | **全绿**：typecheck 0 输出 / lint 0 错 0 警告 / 553 例 / coverage 100×4 / build 成功 |
| 技术栈 | TypeScript(strict) + vitest/jsdom + tsdown；产物 `lib/host/index.js` + `client/client.js` |
| 功能基线 | 171 功能点（155 已迁移 / 10 不适用 / 6 有意保留）；11 条路由三方一致；135 例逐条对账矩阵 0 处待填 |

## 2. 日常操作

```bash
npm run typecheck      # tsc -b tsconfig.json（5 个 leaf）
npm run lint           # oxlint，0 错 0 警告
npm test               # vitest，19 spec / 553 例
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

**验证**：测试 74 → **80 例**全绿（含 6 种缺失形态 × 3 路由、`'.'`/`'./'`/`'sub/..'` 三种回根写法，以及 `delete 'sub'` → 200 的反向对照，证明守卫只拦根自身）；`src/host/index.ts` 覆盖率由 96.93/96.21/97.56/98.07 升至 **97.05/96.4/97.56/98.15**。

### 覆盖率例外（决策 D-13，用户裁决）

`src/host/index.ts` 与 `src/client/index.tsx` **不进 per-file 100% 门禁**（`vitest.config.ts` 的 `coverage.exclude` 显式列入，同处注释写明实测值与逐条不可达出处）。

理由：两文件剩余未覆盖语句**经逐条证明逻辑不可达**（源插件原样移植的防御性双保险与竞态兜底）——D-8 不许删、禁令不许 ignore、D-2 要求覆盖，三者不可兼得。实测：`index.ts` 96.93/96.21/97.56/98.07；`client/index.tsx` 97.97/95.68/99.17/97.42。

`src/` 下**其余全部文件仍受 per-file 四项 100% 严格门禁**。

### 其余逐字保留的既有行为（G-2 ~ G-12）

详见 `docs/feature-baseline.md` §4 的登记表。要点：
- **G-2** kind 白名单过宽；**G-3** 目录重复请求同一 `/read`；**G-4** 切换文件静默丢弃未保存编辑；**G-5** `refreshRoot` 失败不上屏；**G-6/G-7** 资源泄漏类（`pollTask` 无 `clearTimeout`、拖拽监听无 cleanup）**P4 阶段决定主动保留未修**——该决定贯穿至交付，`src/client/index.tsx:538-539` 注释明写「不新增清理」；`docs/feature-baseline.md` §4 对该两项只写 D-8 例外 b 的「允许修正」授权，非「已修」记录；**G-8~G-11** 任务表进程内 Map、未消费 View 焦点协议等。
- **G-12**：`CodeBlock` 的 `copyLabel`/`copiedLabel` 在 primitives 里是必填，而源插件只传 `{code, lang}`（纯 JS 无类型检查故从未暴露）。迁移版**同样不传**，仅做局部类型窄化，UI 表现与源一致。

### 与主仓风格的有意差异（交付时需说明）

| 差异 | 原因 |
|---|---|
| host 产物是 `lib/host/index.js` 而非 `lib/index.js` | `tsconfig.host.json` 的 `rootDir` 上提到 `src`，以解决 `../shared/locale.ts` 的跨面导入（TS6059/TS6307） |
| solution 根 `tsconfig.json` 无 `extends` | 树外包没有 `tsconfig.base.json` |
| 包名非 `@deepseek-ai/` scope | 该 scope 仅组织成员可发布（决策 D-1） |
| `dsh.client` 未写 `inject` | 实测「不写与旧插件行为完全等价」——旧插件那两个名字在客户端 graph 里都不存在（空转） |

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
| 1 | T-62 交付摘要 | 应写「**G-1 已加固**（唯一有意的行为差异，含运行时前后对照）」+ G-2~G-12 逐字保留项 + 与主仓风格的差异 + D-13 覆盖率例外 |
| 2 | ~~`src/host/abilities/README.md` 的 4 处 `.js` 文件名~~ | ✅ **2026-09-11 已完成**（commit `a268910`；实为 **6 处**替换点 / 6 个位置 —— L16、L34 行内 3 个不同文件名、L115、L116。原记「4 处」为误） |
| 3 | ~~`docs/spec-p5-tests-detail.md` 的 2 处行号~~ | ✅ **2026-09-11 已完成**（commit `a268910`；实为 **10 项**替换 / **9 个位置** —— 第一轮 6 处 L477/L478/L555/L559/L561/L563 + 补改 L419、L425 行内 2 项（行号 + 加粗）、L549。原记「2 处」为误。与 #2 合计 **16 项替换 / 15 个位置 / 2 文件**） |
| 4 | ~~G-1 是否开新账目修~~ | ✅ **2026-09-11 已完成**（见 §3，两道闸门 + 运行时对照 + 80 例测试） |
| 5 | `R3`：两个 leaf 的 compilerOptions 手抄 | 6 项严格设置重复维护，可提取 `tsconfig.base.json` |
| 6 | ~~pnpm store v10/v11 冲突~~ | ✅ **2026-09-11 已完成**（根因：该 profile 的 `package.json` 缺 `packageManager` 声明 ⇒ `dsh plugin`（`apps/cli/src/plugin.ts:134` 用 `spawnSync('pnpm', …)` 走 PATH）拿到全局 pnpm **10.33.4**（store v10），而 `node_modules/.modules.yaml` 记的是 **store v11** ⇒ `ERR_PNPM_UNEXPECTED_STORE`；修法：`~/.dsh/profiles/web/package.json:4` 新增一行 `"packageManager": "pnpm@11.7.0"`，**只加这一行**（与备份 `~/.dsh/backups/web-profile-before-pnpmfix-20260911-052009`（12M）逐行 diff 仅此一处）；修后 profile 内 `pnpm --version` 10.33.4→**11.7.0**、`pnpm store path` store/v10→**store/v11**，`pnpm-lock.yaml` 与 `.modules.yaml` mtime 由 Sep 10 01:05 → **2026-09-11 05:20:27**，`dependencies` 与 `dsh.profile.bundles` 逐字未变。**留档坑**：pnpm 自管理缓存 `~/.local/share/pnpm/.tools/pnpm/` 只有 10.33.2 / 11.2.2 / 11.7.0 / 11.15.1，**无 10.33.4** ⇒ 将来给仍用 pnpm 10 的目录补声明必须写 `pnpm@10.33.2`（已缓存、离线可用）。**遗留**：`plugins/dsh-annotate`、`profiles/dsh-robot`、`profiles/lark`、`profiles/open-design`、`~/.understand-anything/repo/understand-anything-plugin` 五个目录的 node_modules 仍是 pnpm 10 装的且无声明，目前靠全局 10.33.4 正常工作，本次**刻意未动**） |
| 7 | host 错误通道字典化（#20） | 中文 25 + 英文 17 处技术串仍在代码里；本次 G-1 复用既有英文串，未启动该项 |

## 6. 未做且明确不做的

- **`translate-doc` / `session-review` 两个技能仍不可见** —— 切换前就不可见（`~/.agents/skills/` 下实测共 **18 条软链、目标全部存在**，其中指向本插件的只有 `folder-doc`/`file-doc`/`source-doc` 三条；这两个名字在该目录下**没有任何条目**，既非活链也非断链），保持行为等价。
- **旧插件仓 `../dsh-plugin-file-system` 保留** —— 冻结于 `3a3f89e`、工作树干净，可作回滚参照。
