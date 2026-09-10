// 能力注册表：kind → 能力描述符。
// 一个能力一个目录（`abilities/<name>/`）：该能力的元数据、提示词真源、确定性逻辑与校验钩子
// 都在目录内；通用引擎（执行器、书库定位、提示词加载、台账）在 `src/host/` 下，不感知具体能力。
// 维护约定见 `abilities/README.md`。
import folderDoc from './folder-doc/index.ts'
import fileDoc from './file-doc/index.ts'
import sourceDoc from './source-doc/index.ts'
import translateDoc from './translate-doc/index.ts'

/** 钩子上下文（类型层，运行时无对应物）：执行器会传入的字段全集，各能力只用其中一部分。 */
interface AbilityContext {
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
}

/** 能力描述符（类型层，运行时无对应物）：通用字段 + 可选钩子，字段语义见 `abilities/README.md`。 */
interface AbilityDescriptor {
  kind: string
  dir: string
  sub: string
  arr: string
  layer: string
  hostIndex?: boolean
  skeletonFile?: boolean
  hostBuild?: boolean
  scope: string
  promptFile: string
  docStem(target: AbilityContext): string
  skeleton?(ctx: AbilityContext): string | Promise<string>
  precheck?(ctx: AbilityContext): void | Promise<void>
  verify?(ctx: AbilityContext): void | Promise<void>
  finalize?(ctx: AbilityContext): void | Promise<void>
}

// 生成类能力：`/api/fs/gen-doc` 的 kind 取值（folder/file/src）。
export const GEN_ABILITIES: Record<string, AbilityDescriptor> = { folder: folderDoc, file: fileDoc, src: sourceDoc }

// 翻译能力：`/api/fs/translate`。
export const TRANSLATE_ABILITY: AbilityDescriptor = translateDoc

// 全部能力（按 kind 索引）：路由、执行器与测试统一从这里取，避免散落的 kind 分支。
export const ABILITIES: Record<string, AbilityDescriptor | undefined> = { ...GEN_ABILITIES, translate: translateDoc }

// 按 kind 取能力描述符；未知 kind 返回 undefined（调用方按 400 拒绝）。
export function abilityOf(kind: string): AbilityDescriptor | undefined {
  return ABILITIES[kind]
}
