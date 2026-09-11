# 探针复刻 DOM 同步 + 保存判据 `canSave` 收口 + 台账收尾

> 时间：2026-09-12 00:35（工作树）
> 授权改动面：`src/client/index.tsx`、`tests/client-view.spec.ts`、`tools/ui-probe/probe.js`、
> `tools/ui-probe/README.md`、`PROGRESS.md`，以及本报告（`docs/agent/reports/`）
> **未改**：`src/host/**`、`src/shared/locale.ts`、`tests/locale.spec.ts`（**一字节未动** —— 本段
> 不新增也不删除文案键）、`docs/agent/lessons.md`、`docs/agent/reports/**` 下的归档报告原文、
> `docs/agent/README.md`
> **未跑**：`npm run build`、未重启 `dsh web`、无任何 `git` 写操作（`git show` 是只读）
> 前置：入库 HEAD `8d5d591`，开工时工作树**干净**（实测 `git status --porcelain` 无输出 —— 与任务书 §1 一致）

---

## 0. 你给的前提里，哪几处需要订正

按 `docs/agent/README.md` §5 第 4 条先核前提。**两处订正，都不改变要做的事，只改变数字的写法。**

### 0.1 【订正】「被裁档 1010 → 790」—— 本轮复跑得 **760**

任务书 §2.3 要我记「编辑保存合并后被裁档 1010 → 790」。**本轮实测 `--wsicon` 基线口径（3857 档）为
1010 → **760**（右列被裁 754 → 504 与那段一致）。**差 30 档（占 0.8%）**，结构性指标全部一致
（右列下界 307、跨列 0、同列 0、顶栏高 `{48}`、S0 被裁 0）。790 来自上一段的外挂装置
`/tmp/e2/measure-new-dom.mjs`（**不进仓库**，其 DOM 变体细节无法逐字核对），本轮无法复现该数。
按「以实测为准、不调参」的要求，本报告与 `PROGRESS.md` 一律记 **760**，并把差异登记为**未定位**（§6）。
`tools/ui-probe/README.md` §4 同步写了这条差异。

### 0.2 【订正】「§1 门禁行：例数由 586 → 594」—— 台账 §1 那一行记的是 **582**

`PROGRESS.md` §1 当时最新的门禁行是「四段 UI 改造后重测 … **582 例**」（2026-09-11 23:29:46）；
**586 例**出现在 §3 的 menu-clipping 那一节（比 §1 那行更晚，但没有回写进 §1）。故本轮**新增**一行
门禁行（594 例），并在行内写明 582 / 586 / 594 分属三次不同的用例集快照，**不重排、不删已有行**。

---

## 1. 一句话结论

三件事全部落地：**①** 探针 `scenario()` 与 `src/client/index.tsx` 的真实渲染结构对齐（补 5 处
`.fs-tipwrap` 锚点层 + 右列「编辑⇄保存」合并成一个按钮），同步前后各跑一遍基线口径并做了**单变量**
对照；**②** 保存判据收口为 `canSave = editMode || dirty`，`dirty && !editMode` 一键直达保存（含断言）；
**③** 台账与探针 README 收尾（#12 销账、零消费者键记录、复刻同步日期入库）。
门禁：守卫 PASS + typecheck / lint（0 错 0 警告）/ test **19 spec · 594 例** / coverage **100×4 + 分母 19/19**
全绿。几何：跨列 0 / 同列 0 / S0 被裁 0 / 顶栏高 `{48}` / **右列被整块裁下界 307**（面板；门禁 ≤360），
`--menus=portal` 三个面板仍 **0 档被裁**。

---

## 2. 探针复刻 DOM 的同步（任务 §2.1）

### 2.1 改了什么（`tools/ui-probe/probe.js` 的 `scenario()`）

| # | 源码形态 | 旧复刻 | 现在 |
|---|---|---|---|
| 1 | 每个挂了 `Tooltip` 气泡的按钮外面包一层原生 `span.fs-tipwrap`（`tip()`；primitives 的 `Button` 在 React 18 下挂不上 ref，锚点只能是原生元素） | **缺这一层** | 新增 `tipwrap()`，复刻 **5 处**：工作区、左列两个图标按钮、分屏、编辑⇄保存。**视图选择器与解读选择不带**（悬停即开下拉，刻意豁免） |
| 2 | 编辑与保存是**一个**按钮（`canSave` 驱动同节点换态） | 复刻里是「编辑 + 保存」**两个** | 只渲染一个；场景数据里删掉 `save`、改用 `editLabel` 标出该场景显示的那一态（有 `dirty` 时是「保存」） |

两处都**只是复刻 DOM 的形态**：判据（`clipRect` / 面积求交 / 四项汇总）**一行未改**。
`editLabel` 的两种取值都是两个汉字 + 16px 图标 ⇒ 几何等价（这也是为什么它不参与任何读数）。

### 2.2 同步前 / 同步后逐场景汇总（基线口径 `--wsicon`，7 场景 × 551 档 = 3857 档）

| 场景 | 跨列（前→后） | 同列 | 被裁（前→后） | 右列被裁（前→后） | 顶栏高 |
|---|---|---|---|---|---|
| S0-empty | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 48 → 48 |
| S1-source | 0 → 0 | 0 → 0 | 201 [200–400] → **151 [200–350]** | 157 [200–356] → **107 [200–306]** | 48 → 48 |
| S2-trlong | 0 → 0 | 0 → 0 | 201 [200–400] → **151 [200–350]** | 157 [200–356] → **107 [200–306]** | 48 → 48 |
| S3-dir | 0 → 0 | 0 → 0 | 53 [200–252] → 53 [200–252] | 17 [200–216] → 17 [200–216] | 48 → 48 |
| S4-trbusy | 0 → 0 | 0 → 0 | 201 [200–400] → **151 [200–350]** | 157 [200–356] → **107 [200–306]** | 48 → 48 |
| S5-short | 0 → 0 | 0 → 0 | 153 [200–352] → **103 [200–302]** | 109 [200–308] → **59 [200–258]** | 48 → 48 |
| S6-wsxlong | 0 → 0 | 0 → 0 | 201 [200–400] → **151 [200–350]** | 157 [200–356] → **107 [200–306]** | 48 → 48 |
| **合计** | **0 → 0** | **0 → 0** | **1010 → 760 档**（`partRight` 886 → 667） | **754 → 504 档** | **{48} → {48}** |

- **右列被整块裁的下界：357 → 307**（最后被裁档 356 → 306）—— 与任务书预期的 **307 附近一致**，
  本行是**实测**（`out-sync-after.json`），不是为对上预期调参；若不同我会以实测为准（见 §0.1 的 30 档差异）。
- 逐档 diff（`diff.mjs`，3857 档）：**957 档有差异，全部是计数减少**；
  逐字段 = `goneN 957 / goneRightN 737 / goneMidN 250 / partRightN 219 / goneList 957`，
  **变差字段为空**（`visN` / `sameColN` / `unclickN` / `colN` 全档 0 差异）。
- S0 被裁 **0**（前后都 0），顶栏高集合恒 **{48}**（没有偷偷折行）。

### 2.3 单变量对照（两处改动各自隔离）

任务书 §2.3 要的方法论教训就是「对照实验必须单变量」，所以这次**先拆再合**：

| 对照 | 变体做法 | 结果（3857 档逐档逐字段） |
|---|---|---|
| 只加 `.fs-tipwrap` 层（右列仍是两个按钮）vs 旧复刻 | `/tmp/probe-sync/old-buttons.js` | **0 差异** ⇒ 锚点层几何中性 |
| 只合并按钮（锚点层替换成恒等函数）vs 同步后复刻 | `/tmp/probe-sync/tipwrap-off.js` | **0 差异** ⇒ 读数变化只来自「右列少一个按钮」 |

两份变体都由 `/tmp/probe-sync/gen-variants.mjs` 从当前 `probe.js` 文本生成（只改复刻 DOM 与 tipwrap
定义，判据不动），产物 `out-var-tiponly.json` / `out-var-mergeonly.json`。这复现了经验卡 B-6 的结论
（「加一层包装 span 要实测，别推断」），也给「同步前的探针读数为什么更高」一个可审查的解释：
**多算了一个已经不存在的按钮**。

### 2.4 可复跑

```bash
# 同步后（当前工作树）
node tools/ui-probe/probe.js --tag=sync-after --wsicon --outdir=/tmp/probe-sync
# 同步前（取修改前的 probe.js，只把 PLUGIN 钉成绝对路径；判据未改）
node /tmp/probe-sync/gen-before.mjs
node /tmp/probe-sync/probe-before.js --tag=sync-before-repro --wsicon --outdir=/tmp/probe-sync
# 逐档逐字段对照
node /tmp/probe-sync/diff.mjs /tmp/probe-sync/out-sync-before.json /tmp/probe-sync/out-sync-after.json
# 单变量两份变体
node /tmp/probe-sync/gen-variants.mjs
node /tmp/probe-sync/tipwrap-off.js --tag=var-mergeonly --wsicon --outdir=/tmp/probe-sync
node /tmp/probe-sync/old-buttons.js --tag=var-tiponly --wsicon --outdir=/tmp/probe-sync
# 菜单打开态（确认没弄坏 portal）
node tools/ui-probe/probe.js --tag=m-portal-sync --wsicon --menus=portal --outdir=/tmp/probe-sync
# 不带 --wsicon 的对照（§1.6 的表格读数：gone 1763 / goneRight 1507 / 右列最后被裁档 482）
node tools/ui-probe/probe.js --tag=sync-after-nows --outdir=/tmp/probe-sync
```

「同步前」的那份用 `git show 8d5d591:tools/ui-probe/probe.js` 生成并**已复跑确认**：与开工时那次的
产物逐档逐字段 **0 差异**（合计仍是 `gone 1010 / goneRight 754 / 最后被裁档 356`）。

### 2.5 菜单打开态（不得被这次改动弄坏）

`--menus=portal`：三个面板 **0 档被裁**、`cropped` 0、承载形态恒 `body`、可见高恒等于面板高
（ws 64 / view 176 / gen 232）、`minVisH` 等于 `rawH`；**注入打开态不改变顶栏四项读数** ——
带 `--menus` 与不带的两份产物四项完全相同（`760 / 504 / 0 / 0 / {48}`），这条自检继续成立。

---

## 3. 保存判据收口 `canSave = editMode || dirty`（任务 §2.2）

### 3.1 实现（`src/client/index.tsx`，一处）

```tsx
const canSave = viewer.editMode || viewer.dirty
```

图标 / 文案 / 动作 / `Tooltip` 文案四处一律改用 `canSave`（**一个按钮**的形态不变，仍是同节点换态、
同一个 `key='edit'` ⇒ 气泡锚点不重挂）。注释里写清的因果：

- **为什么不能只看 `editMode`**：视图选择器下拉的 `onSelect` 会 `setEditMode(false)`（R3 既有行为），
  而 `edit` 只在**切换文件**时重播种 ⇒ 「进过编辑态、留了改动、又退回查看态」时 `dirty` 仍在而
  `editMode` 已为 false；只看 `editMode` 时按钮显示「编辑」，保存要点**两下**。
- **刻意保留的边界注释**：合并后**没有「放弃编辑」入口**（旧 UI 的「查看」按钮就是这么用的），
  改成 `canSave` 之后**更彻底** —— 只要有未保存内容，按钮就直达保存；要放弃只能靠切文件 / 切视图的
  隐式丢弃（G-4）。这条代价如实写在注释与台账里（`PROGRESS.md` §3）。

### 3.2 断言（`tests/client-view.spec.ts`）

改写既有用例 `walks the dirty marker through appearance, tab switch and save` 的后半段
（原先是「切视图回来 → 点两次」的路径，现在替换成判据收口的正面断言）：

| 断言 | 内容 |
|---|---|
| 态 | 切到「文件摘要」再切回「源码」后：`dirty === true`、`editMode === false`（`.fs-area` 不存在） |
| 文案 | `namedToolbarButton(L('btnSave'))` 的 `aria-label` 与 `.fs-btnlabel` 文本都是「保存」 |
| 唯一性 | `.fs-hbar-right button[aria-label="编辑"]` 长度为 **0**（同一个节点已换成保存） |
| 行为 | 点它 ⇒ 发出 `POST /api/fs/write`（body 携带编辑后的文本）⇒ `.fs-dirty` 消失、`.fs-area` 消失、按钮换回铅笔「编辑」 |

其余既有用例**未改**但已逐条核过仍成立：初始查看态仍是「编辑」（`button(L('btnEdit'))` 可用）、
编辑态里 `button(L('btnSave'))` 就是同一个节点、保存失败时 `dirty` 保留（此时 `editMode` 仍为 true，
按钮仍是「保存」）、`beforeunload` 守卫用例、顶栏按钮计数 7 个的断言（数量没变）。

---

## 4. 台账与探针文档收尾（任务 §2.3）

| 落点 | 内容 |
|---|---|
| `PROGRESS.md` §1 | **新增**一行门禁行（2026-09-12 00:29:48 实测）：守卫 PASS / typecheck exit 0 / lint 0 错 0 警告（48 files、80 rules）/ **19 spec · 594 例** / coverage **100×4** + 分母 **19/19 ✓**；并说明 582 / 586 / 594 三个例数分属三次快照（不重排已有行） |
| `PROGRESS.md` §3（新增一节） | 「探针复刻 DOM 同步 + 保存判据收口 `canSave`」：三件事、**实测收益与代价表**（合并按钮 357→307、1010→760、无变差 / 判据收口一键保存 / 折叠态分屏根因 `splitParts` 只写在未折叠分支 / `beforeunload` 只拦页面级离开）、复刻同步的前后对照、**零消费者键裁决保留**、**方法论教训一句指针** |
| `PROGRESS.md` §5 #12 | **销账**：`~~原文~~` + `✅ 2026-09-12 已完成`，写明两条落地事实（7 个按钮改用 `Tooltip` + 补 `aria-label`，锚点必须是原生元素；**视图选择器与解读选择刻意豁免不挂气泡**，不是遗漏），并保留裁决前的原始记录 |
| `tools/ui-probe/README.md` §3 | 场景表改成合并后的单按钮；新增两条 bullet：`.fs-tipwrap` **必须复刻**（5 处，含豁免的两个）、右列只有一个编辑⇄保存按钮（`editLabel` 语义） |
| `tools/ui-probe/README.md` §4 | 原来的「当前已知的复刻滞后」段落**替换为「复刻 DOM 的同步日期」**（2026-09-12，落在 `8d5d591` 之后）：同步前后对照表、逐档 diff、单变量结论、与上一段 790 的 30 档差异（未定位）、以及「以后读数变了先看这一段判断是源码变了还是复刻滞后」 |
| `tools/ui-probe/README.md` §1.6 | `--wsicon` 对照表的数字**同步刷新**（旧值 1010 / 754 / 356 与 2013 / 1757 / 576 是同步前的旧复刻；现为 760 / 504 / 306 与 1763 / 1507 / 482），并注明「上表是同步后的读数、旧值见 §4」—— 否则这张表会与 §4 自相矛盾。不带 `--wsicon` 的这组数是**本段新跑的**（同 flags 之外只差 `--wsicon`） |

**零消费者键的处理**（任务 §2.3 要求新增一条记录）：`ZH.btnView` 与 `ZH.a11yViewPick` 在 `src/` 里
已无消费者（本段实测 `grep -rn "btnView\|a11yViewPick" src/ tests/ docs/baseline/client.md`：`btnView`
命中 `locale.ts:40` 定义、`tests/locale.spec.ts:49` 对照表、`tests/client-view.spec.ts` 的一条**反向**
断言（「右列没有 aria-label＝查看 的按钮」）、`docs/baseline/client.md` 两处基线记录；`a11yViewPick`
命中 `locale.ts:36` 与 `locale.spec.ts:45`），
**经裁决保留、本段一个键也没动**（`src/shared/locale.ts` 与 `tests/locale.spec.ts` 一字节未改）：
字典是**产品文案注册表**（117 键里有只经直连 API / 失败路径出现的串）；删键必须手改
`locale.spec.ts` 的**三重硬断言**，而那道断言正是「字典变动要被刻意复审」的护栏；
`docs/baseline/client.md` 仍把 `btnView` 列为基线按钮之一。明细见经验卡 B-7。

---

## 5. 门禁与几何门禁（原始输出摘要）

### 5.1 `verify-stage`（跑了三次：严格列表一次、并入报告一次、收尾一次）

**第一次 —— 严格按任务书 §4.1 的 allow 列表**（此时本报告与 `PROGRESS.md` 的改动尚未写入）→ `/tmp/verify-sync-a.txt`

```
白名单：src/client/index.tsx , tests/client-view.spec.ts , tools/ui-probe/ , PROGRESS.md

=== 1. 改动范围守卫 ===
git status --porcelain（4 项）：
   M src/client/index.tsx
   M tests/client-view.spec.ts
   M tools/ui-probe/README.md
   M tools/ui-probe/probe.js
git diff --stat：src/client/index.tsx 31 / tests/client-view.spec.ts 22 /
  tools/ui-probe/README.md 46 / tools/ui-probe/probe.js 36（4 files changed）
守卫结论：PASS — 没有超出授权面的改动。
[1/4] typecheck → PASS（exit 0，5.0s）
[2/4] lint      → PASS（exit 0，4.1s）   Found 0 warnings and 0 errors. (48 files、80 rules)
[3/4] test      → PASS（exit 0，13.5s）  Test Files 19 passed / Tests 594 passed (594)
[4/4] coverage  → PASS（exit 0，17.9s）  All files 100 / 100 / 100 / 100
                                         ✓ 分母完整：19 个源文件全部进入覆盖率统计
总判定：全绿。
```

**第二次 —— 把本报告并入 allow 列表**（`docs/agent/reports/2026-09-12-probe-dom-sync-and-cansave.md`）：
见下方 §5.3。**为什么要并入**：任务书 §3 列出的可改文件**不含**报告，而 §5 明确要求新增报告 ——
两者冲突时按「报告必须入库」执行；报告落盘后若仍按 §4.1 的严格列表跑，守卫会把这一项判成越界
（同类先例：上一段报告 `2026-09-12-collapse-split-edit-merge.md` §0.1 / §7.1 同样跑了两次并留痕）。

### 5.2 几何（基线口径 `--wsicon`，3857 档）

| 读数 | 门禁要求 | 同步后实测 |
|---|---|---|
| 跨列可见重叠 | 0 档 | **0** |
| 同列可见重叠 | 0 档 | **0** |
| S0 被裁 | 0 | **0** |
| 顶栏高度集合 | `{48}` | **{48}** |
| 右列被整块裁下界 | ≤ 360 | **307**（最后被裁档 306；未变差，反而更好） |
| 被裁合计 / 右列被裁 | 回归信号 | **760 / 504**（同步前 1010 / 754，变差 0 档） |
| `--menus=portal` 三个面板 | 0 档被裁 | **0 / 0 / 0**，可见高恒等于面板高 |

### 5.3 第二次 `verify-stage` 的结论（把本报告并入 allow）

→ `/tmp/verify-sync-b.txt`

```
白名单：src/client/index.tsx , tests/client-view.spec.ts , tools/ui-probe/ , PROGRESS.md ,
        docs/agent/reports/2026-09-12-probe-dom-sync-and-cansave.md
git status --porcelain（6 项）：M src/client/index.tsx / M tests/client-view.spec.ts /
  M tools/ui-probe/README.md / M tools/ui-probe/probe.js / M PROGRESS.md /
  ?? docs/agent/reports/2026-09-12-probe-dom-sync-and-cansave.md
守卫结论：PASS — 6 项全在授权面内。
[1/4] typecheck → PASS（exit 0，0.4s，增量缓存命中）
[2/4] lint      → PASS（exit 0，4.7s）  Found 0 warnings and 0 errors.
[3/4] test      → PASS（exit 0，13.9s） Test Files 19 passed / Tests 594 passed (594)
[4/4] coverage  → PASS（exit 0，16.5s） All files 100 / 100 / 100 / 100 + 分母 19/19 ✓
总判定：全绿。
```

两次逐项一致（唯一差别是 typecheck 因增量缓存只花 0.4s），**594 例**这个数字两次相同。

收尾时又改了**两处 markdown**（`README.md` §1.6 的 `--wsicon` 数字表同步刷新、本报告正文），
两者都不进任何门禁，但仍用同一 allow 列表再跑一次确认 → `/tmp/verify-sync-c.txt`：
守卫 PASS、四门禁全绿（typecheck 0.3s / lint 0 错 0 警告 / test **594 例** / coverage **100×4** +
分母 **19/19**）。**三次结论逐项一致。**

---

## 6. 未核实项（诚实清单）

1. **无真实 GUI 端到端**。`http://127.0.0.1:3080/` 需认证（前两段实测 401），本段所有结论来自
   jsdom 断言 + headless Chrome 几何探针；**没有人在这套 UI 上点过**。`canSave` 之后「脏查看态」的
   按钮在屏幕上是否顺眼、气泡长什么样，都**未核实**。
2. **与上一段报告的 30 档差异未定位**（§0.1）：本轮 `gone 760` vs 那段 `790`，结构性指标全一致。
   该装置 `/tmp/e2/measure-new-dom.mjs` 未入库、其 DOM 变体细节无法逐字核对 ⇒ **不排除**差异来自
   装置的某个复刻细节（例如锚点层的挂法或某场景的按钮取值），也可能是跨运行非确定性；
   **未继续深挖**，因为结论所用的结构性指标不受它影响。
3. **`--wsicon` 的绝对档位（356 / 306 / 307…）随字体渲染浮动**（README §4 / 经验卡 B-2）：本段引用的是
   同机同会话内的前后脚对照；换机器 / 换字体族需复测切换点。
4. **跨运行非确定性依旧**（经验卡 D-4）：本段引用的都是结构性指标（0 档 / 下界 / 高度集合 / 逐档
   0 差异与「变差 0 档」）；「同步前」那份已独立复跑一次确认逐档 0 差异，但**没有**对每一份变体都
   复跑两次。
5. **气泡本身不被探针覆盖**：探针没有「气泡打开」这个场景（`Tooltip` 的气泡只在悬停/聚焦时挂载）。
   本段补的只是 `.fs-tipwrap` **锚点层**的几何（实测中性），**不是**气泡的可见性/位置。
6. **`btnView` / `a11yViewPick` 的保留是判断，不是实测结论**（§4）：若日后要删，改动点已列在经验卡 B-7。
7. **未跑 `npm run build`、未重启 `dsh web`**（授权否决）⇒ 运行中的页面仍是旧产物，**看不到**
   `canSave` 与探针之外的任何变化。生效条件：`rm -rf lib client && npm run build` + 重启（由用户主导）。

---

## 7. 待裁决 / 需要越权的

| # | 事项 | 说明 |
|---|---|---|
| 1 | 无 | 本段三件事都在授权面内完成，**没有**需要越权的改动。唯一与任务书字面冲突的是「报告文件的放行」（§5.1），已按「报告必须入库」处理并留痕 |
| 2 | 30 档差异是否值得深挖（§0.1 / §6-2） | 若要坐实，需要把上一段的装置按同样口径重写一份（它的源码不在仓库里）；我的判断是**不值得** —— 结构性指标一致，且该数字不进门禁 |

---

## 8. 产物路径

| 内容 | 路径 | 入库？ |
|---|---|---|
| 本报告 | `docs/agent/reports/2026-09-12-probe-dom-sync-and-cansave.md` | ✅ |
| 源码改动 | `src/client/index.tsx`（`canSave` 收口 + 注释） | ✅ |
| 测试改动 | `tests/client-view.spec.ts`（判据收口的 4 条断言） | ✅ |
| 探针改动 | `tools/ui-probe/probe.js`（`scenario()` 同步：tipwrap 层 + 单按钮 + `editLabel`） | ✅ |
| 口径记录 | `tools/ui-probe/README.md` §3 / §4 | ✅ |
| 台账 | `PROGRESS.md` §1 / §3（新增一节）/ §5 #12 | ✅ |
| 门禁原始输出 | `/tmp/verify-sync-a.txt`（严格按 §4.1 的 allow 列表）、`/tmp/verify-sync-b.txt`（并入报告路径） | ❌（运行产物） |
| 几何产物 | `/tmp/probe-sync/out-sync-{before,after,before-repro,after-nows}.json`、`out-var-{tiponly,mergeonly}.json`、`out-m-portal-sync-portal.json` | ❌ |
| 复跑装置 | `/tmp/probe-sync/{gen-before.mjs,gen-variants.mjs,diff.mjs}`、生成的 `probe-before.js` / `tipwrap-off.js` / `old-buttons.js` | ❌ |
