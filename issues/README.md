# issues — 技能问题台账（失败证据库）

> **这张表只记"技能哪里不好使"**：使用技能时遇到的返工、报错、产出跑偏、路径失效、判断失误。
> 它**独立于**技能的能力说明（SKILL.md）——SKILL.md 写技能"能做什么和怎么做"，这里写技能"哪里会出问题"，两张表对比看，就知道该往哪个方向进化技能。

## 约定

- **目录结构**：一问题一文件 `issues/<date>-<序号>-<slug>.md`，本 `README.md` 是统一索引表。
- **文件模板**：复制 [\_template.md](_template.md)（复制时删掉模板注释行），frontmatter 填结构化字段。
- **索引表**：每个问题在下方表里加一行；问题状态/重复次数变化时，同步更新该行（保持单一事实来源——文件是权威，索引表是视图）。索引按下节拆「活跃（待处理）」与「已归档（已验证关闭 / 已解决）」两区。
- **状态机**（四态闭环）：
  `问题提交 → 分析中 → 已解决 → 已验证关闭`
- **重复计数**：同类问题再次触发，`recurrence` +1。**高重复且非"已验证关闭"的问题，才是真正驱动技能进化、值得改 SKILL.md 的**。
- **零噪声**：本轮没遇到问题就**跳过**，不记"这次很顺利"。
- **归档**：问题到「已验证关闭 / 已解决」即将其从「活跃」区移入「已归档」区；文件原位不动，仅索引区调整（零破链）。

## 索引表

### 活跃（待处理）

当前**无待处理问题** —— 台账已清扫完毕（2026-09-10）。

### 已归档（已验证关闭 / 已解决）

| 日期 | 问题 | 技能 | 类型 | 状态 | 重复 | 关联 |
|---|---|---|---|---|---|---|
| 2026-08-30 | build 曾强制要求 `--src`，跨项目不便且多读一次源文件 | source-doc | 流程不畅 | 已验证关闭 | 2 | [2026-08-30-01](2026-08-30-01-build-src-optional.md) |
| 2026-08-30 | 术语表抽取会把普通标识符误收为术语（false/define/code/client 等） | source-doc | 脚本bug | 已验证关闭 | 1 | [2026-08-30-02](2026-08-30-02-extractterms-falseterms.md) |
| 2026-08-30 | layout 传 `.` 把项目名解析成 `.`，书库根错成 `.book/.-book` | source-doc | 环境路径 | 已验证关闭 | 1 | [2026-08-30-03](2026-08-30-03-layout-dot-path.md) |
| 2026-08-30 | 术语候选预扫在英文注释文本上误报（Build/Externals/The/MUST） | source-doc | 判断失误 | 已验证关闭 | 1 | [2026-08-30-04](2026-08-30-04-termcandidate-note-noise.md) |
| 2026-08-30 | 全新书库无 index.json 时 build 报错退出，需先手动初始化 | source-doc | 脚本bug | 已验证关闭 | 1 | [2026-08-30-05](2026-08-30-05-build-no-indexjson.md) |
| 2026-08-30 | 填充时把独立源码行注解挤进前一行，行号错位（meta={} 大块合并） | source-doc | 判断失误 | 已验证关闭 | 1 | [2026-08-30-06](2026-08-30-06-fill-meta-block-merge.md) |
| 2026-08-31 | build 产物排版乱（注解与代码错位、被空行割裂），且脚本无排版防错；局部变量误收进术语表 | source-doc | 脚本bug | 已验证关闭 | 1 | [2026-08-31-07](2026-08-31-07-layout-mess-no-guard.md) |
| 2026-09-03 | gen --content 传文件路径时把路径字符串写进文档，覆盖整篇正文 | folder-doc | 脚本bug | 已验证关闭 | 1 | [2026-09-03-08](2026-09-03-08-gen-content-path-overwrite.md) |
| 2026-09-07 | translate-doc 声称脚本兜 frontmatter（模型不要手写），但 gen --content 原样落盘，照做产物缺 frontmatter 头 | translate-doc | 脚本bug | 已验证关闭 | 1 | [2026-09-07-09](2026-09-07-09-translate-doc-frontmatter-not-generated.md) |
| 2026-09-08 | `--content` 实为整篇覆盖（含 frontmatter/目录树），与 SKILL.md「覆盖模板骨架」表述不一致，需三步才完成一次生成 | folder-doc | 流程不畅 | 已验证关闭 | 1 | [2026-09-08-10](2026-09-08-10-folder-doc-content-whole-override.md) |
| 2026-09-08 | 只认 `session.jsonl.zstd`，v2 格式会话（`session.v2.jsonl.zstd`）被误报「日志未找到」，致复盘读错同名会话 | session-finder | 脚本bug | 已解决 | 1 | [2026-09-08-11](2026-09-08-11-session-finder-v2-log-filename.md) |
| 2026-09-09 | 长文档翻译把整篇译文写进推理，耗尽输出预算后空转（产物未落盘） | translate-doc | 流程不畅 | 已验证关闭 | 1 | [2026-09-09-12](2026-09-09-12-translate-long-doc-reasoning-overflow.md) |
| 2026-09-09 | L3 骨架多行注释块只有首行带「代码: 」前缀，按全行带前缀构造替换串导致 edit 失败返工 | source-doc | 流程不畅 | 已解决 | 1 | [2026-09-09-13-l3-skeleton-block-code-prefix](2026-09-09-13-l3-skeleton-block-code-prefix.md) |
| 2026-09-09 | 骨架填空时误把「注解行自身」当上下文，edit 的 old_string 不唯一 | source-doc | 判断失误 | 已解决 | 1 | [2026-09-09-14-l3-anno-old-string-context-mismatch](2026-09-09-14-l3-anno-old-string-context-mismatch.md) |
| 2026-09-09 | 产物 DOC 被一次试探性 write 清空，需整篇重写恢复 | file-doc | 判断失误 | 已验证关闭 | 1 | [2026-09-09-15-doc-clobbered-by-probe-write](2026-09-09-15-doc-clobbered-by-probe-write.md) |
| 2026-09-09 | 骨架批量填注解时把「块注释的注解行」与其后首个代码单元的注解行错位 | source-doc | 流程不畅 | 已解决 | 1 | [2026-09-09-16-l3-annotation-line-offset-mismatch](2026-09-09-16-l3-annotation-line-offset-mismatch.md) |
| 2026-09-09 | 骨架填充时用「代码行 + 注解行」作锚点，遇到重复代码行会匹配失败 | source-doc | 流程不畅 | 已解决 | 1 | [2026-09-09-17-l3-edit-anchor-duplicate-line](2026-09-09-17-l3-edit-anchor-duplicate-line.md) |
| 2026-09-09 | 骨架注释块的标签行含后缀，按「@块 [N-M]」截断拼锚点会匹配失败 | source-doc | 流程不畅 | 已解决 | 1 | [2026-09-09-18-block-label-anchor-truncated](2026-09-09-18-block-label-anchor-truncated.md) |
| 2026-09-09 | L3 骨架注解中混入凭空名称「rootsRoot 占位」需二次 edit 修正 | source-doc | 判断失误 | 已验证关闭 | 1 | [2026-09-09-19-l3-annotation-typo-self-fix](2026-09-09-19-l3-annotation-typo-self-fix.md) |
