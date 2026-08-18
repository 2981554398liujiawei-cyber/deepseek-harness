/** Recognize the user's UI mockup with glm-4v-flash. */
import { readFileSync } from 'node:fs'

const yaml = readFileSync('C:/Users/cruelworld/.dsh/.credentials.yaml', 'utf8')
const key = yaml.match(/^ZHIPU_API_KEY:\s*(\S+)/m)?.[1]
const b64 = readFileSync('C:/Users/cruelworld/Desktop/deepseek-harness/apps/web/boost-evidence/user-mockup.png').toString('base64')
const r = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
  method: 'POST',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    model: 'glm-4v-flash',
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
        { type: 'text', text: '请精确描述这张 UI 示意图：1) 按钮的样式和文字（如有"boost"字样请说明）；2) 按钮旁边有没有下拉菜单/选择器；3) 菜单或选择器里有哪些选项文字（逐条列出）；4) 整体布局。用中文回答。' },
      ],
    }],
  }),
})
const j = await r.json()
console.log(j.choices?.[0]?.message?.content ?? JSON.stringify(j))
