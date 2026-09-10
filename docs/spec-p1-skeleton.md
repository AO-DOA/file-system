# P1 骨架执行规格 — dsh-plugin-file-system-zc

> 本文件是 P1 阶段（T-10 ~ T-16）的**派发依据**。子智能体按此实施；主智能体按「验收标准」验收。
> 制定日期：2026-09-11。依据的官方锚点见 §2，全部经本机 checkout 实测。

---

## 1. 目标

建立一套**能构建、能挂载、四门禁齐全**的空骨架，作为后续 P2–P5 全量迁移的地基。P1 完成时插件可被 profile 安装并成功挂载（注册一个占位槽与一个占位路由），但不含任何业务逻辑。

---

## 2. 依据（官方锚点，均已实测）

| 依据 | 出处 | 对本插件的映射 |
|---|---|---|
| 包 tsconfig 规则、host/client 面与 solution 根 | `<checkout>/packages/AGENTS.md:23` | 采用 leaf + solution-only root |
| 为何拆 host/client：两侧对 cordis `Context` 的**声明合并会冲突**，单 program 报错；拆分包根 `tsconfig.json` 只作 solution | `<checkout>/docs/development.zh.md:68,74` | 我们的 host 与 client 分别 import cordis Context，**必须验证**是否触发冲突；触发则沿用拆分包结构 |
| 客户端产物契约 | `<checkout>/packages/client/tsdown.client.ts`（29640 B） | client bundle 用官方预设产出 |
| 产物包装契约 | 现插件 `dsh/client.js` 头部 = `window.__ModuleLoader__.load({ id: "<插件id>", factory: (require) => {` | **必须逐字保持**（现插件已正确复刻） |
| bundle 包格式 | `<checkout>/docs/user/develop/basic/publish.zh.md:42,56` | `dsh.bundle.patch` 指向 `./cordis.patch.yml`，patch 行按**包名**引用 |
| ESM | `publish.zh.md:39` | `"type": "module"` |
| git 安装须自包含 `prepare` | `publish.zh.md:163` | 提供 `prepare`（不得依赖旁侧 monorepo） |
| 覆盖率门禁（主仓口径） | `<checkout>/AGENTS.md:68` | per-file 100%（**含分支**，用户明确要求） |
| 测试可靠性 | `<checkout>/docs/testing.zh.md:39` | 不得有「单独跑才过」的用例 |

**参照实现**（非依据，仅结构参考）：`dsh-market`（独立 bundle 插件，TS + vitest + tsdown + 三套 tsconfig）。注意它的 `vitest.config.ts` **没有覆盖率门槛**，我们的目标严于它。

---

## 3. 结构决策

### 3.1 tsconfig 四面

```
tsconfig.json          solution-only root：files: []、references 下面三个 leaf
tsconfig.host.json     host 面：rootDir src、outDir lib、declaration、declarationDir lib/types
tsconfig.client.json   client 面：typecheck-only（noEmit）、lib 加 DOM/DOM.Iterable、jsx react-jsx
tsconfig.tests.json    tests 面：extends host、noEmit、rootDir "."、include tests + src
```

`typecheck` 脚本用 `tsc -b tsconfig.json`（solution 根驱动），**不得**用 `tsc -p` 逐个跑（那样 solution 根就是摆设）。

> **待验证**：若 host 与 client 同时 import cordis `Context` 不产生声明合并冲突，则按 `packages/AGENTS.md:23`「ordinary two-entry Client plugins do not split」可退回**单 host 配置 + client typecheck 配置**两文件结构。**由 P1-A 子智能体实测后决定，并把结论写进 PROGRESS.md 决策记录。**

### 3.2 构建

- host：`tsc -b tsconfig.host.json` → `lib/`
- client：`tsdown`（对齐 `<checkout>/packages/client/tsdown.client.ts`）→ `client/client.js`
- 产出**不入库**（`.gitignore` 含 `lib/`、`client/`），与主仓「源平面 vs 产物平面不混」（`AGENTS.md:120`）一致
- **构建后必须自检**：产物头部前缀为 `window.__ModuleLoader__.load({ id: "dsh-plugin-file-system-zc", factory: (require) => {`，否则视为构建失败

### 3.3 包契约

```
name: dsh-plugin-file-system-zc      （非 scoped，见 P1 决策 D-1）
type: module
main: lib/index.js
exports: "." → lib/index.js；"./client" → client/client.js；"./package.json"
files: lib, client, src, cordis.patch.yml, agent.cordis.yml, preset.yml, README.md, LICENSE
dsh.bundle.patch: ./cordis.patch.yml
dsh.client.platform: web
engines.node: >=22.19
```

---

## 4. 派发单元

### P1-A 工程基础（子任务 1）

**目标**：仓库能从零跑通 `typecheck` / `lint` / `test` / `build` 四条命令。

**产出**：
- `package.json`、`tsconfig.json` + 三个 leaf、`.oxlintrc.json`、`vitest.config.ts`、`tsdown.config.ts`、`.gitignore`、`LICENSE`
- 最小 host 入口桩 `src/host/index.ts`（导出 `name` / `inject` / `apply`，apply 为空）
- 最小 client 入口桩 `src/client/index.ts`
- `scripts/build.mjs`（或 npm scripts 直接串 tsc + tsdown）

**验收标准**：
1. `npm run typecheck` 通过（strict，无 TS 错误）
2. `npm run lint` 0 错 0 警告
3. `npm test` 可运行（此阶段允许零测试，但不得报错）
4. `npm run build` 成功，且 client 产物头部契约自检通过
5. `npm run test:coverage` 的 per-file 100%（含分支）门槛**已配置**（此阶段无源码可覆盖，允许显式豁免并在台账记账，P2 起生效）
6. 提交信息 `feat(scaffold): ...`

**禁止**：写任何业务逻辑；改迁移源；提交 `lib/`、`client/` 产物。

### P1-B 装载与挂载（子任务 2）

**目标**：骨架能过**真 Loader** 挂载（这是现插件待办 #19 在迁移版的正面解决）。

**产出**：
- `cordis.patch.yml`（`- insert: - id: <稳定id> / name: 'dsh-plugin-file-system-zc'`）
- `agent.cordis.yml`、`preset.yml`（按迁移源 T-03 基线搬，路径引用改新包）
- host 桩注册一个占位路由 + client 桩注册 conversation.view 槽（id `fs`，order 12）
- `tests/real-composition.spec.ts`：boot test-only `cordis.yml` 过真 Loader，断言插件被挂载

**验收标准**：
1. REAL-composition 测试绿，且断言的是**外部可观测状态**（注册表/日志/HTTP 响应），不是重述实现
2. 四门禁全绿
3. 测试在并发下稳定（连跑 3 轮无失败）
4. 提交信息 `feat(scaffold): ...`

---

## 5. 风险与注意

1. **声明合并冲突**：若 host/client 同 program 报 `Context` 冲突，必须走叶片拆分，不得用 `as any` 绕过。
2. **client 外部依赖**：`react`/`react-dom`/`@deepseek-ai/dsh-client-*` 必须走 loader 模块表 external，不能 inline（inline 会在运行时找不到 require）。
3. **产物不入库** 与 `dsh-market` 相反（它提交 `client.js`）：我们按主仓源/产物平面分离，产物不入库。此差异记入决策记录。
4. 覆盖率门槛在 P1 会「无源码可覆盖」，需在配置里显式处理（例如 include 为空时放行），并在台账注明，P2 起真正生效。
