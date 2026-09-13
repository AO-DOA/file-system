# 分栏语义反转：从「视图副本」到「冻结对象」（R6）实测报告（2026-09-13）

**任务**：把分栏从「当前视图的只读副本 + 按文件各自记忆」改成「**冻结一个对象**」——点分栏把
「当前打开对象 + 当前视图类型」一起冻到右侧，左侧之后自由导航（切对象、切视图）右侧都不动；
右侧数据仍是活的（左右同对象时跟着左侧刷新）；分栏状态改成**全局一份**、拖拽比例**不再按对象记**。
**只改 client 侧**。

**结论一句话**：语义与几何都干净 —— 7 条判据各有测试钉子（新增 4 例、改写 3 例，client spec
152 → 155 例）、几何探针与基线 `out-final-lian3.json` **逐档逐字段 0 差异**（3857 档 + 分屏态
3857 档）、五项门禁全绿（600 例 / coverage 100×4 / 分母 19/19）；`src/host/**` 与 `tools/**` 一字未动。

---

## 1. 任务书前提的订正与核对

**先订正再干活 —— 任务书里有 3 处需要订正**：

**① 表格「右侧窗格」一行只写了内层**。原文写
`<FsPane opened={opened} viewer={splitViewer} key={'split-' + openedPath} />`，实际源码里它外面还包着
`<div className="fs-splitpane" style={{ flexGrow: splitGrow }}>`（占比 p 经 `flexGrow = p/(1−p)` 落到这个
外层盒上，`src/client/index.tsx` 的原 1392–1393 行）。这一层是探针 `--splitpane` 复刻的锚点，
订正它是为了说明「本单不需要同步 `probe.js`」——`SplitPane` 渲染出来的结构仍是
`.fs-splitpane > .fs-main`，与探针复刻逐字一致。

**② 判据「边界①」里的气泡文案不存在**。任务书 ④.4 写「没有打开对象时分栏按钮会禁用
（「没有可复制的视图」）」—— **「没有可复制的视图」这句话在源码里不存在**。`splitBtn` 的气泡文案
是 `a11ySplit`（说清「再点一次关闭」这个非通用交互，见 `src/client/index.tsx` 的 `tip(...)` 调用），
按钮上没有任何与「复制视图」有关的字样。这是从 R4 的旧措辞（「把当前显示的视图复制一份只读副本」
——那条描述本身也已随本单作废）里带出来的。**订正后的事实**：`disabled` 原本只看 `!opened`。

**③ `.book/` 不是「路径前缀语境」，只是普通相对路径**。任务书 ④.3 提示「本仓有 `.book/` 等路径前缀
的语境」，实测 `TreeNode.path` 就是 `/tree` 下发的**项目根相对路径**字符串（根为 `.`，书库文档形如
`.book/note.md`，见 `src/client/index.tsx` 的 `TreeNode` 定义），`.book/` 不享有任何特殊命名空间。
同一性判据用 `path` 的依据见 §4。

**其余前提逐条核对，全部与实测吻合**：

| 前提 | 核对结果 |
|---|---|
| HEAD 应是 `e98d619`、工作树干净 | ✓ `git status --porcelain` 空、`git log --oneline -2` 首行 `e98d619`（开工时核过） |
| `SplitState = { on, mode, ratio }`、`splits: Record<path, SplitState>` | ✓ 原 815–819 / 901 行，逐字吻合 |
| `splitViewer = { ...viewer, mode: splitState.mode, editMode: false }` | ✓ 原 1297–1299 行 |
| `splitPane` 条件 `(opened && splitOn && splitViewer)` | ✓ 原 1390 行 |
| `toggleSplit()`：翻转 `on`、开启时冻 `viewer.mode`、关闭保留 | ✓ 原 1309–1324 行 |
| `startSplitDrag()` 按 path 记 ratio | ✓ 原 1347–1351 行（`setSplits(s => ({ ...s, [openedPath]: { ...current, ratio } }))`） |
| `useOpenedViewer` 有 `aliveRef` 活性守卫 | ✓ 492 行声明、510 行重置、549 行 cleanup 置 false；`pollTask` 与全部 `.then` 都用它短路 |
| 基线 `out-final-lian3.json`（3857 档、下界 339、跨列/同列 0 档、`hbarH {48}`） | ✓ 文件在，汇总读数 `{"vis":0,"same":0,"gone":624,"goneRight":624,"partRight":777,"partRightH":"200–382","hbarH":"48"}` |
| `tools/**` 会被 `npm run lint` 扫到 | ✓ `.oxlintrc.json` 没忽略它；**但本单没改 `tools/**`**（理由见 §1①），lint 仍 0 错 0 警告 |
| `src/client/index.tsx` 在 `coverage.exclude` 内（D-13） | ✓ `vitest.config.ts` 的 `exclude: ["src/**/*.d.ts","src/host/index.ts","src/client/index.tsx"]`，分母守卫实测 19/19 |

---

## 2. 改动清单（授权面内，3 个文件改动 + 1 个新增）

| 文件 | 改动 | 行数（`--numstat`） |
|---|---|---|
| `src/client/index.tsx` | 分栏的类型、状态、数据源、开关、拖拽、按钮 `disabled` 与相关注释 | +120 / −57 |
| `tests/client-view.spec.ts` | 分栏块改名并重写：删 1 例（`remembers the split per file…`，语义已反转）、改写 3 例（换名 + 换断言）、新增 4 例 | +123 / −17 |
| `docs/spec-ui-revamp.md` | R4 表按历史时态订正 + 新增 §1 R6 + §6 决策行 + §7 进度表「七」+ §4/§5 订正 | +69 / −10 |
| `docs/agent/reports/2026-09-13-split-freeze-target.md` | 本报告（新增） | 新增 |

**未改的文件（都是核实后确认不需要）**：

- `tools/ui-probe/probe.js` / `README.md`：探针复刻的 DOM 结构（`.fs-splitpane > .fs-main`）与新实现
  仍然一致，且几何读数 0 差异 ⇒ 无需同步。
- `src/host/**`：本单确实纯 client 侧，一个字节都没动（判据 4 靠「同对象复用左侧 viewer」+「异对象另起
  一份 `useOpenedViewer`」在 client 侧解决，不需要 host 参与）。

**关键设计取舍（详见 §4）**：

1. `splits: Record<path, SplitState>` → `splitTarget: SplitTarget | null` + `splitRatio: number`（全局单值）。
2. 右侧数据源**分两支**：左右 path 相同 ⇒ 复用左侧 viewer；不同 ⇒ 新子组件 `SplitPane` 内部另起一份
   `useOpenedViewer`。
3. `startSplitDrag` 的守卫由左侧 `openedPath` 改成 `splitTarget`。
4. **一处超出任务书清单的自主决定**：`splitBtn` 的 `disabled` 由 `!opened` 改成 `!opened && !splitOn`。

---

## 3. 新语义逐条 ↔ 实现点 ↔ 断言 对照表

| # | 判据（任务书 ①） | 实现点（`src/client/index.tsx`） | 断言（`tests/client-view.spec.ts`） |
|---|---|---|---|
| 1 | 点分栏把**对象 + 视图类型**一起冻结 | `toggleSplit()`：`setSplitTarget({ opened, mode: viewer.mode })`；`SplitTarget = { opened: OpenedNode; mode: ViewMode }` | `freezes the open object together with the view type`：右侧渲染 `# Full`，且 `hits('/api/fs/read?path=full.md')` **不增加**（证明同对象支复用左侧 viewer、没有第二份数据） |
| 2 | 左侧切对象，右侧**不动**（不消失、不跟着换） | `splitPane` 的成立条件**不再含 `opened`**；异对象支渲染 `<SplitPane frozen={frozen} …/>` | `keeps the frozen object on the right while the left switches objects`：左侧 `const a = 1`、右侧仍 `# Full`、`.fs-splitpane` 仍在，且 `hits('/api/fs/read?path=full.md')` **+1**（证明右侧另起了一份实例） |
| 3 | 左侧切视图，右侧**也不动** | 右侧 viewer 的 `mode` 恒取 `frozen.mode`，不看 `viewer.mode` | `freezes the view type: left-side view switches never touch the right pane`：冻「源码」后左侧切「源码注解」⇒ 左 `# Title` / 右 `# Full`；**再反向一次**：关掉重开冻「源码注解」，左侧切回「源码」⇒ 左 `# Full` / 右 `# Title` |
| 4 | 右侧数据是**活的**（同对象时跟着刷新） | 同对象支 `viewer={{ ...viewer, mode: frozen.mode, editMode: false }}` —— 直接用左侧那份 state | `keeps the right pane live while both sides show the same object`：左侧「重新生成文件摘要」把 `docData` 换成 `# Fresh` ⇒ 右侧同一帧显示 `# Fresh` |
| 5 | 分栏状态**全局一份**，切对象保持开启、关掉后不自动回来 | 状态是单个 `splitTarget`，不再按 path 索引 | `keeps one global split: every object keeps the frozen right pane`：切文件、切目录右侧都在；关掉后切回当初开过栏的 `full.md` 仍是全屏 |
| 6 | 拖拽比例**不再按文件记** | `setSplitRatio(ratio)`（原来写 `setSplits(...[openedPath])`） | `drags the divider, clamps the ratio and keeps one ratio for every object`：拖到 0.8（grow 4）后切到从未拖过的 `app.ts`，grow 仍 4；关掉再开仍 4 |
| 7 | 右侧**恒只读** | 两支都把 `editMode` 硬为 false；`SplitPane` 的 `onTrDone` 传 `null` | 判据 1 那条里 `rightPane().querySelectorAll('button')` = 0、`.fs-area` = 0；判据 3 那条里左侧进编辑态时全页只有 1 个 `.fs-area` 且在左侧 |
| 边界① | 左侧对象被清空（`opened == null`）时怎样 | `splitPane` 不依赖 `opened`；按钮 `disabled={!opened && !splitOn}` | `keeps the frozen pane after the left object is cleared`：点刷新（`refreshRoot` 会 `setOpened(null)`）后左侧空态、右侧仍 `# Full`；按钮**可用**并能关掉分栏 |

---

## 4. 为什么这样取数据源（判据 4 与判据 2 的张力）

判据 4 要「右侧跟着左侧刷新」，判据 2 要「左侧换对象后右侧不受影响」——**同一条数据通道不可能同时满足
两句话**：共用一个 `viewer` 时换对象必然带着右侧换（判据 2 破），各起一份时同对象又不共享（判据 4 破）。
所以答案是**分两支**，判据 4 只对「左右同对象」这一段成立：

| 支 | 触发 | 数据源 | 满足 |
|---|---|---|---|
| 复用支 | `frozen.opened.path === opened.path` | **左侧那一份 `viewer`**（`{ ...viewer, mode: frozen.mode, editMode: false }`） | 判据 4（天然 live）+ 判据 1（不重复读 host） |
| 独立支 | 其余（左侧切走，或左侧被清空） | 新子组件 `SplitPane` 内部的第二份 `useOpenedViewer(frozen.opened, null)` | 判据 2（两侧互不影响） |

**为什么独立支做成子组件**：hooks 规则禁止条件调用 hook，但**条件挂载一个子组件是允许的**。这样
「独立实例只在确实需要时挂载」不需要任何额外开关变量，也**不会为未开启态造占位对象** —— 而占位对象
正是任务书 ④.1 点出的坑：`useOpenedViewer` 的 `useEffect` 依赖 `[opened.path]`，一个每次渲染都换引用的
空对象会让它反复重读 host。

**卸载安全**：`useOpenedViewer` 的 `aliveRef` 在挂载时置 true、cleanup 时置 false（原 508–549 行），
`pollTask` 与全部 `.then` 都先用它短路 ⇒ 回切到复用支时，独立实例已经在途的读取不会被写回来。

**为什么同一性判据取 `opened.path`**：它是 `/tree` 下发的项目根相对路径，在同一个项目根内唯一。
`name` 不行（不同目录可以同名）；`TreeNode` 上也没有别的稳定 id（`type` / `hasDoc*` / `doc*Rel` 都是会
变的元数据）；用**对象引用**更不行 —— `onTrDone` 会 `setOpened(prev => ({ ...prev, hasDocTr: true, … }))`
造出新引用，用引用比较会在翻译成功后把「同对象」误判成「异对象」，右侧当场被卸载重建。

**为什么 key 绑冻结对象**：`key={'split-' + frozen.opened.path}`。绑左侧当前 path 的话，左侧每切一次对象
右侧都会卸载重建、重拉一遍数据 —— 判据 2 会被破坏成「每次切左侧都闪一下」。写清一句**诚实说明**：
在当前两支由**元素类型**区分（`div.fs-splitpane` vs `SplitPane`）的前提下，key 本身不是重建开关；
它的作用是把这个身份钉在冻结对象上，将来若两支被合并到同一位置，key 仍能挡住「复用上一个对象的
组件实例继续显示旧数据」。

**超出清单的自主改动（第 4 项取舍）**：`disabled={!opened && !splitOn}`。原因是「再点一次同一个按钮即
关闭」是分栏**唯一**的关闭入口（R5.1 已把窄档那条路收掉，菜单里从来没有第二条），而 `refreshRoot`
（刷新按钮 / 切工作区）会 `setOpened(null)` —— 若仍写 `!opened`，用户在「左侧空态 + 右侧冻着东西」时
就被锁死，只能先点一个文件才能关分栏。这属于分栏语义本身，故未越界；判据「没有打开对象时禁用」
（既有用例 `keeps the entry disabled until something is open`）**仍然成立**，因为那一态下 `splitOn`
为假。

---

## 5. 实测：几何逐档对比（0 差异）

口径：`--wsicon`、7 场景 × 551 档 = **3857 档**、判据＝可见矩形 ∩ 全部 `overflow != visible` 祖先裁剪盒。

| 产物 | 档数 | vis（跨列） | same（同列） | gone | goneRight | partRight | hbarH |
|---|---|---|---|---|---|---|---|
| 基线 `/tmp/dsh-ui-probe/out-final-lian3.json` | 3857 | 0 | 0 | 624 | 624 | 777 [200–382] | 48 |
| 本单 `/tmp/dsh-ui-probe/out-split-freeze.json` | 3857 | **0** | **0** | **624** | **624** | **777 [200–382]** | **48** |
| 基线分屏态 `out-final-lian3-split.json` | 3857 | 0 | 0 | 624 | 624 | 777 [200–382] | 48 |
| 本单分屏态 `out-split-freeze-sp.json` | 3857 | **0** | **0** | **624** | **624** | **777 [200–382]** | **48** |

**逐档逐字段 diff**（自写比较器，递归比对两份 JSON 的每个字段）：

```
基线 out-final-lian3.json       vs 本单 out-split-freeze.json      → 差异条数: 0
基线 out-final-lian3-split.json vs 本单 out-split-freeze-sp.json   → 差异条数: 0
```

读数与任务书的期望一致：**DOM 结构没变 ⇒ 几何逐档 0 差异**，右列被整块裁下界仍是 **339**（门禁 ≤360）。

---

## 6. 门禁实况（2026-09-13，工作树未提交）

| 门禁 | 结果 |
|---|---|
| `npm run typecheck` | exit 0、**无输出** |
| `npm run lint` | **0 错 0 警告**（48 files、80 rules、4.7s） |
| `npm test` | **19 spec / 600 例**全过（基线 597 → 600，client spec 152 → 155） |
| `npx vitest run --coverage` | All files **100 / 100 / 100 / 100** |
| `node scripts/verify-coverage-scope.mjs` | ✓ 分母完整：19 个源文件全部进入统计 |
| `npm run build` | **未跑**（不在本单授权内，用户否决）⇒ 运行中的 `client/client.js` 仍是旧产物 |

---

## 7. 边界清单（如实登记，不编造）

| # | 边界 | 事实 | 处置 |
|---|---|---|---|
| B-1 | 左侧对象在分栏开启期间被清空 | `refreshRoot`（刷新按钮 / 切工作区）会 `setOpened(null)`。此时 `splitPane` 仍在（它的条件不含 `opened`），右侧继续显示冻结对象；左侧渲染空态。**已实测** | 已处理：按钮 `disabled` 改成 `!opened && !splitOn`（见 §4），否则这一态下没有关闭入口 |
| B-2 | 冻结对象在分栏开启期间被**删除 / 重命名** | 右侧独立实例的 `/read` 失败 ⇒ `FsPane` 在 `v.status && !v.source` 分支显示 `errReadFail` 文本；若左侧此时也切到该对象，两侧显示同一份错误。**不做任何自动处置**（不自动关分栏、不自动改冻结对象） | **已知边界，不修**。本单只在 jsdom 里验证（stub fetch），**没有在真实 host 里造「开着分栏删文件」的场景** |
| B-3 | 切工作区后 `path` 命名空间改变 | 同一性判据是相对路径字符串；新 root 下若存在同名 `path`，会被判成「同一个对象」而走复用支（右侧显示的其实是新 root 的同名对象，不是冻结时那个）。`refreshRoot` 同时清空了 `opened`，所以实际表现是「切工作区后左右都空、右侧显示新 root 的同名对象读到的东西」 | ~~**已知边界，不修**~~ → **2026-09-13 已修**，见 §11（`SplitTarget` 加 `curWsId`，判据收紧为「工作区相同且 path 相同」） |
| B-4 | 异对象支首次挂载会**多读一次** host | 判据 2 的实现代价：右侧要显示冻结对象就得自己有数据 | 有意为之，并把这一次读取钉成断言（`hits(...) === frozenReads + 1`） |
| B-5 | 窄档（面板 ≤648px）没有开 / 关分栏的入口 | R5.1 的既有边界（`@container (max-width:620px)` 把按钮整块藏掉），本单**未改**它 | 照旧登记（`PROGRESS.md` §5 #14）。本单**没有**新增第二条关闭入口，故该边界的性质不变 |

---

## 8. 文档订正与台账

| 文件 | 订正 |
|---|---|
| `docs/spec-ui-revamp.md` §1 R4 表 | 「开启 / 分栏状态 / 宽度」三行按**历史时态**订正（划掉 R4 原词 + 指向 R6），其余三行补注 R6 后不变 |
| `docs/spec-ui-revamp.md` §1 **R6** | 新增本单条目（照 R5 / R5.1 的写法：要解决的问题 → 用户原话 → 目标表 → 做法表 → 逐条判据 → 验收 → 边界） |
| `docs/spec-ui-revamp.md` §4 验收 3 | 手工验收清单里的「**切文件恢复全屏**」是 R4 语义，已订正为 R6 的「切对象与切视图都不影响右侧 / 右侧显示冻结对象 / 同对象时跟随刷新」 |
| `docs/spec-ui-revamp.md` §5 明确不做 | 新增「不为分栏引入任何新的持久化」 |
| `docs/spec-ui-revamp.md` §6 决策表 | 「分栏状态」行按历史时态订正并给出反转理由（用户原话） |
| `docs/spec-ui-revamp.md` §7 | 进度表新增「七」；「第三段实际实现」里的「语义裁决」补 R6 订正、「状态按文件 path 索引」整条按历史时态划掉 |
| `PROGRESS.md` | §1 加门禁行、§3 加本单小节、§5 #14 订正「拖拽改比例」那句并新增 #15（B-3） |

**历史报告未动**（按本仓协议保留当时的原词）：`docs/agent/reports/2026-09-12-*`、
`docs/agent/reports/2026-09-11*`、`docs/baseline/`、`docs/agent/lessons.md`。

---

## 9. 未做 / 未核实（诚实清单）

1. **`npm run build` 未跑**（授权否决），**未重启 dsh web** ⇒ 运行中的页面看不到本次改动。
2. **GUI 手工验收未做**：用户原话那条脚本（「点击 deepseekHARNESS → 目录概览 → 分栏 → 点 packages」）
   没有在真实浏览器里跑过 —— 需要 build + 刷新页面，两者都在授权外。jsdom 用的是 stub fetch。
3. **B-2（冻结对象被删 / 改名）未在真实 host 复现**：只按源码读了失败路径（`FsPane` 的 status 分支），
   没有实测截图或真实 `/read` 报错文本。
4. **B-3（切工作区同名 path）未实测**：属推理 + 源码阅读（`refreshRoot` 会 `setOpened(null)`），没有
   在 GUI 里造两个同名路径的工作区验证表现。
5. **重复挂载的开销未量化**：左右反复在「冻结对象 ↔ 其他对象」之间切换时，右侧会经历
   `SplitPane` 卸载/挂载与一次 `/read`。功能上正确（`aliveRef` 已守卫），但真实 host 下的延迟 / 是否
   有可见闪烁**未测**。
6. **右侧独立实例的翻译 / 生成入口**：`onTrDone` 传 `null` 是有意的（右侧没有生成入口，回调没有去处）。
   若将来允许右侧触发生成，这里需要重新设计 —— 本单不做。

---

## 10. 产物与复跑命令

```bash
# 几何（两条，与基线逐档对比）
node tools/ui-probe/probe.js --tag=split-freeze    --wsicon              # → /tmp/dsh-ui-probe/out-split-freeze.json
node tools/ui-probe/probe.js --tag=split-freeze-sp --wsicon --splitpane  # → /tmp/dsh-ui-probe/out-split-freeze-sp.json

# 基线（复核用；产物已存在）
node tools/ui-probe/probe.js --tag=final-lian3      --wsicon
node tools/ui-probe/probe.js --tag=final-lian3-split --wsicon --splitpane

# 门禁（范围守卫 + typecheck + lint + test + coverage）
node scripts/verify-stage.mjs --allow 'src/client/index.tsx,tests/client-view.spec.ts,docs/spec-ui-revamp.md,PROGRESS.md,docs/agent/reports/2026-09-13-split-freeze-target.md'
```

运行产物（`/tmp/dsh-ui-probe/*.json`、`coverage/`）**不进仓库**。

---

## 11. B-3 修正：同一性判据收紧为「工作区相同且 path 相同」（2026-09-13，追加）

**背景**：§7 B-3 登记的边界被用户裁决要修。R6 的 `splitSameObj` 只比 `opened.path` 字符串，而
`path` 是**项目根内相对路径** —— 切工作区后命名空间整个换掉，工作区 A 与 B 可以各有一个同名
`packages`。只比字符串时，用户「在 A 开分栏冻结 A 的 packages → 切到 B → 左侧点开 B 的 packages」
会被判成「同一对象」而走**复用支**：右侧跟着跳成左侧 viewer 的数据（B 的 packages），而不是留在
冻结那一刻 A 工作区里的那个对象。

**新旧判据对照**：

| | 判据 | 后果 |
|---|---|---|
| 修前（R6） | `!!opened && frozen.opened.path === opened.path` | 切工作区后同名 path 误判「同一对象」→ 复用支 → 右侧跟着左侧跳到新工作区的同名对象 |
| 修后（B-3） | `!!opened && frozen.curWsId === curWsId && frozen.opened.path === opened.path` | 工作区不同 ⇒ 异对象支（`SplitPane` 独立实例）⇒ 右侧留在冻结对象那份数据上 |

**为什么选 `curWsId` 而不是 `rootPath`**（任务书要求说明理由，也供主代理裁决）：

1. **语义对应「切工作区」这个动作本身**：工作区切换的唯一入口是 `selectWs`，它 `setCurWsId(id)`
   再 `refreshRoot(ws.path)`。「切换工作区」的直接标识就是 `curWsId`；`rootPath` 只是它的投影，
   还要多经过一轮 host `/root` 往返。
2. **不随其它状态漂移**：`curWsId` 只在 `selectWs` 里变化，刷新（`refreshRoot()` 无参，刷新按钮走它）、
   展开/折叠树、切换视图**都不动它**。`rootPath` 每次 `refreshRoot` 都会 `setRootPath(r.root)`
   重新赋值（值通常相同，但语义上是「当前根」而非「所选工作区」）；万一同一工作区被外部重整
   路径，`rootPath` 会漂移而 `curWsId` 仍是同一个工作区 —— 用 `rootPath` 会把「同一工作区」误判成
   「换了工作区」。
3. **与既有语义自洽**：无工作区菜单时（插件未注入 `workspaces` 槽或列表为空）`curWsId` 恒为 `''`，
   判据 `'' === ''` 恒真，行为退化为 R6 的「只看 path」—— 与旧行为逐位一致，现有断言零破坏；
   `rootPath` 此时虽是真实路径，但切不了工作区（没有菜单），用它没有任何额外收益。

**实现点**（全在 `src/client/index.tsx`，4 处）：

| 处 | 改动 |
|---|---|
| `SplitTarget` 接口 | 加 `curWsId: string` 字段（JSDoc 注明 B-3 语义） |
| `toggleSplit()` | `setSplitTarget({ opened, mode: viewer.mode, curWsId })` |
| `splitSameObj` | `!!opened && frozen.curWsId === curWsId && frozen.opened.path === opened.path` |
| 注释 | 判据段、`SplitPane` JSDoc 同步更新（「同一对象」要求工作区相同） |

**新增断言**（`tests/client-view.spec.ts`，`split view: the frozen target (R4 → R6)` 块）：
`treats a same-named path in another worktree as a different object (B-3)`。手段沿用既有
`` `switches worktrees from the menu` `` 的「`wsSnapshot` + 点菜单项」来切工作区：两个工作区
`wA('/wa')` / `wB('/wb')` 各有一棵同名目录 `packages`（`docRel` 不同 ⇒ `/read` 内容不同：
`'# A pk'` / `'# B pk'`）。流程 = 在 wA 点开 packages → 分栏冻结 → 切到 wB → 左侧点开 B 的
packages。断言左侧显示 `# B pk`、右侧仍显示 `# A pk`（**不**含 `# B pk`）。**验证过测试真的能
钉住缺陷**：临时把判据改回旧版（只看 path）后本用例红（`expected '# B pk' to contain '# A pk'`），
恢复新版后绿。

**为何不改 Two 个邻居**（任务书 ④.1 的登记，本单**没动**，只在报告里如实写清）：

- **冻结对象被删 / 改名（B-2）**：右侧独立实例 `/read` 失败 ⇒ `FsPane` 显示 `errReadFail` 文本，
  不做自动处置。本单未碰。
- **切工作区后冻结对象的数据在哪个 root 下读取**：异对象支的 `useOpenedViewer(frozen.opened)` 是照
  `frozen.opened.path`（目录则 `docRel`）去 `/read` 的，`root` 已切到新工作区后，读到的可能是新
  工作区**同名路径**的内容 —— 也就是说修复判据后，右侧虽然**不再被左侧 viewer 带跑**（不再走复用
  支），但若它自己发起的那次 `/read` 落点在新 root 下，显示文本仍可能是新工作区的同名对象（取决于
  host 侧 `/read` 对 root 的处理）。触发条件：切工作区前分栏已开启、且新工作区存在同名 path / docRel。
  这与 B-2 同族（都属于「冻结对象的失效处置」），**本单不修** —— 任务书明令不做，只登记。

**门禁**：typecheck / lint / test（client spec 155 → 156 例）/ coverage / 范围守卫全部复跑通过；
几何探针与基线逐档 0 差异（本单只改判据与字段，DOM 结构与样式表一字未动）。实测数据见前节与
PROGRESS.md §1。
