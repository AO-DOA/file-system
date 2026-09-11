// 几何探针：从 src/client/index.tsx 的 `const CSS = [...]` 逐字提取样式，在 headless Chrome 里
// 逐档扫描面板宽度，回答「顶栏在哪些宽度被裁 / 重叠」。
//
// 判据（门禁只认前四项，实现见下方 <script> 里的 clipRect 与汇总段）：
//   1) 跨列可见重叠  2) 同列可见重叠  3) 被整块裁掉（不可见或不可点）  4) 右列被整块裁
// 「右列部分裁切」是**补充口径**，只打印、不进任何门禁。
// 口径的正文（可见矩形定义、四项指标的边界、跑法与坑）见同目录 README.md ——
// 本文件是口径的实现，两边改一处必须改另一处。
//
// 用法: node tools/ui-probe/probe.js --tag=<名> [--css=<tsx文件>] [--wsicon] [--splitpane]
//                   [--extra=<css文件>] [--only6] [--sn=1] [--sw=10] [--dumpW=400]
//                   [--menus=inline|portal] [--menu=ws|view|gen]
//                   [--shell-css=<dir>] [--outdir=<dir>] [--chrome=<路径>] [--window=1600,1000]
// 注意：只有 `--名=值` 形式被识别，位置参数会被**静默忽略**（踩过的坑，见 README）。
//
// `--menus` 是**菜单打开态**（交互态）场景：默认不开面板；`inline` 复刻修复前的内联面板、
// `portal` 复刻修复后的 portal 面板，逐档量面板自身的可见高与被整块裁掉的档数。
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

/** 仓库根（本脚本位于 <root>/tools/ui-probe/ 下）。 */
const PLUGIN = path.resolve(__dirname, '..', '..')
const PRIM = path.join(PLUGIN, 'node_modules/@deepseek-ai/dsh-client-ui-primitives/lib')
/**
 * DSH 检出的壳层构建产物：CSS 变量与宿主基础样式的来源。
 * 默认按本工作区的目录布局推导（<root>/../../../deepseekHARNESS/apps/web/dist/assets），
 * 换机或换检出位置时用 --shell-css 指过来。
 */
const SHELL_CSS_DIR = path.resolve(PLUGIN, '..', '..', '..', 'deepseekHARNESS/apps/web/dist/assets')

const args = {}
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a)
  if (m) args[m[1]] = m[2] === undefined ? '1' : m[2]
}
const tag = args.tag || 'probe'
const cssFile = args.css || path.join(PLUGIN, 'src/client/index.tsx')
/** 运行产物落这里：DOM dump 与数据 JSON 都是运行产物，**不进仓库**。 */
const outDir = args.outdir || path.join(os.tmpdir(), 'dsh-ui-probe')
const chrome = args.chrome || '/usr/bin/google-chrome'
/**
 * Chrome 的 `--window-size` **只认 `W,H`**（逗号）。写成 `1600x1000` 会被静默忽略、退回默认窗口，
 * 于是视口外的元素拿不到 elementFromPoint 命中 —— 第 3 项的「不可点」出现假红（实测：
 * 面板 830–1200 档全部误报不可点）。这里把常见的 `x`/`X`/`*` 分隔符归一成逗号，堵住这个坑。
 */
const winSize = (args.window || '1600,1000').replace(/[xX*]/, ',')
const wsIcon = args.wsicon === '1'
const only6 = args.only6 === '1'
const sn = Number(args.sn || 1)
const sw = Number(args.sw || 10)
const dumpW = Number(args.dumpW || 0)
const extra = args.extra ? '\n' + fs.readFileSync(args.extra, 'utf8') : ''
// 分屏开启态：body 里多一条分隔条 + 一份只读副本窗格（顶栏几何不随它变，用于验证这一点）。
const splitPaneOn = args.splitpane === '1'
/**
 * 菜单打开态（交互态场景）：不带该选项时**一个面板都不注入**，既有四项门禁的读数口径不变。
 * - `--menus=inline`：面板留在锚点旁（`.mr` root 内、`position:absolute`）⇒ 它是 `.fs-hbar` /
 *   `.fs-hbar-mid` 的后代，落进那两条 `overflow:hidden` 的裁剪链 —— 这是修复前（Menu 未传
 *   `portal`）的真实形态。
 * - `--menus=portal`：面板搬到 `#stage` 之外（模拟 `createPortal(list, document.body)`）⇒
 *   祖先链里没有 `.fs-hbar` —— 这是修复后的形态。
 * 裸 `--menus`（无值）等同于 `inline`，即「修复前的基线」。
 */
const menus = args.menus === undefined ? '' : (args.menus === '1' ? 'inline' : args.menus)
if (menus && menus !== 'inline' && menus !== 'portal') {
  throw new Error(`--menus 只认 inline / portal（或不带值＝inline），收到：${menus}`)
}
/** `--menu=<kind>`：只打开 ws / view / gen 中的一个 —— 真实使用同一时刻只开一个菜单。 */
const menuOnly = args.menu || ''
if (menuOnly && !['ws', 'view', 'gen'].includes(menuOnly)) {
  throw new Error(`--menu 只认 ws / view / gen，收到：${menuOnly}`)
}

/** 从 index.tsx 的 CSS 常量数组逐字提取样式文本。 */
function extractCss(file) {
  const src = fs.readFileSync(file, 'utf8')
  const start = src.indexOf('const CSS = [')
  const end = src.indexOf("].join('\\n')", start)
  if (start < 0 || end < 0) throw new Error('CSS 数组边界未找到: ' + file)
  return src.slice(start + 'const CSS = ['.length, end).split('\n')
    .map(l => l.trim()).filter(l => l.startsWith("'"))
    .map(l => {
      const m = /^'((?:[^'\\]|\\.)*)',?$/.exec(l)
      if (!m) throw new Error('无法解析 CSS 行: ' + l)
      return m[1]
    }).join('\n')
}
const cssSrc = extractCss(cssFile) + extra

/** primitives 的 CSS module 是真类名，探针里换成无 hash 的前缀（只保证几何）。 */
function realCss(file, map) {
  let s = fs.readFileSync(path.join(PRIM, file), 'utf8')
  s = s.replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/\.([A-Za-z][\w-]*)/g, (m, name) => {
    if (!(name in map)) throw new Error(`${file} 未映射类名 .${name}`)
    return '.' + map[name]
  })
  return s
}
const btnCss = realCss('Button.module.css', {
  button: 'vp-btn', md: 'vp-md', sm: 'vp-sm', primary: 'vp-primary', ghost: 'vp-ghost',
  outline: 'vp-outline', toolbar: 'vp-toolbar', icon: 'vp-icon',
})
const menuMap = {}
{
  const names = new Set([...fs.readFileSync(path.join(PRIM, 'Menu.module.css'), 'utf8').matchAll(/\.([A-Za-z][\w-]*)/g)].map(m => m[1]))
  for (const n of names) menuMap[n] = 'mr-' + n
  menuMap.root = 'mr'
}
const menuCss = realCss('Menu.module.css', menuMap)
// 前置校验：primitives 产物与壳层 CSS 都是硬依赖，缺了就说清缺哪一个，
// 别让 readdirSync/readFileSync 的 ENOENT 变成一句无从下手的报错。
if (!fs.existsSync(PRIM)) {
  throw new Error(`未找到 primitives 产物：${PRIM}\n先在仓库根跑一次 npm install。`)
}
if (!fs.existsSync(SHELL_CSS_DIR)) {
  throw new Error(`未找到壳层 CSS 目录：${SHELL_CSS_DIR}\n`
    + '默认按 <仓库根>/../../../deepseekHARNESS/apps/web/dist/assets 推导；'
    + '换检出位置或宿主未构建时用 --shell-css=<dir> 指过来。')
}
const shellCc = fs.readdirSync(SHELL_CSS_DIR).filter(f => f.endsWith('.css'))

const ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor"/></svg>'
const iconSpan = `<span class="vp-icon">${ICON}</span>`
const WS = {
  short: 'dsh-fs',
  mid: 'dsh-plugin-file-system-zc',
  long: 'dsh-plugin-file-system-zc-超长工作区名称压力测试-0123456789',
  xlong: 'dsh-plugin-file-system-zc-更长的超长工作区名称压力测试-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-abcdefghij',
}
const PATHS = {
  short: 'src/index.tsx',
  mid: 'dsh-plugin-file-system-zc/src/client/index.tsx',
  long: 'deepseekHARNESS/packages/client/ui-primitives/src/components/very/deep/nested/folder/with-a-really-long-file-name.module.tsx',
}

/**
 * 按钮。`labelClass` 决定文字是否包进 label 层 —— 只有 R2 收窄的三个按钮（解读选择/
 * 编辑/保存）与（本段）工作区按钮有这一层，视图选择器的文字是裸文本（源码就是这么写的，
 * 探针必须一致，否则探针会比真实更容易通过）。
 */
function btn(o) {
  const cls = 'vp-btn vp-ghost ' + o.size + (o.extra ? ' ' + o.extra : '')
  const text = o.label ? (o.labelClass ? `<span class="${o.labelClass}">${o.label}</span>` : o.label) : ''
  const inner = (o.icon ? iconSpan : '') + text
  return `<button type="button" class="${cls}"${o.disabled ? ' disabled' : ''}>${inner}</button>`
}
/**
 * 复刻一个打开态的下拉面板（Menu 的 `.list`：`min-width:218px` / `padding:4px`，行是 `.item`）。
 * 项文案取 locale 里的真实值；`--menu=<kind>` 时只生成被点名的那个。形态由 `--menus` 决定：
 * portal 形态给面板再挂上 `.portal`（`position:fixed` + `z-index:1100`），坐标由浏览器端按锚点算。
 */
function panelHtml(kind) {
  if (menuOnly && menuOnly !== kind) return ''
  const rows = {
    ws: ['dsh-fs'],
    view: ['文件摘要', '源码注解', '文章翻译'],
    gen: ['目录概览', '文件摘要', '源码注解', '文章翻译'],
  }[kind].map(t => `<div class="mr-item" role="menuitem"><span class="mr-itemLabel">${t}</span></div>`).join('')
  const cls = 'mr-list' + (menus === 'portal' ? ' mr-portal' : '')
  return `<div class="${cls}" data-menu="${kind}" role="menu"><div class="mr-viewport" role="presentation">${rows}</div></div>`
}
/** 内联形态的面板：与锚点同处一个 `.mr` root（`position:absolute` 相对它，落进裁剪链）。 */
function inlinePanel(kind) { return menus === 'inline' ? panelHtml(kind) : '' }
/** Menu 的 root 是 inline-flex 的 span（`.mr`，`position:relative`），锚点在里面；宽度与裸按钮等价，探针保留这一层。 */
function wrapped(inner, panel) { return `<span class="mr">${inner}${panel || ''}</span>` }
/** portal 形态的面板：挂在 `#stage` 之外（挂在 body 直下的容器里），祖先链里没有 `.fs-hbar`。 */
function portals(o) {
  if (menus !== 'portal') return ''
  return (o.ws ? panelHtml('ws') : '') + (o.view ? panelHtml('view') : '') + (o.gen ? panelHtml('gen') : '')
}

/**
 * 带 `.fs-tipwrap` 锚点层的按钮。源码里每个挂了 `Tooltip` 气泡的按钮外面都包这一层原生 span
 *（`tip()`：`<Tooltip><span className="fs-tipwrap">{btn}</span></Tooltip>`；primitives 的 `Button`
 * 在 React 18 下挂不上 ref，气泡的锚点必须是原生元素）。它只做收缩包裹（`display:inline-flex`），
 * 但**必须复刻**：顶栏是 `@container` 分档 + `minmax(0,1fr)` 分配，少一层就量的是另一个 DOM。
 * 视图选择器与解读选择这两个「悬停即开下拉」的锚点**不挂**气泡（挂上会双弹），故不带这一层。
 */
function tipwrap(inner) { return `<span class="fs-tipwrap">${inner}</span>` }

function scenario(o) {
  const left = [
    o.ws ? wrapped(tipwrap(btn({
      size: 'vp-md', icon: true, label: WS[o.ws], extra: 'fs-wsbtn',
      labelClass: wsIcon ? 'fs-btnlabel fs-wslabel' : null,
    })), inlinePanel('ws')) : '',
    `<div class="fs-hd-actions">${tipwrap(btn({ size: 'vp-sm', icon: true }))}${tipwrap(btn({ size: 'vp-sm', icon: true }))}</div>`,
  ].join('')
  const mid = [
    o.view ? `<div class="fs-viewwrap">${wrapped(btn({ size: 'vp-sm', label: o.viewLabel || '源码', extra: 'fs-viewbtn' }), inlinePanel('view'))}</div>` : '',
    o.path ? `<div class="fs-hbar-path"><div class="fs-hd-path">${PATHS[o.path]}</div></div>` : '',
  ].join('')
  const right = [
    tipwrap(btn({ size: 'vp-sm', icon: true, label: '分栏', labelClass: 'fs-btnlabel' })),
    o.gen ? `<div class="fs-genwrap">${wrapped(btn({ size: 'vp-sm', icon: true, label: o.genLabel || '解读选择', disabled: !!o.genDisabled, labelClass: 'fs-btnlabel' }), inlinePanel('gen'))}</div>` : '',
    o.dirty ? '<span class="fs-dirty">● 未保存</span>' : '',
    // 编辑与保存是**同一个按钮**（`canSave = editMode || dirty` 驱动同一节点换态），复刻里
    // 因此只有一个。`editLabel` 标的是该场景下按钮显示的那一态：有未保存内容（`dirty`）时
    // 是「保存」，否则是「编辑」—— 与源码的 `canSave` 判据一致。
    // 两种文案都是两个汉字、图标都是 16px，几何等价，所以取哪一态不影响任何读数。
    o.edit ? tipwrap(btn({ size: 'vp-md', icon: true, label: o.editLabel || '编辑', labelClass: 'fs-btnlabel' })) : '',
  ].join('')
  return `<div class="fs-wrap">
  <div class="fs-hbar">
    <div class="fs-hbar-left">${left}</div>
    <div class="fs-hbar-mid">${mid}</div>
    <div class="fs-hbar-right">${right}</div>
  </div>
  <div class="fs-body"><div class="fs-side" style="width:280px"><div class="fs-panel"></div></div><div class="fs-split"></div><div class="fs-main"></div>${splitPaneOn ? '<div class="fs-split"></div><div class="fs-splitpane" style="flex-grow:1"><div class="fs-main"></div></div>' : ''}</div>
</div>`
}

// 场景表：`edit` 现已代表**合并后的单个**编辑/保存按钮（旧版这里是 `edit` + `save` 两个），
// `editLabel` 是它在 `canSave = editMode || dirty` 下显示的那一态文案（有 `dirty` 即为「保存」）。
const all = [
  { id: 'S0-empty', ws: 'mid' },
  { id: 'S1-source', ws: 'mid', view: true, path: 'mid', gen: true, dirty: true, edit: true, editLabel: '保存' },
  { id: 'S2-trlong', ws: 'long', view: true, viewLabel: '文章翻译', path: 'long', gen: true, genLabel: '重新翻译', dirty: true, edit: true, editLabel: '保存' },
  { id: 'S3-dir', ws: 'mid', view: true, viewLabel: '目录概览', path: 'mid', gen: true },
  { id: 'S4-trbusy', ws: 'mid', view: true, path: 'long', gen: true, genLabel: '翻译中…', genDisabled: true, dirty: true, edit: true, editLabel: '保存' },
  { id: 'S5-short', ws: 'short', view: true, path: 'short', gen: true, edit: true },
  { id: 'S6-wsxlong', ws: 'xlong', view: true, viewLabel: '文章翻译', path: 'long', gen: true, genLabel: '重新翻译', dirty: true, edit: true, editLabel: '保存' },
]
const scenarios = only6 ? all.slice(0, 6) : all

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>probe-${tag}</title>
${shellCc.map(f => `<link rel="stylesheet" href="file://${SHELL_CSS_DIR}/${f}">`).join('\n')}
<style>
${btnCss}
${menuCss}
${cssSrc}
</style></head><body>
<div id="stage"></div><div id="portal"></div><pre id="OUT"></pre>
<script>
const SCEN = ${JSON.stringify(scenarios.map(s => ({ id: s.id, html: scenario(s), portal: portals(s) })))};
const NARROW = ${sn}, WIDE = ${sw}, MENUS = ${JSON.stringify(menus)};
const DUMP_W = ${JSON.stringify(dumpW)};
const WIDTHS = [];
for (let w = 1200; w >= 701; w -= WIDE) WIDTHS.push(w);
for (let w = 700; w >= 200; w -= NARROW) WIDTHS.push(w);
function inter(a,b){const x=Math.max(a.left,b.left),y=Math.max(a.top,b.top),x2=Math.min(a.right,b.right),y2=Math.min(a.bottom,b.bottom);if(x2<=x||y2<=y)return null;return{left:x,top:y,right:x2,bottom:y2}}
function area(r){return r?(r.right-r.left)*(r.bottom-r.top):0}
function rect(el){const r=el.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom}}
function clipRect(el){let r=rect(el),p=el.parentElement;while(p){const cs=getComputedStyle(p);if(cs.overflowX!=='visible'||cs.overflowY!=='visible'){r=inter(r,rect(p))||{left:0,top:0,right:0,bottom:0}}p=p.parentElement}return r}
/**
 * portal 形态的面板按真实实现定位：锚点 root 的 rect 下方 4px（Menu 读 rootRef 的 getBoundingClientRect）。
 * 面板本身已经是 .mr-portal（position:fixed），这里只补 left/top。内联形态不用管 ——
 * 面板由 .mr-list 的 position:absolute;top:calc(100% + 4px) 自己贴在锚点下方。
 */
function placePortals(){if(MENUS!=='portal')return;const map={ws:'.mr .fs-wsbtn',view:'.fs-viewwrap',gen:'.fs-genwrap'};
 for(const kind in map){const a=stage.querySelector(map[kind]),p=portalEl.querySelector('[data-menu="'+kind+'"]');
  if(!a||!p)continue;const r=rect(a);p.style.left=r.left+'px';p.style.top=(r.bottom+4)+'px'}}
/**
 * 菜单打开态读数：与其它四项**同一套判据**（clipRect）。host 是按**祖先链**实测的承载形态 ——
 * hbar = 面板还在 .fs-hbar 子树里（会被那两条 overflow:hidden 裁），body = 面板已挂到
 * #stage 之外（祖先链无 .fs-hbar）。判据不依赖 --menus 的名字，只看 DOM。
 */
function menuRead(){const res={};for(const p of document.querySelectorAll('[data-menu]')){const kind=p.getAttribute('data-menu');
 const raw=rect(p),vis=clipRect(p);const cx=(vis.left+vis.right)/2,cy=(vis.top+vis.bottom)/2;
 const hit=area(vis)>0.5?document.elementFromPoint(cx,cy):null;
 res[kind]={host:p.closest('.fs-hbar')?'hbar':'body',
  rawH:+(raw.bottom-raw.top).toFixed(1),visH:+(vis.bottom-vis.top).toFixed(1),visW:+(vis.right-vis.left).toFixed(1),
  rawTop:+raw.top.toFixed(1),visTop:+vis.top.toFixed(1),
  gone:area(vis)<=0.5,cropped:area(vis)>0.5&&(vis.bottom-vis.top)<(raw.bottom-raw.top)-0.5,
  hit:!!hit&&(hit===p||p.contains(hit))}}return res}
function colOf(el){if(el.closest('.fs-hbar-left'))return'L';if(el.closest('.fs-hbar-mid'))return'M';if(el.closest('.fs-hbar-right'))return'R';return null}
function tag(el){const cls=el.className.split(' ').filter(c=>c!=='vp-ghost'&&c!=='vp-btn').slice(0,2).join('.');return cls+':'+(el.textContent||'').slice(0,8)}
const stage=document.getElementById('stage'),portalEl=document.getElementById('portal'),out=[];
for(const scen of SCEN){stage.innerHTML=scen.html;portalEl.innerHTML=scen.portal;const wrap=stage.querySelector('.fs-wrap');
 for(const w of WIDTHS){wrap.style.width=w+'px';void wrap.offsetHeight;placePortals();
  let cand=[...stage.querySelectorAll('button, .fs-hd-path, .fs-dirty')].filter(el=>colOf(el));
  cand=cand.filter(el=>!cand.some(o=>o!==el&&el.contains(o)));
  const items=cand.map(el=>{const vis=clipRect(el),raw=rect(el);
    let clickable=false;
    let hitTag='';
    if(area(vis)>0.5){const cx=(vis.left+vis.right)/2,cy=(vis.top+vis.bottom)/2;const hit=document.elementFromPoint(cx,cy);clickable=!!hit&&(hit===el||el.contains(hit)||hit.contains(el));hitTag=hit?(hit.tagName+'.'+String(hit.className).slice(0,30)):'NULL'}
    return{col:colOf(el),vis,raw,cls:tag(el),clickable,hitTag}});
  const visPairs=[],sameCol=[],goneList=[],unclickList=[];
  for(const it of items){const ra=area(it.raw),va=area(it.vis);
    if(ra>0&&va<=0.5)goneList.push(it.col+'|'+it.cls);
    else if(ra>0&&!it.clickable)unclickList.push(it.col+'|'+it.cls+'@'+it.hitTag)}
  for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j];const ia=area(inter(a.vis,b.vis));
   if(ia>0.5)(a.col===b.col?sameCol:visPairs).push([a.cls,b.cls,+ia.toFixed(0)])}
  const cols=['fs-hbar-left','fs-hbar-mid','fs-hbar-right'].map(c=>stage.querySelector('.'+c)).filter(Boolean);let colOverlap=0;
  for(let i=0;i<cols.length;i++)for(let j=i+1;j<cols.length;j++)if(area(inter(rect(cols[i]),rect(cols[j])))>0.5)colOverlap++;
  const hb=rect(stage.querySelector('.fs-hbar'));
  if (DUMP_W && w === DUMP_W) {
    out.push({s:scen.id,w,dump:items.map(it=>({col:it.col,cls:it.cls,
      raw:[+it.raw.left.toFixed(1),+it.raw.right.toFixed(1),+it.raw.top.toFixed(1),+it.raw.bottom.toFixed(1)],
      vis:[+it.vis.left.toFixed(1),+it.vis.right.toFixed(1),+it.vis.top.toFixed(1),+it.vis.bottom.toFixed(1)],
      clickable:it.clickable,hitTag:it.hitTag})),
      colBoxes:cols.map(c=>({c:c.className,box:[+rect(c).left.toFixed(1),+rect(c).right.toFixed(1),+rect(c).top.toFixed(1),+rect(c).bottom.toFixed(1)]})),
      hbar:[+hb.left.toFixed(1),+hb.right.toFixed(1),+hb.top.toFixed(1),+hb.bottom.toFixed(1)],
      panes:[...stage.querySelectorAll('.fs-main, .fs-splitpane')].map(p=>({c:p.className,w:+(rect(p).right-rect(p).left).toFixed(1)}))
      ,...(MENUS?{menu:menuRead()}:{})})
    continue
  }
  out.push({s:scen.id,w,visN:visPairs.length,sameColN:sameCol.length,goneN:goneList.length,
    unclickN:unclickList.length,
    goneRightN:goneList.filter(x=>x.startsWith('R|')).length,
    goneMidN:goneList.filter(x=>x.startsWith('M|')).length,
    goneLeftN:goneList.filter(x=>x.startsWith('L|')).length,
    // 补充口径：右列元素「可见但不完整」（部分裁切）——门禁只算整块裁掉，这里给出更细的读数。
    partRightN:items.filter(it=>it.col==='R'&&area(it.raw)>0.5&&area(it.vis)>0.5&&(it.vis.right-it.vis.left)<(it.raw.right-it.raw.left)-0.5).length,
    goneList:goneList.slice(0,8),unclickList:unclickList.slice(0,8),vis:visPairs.slice(0,3),same:sameCol.slice(0,3),colN:colOverlap,
    // 顶栏「单行」断言：折行会让顶栏高度成倍增长，故以高度集合判定是否全程单行。
    hbarH:+(hb.bottom-hb.top).toFixed(1),
    // 菜单打开态（只有 --menus 会注入面板，故不带该选项时这一字段不出现）：面板自身的
    // 可见高 / 是否被整块裁 / 承载形态（按祖先链判：hbar＝仍在 .fs-hbar 子树里）。
    ...(MENUS?{menu:menuRead()}:{}),
    // 两档的切换点断言：工作区 label 是否已让位、右列三个按钮的 label 是否在图标态。
    wsLabShown:(function(){const e=stage.querySelector('.fs-wslabel');return e?e.offsetWidth>0:null})(),
    wsBtnW:(function(){const e=stage.querySelector('.fs-wsbtn');return e?+e.getBoundingClientRect().width.toFixed(1):null})(),
    genLabShown:(function(){const e=stage.querySelector('.fs-genwrap .fs-btnlabel');return e?e.offsetWidth>0:null})(),
    hbarOverflowRight:+(hb.right-(wrap.getBoundingClientRect().right-14)).toFixed(1)})}}
document.getElementById('OUT').textContent=JSON.stringify(out);
</script></body></html>`

fs.mkdirSync(outDir, { recursive: true })
// 打开态跑两个形态时产物会互相覆盖，故文件名带上形态（不带 --menus 时与旧文件名一致）。
const suffix = menus ? `-${menus}` : ''
const outFile = path.join(outDir, `probe-${tag}${suffix}.html`)
fs.writeFileSync(outFile, html)
// --window-size 必须比最宽采样档大出一截：窗口不够宽时视口外的元素拿不到
// elementFromPoint 命中，会被判成「不可点」=> 假红（见 README「跑法」）。
const dump = execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', `--window-size=${winSize}`, '--virtual-time-budget=60000', '--dump-dom',
  'file://' + outFile,
], { maxBuffer: 512 * 1024 * 1024 }).toString()
const m = /<pre id="OUT">([\s\S]*?)<\/pre>/.exec(dump)
if (!m) throw new Error('未从 dump 里取到 OUT')
const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
const jsonFile = path.join(outDir, `out-${tag}${suffix}.json`)
fs.writeFileSync(jsonFile, JSON.stringify(data, null, 1))
console.log('wrote', jsonFile, 'rows=', data.length)

const byScen = {}
for (const r of data) {
  const k = r.s
  byScen[k] ||= { vis: 0, same: 0, gone: 0, n: 0, goneW: [], visW: [], sameW: [], goneRightW: [], rows: new Set(), hbarHs: new Set() }
  const b = byScen[k]
  b.n++
  if (r.visN > 0) { b.vis++; b.visW.push(r.w) }
  if (r.sameColN > 0) { b.same++; b.sameW.push(r.w) }
  if (r.goneN > 0) { b.gone++; b.goneW.push(r.w) }
  if (r.goneRightN > 0) b.goneRightW.push(r.w)
  b.hbarHs.add(r.hbarH)
}
const rng = a => a.length ? `${Math.min(...a)}–${Math.max(...a)}` : '-'
// 菜单打开态专项（只有 --menus 跑得出数据）：面板自身的可见高与被整块裁掉的档数。
// 判据与四项门禁**同一套**（clipRect = 元素矩形 ∩ 所有 overflow!=visible 祖先裁剪盒）。
if (menus) {
  const per = {}
  for (const r of data) for (const k of Object.keys(r.menu || {})) {
    const mm = r.menu[k]
    per[k] ||= { n: 0, gone: 0, cropped: 0, noHit: 0, minVisH: Infinity, rawH: 0, hosts: new Set(), badW: [], hs: new Set() }
    const b = per[k]
    b.n++
    b.rawH = Math.max(b.rawH, mm.rawH)
    b.minVisH = Math.min(b.minVisH, mm.visH)
    b.hs.add(mm.visH)
    b.hosts.add(mm.host)
    if (mm.gone) { b.gone++; b.badW.push(r.w) } else if (mm.cropped) { b.cropped++; b.badW.push(r.w) }
    if (!mm.hit) b.noHit++
  }
  console.log(`菜单打开态（--menus=${menus}${menuOnly ? ' --menu=' + menuOnly : ''}）| 面板 | 档数 | 承载形态（祖先链） | 被整块裁 | 被裁（部分+整块） | 最小可见高 | 面板高 | 中心不可命中`)
  for (const [k, b] of Object.entries(per)) {
    console.log(`${k} | ${b.n} | ${[...b.hosts].join('/')} | ${b.gone} | ${b.cropped + b.gone} [${rng(b.badW)}] | ${b.minVisH.toFixed(1)} | ${b.rawH.toFixed(1)} | ${b.noHit}`)
    const hs = [...b.hs].sort((x, y) => x - y)
    console.log(`  ${k} 可见高集合（去重，最多列 8 个）: ${hs.slice(0, 8).join(', ')}${hs.length > 8 ? ' …' : ''}`)
  }
}
console.log('场景 | 档数 | 跨列重叠 | 同列重叠 | 被裁 | 右列被裁 | 顶栏高集合')
for (const [k, b] of Object.entries(byScen)) {
  console.log(`${k} | ${b.n} | ${b.vis} [${rng(b.visW)}] | ${b.same} [${rng(b.sameW)}] | ${b.gone} [${rng(b.goneW)}] | ${b.goneRightW.length} [${rng(b.goneRightW)}] | ${[...b.hbarHs].join(',')}`)
}
const t = (f) => data.filter(f).length
console.log('合计:', JSON.stringify({
  vis: t(r => r.visN > 0), same: t(r => r.sameColN > 0), gone: t(r => r.goneN > 0),
  goneRight: t(r => r.goneRightN > 0), partRight: t(r => r.partRightN > 0),
  partRightW: (function(){const w=data.filter(r=>r.partRightN>0).map(r=>r.w);return w.length?Math.min(...w)+'–'+Math.max(...w):'-'})(), hbarH: [...new Set(data.map(r => r.hbarH))].join('/'),
}), '/ 总档数', data.length)
