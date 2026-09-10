---
date: 2026-09-09
status: 已解决
skill: source-doc
type: 流程不畅
severity: 中
recurrence: 1
related: ""
---

# 骨架填充时用「代码行 + 注解行」作锚点，遇到重复代码行会匹配失败

> **2026-09-09 主线修复**：`src/host/abilities/source-doc/prompt.md` 收敛出**锚点统一规则**——
> `old_string` 一律取「标签行（`@行 [N]` / `@块 [N-M]` / `@摘要（…）`）起，到该单元 `注解: ` 空位行止」的整段原文；
> 标签行唯一，一次覆盖本条（重复代码行）+ #13（块内裸行前缀）+ #16（行号推算错位）三类返工。

## 场景（怎么触发）
L3 逐行注解任务，按批 ≤20 单元执行 edit。批 3 中有一条单元的锚点拼成 `代码:     const now = Date.now()
注解: `，该行在骨架里出现两次（@行 [72] 的 knownBookRoots 与 @行 [154] 的 cachedBookView 各一处）。

## 现象（看到了什么）
`edit` 返回失败：`old_string matched 2 times in "skeleton-book-store.js.txt"; provide a more specific old_string or set replace_all to true`，该批 19/20 生效，1 条未填，需在下一批补回。

## 根因（为什么会这样）
骨架的 `代码: ` 行是源码原文，同一句在源码中重复出现时，仅靠「上一行代码 + 空注解行」无法唯一定位；而 `@行 [N]` / `@块 [N-M]` 标签在骨架里是唯一的，未把标签纳入锚点。

## 改法 / 临时绕过
改为从标签行开始读取到第一个 `注解: ` 行为止，用读到的整段原文拼 `old_string`（锚点含 `@行 [N]`，天然唯一），批 4 起用此法，返工条一并补回，后续各批 20/20 生效。

## 复验（如何确认已解决）
最后核对骨架 443 行中无空 `注解: ` 空位，且 135 个单元的代码行与源文件 186 行逐行比对 mismatches=0。
