/** Debug: test with the exact service user-agent and full request. */
const body = JSON.stringify({
  model: 'gpt-5.6-luna',
  messages: [{ role: 'user', content: [{ type: 'text', text: '把下面的段落改写得更正式：今天天气不错，我们出去走走' }] }],
  system: '你是一个专业的 Prompt 增强引擎。输出增强后的 Prompt 本身。',
  stream: true,
  stream_options: { include_usage: true },
  temperature: 0.4,
  max_tokens: 2048,
})
const headers = {
  authorization: 'Bearer sk-6f8a03c1efee42838dccd17f745d869c',
  'content-type': 'application/json',
  accept: 'text/event-stream',
  'user-agent': 'deepseek-harness/0.1.0-rc.5 (+https://github.com/deepseek-ai/deepseek-harness)',
  'x-deepseek-harness-user-id': 'some-user-id',
}
for (let i = 0; i < 4; i++) {
  const r = await fetch('https://rightapi.ai/codex/v1/chat/completions', {
    method: 'POST', headers, body,
  })
  const ct = r.headers.get('content-type') ?? ''
  console.log(`try ${i + 1}: ${r.status} ${ct}`)
  if (i < 3) await new Promise((res) => setTimeout(res, 900))
}
