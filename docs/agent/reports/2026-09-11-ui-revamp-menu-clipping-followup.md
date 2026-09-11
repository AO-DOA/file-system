# 跟进段报告 — 把「菜单打开态」固化进探针 + 台账 / 经验卡补记

> 时间：2026-09-12 00:05（工作树，**未提交**）
> 授权改动面：`tools/ui-probe/probe.js`、`tools/ui-probe/README.md`、`docs/agent/lessons.md`、`PROGRESS.md`、`docs/agent/README.md`（**只加一行**：同日的报告按文件名排不出先后，以文件头「时间」行为准）、`docs/agent/reports/`（新增两份）
> **未改产品代码**：`src/**`、`tests/**` 一字未动；未 `build`、未重启 dsh web、未做任何 `git` 写操作（提交由主代理做）
> 上游一手材料：诊断报告 `/tmp/dsh-bug-layer.md`（本段已归档为 `reports/2026-09-11-ui-revamp-menu-clipping.md`）、门禁原文 `/tmp/verify-final.txt`、探针数据 `/tmp/menu-probe/out-*.json`、复制变体 `/tmp/menu-probe/menu-probe.js` + `/tmp/patch-menu-probe.py`

---

## 0. 一句话结论

`/tmp` 里的**菜单打开态复制变体**已**合并进仓库探针**成具名选项 `--menus=inline|portal`（＋`--menu=<kind>`），
判据**完全复用**既有的 `clipRect`（可见矩形 = 元素矩形 ∩ 所有 `overflow != visible` 祖先裁剪盒），
`--menus` 关闭时产物与旧版逐字段一致；**修复前基线复现成功**（`inline`：视图下拉 **3306/3306 档整块
不可见**、可见高集合恒 `{0}`；解读选择 `{0, 6}`），**修复后复现成功**（`portal`：三个面板 **0 档被裁**、
可见高恒等于面板高 64 / 176 / 232）。并证明**注入打开态不改变顶栏几何**（3857 档 × 全部非 `menu`
字段 **0 差异**）。另：归档原报告、补台账新节 + 待办 #12、补三条经验卡（D-5 / E-1 / E-2）。

---

## 1. 你给的前提里，哪几处需要订正

按 `docs/agent/README.md` §5 第 4 条，开工先核前提。**一处事实性订正（且它直接改变台账措辞）、
一处口径订正（我自己踩的）**，其余前提逐条核实无误。

### 1.1 【订正】「规格 §2 原本要求用宿主那套 `Tooltip`」——位置错，且该要求已被规格自身作废

实测 `docs/spec-ui-revamp.md`：

| 你写的 | 实际 |
|---|---|
| Tooltip 要求在 **§2** | 在 **§1 R2**（第 33 行）：「容器宽度不足时，三个按钮收成纯图标，且**全部保留 `Tooltip` + `aria-label`**」 |
| 「原本要求」 | 确实已被作废，但作废声明就在 **§2 第 87 行**：「纯图标交互**沿用本文件既有的 `<Button size icon title>` 写法并补 `aria-label`**（第三段 b 订正：原文写的『原生 `<button>` + `Tooltip` + `aria-label`』是我写错了）。依据：`Button` 已把 `title` 透传到原生属性，再包一层 `Tooltip` 会**出双气泡**」 |

**影响（重要）**：台账 §5 #12 若照原话写成「规格 §2 原本要求用 Tooltip」，会让下游以为「按规格该换
Tooltip」——而规格现行口径恰恰**禁止**再加一层 `Tooltip`（双气泡）。故 #12 按实测写：待裁决的是
「这条**原生 `title` 长条**怎么处理」（缩短文案 / 只留 `aria-label` / 另设计气泡 / 维持原状），
**不是**「按规格换 Tooltip」。

### 1.2 【订正·我自己的口径失误】复现「3306/3306」必须跑**全量 7 场景**，`--only6` 会得 2755

我第一次按 `--only6` 跑（＝ `all.slice(0, 6)`，即留下 S0–S5、去掉末尾的 S6-wsxlong），视图 / 解读
两个面板只拿到 **2755 档**（＝ 5 场景 × 551）——因为 **S0-empty 里没有视图 / 解读菜单**，而 S6 有。
`/tmp/dsh-bug-layer.md` 给的 3306 ＝ **6 个带面板的场景 × 551**（S1–S6，全量 7 场景跑）。改跑全量后
逐字复现 3306。任务书只给了数字没给口径，这一处是选口径时踩的，记在这里给下一次省一步。

### 1.3 逐条核实无误的前提

- `/tmp` 下确有复制变体且能力如你所描述：`/tmp/menu-probe/menu-probe.js`（21 113 B，由
  `/tmp/patch-menu-probe.py` 从仓库 `probe.js` 注入生成）、四份 `out-*-inline|portal.json` 均为**复制
  变体**产出（文件名带 `-<形态>` 后缀）。**本段没有再放一份变体进仓库**，而是把能力合并进 `probe.js`。
- `foldBtn` / `refreshBtn` **确实连 `aria-label` 都没有**（`src/client/index.tsx` 里
  `IconPanelLeftOutline16` 与 `IconRefreshOutline16` 两个 `Button` 只有 `title`）——已如实记进台账 #12。
- 「三处 `Menu` 加 `portal`、CSS 零改动、`d84da01`、19 spec / 586 例、coverage 100×4」：与
  `/tmp/verify-final.txt` 与归档报告的 §5 / §7 逐条一致。

---

## 2. 探针新增能力：`--menus` / `--menu`

### 2.1 用法（口径正文在 `tools/ui-probe/README.md` §1.5，本文件只复述要点）

```bash
# 修复前的形态（面板留在锚点旁 ⇒ 是 .fs-hbar / .fs-hbar-mid 的后代，落进那两条 overflow:hidden）
node tools/ui-probe/probe.js --tag=m-inline --wsicon --menus=inline
# 修复后的形态（面板挂到 #stage 之外，模拟 createPortal(list, document.body)）
node tools/ui-probe/probe.js --tag=m-portal --wsicon --menus=portal
# 只打开视图选择器（三个 portal 面板同时开会互相遮挡，测单开用它）
node tools/ui-probe/probe.js --tag=m-view --wsicon --menus=portal --menu=view
```

- 裸 `--menus`（无值）＝ `inline`；值只认 `inline` / `portal`，写别的**直接 throw**（不静默降级）。
- `--menu` 只认 `ws` / `view` / `gen`，同样 throw。
- **不带 `--menus` 时一个面板都不注入**，每档记录里也**不出现** `menu` 字段 ⇒ 旧产物与历史对照仍可逐字段比。

### 2.2 实现要点（判据零新增）

| 处 | 做法 | 为什么 |
|---|---|---|
| 可见高 / 被裁判定 | **直接调用既有的 `clipRect`**，不另写口径 | 任务书要求：复用已有判据 |
| 内联形态 | 面板插进真实锚点的 `.mr` root（`.mr-list` 是 `position:absolute`，由 CSS 自己贴在锚点下方 4px） | 与修复前的真实 DOM 同构 |
| portal 形态 | 面板挂到 `#stage` **之外**的 `#portal`（body 直下），并带 `.mr-portal`（用 `Menu.module.css` 的 `.portal` **真规则**：`position:fixed` + `z-index:1100`），只由 JS 补 `left/top` | 与 `createPortal(list, document.body)` 的祖先链等价；不手写 `style.position` 以免偏离真规则 |
| 承载形态 | 逐档读 `host = p.closest('.fs-hbar') ? 'hbar' : 'body'`，**按祖先链实测** | 结论来自 DOM，不来自选项名（选项名可能被写错） |
| 面板内容 | 取 locale 真实文案、行数与真实菜单一致（工作区 1 行 / 视图 3 行 / 解读 4 行） | 面板**绝对高度**仅供比较；「被裁 / 不被裁」不依赖它 |
| 产物名 | 带 `--menus` 时追加 `-inline` / `-portal` 后缀 | 两个形态互不覆盖 |

`--menus` 与 `/tmp` 变体的差异（README §6 有同表）：开关名 `--mode` → `--menus`；portal 承载由
「`.fs-wrap` 之后的 `.fs-portal`（仍在 `#stage` 内）」改为「`#stage` 之外的 `#portal`」；形态判据由
「看选项名」改为「读 `host` 字段」。

---

## 3. 实测数据（全部来自可复跑的产物 JSON，非转述）

四组全量（**7 场景 × 551 档 = 3857 档**，`--wsicon`，`--outdir=/tmp/menu-merge`）：

| 形态 | 面板 | 档数 | 承载形态 | 被整块裁 | 被裁（部分+整块） | 最小可见高 | 面板高 | 中心不可命中 |
|---|---|---|---|---|---|---|---|---|
| `--menus=inline`（修复前） | 视图选择器 | **3306** | `hbar` | **3306 [200–1200]** | 3306 [200–1200] | **0.0** | 176.0 | **3306** |
| | 解读选择 | 3306 | `hbar` | 102 | 3306 [200–1200] | **0.0** | 232.0 | 180 |
| | 工作区 | 3857 | `hbar` | 0 | 3857 [200–1200] | **2.0** | 64.0 | 0 |
| `--menus=portal`（修复后） | 视图选择器 | 3306 | `body` | **0** | **0 [-]** | 176.0（＝raw） | 176.0 | 1546（三个同开）；**0**（`--menu=view` 单开） |
| | 解读选择 | 3306 | `body` | **0** | **0 [-]** | 232.0（＝raw） | 232.0 | 0 |
| | 工作区 | 3857 | `body` | **0** | **0 [-]** | 64.0（＝raw） | 64.0 | 0 |

**可见高集合**（去重）：inline — 视图 `{0}`、解读 `{0, 6}`、工作区 `{2}`；portal — `{176}` / `{232}` / `{64}`。
`{0, 6}` 就是用户「鼠标放上去看不到下拉」的字面读数。

**与 `/tmp` 报告的对照**（同口径逐项一致，说明合并过程没有改变读数）：
inline 视图 3306 / 3306 / 0.0 / 176 / 3306 与报告 §3.3 表**逐格相同**；解读 102 / 180 / 可见高 `{0, 6}` 相同；
工作区 3857 / 0 / 2.0 / 64 相同；portal 三项 0 被裁相同；`--menu=view` 单开时中心不可命中 0 相同。

### 3.1 打开态**不改变**顶栏几何（逐档逐字段 diff）

同一台机器、同一次会话里跑四组，`--only6` 那批与全量那批都是：

| 对比 | 行数 | 非 `menu` 字段差异 | 涉及字段 |
|---|---|---|---|
| `out-full-nomenus.json` vs `out-full-inline-inline.json` | 3857 | **0** | 无 |
| `out-full-nomenus.json` vs `out-full-portal-portal.json` | 3857 | **0** | 无 |

四组的合计读数**完全相同**：`{"vis":0,"same":0,"gone":1010,"goneRight":754,"partRight":886,
"partRightW":"200–400","hbarH":"48"}` / 3857 —— 即跨列 **0**、同列 **0**、右列被整块裁下界 **357**
（最后被裁档 356）、顶栏高集合恒 `{48}`，与归档的报告 §6 镜像一致。

### 3.2 单档取证也带面板读数

`--dumpW=<宽>` 的 dump 记录在带 `--menus` 时也附 `menu`（面板的 raw / vis / gone / cropped / hit /
`host`），便于「哪一档被谁裁的」这类单档追责。

---

## 4. 另外三件事（归档 / 台账 / 经验卡）

### 4.1 归档原报告（`reports/2026-09-11-ui-revamp-menu-clipping.md`）

`/tmp/dsh-bug-layer.md` **原样归档**，只在文件头加一行：
`> 归档自 \`/tmp/dsh-bug-layer.md\`，归档于 2026-09-12 00:03:26（原样保留，未改写；本行由归档动作添加）。`
逐字校验：`md5(/tmp/dsh-bug-layer.md)` = `f4c062ed90fe4211e6e7d6347095557f`，归档文件去掉头两行后的
md5 **相同**（263 行 → 265 行）。

**本文件（followup）与原报告是两份**：原报告是那一段的一手证据（按任务要求原样归档、不夹带新内容），
本文件是这一段的报告（探针固化 + 台账 / 经验卡 + 复跑数据）。两者的对应关系是任务书 §2.2 与 §5 两条
不同要求，故分别落两个文件。

### 4.2 台账 `PROGRESS.md`

- **§3 末尾新增一节**「顶栏三个下拉被 `overflow` 裁剪（提交 `d84da01`；2026-09-12 00:03 用仓库探针
  复现）」：现象 / 根因 / 量级表 / 修法 / 回归证据（三项铁律逐档 0 差异、打开态 0 档被裁、门禁数字）/
  生效条件，外加一段**订正**（§1.1 那条，直接护住 #12 的措辞）。
- **§5 追加 #12**：顶栏原生 `title` 气泡（文案即 `a11yGen`），状态 **「待用户裁决」**（不是已完成）；
  同条记入可访问名缺口 `foldBtn` / `refreshBtn` **只有 `title`、无 `aria-label`**（实测出处写在条内），
  以及 `viewBtn`（只 `title`）/ `edit`、`save`（只 `aria-label`）/ `genAnchor`、`wsAnchor`、`splitBtn`
  （两者都有）的分布，与「`genAnchor` 悬停即开 Menu ⇒ 加气泡会双弹」的反向风险。
- 未重排、未改写任何既有内容（既有 ` M` 行只在原处追加）。

### 4.3 经验卡 `docs/agent/lessons.md`

| 新条目 | 一句话 |
|---|---|
| **D-5** | 探针只覆盖它**构造过**的静态场景 —— 交互态缺陷会让全绿指标与真实体验脱节（本次 3857 档全绿却漏掉「下拉不可见」）；纪律：交互态缺陷发现即固化成探针新场景 |
| **E-1**（新节「浮层与裁剪」） | `overflow:hidden` 的兜底裁剪会连浮层一起吃 —— 绝对定位浮层落在其子树里就被切；primitive 有 `portal` 就优先用它，裁剪声明一个都不用撤 |
| **E-2** | 反证：`contain: layout`（含 `container-type:inline-size`）**不**裁 `fixed` 后代，也不改其坐标基准 ⇒ 就地被裁的唯一原因是面板自己是 `absolute` |

---

## 5. 门禁（原始输出）

```bash
node scripts/verify-stage.mjs --allow tools/ui-probe/,docs/agent/,PROGRESS.md
```

```
=== 1. 改动范围守卫 ===
git status --porcelain（7 项）：
   M PROGRESS.md
   M docs/agent/README.md
   M docs/agent/lessons.md
   M tools/ui-probe/README.md
   M tools/ui-probe/probe.js
  ?? docs/agent/reports/2026-09-11-ui-revamp-menu-clipping.md
  ?? docs/agent/reports/2026-09-11-ui-revamp-menu-clipping-followup.md
git diff --stat（已跟踪文件的改动行数；新增/未跟踪文件不在此列）：
   PROGRESS.md              |  51 ++++++++++++++++++++
   docs/agent/README.md     |   3 +++
   docs/agent/lessons.md    |  39 +++++++++++++++
   tools/ui-probe/README.md |  71 +++++++++++++++++++++++++--
   tools/ui-probe/probe.js  | 122 +++++++++++++++++++++++++++++++++++++++++------
   5 files changed, 268 insertions(+), 17 deletions(-)
守卫结论：PASS — 没有超出授权面的改动。
[1/4] typecheck（npm run typecheck）         → PASS（exit 0，0.4s）
[2/4] lint（npm run lint）                   → PASS（exit 0，4.7s）
[3/4] test（npm test）                       → PASS（exit 0，13.1s）
[4/4] coverage（npx vitest run --coverage）  → PASS（exit 0，17.7s，含分母守卫）
总判定：全绿。
```

- `test` 的原始行（同条件单独复跑）：`Test Files  19 passed (19)` / `Tests  586 passed (586)` ——
  **与修复段逐数相同**，符合「本段不该动产品代码」的预期。
- `tools/**` 会被 `npm run lint` 扫到（`tools/ui-probe/README.md` §2.3）：`probe.js` 加/改约 120 行后
  lint **仍是 0 错 0 警告**（exit 0）。
- 上表是**最终**一次（把两份新报告与 `docs/agent/README.md` 那行订正都纳入后）；更早两次守卫分别列
  5 项 / 6 项，结论同为 PASS。
- **`build` 未跑**（不在授权面）：`lib/`、`client/` 仍是旧产物，运行中的页面看不到修复（见 §6 第 5 条）。

---

## 6. 未核实项（诚实清单）

1. **无真实 GUI 端到端**。`http://127.0.0.1:3080` 需认证，本段全部结论来自 headless Chrome 几何探针。
2. **面板是复刻 DOM，不是真实 `Menu` 的运行时 DOM**：行高来自 `Menu.module.css` 的真实规则（实测
   每行 56px、面板高 64 / 176 / 232，与原变体逐项一致），但 hash 类名与真实渲染细节仍可能有出入 ⇒
   面板**绝对高度**仅供比较，「被裁 / 不被裁」的结论不依赖它（承接原报告 §8 第 5 条）。
3. **portal 定位未复刻真实 Menu 的视口 clamp**（`MARGIN = 12` 与 `x = min(max(x, 12), vw - lw - 12)`）：
   本段只做「锚点 rect 下方 4px」。默认窗口 1600×1000、面板右界最坏约 1358 < 1600，两者结论一致；
   **换窗口尺寸或把面板宽度上限往上调时需注意**。
4. **未把「菜单不被裁」变成硬门禁**：`scripts/verify-stage.mjs` 与四项几何门禁都未纳管（不在本段授权面，
   且授权面里没有 `scripts/**`）。若主代理要它成为常设门禁，需另开一条（建议：把 `--menus=inline` 的
   `view.gone` 必须为 0 作为判据——但那要求源码始终传 `portal`，即「防回退」而非「量现状」）。
5. **运行态仍是旧产物**：本段未 `build`、未重启（授权否决）⇒ 页面上是否已能看到修复**未核实**；
   台账 §3 新节的「生效条件」也是照此写的。
6. **跨运行非确定性（README §4 / 经验卡 D-4）依旧**：本段引用的是结构性指标（0 档 / 全档数 / 可见高
   集合 / 逐字段 0 差异），没有拿 1–2 档差异当结论。**唯一例外已单列**：`--menus=portal` 三个面板同开时
   视图面板中心 `hit=false` 1546 档 —— 那是**合成场景**产物（`--menu=view` 单开为 0），不是读数噪声。

---

## 7. 产物路径

| 内容 | 路径 |
|---|---|
| 本报告 | `docs/agent/reports/2026-09-11-ui-revamp-menu-clipping-followup.md` |
| 原诊断报告（原样归档） | `docs/agent/reports/2026-09-11-ui-revamp-menu-clipping.md` |
| 探针新能力（实现 / 口径正文） | `tools/ui-probe/probe.js`、`tools/ui-probe/README.md` §1.5 |
| 经验卡 | `docs/agent/lessons.md` D-5 / E-1 / E-2 |
| 台账 | `PROGRESS.md` §3 末节、§5 #12 |
| 本段四组实测（**运行产物，不进仓库**） | `/tmp/menu-merge/out-full-inline-inline.json`、`out-full-portal-portal.json`、`out-full-portal-view-portal.json`、`out-full-nomenus.json`（各 3857 档） |
| 本段 stdout 原文 | `/tmp/menu-merge/log-full-*.txt` |
| 逐字段 diff 脚本 | `/tmp/menu-merge/diff.cjs` |
| 门禁原始输出 | `/tmp/verify-followup.txt` |
| 上游一手材料（对照用，未改） | `/tmp/menu-probe/*`、`/tmp/dsh-bug-layer.md`、`/tmp/verify-final.txt`、`/tmp/containment.html` |
