# 2026-09-12 让分栏分隔条的常态竖线消失，只留悬停提示线

任务书原文：`agent/sessions/session-927b055f-e595-44c2-aacb-d2de7145c227/briefs/2026-09-12-hide-idle-divider-line.md`
仓库 `plugins/dsh-plugin-file-system-zc`，起点 HEAD `d99eae4`。本单**未提交**、**未重启 `dsh web`**。

## 一句话
`.fs-split::before`（常态那条 0.5px 发丝线）**整条规则删掉**，8px 命中区、悬停/拖拽渐隐提示线、`cursor:col-resize` 与拖拽交互（`startDrag` / `startSplitDrag` / `.active`）全数保留；两处复用（左树↔内容、分屏两窗格）共用同一条规则，观感一致 —— 用户要的是「都别有线」，两条接缝的职责也完全相同，没有分叉理由。

## 为什么选「删规则」而不是「去掉 background」
`::before` 唯一的职责就是画那条线。把 `background` 拿掉会留下一个不画任何东西、却仍挂着绝对定位盒的伪元素，读代码的人还要先确认它真的没画东西；删掉更干净。8px 命中区由 `::after` 独力提供（`left:-4px;right:-4px`，`opacity:0` 时仍参与命中测试），与 `::before` 无关，删它不动拖拽可点性。

## 恢复方法（一句话）
把 `.fs-split::before{top:0;bottom:0;left:-.25px;width:.5px;background:var(--dsw-alias-border-l4,rgba(127,127,127,.2))}` 加回，并把 `.fs-split::after{content:"";position:absolute}` 的选择器改回 `.fs-split::before,.fs-split::after`。

## 落点与证据

| 项 | 值 |
|---|---|
| 源码改动 | `src/client/index.tsx`（`+20/−12`，纯 CSS 文本与注释；`.fs-side` 段与 `::after` 段注释同步订正，免得注释撒谎） |
| 测试 | `tests/client-view.spec.ts`（`+14/−0`，新增 1 例：断言样式表里**不再含** `.fs-split::before`，且 `::after` 的 8px 命中区、`:hover/.active` 提示线、`width:0 + cursor:col-resize` 三件仍在） |
| 产物 | `client/client.js` **70020 字节**（`npm run build` 成功：`tsc -b tsconfig.host.json` + tsdown + banner normalize/verify 全通过） |
| 几何探针 | **未做**（本单豁免）。唯一改动是删掉一个不占位（`width:0` 元素上的）伪元素的绘制，`width`/`left`/`right` 数值一字未动 ⇒ 不改布局 |

## 门禁实况（`node scripts/verify-stage.mjs`）

1. 任务书原命令 `--allow src/client/index.tsx,tests/client-view.spec.ts`：四道门禁 **全 PASS**（typecheck / lint / test / coverage）；**仅「范围守卫」FAIL**，越界 3 项 `PROGRESS.md`、`README.md`、`docs/spec-ui-revamp.md`。
   这 3 项是**开工前既有的工作树改动**——本单第一步 `git status --porcelain` 就记到 ` M PROGRESS.md` / ` M README.md` / ` M docs/spec-ui-revamp.md`，本单全程未触碰它们（也未做任何 git 写操作）。
2. 把上述 3 项一并纳入授权面复跑：`--allow src/client/index.tsx,tests/client-view.spec.ts,PROGRESS.md,README.md,docs/spec-ui-revamp.md` ⇒ **全绿**（守卫 5 项全在授权面内 / typecheck / lint / test 151 例 / coverage）。

## 收工补充（事实更新，01:17 复查）
那 3 项既有文档改动已由**父代理自己**在提交 `8689a91`（`docs: 订正「改 client 也要重启」错误记录…`，01:16:02）里提交，与本单无关。此刻 `git status --porcelain` 只剩：` M src/client/index.tsx`、` M tests/client-view.spec.ts`、`?? docs/agent/reports/2026-09-12-hide-idle-divider-line.md`。

## 未做 / 未验
1. 未重启 `dsh web`（授权禁止）：真实页面观感未看。client 半边 build 后刷新页面即生效。
2. 悬停态未在真浏览器里验（headless 不能真 `:hover`）；新断言只钉样式表文本，不证明渲染观感。
