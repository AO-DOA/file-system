# 顶栏气泡方向 / 文案缩短 / 术语统一「分栏」/ 悬停延迟 — 实施报告

> 日期：2026-09-12（实测 00:46–00:55）
> 仓库：`/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system-zc`，基线 HEAD `cb9a5cd`（工作树干净）
> 状态：**四件事全部落地，均在工作树、未提交**（用户约束：不许 `git add/commit`；未 build；未重启 `dsh web`）
> 任务书原文（授权记录）：`<WS>/agent/sessions/session-927b055f-e595-44c2-aacb-d2de7145c227/briefs/2026-09-12-tooltip-side-and-term-unify.md`

**用户原话**：「这个解释位置挡住按钮了，解释可以缩短，分屏与分栏统一术语分栏」，
随后追加第四条：「解释气泡等几秒再显示，不要直接显示」。

---

## 1. 总结

| # | 事项 | 落点 | 结果 |
|---|---|---|---|
| 1 | 气泡方向往上弹（`side="top"`） | `src/client/index.tsx` 的 `tip()` + 常量 `TIP_SIDE` | 顶栏 5 处气泡统一往上；**可按调用点覆盖** |
| 2 | 文案缩短 | `src/shared/locale.ts` 的 `a11ySplit` | 29 字 → **9 字**；气泡实测 **391px → 131px 宽**（−66%） |
| 3 | 术语统一「分屏」→「分栏」 | 8 个文件 | 改前 73 处；保留 5 处**刻意的历史引用** |
| 4 | 悬停延迟 1 秒 | 同 `tip()` + 常量 `TIP_DELAY_MS` | primitives 默认 **0ms**；键序 focus 立即显示**未受影响** |

四件事全部收口在 `tip()` 一个函数里：调用点只传文案，方向与延迟集中在这两个常量。

---

## 2. 逐条说明

### 2.1 气泡方向：往上弹（`side="top"`）

**改法**：`tip(btn, label, key?, side = TIP_SIDE)`，`TIP_SIDE = 'top'`。方向是**参数**，个别调用点要换方向不必改常量。

**「挡住按钮」的真实机制 —— 与任务书背景里那句不符，此处订正**：

任务书写「右侧空间不足时它翻到下方，于是压住了顶栏下面的正文」。我读了
`packages/client/ui-primitives/src/Tooltip.tsx` 的 `fit()`：**`side === 'right'` 时它 `return`，永不垂直翻面**。
垂直翻转只发生在请求方向是 `bottom` / `top` 时（`fitsBelow` / `fitsAbove` 那一对）。

右侧放不下时它做的是**水平夹回**：

```js
if (r.right > window.innerWidth - EDGE_MARGIN) dx = window.innerWidth - EDGE_MARGIN - r.right
if (r.left + dx < EDGE_MARGIN) dx = EDGE_MARGIN - r.left
```

对**靠右的锚点**（顶栏右列的分栏 / 编辑按钮就在那儿），夹回后的气泡会横跨到锚点**上方** —— 这才是截图里
「解释挡住按钮」。所以 `top` 的收益不是「换个方向压别处」，而是**从源头绕开这条夹回路径**。

**最小几何复现**（脚本 `/tmp/ttside/side-check-v6.mjs`，**不进仓库**）：

- 锚点几何取自探针真实 DOM（`/tmp/dsh-ui-probe/probe-probe.html`）；气泡样式用**真实的**
  `Tooltip.module.css`，宽高由真实文案量出；定位与夹回/翻转判据**逐行照抄** `Tooltip.tsx` 的 `show()` / `fit()`。
- 布局按真实 GUI 的最坏情形设：面板宽 1200、**右缘贴视口右缘**（插件面板填满会话区），视口 1600×913。
- 结果（节选）：

| 气泡（按钮） | 文案 | 请求方向 | 最终 placement | 气泡宽×高 | 气泡横向区间 | 压住锚点 |
|---|---|---|---|---|---|---|
| 分栏 | **旧 29 字** | `right` | right | 391×26 | `[1197, 1588]` | **1664.4 px²（锚点 1792.4 的 93%）** |
| 分栏 | **旧 29 字** | `top` | bottom（翻） | 391×26 | `[1125.8, 1516.8]` | **0** |
| 分栏 | **新 9 字** | `right` | right | 131×26 | `[1363.3, 1494.3]` | **0**（缩短本身已够） |
| 分栏 | 新 9 字 | `top` | bottom（翻） | 131×26 | `[1255.8, 1386.8]` | **0** |
| 保存（最右） | 2 字 | `right` | right | 40×26 | `[1548, 1588]` | **780.4 px²** |
| 保存（最右） | 2 字 | `top` | bottom（翻） | 40×26 | `[1520, 1560]` | **0** |

⇒ 两个独立结论：**① 缩短文案本身就消掉了「挡按钮」**（391px 那是主因）；**② `top` 在任何文案长度下都不压按钮**。

**`top` 的成立条件（几何事实）**：气泡高 26px，`fit()` 判据是 `pos.top - 8 - h >= 12`
⇒ 锚点上方需要 **≥ 46px**（= 26 + 8 + 12）。

**未解的部分**：探针页面把 `.fs-wrap` 直接摆在页面顶部（锚点 `top` 只有 6–20px），
所以**在探针页面里 `top` 全部翻成了 `bottom`**（上表已如实记录）。真实 GUI 里插件面板位于 DSH 的
会话页签行之下，顶栏上方空间远不止 46px 才合理 —— 但**这是推断，本轮没能实测**（见 §7 第 1 条）。
若实测发现不足 46px（气泡翻到按钮下方、压正文），改 `TIP_SIDE` **一个常量**即可。

**为什么选 46px 这个方向而不是别的**：顶栏下方紧挨着用户正在读的正文/内容区，顶栏上方是 DSH 自己的
页签栏；被短暂遮住的代价小得多。宿主两种方向都有先例（`TrajectoryTable.tsx:2579` 与
`TrajectoryTimeline.tsx:216` 用 `right`，`TrajectoryTimeline.tsx:700` 用 `bottom`），所以按「不压正文、
也不压按钮」这个目标定，而不是跟惯例。

### 2.2 文案缩短

**只改了一处**：`a11ySplit`。另外四处气泡文案本来就是「功能名 + 0 句限定」，已符合口径。

| 按钮 | 气泡取值（旧） | 气泡取值（新） | 字数 | 气泡宽度 | 理由 |
|---|---|---|---|---|---|
| 分栏 `splitBtn` | `分屏：把当前显示的视图复制一份只读副本到右侧；再点一次关闭` | **`分栏：右侧只读副本`** | 29 → **9** | **391 → 131px** | 唯一一条整句说明；它把气泡撑成压在按钮上的长条。保留「右侧」与「只读副本」两个从按钮名推不出的信息 |
| 折叠/展开 `foldBtn` | `折叠文件树` / `展开文件树` | **不变** | 5 | 79px | 已是功能名；它随状态翻转，正是气泡该干的事 |
| 刷新 `refreshBtn` | `刷新` | **不变** | 2 | 40px | 已经最短 |
| 编辑/保存 `editActions` | `编辑` / `保存` | **不变** | 2 | 40px | 已是按钮自身的名字 |
| 工作区 `wsAnchor` | 完整工作区名（动态） | **不变** | 2–89 | 最大 717.6px | **它是数据不是文案**：工作区名被 `.fs-wsbtn{max-width:220px}` 截断，气泡的作用正是补全它；缩短等于把信息删掉 |

**气泡文案与 `aria-label` 的取值关系**（两者可以相同、可以不同，这里**有意分成两类**）：

| 按钮 | `aria-label` | 气泡 | 关系 | 为什么 |
|---|---|---|---|---|
| 折叠/展开 | `a11yExpandTree` / `a11yCollapseTree` | 同左 | **相同** | 气泡要说的就是「按下去会发生什么」，而 `aria-label` 已经是这句话 |
| 刷新 | `a11yRefresh` | 同左 | **相同** | 同上 |
| 编辑/保存 | `btnEdit` / `btnSave` | 同左 | **相同** | 同上 |
| 工作区 | `curWsName`（动态） | 同左 | **相同** | 同上 |
| 分栏 | `btnSplit`「分栏」 | `a11ySplit`「分栏：右侧只读副本」 | **不同（气泡更长）** | ① **`aria-label` 不能改成气泡那串**：按钮的可见文字是「分栏」，可访问名必须包含可见文字（WCAG 2.5.3 Label in Name），窄档下用户读到「分栏」时点下去才对得上；② 而「右侧只读副本」这个限定是气泡该补的信息 —— 悬停是主动手势，值得多给一句，读屏用户不需要每次都被念一遍整句 |

**没有改 `aria-label`**（任务书要求）：`aria-label` 的四个取值与气泡同源，所以文案缩短只在分栏这一处发生；
其余按钮的可访问名一个字没动。**测试里 `L('a11ySplit')` 的断言不变**（断言取的是字典值，不是字面量）。

### 2.3 术语统一「分屏」→「分栏」

**范围**：面向用户与开发者的**中文表述**。英文标识符一律未动
（`SplitGlyph` / `splitState` / `splitOn` / `splitViewer` / `splitGrow` / `splitPane` / `splitParts` /
`btnSplit` / `a11ySplit` / `.fs-splitpane` / `.fs-split` / `--splitpane` / `toggleSplit` / `splitBar` —— `split` 本身中性）。

**替换清单**（改前 / 改后按**整文件出现次数**统计，脚本：

```bash
git show HEAD:<file> | grep -o 分屏 | wc -l   # 改前
grep -o 分屏 <file> | wc -l                   # 改后
```

）：

| 文件 | 改前「分屏」 | 改后「分屏」 | 改前「分栏」 | 改后「分栏」 | 说明 |
|---|---|---|---|---|---|
| `src/client/index.tsx` | 14 | **0** | 5 | 19 | 全部是注释（字形、`SplitState`、开关键、按钮、拖拽、样式说明） |
| `src/shared/locale.ts` | 2 | 1 | 2 | 7 | 值 1 处 + 注释 1 处改；保留的 1 处是「此前的『分屏』写法一律废止」这句术语变更说明 |
| `tests/client-view.spec.ts` | 11 | **0** | 3 | 14 | 全部是注释/测试说明；无断言字面量含该词 |
| `tests/locale.spec.ts` | 3 | 1 | 3 | 8 | 对照表值 + 注释改；保留的 1 处是术语变更说明 |
| `docs/spec-ui-revamp.md` | 23 | 2 | 5 | 30 | 含 R4 标题、§2 例外、§6 决策记录表、§7 实现记录；**只换词、未动任何需求语义**（档位数字、裁决内容、理由逐字未变）。保留的 2 处是文件头新增的「术语更新」标注里刻意引用的旧词 |
| `PROGRESS.md` | 14 | 3 | 1 | 20 | 当期条目与历史段全量替换（数字与结论零改动）；保留的 3 处是用户原话引用、前后对照表、术语变更说明 |
| `tools/ui-probe/README.md` | 5 | **0** | 1 | 6 | `--splitpane` 说明、复刻对照、已知残留表 |
| `tools/ui-probe/probe.js` | 1 | **0** | 1 | 2 | `--splitpane` 的注释 |
| **合计** | **73** | **7** | 21 | 106 | 保留的 7 处全部是刻意的历史/变更引用 |

**关于 `docs/spec-ui-revamp.md` 里「引用历史决策原话」的处理**：我逐条核过，该文件里**没有带引号直接引用
含「分屏」的用户原话**；§6「决策记录」是转述的技术裁决（内容列写的是「复制 DSH `SplitGlyph` 的 SVG 路径进插件」
这类事实，不是引语）。因此按「只换词、不改语义」全量替换，并在**文件头部**（标题下状态块）加了一条**术语更新标注**，
写明「只换词、未改动需求语义」以及历史报告保留原词。如果要求的是「§6 保留原词」，那是可回退的一步改动 —— 请裁决。

### 2.4 悬停延迟（第四条追加要求）

**primitives 的默认值：`0`**。源码 `packages/client/ui-primitives/src/Tooltip.tsx:33` 的形参是
`delayMs = 0`（`lib/types/Tooltip.d.ts` 只声明了它可选，不给默认值），并且：

```js
const showAfterHoverDelay = () => {
  cancelShow()
  if (delayMs <= 0) { show(); return }        // ← 默认走这一支：hover 即弹
  showTimer.current = setTimeout(() => { showTimer.current = null; show() }, delayMs)
}
```

**我设成 `TIP_DELAY_MS = 1000`**，理由：

1. 用户要的是「等几秒再显示，不要直接显示」——比 DSH 惯例的 500ms（宿主测试里 `<Tooltip delayMs={500}>`）
   更「沉」一档才符合这个描述；
2. 但不该真等「几秒」：2s 以上会让真想看提示的人等得不耐烦，且顶栏气泡的信息量本来就只有几个字；
3. 1s 足够让「指针扫过顶栏」这类动作不弹气泡（人的横向扫动通常 <300ms/按钮），又短于「读一句提示的耐心」。

**键盘 focus 未被延迟**（这是无障碍要求，已核源码）：`onFocus` 走的是 `cancelShow(); show()`，
**绕过计时器**直接显示；`delayMs` 只作用于 `onMouseEnter`。所以 Tab 到按钮时气泡立即出现，行为与改前一致。

**「嫌快/嫌慢只需改哪一处」**：`src/client/index.tsx` 的 `const TIP_DELAY_MS = 1000`（唯一调节点，
`tip()` 里统一 `delayMs={TIP_DELAY_MS}`，调用点不散写）。配套的钉板断言在
`tests/client-view.spec.ts` 里断言 `props.delayMs === 1000` —— 调那个常量会**故意**让这一行变红，
因为气泡节奏是用户直接感知的行为，改动应当被复审。

**验证方式与边界**：`tests/fixtures/primitives-stub.ts` 不转发 `delayMs`（它只把 `label` / `side` / `disabled`
发布成 DOM 属性），且该 fixture **不在本次授权面内**。所以我在 `tests/client-view.spec.ts` 的
`vi.mock` 工厂外面包了一层薄记录（`vi.hoisted` 的 `tooltipProps`，包装而非改 fixture），
断言「每个渲染出的 `Tooltip` 收到的 `side === 'top'` 且 `delayMs === 1000`」。
**它验证的是装配关系，不是真实计时器行为**（jsdom 无布局、无指针）；真实时序由 `Tooltip.tsx` 的源码佐证。

---

## 3. 门禁数字

`node scripts/verify-stage.mjs --allow src/client/index.tsx,src/shared/locale.ts,tests/,docs/spec-ui-revamp.md,PROGRESS.md,tools/ui-probe/`

| 项 | 结论 | 耗时 | exit | 摘要 |
|---|---|---|---|---|
| 改动范围守卫 | **PASS** | — | — | **9 项全在授权面内**（8 项改动 + 本报告），无其它越界 |
| typecheck | **PASS** | 0.3s | 0 | `tsc` 无输出（首跑 6.6s，最终跑命中增量缓存） |
| lint | **PASS** | 3.6s | 0 | 0 错 0 警告 |
| test | **PASS** | 9.8s | 0 | **19 spec / 595 例全绿**（改动前 594；本次新增 1 例：方向 + 延迟的装配断言。`client-view.spec.ts` 的 `it(` 计数 149 → 150，与之一致） |
| coverage | **PASS** | 12.7s | 0 | 分母守卫通过 |

**总判定：全绿**（最终一次完整输出：`/tmp/ttside/gate-final.log`）。

改动面（`git diff --stat`，未提交）：

```
 PROGRESS.md               | 49 +++++++++++++++++++++++++++++++------
 docs/spec-ui-revamp.md    | 42 ++++++++++++++++++-------------
 src/client/index.tsx      | 58 ++++++++++++++++++++++++++++-----------
 src/shared/locale.ts      | 14 +++++++---
 tests/client-view.spec.ts | 69 ++++++++++++++++++++++++++++++++++++++---------
 tests/locale.spec.ts      | 11 +++++---
 tools/ui-probe/README.md  | 10 +++----
 tools/ui-probe/probe.js   |  2 +-
 8 files changed, 186 insertions(+), 69 deletions(-)
```

**关于白名单的一处不一致（如实说明）**：任务书 §4 给出的白名单
（`src/client/index.tsx,src/shared/locale.ts,tests/,docs/spec-ui-revamp.md,PROGRESS.md,tools/ui-probe/`）
**不含任务书 §5 要求写的那份报告**。照原样跑，守卫报
`FAIL — 1 项越界：?? docs/agent/reports/2026-09-12-tooltip-side-and-term-unify.md`（实测，完整输出 `/tmp/ttside/gate-asbriefed.log`），
**唯一越界项就是报告自己**。我按 §3「报告写 `docs/agent/reports/2026-09-12-tooltip-side-and-term-unify.md`」
这条明确授权把它加进白名单后复跑 ⇒ 全 PASS。**没有其它越界项**（`git status --porcelain` 共 9 项，其余 8 项逐字命中白名单）。

### 3.1 几何不受影响（气泡是浮层，不该改变布局）

`node tools/ui-probe/probe.js --wsicon`（3857 档，7 场景）：

| 场景 | 档数 | 跨列重叠 | 同列重叠 | 被裁 | 右列被裁 | 顶栏高 |
|---|---|---|---|---|---|---|
| S0-empty | 551 | 0 | 0 | 0 | 0 | 48 |
| S1-source | 551 | 0 | 0 | 151 [200–350] | 107 [200–306] | 48 |
| S2-trlong | 551 | 0 | 0 | 151 [200–350] | 107 [200–306] | 48 |
| S3-dir | 551 | 0 | 0 | 53 [200–252] | 17 [200–216] | 48 |
| S4-trbusy | 551 | 0 | 0 | 151 [200–350] | 107 [200–306] | 48 |
| S5-short | 551 | 0 | 0 | 103 [200–302] | 59 [200–258] | 48 |
| S6-wsxlong | 551 | 0 | 0 | 151 [200–350] | 107 [200–306] | 48 |
| **合计** | 3857 | **0** | **0** | **760** | **504**（区间 200–**306**） | **{48}** |

与上一段实测（`760 / 504 / 306`）**逐字段一致** ⇒ 本轮零布局影响。产物：`/tmp/dsh-ui-probe/out-probe.json`。

---

## 4. grep 自查：「分屏」还剩哪些

`grep -rn "分屏" . --exclude-dir=node_modules --exclude-dir=coverage --exclude-dir=.git` ⇒ **67 处**，分类如下：

| 文件 | 处数 | 处置 | 为什么保留 |
|---|---|---|---|
| `docs/agent/reports/*`（5 份旧归档） | 41 | **保留** | 归档报告（协议：删旧条＝抹掉审计线索）：stage3b 32、collapse-split-edit-merge 5、probe-dom-sync 2、stage3a 1、stage1 1 |
| `docs/agent/reports/2026-09-12-tooltip-side-and-term-unify.md` | 14 | **保留（本报告）** | 本报告通篇在讲「哪个词换成了哪个词」，必然要引用旧词 |
| `client/client.js` | 3 | **保留（本轮无权改）** | **未重构建的运行时产物**（未 build）。GUI 现在跑的就是它 ⇒ 页面上的文案与方向**仍是旧的** |
| `PROGRESS.md` | 3 | **刻意保留** | 用户原话引用 1 + 文案前后对照 1 + 术语变更说明 1 |
| `docs/spec-ui-revamp.md` | 2 | **刻意保留** | 文件头新增的「术语更新」标注里引用的旧词 |
| `src/shared/locale.ts` | 1 | **刻意保留** | 「此前的『分屏』写法一律废止」这句说明本身 |
| `tests/locale.spec.ts` | 1 | **刻意保留** | 术语变更说明 |
| `lib/shared/locale.js` | 1 | **保留（产物）** | `lib/` 是 `.gitignore` 的构建产物目录，被 `npm run typecheck` 编译覆盖；留下的那 1 处是上一条说明的编译结果 |
| `docs/agent/lessons.md` | 1 | **未改（不在授权面）** | `lessons.md:57` 是经验卡正文里的一句历史结论（「R4 分屏按钮给右列 +42px」）。§3 未把它列进可改清单，故**停手不动**；若要求统一，请把它加进授权面 |
| **合计** | **67** | | 41 处旧归档 + 14 处本报告 + 3 处产物 + 7 处刻意保留 + 1 处越界未改 + 1 处产物副产 |

**结论**：源代码（`src/`）里只剩 `locale.ts` 那 1 处**刻意**的术语变更说明；测试、探针、规格、台账里的旧词
一律只剩「我在说明这次换了什么词」这一类引用。**没有任何一处是漏改的**。

---

## 5. 改动文件一览（全部在授权面内）

| 文件 | 改了什么 |
|---|---|
| `src/client/index.tsx` | 新增常量 `TIP_DELAY_MS` / `TIP_SIDE`；`tip()` 加 `side` 形参与 `delayMs`；`import type { TooltipSide }`；13 处中文注释术语替换 |
| `src/shared/locale.ts` | `a11ySplit` 值 29 字 → 9 字；注释改写 + 术语说明 |
| `tests/client-view.spec.ts` | `vi.mock` 工厂改为包装 stub 并记录 `Tooltip` props；新增 1 例（方向 + 延迟装配断言）；11 处注释术语替换 |
| `tests/locale.spec.ts` | `EXPECTED_ZH.a11ySplit` 同步新值（三重硬断言的口径不变：键序、`toHaveLength(117)`、全等表）；注释术语替换 |
| `docs/spec-ui-revamp.md` | 23 处术语替换 + 头部新增一条术语更新标注（只换词，未改语义） |
| `PROGRESS.md` | 新增当期条目（§3 末尾，含实测数字与未核实）；14 处术语替换 |
| `tools/ui-probe/README.md` | 5 处术语替换 |
| `tools/ui-probe/probe.js` | 1 处术语替换 |

**未新增任何源码文件**（授权约束）；**未碰 `src/host/**`**；**未碰 `docs/agent/reports/**`**；无任何 git 写操作。

---

## 6. 取证脚本（一次性，均不进仓库）

| 脚本 | 作用 |
|---|---|
| `/tmp/ttside/side-check-v6.mjs` | §2.1 的几何复现（面板贴视口右缘，最坏情形）。输出锚点/气泡 rect、最终 placement、压住锚点的相交面积 |
| `/tmp/ttside/side-check-v3.mjs` | 同判据，但保持探针原布局（面板贴左、窄档）——用来说明「探针页面里 `top` 会翻成 `bottom`」是布局产物 |
| `/tmp/ttside/gate.log` | 门禁完整输出 |
| `/tmp/ttside/probe-after.log` | 探针完整输出 |
| `/tmp/dsh-ui-probe/out-probe.json` | 探针产物（3857 档） |

复跑：`node /tmp/ttside/side-check-v6.mjs`（需先有 `/tmp/dsh-ui-probe/probe-probe.html`）。

---

## 7. 未核实清单（**逐条如实**）

1. **真实 GUI 里顶栏上方有没有 46px** —— **没实测**。本轮未 build、未重启 `dsh web`（用户约束）；
   `client/client.js` 仍是旧产物，页面上看不到本轮任何改动。
   已确认的事实只有两条：① `top` 的成立条件是「锚点上方 ≥ 46px」（几何）；② 探针页面（面板贴顶）里它会翻成
   `bottom`。真实 GUI 的顶栏位于会话页签行下方，我**推断**上方空间充足，但**没有测量**。
   ⇒ 这是本次最需要用户验收的一项：鼠标悬停顶栏按钮 1 秒，看气泡出现在**上方**（符合预期）还是**下方/盖住按钮**（需改 `TIP_SIDE`）。
2. **悬停延迟的真实计时** —— 只钉住了「传给 `Tooltip` 的 props `delayMs === 1000`」，
   没有跑真实计时器（jsdom 无布局、无指针、无真实 hover）。`Tooltip.tsx` 的 `setTimeout` 分支是**引用源码**，
   不是本次运行结果。
3. **`top` 下气泡会不会短暂遮住 DSH 自己的页签栏** —— 未实测。几何上会（气泡在按钮上方 8px 处，
   而按钮就在顶栏里，顶栏上方紧邻页签栏），这正是选 `top` 时**接受**的代价；但「遮多久、遮多少」没量。
4. **`docs/spec-ui-revamp.md` §6 决策记录表的术语处理** —— 我判定该表是转述而非原话引用，故全量替换 + 加标注。
   若上游要求「§6 保留原词」，这是一步可回退改动，**请裁决**。
5. **`docs/agent/lessons.md:57` 的 1 处「分屏」未改** —— 它不在 §3 的授权面内，我没有越权改。
6. **`client/client.js` 3 处旧文案** —— 由构建产生，本轮不许 build，故保留。**这不影响本轮验收**：
   产物重建后自然同步（`lib/` 已被 typecheck 覆盖成新文案，可作旁证）。
7. **`tip()` 的 `side` 覆盖能力没有实际用例** —— 5 个调用点都用缺省 `top`。它只是「不写死」的保证，
   没有测试覆盖「传了别的方向会怎样」（stub 的 `data-side` 能观测，但当前没有这样的调用点可测）。
8. **本轮新增的那 1 条测试用例是「装配断言」而非行为断言** —— 见 §2.4 末段。它挡的是「有人删掉 `delayMs` /
   把方向改回去」，不证明气泡在浏览器里的样子。
