/**
 * `boost` namespace dictionaries: the composer enhance button + parameter menu.
 * Clicking the button writes the enhanced prompt straight back into the input;
 * the gear menu carries three live parameters (strength, model route,
 * reasoning) that ride the enhance request.
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'button.aria': '增强提示词',
  'button.tooltip': '增强提示词',
  'button.running': '增强中…',
  'button.undo': '撤销',
  'error.empty': '输入为空：请先在输入框里写点什么。',
  'menu.tooltip': '增强参数',
  'menu.level.title': '增强强度',
  'menu.level.quick': '快速',
  'menu.level.deep': '深度',
  'menu.level.expert': '专家',
  'menu.model.title': '模型',
  'menu.model.luna': 'GPT-5.6-Luna',
  'menu.model.packy': 'DeepSeek-Packy',
  'menu.reasoning.title': '思考模式',
  'menu.reasoning.on': '开',
  'menu.reasoning.off': '关',
  'menu.current': '当前：{level} / {model} / 思考{reasoning}',
} satisfies Record<string, string>

/** The boost namespace key union. */
export type BoostKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'button.aria': 'Enhance prompt',
  'button.tooltip': 'Enhance prompt',
  'button.running': 'Enhancing…',
  'button.undo': 'Undo',
  'error.empty': 'Input is empty: write something first.',
  'menu.tooltip': 'Enhance options',
  'menu.level.title': 'Strength',
  'menu.level.quick': 'Quick',
  'menu.level.deep': 'Deep',
  'menu.level.expert': 'Expert',
  'menu.model.title': 'Model',
  'menu.model.luna': 'GPT-5.6-Luna',
  'menu.model.packy': 'DeepSeek-Packy',
  'menu.reasoning.title': 'Reasoning',
  'menu.reasoning.on': 'On',
  'menu.reasoning.off': 'Off',
  'menu.current': '{level} / {model} / reasoning {reasoning}',
} satisfies Record<BoostKey, string>
