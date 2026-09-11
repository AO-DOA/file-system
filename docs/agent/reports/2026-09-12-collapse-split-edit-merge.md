# 折叠态分栏修复 + 编辑/保存合并 + 离开提示 + 顶栏气泡统一（A–E）

> 时间：2026-09-12 00:40（工作树，**未提交**）
> 授权改动面：`src/client/index.tsx`、`tests/client-view.spec.ts`、`tests/fixtures/primitives-stub.ts`、`tools/ui-probe/README.md`、`docs/agent/lessons.md`、`docs/agent/reports/`（新增本文件）
> **未改**：`src/shared/locale.ts` 与 `tests/locale.spec.ts`（**一字节未动** —— 键的取舍见 §B.3）、`src/host/**`、`tools/ui-probe/probe.js`、`docs/agent/reports/` 下的归档报告、`PROGRESS.md`
> **未跑**：`npm run build`、未重启 `dsh web`、无任何 `git` 写操作（按授权面）
> 前置：入库 HEAD `d84da01`；本段开工时工作树**已有 7 项未提交改动**（上一段 menu-clipping 的文档与 `probe.js`），见 §0.1

---

## 0. 你给的前提里，哪几处需要订正

按 `docs/agent/README.md` §5 第 4 条，开工先核前提。**三处订正，其中一处直接改变 D 的实现方式。**

### 0.1 【订正】「当前 HEAD `d84da01`，工作树干净」—— 前半句对，后半句不对

实测 `git status --porcelain`（开工时，共 7 项）：`M PROGRESS.md`、`M docs/agent/README.md`、
`M docs/agent/lessons.md`、`M tools/ui-probe/README.md`、`M tools/ui-probe/probe.js`，
外加两份未跟踪报告 `reports/2026-09-11-ui-revamp-menu-clipping{,-followup}.md`。
即**上一段的产出只提交了 `src/`（`d84da01`），文档与探针能力仍在工作树**。

影响：① `src/client/index.tsx` 与 `tests/` 确实是 `d84da01` 的形态（前提成立，A/B/C/D 是在此之上改的）；
② 但「改动范围守卫」在按 §4 给的 allow 列表跑时会把这 5 项判成越界（它们不是本段的改动），
故本段跑了两次守卫（§5.1）；③ 本段对 `docs/agent/lessons.md` / `tools/ui-probe/README.md` 的编辑
是在**别人未提交的改动之上追加**的，没有覆盖或回退其中任何一行。

### 0.2 【订正·关键】`<Tooltip><Button/></Tooltip>` **不能用** —— primitives 的 `Button` 挂不上 ref

任务书 D 要求「把顶栏按钮的气泡统一改为 primitives 的 `Tooltip`」。**字面照做会得到一个永不显示的气泡**：

| 事实 | 出处 |
|---|---|
| `Tooltip` 用 `cloneElement(children, {ref: mergedRef})` 取锚点，`show()` 在 `anchor.current === null` 时直接 return | `lib/index.js:4716` 起（`Tooltip.d.ts` 的 `AnchorProps` 也写明它注入 `ref`） |
| primitives 的 `Button` 是**普通函数组件**，没有 `forwardRef` | 本包 `lib/index.js:1565`；同版本 `deepseekHARNESS/packages/client/ui-primitives/src/Button.tsx` 同样只有 `export function Button(...)` |
| 本插件跑 **React 18.3.1**（peer 范围 `>=18.2.0 <20.0.0`）：给函数组件挂 `ref` ⇒ 警告 `Function components cannot be given refs` 且 ref 恒为 null | `package.json:65`；**实测** `/tmp/d-tooltip-ref.mjs`（最小复刻真实 `Tooltip` 的 ref 机制 + 正对照） |
| 宿主自己的 `Tooltip` 调用点**全部**包原生元素，从不包 `Button` | `ui-cordis/CordisPanel.tsx:88`（原生 `<button>`）、`ui-trajectory/TrajectoryTable.tsx:2577`、`TrajectoryTimeline.tsx:214/697`（原生 `<span>`） |

实测输出（同装置，只换锚点）：

```
[Tooltip + primitives 风格 Button] 气泡渲染=false / ref 警告=true
[正对照：Tooltip + 原生 span]     气泡渲染=true  / ref 警告=false
```

**因此 D 按「加一层原生锚点」实现**：每个挂气泡的按钮外面包 `<span className="fs-tipwrap">`
（只做收缩包裹，与 `Menu` 自己的 `.mr` root 同一个做法），`Tooltip` 挂在这一层上。
代价与几何影响**实测**过（§D、§4.2），不是推断。若不要这一层，唯一替代是**只删 `title`、不留气泡**
（见 §D 的待裁决项）。

### 0.3 【订正】`--menus` 并没有改变汇总表的计数口径；2013 / 1757 来自**漏掉 `--wsicon`**

任务书 E-1 说「`--menus=inline --menu=view` 的逐场景表里『被裁 / 右列被裁』列包含注入的菜单面板自身，
合计 `gone` 1010 → 2013、`goneRight` 754 → 1757」。**实测不成立**，两件事被并在了一起：

**(1) `--menus` 对四项读数零影响**（本机前后脚三跑，7 场景 × 551 档 = 3857 档，全部 `--wsicon`）：

| 运行 | 合计读数 |
|---|---|
| 不带 `--menus` | `{"vis":0,"same":0,"gone":1010,"goneRight":754,"partRight":886,"hbarH":"48"}` |
| `--menus=inline --menu=view` | **逐档逐字段相同**（0 档有差异，全部非 `menu` 字段逐字段计数 `{}`） |
| `--menus=inline`（三个面板全开） | **逐档逐字段相同** |

产物：`/tmp/e-probe/out-e-base.json`、`out-e-inline-view-inline.json`、`out-e-inline-all-inline.json`。

**(2) 2013 / 1757 的真正来源是 `--wsicon` 缺失**：

| 运行 | 合计读数 |
|---|---|
| `--menus=inline --menu=view` **不带** `--wsicon` | `gone 2013` / `goneRight 1757` / 右列最后被裁档 576 |
| 同一次**不带** `--menus`、也不带 `--wsicon` | `gone 2013` / `goneRight 1757`（与上一行逐档相同） |
| 上游那份记着 2013 的产物 `/tmp/menu-probe/out-fix-cur.json` | 3857 档**全部没有 `menu` 字段**（＝根本没跑 `--menus`），且 `wsLabShown` 恒为 `null`（＝没有 `.fs-wslabel`） |

机理：`@container (max-width:760px){.fs-btnlabel:not(.fs-wslabel){display:none}}` 靠 `.fs-wslabel`
把工作区名排除在「收文字」之外；没有 `--wsicon` 时那一层不存在 ⇒ 工作区名永不收，左列常宽 ⇒
窄档被裁翻倍。**这是一次 flags 未对齐的转述**（上一段留下来的 `/tmp` 产物被当成了同口径的另一份读数）。

结论：**归档报告 `reports/2026-09-11-ui-revamp-menu-clipping-followup.md` §3.1 的断言成立**
（「3857 档 × 全部非 `menu` 字段 0 差异」——本段独立复现，逐档逐字段 0 差异），
它**不是**口径没说清、也不是断言不成立；**归档报告一字未改**。E 的两项处理见 §E。

---

## 1. 一句话结论

五件事全部落地：**A** 折叠态漏渲染分屏两件套已修（含 3 条 jsdom 断言）；**B** 编辑/保存合成一个按钮
（右列少一个按钮，实测让右列裁切下界由 357 改善到 **307**）；**C** `dirty` 期间挂 `beforeunload`
页面级离开守卫（含边界注释与断言）；**D** 顶栏 7 个按钮的气泡统一改成 primitives `Tooltip`
（**但不能直接包 `Button`**，见 §0.2 —— 加了一层实测几何中性的锚点 span），原生 `title` 全部撤除、
补齐 `aria-label`；**E** 用实测订正了「`--menus` 改变计数口径」这条误传，把真正的坑（`--wsicon`
不对齐 ⇒ 1010 变 2013）与「统计集合」写进探针 README 与经验卡。
门禁：typecheck / lint（0 错 0 警告）/ test **19 spec · 594 例** / coverage **100×4 + 分母 19/19** 全绿。

---

## 2. A — 折叠文件树时「分栏」失效

### 2.1 缺陷与修法

`fs-body` 的组装只在「未折叠」分支里放了 `{splitBar}{splitPane}`，折叠分支只剩 `{editor}` ——
于是折叠树之后点「分栏」，`splitOn` 翻成 true 而右侧窗格根本不进 DOM。

修法（`src/client/index.tsx`，一处）：把两件套提成 `const splitParts = <>{splitBar}{splitPane}</>`，
两个分支都渲染它：

| 分支 | 修前 | 修后 |
|---|---|---|
| 未折叠 | `{side}{split}{editor}{splitBar}{splitPane}` | `{side}{split}{editor}{splitParts}` |
| 折叠 | `{editor}` | `{editor}{splitParts}` |

**没有复制粘贴两份**。三者的兄弟顺序在两处一致（editor → splitBar → splitPane），这一点是必须的：
拖拽回调靠 `previousElementSibling` / `nextElementSibling` 取左右窗格测宽。

### 2.2 判据（jsdom，`tests/client-view.spec.ts`）

| 新增用例 | 断言 |
|---|---|
| `keeps the split pane rendered while the tree is collapsed` | `collapsed === true && splitOn === true` 时：`.fs-splitpane` 数量 1、`.fs-body` 恰好 3 个子元素且 `children[1]` 是 `.fs-split`、`children[2]` 是 `.fs-splitpane`、右侧窗格内有 `.fs-main`；折叠态再点分屏 ⇒ 只剩 1 个子元素 |
| `renders no split pane when the tree is collapsed and no split was opened` | 反向对照：折叠 + **未**分屏 ⇒ `.fs-split` 与 `.fs-splitpane` 都是 0 个、`.fs-body` 只有 1 个子元素 |
| 既有 `collapses and restores the side panel` | 改用可访问名定位折叠按钮（见 §D.4），语义不变 |

组合覆盖：折叠+分屏（新）、折叠+未分屏（新）、展开+分屏（既有 R4 用例 5 条）、展开+未分屏（既有）。

几何探针**覆盖不到折叠态**（`scenario()` 里 `.fs-body` 永远是「树 + 分隔条 + 左窗格」，没有折叠变体），
所以这一段的证据分工是：**结构/DOM 组合由 jsdom 断言**，几何由探针的展开态读数 + §D 的中性证明承担。

---

## 3. B — 编辑/保存合并成一个按钮

### 3.1 实现（按用户裁决 B：`editMode` 驱动）

| 态 | 图标 | 文案 | 点击 |
|---|---|---|---|
| `editMode === false` | `IconEditOutline16` | `btnEdit`「编辑」 | `toggleEdit()` 进编辑态 |
| `editMode === true` | `IconCheckOutline16` | `btnSave`「保存」 | `save()`（内部已带 `setEditMode(false)`，闭环） |

同一位置、同一 `key`（`'edit'`）⇒ **同一个 DOM 节点**换态，不会因换态重挂（对 D 的气泡锚点很重要，
已用断言 `expect(button(L('btnSave'))).toBe(action)` 钉住）。`.fs-btnlabel` 收纳与 `aria-label` 都保留；
「● 未保存」标记不变。**不再渲染「查看」按钮**。

### 3.2 合并的两种真实代价（如实登记）

1. **「切视图之后要保存」由 2 次点击变 1 次… 不，是反而变 2 次**：视图选择器的下拉 `onSelect`
   会 `setEditMode(false)`（R3 既有行为），而 `dirty` 内容仍在（`edit` 只在**切换文件**时重播种）。
   于是「已脏 + 查看态」下按钮显示「编辑」，要保存得**先点一次回编辑态、再点一次保存**（旧 UI 是
   一个常驻「保存」按钮，一下就好）。**数据不会丢**（已断言缓冲区完好），只是多一次点击。
   *若认为这条不可接受*，最小改法是把判据从 `editMode` 换成 `canSave = editMode || dirty`
   （文案/图标/动作都用它）—— 一行，但那是改动用户已裁决的方案，需你点头。
2. **没有「放弃编辑」入口了**：旧 UI 的「查看」= 不保存退回查看态；合并后不存在这条路。
   要放弃只能靠 G-4 的隐式丢弃（切文件/切视图）或手工改回原文。这是用户裁决的直接后果，非缺陷。

### 3.3 `btnView` 键：**保留**（不去动 `locale.ts`）

grep 实测（`grep -rn btnView src tests docs tools scripts`）：改后它在 `src/` 里**再无引用** ——
只剩 `src/shared/locale.ts:40`（定义）、`tests/locale.spec.ts:49`（EXPECTED 表）、
`docs/baseline/client.md` 与两份归档报告（文档）。**判断：保留**，理由：

1. **字典的角色是产品文案注册表，不是「UI 可达集」**：现有 117 键里本就有只经直连 API / 失败路径
   才出现的串（B 类协议串、C 类诊断串），「今天没有 UI 路径渲染它」不是成员判据。
2. **删键要动的是那道**故意的**硬护栏**：`tests/locale.spec.ts` 的三重断言（键序逐位 + `toHaveLength(117)`
   + 全等对照表）存在的意义，就是让字典变动成为一次刻意的、被复审的动作。为省一个条目去手改 117 行
   对照表，收益（少一条死键）与风险（手抄出错）不成比例。
3. **`:40` 那条键描述的是本段刚裁决掉的交互**：若将来补回「放弃编辑」入口，键还在原处。
4. `docs/baseline/client.md:177` 仍把 `btnView` 列为迁移基线 8 个按钮之一 —— 该文档是**源插件的
   历史记录**（本段不许改），保留键也让它继续与基线口径一致。

**若你偏好零死键**：改法是删 `src/shared/locale.ts:40` 与 `tests/locale.spec.ts:49`，
并把 `:163` 的 `toHaveLength(117)` 改成 `116`（键序断言由同一张表派生，自动跟随）。
同类的第二处是 D 造成的 `a11yViewPick`（见 §D.5），建议一起裁决。

---

## 4. C — 未保存内容的离开提示

### 4.1 实现（`src/client/index.tsx`，紧接 `useOpenedViewer` 之后）

`dirty` 为真时注册 `beforeunload`：`e.preventDefault()` + `e.returnValue = ''`（后者只为老浏览器，
现代浏览器忽略自定义文案）；依赖 `[viewer.dirty]`，变回 false 即卸载（不常驻监听）。

**注释里如实写明的覆盖边界**：它只拦**页面级离开**（刷新 / 关标签页 / 关窗）；**拦不住页内切文件、
切工作区、切视图** —— 那些走 React 状态切换，不触发 `beforeunload`（G-4 的「切换文件静默丢弃未保存编辑」
因此照旧）。要盖住页内切换得加应用内确认，本段不做。

### 4.2 判据（jsdom）

| 新增用例 | 断言 |
|---|---|
| `registers the guard only while the edit buffer is dirty` | 干净态：`addEventListener('beforeunload')` 0 次、派发可取消 `beforeunload` 后 `defaultPrevented === false`；进编辑态未打字：仍 0 次；打字后：注册 **1** 次、`defaultPrevented === true`；保存后：`removeEventListener` **1** 次、`defaultPrevented === false` |
| `does not guard an untouched buffer after switching to another file` | 页内切文件**不触发** `beforeunload`（守卫拦不住它）——把上一条边界钉成断言，免得日后被误当回归 |

---

## 5. D — 顶栏气泡统一为 primitives `Tooltip` + 补 `aria-label`

### 5.1 覆盖面与逐处对照

| 按钮 | 修前 | 修后 |
|---|---|---|
| 刷新 `refreshBtn` | **只有** `title=a11yRefresh`（常驻纯图标） | `aria-label=a11yRefresh` + `Tooltip(label=a11yRefresh)`；`title` 撤 |
| 折叠 `foldBtn` | **只有** `title`（折叠态两值，常驻纯图标） | `aria-label`（两值随态）+ `Tooltip(label=同值)`；`title` 撤 |
| 工作区 `wsAnchor` | `aria-label` + `title=curWsName` | `aria-label` 保留 + `Tooltip(label=curWsName)`；`title` 撤（气泡顺带补全被 `max-width:220px` 截断的长名） |
| 分屏 `splitBtn` | `aria-label=btnSplit` + `title=a11ySplit` | 保留 `aria-label`，`title` 换成 `Tooltip(label=a11ySplit)` |
| 编辑/保存（合并后） | `aria-label`（两值），无 `title` | 保留 `aria-label`（两值）+ `Tooltip(label=同值)` |
| 视图选择器 `viewBtn` | `title=a11yViewPick` | **撤 `title`，不挂气泡**（悬停手势已被下拉占用）；可读提示＝那串恒等于当前视图名的文字 + 悬停即现的下拉；可访问名仍来自可见文字（**不加** `aria-label`：加了会把「源码」这个名字换成「选择视图」，违反 label-in-name） |
| 解读选择 `genAnchor` | `aria-label` + `title=a11yGen`（**用户截图里那条压在正文上的深色长条**） | 保留 `aria-label`，`title` 撤，**不挂气泡**（同上，悬停即开菜单） |

顶栏 `title` 清零：实测 `grep -n "title=" src/client/index.tsx` 现在只剩 **2 处，都在左侧文件树**
（`.fs-docmark` 的 `a11yDocFiles` 与目录行的 `a11yDocDir`），**不在顶栏按钮上**，按「顶栏所有按钮」的
范围刻意不动（它们是行/圆点上的悬停提示，换 `Tooltip` 要给树行加锚点层，属另一件事）。

### 5.2 双气泡从根上消除

气泡只有一处来源（`Tooltip`），锚点上一个 `title` 都不剩 ⇒ 不再存在 `Button` 透传 `title` +
`Tooltip` 同时冒泡的可能。规格 `§1 R2` 与 `§2` 第 87 行的反复**以本段为准**（用 `Tooltip` + 去 `title`），
即 §2 那句「再包一层 `Tooltip` 会出双气泡」的**前提**（把 `title` 留着）已被本段取消。

### 5.3 悬停即开菜单的两个锚点为何豁免

`.fs-genwrap` 与 `.fs-viewwrap` 的 `onMouseEnter` 会立刻开下拉；再挂气泡就是**悬停同时弹两个浮层**
（`PROGRESS.md` §5 #12 已把它记为反向风险）。所以这两处选择「只留 `aria-label` + 可见文字/下拉本身」。
这是本段唯一的一处风格例外，已在源码注释里写明理由。

### 5.4 测试桩与既有断言

- `tests/fixtures/primitives-stub.ts` 新增 `Tooltip` 桩：把锚点**原样渲染**（规格里仍能按文本找到按钮），
  并在包装层上公开 `data-label` / `data-side` / `data-disabled`。桩注释写明它**不复刻悬停生命周期与
  气泡定位**（jsdom 无布局），所以 spec 里的通过**不能**当成「气泡长什么样」的证据。
- 既有断言同步：`ws.getAttribute('title')` 与 `splitBtn().getAttribute('title')` 改成「`title` 为 null +
  气泡 label 正确」；`.fs-hd-actions button:last-child` / `:first-child` 这类**位置选择器**在加锚点层后
  语义会漂（按钮成了自己包装层的唯一子节点），改成按 `aria-label` 定位（新增 `refreshButton()` /
  `foldButton()` / `namedToolbarButton()` 三个 helper）—— 顺带把「补上的 aria-label 真的可用」变成断言。
- 新增 3 条 D 用例：逐按钮核对气泡 label、全顶栏 `title === null` 且每个按钮**仍有可访问名**、
  锚点必须是原生 `SPAN` 且 `.fs-tipwrap` 规则在位（钉住 §0.2 的前提，防止后人「顺手把那层 span 去掉」）。

---

## 6. E — 工具文档订正

### 6.1 实测结论（原始读数见 §0.3）

1. **`--menus` 不改变四项读数**：带与不带，3857 档 × 全部非 `menu` 字段 **0 差异**；
   `--menus=inline --menu=view` 的逐场景表与合计与基线**逐档相同**（1010 / 754）。
2. **1010 → 2013 的真因是漏 `--wsicon`**：同源同机，`--wsicon` 与否相差 `gone 1010 vs 2013`、
   `goneRight 754 vs 1757`、右列最后被裁档 356 vs 576；判别特征 `wsLabShown === null`。
   `/tmp/menu-probe/out-fix-cur.json`（记 2013）3857 档**一个 `menu` 字段都没有** ⇒ 它压根不是 `--menus` 的产物。
3. **归档报告 §3.1 的断言成立**（独立复现 0 差异），**归档报告一字未改**，也没有写针对它的勘误段。

### 6.2 落到 `tools/ui-probe/README.md`（4 处）

| 位置 | 加了什么 |
|---|---|
| §1.2 | 「统计集合要与指标一起读」：四项**只统计**三列内的 `button` + `.fs-hd-path` + `.fs-dirty`；`--menus` 注入的面板是 `div.mr-list` / `div.mr-item`，**产不出候选**，所以读数不变；并指出真实 `Menu` 的行是 `<button role="menuitem">`——**哪天把复刻行改成真 `button`，打开态的面板自身就会落进「被裁」计数**（读数会突然翻倍，而那不是回归） |
| §1.5 末 | 新增 **§1.6「比两份产物之前先对齐 flags —— `--wsicon` 会整档改变『被裁』读数」**：1010/754/356 与 2013/1757/576 的对照表、`wsLabShown=null` 判别特征、以及「历史源码（第三段 a 之前）要按那段源码的形态选 flags」的反向坑 |
| §2.1 | `--wsicon` 行补「它参与决定读数」+ 指向 §1.6 |
| §3 末条 | 「注入打开态不改变顶栏几何（0 差异）」这条自检**成立，但条件是两份产物同一组 flags** |
| §4 | 新增「当前已知的复刻滞后」：① `.fs-tipwrap` 锚点层、② 编辑/保存已合并 —— **`scenario()` 未同步**（`probe.js` 不在本段授权面）。两处的实测影响都写清：① 0 差异、② 只变好（被裁 1010→790、下界 357→307，无任何一档变差）⇒ 现在的读数对①等价、对②**保守** |

**「同一 `--menus` 模式下汇总表计的是含面板的全集合」这句原文没有写进 README** —— 因为它与实测不符
（面板今天不产出候选）。改成上面那条**同源但成立**的表述：统计集合必须与指标一起写清，
并写清「什么情况下面板会进计数」。

### 6.3 落到 `docs/agent/lessons.md`（新增 4 条，B 节）

| 条目 | 一句话 |
|---|---|
| **B-4** | 指标口径必须连同**统计集合**与**产出它的 flags** 一起写清（两个真实形态：flags 不一致被误读成口径变化；复刻行从 `div` 换真 `button` 会让面板自身进计数）——**这条即任务书要求的「指标口径必须连同统计集合一起写清」** |
| **B-5** | primitives 的 `Tooltip` **不能**挂在 primitives 的 `Button` 上（React 18 无 ref）⇒ 锚点必须加原生元素层；「重试：否」 |
| **B-6** | 「加一层包装 span」的几何代价要**实测**，别推断「反正它是 inline-flex」；并记下本段用的方法（改 `SCEN` 不动判据 + 逐档 diff） |
| **B-7** | 交互姿态改动会让字典键失去消费者，但删键要单独裁决（本段的取舍与理由） |

---

## 7. 门禁与几何门禁（原始输出摘要）

### 7.1 `verify-stage`

跑了**两次** —— 因为 §0.1 的 5 项工作树遗留会让第一次判成越界：

**第一次（严格按任务书 §4.1 的 allow 列表）** → `/tmp/verify-collapse-a.txt`

```
=== 1. 改动范围守卫 ===
git status --porcelain（10 项）：本段 3 项（M src/client/index.tsx / M tests/client-view.spec.ts /
  M tests/fixtures/primitives-stub.ts）+ 授权面内 2 项（M docs/agent/lessons.md / M tools/ui-probe/README.md）
  + 上一段遗留 5 项（M PROGRESS.md / M docs/agent/README.md / M tools/ui-probe/probe.js /
  ?? reports/2026-09-11-ui-revamp-menu-clipping{,-followup}.md）  <<< 越界
git diff --stat：src/client/index.tsx 135 +++ / tests/client-view.spec.ts 274 +++ /
  tests/fixtures/primitives-stub.ts 38 +++ / tools/ui-probe/README.md 109 +++ / docs/agent/lessons.md 97 +++
守卫结论：FAIL — 5 项越界（全部是上一段未提交的产出，本段一字节未动）
[1/4] typecheck → PASS（exit 0，3.5s）
[2/4] lint      → PASS（exit 0，4.1s）
[3/4] test      → PASS（exit 0，13.5s）
[4/4] coverage  → PASS（exit 0，16.7s，含分母守卫）
总判定：1 项未过（守卫）。
```

**第二次（把上一段的 5 项并入 allow 列表）** → `/tmp/verify-collapse-b.txt`：守卫 PASS + 四门禁全绿，
**总判定：全绿**。

四项数字（两次一致）：`Test Files 19 passed (19)` / `Tests 594 passed (594)`（较本段开工时的 586 例
**+8 例**：A 2 + B 1 + C 2 + D 3）/ `All files 100 / 100 / 100 / 100` /
分母守卫 `✓ 分母完整：19 个源文件全部进入覆盖率统计`；`lint` = 0 错 0 警告（48 files、80 rules）。

### 7.2 几何探针（基线口径，`--wsicon`，7 场景 × 551 档 = 3857 档）

| 读数 | 门禁要求 | 本段实测（新 CSS、复刻 DOM） | 真实新 DOM（+锚点层、+合并按钮） |
|---|---|---|---|
| S0 被裁 | 0 | **0** | 0 |
| 跨列可见重叠 | 0 档 | **0** | **0** |
| 同列可见重叠 | 0 档 | **0** | **0** |
| 顶栏高度集合 | `{48}` | **{48}** | **{48}** |
| 右列被整块裁下界 | ≤360（原末态 357） | **357**（最后被裁档 356，**未变差**） | **307**（最后被裁档 306） |
| 被裁合计 / 右列被裁 | 回归信号 | 1010 / 754（与开工前逐档相同） | **790 / 504** |

产物：`/tmp/e2/out-new-base.json`、`out-dom-d-wrapped.json`、`out-dom-bc-wrapped-merged.json`
（**运行产物不进仓库**；跑法与装置见 §7.4）。

**逐档 diff（隔离两处结构改动）**：

| 对比 | 行数 | 有差异档数 | 逐字段 |
|---|---|---|---|
| 基线 vs **只加 `.fs-tipwrap` 锚点层**（D 的隔离） | 3857 | **0** | `{}` ⇒ 这一层几何中性 |
| 基线 vs **锚点层 + 合并按钮**（D+B） | 3857 | 957 | `goneN` 957 / `goneRightN` 737 / `goneMidN` 220 / `partRightN` 219 / `goneList` 957，**全部是减少** |
| 变差项检查（`visN` / `sameColN` / `goneN` / `goneRightN` / `unclickN` / `colN` 逐档逐字段） | 3857 | — | D：变差 **0**、变好 0；D+B：变差 **0**、变好 1694 |

### 7.3 菜单打开态（D 的改动不得破坏它）

`node tools/ui-probe/probe.js --tag=m-portal --wsicon --menus=portal`：

```
菜单打开态（--menus=portal）| 面板 | 档数 | 承载形态 | 被整块裁 | 被裁（部分+整块） | 最小可见高 | 面板高 | 中心不可命中
ws   | 3857 | body | 0 | 0 [-] | 64.0  | 64.0  | 0
view | 3306 | body | 0 | 0 [-] | 176.0 | 176.0 | 1546（三个同开的合成产物；--menu=view 单开为 0）
gen  | 3306 | body | 0 | 0 [-] | 232.0 | 232.0 | 0
```

三个面板 **0 档被裁**、可见高恒等于面板高 ⇒ 顶栏气泡的改动没有碰坏 portal 修复。

### 7.4 复跑命令

```bash
# 基线口径（新 CSS）
node tools/ui-probe/probe.js --tag=new-base --wsicon --outdir=/tmp/e2
# 菜单打开态
node tools/ui-probe/probe.js --tag=m-portal --wsicon --menus=portal --outdir=/tmp/e2
# 真实新 DOM（锚点层 / 合并按钮）：改 SCEN 场景 DOM 后同脚本重跑并逐档 diff
node /tmp/e2/measure-new-dom.mjs
# E 的三方对照（基线 / --menus=inline --menu=view / --menus=inline 全开）
node tools/ui-probe/probe.js --tag=e-base --wsicon --outdir=/tmp/e-probe
node tools/ui-probe/probe.js --tag=e-inline-view --wsicon --menus=inline --menu=view --outdir=/tmp/e-probe
node tools/ui-probe/probe.js --tag=e-inline-all --wsicon --menus=inline --outdir=/tmp/e-probe
# Tooltip 挂 Button 的可行性（React 18 ref 语义）
node /tmp/d-tooltip-ref.mjs
```

---

## 8. 未核实项（诚实清单）

1. **无真实 GUI 端到端**。`http://127.0.0.1:3080/` 需认证（上一段实测 401），本段所有结论来自
   jsdom（结构与行为）+ headless Chrome 几何探针；**没有人在这套 UI 上点过**。刷新页面会不会真的弹
   确认框、气泡长什么样、折叠态分栏在屏幕上是否顺眼，都**未核实**。
2. **气泡本身不被探针覆盖**：探针没有「气泡打开」这个场景（`Tooltip` 的气泡只在悬停/聚焦时挂载）。
   「气泡不会被顶栏的 `overflow:hidden` 裁掉」这一条**只有间接依据**：气泡是 `position:fixed`
   （`Tooltip.module.css` 第 1–3 行）+ 经验卡 E-2 的实测（fixed 后代不被裁剪盒吃、坐标仍是视口坐标），
   本段**没有**为它新建探针场景（`probe.js` 不在授权面）。
3. **`Tooltip` 的可行性证据是「最小复刻」而非真包**：真 `primitives` 的 `lib/index.js` 只在 harness 树内
   可解析（这正是测试桩存在的原因），所以 `/tmp/d-tooltip-ref.mjs` 复刻的是**唯一相关机制**
   （函数组件 + `cloneElement(ref)`），并带正对照。真包行为未在 node 里跑过；但宿主源码的 `Button.tsx`
   与本包 `lib/index.js:1565` 的形态逐条核过，宿主 4 处 `Tooltip` 调用点也都包原生元素。
4. **探针的复刻 DOM 有两处滞后**（§6.2 §4）：`.fs-tipwrap` 锚点层、编辑/保存已合并。第①处已实测 0 差异
   所以等价，第②处只变好所以保守 —— 但**「测量对象与源码 DOM 不完全一致」这件事本身属实**，
   需要改 `tools/ui-probe/probe.js` 的 `scenario()` 才能彻底对齐（**不在本段授权面**，见 §9）。
5. **`--wsicon` 对照表的绝对档位（356 / 576 / 306…）随字体渲染浮动**（README §4 / 经验卡 B-2）：
   本段引用的是**同机同一次会话内**的前后脚对照，故差值可信；跨机器/换字体需复测。
6. **跨运行非确定性依旧**（D-4）：本段引用的都是结构性指标（0 档 / 下界 / 高度集合 / 逐档 0 差异），
   没有拿 1–2 档差异当结论。
7. **`btnView` / `a11yViewPick` 现在是零消费者的键**（§3.3、§5.1）：保留是判断，不是实测结论；
   若你要删，改动点已列全。
8. **未跑 `npm run build`、未重启 `dsh web`**（授权否决）⇒ 运行中的页面仍是旧产物，**看不到**本段
   任何改动。生效条件：`rm -rf lib client && npm run build` + 重启。

---

## 9. 待裁决（需要越权或需要你点头的）

| # | 事项 | 我需要改 X，因为 Y | 备选 |
|---|---|---|---|
| 1 | **`tools/ui-probe/probe.js` 的 `scenario()`** | 复刻 DOM 已与源码形态不同（缺 `.fs-tipwrap` 层、多一个已合并掉的「保存」按钮）。**不改它，探针量的是另一个 DOM**（README §4 明写这是必须同步的）。本段的替代做法是外挂 `/tmp/e2/measure-new-dom.mjs`，不入库、下次会丢 | 保持现状：读数对①等价、对②保守（已写进 README §4） |
| 2 | **D 的锚点层要不要保留** | `<Tooltip><Button/></Tooltip>` 在本包 React 18 下气泡永不显示（§0.2 实测）。要用官方气泡就必须加这层原生 span。**但若你更在意「顶栏 DOM 不要多一层」** ⇒ 唯一替代是**只删 `title`、不留气泡**（刷新/折叠这两个常驻纯图标按钮就只剩 `aria-label`，鼠标悬停没有提示） | 现在的实现（5 层锚点 span，实测几何中性 + 5 个按钮有受控气泡） |
| 3 | **B 的判据是否改用 `canSave = editMode \|\| dirty`** | 现在严格按裁决 B 的 `editMode` 驱动；副作用是「已脏 + 查看态」下保存要点两下（§3.2 第 1 条，旧 UI 一下）。改成 `canSave` 可一行修掉，但那偏离了你已裁决的方案 | 保持 `editMode` 驱动（本段实现）+ 把该路径记成已知代价 |
| 4 | **`btnView` / `a11yViewPick` 两个零消费者键** | 见 §3.3：我判断**保留**（字典是注册表 + 那道三重硬断言要刻意过手）。若要删，改动点已列全（`locale.ts:40`、`locale.spec.ts:49`、`:163` 的 117→116，以及 `a11yViewPick` 的对应两处） | 保留（现状） |
| 5 | **`PROGRESS.md` / `docs/agent/README.md` 的更新** | 本段授权面不含它们，因此台账 §1「当前状态」的门禁数字仍是 586 例、§5 #12 的「顶栏原生 title 气泡」待办已由本段完成。**建议由主代理在验收后统一续写** | 保持不动（本段未改一字） |

---

## 10. 产物路径

| 内容 | 路径 | 入库？ |
|---|---|---|
| 本报告 | `docs/agent/reports/2026-09-12-collapse-split-edit-merge.md` | ✅ |
| 源码改动 | `src/client/index.tsx`（A/B/C/D） | ✅ |
| 测试改动 | `tests/client-view.spec.ts`、`tests/fixtures/primitives-stub.ts` | ✅ |
| 口径与经验 | `tools/ui-probe/README.md` §1.2 / §1.6 / §2.1 / §3 / §4；`docs/agent/lessons.md` B-4～B-7 | ✅ |
| 门禁原始输出 | `/tmp/verify-collapse-a.txt`（§4.1 的 allow 列表）、`/tmp/verify-collapse-b.txt`（并入上一段文件后：全绿） | ❌（运行产物） |
| 几何产物 | `/tmp/e2/out-{new-base,dom-d-wrapped,dom-bc-wrapped-merged,m-portal-portal}.json`、`/tmp/e2/probe-*.html` | ❌ |
| E 的三方对照 | `/tmp/e-probe/out-e-{base,inline-view-inline,inline-all-inline,novw-inline,novw-base}.json`、`log-*.txt` | ❌ |
| 上游对照产物（未改） | `/tmp/menu-probe/out-fix-cur.json`（记 2013 的那份）、`out-fix-cur-ws.json` | ❌ |
| D 的可行性装置 | `/tmp/d-tooltip-ref.mjs`；新 DOM 测量装置 `/tmp/e2/measure-new-dom.mjs` | ❌ |
