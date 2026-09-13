// L1 目录概览 — 能力描述符（宿主内置，2026-09-10 去技能化）。
// 确定性工作（frontmatter / 命名 / 第一层目录树 / index.json「目录层」）全部由宿主完成；
// 模型只读子文件、填三处语义后整篇写回。技能 skills/folder-doc 保留，仅供会话内人工调用。
import { readFile } from 'node:fs/promises'
import { buildFolderSkeleton, folderPlaceholderLeft } from './skeleton.ts'
import { folderDocStem } from '../../fs-utils.ts'
import { ZH } from '../../../shared/locale.ts'

// docStem 入参：宿主执行器实际下发完整 BookTarget（abs/bookRoot/relP/key），本能力用
// 「相对归属根的路径 relP + 归属根 projectRoot」推导文档名——与文件层 computeDocStem
// 同视角（含父目录层级），避免不同目录同名时共用一个文档文件。
// 类型面：registry 的 AbilityDescriptor.docStem 形参是 AbilityContext（全可选字段），
// 且 docStem 是方法声明（参数双变）——本处声明为「AbilityContext 字段 + relP/bookRoot
// 必填」的扩展面，双向兼容（执行器实传 BookTarget 满足它；它赋回 AbilityContext 时
// 多出的必填字段不构成能力丢失），故无需改动 registry.ts 的共享类型。
interface FolderDocStemTarget {
  abs?: string
  rel?: string
  key?: string
  targetKey?: string
  docStem?: string
  layer?: string
  generatedAt?: string
  docAbs?: string
  skeletonPath?: string
  prevStat?: { mtimeMs: number; size: number } | null | undefined
  relP: string
  bookRoot: { projectRoot: string }
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
  // 文档名 = folderDocStem（与 /tree 目录分支同一函数、与文件层 computeDocStem 同视角；
  // 旧规则为 basename(abs)，会导致同名目录跨层级共用一个文档文件，2026-09-13 修复）。
  docStem: (target: FolderDocStemTarget) => folderDocStem(target.relP, target.bookRoot.projectRoot),
  skeleton: buildFolderSkeleton,
  // 收尾校验：产物仍是骨架（语义占位未填）→ 任务置 error，不把占位符当交付物。
  async verify({ docAbs }: FolderDocVerifyInput): Promise<void> {
    const body = await readFile(docAbs, 'utf8').catch(() => '')
    // #15 加固（2026-09-10）：产物健康校验——防子 agent 用试探性/错误的 write 把 DOC
    // 清空成 0 字节却仍判 success。占位残留校验对空产物会漏过（空串不含占位符）。
    if (!body.trim()) throw new Error(ZH.errGenEmptyArtifact + docAbs)
    if (folderPlaceholderLeft(body)) {
      throw new Error(ZH.errGenSkeletonLeft + docAbs)
    }
  },
}
