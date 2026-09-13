# 分栏分隔条改为 DSH dockkit 的紧凑细线样式（2026-09-12）

**一句话结论**：`.fs-split` 从「5px 实心占位块 + 悬停整块灰底」改成 DSH 本体 `ui-dockkit` 的 `.divider`
机制（`width:0` 不占布局空间 + `::before` 0.5px 发丝线 + `::after` 8px 命中区与悬停渐隐线），
左树侧原来那条 1px 的 `border-right` 一并删掉，让接缝只剩**一条**线。悬停时可见的「带」由
**6 设备像素收窄到 1 设备像素**，命中区由 **5px 放宽到 8px**；探针 3857 档读数**逐字段不变**。

- 仓库：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`（改动前 HEAD `f5c4559`）
- 改动面：**只有 `src/client/index.tsx`**（+24 / −3）。`tests/client-view.spec.ts` **未改**（理由见 §6）
- 报告路径：本文件 ｜ 任务书原文落盘：`agent/sessions/session-927b055f-…/briefs/2026-09-12-split-divider-compact.md`

---

## 1. 改动对照（旧样式 → 新样式）

| 项 | 旧 | 新 |
|---|---|---|
| 布局占位 | `width:5px`（实打实占 5px；左树侧再加 `.fs-side` 的 1px 边框＝接缝区 6px） | `width:0`（**不占任何布局空间**，两半紧贴） |
| 常态可见线 | 只有左树侧 `.fs-side{border-right:1px solid var(--dsw-alias-border-l2)}`；分屏窗格之间**没有线** | `.fs-split::before`：`0.5px`、`var(--dsw-alias-border-l4)`、`left:-0.25px` **居中于接缝**；两处都有 |
| 悬停 / 拖拽中 | 整块 5px 变灰底 `rgba(127,127,127,.12)`（**粗带**的来源） | 命中区正中浮出一条两端渐隐的 `1px` 线（`var(--dsw-alias-label-caption)`，`linear-gradient` + `opacity` 120ms 交叉淡入） |
| 命中区 | 5px（就是分隔条自己） | **8px**（`::after` 向两侧各伸 4px），`z-index:1` 让外伸盖过后面的兄弟窗格 |
| 左树侧那条 1px 竖线 | 保留 | **删掉**（理由见 §3） |
| 触摸拖拽 | 无 | `touch-action:none`（照搬 dockkit） |

不变的部分（刻意保住）：拖拽入口 `startDrag` / `startSplitDrag`、拖拽中的 `.fs-split.active` 类、
`cursor:col-resize`、`flex:none`、分栏开关/比例/只读语义、（`SplitGlyph` 未动）。

---

## 2. 线宽 / 命中区实测数字

方法：从 `src/client/index.tsx` 的 `const CSS = [...]` 逐字抠出样式（与 `tools/ui-probe/probe.js`
同一套提取），拼成 400×200 的最小 HTML，用本机 headless Chrome（`--force-device-scale-factor=1|2`）
**截图后自己解 PNG 数像素列**，并在页面内用 `elementFromPoint` 探命中。脚本：`/tmp/divider-measure.mjs`。

### 2.1 可见线宽（接缝那一行上「非白」的设备像素列数）

| 状态 | 旧版 | 新版 |
|---|---|---|
| 常态 | **1 列** `x=150 rgb(229,229,229)`（= `.fs-side` 的 1px 边框） | **1 列** `x=150 rgb(229,229,229)`（= 0.5px 发丝线，用回退色 `rgba(127,127,127,.2)`） |
| 悬停 / 拖拽中 | **6 列** `x=150 rgb(229,229,229)` + `x=151–155 rgb(239,239,239)`（1px 边框 + 5px 灰带） | **1 列** `x=150 rgb(173,178,184)`（= `--dsw-alias-label-caption` 的回退值 `#adb2b8`，整列纯色 ⇒ 1px 线正好压在接缝上） |

**「紧凑」的量化证据：悬停时可见带 6 设备像素 → 1 设备像素（收窄 6×）；常态接缝区占位 6px → 0px。**

2× 屏（`--force-device-scale-factor=2`，PNG 800×400）：常态 **1 设备像素**（`x=300`）＝ **0.5 CSS px**，
是真发丝；悬停 **2 设备像素**（`x=299,300`）＝ 1 CSS px。1× 屏下 0.5px 被浏览器像素吸附成 1 个设备
像素——所以「变细」在 1× 屏上体现为**不再占位 + 悬停不再有灰带**，而不是像素数从 5 掉到 1。

### 2.2 命中区宽度（`elementFromPoint(x, 100)`，接缝 `x=150`）

| 探针点 | 旧版 | 新版 |
|---|---|---|
| `seam−3.5` / `seam−3` | `.fs-side`（未命中） | **`.fs-split`** |
| `seam±0.5` / `seam+3` / `seam+3.5` | `.fs-split` | **`.fs-split`** |
| `seam−5` / `seam+5` | `.fs-side` / `.fs-main` | `.fs-side` / `.fs-main`（未命中） |

⇒ 命中带 **旧 5px → 新 8px**（`[seam−4, seam+4]`），两侧都真的被 `.fs-split` 吃掉（`z-index:1` 生效，
没有被后面的兄弟窗格抢走）。计算样式读数：`::before width=0.5px / left=-0.25px`、`::after width=8px`
（默认 `opacity:0`，悬停/`.active` 时 `1`）。

---

## 3. 双线问题的处理与理由（`.fs-split` 被两处复用）

两处复用点：左树↔内容（`const split`，1413 行）与分屏窗格之间（`const splitBar`，1374 行）。
同一套样式对两处都合适：**两处都要一条常驻竖线**（用户原话要的就是「两个文档之间是竖线」），
而分屏那侧的两个窗格本来谁都不画竖线。

**冲突出在左树侧**：`.fs-side` 原来自己带 `border-right:1px solid var(--dsw-alias-border-l2)`，
位置在接缝左边 1px 处；新的发丝线跨在接缝上（`[seam−0.25, seam+0.25]`）。两条竖线只差 0.25px，
并集约 1.5px 且颜色不一致 —— 正是用户说的「不紧凑」那类观感。

**取舍：删掉 `.fs-side` 的 `border-right`，保留分隔条那条线。** 依据是 dockkit 的设计意图
（`/home/xuepeng/DSH/deepseekHARNESS/packages/client/ui-dockkit/src/components/dockkit.module.css`，
`.divider` 段注释原文）：divider owns no layout room, the halves abut, so a rule a pane draws across
its own edge — a header's hairline — runs unbroken past the seam（**分隔条不占布局空间、两半紧贴，
窗格横跨自己边缘画的线才能不断过接缝**）。dockkit 里接缝只有**一条**线且由 `.divider::before` 画；
窗格自己画的是**横向** hairline（它的诉求恰恰是「跨过接缝要连贯」，这要求接缝处**不要**有粗竖线）。
所以竖线不该由窗格画。删掉后左树侧与分屏窗格之间变成**同一条 0.5px 发丝线**，观感统一。
理由已写进改动处的注释（`src/client/index.tsx` 1508–1515 行）。

---

## 4. 探针读数（`node tools/ui-probe/probe.js --wsicon`，3857 档）

| CSS 来源 | 跨列重叠 | 同列重叠 | 被整块裁 | 右列被整块裁下界 | 顶栏高 |
|---|---|---|---|---|---|
| **现状（本次改动后）** | 0 | 0 | 760 | **306** | `{48}` |
| 对照 A：还原成旧版（5px 分隔条 + `.fs-side` 1px 边框） | 0 | 0 | 760 | **306** | `{48}` |
| 对照 B：只把 `.fs-side` 的 1px 边框加回来 | 0 | 0 | 760 | **306** | `{48}` |

**读数逐字段完全相同 ⇒ 本次改动没有改变顶栏几何**（跨列 0 / 同列 0 / 顶栏高 48 三项门禁照旧全绿）。

关于任务书预期的「下界 ≈307」：实测 **306**，比预期**好 1 档**；而**旧版 CSS 在同一探针里也是 306**，
所以这 1 档差**不是本次改动引入的**（不能拿「删了 1px 边框」去解释——对照 B 证明删不删它都不变）。
按 `cb9a5cd` 的提交说明，307 是那一次的读数，之后的 `f5c4559`（气泡改上弹 + 文案缩短）之后未再报数，
差值更可能来自那一单。**此处只报实测，不做归因之外的推测。**

对照怎么做的：`probe.js` 支持 `--css=<file>`，故把当前 `index.tsx` 用字符串替换还原出两份变体
（`/tmp/baseline-old.tsx`、`/tmp/baseline-border.tsx`）各跑一次，**没有碰工作树、没有 git 操作**。

---

## 5. 门禁与复核

`node scripts/verify-stage.mjs --allow src/client/index.tsx,tests/client-view.spec.ts,docs/agent/reports/`

- 守卫：PASS —— 改动 1 项（`M src/client/index.tsx`，+24/−3），全在授权面内
- typecheck PASS（4.6s）｜lint PASS（4.2s）｜test PASS（14.9s）｜coverage PASS（18.2s）→ **总判定全绿**

拖拽仍可用（任务书 §5.4）：jsdom 用例沿用文件既有写法，两条都过 ——
`drags the splitter within the clamped range`（左树 180–420 clamp + `.active` 出现/消失）、
`drags the divider, clamps the ratio and remembers it per file`（分屏占比 0.2/0.8 clamp + 按文件记忆）。

---

## 6. 为什么没改测试文件

`tests/client-view.spec.ts` 里与分隔条有关的断言只有：`.fs-split` 的存在/数量、`.active` 类、
`body.children` 的兄弟顺序（editor → splitBar → splitPane）。这三样**本次一个都没动**，
测试也没读 `const CSS` 文本，所以没有断言需要改；实测这套断言在改动后全绿，即是证据。

---

## 7. 未核实清单（如实）

1. **页面里还没生效**：按授权约束**未 build、未重启 `dsh web`**，所以 http://127.0.0.1:3080 上看到的
   仍是旧 bundle。要看到新观感需要重建并重启（走 `restart-dsh` 技能）——**请主代理裁决**。
2. `--dsw-alias-border-l4` / `--dsw-alias-label-caption` 的**存在性来自源码与构建产物**
   （`packages/client/ui-theme/src/styles/design-platform.css:176/269/201/294`，已编进
   `ui-theme/lib/client.js` 并注入 `body`），**没有在运行中的页面里读一次 computed value**
   （那需要接管 3080 页面，超出授权）。插件 CSS 已按文件既有风格给了回退值
   （`rgba(127,127,127,.2)` / `#adb2b8`，后者与亮色主题的真值一致）。
3. **8px 命中区向左伸 4px 会压住 `.fs-side` 内滚动条最右 4px**（`.fs-panel{overflow:auto}`）：
   真实滚动条宽度下的拖拽手感未实测（探针 DOM 里没有真滚动条）。dockkit 对它的窗格同样如此。
4. **悬停态是模拟的**：headless 不能真 `:hover`，悬停读数靠「把 `.fs-split::after{opacity:1}` 强制
   显形 / 给旧版补 `background`」得到；真实指针路径只由 §2.2 的 `elementFromPoint` 间接佐证。
5. **亮/暗两套主题的实际观感未实测**（只核到 token 值：亮 `#00000029` / 暗 `#fff3`）。
6. **触摸拖拽未实测**（`touch-action:none` 是照搬 dockkit，无实测）。
7. 探针的 DOM 是**复刻**（`tools/ui-probe/probe.js` 自带 stage），不是真实插件渲染树；
   真实页面下的接缝几何尚未复核（同 §7.1，要重启才能看）。

---

## 8. 改动文件

| 文件 | 改动 |
|---|---|
| `src/client/index.tsx` | `.fs-side` 去掉 `border-right`（+6 行注释说明取舍）；`.fs-split` 两行旧样式换成五行新样式（+18 行注释说明 dockkit 机制与 `z-index`/`opacity` 的因果） |
| 报告 | 本文件（`docs/agent/reports/2026-09-12-split-divider-compact.md`） |
