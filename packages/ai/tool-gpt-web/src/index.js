/**
 * Model-facing `gpt_web_ask` tool: ask the web-signed-in ChatGPT and read its
 * reply, so an agent can consult ChatGPT mid-task and adapt its workflow.
 *
 * Delegates to the user-level `gpt_web.py` automation script under
 * `$DSH_HOME/gpt-web/` (a Playwright + system-Chrome bridge that reuses a
 * persisted signed-in session profile). The script and its session profile
 * live OUTSIDE the repository because the profile holds the user's ChatGPT
 * sign-in cookies.
 *
 * Behavior is governed by the `gpt-web` settings namespace (registered here):
 * - `enabled`: master switch; when off the tool refuses calls and the dynamic
 *   system-prompt section tells the model not to call it.
 * - `mode`: `specified` (always chat inside the named conversation) or `auto`
 *   (the model may proactively consult GPT when stuck).
 * - `conversation`: the GPT conversation name used in `specified` mode.
 *
 * The system-prompt section is re-evaluated on every assembly from the live
 * settings value, so toggling the switch needs no plugin reload.
 * @module @deepseek-ai/dsh-tool-gpt-web
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import z from '@deepseek-ai/schemastery';
const DEFAULT_REPLY_TIMEOUT = 180;
const LOGIN_WAIT_SECONDS = 300;
const SCRIPT_FILE = 'gpt_web.py';
const PROFILE_DIR = 'gpt_profile';
const PYTHON = process.env.DSH_GPT_WEB_PYTHON ?? 'python';
/** `$DSH_HOME` (default `~/.dsh`): where the user-level gpt-web runtime lives. */
function dshHome() {
    return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
}
function scriptDir() {
    return path.join(dshHome(), 'gpt-web');
}
function scriptPath() {
    return path.join(scriptDir(), SCRIPT_FILE);
}
function profileExists() {
    return existsSync(path.join(scriptDir(), PROFILE_DIR));
}
/** Schema for the `gpt-web` settings namespace (live-applies). */
export const GptWebSettingsSchema = z.object({
    enabled: z.boolean().default(true),
    mode: z.enum(['specified', 'auto']).default('specified'),
    conversation: z.string().default(''),
});
/** Model-visible usage guidance rendered from the live settings at each assembly. */
export function renderGptWebUsage(settings) {
    const state = settings.enabled ? '开启' : '关闭';
    const mode = settings.mode === 'specified'
        ? `指定会话（${settings.conversation.trim() !== '' ? settings.conversation.trim() : '未设置'}）`
        : '自动咨询';
    const rules = settings.enabled
        ? settings.mode === 'specified'
            ? `调用 gpt_web_ask 时必须带 conversation="${settings.conversation.trim()}"，在指定 GPT 会话里沟通。`
            : '遇到方案分歧或不确定的技术问题时，主动调用 gpt_web_ask，向 GPT 说明项目情况与困难点寻求帮助，并依据回答调整工作流程。'
        : '不要调用 gpt_web_ask 工具。';
    return [
        '【ask_gpt · 网页版 GPT 咨询】',
        `状态：${state}｜模式：${mode}`,
        `规则：${rules}`,
    ].join('\n');
}
/**
 * Run `gpt_web.py <args...>`, streaming its stdout as the result and folding
 * its stderr into a thrown error. Cancels the child on `exec.signal` abort.
 */
function runGptWeb(exec, args, overallMs) {
    const script = scriptPath();
    if (!existsSync(script)) {
        return Promise.reject(new Error(`gpt-web runtime not installed: missing ${script}. Copy gpt_web.py and its Playwright session into $DSH_HOME/gpt-web/.`));
    }
    const child = spawn(PYTHON, [script, ...args], {
        cwd: scriptDir(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    let timer;
    const onAbort = () => { child.kill(); };
    if (exec.signal.aborted) {
        onAbort();
    }
    else {
        exec.signal.addEventListener('abort', onAbort, { once: true });
    }
    const clear = () => {
        if (timer !== undefined)
            clearTimeout(timer);
        exec.signal.removeEventListener('abort', onAbort);
    };
    return new Promise((resolve, reject) => {
        child.on('error', (error) => {
            clear();
            reject(new Error(`failed to launch ${PYTHON}: ${error.message}`));
        });
        child.on('close', (code, signal) => {
            clear();
            if (code === 0) {
                resolve(stdout.trimEnd());
            }
            else if (exec.signal.aborted) {
                reject(new Error('gpt_web call cancelled'));
            }
            else {
                const tail = stderr.trim().slice(-1500);
                reject(new Error(`gpt_web exited with code ${code}${signal === null ? '' : ` (${signal})`}${tail ? `: ${tail}` : ''}`));
            }
        });
        timer = setTimeout(() => {
            child.kill();
            reject(new Error(`gpt_web timed out after ${Math.round(overallMs / 1000)}s`));
        }, overallMs);
    });
}
function presentAsk(args) {
    const preview = args.question.length > 60 ? `${args.question.slice(0, 60)}…` : args.question;
    const target = args.conversation === undefined || args.conversation.trim() === ''
        ? ''
        : `（会话：${args.conversation.trim()}）`;
    return {
        card: 'generic',
        title: `问网页版 GPT${target}：${preview}`,
        kind: 'read',
    };
}
function presentLogin(_args) {
    return {
        card: 'generic',
        title: '打开 ChatGPT 登录窗口',
        kind: 'read',
    };
}
/**
 * Register the `gpt_web_ask` tool over the user-level gpt-web bridge, governed
 * by the `gpt-web` settings namespace.
 * @param ctx - context with the `tools` registry (injected).
 * @param scope - the owner scope of the `gpt-web` settings namespace.
 */
function registerGptWeb(ctx, scope) {
    ctx.tools.register(defineTool({
        name: 'gpt_web_ask',
        description: [
            '向网页端已登录的 ChatGPT 提问并读取他的回复（浏览器自动化，非 API）。',
            '适合在任务中遇到疑问时咨询 GPT、并依据其回答调整工作流程。',
            '模式 mode=ask：发送问题并等待回复（默认，有头窗口运行，风控更稳）。',
            '模式 mode=login：打开浏览器窗口让用户手动登录 ChatGPT（首次使用或会话过期时调用，会等待用户操作，耗时长）。',
            'conversation 参数：可选，指定在哪个名称的 GPT 会话里沟通；未指定时使用 ask_gpt 开关设置的会话（若配置了指定会话）。',
            '登录会话保存在 $DSH_HOME/gpt-web/gpt_profile，登录一次后复用。',
            '注意：网页版有反自动化风控，请控制调用频率；回复可能需要数秒到数分钟，超时秒数用 timeout 参数调整。',
        ].join('\n'),
        parameters: {
            mode: {
                type: 'string',
                enum: ['ask', 'login'],
                description: 'ask=提问（默认）；login=打开浏览器让用户登录。',
            },
            question: {
                type: 'string',
                description: '要问 ChatGPT 的问题（mode=ask 时必填）。',
            },
            timeout: {
                type: 'integer',
                description: '等待 GPT 生成回复的超时秒数（默认 180，长任务可加大）。',
            },
            headless: {
                type: 'boolean',
                description: '无头模式（不弹窗；风控更严，默认 false 有头运行）。',
            },
            wait: {
                type: 'integer',
                description: 'mode=login 时等待用户登录的秒数（默认 300）。',
            },
            conversation: {
                type: 'string',
                description: '指定在哪个名称的 GPT 会话里沟通（ask 模式可选；留空则按 ask_gpt 开关的会话设置）。',
            },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        timeoutMs: 420_000,
        isConcurrencySafe: () => false,
        presentCall: (args) => {
            const a = args;
            if (a.mode === 'login') {
                return presentLogin({
                    ...(a.wait !== undefined ? { wait: a.wait } : {}),
                    ...(a.headless !== undefined ? { headless: a.headless } : {}),
                });
            }
            return presentAsk({
                question: a.question ?? '',
                ...(a.timeout !== undefined ? { timeout: a.timeout } : {}),
                ...(a.headless !== undefined ? { headless: a.headless } : {}),
                ...(a.conversation !== undefined ? { conversation: a.conversation } : {}),
            });
        },
        async execute(args, exec) {
            const settings = scope.get();
            if (!settings.enabled) {
                throw new Error('ask_gpt 功能已关闭：请在 composer 的 ask_gpt 开关中开启后再调用 gpt_web_ask。');
            }
            const mode = args.mode ?? 'ask';
            if (mode === 'login') {
                const wait = args.wait ?? LOGIN_WAIT_SECONDS;
                const out = await runGptWeb(exec, ['login', '--wait', String(wait)], 420_000);
                if (out.length > 0)
                    return out;
                return '已打开 ChatGPT 登录窗口，等待用户在浏览器中完成登录。';
            }
            if (!args.question || args.question.trim().length === 0) {
                throw new Error('gpt_web_ask: `question` 不能为空（mode=ask 时必填）。');
            }
            const timeout = args.timeout ?? DEFAULT_REPLY_TIMEOUT;
            if (!Number.isInteger(timeout) || timeout <= 0) {
                throw new Error('gpt_web_ask: `timeout` 必须是正整数秒。');
            }
            if (!profileExists()) {
                throw new Error('gpt-web 会话尚未登录。请先调用 gpt_web_ask(mode="login") 打开浏览器登录 ChatGPT（或在 $DSH_HOME/gpt-web 下执行 python gpt_web.py login）。');
            }
            // Conversation resolution: explicit argument wins; otherwise the
            // settings-namespace mode decides (specified -> named conversation).
            const conversation = (args.conversation ?? '').trim() !== ''
                ? args.conversation.trim()
                : settings.mode === 'specified'
                    ? settings.conversation.trim()
                    : '';
            const cmd = ['ask', args.question, '--timeout', String(timeout)];
            if (args.headless === true)
                cmd.push('--headless');
            if (conversation !== '')
                cmd.push('--conversation', conversation);
            return runGptWeb(exec, cmd, Math.min(420_000, (timeout + 60) * 1000));
        },
    }));
}
export const name = 'tool-gpt-web';
export const inject = ['tools', 'settings', 'systemPrompt'];
/**
 * Register the `gpt-web` settings namespace, the dynamic usage section, and
 * the `gpt_web_ask` tool.
 * @param ctx - context with `tools`, `settings`, and `systemPrompt` injected.
 */
export function apply(ctx) {
    const scope = ctx.settings.register(settingsNamespace('gpt-web'), GptWebSettingsSchema, {
        applies: 'live',
    });
    ctx.systemPrompt.section({
        name: 'gpt-web:usage',
        order: 150,
        text: () => renderGptWebUsage(scope.get()),
    });
    registerGptWeb(ctx, scope);
}
//# sourceMappingURL=index.js.map