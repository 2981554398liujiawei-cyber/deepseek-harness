/**
 * Model-facing `vision_identify` tool: read an image attachment by its
 * content-addressed id and describe it through a vision-capable model
 * (Zhipu GLM-4V by default), so an agent whose own model cannot see pixels
 * can still answer image questions.
 *
 * Trigger contract: when a user message carries a
 * `[图片附件: attachmentId=sha256:..., ...]` reference (the degrade path of
 * llm-pi-ai for models that run text-only inference), the model MUST call
 * this tool before answering about the image.
 *
 * Behavior is governed by the `vision-zhipu` settings namespace (registered
 * here):
 * - `enabled`: master switch; when off the tool refuses calls and the dynamic
 *   system-prompt section tells the model not to call it.
 * - `model`: the Zhipu vision model id (default `glm-4v-flash`).
 * - `baseURL`: the OpenAI-compatible endpoint root.
 * - `apiKeyEnv`: the credential/environment variable holding the API key.
 * - `maxTokens`: completion cap (glm-4v-flash max is 1024).
 *
 * The system-prompt section is re-evaluated on every assembly from the live
 * settings value, so toggling the switch needs no plugin reload.
 *
 * @module @deepseek-ai/dsh-tool-vision-zhipu
 */

import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

/** `$DSH_HOME` (default `~/.dsh`): where attachments and credentials live. */
function dshHome(): string {
  return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
}

/** The `vision-zhipu` settings namespace: master switch and endpoint knobs. */
export interface VisionZhipuSettings {
  enabled: boolean
  model: string
  baseURL: string
  apiKeyEnv: string
  maxTokens: number
}

/** Schema for the `vision-zhipu` settings namespace (live-applies). */
export const VisionZhipuSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().default('glm-4v-flash'),
  baseURL: z.string().default('https://open.bigmodel.cn/api/paas/v4'),
  apiKeyEnv: z.string().default('ZHIPU_API_KEY'),
  maxTokens: z.number().default(1024),
})

/** Model-visible usage guidance rendered from the live settings at each assembly. */
export function renderVisionUsage(settings: VisionZhipuSettings): string {
  const state = settings.enabled ? '开启' : '关闭'
  const rule = settings.enabled
    ? '当用户消息中出现「图片附件」引用（形如 [图片附件: attachmentId=sha256:..., ...]）时，你必须先调用 vision_identify 工具识别该图片，把图片内容告诉用户，再继续其他任务；即使识别失败也要向用户说明情况。'
    : '不要调用 vision_identify 工具。'
  return [
    '【图片识别 · vision_identify】',
    `状态：${state}｜模型：${settings.model}`,
    `规则：${rule}`,
  ].join('\n')
}

interface VisionArgs {
  attachmentId: string
  prompt?: string
}

/** Sniff the media type from file magic bytes (the store keeps raw bytes only). */
function sniffMime(buf: Buffer): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 6 && (buf.toString('ascii', 0, 6) === 'GIF87a' || buf.toString('ascii', 0, 6) === 'GIF89a')) return 'image/gif'
  return 'image/png'
}

/**
 * Resolve the vision API key: the credentials service first, then the launch
 * environment, then a direct parse of `~/.dsh/.credentials.yaml` as a last
 * resort (tools may run in scopes without the credentials seam).
 */
async function resolveApiKey(ctx: Context, envName: string): Promise<string | undefined> {
  const creds = ctx.get('credentials')
  if (creds !== undefined) {
    try {
      const hit = await creds.resolve(envName)
      if (hit?.value !== undefined && hit.value.length > 0) return hit.value
    } catch {
      // fall through to the file-based plane
    }
  }
  const env = launchEnvironmentOf(ctx).get(envName)?.value
  if (env !== undefined && env.length > 0) return env
  const f = path.join(dshHome(), '.credentials.yaml')
  if (existsSync(f)) {
    const text = readFileSync(f, 'utf8')
    const escaped = envName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = text.match(new RegExp(`^${escaped}\\s*:\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, 'm'))
    if (m?.[1] !== undefined && m[1].trim().length > 0) return m[1].trim()
  }
  return undefined
}

/** One OpenAI-compatible vision completion against the Zhipu endpoint. */
async function identifyWithZhipu(
  settings: VisionZhipuSettings,
  apiKey: string,
  b64: string,
  mime: string,
  prompt: string,
  exec: ToolRunContext,
): Promise<string> {
  const body = {
    model: settings.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          { type: 'text', text: prompt },
        ],
      },
    ],
    max_tokens: settings.maxTokens,
  }
  const res = await fetch(`${settings.baseURL.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: exec.signal,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`智谱视觉模型 ${settings.model} 返回 HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (content === undefined || content.length === 0) {
    throw new Error('智谱视觉模型未返回任何内容')
  }
  return content
}

function presentVision(args: VisionArgs): ToolCallView {
  const raw = args.attachmentId ?? ''
  const id = raw.length > 16 ? `${raw.slice(0, 8)}…${raw.slice(-8)}` : raw
  return {
    card: 'generic',
    title: `识别图片 ${id}`,
    kind: 'read',
  }
}

/** Register the `vision_identify` tool over the durable attachment store. */
function registerVisionTool(ctx: Context, scope: SettingsScope<VisionZhipuSettings>): void {
  ctx.tools.register(defineTool({
    name: 'vision_identify',
    description: [
      '识别图片内容：读取 DSH 附件存储中由 attachmentId 指定的图片，调用智谱视觉模型（默认 glm-4v-flash）返回图片内容描述。',
      '当用户消息中出现 [图片附件: attachmentId=sha256:..., mediaType=..., 宽x高] 引用时，你必须调用此工具识别图片，再把内容告诉用户。',
      'attachmentId：从用户消息的 [图片附件: ...] 引用中原样复制（形如 sha256:<64位hex>）。',
      'prompt：可选，对图片的具体提问；不传则默认详细描述图片内容（含可见文字、图标、图形、布局、颜色）。',
      'API key 默认从 ~/.dsh/.credentials.yaml 的 ZHIPU_API_KEY 读取（也可用同名环境变量覆盖）。',
    ].join('\n'),
    parameters: {
      attachmentId: {
        type: 'string',
        description: '图片附件 ID，格式 sha256:<64位hex>，从用户消息的 [图片附件: ...] 引用中原样复制',
      },
      prompt: {
        type: 'string',
        description: '可选：对图片的具体提问（默认：详细描述图片内容）',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    timeoutMs: 120_000,
    isConcurrencySafe: () => false,
    presentCall: args => presentVision(args as VisionArgs),
    async execute(args: VisionArgs, exec) {
      const settings = scope.get()
      if (!settings.enabled) {
        throw new Error('图片识别功能已关闭（vision-zhipu.enabled=false）')
      }
      const raw = args.attachmentId ?? ''
      const hash = raw.startsWith('sha256:') ? raw.slice('sha256:'.length) : raw
      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        throw new Error(`无效的 attachmentId：${raw}（应为 sha256:<64位hex>）`)
      }
      const file = path.join(dshHome(), 'attachments', 'v1', 'objects', hash.slice(0, 2), hash)
      if (!existsSync(file)) {
        throw new Error(`附件文件不存在：${file}（attachmentId=${raw}）`)
      }
      const buf = await readFile(file)
      const b64 = buf.toString('base64')
      const mime = sniffMime(buf)
      const apiKey = await resolveApiKey(ctx, settings.apiKeyEnv)
      if (apiKey === undefined) {
        throw new Error(
          `未找到智谱 API key（${settings.apiKeyEnv}），请写入 ~/.dsh/.credentials.yaml 或设置同名环境变量`,
        )
      }
      const prompt = (args.prompt ?? '').trim() !== ''
        ? (args.prompt ?? '').trim()
        : '请详细描述这张图片的内容，包括所有可见文字、图标、图形、布局和颜色等细节。'
      return identifyWithZhipu(settings, apiKey, b64, mime, prompt, exec)
    },
  }))
}

export const name = 'tool-vision-zhipu'
export const inject = ['tools', 'settings', 'systemPrompt'] as const

/**
 * Register the `vision-zhipu` settings namespace, the dynamic usage section,
 * and the `vision_identify` tool.
 * @param ctx - context with `tools`, `settings`, and `systemPrompt` injected.
 */
export function apply(ctx: Context): void {
  const scope = ctx.settings.register(settingsNamespace('vision-zhipu'), VisionZhipuSettingsSchema, {
    applies: 'live',
  })
  ctx.systemPrompt.section({
    name: 'vision-zhipu:usage',
    order: 155,
    text: () => renderVisionUsage(scope.get()),
  })
  registerVisionTool(ctx, scope)
}
