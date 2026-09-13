> 归档自 `/tmp/dsh-ui-stage1.md`，归档于 2026-09-11 23:35:31（原样保留，未改写；本行由归档动作添加）。

# UI 改造第一段（R3 视图选择器 / R1 解读选择 / 文件树 Tag）交付报告

- 插件：`dsh-plugin-file-system`（工作目录 `/home/xuepeng/DSH/DSHworkPace/plugins/dsh-plugin-file-system`）
- 基线提交：`d5a852f`（工作树干净起步）
- 规格：`docs/spec-ui-revamp.md`（R3 / R1 与「其它」三项；不做 R2/R4）
- 收尾状态：`npm run typecheck` / `npm run lint` / `npm test` / 覆盖率门禁全绿；改动只落在 5 个声明过的文件，未 `git add`/`commit`，未跑 `npm run build`。

---

## 0. 三项是否做到

| 项 | 状态 | 一句话 |
|---|---|---|
| R3 视图标签合并为「视图选择器」 | 做到 | 一排 `Pill` 换成「单按钮（文字=当前视图名）+ 悬停下拉（其余已具备视图，固定顺序）」，默认视图改源码优先，点击主体为真 no-op |
| R1 顶栏生成入口收编为「解读选择」 | 做到 | `btnGen` 值改「解读选择」；md 分支由恒 `[]` 改为翻译项（`GenKind` 新增 `'translate'`，`runGen` 分派到既有 `runTranslate`）；独立 `trBtn` 删除 |
| 文件树扩展名标签换官方组件 | 做到 | `<span className="fs-badge">` → `<Tag tone="quiet" className="fs-exttag">`，`.fs-badge` 选择器删除，`Tag` 已补测试桩 |

---

## 1. 改动逐处前后对照

### 1.1 `src/shared/locale.ts`

| 键 | 前 | 后 |
|---|---|---|
| `a11yGen` | `生成/重新生成：目录概览·文件摘要·源码注解` | `生成/重新生成：目录概览·文件摘要·源码注解·文章翻译` |
| `a11yViewPick` | （无） | `视图选择：悬停展开其它视图`（新增） |
| `a11yTrLoading` | `翻译中…` | **删除**（原 trBtn 的 title，按钮没了即成死键） |
| `a11yTrRegen` | `重新翻译（覆盖已有译文）` | **删除**（同上） |
| `a11yTrNew` | `翻译为中文（特殊名词用 ( ) 内解释）` | **删除**（同上） |
| `btnGen` | `生成解读` | `解读选择` |
| `btnTr` / `btnTrRegen` / `btnTrLoading` | 值不变 | 值不变，仅加一行注释说明「现在由解读选择菜单项复用」（键序未动） |
| `folderCardDesc2` | `点击右上角「生成解读」…` | `点击右上角「解读选择」…`（跟随按钮改名，否则界面自相矛盾） |

键数：**117 → 115**（+1 新增，−3 删除；无值重复键，`btnTrLoading` 与已删的 `a11yTrLoading` 原本就是同值异键）。

`t('btnTr')` / `t('btnTrRegen')` / `t('btnTrLoading')` 三项复用而非另立 `genTr*` 键，理由是 locale 既有约定「逐字同文的串共用一个键（不建同值多键）」，且这三项的值恰好就是菜单项该显示的文字。

### 1.2 `src/client/index.tsx`（逐处）

**(a) import（约 13–18 行）**
```diff
-  IconPlusOutline16, IconRefreshOutline16, MarkdownText, Menu, Pill,
+  IconPlusOutline16, IconRefreshOutline16, MarkdownText, Menu, Tag,
```
`Pill` 不再使用（`noUnusedLocals` 要求删），`Tag` 来自 primitives（已核对 `lib/types/index.d.ts:11` 有 `export { Tag }`）。

**(b) `GenKind` 与新增 `GenItem`（约 89 行）**
```diff
-/** 生成解读的三种文档类型：folder=目录概览(L1) / file=文件摘要(L2) / src=源码注解(L3)。 */
-type GenKind = 'folder' | 'file' | 'src'
+/** 解读选择菜单的四类入口：folder=目录概览(L1) / file=文件摘要(L2) / src=源码注解(L3)
+ *  / translate=文章翻译（R1 收编：与前三者共用菜单，但走 host 的 `/translate` 路由，
+ *  不写 L2/L3 文档，故 `runGen` 在入口处分派到 `runTranslate`）。 */
+type GenKind = 'folder' | 'file' | 'src' | 'translate'
+
+/** 解读选择菜单的一项；`disabled` 由翻译进行中（trBusy）置位，拒绝重复触发。 */
+interface GenItem {
+  id: GenKind
+  label: string
+  disabled?: boolean
+}
```

> 核实结论（任务书要求自行核实的三条线索）：
> 1. `GenKind` **原本不含** `'translate'`（原文即上一行 diff 的 `'folder' | 'file' | 'src'`）；本段按任务书 R1.1 的授权把它扩到四项，**没有动任何 host 代码**。
> 2. `runGen` 原本**只认 `/gen-doc`**（`api('/gen-doc', jsonPost({ kind, path }))`），`/translate` 由既有的 `runTranslate` 走（`api('/translate', jsonPost({ path: opened.path }))`）。因此 `runGen('translate')` 实现为**入口处分派**，不重写调度。
> 3. `Menu` 的 `MenuItem` **支持 `disabled`**（`lib/types/Menu.d.ts` 的 `MenuItem.disabled?: boolean`，且注释写明 "not called for disabled rows"）。

**(c) `modes` 推入顺序（约 494 行）**
```diff
+  // 视图固定顺序（R3）：源码 → 文件摘要 → 源码注解 → 文章翻译。数组只用于渲染
+  // （视图选择器的下拉按此序排列，当前项除外），不再是默认视图的判据。
   const modes: ViewMode[] = []
+  if (hasSource) modes.push('source')
   if (opened.hasDoc || docData != null) modes.push('doc')
   if (opened.hasDocSrc || annotData != null) modes.push('annot')
   if (canTranslate && (opened.hasDocTr || trData != null)) modes.push('tr')
-  if (hasSource) modes.push('source')
```

**(d) 默认视图 + 与代码不符的注释（约 507 行）**
```diff
-    // 点击文件优先显示顺序：文件摘要 → 原文(源码) → 源码注解。有文件摘要默认进 doc；否则默认原文。
-    setMode(opened.hasDoc ? 'doc' : (hasSource ? 'source' : (opened.hasDocSrc ? 'annot' : 'source')))
+    // 点击文件后的默认视图：源码优先（R3）——有源码可看就进源码（预览/编辑）；
+    // 无源码（目录节点）时沿用原有的「目录概览 → 源码注解」回退顺序，最终兜底落在 `doc`
+    // 而不是 `source`：目录永远没有源码，而占位卡讲的正是「还没生成的目录概览」，
+    // 按钮上写「源码」会与画面分离（R3.2 要求按钮文字恒等于当前显示的视图名）。
+    setMode(hasSource ? 'source' : (opened.hasDoc ? 'doc' : (opened.hasDocSrc ? 'annot' : 'doc')))
```
> 兜底值由 `'source'` 改成 `'doc'` 是本段唯一超出规格字面的自主决定（规格只说"保持现状的 doc/annot 回退"）。理由见 §4 分歧点 4。

**(e) `runGen` 分派翻译（约 585 行）**
```diff
-  /**
-   * 统一生成入口：kind ∈ folder(目录概览/L1) | file(文件摘要/L2) | src(源码注解/L3)。
-   * POST /gen-doc 触发后台子 agent → 轮询任务 → 成功后按 task.docRel 经 /read 读回文档，
-   * 落到对应查看状态（folder→fold、file→docData+doc 模式、src→annotData+annot 模式）。
-   * @param kind - 要生成的文档类型。
-   */
+  /**
+   * 统一解读入口（R1 收编）：kind ∈ folder(目录概览/L1) | file(文件摘要/L2) | src(源码注解/L3)
+   * | translate(文章翻译)。前三者 POST /gen-doc 触发后台子 agent → 轮询任务 → 成功后按
+   * task.docRel 经 /read 读回文档，落到对应查看状态（folder→fold、file→docData+doc 模式、
+   * src→annotData+annot 模式）；translate 不产出 L2/L3 文档，与前三者不是同一套调度，
+   * 因此在入口处直接分派给 {@link runTranslate}（host 侧独立路由 `/translate`）。
+   * @param kind - 要生成的文档类型，或 `translate`（文章翻译）。
+   */
   function runGen(kind: GenKind): void {
+    // 翻译：沿用原独立按钮的调度与状态（trBusy / trData / tr 模式），不写 L2/L3。
+    if (kind === 'translate') { runTranslate(); return }
     if (!opened.path) return
```
（TS 收窄后，后续 `else setGenState(kind)` 的 `kind` 仍是 `'file' | 'src'`，类型检查通过。）

**(f) 文件树角标（约 396 行）**
```diff
-        {extBadge(node.name) ? <span className="fs-badge">{extBadge(node.name)}</span> : null}
+        {/* 扩展名角标改用官方 Tag（tone=quiet：纯文字无底色，最接近原 .fs-badge 的观感）。
+            className 只保留布局用的 flex:none，不再自带字号/底色/圆角（原样式已删除）。 */}
+        {extBadge(node.name) ? <Tag tone="quiet" className="fs-exttag">{extBadge(node.name)}</Tag> : null}
```

**(g) `genItems`（约 952–978 行）**
```diff
-  // 整合生成下拉：当前对象可生成的文档类型（未生成→生成；已生成→重新生成，覆盖重写）。
+  // 解读选择下拉（R1）：当前对象可用的解读入口（未生成→生成；已生成→重新生成，覆盖重写）。
   const [genMenuOpen, setGenMenuOpen] = React.useState(false)
-  const isSelFile = !!(opened && opened.type !== 'directory')
-  const isSelMd = isSelFile && isMd(extOf(opened.path || ''))
-  const genItems = React.useMemo<{ id: GenKind; label: string }[]>(() => {
+  const genItems = React.useMemo<GenItem[]>(() => {
     if (!opened) return []
+    // 目录节点：只有「目录概览」一种解读产物。
     if (opened.type === 'directory')
       return [{ id: 'folder', label: opened.hasDoc ? t('genFolderRegen') : t('genFolder') }]
-    if (isSelMd) return []
-    const items: { id: GenKind; label: string }[] = [
+    // markdown 本身即文档：不生成 L2/L3（host 侧直接拒绝）。只有项目内非书库的 md 可翻译，
+    // 书库内（.book/）md 没有任何解读入口 —— 菜单项为空，按钮与现状一样不弹菜单。
+    if (isMd(extOf(opened.path || ''))) {
+      if (!viewer.canTranslate) return []
+      // 翻译进行中改读「翻译中…」并禁用，等价于原独立按钮的 disabled 态。
+      return [{
+        id: 'translate',
+        label: viewer.trBusy ? t('btnTrLoading') : (opened.hasDocTr ? t('btnTrRegen') : t('btnTr')),
+        disabled: viewer.trBusy,
+      }]
+    }
+    const items: GenItem[] = [
       { id: 'file', label: opened.hasDoc ? t('genFileRegen') : t('genFile') },
     ]
     items.push({ id: 'src', label: opened.hasDocSrc ? t('genSrcRegen') : t('genSrc') })
     return items
-  }, [opened, isSelMd])
+  }, [opened, viewer.canTranslate, viewer.trBusy])
+  // 菜单项随当前对象自动适配（R1）：切到「没有解读入口」的对象时收起残留的下拉，
+  // 否则上一份文件留下的空菜单会挂在新文件上（md 与 .book/ 内的 md 都会走到这里）。
+  React.useEffect(() => {
+    if (!genItems.length) setGenMenuOpen(false)
+  }, [genItems])
```

**(h) 视图选择器（约 1047–1080 行，整块替换原 `tabs`）**
```diff
-  const tabs = opened
-    ? (
-      <div className="fs-tabs">
-        {viewer.modes.map(m => (
-          <Pill
-            key={m}
-            active={viewer.mode === m}
-            onClick={() => { viewer.setMode(m); viewer.setEditMode(false) }}
-          >
-            {t(labLabelKey(m, opened.type === 'directory'))}
-          </Pill>
-        ))}
-      </div>
-    )
-    : null
+  // 视图选择器（R3）：单个按钮 + 悬停下拉，取代原来一排 Pill。
+  // 按钮文字恒等于当前视图名（`labLabelKey(viewer.mode)`），与所显示内容不分离；点击按钮主体
+  // 即确认按钮所示视图 —— `setMode` 传同一个 mode，React 同值 bail out，是真正的 no-op
+  // （用户明确要求：不伴随 `setEditMode(false)`，否则「点击」就成了会改变显示的操作）。
+  // 下拉只列「其余已具备」的视图，顺序沿用 viewer.modes 的固定顺序：
+  // 源码 → 文件摘要 → 源码注解 → 文章翻译。
+  const viewIsDir = !!(opened && opened.type === 'directory')
+  const viewItems = viewer.modes
+    .filter(m => m !== viewer.mode)
+    .map(m => ({ id: m, label: t(labLabelKey(m, viewIsDir)) }))
+  const viewWrap = opened
+    ? (
+      <div className="fs-viewwrap" onMouseEnter={() => { if (viewItems.length) setViewMenuOpen(true) }}>
+        <Menu
+          open={viewMenuOpen}
+          anchor={(
+            <Button
+              className="fs-viewbtn"
+              size="sm"
+              onClick={() => viewer.setMode(viewer.mode)}
+              title={t('a11yViewPick')}
+            >
+              {t(labLabelKey(viewer.mode, viewIsDir))}
+            </Button>
+          )}
+          items={viewItems}
+          closeOnPointerLeave
+          // 选下拉项：切换视图并退出编辑态（沿用原 Pill 的行为）。
+          onSelect={(m) => { viewer.setMode(m as ViewMode); viewer.setEditMode(false); setViewMenuOpen(false) }}
+          onClose={() => setViewMenuOpen(false)}
+        />
+      </div>
+    )
+    : null
```
外加 `const [viewMenuOpen, setViewMenuOpen] = React.useState(false)`（约 951 行）。悬停交互完全复用既有 `genWrap` 模式（`onMouseEnter` + `closeOnPointerLeave`），`Menu` 的 `align` 未指定（沿用默认 `start`）。

**(i) `trBtn` 删除与 hbar 引用**
```diff
-  const trBtn = (opened && viewer.canTranslate)
-    ? (<Button size="sm" onClick={() => viewer.runTranslate()} disabled={viewer.trBusy}
-        title={viewer.trBusy ? t('a11yTrLoading') : (opened.hasDocTr ? t('a11yTrRegen') : t('a11yTrNew'))}>
-        {viewer.trBusy ? t('btnTrLoading') : (opened.hasDocTr ? t('btnTrRegen') : t('btnTr'))}</Button>)
-    : null
```
```diff
       <div className="fs-hbar-mid">
-        <div className="fs-tabs">{tabs}</div>
+        {viewWrap}
         <div className="fs-hbar-path">{pathLabel}</div>
       </div>
-      <div className="fs-hbar-right">{trBtn}{genWrap}{editActions}</div>
+      {/* 翻译入口（R1）已并入「解读选择」菜单：这里原来是独立翻译按钮 trBtn 的位置。 */}
+      <div className="fs-hbar-right">{genWrap}{editActions}</div>
```
`viewer.runTranslate` 仍在 `ViewerState` 上导出并被 `runGen('translate')` 调用，未成为死代码。

**(j) CSS 常量**
```diff
-  '.fs-tabs{flex:none;display:flex;align-items:center;gap:4px}',
+  （删除）
+  '.fs-viewwrap{display:inline-flex;align-items:center;min-width:0;flex:none}',   // 紧随 .fs-genwrap
-  '.fs-badge{flex:none;font-size:10px;line-height:16px;background:...;border-radius:4px;padding:0 5px;color:...}',
+  // 扩展名角标改用官方 Tag（tone=quiet：纯文字无底色）；这里只留布局用的 flex:none，
+  // 字号/行高/底色/圆角一律交给 primitives（原 .fs-badge 全部样式已删除）。
+  '.fs-exttag{flex:none}',
```
两处删除前均已 grep 确认无其它 JSX 引用（`fs-tabs` 仅 hbar 一处、`fs-badge` 仅 renderFileRow 一处）。CSS 头部注释同步补记了这两处删除与新增，并把「防 tab 组画到右列」改成「防视图选择器画到右列」。

### 1.3 `tests/fixtures/primitives-stub.ts`

- 新增 `Tag` 桩：`createElement('span', { className: 'stub-tag ' + props.className, 'data-tone': props.tone }, children)`（`data-tone` 让 spec 能断言 tone 而不断言真实标记）。
- **删除 `Pill` 桩**：client 不再消费它，而该文件的自述是「keep exactly the surface `src/client/index.tsx` consumes」。
- `StubMenuItem` 增加 `disabled?: boolean`，渲染时透传到 button 的 `disabled`，并在 `onClick` 里 `if (!item.disabled && props.onSelect)`——真实 Menu 的契约是「disabled 行不触发 onSelect」。
- 文件头注释同步（`active`/`disabled` → `disabled`；`tabs` → `view switching`）。

### 1.4 `tests/locale.spec.ts`

- `EXPECTED_ZH`：删 `a11yTrLoading`/`a11yTrRegen`/`a11yTrNew` 三行、加 `a11yViewPick`、改 `a11yGen`/`btnGen`/`folderCardDesc2` 三个值、加一行 `btnTr` 分组注释（**键序未动**）。
- 三重硬断言：`toHaveLength(117)` → `toHaveLength(115)`，测试名同步为「全量 115 键…」。
- 头部注释补记本段的键变动（新增/删除/改写各是什么）。

### 1.5 `tests/client-view.spec.ts`（失效断言清单与改法）

新增 6 个 helper（`viewBtn` / `viewIs` / `openViewMenu` / `menuLabels` / `viewItems` / `pickView` / `translateVia` / `entryDisabled`，均以 locale key 为参数），随后逐条改：

| # | 原断言（失效原因） | 改法 |
|---|---|---|
| 1 | `.fs-tabs` 子元素为 0（空态） | `.fs-viewwrap` 为 `null`（视图选择器只在有打开对象时渲染） |
| 2 | `.fs-badge` 文本 `MD/TS/PY` | `.stub-tag` 文本 + `data-tone === 'quiet'`；测试名改为「…with tags and doc markers」 |
| 3 | 打开 README.md 后 `labDocFile` 胶囊 active、胶囊数组 `[doc, tr, src]` | 默认 `viewIs('labSrc')`；下拉 `viewItems() === [labDocFile, labTr]`；测试名改「in source mode」 |
| 4 | `labSrc` 胶囊 active（plain.py） | `viewIs('labSrc')` + 下拉为空 |
| 5 | 点 `labAnnot` / `labSrc` 胶囊 | `pickView('labAnnot')` / `pickView('labSrc')` |
| 6 | 书库内 md 无「翻译」按钮 | 书库内 md 的解读菜单**不弹**（`.stub-menu` 为 `null`）；测试名改为「offers no interpretation entry…」 |
| 7 | 3 处 `click(button('重新翻译'))` 等共 13 处 | `translateVia('btnTrRegen')`（开「解读选择」→ 点翻译项） |
| 8 | 4 处 `expect(byText('button', '重新翻译')).toBeTruthy()`（断言 busy 已清） | `expect(await entryDisabled('btnTrRegen')).toBe(false)`（菜单项回到可用态） |
| 9 | busy 时按 `btnTrLoading` 文案找 disabled 按钮 | 打开菜单，`byText('.stub-menu-item', '翻译中…')` 的 `disabled === true`，点击后不产生第二次 `/translate` |
| 10 | md 无生成入口（`.stub-menu` 为 null） | 项目内 md 的菜单**恰为** `['重新翻译']`（README.md 已译） |
| 11 | 4 处 `labDocFile`/`labAnnot`/`labTr` 胶囊 active | `viewIs(...)` |
| 12 | 目录（annot-only）胶囊数组 `[labAnnot]` | `viewIs('labAnnot')` + 下拉为空（只此一个视图） |
| 13 | `labTr` 胶囊 + 切走再切回后 `labTr` 仍在 | `viewIs('labTr')` + `pickView('labSrc')` 后 `viewItems()` 仍含 `labTr` |
| 14 | 3 处 `labAnnot`/`labTr`/`labDocFile` 胶囊切换 | `pickView(...)` |
| 15 | 无翻译的 md 按钮 title 为 `a11yTrNew`（键已删） | 打开菜单，项恰为 `['翻译']` |
| 16 | Makefile 无 `.fs-badge` | 无 `.stub-tag` |
| 17 | hover 不弹生成菜单（用 README.md —— 现在有翻译项，不再成立） | 改用 `.book/` 内 md（`note.md`），这是唯一剩下的空菜单场景；测试名改「interpretation menu」 |
| 18 | 「renders an empty markdown document / frontmatter-only」默认进 doc | 显式 `pickView('labDocFile')`（默认已改源码优先） |
| 19 | 「renders frontmatter rows…」默认进 doc | 同上，显式 `pickView('labDocFile')` |
| 20 | 2 处测试名含 tab → view | 名称与注释一并更新（`annot tab` → `annot view` 等） |

**本段新增的 7 个用例**（新 `describe('view selector and interpretation menu (R1/R3)')` 6 个 + 目录兜底 1 个）：

1. `pins the interpretation menu to the four object kinds` —— 目录 `['目录概览']`、普通文件 `['生成文件摘要','生成源码注解']`、项目内 md `['翻译']`、`.book/` 内 md 菜单不弹（四类全覆盖，且断言顺序）。
2. `opens a file on its source and mirrors the view name on the button` —— full.md（doc+annot+tr 全有）默认 `viewIs('labSrc')`，下拉 `[文件摘要, 源码注解, 文章翻译]`；`pickView('labAnnot')` 后按钮变「源码注解」、下拉回到 `[源码, 文件摘要, 文章翻译]`（同时验证固定顺序与"按钮随视图变化"）。
3. `keeps the summary-first fallback for a node that has no source` —— `src` 目录（无 source）按钮为「目录概览」、下拉为空。
4. `names the placeholder card 「目录概览」 for a directory with nothing generated` —— `plain` 目录：占位卡在 + 按钮不是「源码」（本段新增的兜底修正的回归护栏）。
5. `treats a click on the selector body as a no-op` —— 先进编辑态，点按钮主体后：仍是源码视图、`.fs-area`（textarea）仍在、无 dirty、请求数不变（**证明点击既不改视图也不退编辑态**）。
6. `leaves edit mode when a view is picked from the dropdown` —— 对比项：下拉选项**会**退编辑态（沿用原 Pill 行为）。
7. `offers the view dropdown on hover and keeps it to the ready views` —— app.ts（仅 annot）下拉 `[源码注解]`；README.md（doc+tr）下拉 `[文件摘要, 文章翻译]`。

---

## 2. 原始命令输出（收尾一次全跑）

```
$ npm run typecheck
> tsc -b tsconfig.json
（无输出，退出 0）

$ npm run lint
> oxlint . --config .oxlintrc.json
Found 0 warnings and 0 errors.
Finished in 4.1s on 47 files with 80 rules using 8 threads.

$ npm test
 ✓ tests/locale.spec.ts (20 tests) 37ms
 ✓ tests/client-view.spec.ts (125 tests) 6725ms
 Test Files  19 passed (19)
      Tests  571 passed (571)
   Duration  10.37s
（基线 19 spec / 564 例 → 现 19 spec / 571 例，+7 个新用例）

$ npx vitest run --coverage --coverage.reportOnFailure=true --coverage.reportsDirectory=/tmp/dsh-cov-stage1
 shared            |     100 |      100 |      100 |      100 |
  locale.ts        |     100 |      100 |      100 |      100 |
（其余 src 文件同样 100；覆盖率达门禁，退出 0）

$ node scripts/verify-coverage-scope.mjs --reports-dir /tmp/dsh-cov-stage1
  应当进分母：19 个文件
  实际进分母：19 个文件
✓ 分母完整：19 个源文件全部进入覆盖率统计，与 vitest.config.ts 一致。

$ git status --short && git diff --stat
 M src/client/index.tsx
 M src/shared/locale.ts
 M tests/client-view.spec.ts
 M tests/fixtures/primitives-stub.ts
 M tests/locale.spec.ts
 src/client/index.tsx              | 150 ++++++++++------
 src/shared/locale.ts              |  12 +-
 tests/client-view.spec.ts         | 351 +++++++++++++++++++++++++++++---------
 tests/fixtures/primitives-stub.ts |  40 +++--
 tests/locale.spec.ts              |  19 ++-
 5 files changed, 413 insertions(+), 159 deletions(-)
```
覆盖率按仓库约定用 `--coverage.reportsDirectory=/tmp/dsh-cov-stage1` 隔离（未污染工作树的 `coverage/`）。`src/client/index.tsx` 仍在 `vitest.config.ts` 的 `coverage.exclude`（D-13）内；本段**未新建任何源文件**，因此没有新的 per-file 100% 门禁进入者。

---

## 3. locale 键清单（本段）

**新增 1 个**

| 键 | 值 | 用处 |
|---|---|---|
| `a11yViewPick` | `视图选择：悬停展开其它视图` | 视图选择器按钮的 `title`（按钮文字是视图名，title 只解释交互） |

**删除 3 个**：`a11yTrNew`、`a11yTrRegen`、`a11yTrLoading`（全部只服务已删除的独立翻译按钮）。

**改值 3 个**：`btnGen`、`a11yGen`、`folderCardDesc2`。

**改注释 1 处**：`btnTr` 三项加「翻译（R1：原独立翻译按钮并入「解读选择」菜单，这三项现在由菜单项复用）」。

**键数：117 → 115。**

---

## 4. 需要裁决的分歧点

1. **规格 §1 表格与本段实现不一致（md 菜单项）**：`docs/spec-ui-revamp.md:23` 写「项目内非 `.book/` 的 md——在文件节点基础上追加 **翻译**」，即 md 应同时有「文件摘要/源码注解/翻译」三项。但 host 对 md 的 L2/L3 请求直接拒绝（`ZH.errGenMd = 'markdown 文档不需要生成文件层文档/源码注解'`），列出来只会产出错误。任务书 ③ R1.4 的表述是「项目内非 `.book/` 的 md → 翻译」。**我按任务书实现（md 只有翻译项）**，请确认是否要把规格 §1 表格那行也更正。
2. **翻译进行中不再有常驻可见状态**：独立按钮删掉后，`trBusy` 只在「解读选择」菜单里可见（该项读「翻译中…」且 `disabled`）。菜单关着时，用户看不出后台在翻译——这是「去掉独立按钮」的直接代价。要不要再加一处常驻提示（例如把 `Tag` 放到顶栏、或改 `genAnchor` 的 title）？本段未自行添加。
3. **点击按钮主体在"源码+编辑态"下毫无视觉反馈**：按用户要求实现为真 no-op（`setMode(同值)`，**不** `setEditMode(false)`），因此正在编辑时点按钮，画面不会有任何变化，可能被误读成按钮失灵。我按原样实现，认为这条要求本身自洽（「点什么就是选择看什么」），但请确认这是期望的行为。
4. **目录兜底值 `'source'` → `'doc'`（本段唯一的自主修正）**：目录节点永远 `hasSource === false`，原默认值在「目录既无概览也无注解」时落到 `'source'`，而 `modes` 里根本没有 `source`——旧的胶囊组在这种情况下不显示任何 active 项，新的单按钮却会把「源码」写在按钮上、画面却是「创建本目录的目录概览」占位卡，直接违反 R3.2。改成 `'doc'` 后按钮与画面一致（占位卡讲的就是目录概览）。如你更想保留 `'source'` 字面，请示意，我可以改成"按钮在没有可用视图时不渲染"。
5. **顺带做的两处非规格改动**：① `folderCardDesc2` 里的「生成解读」跟随按钮改名（否则界面自相矛盾）；② 新增「菜单项为空时收起 `genMenuOpen`」的 `useEffect`，否则从有入口的文件切到 md/`.book/` md 时，上一份文件留下的空菜单会挂在新文件上。两处都可回退。

---

## 5. 未核实项

1. **GUI 手工验收未做**：规格 §4.3 的清单（四类节点菜单项、窄宽度几何、视图选择器、分屏）需要 `npm run build` + 重启 `dsh web`，而硬约束禁止本段构建（产物由上游统一构建）。所以"真实 primitives 渲染下的观感与几何"**未实测**。
2. **真实 `Tag` / `Menu` 的运行时行为只做了类型层核对**：`Tag` 接受 `tone`/`className`、`MenuItem` 有 `disabled`、`Button` 接受 `className`/`title`，均来自 `node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/types/*.d.ts`；插件 spec 里跑的是 `tests/fixtures/primitives-stub.ts` 替身，**没有**在真实包下渲染验证过 `Tag tone="quiet"` 的实际尺寸，也没有验证真实 `Menu` 的 `closeOnPointerLeave` 在本结构下与 `genWrap` 完全同行为（沿用既有模式，未改动）。
3. **文件树角标的 flex 表现**：`.fs-exttag{flex:none}` 只保证不被压缩，真实 `Tag` 的内边距/字号是否让 34px 行高内的排版与旧 `.fs-badge` 相当，需 GUI 确认。
4. `docs/spec-ui-revamp.md` 与 `PROGRESS.md` **未更新**（硬约束只允许改 `src/client/index.tsx`、`src/shared/locale.ts`、`tests/**`）；规格状态的记账留给上游。
