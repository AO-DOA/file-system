---
date: 2026-09-09
status: 已解决
skill: source-doc
type: 流程不畅
severity: 中
recurrence: 1
related: ""
---

# L3 骨架多行注释块只有首行带「代码: 」前缀，按全行带前缀构造替换串导致 edit 失败返工

> **2026-09-09 主线修复**：`src/host/abilities/source-doc/prompt.md` 的骨架格式段补齐了
> 「块内其余行是裸源码行、只有块首行带 `代码: ` 前缀」与「`@摘要` 段没有 `代码: ` 行」两条，
> 并要求 `edit` 逐条容错（单条失败只重拼那一条）。提示词免 build/免重启，下次派发即生效。

## 场景（怎么触发）
L3 逐行注解填充，用 edit 分批把注解写入骨架 /home/xuepeng/.dsh/books/session/skeleton-task-utils.js.txt。第一批 7 条 edit 一次性提交，第一条（@摘要）成功，其余按「每个代码行都带 代码: 前缀」拼接 old_string。

## 现象（看到了什么）
run_code 抛 ToolCallError: old_string was not found in ".../skeleton-task-utils.js.txt"。批内第一条已生效、其余全部未生效，需重读骨架逐行比对 JSON 串，才能看清注释块内部行不带前缀，重新构造 old_string 才填完。

## 根因（为什么会这样）
骨架格式约定只写「紧跟 代码: <源码原文>」，没有说明多行注释块内部行是否逐行带前缀。实际骨架里只有块的第一行带「代码: 」，块内其余注释行是裸源码行，注解行前的定位串因此拼错。

## 改法 / 临时绕过
改为「取该单元最后一行源码原文 + 换行 + 注解: 」作为 old_string 定位，并把每个 edit 包在 try/catch 里逐条打印失败，避免一条失败中断整批。

## 复验（如何确认已解决）
填完后用程序解析骨架的 @行/@块 标签与代码行，与目标源码逐行比对，22 个单元全部一致、22 个注解槽无空槽（脚本输出 problems: 0）。
