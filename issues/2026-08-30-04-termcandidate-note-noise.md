---
date: 2026-08-30
status: 已验证关闭
skill: source-doc
type: 判断失误
severity: 低
recurrence: 1
related: "skills/source-doc/scripts/source-annotate.mjs（collectTermCandidates 函数）"
---

# 术语候选预扫会在英文注释文本上误报（Build/Externals/The/MUST）

> `skeleton` 阶段的术语候选清单把英文注释里句首大写的普通词也列进了候选。属低危噪声（候选是"提示"非强制），但会干扰模型判断。

## 场景（怎么触发）

源文件头部有多行英文注释（如 build.mjs 第 1-10 行的块注释）。`skeleton` 用正则扫全部源码行，把注释里 `Build`、`Externals`、`Everything`、`The`、`MUST` 等**第一个词大写**的普通英文也匹配进候选。

## 现象（看到了什么）

疑似术语候选清单里出现：

```
#   Build
#   Externals
#   Everything
#   The
#   MUST
```

这些既非代码标识符也非领域术语，属于误报。

## 根因（为什么会这样）

`TERM_CANDIDATE_RE` 用 `[A-Z][A-Za-z0-9_]+|[a-z]+[A-Z]...` 匹配——它不区分**注释文本**与**代码标识符**，对注释里句首大写的普通英文词也命中；且黑名单只含 JS/Node 关键字，没含 `The`/`Build`/`Everything` 这类通用大写词。

## 改法 / 临时绕过

1. **即时绕过**：模型看候选清单时忽略明显非术语的普通词（候选本就是"提示"）。
2. **根治**：`collectTermCandidates` 可跳过**注释行/字符串**里的词（先按行是否 `//` 开头判断，或只在非注释代码行抽取标识符）；或扩充黑名单收录常见大写词（`The`/`Build`/`Everything`/`This` 等）。候选清单头部加一句"仅代码标识符、不含注释文本"更清晰。

## 复验（如何确认已解决）

对 build.mjs 跑 `skeleton`，候选清单不应出现 `The`/`Build`/`Everything`/`MUST` 这类注释里的普通词。

---
# 状态机说明
- 低危：候选是提示性的，不影响 build 正确性；治本优先级低于 `extractTerms` 误收问题。
