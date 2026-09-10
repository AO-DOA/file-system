---
date: 2026-09-09
status: 已解决
skill: source-doc
type: 判断失误
severity: 低
recurrence: 1
related: ""
---

# 骨架填空时误把「注解行自身」当上下文，edit 的 old_string 不唯一

> **2026-09-09 主线修复**：同一处提示词补齐——`src/host/abilities/source-doc/prompt.md` 明确
> `@摘要` 段只有 `@摘要（…）` 提示行 + 一行 `注解: `（**无** `代码: ` 行），并要求按实际读到的原文拼 `old_string`。

## 场景（怎么触发）
L3 逐行注解任务，用 tools.read 读回骨架后，以「代码行 + 换行 + 注解行」拼接 old_string 精确匹配，再在注解行末尾追加释义。填充 @摘要 单元时，代码参数写成 `fill([10, 11].slice(1), 11, ...)`，等价于 codes=[11]、anno=11。

## 现象（看到了什么）
edit 抛错：`ToolCallError: old_string was not found in "/home/xuepeng/.dsh/books/session/skeleton-task-utils.js.txt"`，拼出的 old_string 实际为「注解: \n注解: 」这种自重复串，自然匹配不到；该批 7 条注解一条未落盘，整批重跑。

## 根因（为什么会这样）
骨架里 @摘要 单元只有一行（第 10 行是 @摘要 提示行，第 11 行才是「注解: 」），没有「代码: 」行；我用通用的 (codes, anno) 构造器时给摘要传了注解行本身当上下文，等于把同一条「注解: 」重复两次。

## 改法 / 临时绕过
把摘要单元改为 `fill([10], 11, ...)`，即用第 10 行 @摘要 提示行作上下文，重跑该批成功。

## 复验（如何确认已解决）
重跑后 23 个注解单元全部填充；读回骨架核对：注解单元数 23、空注解行 []、行号与「代码: 」行与源码逐行一致。
