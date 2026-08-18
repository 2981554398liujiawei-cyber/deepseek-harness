# 交接文档：Prompt Boost 插件 + RightAPI (GPT-5.6-Luna) 接入

> 写于 2026-08-16 01:50，供新会话续接。

## 一、总体状态

**Prompt Boost（提示词增强）插件已完成全部功能开发并通过真实验证；RightAPI 中转接入（gpt-5.6-luna）刚刚打通，最后一步 UI 回归验证待做。**

- 增强按钮（✨）在 DSH web 输入框发送按钮旁，点击 → host Remote 增强 → **直接写回输入框**（无弹窗），可撤销。
- 提速已完成：平均 23.5s → ~10s（quick 级别最快 3.4s），相同输入有 LRU 缓存（命中 0.009s）。
- 模型路由：`prompt-enhancer` 配置固定 `provider: rightapi, model: gpt-5.6-luna`（base patch 覆盖，独立于 agent 默认模型）。

## 二、最终验证结果（刚完成）

```
RPC: promptEnhancer/enhance → OK 6s provider=rightapi model=gpt-5.6-luna
增强输出示例: 将"今天天气不错"改写得更正式，保持原意不变。
```

## 三、RightAPI 接入的关键根因（必须记住）

**DSH 服务进程请求 rightapi 一直返回官网 SPA 页（text/html，`<!doctype html>`）而手动 curl/node 正常 —— 原因是 URL 少了 `/v1`！**

- ❌ `https://rightapi.ai/codex/chat/completions` → 200 text/html（SPA fallback 页面）
- ✅ `https://rightapi.ai/codex/v1/chat/completions` → 200 text/event-stream（正常 SSE）

修复位置：`packages/llm/llm-rightapi/src/index.ts` 的 `PUBLIC_BASE_URL = 'https://rightapi.ai/codex/v1'`（带注释说明）。

其他 rightapi 事实：
- 模型目录（`/codex/v1/models`）：gpt-5.6-luna / gpt-5.6-sol / gpt-5.6-terra / gpt-5.5 / gpt-5.4 等
- SSE 流**不以 `[DONE]` 结尾**（EOF 即结束）→ llm-rightapi 的 `sse.ts` 在干净 EOF 时合成 `[DONE]`（deepseek 版会抛 STREAM_CLOSED，不能直接复用）
- 已实现：非 event-stream 响应（HTML）自动重试 3 次（0.8/1.6/3.2s 退避），仍失败抛带 content-type + body 预览 + 代理 env 的清晰错误
- API key：`sk-6f8a03c1efee42838dccd17f745d869c`（用户提供，已写入 `C:\Users\cruelworld\.dsh\.credentials.yaml` 的 `RIGHTAPI_API_KEY`）
- 用户工作目录另有 `C:\Users\cruelworld\.credentials.yaml`（ZHIPU 等，与此无关）

## 四、改动文件清单

### 新建：`packages/llm/llm-rightapi/`（OpenAI 兼容 adapter，从 llm-deepseek 复制改造）
- `src/index.ts`：provider='rightapi'、PUBLIC_BASE_URL（/v1 修复）、模型目录、Config（去 thinking，留 reasoningEffort）
- `src/adapter.ts`：RightApiAdapter（去 thinking，保留 reasoning 映射）、**非 SSE 重试 + body 预览 + 代理 env 诊断**
- `src/serialize.ts`：去 thinking 字段（保留 `reasoning_effort` 透传）
- `src/types.ts`：WireRequest 删 thinking
- `src/sse.ts`：**EOF 合成 [DONE]**（rightapi 特有）
- `src/translate.ts`：与 deepseek 版相同（reasoning_content 兼容）
- `src/invariant.ts`：改名 llm-rightapi-invariant
- 已删 tests（deepseek 特有测试）

### 修改
- `packages/bundle/base/cordis.patch.yml`：新增 `llm-rightapi` 插件行；`prompt-enhancer` 行加 `config: {provider: rightapi, model: gpt-5.6-luna}`
- `packages/bundle/base/package.json`：依赖加 `@deepseek-ai/dsh-llm-rightapi: workspace:^`
- `tsconfig.host.json`：加 `./packages/llm/llm-rightapi` reference
- `packages/prompt-boost/enhancer/src/`（此前完成，已稳定）：pipeline.ts（单次纯文本调用 + 缓存 + text-fallback）、meta-prompt.ts（长度控制 ≤600 字）、core.ts/types.ts
- `packages/client/ui-prompt-boost/`（此前完成）：BoostButton.tsx 直接写入模式、SparklesIcon、locales

### 新增脚本：`scripts/restart-web.ps1`
- kill 3080 → 轮询等自动重启 → 可选 `-TestRpc` 跑一次增强 RPC 验证
- **必须带 UTF-8 BOM**（PowerShell 5.1 无 BOM 读中文脚本会语法错乱）
- 用法：`powershell -ExecutionPolicy Bypass -File scripts\restart-web.ps1 -TestRpc`

## 五、构建 / 重启 / 验证命令（DSH checkout 根目录）

```powershell
# 构建 host（tsc + tsdown + lint）
pnpm exec tsc -b tsconfig.host.json --pretty false
pnpm exec tsdown --env.DSH_BUILD_FACE host
pnpm exec oxlint packages/llm/llm-rightapi packages/prompt-boost

# 重启 web 并验证（3080 被 kill 后 ~5-10s 自动拉起新进程，PID 会变）
powershell -ExecutionPolicy Bypass -File scripts\restart-web.ps1 -TestRpc
```

验证 RPC 原始调用（无脚本）：
```powershell
$body = @{ type='client-request'; rpcId='x'; method='promptEnhancer/enhance';
  payload=@{ args=@{ request=@{ originalText='把下面的话改得更正式：今天天气不错' } } } } | ConvertTo-Json -Depth 8
$bytes = [Text.Encoding]::UTF8.GetBytes($body)
Invoke-WebRequest -Uri 'http://127.0.0.1:3080/api/promptEnhancer/enhance' -Method POST `
  -Headers @{ 'Content-Type'='application/json; charset=utf-8' } -Body $bytes -UseBasicParsing
# 响应需 ISO-8859-1 → UTF-8 转码；成功时 result.value.provider=rightapi model=gpt-5.6-luna
```

## 六、注意事项 / 已知问题

1. **服务自动重启**：3080 进程 kill 后由外部机制自动拉起（PID 不可控），验证前必须先等端口恢复监听。
2. **工具中断**：本会话多次 pwsh 调用被环境中断（尤其含 Stop-Process 的长命令）。建议新会话：构建与重启拆成独立命令；重启一律走 `restart-web.ps1`；验证用短命令。
3. **prompt-enhancer 缓存**：相同输入 LRU 缓存 32 条，重复增强秒回（0.009s）；改输入才重新调模型。
4. **rightapi 风控**：连续高频请求（如一次性连发 5+ 个）可能触发限流（当时疑似，后确认主要是 /v1 路径问题；重试机制已兜底）。正常使用（用户点一次发一个）无问题。
5. **代理**：服务进程无 HTTP(S)_PROXY 环境变量（已诊断确认），不是代理问题。
6. **模型路由独立性**：prompt-enhancer 固定走 rightapi/gpt-5.6-luna；agent 主对话仍用 packy/deepseek-v4-flash（用户 settings 覆盖），互不影响。想改回默认模型只需删 base patch 里 prompt-enhancer 的 config 块。
7. **凭据**：RIGHTAPI_API_KEY 在 `C:\Users\cruelworld\.dsh\.credentials.yaml`；llm-rightapi 默认 apiKeyEnv=RIGHTAPI_API_KEY。
8. **DSH 主项目源**：`C:\Users\cruelworld\Desktop\deepseek-harness`（所有改动在此）；用户原始项目在 `C:\Users\cruelworld\Desktop\DeepSeek\prompt boost for DeepSeek`（未改动）。

## 七、剩余待办

- [ ] **UI 回归验证**：Playwright 直接写入流程（按钮点击 → 写回输入框 → 撤销 → 缓存秒回），模型换成 rightapi 后重跑一遍（证据目录 `apps/web/boost-evidence/`，旧脚本已删，需重建 verify 脚本）
- [ ] 用户确认：增强质量、速度是否符合预期；如需调整增强强度（quick/deep/expert）可改 UI 或加参数
- [ ] 可选项：把 rightapi 模型目录补充完整（contextWindow 等元数据）；给 prompt-enhancer 增加级别选择 UI
