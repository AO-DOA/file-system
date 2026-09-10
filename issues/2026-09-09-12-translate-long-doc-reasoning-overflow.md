---
date: 2026-09-09
status: 已验证关闭
skill: translate-doc
type: 流程不畅
severity: 高
recurrence: 1
related: "docs/ptc-probe-2026-09-09.md"
---

# 长文档翻译把整篇译文写进推理，耗尽输出预算后空转（产物未落盘）

## 场景（怎么触发）

GUI「翻译」按钮对一篇 18KB 英文技术文档触发：`POST /api/fs/translate {"path":"deepseekHARNESS/docs/api-gateway.md"}`（源文 164 行，术语密集）。

## 现象（看到了什么）

任务 22.7s 后 `status=error`：

```
译文未写入目标文件: /home/xuepeng/.dsh/books/--home-xuepeng-DSH--/文章翻译/deepseekHARNESS-docs-api-gateway.md
```

子会话只有 2 步：step1 读源正常；**step2 的 `outputTokens=8192`（打满单步上限）、`reasoningTokens=8192`，既无 tool-call 也无文本**，随后本轮结束——模型在推理里逐段翻译，预算被思考吃光，一次工具调用都没发出。目标目录下没有任何文件。

宿主侧空转校验（`译文未写入目标文件`）正确置 `error`，没有误报 `success`——这部分按预期工作。

## 根因（为什么会这样）

1. 模板要求「读源 → 一次 write 整篇译文」。一篇 18KB 英文的中文译文远超单步输出预算（8192），单步根本写不完。
2. 模型的默认习惯是「先在思考里把内容想清楚再落笔」，于是把整篇译文写进了 reasoning，输出预算先被推理耗尽 → 没有工具调用 → 空转。
3. 翻译层工具面当时只有 `read`+`write`，没有 `edit`，因此模板也无法表达「分段落盘」。

对比：同一模板处理中文源文档（GLOSSARY.md，19KB）只用了 3 步、41,187 tokens 且成功——因为「中文→中文」无需生成新文本，模型没有在推理里写译文。缺陷只在**需要真正翻译的长文档**上暴露。

## 改法 / 临时绕过

- `src/host/prompts/gen-translate.md`：改为「先 write 骨架 + 锚点 `<!-- FS_TRANSLATE_CURSOR -->` → 按源文 30~60 行一批 `edit` 追加 → 最后删锚点」，并加【输出预算铁律】：绝不在思考里写译文、每次回答先发工具调用、译文必须分段落盘。
- `src/host/fs-utils.js`：`GEN_SCOPE_TOOLS.translate` 增加 `edit`（`['read','write','edit']`）。
- `src/host/index.js`：`runTranslate` 前置语种校验——源文已是简体中文直接置 `error`（`isMostlyChinese()`），不再白烧 token 启动子会话。

## 复验（如何确认已解决）

对同一篇 18 KB 英文文档重跑翻译：任务 `success`；产物前四行为 frontmatter + 空行、标题为「…（中文译文）」、正文与源文结构一一对应、无锚点残留；子会话步数 ≥3 且**每一步都有工具调用**（`outputTokens` 不再打满 8192）。

**实测（2026-09-09 01:08，重启后）**：源 `DSHworkPace/graph-memory/README.md`（18,141 字节 / 413 行）→ 任务 `success`，34.8s，产物 17,609 字节 / 413 行；14 步中前 13 步均为 `run_code` 工具调用、无空转，`outputTokens` 峰值 1,450（远未打满）；frontmatter 三行齐全、术语首现注译（`agent（智能体）`、`Compaction（压缩）`）、锚点 0 残留；子 agent 收尾只回一句「本次任务完美执行」，顺利时未写任何台账。中文源复验：`GLOSSARY.md` → 直接 `error`「源文档已是简体中文，无需翻译」，未创建子会话。

遗留：本次 14 步、290,820 tokens（cacheRead 263,040）偏高——每批 30~60 行的批量偏小，步数被放大；已记为待办 #14。

**二次实测（2026-09-09 01:15，批量改由子 agent 自行判断后）**：源 `Claude-Fable-5.1-prompt-split/22-search_instructions.md`（28,376 字节 / 244 行，中文标题 + 英文正文，语种判定通过）→ 任务 `success`，46.3s，产物 26,828 字节 / 253 行、锚点 0 残留、收尾只回一句。子会话 13 步，其中 12 步 `run_code`、末步收尾无工具调用；`outputTokens` 500~2,401（单步预算 8,192，利用率 6~30%）——**模型自选批量仍偏保守，步数未下降（14 → 13），总 293,155 tokens**。结论：成本瓶颈是每步重放的 cacheRead（≈20K/步 × 步数），而非批量行数本身。
