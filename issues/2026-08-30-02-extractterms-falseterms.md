---
date: 2026-08-30
status: 已验证关闭
skill: source-doc
type: 脚本bug
severity: 高
recurrence: 1
related: "skills/source-doc/scripts/source-annotate.mjs（extractTerms 函数）"
---

# 术语表抽取会把普通标识符误收为术语（false/define/code/client 等）

> 本次用 `scripts/build.mjs` 真实源码跑完整流程时实测暴露。属脚本判断规则缺陷，最影响产出质量。

## 场景（怎么触发）

填注解时代码行说明写成 `English（中文）` 结构，例如给 `write: false` 填了 `write 设为 false（不立即写盘，稍后手动处理输出）`，或 `define: {` 填 `define（替换宏）配置`。build 后术语表出现 `false`、`define`、`code`、`info`、`client`、`bundle`、`production` 等**明显不是术语**的条目。

## 现象（看到了什么）

术语表（首次出现的中文翻译）里混入大量非术语标识符：

| `false` | `不立即写盘，稍后手动处理输出` |
| `define` | `替换宏` |
| `code` | `bundle 源码` |
| `info` | `输出打包过程信息日志` |
| `client` | `React 客户端入口` |
| `bundle` | `打包全部依赖` |

这些要么是普通英文词、要么是 JS 关键字，本不该进术语表。

## 根因（为什么会这样）

`extractTerms` 只做**结构匹配**（正则 `([A-Za-z_]\S*)\s*（([^（）]+)）`），凡注解里出现 `English（中文）` 就收，**不判断该标识符是否真是术语**。它仅靠 `ENGLISH_ID` 校验标识符形状、`NOT_A_TERM_CN` 拦截说明性中文，但**没有任何"常见词/关键字黑名单"**，因此 `false`/`define`/`code`/`write` 等全会漏进来。相对地，`skeleton` 阶段的术语候选预扫（`collectTermCandidates`）是有黑名单的——`extractTerms` 却缺同款过滤，两者标准不一致。

## 改法 / 临时绕过

1. **即时绕过**：填注解时**不要**给普通词（`false`/`write`/`code`/`define`/`info` 等非领域术语）加 `（中文）`，只给真正的领域/专有术语（如 `PLATFORM_MODULES`、`esbuild`、`createRequire`）标 `English（中文）`。
2. **根治**：给 `extractTerms` 补一个与 `collectTermCandidates` 对齐的黑名单（拦截 `false`/`true`/`null`/`code`/`data`/`info`/`define`/`bundle`/`write`/`client` 等常见词与 JS 关键字），并让 `.book` 术语表与骨架候选共用同一份黑名单（消除标准不一致）。

## 复验（如何确认已解决）

重新跑 `build.mjs`（42 单元）完整流程，术语表应只含 `esbuild`/`PLATFORM_MODULES`/`createRequire`/`writeFileSync`/`MarkdownText`/`CodeBlock` 等真术语，**不出现** `false`/`define`/`code`/`info`/`client`。>=`已解决` 前复验需通过。

---
# 状态机流转

- 连带问题：`react/jsx-runtime` 抽词粒度把 `jsx-runtime`（而非 `react/jsx-runtime`）收为术语——是同一 `extractTerms` 的分词边界问题，一并纳入本条的修复范围。
