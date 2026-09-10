---
date: 2026-09-09
status: 已验证关闭
skill: source-doc
type: 判断失误
severity: 低
recurrence: 1
related: ""
---

# L3 骨架注解中混入凭空名称「rootsRoot 占位」需二次 edit 修正

## 场景（怎么触发）
为 dsh-plugin-file-system/src/host/book-store.js 填充 L3 逐行注解，第一批（19 个单元）一次性写入时，写到「@行 [7]」——该行是从 fs-utils.js 引入 8 个书库工具函数的 import 语句。

## 现象（看到了什么）
第一次 edit 写入的注解为「…legacyBookDir（旧库目录）、rootsRoot 占位、booksRoot（书库根）…」，其中 rootsRoot 并不存在于该 import 列表，属于凭空补入的名称；骨架中已落盘该错误注解，需再发一条 edit 覆盖修正。

## 根因（为什么会这样）
批量填充时按「一次性列出全部单元注解」的节奏书写，未在写完后逐条回读比对源码原文，凭记忆补全 import 名称列表，导致夹带不存在的标识符。

## 改法 / 临时绕过
在第二批的同一程序里追加一条精确 edit：以该条错误注解整行为 old_string、去掉 rootsRoot 后的文本为 new_string，覆盖修正（返回 fixed [7]）。

## 复验（如何确认已解决）
重新读回骨架全文，统计「注解: 」行共 136 条、空注解 0 条、无中文注解行 0 条；抽查 @行 [7] 行内容已不含 rootsRoot，且 443 行与 135 条「代码: 」行与原始骨架一致。

2026-09-10 判定：**无宿主可修项**（[docs/l3-deskill-summary-2026-09-10.md](../docs/l3-deskill-summary-2026-09-10.md) §89）。根因是模型凭记忆补全 import 名、夹带不存在的标识符，属模型侧自律；提示词已有「不编造」约束，宿主无法判定某个注解词是否凭空。按模型侧问题关闭，归入归档。
