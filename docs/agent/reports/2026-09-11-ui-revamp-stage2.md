> 归档自 `/tmp/dsh-ui-stage2.md`，归档于 2026-09-11 23:35:31（原样保留，未改写；本行由归档动作添加）。

# 第二段实施报告 — R2 窄宽度图标化 + 翻译中常驻可见

> 时间：2026-09-12 前夜（工作树，未提交）
> 范围：`src/client/index.tsx`、`tests/**`（**未新增 locale 键**，故 `src/shared/locale.ts` 与 `tests/locale.spec.ts` 本段零改动）
> 基线：第一段末态 = 我接手时的工作树快照（已存 `/tmp/stage2/stage1.tsx`）

---

## 0. 一句话结论

R2 图标化已按「容器实测宽度驱动」落地（阈值只在 CSS 的 `@container` 里，JS 只发布实测宽度），但**图标化本身不足以在任何宽度保住右侧按钮**：实测下界由面板 476px 压到 **442px**（最坏场景 494→460），200–441 区间必须上第三档；第三档候选方案（极窄时三块各占一行 + 让容器内工作区按钮可压）已实测达到 **200→1200 全档 被裁 0 / 跨列重叠 0**，但**按指令未落地**，等裁决。

---

## 1. 改动逐处对照

### 1.1 `src/client/index.tsx`

| # | 位置 | 改动 | 为什么 |
|---|---|---|---|
| 1 | import 块 | 增 `IconCheckOutline16`、`IconLoadingOutline16` | 保存按钮按 DSH 惯例用 ✓（规格 §R2 表格）；翻译中换忙碌字形 |
| 2 | 新增 `useHbarWidth()`（`FsView` 之前） | callback ref + `ResizeObserver`，把 `.fs-hbar` 的 `clientWidth` 发布成 `--fs-hbar-w`；`typeof ResizeObserver === 'undefined'` 时保留首帧那次发布 | 与宿主同写法（`useAnchoredPosition`、`ConversationRoot` 的 callback-ref + 首次直接算一次）。**JS 不持有任何像素阈值** |
| 3 | `FsView` 内 `const hbarRef = useHbarWidth()`；`<div className="fs-hbar" ref={hbarRef}>` | 挂容器 | 同上 |
| 4 | `genAnchor` | 图标改为 `genBusy ? IconLoadingOutline16 : IconPlusOutline16`；`disabled={genBusy}`；`title` 忙碌时改 `btnTrLoading`；增 `aria-label`；children 包 `<span className="fs-btnlabel">` | ①②R2 图标化；③任务第 4 条「翻译中常驻可见」 |
| 5 | `editActions` 的编辑按钮 | 增 `aria-label`（随 `editMode` 切 `btnView`/`btnEdit`）+ `fs-btnlabel` 包裹 | 窄档纯图标时保留可访问名 |
| 6 | `editActions` 的保存按钮 | 增 `icon={<IconCheckOutline16 />}` + `aria-label` + `fs-btnlabel` | 同上；规格 §R2 表格指定 ✓ 字形 |
| 7 | CSS `.fs-hbar` | 增 `container-type:inline-size` | 让 `.fs-hbar` 成为 `@container` 的查询容器（宿主 7 处 `@container` 先例，`ProducedFiles` 逐级 5 档） |
| 8 | CSS 新增 `.fs-btnlabel{white-space:nowrap}` + `@container (max-width:672px){.fs-btnlabel{display:none}}` | 分档动作 | 阈值唯一真相源在 CSS；容器查询随容器宽度**单调**变化，不会像「测溢出再打标记」那样因图标化让内容变窄而反复撤销（滞回振荡） |

### 1.2 翻译中常驻可见（任务第 4 条）

- 忙碌判据 `genBusy = viewer.canTranslate && viewer.trBusy`（即 md 且非 `.book/`，与 `genItems` 里那一项同源）。
- 菜单关着时：按钮显示 `IconLoadingOutline16` + 文案「翻译中…」+ `disabled`，`title`/`aria-label` 同为「翻译中…」。
- 菜单开着时：菜单项仍是「翻译中…」且 `disabled` —— 同一个事实的两处呈现。
- **没有新增任何 ZH 键**：复用 `btnTrLoading` / `btnGen` / `btnEdit` / `btnView` / `btnSave`；`ZH` 仍 117 键，`tests/locale.spec.ts` 未改。

### 1.3 `tests/fixtures/primitives-stub.ts`

- 新增 `IconCheckOutline16`、`IconLoadingOutline16` 桩（新用到的导出必须补桩）。
- `StubButtonProps` 增 `'aria-label'` 并透传给 `<button>`（真实 `Button` 就是靠 `...rest` 透传原生属性；不补桩则窄档可访问名无从断言）。

### 1.4 `tests/client-view.spec.ts`

- 修 1 条因 R2 失效的旧断言：`ignores a translation request while one is running`（原为 `click(button(L('btnGen')))` 开菜单，现在忙碌时按钮文案变「翻译中…」且禁用、点击被吞 ⇒ 改用新增的 `openGenMenu()`（hover 开菜单）+ 先断言按钮自身的禁用态）。
- 新增 describe `narrow toolbar: icon bands (R2)`，5 例：label 层与 aria-label / ✓ 与铅笔字形 / 忙碌态与复位 / 宽度发布（`--fs-hbar-w` = 实测 400px，用 recording `ResizeObserver` 桩 + `Object.defineProperty(clientWidth)`）/ 分档路由（CSS 里有 `container-type:inline-size` 与 `@container (max-width:`，且隐藏规则在容器查询内）。

---

## 2. 几何探针（本段核心证据）

- 脚本：`/tmp/stage2/gen.js`（用法 `node gen.js <variant> [窄区步长] [宽区步长]`）
  - `s1` = 第一段末态（`/tmp/stage2/stage1.tsx`）；`cur` = 现工作树；`cur-stack2` = 第三档候选实验
  - **CSS 从 `src/client/index.tsx` 的 `const CSS = […]` 逐字提取**（`extractCss`，不手抄）；primitives 的 `Button.module.css` / `Menu.module.css` 原样加载（类名映射去 hash）；壳层变量取自 `apps/web/dist/assets/*.css`
- 判据（与 `PROGRESS.md` §3 同口径）：
  - **可见矩形** = 元素矩形与**所有** `overflow != visible` 祖先裁剪盒求交
  - **被整块裁掉** = 可见矩形面积 ≤ 0.5px²（`goneN`）；另单列 `unclickN`（可见但其中心点 hit-test 被别的元素盖住）
  - **跨列 / 同列可见重叠** = 可见矩形交面积 > 0.5px²，按列归属分组
- 扫描：1200→701 步长 10 + 700→200 步长 1 = 551 档/场景 × 6 场景 = **3306 档**；`--window-size=1600,1000`（viewport 不足会让 hit-test 假红，已修）
- 复跑：`cd /tmp/stage2 && node gen.js cur 1 10`（约 4 秒）；逐档明细落 `/tmp/stage2/out-cur.json`、`out-s1.json`、`out-cur-stack2.json`

---

## 3. 逐档实测（S1＝源码视图 + 全套按钮 + 长路径；格式 跨列/同列/被裁/右列被裁）

| 面板宽 | 基线(第一段末态) | 现实现 | 第三档候选 | 说明 |
|---|---|---|---|---|
| 200 | 0/0/7/4 | 0/0/7/4 | 0/1/**0**/0 | 极端窄：基线=现实现（图标化省的 104px 不够） |
| 250 | 0/0/6/4 | 0/0/6/4 | 0/0/**0**/0 | |
| 300 | 0/0/5/4 | 0/0/5/4 | 0/0/**0**/0 | |
| 350 | 0/0/4/3 | 0/1/3/2 | 0/0/**0**/0 | |
| 400 | 0/1/3/2 | 0/1/2/1 | 0/0/**0**/0 | |
| **441** | 0/1/2/1 | 0/1/2/1 | 0/0/0/0 | 现实现的右列下界临界点 |
| **442** | 0/1/2/1 | 0/1/**1**/**0** | 0/0/0/0 | **现状：右列按钮从这里起全部可达** |
| 460 | 0/1/2/1 | 0/1/1/0 | 0/0/0/0 | |
| 500 | 0/1/1/0 | 0/1/1/0 | 0/0/0/0 | 中列视图按钮被裁（mid 列被压到 0） |
| 600 | 0/0/1/0 | 0/0/0/0 | 0/0/0/0 | |
| 650 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | |
| 660/700/701/900/1200 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 文字态/图标态均全绿 |

S2（长工作区名 + 长路径 + 4 字视图名「文章翻译」）同形状，下界更宽：基线右列被裁 200–493，现实现 200–459，第三档候选 0。

**全场景合计（3306 档）**

| 指标 | 基线 | 现实现 | 第三档候选 |
|---|---|---|---|
| 跨列可见重叠 档数 | 0 | **0** | 0 |
| 同列可见重叠 档数 | 612 | 504 | 21 |
| 被整块裁掉 档数 | 1886 | 1370 | **0** |
| 其中右列按钮被裁 档数 | — | 242（S1）/260（S2） | **0** |

- 同列重叠（`PROGRESS.md` §5 #9，既有残留）：现实现 168 档（S1，面板 344–511）/ 168 档（S2，361–528），基线 204 档（360–563 / 377–580）。**区间整体左移、档数小幅减少，未消解**；成因实测确认：`.fs-genwrap` 被压到 10.2px 时其内按钮（36px）溢出盖住「● 未保存」（相交 411px²）。按指令不为它扩大改动面。

---

## 4. 分档分界点（实测）

- 阈值写在 CSS：`@container (max-width:672px)`，`672px` 是 **`.fs-hbar` 自身的宽度**（= 面板宽 − `.fs-wrap` 左右 padding 28px）。
- 实测分界：**面板 ≤ 700px ⇒ 三个按钮的 `.fs-btnlabel` 全部 `offsetWidth === 0`（图标态）；面板 ≥ 701px ⇒ 全部可见（文字态）**。逐档扫描里 S1/S2/S3/S4/S5 五个场景的分界完全一致。
- 阈值取值的依据：**文字态**（基线）在面板 651px 处开始裁右列（S1 633 / S2 650 / S4 633 / S5 468），最坏 651 ⇒ 阈值必须 ≥ 651 + 28 = 679 hbar 才安全…… 实测取的 672 (=面板 700) 相对最坏文字态下界 651 留 49px（7.9%）字体渲染余量；另一侧，图标态在面板 ≥ 442（S1）/≥460（S2）即无裁切，所以 672 远在"图标态够用"的区间内。可选区间 = hbar ∈ [623, +∞)，此处取 672。

---

## 5. #8 的根因（本段最重要的发现）

面板 400px 档的逐元素几何 dump（`DUMP_W=400 node gen.js cur`）：

```
hbar [14,386]        ← 容器右界 386
fs-hbar-left  [14,298.8]   ← 左列吃掉 284.8px
fs-hbar-mid   [308.8,308.8] ← 中列宽 0 ⇒ 视图按钮被裁
fs-hbar-right [318.8,471.8] ← 右列溢出容器 86px ⇒ 保存整体被裁、编辑只剩 8px
  L vp-md.fs-wsbtn  宽 202.8（工作区按钮：内容宽，未被压缩）
  L 刷新/折叠        36 + 36
```

瓶颈**不是**右侧三个按钮的文字，而是**左列工作区按钮所在的 flex 项 —— `Menu` 的 root `<span>`**（`display:inline-flex`，无 `overflow`）的 **min-content contribution**：它把左列顶到 284.8px，中列被 `minmax(0,1fr)` 让到 0，右列被挤出容器后由 `.fs-hbar{overflow:hidden}` 整块裁掉。

已验证的两条负结果（都实测过，别再试）：
- 给 `.fs-hbar-left > span{min-width:0}`（容器内 Menu root 可压）：**无任何改善**（3306 档判据与现实现逐档相同）。原因：min-content contribution 由内容（受 `.fs-wsbtn{max-width:220px}` 钳制）决定，`min-width` 只影响压缩下限，不影响列宽分配。
- 只折行、不给该 span `min-width:0`：S0/S1/S3 在 200–276 仍被裁（左块整行内容超宽）。

---

## 6. 第三档候选方案（**未落地**，等裁决）

两条 CSS 规则，加在图标化那一档之后：

```css
@container (max-width:672px){.fs-hbar-left,.fs-hbar-mid,.fs-hbar-right{grid-column:1/-1;justify-self:stretch}}
@container (max-width:672px){.fs-hbar-left>span{min-width:0}}
```

- 效果：极窄时三块各占一整行（顶栏变三行），每行宽度 = 容器宽 ⇒ 行内 flex 才能真的压缩工作区按钮的文字。
- **实测：200→1200 全部 3306 档 被裁 0 / 跨列重叠 0**（`out-cur-stack2.json`），同列重叠降到 21 档（仅面板 200–206，相交 107px²，仍非 0）。
- 代价：面板 ≤700 时顶栏变三行（高度 ×3）；两档阈值若想分开（如只在更窄时才折行），则折行阈值以下的那段会重新出现裁切 —— 我实测过把折行阈值压到 `380`（变体 `cur-stack`，其余同 §6）：面板 409–441（S1）/409–459（S2）重新出现右列被裁，即**图标化档与折行档之间不能留缝**，两档必须是同一个阈值。
- 若上游选「次要操作收进 `⋯` 菜单」而不是折行，本段的 `useHbarWidth` 与阈值架构不用动：只需把 `.fs-btnlabel` 的隐藏规则旁再加一条把 `editActions` 收进菜单的规则即可。

---

## 7. 失效断言与改法

| 断言的测试 | 为什么失效 | 改法 |
|---|---|---|
| `ignores a translation request while one is running`（原 `click(button(L('btnGen')))`） | 忙碌时按钮文案变「翻译中…」且 `disabled`，旧选择器找不到、且禁用按钮吞掉点击 | 改为「先断言按钮自身 disabled ⇒ 再用新增 `openGenMenu()`（hover）开菜单断言菜单项 disabled」 |
| 三个按钮的文本选择器 `byText('button', L('btnGen'))`（若干处） | 文本仍能匹配（`textContent` 不受 span 包裹影响），**未失效** | 不动 |
| 需要 `aria-label` 断言 | stub 原先不透传 `aria-label`，读到 `null` | `StubButtonProps` 增 `'aria-label'` 并透传 |
| 渲染 `IconCheckOutline16` / `IconLoadingOutline16` | stub 无这两个导出 ⇒ 55 例抛 `No "…" export is defined` | 补两个 `stubIcon` 桩 |

---

## 8. 门禁结果（本段实测）

| 项 | 结果 |
|---|---|
| `npm run typecheck` | exit 0，无输出 |
| `npm run lint` | 0 warnings / 0 errors（47 files，80 rules） |
| `npm test` | **19 spec / 576 passed**（第一段基线 571，本段 +5） |
| 覆盖率 | `npx vitest run --coverage --coverage.reportsDirectory=/tmp/stage2-cov`：All files **100/100/100/100**；`node scripts/verify-coverage-scope.mjs` ✓ 19 个源文件全在分母 |
| `git diff --stat` | 6 文件：本段改的是 `src/client/index.tsx`、`tests/client-view.spec.ts`、`tests/fixtures/primitives-stub.ts`；另 3 个（`docs/spec-ui-revamp.md`、`src/shared/locale.ts`、`tests/locale.spec.ts`）是第一段遗留（`docs` 在我工作期间被上游继续写入 §6/§7，**不是我改的**） |

> 备注：`npm run test:coverage -- --coverage.reportsDirectory=…` 会把参数追加到脚本里 `; if …` 之后，破坏 shell 语法（实测 `sh: 1: Syntax error: word unexpected`）。故按该脚本等价的两步跑：`npx vitest run --coverage --coverage.reportsDirectory=/tmp/stage2-cov` + `node scripts/verify-coverage-scope.mjs`。`verify-coverage-scope.mjs` 读的是仓库内 `coverage/coverage-summary.json`（脚本写死路径，非本次改动），它报 ✓。

---

## 9. 待裁决的分歧点

1. **R2 图标化写法 vs 规格 §2 的 `Tooltip`**：规格 §2 要求纯图标交互用宿主那套「原生 `<button>` + `Tooltip` + `aria-label`」，本段按任务③.2 的指令**沿用本文件既有 icon-only 写法**（`<Button size icon title />`）并补 `aria-label`。不引入 `Tooltip` 的实际理由：`Button` 已透传原生 `title`（悬停已有气泡），再包 `Tooltip` 会出现**两个气泡**；且规格也承认宿主 `43` 处 `<Button>` 全带 children、0 处自闭合，而本文件已有两处自闭合（`foldBtn`/`refreshBtn`）。要改就应三处（含那两个）一起改 —— 那超出本段授权。
2. **#8 是否上第三档**：图标化后右列下界 442（S1）/460（S2），200–441 不可达。第三档候选（§6）实测可达标，但会带来「≤700px 顶栏三行」的代价，且第二档阈值若要更靠下需要重新标定。
3. **极窄时中列视图按钮仍被裁**（面板 200–517 区间，`mid` 列被 `minmax(0,1fr)` 让到 0）：这是第一段「右列优先」设计的直接代价，本段未改动它（改它会把溢出推给右列 ⇒ 违反 #8）。是否接受？
4. **保存按钮在宽档也新增了 ✓ 图标**（`IconCheckOutline16` 常驻，窄档只是隐藏文字）：规格 §R2 表格只规定「窄宽度图标化」，未说宽档是否也带图标；DSH 惯例（GoalBar / QueueDock）是带 ✓ 的。若不接受，需让 `icon` 只出现在窄档 —— 那 JS 就得持有分档状态（本段刻意避免）。
5. **#9（同列重叠）**：从 612 档降到 504 档但未消解，按指令未扩大改动面；要消解的最小改动是给 `.fs-genwrap > span{min-width:0}`（让按钮被压而不是溢出），但那会改变宽档以外区间的按钮占位。

---

## 10. 未核实项（诚实清单）

1. **没有真实 GUI 端到端**：全部几何结论来自 headless Chrome 探针（`/usr/bin/google-chrome` 153.0.8010.36），没有人在页面上点过；`npm run build` 按指令未跑，`dsh web` 未重启，故产物 `client/client.js` 仍是旧版。
2. **探针用 16×16 占位 `<rect>` svg 当图标**（沿用第一段同款做法），未复刻真实图标 path；占位不参与宽度计算（`Button` 的 `.icon` 容器固定 16×16），几何结论不受影响。
3. **绝对像素端点会随字体可用性小幅移动**（本机 Linux Chrome；阈值 672 已留 7.9% 余量，但换成别的字体族需复测分界点）。
4. **探针场景是构造的 6 个**（长/中/短工作区名、路径、全套按钮、目录节点），不是真实工作区全量样本；`.fs-wsbtn{max-width:220px}` 已把长名钳到 220，故场景里"更长的工作区名"不会进一步抬高下界 —— 这一点是从 CSS 推断的，**未用更长名字单独实测**。
5. **`--fs-hbar-w` 目前没有 CSS 消费者**（分档由 `@container` 承担，见改动 #8 的理由）：它现在的价值是可断言、可被后续规则（如按比例收缩工作区按钮）使用；若上游认为"无消费者的变量"不可接受，可以删掉变量只留 `container-type`，但那样 §1.1#2 的测量钩子在 jsdom 里就没有可断言面了。
6. **`vi.stubGlobal('ResizeObserver', …)` 的那条测试只验证了"发布链路"**（首次发布 + 回调再发布 = 测量值），**没有验证真实浏览器的 `ResizeObserver` 触发时序**；几何真值由探针负责。
