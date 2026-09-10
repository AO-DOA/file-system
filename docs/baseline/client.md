---
来源: ../dsh-plugin-file-system
迁移源 revision: 3a3f89e
清点日期: 2026-09-11
清点者: 子B（client 基线）
状态: 已验收
报告口径: 行号以 3a3f89e 工作树为准
---

# Client 侧功能清点基线

已完成只读清点（未修改任何文件，未跑 build）。以下为基线清单。

> **行数校正**：`src/client/index.js` 实测 **771 行**（任务书写的"约 854 行"与当前工作树不符，可能基于旧版本）；`src/client/md-utils.js` 83 行；`src/shared/locale.js` 100 行。下文行号均以当前工作树为准。

---

# A. 槽位注册（Slot Registration）

| 项 | 值 | 位置 |
|---|---|---|
| 槽 id（slot key） | `conversation.view`（对话页签行，kind: `list`，scope: `session`） | `src/client/index.js:766` |
| entry id | `fs` | `src/client/index.js:767` |
| order（排序） | `12` | `src/client/index.js:768` |
| label | 函数 `() => t('slotLabel')`（惰性取值，非字符串常量） | `src/client/index.js:769` |
| 注册调用 | `slots.inject('conversation.view', () => slots.register({...}, props => React.createElement(FsView, ...)))` | `src/client/index.js:765-770` |
| 渲染入口 | 匿名渲染函数，`Object.assign({}, props, { workspaces: ctx.get('workspaces'), picker: ctx.get('remote.directoryPicker') })` | `src/client/index.js:770` |
| 插件标识导出 | `export const name = 'fs'`（注释声明运行值由 guardedSurface 覆盖，勿依赖） | `src/client/index.js:21` |
| 注入声明（硬依赖） | `export const inject = ['slots']` | `src/client/index.js:22` |
| 运行时兜底 | `slots === undefined` 时 `throw new Error('slots service missing — client cannot register conversation.view')` | `src/client/index.js:756-757` |

**卸载 / 清理（disposer）**
1. 样式：`ctx.effect(() => { 创建 <style data-plugin="fs"> 追加到 head; return () => tag.remove() }, 'fs styles')` —— 显式 disposer。`src/client/index.js:758-764`。
2. 槽位注册：**无显式 disposer**，靠 Cordis effect 生命周期：`slots.inject(key, cb)` 本身处于 `ctx.effect(...)` 中，且每次"声明生命周期"内又以 `ctx.effect(callback, 'slots.inject(...): declaration')` 嵌套注册；声明折叠（owner 卸载/收起）即释放 effect，再次声明会重跑 callback；插件 fiber 卸载会取消等待并移除贡献。依据：`deepseekHARNESS/docs/subsystems/slots.zh.md:17`、`deepseekHARNESS/packages/client/ui-renderer/src/client/registry.ts:172-234`（关键行 `:174`、`:205`、`:224`、`:231-233`）；`slots.register` 同样是 effect 包裹：`registry.ts:607-612`。
3. 定时器：`pollTask` 的 `setTimeout`（`src/client/index.js:270`、`:277`）**未保存句柄、无 clearTimeout**，卸载时不做清理，靠 `aliveRef.current`（`:198`、`:213-214`、`:250`）短路（`:257`、`:265`）。
4. `document` 级监听：拖宽用的 `mousemove`/`mouseup` 仅在 `onUp` 内移除（`:582-583`），组件若在拖拽中被卸载则监听残留（迁移 jsdom 时须处理的泄漏点，`:571-587`）。

**未消费的 owner props（迁移提示）**：`conversation.view` 的 owner props 为 `{ viewRequest, openView, completeViewRequest }`（`deepseekHARNESS/packages/client/ui-conversation/src/client/contract/slots.ts:248-255`），本插件完全未消费——不参与 View 焦点（focus）协议；标准 props（`useConversation`/`useInput`/`inputActions`/`useWorkspaces`，`slots.ts:189-210`）亦未使用。

---

# B. 组件与 UI 结构

## B1. UI 树

```
FsView                                   src/client/index.js:462
├─ 顶栏 .fs-hbar                          :683-689
│  ├─ 左 .fs-hbar-left  = [工作区 Menu(:637-643), 刷新按钮(:644), 折叠按钮(:635)]
│  ├─ 中 .fs-hbar-mid   = [查看模式页签 .fs-tabs(:645-646), 路径标签 .fs-hd-path(:647-653)]
│  └─ 右 .fs-hbar-right = [翻译按钮(:660-665), 生成解读 Menu 包裹 .fs-genwrap(:616-632), 编辑动作区(:654-658)]
├─ 主体 .fs-body                          :670-681
│  ├─ 未折叠： .fs-side(width=treeW) → FsTree(:673-676) ；分隔条 .fs-split(:677) ；编辑器区
│  └─ 折叠：   仅编辑器区(:680)
└─ 编辑器区 = opened ? FsPane(:667) : 空态 div + 可选 status(:668)
```

职责划分：
- `FsTree`（`:127-159`）——左侧文件树面板：目录/文件行渲染、展开态、懒加载缓存消费、文档蓝点、选中高亮。
- `FsPane`（`:426-452`）——右侧查看/编辑器主体：按 `viewer` 状态渲染占位卡/生成中/加载中/Markdown/代码/编辑区。
- `useOpenedViewer`（`:179-394`）——"当前打开对象"的状态与操作集（读源、读三类文档、生成、翻译、保存、编辑态）。
- 渲染辅助函数：`renderFrontmatter`（`:75-83`）、`renderMd`（`:90-96`）、`viewBody`（`:104-113`）、`placeholderCard`（`:401-412`）。
- 样式常量 `CSS`（`:695-753`）：**57 条规则、49 个 `.fs-*` 选择器**，由 `apply` 以 `<style data-plugin="fs">` 注入（`:758-764`）。

## B2. 组件 props 与内部状态

**FsView**（`:462`）
- props：`workspaces`（由注册处显式注入，`:463`、`:770`）；slot 透传 props 全部忽略；`picker`（`:770` 注入）**在组件内零引用**（全仓 grep 仅 `:770` 一处，确认死参数）。
- state（14 个 useState）：`collapsed`(:464)、`treeW`(默认 280, :465)、`opened`(:466)、`rootName`(:467)、`rootPath`(:468)、`tree`(:469)、`expanded`(:470)、`cache`(:471)、`dragging`(:472)、`status`(:473)、`wsItems`(:474)、`curWsId`(:475)、`wsMenuOpen`(:602)、`genMenuOpen`(:604)。
- 派生局部量：`isSelFile`(:605)、`isSelMd`(:606)、`genItems`(:607-615, `useMemo`)、`genAnchor`(:616)、`genMenu`(:617-627)、`genWrap`(:629-632)、`curWs`(:633)、`curWsName`(:634)、`foldBtn`(:635)、`wsAnchor`(:636)、`wsMenu`(:637-643)、`refreshBtn`(:644)、`tabs`(:645-646)、`openedFullPath`(:649-652)、`pathLabel`(:653)、`editActions`(:654-658)、`trBtn`(:660-665)、`editor`(:667-668)、`side/split/body`(:671-681)、`hbar`(:683-689)。

**FsTree**（`:127`）
- props（JSDoc 契约 `:117-124`）：`tree: Array<{type,path,name,hasDoc?,hasDocSrc?,hasDocTr?}>`、`expanded: Record<string,boolean>`、`cache: Record<string,Array<node>>`、`selected: node|null`、`onToggle(path, open)`、`onOpen(node)`。
- 无内部 state；空值兜底 `tree/expanded/cache` 均以 `|| []`/`|| {}` 归一（`:128-131`）。

**FsPane**（`:426`）
- props：`opened`、`viewer`（`:427-428`）；无内部 state。

**useOpenedViewer(opened, onTrDone)**（`:179`）
- state（14）：`source`(:180)、`docData`(:181)、`annotData`(:182)、`trData`(:183)、`mode`(默认 `'source'`, :184)、`editMode`(false, :185)、`edit`('', :186)、`dirty`(false, :187)、`status`('', :188)、`fold`({state:'idle',content:''}, :190)、`genState`('idle', :192)、`cardDismissed`(false, :193)、`genStatus`(null, :195)、`trBusy`(false, :197)；ref：`aliveRef`(:198)。
- 派生（`:200-210`）：`hasSource = opened.type !== 'directory'`(:200)；`isMdFile`(:202)；`isBookFile`（`.book` 或 `.book/` 前缀，:204）；`canTranslate = isMdFile && !isBookFile`(:205)；`modes` 数组(:206-210)。
- 返回对象契约（JSDoc `:169-177`，实现 `:390-393`）——**含 3 个从未被消费的导出字段**：`cardDismissed`/`setCardDismissed`、`genStatus`、`isMdFile`、`isBookFile`（详见"附：未确认与不一致"）。

## B3. 条件渲染分支（12 条分支体）

`FsPane`（`:430-450`）：
1. 文件夹 + `fold.state==='ready'` → `renderMd(fold.content)`（`:432`）
2. 文件夹 + `'generating'` → `.fs-load` + `t('genFolderBusy')`（`:433`）
3. 文件夹 + `viewer.status` 非空 → `.fs-load` + status（`:434`）
4. 文件夹兜底 → `placeholderCard(opened)`（`:435`）
5. 文件 + `genState!=='idle'` → `t('genFileBusy')` 或 `t('genSrcBusy')`（`:436-438`）
6. `mode==='doc'` → 有数据 `renderMd(docData)`，否则 `t('loading')`（`:439-440`）
7. `mode==='annot'` → 同上（`:441-442`）
8. `mode==='tr'` → 同上（`:443-444`）
9. `mode==='source'` + `status && !source` → status（`:446`）
10. `mode==='source'` + `!source` → `t('loading')`（`:447`）
11. `mode==='source'` + `editMode` → `<textarea class="fs-area">`（`:448`）
12. `mode==='source'` 兜底 → `viewBody(source.content, source.ext)`（`:449`）

其它分支：
- `FsView` 未打开任何节点 → `.fs-main` + 可选 status（`:668`）
- `FsTree` 空树 → `.fs-empty` + `t('emptyDir')`（`:158`）
- `FsView` 折叠态不渲染 `.fs-side`/`.fs-split`（`:670-681`）
- 生成按钮在 `genItems` 为空（md 文件）时不弹菜单（`:616`、`:631`）

---

# C. 交互行为

1. **树懒加载展开**（`:552-561`）：点击目录行 → `onToggle(path, !isOpen)`；若 `open && !cache[path]` → `GET /tree?path=<enc>`，成功后同时 `setExpanded(path:true)` 与 `setCache(path:list)`；失败走 `swallowTreeLoadFailure`（空函数 `:55`，静默、保持未展开、下次点击重试）。**折叠不删缓存**（`:559`），再次展开不重新请求。
2. **目录行点击的双重效果**（`:141`）：同一 `onClick` 先 `onToggle` 再 `onOpen(node)` —— 即点击目录既展开/折叠，也把它设为右侧 `opened`（显示目录概览或占位卡）。
3. **文件行点击**（`:151`）：`onOpen(node)` → `setOpened(node)`（`:675`）；选中高亮 `sel`（`:149`、`:151`）。
4. **文档蓝点**（`:145`、`:155`，样式 `:740`）：
   - 目录行：`hasDoc || hasDocSrc` 时显示，`title = t('a11yDocDir')`，`onClick` 执行 `e.stopPropagation(); onOpen(node)`（`:145`，避免顺带折叠）。
   - 文件行：`hasDoc || hasDocSrc || hasDocTr` 时显示，`title = t('a11yDocFiles')`，**未绑定任何 onClick**（`:155`）——但 CSS 给了 `cursor:pointer`（`:740`），视觉可点、实际无响应。
   - host 下发字段：`/tree` 返回 `hasDoc/hasDocSrc/hasDocTr` 与 `docRel/docSrcRel/docTrRel`（`src/host/index.js:397-418`；目录的 `hasDocSrc` 恒为 false，`:399`）。
5. **Markdown 渲染**（`:104-113`、`:90-96`、`:75-83`）：`isMd(ext)` → `renderMd`：先 `splitFrontmatter` 取头字段 → `renderFrontmatter` 生成 `.fs-fmcard`（无字段返回 null）→ 正文交给原生 `MarkdownText`，并注入标签 `MD_LABELS`（`:64-67`：copy/copied/footnotes）。
6. **代码高亮**（`:108-111`）：`langFor(ext)` 命中且 ≠ `'text'` → 原生 `CodeBlock {code, lang}`（`shiki`）；否则 `.fs-code` 等宽 `<pre>`，空内容显示 `t('emptyFile')`。
7. **编辑**：`editActions` 仅在 `opened && hasSource && mode==='source'` 时渲染（`:654`）。按钮在 `btnEdit`/`btnView` 间切换（`:656`），点击 `toggleEdit`（`:388`）；编辑态渲染 `.fs-area` textarea（`:448`），`onChange → changeEdit`（`:387`：同时 setEdit 与 setDirty(true)）。
8. **保存**（`:378-386`）：`POST /write {path, content:edit}`；成功 → `dirty=false`、`status=t('okSaved')`、`editMode=false`（退出编辑态）；失败 → `status=t('errSaveFail')+msg`。
9. **「● 未保存」提示**（`:655`，文案 `locale.js:26` `a11yDirty: '● 未保存'`）：
   - 出现：任何 `changeEdit` 调用（`:387`）；且必须同时满足 `hasSource && mode==='source'`（`:654`）。
   - 消失：保存成功（`:384`）；或 `opened.path` 变化触发 viewer effect 重置（`:216`）。
   - **不清除的场景**：切换查看页签只做 `setMode + setEditMode(false)`（`:646`）→ dirty 保留；折叠树、拖宽不清除。
   - **静默丢弃**：切换到另一个文件或切换工作区（`refreshRoot` 置 `opened=null`，`:489`）会使 `opened.path` 变化 → effect 重置 `dirty/edit`（`:215-216`），**未保存内容无确认弹窗直接丢失**。
10. **查看模式页签**（`:645-646`）：由 `viewer.modes` 驱动（`:206-210`：`doc` 当 `opened.hasDoc || docData!=null`；`annot` 当 `opened.hasDocSrc || annotData!=null`；`tr` 当 `canTranslate && (opened.hasDocTr || trData!=null)`；`source` 当 `hasSource`）；label 一律经 `t(labLabelKey(mode, isDir))`（`md-utils.js:78-83`）。点击页签切换模式并退出编辑态。
11. **打开对象的默认模式**（`:220`）：`hasDoc → 'doc'`；否则 `hasSource → 'source'`；否则 `hasDocSrc ? 'annot' : 'source'`。
12. **打开时的读取扇出**（`:212-251`，依赖数组 `[opened.path]`）：
    - 文件：`GET /read?path=<文件>` → `source`（`:221-224`）；若 `hasDoc && docRel` → 再读 `docData`（`:235-239`）；`hasDocSrc && docSrcRel` → `annotData`（`:240-244`）；`canTranslate && hasDocTr && docTrRel` → `trData`（`:245-249`）。最多并发 4 个 `/read`。
    - 目录：若 `hasDoc && docRel` → 读 `fold`（读失败 → `state:'missing'` 占位卡，`:227-233`）；**同时** `:235-239` 会再用同一 URL 发一次 `/read` 写 `docData`（同一目录节点重复请求，契约细节）。
    - 竞态处理：`alive` 闭包标记 + `aliveRef`；旧响应/错误被 `swallowStaleDocRead`（空函数 `:52`）吞掉。
13. **生成解读（L1/L2/L3）**（`runGen` `:282-323`）：
    - 入口：顶栏「生成解读」`Button`（`:616`），`genItems`（`:607-615`）：目录 → 单项 `folder`（已生成则文案 `genFolderRegen`）；md 文件 → **空数组（不提供生成）**；其它文件 → `file` + `src`（各按已生成切换 Regen 文案）。
    - 交互：点击或 `onMouseEnter` 自动展开菜单（`:631`），`closeOnPointerLeave: true` 时移开自动收起（`:621`）。
    - 流程：`POST /gen-doc {kind, path}` → 取 `taskId`（无则 `t('errGenNoTaskId')`）→ `pollTask` → 成功按 `task.docRel` 再 `GET /read` → `folder` 落 `fold.ready`；`file` 落 `docData` 并切 `doc` 模式；`src` 落 `annotData` 并切 `annot` 模式（`:297-311`）。失败路径 `reset()` 回 `missing/idle`（`:289`、`:309`、`:314`、`:320`）。
    - 重入保护：`kind !== 'folder' && genState !== 'idle'` 时直接 return（`:284`）；目录生成无重入保护。
14. **翻译（tr）**（`runTranslate` `:328-376`）：仅 `canTranslate`（项目内 md 且非 `.book/`）时按钮存在（`:660`）；`trBusy` 期间 `disabled`（`:663`）；按钮文案/标题随 `opened.hasDocTr` 在"翻译/重新翻译"间切换（`:664-665`）。流程：`POST /translate {path}` → `taskId` → `pollTask` → 按 `docRel` 读回 → `setTrData`、切 `tr` 模式、`status=t('okTrDone')`、调用 `onTrDone(docRel)`（`:350-357`）。
15. **翻译成功后的刷新**（`onTrDone` `:590-600`）：对 `opened` 就地补 `hasDocTr:true, docTrRel`；再 `GET /tree?path=<父目录>`；父目录为 `'.'` 时同时更新 `tree` 与 `cache['.']`，否则只更新 `cache[parent]`（失败静默 `swallowTreeLoadFailure`）。
16. **工作区切换**（`:544-550`、`:633-643`）：工作区列表来自 `workspaces.list.getSnapshot().items`（`:532`），并通过 `workspaces.list.subscribe` 实时更新（`:534-538`，卸载时 `unsub()`，`:539`）；菜单项 label = `(title || basename(path)) + t('wsItemSep') + path`（`:640`）；选择后 `setCurWsId` + `refreshRoot(ws.path)`（`:549`）。顶栏显示名 `curWs.title || rootName || t('pickWs')`（`:633-634`）。
17. **刷新 / 切根**（`refreshRoot` `:477-492`）：可选 `POST /set-root {path}` → `GET /root` → `setRootName(basename(root))`、`setRootPath` → `GET /tree?path=.` → 重置 `tree`、`expanded={}`、`cache={}`、`opened=null`、`status=''`；失败 → `status=t('errLoadFail')+msg`（`:491`）。
18. **树面板折叠与拖宽**：折叠按钮切换 `collapsed`（`:635`）；拖宽 `startDrag`（`:571-587`）用 `document` 级 `mousemove/mouseup`，宽度 clamp 到 **[180, 420]**（`:578`）。
19. **启动恢复**（`:494-542`）：见 D 节。

---

# D. 状态持久化

**localStorage**
- 唯一键：`'fs.ui.v1'`（`src/client/index.js:37`）。
- 写入函数 `saveUi`（`:43-47`）：`localStorage.setItem(UI_KEY, JSON.stringify(data))`，异常静默（命名注释说明吞掉内容，`:45-46`）。
- 读取函数 `loadUi`（`:38-42`）：`JSON.parse(localStorage.getItem(UI_KEY) || 'null')`，异常返回 `null`。
- **存的值（6 个字段）**（`:568`）：`{ rootPath, curWsId, treeW, collapsed, opened, expanded }`；`expanded` 落盘为**展开路径字符串数组**（`Object.keys(expanded).filter(p => expanded[p])`，`:568`），恢复时转回 map（`:512-515`）。
- **写入时机**：`useEffect` 依赖 `[rootPath, curWsId, treeW, collapsed, opened, expanded]`（`:565-569`）；守卫 `hasContent = rootPath || opened || 任一 expanded 为真` —— **初始空态不覆盖既有存档**（`:566-567`）。
- **读取/恢复时机**：`FsView` 挂载时的一次性 effect（`:494`、`:496`）。恢复流程（`:497-527`）：先恢复 `treeW/collapsed/curWsId`（`:498-500`）→ 若存档有 `rootPath` 则 `POST /set-root`（`:501-503`）→ `GET /root`（`:504-507`）→ `GET /tree?path=.`（`:508-511`）→ 用 `saved.expanded` 建 map（`:512-515`）→ `setOpened(saved.opened || null)`（`:516`）→ 对每个展开目录并发 `GET /tree?path=<p>` 回填 `cache`，单项失败降级 `{list: []}`（`:518-526`）。整链失败 → `status=t('errRestoreFail')+msg`（`:527`）。无存档时走 `refreshRoot()`（`:529`）。

**内存缓存及其失效条件**
| 缓存 | 存放 | 失效/重建 |
|---|---|---|
| 目录子项列表 `cache` | state `:471` | 重建：`refreshRoot` 清空（`:488`）；`onTrDone` 局部覆写父目录（`:597-598`）；启动恢复批量回填（`:523-525`）；展开时写入（`:556`）。折叠**不失效**（`:559`） |
| 展开态 `expanded` | state `:470` | 清空：`refreshRoot`（`:487`）；恢复时整体覆盖（`:515`） |
| 根树 `tree` | state `:469` | 重建：`refreshRoot`（`:486`）、`onTrDone` 且父目录为 `'.'`（`:597`）、恢复（`:511`） |
| 当前打开对象 `opened` | state `:466` | 置空：`refreshRoot`（`:489`）；就地改标记：`onTrDone`（`:593`） |
| viewer 文档缓存 `source/docData/annotData/trData/fold` | `:180-190` | 仅在 `opened.path` 变化时整体重置（`:215-217`）；无 TTL、无手动失效 |

---

# E. i18n

**字典文件**：`src/shared/locale.js`；导出 `ZH`（:5-90）、`LANG = { zh: ZH }`（:92）、`t(key, lang)`（:95-100，缺键 `console.warn('[locale] missing key: ' + key)` 并回退 key 本身）。

**key 总数 = 72**（`Object.keys(ZH).length` 实测 = 72）。完整清单（格式 `key`（locale.js:行））：

1) 槽位/页签（6）：`slotLabel`:7、`labDocDir`:9、`labDocFile`:10、`labAnnot`:11、`labTr`:12、`labSrc`:13
2) Markdown 内置标签（3）：`mdCopy`:15、`mdCopied`:16、`mdFootnotes`:17
3) 通用状态（4）：`loading`:19、`emptyFile`:20、`emptyDir`:21、`frontmatter`:22
4) a11y title/提示（10）：`a11yDocDir`:24、`a11yDocFiles`:25、`a11yDirty`:26、`a11yExpandTree`:27、`a11yCollapseTree`:28、`a11yRefresh`:29、`a11yGen`:30、`a11yTrLoading`:31、`a11yTrRegen`:32、`a11yTrNew`:33
5) 按钮/选择（8）：`btnGen`:35、`btnEdit`:36、`btnView`:37、`btnSave`:38、`btnTr`:39、`btnTrRegen`:40、`btnTrLoading`:41、`pickWs`:42
6) 生成菜单项（6）：`genFolder`:44、`genFolderRegen`:45、`genFile`:46、`genFileRegen`:47、`genSrc`:48、`genSrcRegen`:49
7) 占位卡（6）：`rootDirName`:51、`folderCardTitle`:52、`folderCardDesc1`:53、`folderCardDesc2`:54、`pathSep`:55、`wsItemSep`:56
8) 生成中（3）：`genFolderBusy`:58、`genFileBusy`:59、`genSrcBusy`:60
9) 成功/错误串（17）：`okSaved`:62、`okTrDone`:63、`errReadFail`:64、`errLoadFail`:65、`errRestoreFail`:66、`errSaveFail`:67、`errGenFail`:68、`errGenFailWith`:69、`errGenNoTaskId`:70、`errGenTaskGone`:71、`errGenNoDocRel`:72、`errGenReadFail`:73、`errTrFail`:74、`errTrNoTaskId`:75、`errTrNoDocRel`:76、`errTrReadFail`:77、`errPollTimeout`:78
10) host 侧直取（7）：`errGenMd`:80、`errTranslateOnlyMd`:81、`errBookNoTranslate`:82、`errTargetMissing`:83、`errTargetNotDir`:84、`errTargetNotFile`:85、`errTaskTimeout`:86
11) client `api()` 兜底（2）：`errHttpPrefix`:88、`errRequestFailed`:89

**key 的使用分布（可核对闭环）**
- client 直接调用 `t('...')`：64 处调用点、**60 个不同 key**（`src/client/index.js`，全量在 `:30`、`:65-66`、`:79`、`:112`、`:145`、`:155`、`:158`、`:224`、`:260`、`:267`、`:269`、`:296`、`:301`、`:310`、`:316`、`:321`、`:340`、`:346-347`、`:356`、`:362`、`:368`、`:385`、`:402-410`、`:433-447`、`:491`、`:527`、`:610-613`、`:616`、`:634-665`、`:769`）。
- client 间接使用：5 个 `lab*` 键经 `labLabelKey`（`src/client/md-utils.js:78-83`）后由 `t()` 取值（`src/client/index.js:646`）。
- host 直取 `ZH[key]`：7 个 —— `errTaskTimeout`（`src/host/task-utils.js:23`）、`errGenMd/errTargetMissing/errTargetNotDir/errTargetNotFile/errTranslateOnlyMd/errBookNoTranslate`（`src/host/index.js:270,276,278,282,315,317,320`）。
- 校验结果：60 + 5 + 7 = 72 ✓（无孤儿键、无 client 缺键）。

**硬编码文案排查**
- client 侧**无硬编码中文产品文案**：`[\p{Han}]` 在 `src/client/index.js` 的全部 71 处命中均位于注释行（无一处是字符串字面量）。
- 唯一硬编码英文串：`src/client/index.js:757` `throw new Error('slots service missing — client cannot register conversation.view')`（开发者诊断，非 UI 文案；迁移时可考虑入字典或不入）。
- UI 可见但非字典的常量文本：`src/client/md-utils.js:23` `EXT_BADGES`（`JS/TS/MD/{}/PY/CSS/<>/$/Y`，文件树角标）——**属于产品可见文本，目前硬编码在纯逻辑层**，是迁移时最应决定是否收进字典的一项。
- 非文案常量（无需迁移）：`md-utils.js:30-38` `LANG_MAP`（shiki 语言 id）、`md-utils.js:39` `MD_EXTS`、`src/client/index.js:37` `'fs.ui.v1'`、`:28` `/api/fs`、`:766-768` 槽位元数据、`:695-753` CSS 文本、各类 class 名。
- 字典值本身为英文的既有一处：`locale.js:22` `frontmatter: 'frontmatter'`（术语，已入字典）。

---

# F. 与 host 的接口

**统一调用封装** `api(path, opts)`（`src/client/index.js:27-34`）：`fetch('/api/fs' + path, opts)` → `r.json().catch(()=>null)`；HTTP 非 2xx → `throw new Error(d.error || t('errHttpPrefix') + status)`；`d.ok === false` → `throw new Error(d.error || t('errRequestFailed'))`；成功返回解析后的 JSON（成功响应可能无 `ok` 字段）。

**client 调用的端点（8 个，全部为 `/api/fs/*`）**

| # | 方法/路径 | 请求载荷 | 期望响应 | client 位置 | host 实现 |
|---|---|---|---|---|---|
| 1 | `GET /api/fs/root` | 无 | `{ root }` | :481, :504 | host/index.js:354 |
| 2 | `GET /api/fs/tree?path=<enc>` | query `path`（相对 root，`'.'` 为根） | `{ path, list: [{name,type,path,hasDoc,hasDocSrc,hasDocTr,docRel,docSrcRel,docTrRel}] }`（目录优先 + `localeCompare(zh-CN)` 排序） | :484, :508, :520, :554, :595 | host/index.js:375-424 |
| 3 | `GET /api/fs/read?path=<enc>` | query `path`（项目内相对路径，或书库逻辑路径 `@<桶>/<层>/<stem>.md`） | 成功 `{ content, ext, size }`；失败 `{ok:false,error}`（目录/超限/不存在 → 400/404） | :222, :228, :236, :241, :246, :302, :350 | host/index.js:426-458（2MB 上限 :455） |
| 4 | `GET /api/fs/gen-status?id=<enc>` | query `taskId` | `{ ok:true, task }`；任务不存在 → `{ ok:false, error:'task not found', task:null }`；`task = {id, kind, rel, docRel, status, error, startedAt, finishedAt}` | :263 | host/index.js:365-374 |
| 5 | `POST /api/fs/set-root` | JSON `{ path }`（绝对目录路径） | `{ ok:true, root }`；非目录 → 400 | :479, :502 | host/index.js:237-246 |
| 6 | `POST /api/fs/write` | JSON `{ path, content }` | `{ ok:true }` | :380-383 | host/index.js:247-252 |
| 7 | `POST /api/fs/gen-doc` | JSON `{ kind, path }`，`kind ∈ folder\|file\|src` | `{ ok:true, started:true, taskId, reused? }`（同 kind+path 有进行中任务时复用同一 taskId） | :290-293 | host/index.js:263-310（去重 :285-289） |
| 8 | `POST /api/fs/translate` | JSON `{ path }`（项目内 md） | `{ ok:true, started:true, taskId, docRel }`（去重复用 :323-327） | :334-337 | host/index.js:311-349 |

POST 一律带 `headers: {'Content-Type': 'application/json'}`（`:292`、`:336`、`:382`、`:479`、`:502`）。

**host 提供但 client 未调用**（迁移时确认是否保留）：`POST /api/fs/mkdir`（host:253-257）、`POST /api/fs/delete`（host:258-262）、`GET /api/fs/session`（host:355-364）。

**轮询逻辑**（`pollTask` `src/client/index.js:254-278`）
- 频率：首 tick 延迟 **800ms**（`:277`），之后每 **1500ms** 一次（`:270`）。
- 上限：`POLL_LIMIT_MS = 5 * 60 * 1000`（5 分钟，`:61`），deadline 在进入 `pollTask` 时计算（`:255`）。
- 终止条件（任一命中即停止）：`task.status === 'success'` → `onSuccess(task)`（`:268`）；`'error'` → `onError(task.error || t('errGenFail'))`（`:269`）；`task` 为空 → `onError(t('errGenTaskGone') + taskId)`（`:267`）；超过 deadline → `onError(t('errPollTimeout'))`（`:259-262`）；请求 reject → `onError(msg)` 且**不再重试**（`:272-275`）；`aliveRef.current === false` → 静默退出（`:257`、`:265`）。
- 清理：无 `clearTimeout`（句柄未保存）、无取消句柄返回；组件卸载后残留的一次 `setTimeout` 会执行并由 `aliveRef` 短路。
- 调用点：`runGen`（`:297`）、`runTranslate`（`:341`）。

---

# 附加：未确认项与实现不一致（迁移必须决策）

| # | 内容 | 证据 |
|---|---|---|
| 1 | `cardDismissed` / `setCardDismissed` 是**死状态**：仅在 `:193` 声明、`:218`/`:288` 写 `false`、`:392` 导出，**无任何读取点**；对应 CSS `.fs-card-actions`/`.fs-card-src`/`.fs-card-err`/`.fs-folder-gen`（`:748-752`）也**无 JS 引用**（实测 CSS 49 个类中 4 个无引用），属旧版占位卡按钮的遗留 | `:193,218,288,392`；CSS `:748-752` |
| 2 | `genStatus` 同样只写不读（`:286,299,315,333,346,353,361,367,373` 写入，`:392` 导出）——所有生成/翻译错误实际只经 `status` 上屏 | 同左 |
| 3 | `isMdFile`、`isBookFile` 导出后无人消费（FsView 另用 `isSelMd` 自算，`:606`）；`picker` prop 注入后无人消费（`:770`） | `:202,204,390-391`；`:606,770` |
| 4 | AGENTS.md §6 冒烟第 2 条称"书库文档节点带蓝点、**悬停可打开**"：代码中**找不到 hover 打开文档的实现**；实际只有目录行蓝点的 `onClick`（`:145`），文件行蓝点无任何事件（`:155`）。`未确认`该文档表述所指（可能指"生成解读"按钮的 hover 展开菜单 `:628-632`） | `:145,155,628-632` |
| 5 | 目录节点在打开时会**重复请求同一个 `/read` URL**（`:227-230` 写 `fold`，`:235-239` 写 `docData`，条件相同） | `:227-239` |
| 6 | 切换文件/切换工作区会**静默丢弃未保存编辑**（无确认弹窗），仅靠 effect 重置 | `:215-216,489` |
| 7 | `refreshRoot` 失败时的 `status` 在已有打开对象后**不上屏**（`:668` 仅在 `!opened` 时渲染 FsView.status；打开对象后只有 `viewer.status` 可显示） | `:473,491,668` |
| 8 | 拖拽期间若组件卸载，`document` 的 `mousemove`/`mouseup` 监听不会被移除（无 cleanup effect） | `:571-587` |
| 9 | 插件未消费 `conversation.view` owner props（`viewRequest`/`openView`/`completeViewRequest`），不参与 View 焦点协议 | `:770`；`ui-conversation/src/client/contract/slots.ts:248-255` |
| 10 | 官方文档 `docs/subsystems/slots.zh.md:17` 与 `ui-renderer/src/client/registry.ts:172-234` 已确认 `slots.inject` 的 effect 语义；**但本插件是否在"声明折叠后重新运行 callback"场景下有副作用**（callback 内只有 `register`，无外部副作用）——已确认无副作用，非风险项 | 同左 |

---

# 功能点计数（供核对）

| 分区 | 口径 | 数量 |
|---|---|---|
| A. 槽位注册 | 槽位注册点 1 + 样式 effect 1 + 注入声明 1 | **3** |
| B. 组件与 UI | 组件/钩子 3（FsView、FsTree、FsPane）+ 自定义 Hook 1（useOpenedViewer）+ 渲染辅助函数 4 + CSS 常量 1 | **9** |
| B. 状态字段 | FsView 14 + useOpenedViewer 14（另有 ref 1、派生量 5 未计入） | **28** |
| B. 条件渲染分支 | FsPane 12 + FsTree 空树 1 + FsView 未打开 1 + FsView 折叠 1 | **15** |
| C. 交互行为 | 上表 C 节 1–18（其中 4 拆蓝点目录/文件两条、9 拆出现/消失/不清除/静默丢弃）→ 实际条目 | **18** |
| D. 持久化 | localStorage 键 1 + 落盘字段 6 + 内存缓存组 5（cache/expanded/tree/opened/viewer 文档） | **12** |
| E. i18n | 字典 key 72 + 硬编码文案点 2（client throw 1、EXT_BADGES 1） | **74** |
| F. 接口 | client 调用端点 8 + host 未用端点 3 + 轮询机制 1（参数组：800ms/1500ms/5min） | **12** |
| **合计** | | **171** |

（说明：B 的"状态字段"与"分支"、E 的 key 与其他分区存在概念重叠，计数按"可独立验收的对象/行为"口径给出，便于逐项比对而不重复做同一件事。）
