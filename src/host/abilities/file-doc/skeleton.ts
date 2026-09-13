// L2 文件摘要 — 确定性骨架渲染（宿主内置，2026-09-10 去技能化）。
// 模板由宿主内置，不依赖外部技能目录。

// L2 骨架里的语义占位标记：宿主收尾据此判定「产物仍是骨架」（模型没填内容）。
// 只列不会被正常产物误命中的固定串（正文里出现的 <...> 多为泛型/JSX，不参与判定）。
// 声明为二元组：两处占位在 renderFileDocSkeleton 里按 [0]/[1] 取用，定长下标因此保持 string。
export const FILE_DOC_PLACEHOLDERS: [string, string] = [
  '<一句话：这个文件存在的价值，写给不懂项目的人>',
  '<一句话主题 + 2-4 句展开；关键术语在这里自然解释，不单独列术语表>',
]

// L2 骨架渲染入参：frontmatter 三行、标题（文件名含扩展名）与路径由宿主算好，模型只填两处占位。
export interface FileDocSkeletonInput {
  relPath: string
  title: string
  layer: string
  generatedAt: string
}

// 渲染 L2 骨架：frontmatter 三行、标题（文件名含扩展名）、路径、四个章节标题、导出表头由
// 宿主写死；两处语义占位留给模型替换（也是收尾校验的判据）。
export function renderFileDocSkeleton({ relPath, title, layer, generatedAt }: FileDocSkeletonInput): string {
  return [
    '---',
    '源码路径: ' + relPath,
    '层级: ' + layer,
    '生成时间: ' + generatedAt,
    '---',
    '',
    '# ' + title,
    '',
    '**路径**：' + relPath,
    '',
    '> **解决什么问题**：' + FILE_DOC_PLACEHOLDERS[0],
    '',
    '## 核心概念（这个文件只做一件事）',
    '',
    FILE_DOC_PLACEHOLDERS[1],
    '',
    '## 主线走查（按调用/依赖顺序）',
    '',
    '（按依赖顺序逐个写：每个关键导出一小节，写「做什么」与「为什么这么设计」；动机取自 JSDoc/注释，没有就写「推测：…」）',
    '',
    '## 在整体中的位置',
    '',
    '**谁用它（被引用）**：',
    '（grep 实际结果，逐个列出模块名与调用点）',
    '',
    '**它用谁（引用）**：',
    '（本文件 import 的模块及其作用）',
    '',
    '## 导出接口（附录：速查表）',
    '',
    '| 导出 | 类型 | 作用 |',
    '|---|---|---|',
    '',
  ].join('\n')
}

// 收尾判定：产物仍是骨架（含任一处语义占位）时返回该占位串，否则空串。
export function filePlaceholderLeft(body: string): string {
  return FILE_DOC_PLACEHOLDERS.find(p => body.includes(p)) || ''
}
