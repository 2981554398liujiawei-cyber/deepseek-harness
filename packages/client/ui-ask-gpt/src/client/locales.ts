/** Copy dictionary for the ask_gpt composer toggle. */

export const zh = {
  'toggle.on': 'ask_gpt 已开启',
  'toggle.off': 'ask_gpt 已关闭',
  'menu.mode.title': '咨询模式',
  'menu.specified': '指定会话询问',
  'menu.auto': '新建会话询问',
  'menu.browser.title': '浏览器窗口',
  'menu.browser.visible': '正常弹出',
  'menu.browser.minimized': '后台最小化',
  'menu.conversation.title': '指定会话名称',
  'specified.placeholder': '输入 GPT 会话名称…',
  'specified.confirm': '保存',
  'specified.current': '会话：{name}',
  'unspecified': '未指定会话',
} as const

export const en = {
  'toggle.on': 'ask_gpt on',
  'toggle.off': 'ask_gpt off',
  'menu.mode.title': 'Mode',
  'menu.specified': 'Named conversation',
  'menu.auto': 'Auto consultation',
  'menu.browser.title': 'Browser window',
  'menu.browser.visible': 'Visible',
  'menu.browser.minimized': 'Minimized',
  'menu.conversation.title': 'Conversation name',
  'specified.placeholder': 'Enter GPT conversation name…',
  'specified.confirm': 'Save',
  'specified.current': 'Conversation: {name}',
  'unspecified': 'No conversation set',
} as const

export type AskGptKey = keyof typeof zh
