// L1 目录概览 — 能力描述符（宿主内置，2026-09-10 去技能化）。
// 确定性工作（frontmatter / 命名 / 第一层目录树 / index.json「目录层」）全部由宿主完成；
// 模型只读子文件、填三处语义后整篇写回。技能 skills/folder-doc 保留，仅供会话内人工调用。
import { basename } from 'node:path'
import { readFile } from 'node:fs/promises'
import { buildFolderSkeleton, folderPlaceholderLeft } from './skeleton.ts'

// docStem 入参：宿主下发的目标描述，本能力只用到绝对路径（文档名 = 文件夹名）。
interface FolderDocStemTarget {
  abs: string
}

// verify 入参：产物文档绝对路径（执行器收尾时下发）。
interface FolderDocVerifyInput {
  docAbs: string
}

export default {
  kind: 'folder',
  dir: 'folder-doc',
  sub: '目录概览',
  arr: '目录层',
  layer: '目录',
  hostIndex: true,
  scope: 'folder',
  promptFile: 'prompt.md',
  // 文档名 = 文件夹名（与 folder-doc.mjs 的 --name 默认值一致）。
  docStem: (target: FolderDocStemTarget) => basename(target.abs),
  skeleton: buildFolderSkeleton,
  // 收尾校验：产物仍是骨架（语义占位未填）→ 任务置 error，不把占位符当交付物。
  async verify({ docAbs }: FolderDocVerifyInput): Promise<void> {
    const body = await readFile(docAbs, 'utf8').catch(() => '')
    // #15 加固（2026-09-10）：产物健康校验——防子 agent 用试探性/错误的 write 把 DOC
    // 清空成 0 字节却仍判 success。占位残留校验对空产物会漏过（空串不含占位符）。
    if (!body.trim()) throw new Error('子 agent 已结束但产物为空: ' + docAbs)
    if (folderPlaceholderLeft(body)) {
      throw new Error('子 agent 已结束但产物仍是骨架（语义占位未填写）: ' + docAbs)
    }
  },
}
