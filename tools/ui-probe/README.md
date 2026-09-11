# 几何探针（`tools/ui-probe/`）

回答一个问题：**顶栏（`.fs-hbar`）在哪些面板宽度上会把按钮裁掉或让两列叠在一起。**

做法是从 `src/client/index.tsx` 的 `const CSS = [...]` 逐字抠出样式，拼成一个静态 HTML（含
primitives 的真实 CSS module 规则 + 宿主壳层 CSS），在 headless Chrome 里把面板宽度从 1200 扫到
200，逐档读 `getBoundingClientRect` 与 `elementFromPoint`，把四项门禁读数打成表。

**脚本量的是工作树现状，不是 `client/client.js`**（见「前置条件」）。改完 CSS 不用 build 就能量。

---

## 1. 判据口径

这一节是口径的**正文**。`probe.js` 只是它的实现；两边改一处必须改另一处。四段 UI 改造期间所有
「0 档」「下界 356」的结论都是按这套口径读出来的，口径变了旧结论就作废。

### 1.1 可见矩形

对每个候选元素，先取它的**原始矩形** `raw = el.getBoundingClientRect()`，再取**可见矩形** `vis`：

```
vis = raw ∩ 每个 overflow != visible 的祖先的矩形（逐层求交，从近到远）
```

只算**祖先**的裁剪盒，不算兄弟、不算自身。任何一层 `overflow-x`/`overflow-y` 不是 `visible` 就参与
求交；求交结果为空时记成零矩形（`left=top=right=bottom=0`）。

为什么必须这样：`.fs-hbar` 自己带 `overflow:hidden`，右列溢出容器时元素的 `getBoundingClientRect`
**仍然是完整的**，只有算上祖先裁剪盒才看得见「它其实被切掉了」。直接读 `getBoundingClientRect`
会把最坏的那一档报成全绿。

### 1.2 四项门禁指标（只认这四项）

候选元素：`.fs-hbar-left` / `.fs-hbar-mid` / `.fs-hbar-right` 内的 `button`、`.fs-hd-path`、
`.fs-dirty`；被别的候选包住的元素会被剔除（只留最外层）。列归属按 `closest()` 判定，取 `L` / `M` / `R`。

| # | 指标 | 定义 | 门禁 |
|---|---|---|---|
| 1 | 跨列可见重叠 | 分属不同列的任意两个元素的 `vis` 相交面积 **> 0.5px²** ⇒ 该档记 1 次。另有一路「列盒子重叠」`colN`：三列的**原始矩形**两两相交 | 必须是 **0 档** |
| 2 | 同列可见重叠 | 同一列内任意两个元素的 `vis` 相交面积 > 0.5px² | 必须是 **0 档** |
| 3 | 被整块裁掉 | `raw` 有面积（>0）而 `vis` 面积 **≤ 0.5px²** ⇒ 整块不可见。另一路 `unclickN`：`vis` 面积 > 0.5 但 `elementFromPoint(vis 中心)` 命中的既不是它、也不与它互相包含 ⇒ 可见**但不可点** | 门禁看**第 4 项**；此项与 `unclickN` 用来定位成因 |
| 4 | 右列被整块裁 | 第 3 项里落在 `R` 列的那部分（`goneRightN`）。报的是「下界」——从 200 往右数，**右列第一次不再被整块裁**的面板宽度 | 下界 **≤ 360px**（第三段 b 末态实测 356，余量仅 4px） |

「下界」为什么取最坏场景：同一个 `probe` 跑 7 个场景，每个场景各有一条下界，报数时取**最坏那条**
（S2/S6 的长名长路径最吃亏）。只报 S1 会系统性地乐观。

### 1.3 补充口径：右列部分裁切（**不在门禁内**）

`raw` 有面积、`vis` 面积 > 0.5、但 `vis` 的宽**小于** `raw` 的宽减 0.5 ⇒ 记为「部分裁切」
（`partRightN`，只统计 `R` 列）。含义是「看得见、点得到，但显示不全」。

它是**另一项指标**，不参与任何 pass/fail 判定。之所以单独列出来，是因为**只看第 3 项会漏掉它**：
第三段 a 末态在面板 499–534 有 17–36 档「右列部分裁切」（S1/S4 各 19 档、S2/S6 各 36 档），
第 3 项在这些档上是 0。门禁不认它，但它是回归信号——谁把它从 0 变回非 0 就是真退步。

### 1.4 其余读数

- `hbarH`：`.fs-hbar` 的**原始**高度。**单行断言 = 全部档的高度集合恒为 `{48}`**。折行会让它成倍
  增长，所以这是「顶栏有没有偷偷折成多行」的机器判据（第二段的「三块各占一行」候选方案就是这么被否的）。
- `wsLabShown` / `genLabShown`：工作区名 label、右列按钮 label 的 `offsetWidth > 0`，用来标定
  两档容器查询的**切换点**（实测 578/579 与 788/789）。
- `wsBtnW`：工作区按钮宽度。名字可见但按钮没变宽，通常说明 `max-width` 在钳制。
- `hbarOverflowRight`：`hbar` 右界 − (`fs-wrap` 右界 − 14)，右列溢出了多少。
- `--dumpW=<面板宽>`：只对那一档输出**逐元素**的 `raw` / `vis` / `clickable` / `hitTag` 与列盒子坐标，
  用来做单档取证（`hitTag` 是被 `elementFromPoint` 实际命中的元素，判「不可点是被谁挡的」靠它）。

---

## 2. 跑法

```bash
# 最少一次（默认 7 场景，步长 10 / 1，约 1 分钟）
node tools/ui-probe/probe.js --tag=now

# 带 DOM 变体与追加 CSS：不动源码先标定阈值
node tools/ui-probe/probe.js --tag=var550 --wsicon --extra=/tmp/extra.css

# 分屏开启态
node tools/ui-probe/probe.js --tag=sp --splitpane

# 单档取证
node tools/ui-probe/probe.js --tag=d400 --dumpW=400
```

### 2.1 具名选项

| 选项 | 默认 | 作用 |
|---|---|---|
| `--tag=<名>` | `probe` | 产物文件名的一部分 |
| `--css=<tsx 文件>` | `<仓库根>/src/client/index.tsx` | 从哪个文件抠 CSS 数组（用来对比历史快照） |
| `--wsicon` | 关 | 工作区按钮文字**包进** `.fs-wslabel`（第三段 a 之后的真实形态） |
| `--splitpane` | 关 | body 里多一条分隔条 + 一份只读副本窗格（R4 分屏开启态） |
| `--extra=<css 文件>` | 无 | 追加一段 CSS（标定阈值用，不改源码） |
| `--only6` | 关 | 只跑 S0–S5，去掉 S6 |
| `--sn=<n>` | 1 | 窄段（700→200）步长 |
| `--sw=<n>` | 10 | 宽段（1200→701）步长 |
| `--dumpW=<宽>` | 0 | 只对给定宽度输出逐元素 dump |
| `--shell-css=<dir>` | 自动推导 | 壳层 CSS 目录 |
| `--outdir=<dir>` | `$TMPDIR/dsh-ui-probe` | DOM 与 JSON 的落盘目录 |
| `--chrome=<路径>` | `/usr/bin/google-chrome` | headless Chrome 可执行文件 |
| `--window=<W,H>` | `1600,1000` | Chrome 窗口尺寸。**必须是逗号分隔**（见 §2.2 第 2 条） |

### 2.2 三个坑（都踩过）

1. **位置参数被静默忽略**。参数解析只认 `--名` / `--名=值` 两种形态，别的字符串直接丢掉，**不报错**。
   `node probe.js now` 不会报错，只会用默认 `--tag=probe` 覆盖上一轮的产物，让人以为「跑了新变体、
   结果没变」。跑变体时**必须**写 `--tag=`，并且回看 stdout 里打印的 JSON 路径确认 tag 对不对。
2. **`--window-size` 必须够大，而且格式必须是 `W,H`**。窗口比元素窄时元素落在视口外，
   `elementFromPoint` 拿不到命中 ⇒ 第 3 项的 `unclickN` 出现**假红**。默认 `1600,1000` 是照最宽
   采样档 1200 留的余量；把 `--sn/--sw` 往高调、或把面板宽度加上去，就得同步调 `--window`。
   **格式坑（本仓实测）**：Chrome 的 `--window-size` **只认逗号**，写成 `1600x1000` 会被**静默忽略**
   并退回默认窗口——症状是面板 830–1200 档全体误报「不可点，`hitTag=NULL`」，而矩形、重叠、裁剪、
   顶栏高度这四类读数**完全正常**（它们不看视口）。脚本已把 `x`/`X`/`*` 归一成逗号，但自己传参时
   仍要记住这条：**只有 `unclickN` 一项集体变红时，先怀疑窗口尺寸**。
3. **`overflow` 判据用的是计算值，不是原始值**。`overflow-x` 与 `overflow-y` 只要有一个不是
   `visible` 就参与裁剪（CSS 的 `visible`+非 `visible` 组合会互相提级，这里的宽口径只会更严，不会漏）。

### 2.3 环境依赖

- **headless Chrome**：`/usr/bin/google-chrome`，用 `--headless=new --dump-dom` 出结果，不需要
  puppeteer/playwright，也不新增任何 npm 依赖。
- **壳层 CSS 变量**：来自 **DSH 检出的构建产物** `apps/web/dist/assets/*.css`（默认按
  `<仓库根>/../../../deepseekHARNESS/apps/web/dist/assets` 推导）。探针按文件名全量 `<link>` 进来，
  所以量出来的字号、行高、间距与浏览器里看到的一致。**宿主没 build 过就是空的**，这时四种指标的
  绝对值都不作数——`apps/web/dist/assets` 不存在时脚本会直接报错并提示，不会静默降级。
- **primitives**：`node_modules/@deepseek-ai/dsh-client-ui-primitives/lib` 下的 `Button.module.css` /
  `Menu.module.css` 被读进来，类名换成无 hash 前缀（`vp-*` / `mr-*`）。映射表是**白名单**，
  上游新增类名会 `throw`（宁可报错，不要悄悄少一条规则）。
- **`require`**：仓库根是 `"type": "module"`，本目录的 `package.json` 就地声明 `"type": "commonjs"`，
  探针才能用 `require` / `__dirname`。
- **lint 覆盖范围**：`.oxlintrc.json` 的 `ignorePatterns` 里**没有** `tools/**`，所以 `probe.js`
  会被 `npm run lint` 扫到，改它要保持 **0 错 0 警告**（`scripts/**` 相反被显式忽略）。
- **不进发布包**：根 `package.json` 的 `files` 不含 `tools/`，探针不随插件发布，纯开发工具。

---

## 3. 场景定义

`fs-hbar` 是三列网格（左：工作区按钮 + 两个图标按钮；中：视图选择器 / 路径；右：分栏 / 解读选择 /
未保存 / 编辑 / 保存）。七个场景覆盖三列的各种「内容最宽」组合：

| id | 工作区名 | 中列 | 右列 | 用途 |
|---|---|---|---|---|
| `S0-empty` | 中（`dsh-plugin-file-system-zc`） | 无 | 只有分屏按钮 | 最空形态；面板 200–209 有 10 档右列部分裁切（已知） |
| `S1-source` | 中 | 视图「源码」+ 中路径 | 解读选择 + 未保存 + 编辑 + 保存 | 主力场景 |
| `S2-trlong` | **长** | 视图「文章翻译」+ 长路径 | 重新翻译 + 未保存 + 编辑 + 保存 | 最坏场景之一，下界通常由它决定 |
| `S3-dir` | 中 | 视图「目录概览」+ 中路径 | 只有解读选择 | 右列最简，用来对照 |
| `S4-trbusy` | 中 | 视图「源码」+ 长路径 | 翻译中…（**禁用态**）+ 未保存 + 编辑 + 保存 | 禁用按钮的几何与可点判定 |
| `S5-short` | 短（`dsh-fs`） | 视图「源码」+ 短路径 | 解读选择 + 编辑 + 保存 | 其它维度的最短组合 |
| `S6-wsxlong` | **超长**（89 字符） | 同 S2 | 同 S2 | 补实测：超长名不会进一步抬高下界（`max-width:220px` 钳制） |

- 路径三档：`src/index.tsx`（短）/ `dsh-plugin-file-system-zc/src/client/index.tsx`（中）/
  `deepseekHARNESS/packages/client/ui-primitives/src/components/very/deep/nested/folder/with-a-really-long-file-name.module.tsx`（长）。
- **S6 的名称长度按实测记：`String.length === 89`**。第三段 a 报告与派单书写「79 字符」，与实测
  不符（差 10），此处按实测值记；两个数的口径差异未核实（不排除当时只数了前半段）。
- `--wsicon` 决定工作区按钮的文字是否包进 `.fs-wslabel` 层。第三段 a 之前的源码**没有**这一层，
  用当前源码跑历史对照时必须知道这一点，否则探针会比真实更容易通过。
- 视图选择器的文字是**裸文本**（源码就是这么写的，没有 label 层），探针必须保持一致。

---

## 4. 前置条件与局限

- **量的是工作树现状，不是运行中的产物**：CSS 从 `src/client/index.tsx` 的 `const CSS = [...]`
  里逐字解析（`].join('\n')` 之前的那一段，每个元素一条单引号字符串字面量）。改了源码不 build，
  探针立刻能看到新样式；反过来，**它看不到 `client/client.js` 里的旧样式**。要对照「运行中是什么样」，
  得用 `--css=<历史快照>` 指过去（例：`/tmp/stage3/stage2-end.tsx`）。
- CSS 数组的边界是字符串匹配（`const CSS = [` 与 `].join('\\n')`）。改这两个锚点会让探针报错，
  这是有意的——静默抠到半截比报错糟。
- 探针是**静态 DOM 复刻**，不是渲染真组件：它不跑 React、不跑 locale、不跑状态机。几何受 DOM 结构
  与类名影响，源码改了结构（比如按钮换层）必须同步改 `scenario()`，否则量的是另一个东西。
- 绝对像素端点会随**字体渲染**小幅浮动（本机 Linux Chrome）。所以阈值一律按约 **8% 余量**取整
  （672 / 470→550 / 760 三处同一口径），换字体族必须复测切换点。
- **跨运行有可测的非确定性**：同一份 CSS、同一个脚本、同一台机器，两次运行之间也会有个位数的档
  对不上。实测标定（`--wsicon` 全扫 3857 档 × 14 个字段）：原版脚本「历史那次 vs 现在这次」有
  **60 处**字段差异（`genLabShown` 48、`goneN` / `goneMidN` / `partRightN` 各 4），全部落在档界附近。
  **推论**：判回归看**结构性指标**（「0 档」「下界」「顶栏高集合」），不要拿单次运行里 1–2 档的差异
  当回归；真要坐实某个差异，同条件复跑两次再下结论。
- 本脚本已按上面这条做过等价性验证：仓库版与 `/tmp` 原版在**同一次环境**里跑，14 个字段 × 3857 档
  **完全一致**（0 差异）。

---

## 5. 产物

都在 `--outdir`（默认 `$TMPDIR/dsh-ui-probe/`）下，**不进仓库**：

- `probe-<tag>.html`：拼好的静态页，约 30KB。可以直接用浏览器打开、改窗口宽度肉眼对照。
- `out-<tag>.json`：逐档读数，单份 **约 1MB**（7 场景 × 几百档）。这就是「可复跑的产物文件」，
  台账与报告里的数字要引用它，不要引用转述。

stdout 上打两张表：逐场景汇总（档数 / 跨列 / 同列 / 被裁 / 右列被裁 / 顶栏高集合）与合计。

---

## 6. 溯源与差异

本脚本收自 `/tmp/stage3b/gen4.js`（第三段 B 末态，md5 `0efe8d8c8f61d80724f13b2fdadfa555`）。
判据实现（`clipRect` / 面积求交 / 四项汇总）**逐字未改**，只改了环境耦合处：

| 处 | 原版 | 本版 | 为什么 |
|---|---|---|---|
| 仓库根 | 硬编码绝对路径 | `path.resolve(__dirname, '..', '..')` | 换机 / 换检出位置 |
| 壳层 CSS 目录 | 硬编码 | 按布局推导 + `--shell-css` 覆盖 | 同上 |
| 输出目录 | 硬编码 `/tmp/stage3/` | `--outdir`，默认 `$TMPDIR/dsh-ui-probe` | 别把运行产物写进别人的工作目录 |
| Chrome / 窗口 | 硬编码 | `--chrome` / `--window` | 换环境 |
| 依赖缺失 | 裸 ENOENT | 前置校验 + 中文提示 | 报错要能指导下一步 |
| 头部注释 | 面向当段任务 | 面向可复用（指向本 README） | 口径的正文只有一份 |

`/tmp` 下的旧版（`gen.js` / `gen3.js` / `gen4.js`）不再维护。**新的几何问题一律改这里**，
别再往 `/tmp` 复制一份新的——第三段期间同一脚本被从头复活过三次，就是为了这个教训。
