> 归档自 `/tmp/dsh-bug-layer.md`，归档于 2026-09-12 00:03:26（原样保留，未改写；本行由归档动作添加）。

# 「解读选择胶囊 图层错误」诊断与修复报告（2026-09-11 深夜段）

任务：确证并修复顶栏三个下拉被裁的问题。授权面：`src/client/index.tsx`、`tests/client-view.spec.ts`、
`tests/fixtures/primitives-stub.ts`。**未 build、未重启**（授权否决）。

---

## 0. 结论（一句话）

**成立**：`Menu` 默认是**内联**渲染（`portal = false`），面板 `.mr-list` 是 `.fs-hbar` / `.fs-hbar-mid`
两条 `overflow:hidden` 的后代，被裁剪盒切掉 —— 实测「视图选择器」下拉在 **3306/3306 档整块不可见**，
「解读选择」可见高只剩 0–6px。修法＝给三处 `Menu` 各加 `portal`（primitives 的类型注释原文就是用例：
「Use when an ancestor's overflow clipping would crop the in-place list」），**CSS 声明一个都没动**，
第一段「跨列重叠归零 / 顶栏单行」成果完整保留（四项门禁与修改前**逐档 0 差异**）。

那条被当作 bug 的深色长条是**浏览器原生 `title` 气泡**（§2，本段未改，按父代理指示一次只修一个）。

---

## 1. 你给的前提里，哪几处需要订正

按 `docs/agent/README.md` §5 第 4 条，开工先核前提。**三处需要订正，其中两处是父子两条消息里的**：

1. **【订正】「`contain: layout` 会让 `.fs-hbar` 成为 fixed 定位后代的包含块」—— 实测否证。**
   实测（`/tmp/containment.html`，headless Chrome，同一页里放两个对照盒）：
   - 盒子 A `container-type:inline-size;overflow:hidden`，rect `(58,60)-(458,108)`；盒内
     `position:fixed;left:100px;top:100px` 的子元素 rect = **`(100,100)-(220,220)`**（＝视口坐标，
     **没有**相对盒子偏移）；`elementFromPoint(160,160)`（在盒外、子元素内）**命中该 fixed 子元素**。
   - 盒子 B（只有 `overflow:hidden`、无 `container-type`）读数相同。
   ⇒ Chromium 下 `container-type:inline-size` 既不改变 fixed 后代的坐标基准、`overflow:hidden`
   **也不裁 fixed 后代**。所以「就地渲染被裁」的原因只有一条：`.mr-list` 是 `position:absolute`
   （包含块＝`.root`，在裁剪链内）。这条不是 bug 的另一半，**不要**写进台账。
2. **【订正】「既有测试里在 `.fs-hbar` 子树内查菜单项的断言会失效（预期失效）」—— 未发生。**
   spec 里的菜单查询全部是全局的（`document.querySelectorAll('.stub-menu-item')`、`byText`、
   `document.querySelector('.stub-menu')`），没有「限定在 `.fs-hbar` 子树内」的断言 ⇒ 586 例全绿，
   没有一例因 portal 而失效，也没有任何断言被削弱。反而是我**新增**了 4 例正向断言（§5）。
3. **【订正·我自己的推断】** 我一度判断「portal 后 `closeOnPointerLeave` 的指针 grace 会失效
   （面板移出锚点 DOM 子树 ⇒ 指针一进面板就等同离开锚点 ⇒ 200ms 后自关）」，并据此先删掉了两处
   `closeOnPointerLeave`。**实测否证**：React 的 enter/leave 合成按 **fiber 树**判定，portal 出去的
   面板在 React 树里**仍是锚点的后代** ⇒ 指针移进面板**不**触发锚点的 pointerleave。
   已**恢复**两处 `closeOnPointerLeave`，最终改动**零交互行为变化**。证据见 §4。

---

## 2. 怀疑点 3.1（原生 `title` 气泡）：成立，但**不是**本次要修的 bug

**成立**。证据链：

- 截图里那条长条的文字与 `src/shared/locale.ts:34` 的
  `a11yGen: '生成/重新生成：目录概览·文件摘要·源码注解·文章翻译'` **逐字相同**；
- 该串作为 `title` 挂在「解读选择」按钮上（`src/client/index.tsx` 的 `genAnchor`，`title={genBusy ? t('btnTrLoading') : t('a11yGen')}`）；
- 原生气泡的宽度/深色底/位置/层级**完全不受页面控制**，表现为按钮下方一条又宽又扁的深色条。

**本段未改**（一次只修一个 bug）。给出后续改法的可行性预判与坑，供下一段直接用：

- primitives 的 `Tooltip` 气泡是 **`position:fixed`**（`lib/Tooltip.module.css:1-3`）⇒ 按 §1 第 1 条的
  实测，**不落**任何 `overflow:hidden` 祖先的裁剪，坐标基准也不受 `container-type` 影响 ⇒ 换 Tooltip
  **可行且干净**（这条我原先也判错了，实测订正）。
- `Tooltip` 会 `cloneElement` 注入 `onMouseEnter/onMouseLeave/onFocus/onBlur`（`lib/index.js:4813-4830`），
  且**没有** portal 选项；它靠 `role="tooltip"` 的 span 内联渲染 + fixed 定位。
- 顶栏现在有**四种**气泡状态，统一时别漏：`genAnchor` / `wsAnchor` / `splitBtn` 有 `title` + `aria-label`；
  `foldBtn` / `refreshBtn` 只有 `title`（**没有 aria-label**，纯图标态下可访问名缺失）；`viewBtn` 只有
  `title`（有可见文字）；`edit` / `save` 只有 `aria-label`（无 `title`）。
- **反向风险**：「解读选择」按钮现在是 hover 即开 Menu（`onMouseEnter`），叠加 Tooltip 后
  悬停会同时出现气泡与下拉，需决定是否给这两个按钮关掉 Tooltip（`disabled` prop）或给 `delayMs` 留时差。

---

## 3. 怀疑点 3.2（下拉被 `overflow:hidden` 裁）：**成立**（本次唯一要修的 bug）

### 3.1 源码级证据（可 grep 复跑）

| 事实 | 出处 |
|---|---|
| `Menu` 的 `portal` **默认 false** | `node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js:1741`（`portal = false`）；类型 `lib/types/Menu.d.ts:77` |
| portal 分支把面板挂到 `document.body` | 同文件 `:1945`（`portal ? list !== false && createPortal(list, document.body) : list`） |
| 内联面板是**绝对定位在锚点下方 4px** | `lib/Menu.module.css:31`（`.list{position:absolute;top:calc(100% + 4px);left:0;z-index:100;min-width:218px;max-width:360px}`） |
| portal 模式是 fixed + `z-index:1100` | `lib/Menu.module.css:44`（`.portal`） |
| 两条裁剪声明 | `src/client/index.tsx:1347`（`.fs-hbar{…padding:6px 0;overflow:hidden;container-type:inline-size}`）、`:1355`（`.fs-hbar-mid{…overflow:hidden}`） |
| 本插件三处菜单**都没传** `portal`（修复前） | `src/client/index.tsx` 的 `genMenu` / `wsMenu` / 视图 `Menu` |

顶栏高度恒 48px，而菜单面板高 176–232px（探针读数）⇒ 内联面板垂直方向必然溢出裁剪盒。

### 3.2 jsdom 断言（新增，可复跑；阴性对照已验证）

`tests/client-view.spec.ts` 新增 `describe('dropdown layering: the toolbar clip box must not crop the panels (R1/R3)')`：

- 面板 `parentElement === document.body`；
- 面板 `closest('.fs-hbar') === null` **且** `closest('.fs-hbar-mid') === null`；
- 两处 `closeOnPointerLeave` 语义未变（桩渲染 `data-close-on-pointer-leave`）。

**阴性对照**：把 stub 里的 `createPortal` 去掉（`const placed = list`）⇒ 3 例立刻变红
（`141 tests | 3 failed`）；把 `genMenu` 的 `closeOnPointerLeave` 删掉 ⇒ 1 例变红。两次都已在验证后还原。

### 3.3 几何逐档数据（3857 档 = 7 场景 × 551 档）

菜单打开态判据 = probe.js 的同一套 `clipRect`（可见矩形 = 元素矩形 ∩ 所有 `overflow != visible`
祖先裁剪盒），由 `probe.js` 的**复制变体**注入复刻面板得到（见 §7 第 4 条）：

| 模式 | 面板 | 档数 | 被裁（部分+整块） | 整块不可见 | 最小可见高 | raw 高 | 中心不可命中 |
|---|---|---|---|---|---|---|---|
| **inline（修复前）** | 解读选择 | 3306 | **3306 [200–1200]** | 102 | **0.0** | 176 | 180 |
| | 视图选择器 | 3306 | **3306 [200–1200]** | **3306** | **0.0** | 176 | **3306** |
| | 工作区 | 3857 | **3857 [200–1200]** | 0 | **2.0** | 64 | 0 |
| **portal（修复后）** | 解读选择 | 3306 | **0** | 0 | 232 = raw | 232 | 0 |
| | 视图选择器 | 3306 | **0** | 0 | 176 = raw | 176 | 0（单独打开时） |
| | 工作区 | 3857 | **0** | 0 | 64 = raw | 64 | 0 |

- inline 模式的可见高集合只有 `{0, 6}`（解读选择）/ `{0}`（视图选择器）/ `{2}`（工作区）——
  这就是用户「鼠标放上去看不到下拉」的字面读数。
- portal 模式**三个面板在全部档位完整可见**；「三个菜单同时打开」时视图面板中心有 1546 档被
  另一个 portal 面板盖住（`--menu=view` 单独打开的同一扫描里该数为 **0**），是合成场景产物：
  真实使用同一时刻只开一个菜单（`--menu=` 为此专门加的选项）。

---

## 4. hover 收起语义：为什么最终**没有**改它

- 现象层面：`closeOnPointerLeave` 的 grace 挂在**锚点 root span** 上（`lib/index.js:1938-1945`），
  面板自身没有任何 pointer handler；`usePointerGrace` 是 200ms 定时器（`lib/index.js:1667-1687`）。
  单看这段代码，很容易得出「portal 后指针进面板 ⇒ 视为离开锚点 ⇒ 200ms 自关」。
- **实测**（`/tmp/portal-leave.mjs`，真实 `react-dom@18.3` + jsdom，两类事件族各跑两种模式）：

| 事件族 | 模式 | 面板父节点 | 指针移入**面板** | 指针移到 React 树**外的裸元素**（阳性对照） |
|---|---|---|---|---|
| pointer | portal | `document.body` | `anchorLeftOnPanelMove = **false**` | `true` |
| pointer | inline | anchor wrapper | `false` | `true` |
| mouse | portal | `document.body` | `false` | `true` |
| mouse | inline | anchor wrapper | `false` | `true` |

  ⇒ React 的 enter/leave **按 fiber 树**判定：portal 出去的面板在 React 树里仍是锚点的后代，
  **不**算离开；阳性对照证明装置本身能派发 leave（不是"装置坏了"）。因此两处
  `closeOnPointerLeave` 原样保留，**修复零行为变化**。

---

## 5. 改动逐处对照表

| # | 文件 : 位置 | 改动 | 为什么 |
|---|---|---|---|
| 1 | `src/client/index.tsx:1058` `genMenu` | `<Menu … **portal**>` + 5 行注释 | 面板被 `.fs-hbar{overflow:hidden}` 裁 |
| 2 | `src/client/index.tsx:1106` `wsMenu` | `<Menu … **portal**>` + 2 行注释 | 同上（点击式菜单，portal 无交互代价） |
| 3 | `src/client/index.tsx:1138` 视图选择器 | `<Menu … **portal**>` + 3 行注释 | 面板被 `.fs-hbar-mid{overflow:hidden}` **整块**裁 |
| 4 | `src/client/index.tsx:1347` 上方 | 新增 3 行 CSS 注释 | 写明「这条裁剪是兜底、浮层必须 portal，别改回内联」 |
| 5 | `tests/fixtures/primitives-stub.ts:99-125` | 桩复刻 `portal`（`createPortal(list, document.body)`）+ 渲染 `data-close-on-pointer-leave` | 让「面板逃出裁剪盒」与「hover 收起语义未变」都成为可断言事实 |
| 6 | `tests/client-view.spec.ts`（新 describe，+63 行） | 4 例：三个菜单各 1 例 + CSS 裁剪声明仍在 1 例 | 正向断言 + 防回退护栏 |

**没有改**：任何 CSS 声明值（`git diff` 里 CSS 数组只有注释）、JSX 结构与文案、locale、
`closeOnPointerLeave`、`anchor`/`items`/`onSelect`/`onClose`、`align`/`side`（保持默认 `start`/`bottom`）、
`getAnchorRect`（**不传**——见 §7 第 2 条）、`left`、host 面、文档。

---

## 6. 三条铁律的实测复核（与修改前逐档对比）

跑法：`node tools/ui-probe/probe.js --tag=fix-final --wsicon`（3857 档，`--wsicon` 必须带，否则工作区
按钮没有 `.fs-wslabel` 层，读数不可比；我第一次忘了带，跨列仍 0 但右列下界虚高到 533）。

| 铁律 | 要求 | 实测（修复后，最坏场景 S2/S6） | 与 `HEAD:src/client/index.tsx` 的对照 |
|---|---|---|---|
| 跨列可见重叠 | 0 档 | **0 档**（7 场景全 0） | **逐档逐字段 0 差异** |
| 同列可见重叠 | 0 档 | **0 档** | 同上 |
| 顶栏单行（高度集合） | 恒 `{48}` | **{48}** | 同上 |
| 右列被整块裁下界 | ≤ 360 | 最后被裁档 = **356** ⇒ 下界 **357**（余量 3px） | 同上 |

对照方法：`git show HEAD:src/client/index.tsx > /tmp/head-index.tsx`，再以
`--css=/tmp/head-index.tsx --tag=head-ws` 跑同一脚本；两份 JSON 3857 档 × 全字段 diff = **0**。

补充口径（不进任何门禁）：`partRight` 886 档、区间 **200–400**；与台账第三段 b 那条「保存按钮右边缘
残缺 499–534 归零」不是同一次读数（口径/窗口不同，我未复现那次），**但两版逐档 0 差异**才是本段要的结论。

---

## 7. 门禁（原始输出摘要）

`node scripts/verify-stage.mjs --allow src/client/index.tsx,tests/client-view.spec.ts,tests/fixtures/primitives-stub.ts`
（完整输出 `/tmp/verify-final.txt`，exit 0）：

```
=== 1. 改动范围守卫 ===
   M src/client/index.tsx / M tests/client-view.spec.ts / M tests/fixtures/primitives-stub.ts
   src/client/index.tsx | 21 +++++ / tests/client-view.spec.ts | 63 +++++ / tests/fixtures/primitives-stub.ts | 19 ++--
   3 files changed, 101 insertions(+), 2 deletions(-)
守卫结论：PASS — 没有超出授权面的改动。
[1/4] typecheck → PASS（exit 0，0.4s）      # tsc -b tsconfig.json，无输出
[2/4] lint      → PASS（exit 0，3.8s）      # Found 0 warnings and 0 errors. 48 files, 80 rules
[3/4] test      → PASS（exit 0，10.4s）     # Test Files 19 passed (19) / Tests 586 passed (586)
[4/4] coverage  → PASS（exit 0，12.7s）     # All files 100/100/100/100（lines 590/590、statements 745/745、
                                            #  functions 137/137、branches 509/509）+ 分母守卫 19/19
总判定：全绿。
```

（`test` 与 `coverage` 的逐项数字取自本人单独复跑：`npm test` = `19 passed / 586 passed`；
`npx vitest run --coverage --coverage.reportsDirectory=/tmp/cov-menu` 的 `coverage-summary.json`。
修复前为 582 例，本段 +4 例。）

---

## 8. 未核实项（诚实清单）

1. **无真实 GUI 端到端**。`http://127.0.0.1:3080` 需认证（早期实测 `curl` = 401），我无法登录；
   全部结论来自 headless Chrome 几何探针 + jsdom + 源码/类型阅读。
2. **`.mr` root span 与按钮 rect 是否逐像素等值未做浏览器实测**（依据 `inline-flex` shrink-to-fit 的
   CSS 语义判定「wrapper 就在 trigger 位置」）⇒「**不需要** `getAnchorRect`」是**代码级结论**，非实测。
   出处：`lib/index.js:1757`（portal 定位读 `rootRef.current?.getBoundingClientRect()`）、渲染处
   `children: [anchor, …]`（root span 只包锚点）。
3. **hover 语义的复现用的是等价组合件**（真实 `react-dom` + 手写 handler），**不是** primitives 的
   `Menu` 本体 —— 真实包在插件树内无法 `import`（`Cannot find package 'clsx'`，与
   `tests/fixtures/primitives-stub.ts` 头部注释一致）。残余不确定性：若用户实测发现菜单会自己关掉，
   复核点就是 `lib/index.js:1938-1945`（root span 的 pointerenter/leave）与 `:1667-1687`（200ms grace）。
4. **菜单打开态探针是复制变体，不在仓库工具里**：`/tmp/menu-probe/menu-probe.js`（由
   `/tmp/patch-menu-probe.py` 从 `tools/ui-probe/probe.js` 生成，只注入复刻面板 DOM、portal 定位与
   面板读数；`clipRect` 与汇总判据逐字未改）。**没有改 `tools/**`（不在授权面）**。
   要把它变成仓库判据，需给 `probe.js` 加 `--menus` / `--mode=inline|portal` / `--menu=` 选项 —— **请裁决**。
5. **面板几何是复刻**（`.mr-list` + Menu.module.css 的真实规则 + 与 locale 一致的项文案），
   不是真实组件的运行时 DOM（hash 类名、行高细节可能有出入）⇒ 面板**绝对高度**（64/176/232）仅供
   比较用；「被裁 / 不被裁」的结论不依赖它的绝对值。
6. **主题变量核实的是源码，不是运行时 DOM**：`packages/client/ui-theme/src/styles/design-platform.css`
   把 `--dsw-specific-menu` 定义在 **`body`**（第 156 行规则的 `:240`）与 **`body[data-ds-dark-theme]`**
   （第 249 行规则的 `:333`）⇒ portal 到 body 的面板仍是 `body` 的后代，**继承链更近**，不会掉色。
   旁证：宿主自身就有 3 处 `position:fixed` 浮层直接读同一批 token
   （`packages/client/ui-model-selection/lib/client.js:345`、`packages/client/ui-subagent/lib/client.js:12`、
   `packages/extensions/ui-cordis/lib/client.js:572`）。但我**没有**在真实页面里读 computed style 复核。
7. **`side` / `align` 未做实测切换**：判定「不需要 `align="end"`」的依据是 `lib/index.js:1759-1777`
   的视口 clamp（`MARGIN = 12`；`x = min(max(x, 12), vw - lw - 12)`）⇒ 面板不会被视口右边缘切掉；
   探针侧 1600×1000 视口下面板 0 档被裁与之一致。
8. **运行态仍是旧产物**：本段未 `npm run build`、未重启（授权否决）⇒ 页面上**暂时看不到修复**，
   需要 build + 重启 dsh web 才生效。
9. 跨运行非确定性（`tools/ui-probe/README.md` §4）依旧：本段引用的是「结构性指标」（0 档 / 下界 /
   高度集合）与「同条件两份 JSON 逐字段 diff」，没有拿 1–2 档差异当结论。

---

## 9. 待裁决

1. **是否给 `tools/ui-probe/probe.js` 加「菜单打开态」选项**（越权项）。我本轮用 `/tmp` 变体拿到
   逐档数据，但按 `tools/ui-probe/README.md` 的纪律，判据应固化进仓库工具，否则下次又要在 `/tmp`
   复活一份（该 README §6 与 `docs/agent/lessons.md` C-1 都记着这个教训）。
2. **3.1（`title` → primitives `Tooltip`）是否另起一段**。若做，需一并统一顶栏四种气泡状态
   （`foldBtn` / `refreshBtn` 目前连 `aria-label` 都没有），并决定「解读选择」悬停时 Tooltip 与
   下拉是否共存。
3. **报告归档位置**：本报告按任务书写在 `/tmp/dsh-bug-layer.md`，但 `docs/agent/README.md` §2 明确
   「任务报告、实测证据写 `docs/agent/reports/`，**不要写 `/tmp`**」，而本段授权面**否决**改 `docs/**`。
   两种规范冲突，请裁决（我未擅自建 `docs/` 文件）。同理，台账 `PROGRESS.md` 的「已知行为/残留」
   一节需要主代理补记本次修复，我不改台账。
4. **`closeOnPointerLeave` 的实测复核**（§8 第 3 条）：若用户 rebuild + 重启后实测「移到下拉上菜单
   仍会自己关」，请回传，我按 `lib/index.js:1938-1945` 复推并改为自实现指针判定。

---

## 10. 产物路径

| 内容 | 路径 |
|---|---|
| 本报告 | `/tmp/dsh-bug-layer.md` |
| 门禁完整输出 | `/tmp/verify-final.txt` |
| 几何探针（修复后 / HEAD 对照，各 3857 档） | `/tmp/menu-probe/out-fix-final.json`、`/tmp/menu-probe/out-head-ws.json`（对照用 HEAD 快照 `/tmp/head-index.tsx`） |
| 菜单打开态逐档（inline = 修复前 / portal = 修复后） | `/tmp/menu-probe/out-menu-inline-inline.json`、`/tmp/menu-probe/out-menu-portal-portal.json`、`/tmp/menu-probe/out-onlyview-inline.json`、`/tmp/menu-probe/out-onlyview-portal.json` |
| 菜单探针变体 + 生成器 | `/tmp/menu-probe/menu-probe.js`、`/tmp/patch-menu-probe.py`（可从仓库 `probe.js` 一键重生） |
| portal 祖先链的 jsdom 断言 | `tests/client-view.spec.ts`（新 describe，4 例） |
| hover 语义复现 | `/tmp/portal-leave.mjs`、运行结果 `/tmp/portal-leave-results.txt` |
| containment / fixed 裁剪实测 | `/tmp/containment.html` |
| 源码改动 | `src/client/index.tsx`、`tests/fixtures/primitives-stub.ts` |
