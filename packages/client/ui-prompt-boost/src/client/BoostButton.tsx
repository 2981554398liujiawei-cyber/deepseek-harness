/**
 * BoostButton: the enhance control in the composer tool row, right before the
 * send button ('conversation.input.right'). Reads the live draft through the
 * standard kit, calls the host promptEnhancer Remote, and writes the enhanced
 * text straight back into the input (no popover): click 鈫?enhance 鈫?written.
 * The button doubles as an undo affordance after a successful write, and shows
 * errors through the tooltip only.
 *
 * Beside the button sits a compact 鈿?menu with three REAL parameters that ride
 * the EnhanceRequest: enhancement strength (quick/deep/expert), model route
 * (rightapi/gpt-5.6-luna or packy/deepseek-v4-flash), and reasoning on/off.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { IconLoadingOutline16, IconRefreshOutline16, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { EnhanceLevel } from '@deepseek-ai/dsh-prompt-enhancer/types'
import type { SessionStandardProps, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { BoostButtonInjected } from './slots.ts'
import { zh } from './locales.ts'
import css from './BoostButton.module.css'

/** Button phase machine (per button instance; session teardown unmounts it). */
type Phase = 'idle' | 'running' | 'error'

/** Written-back snapshot powering the undo affordance. */
interface WrittenState {
  original: string
  enhanced: string
}

/** Model route options offered in the parameter menu. */
const MODEL_OPTIONS = [
  { provider: 'rightapi', model: 'gpt-5.6-luna', labelKey: 'menu.model.luna' },
  { provider: 'packy', model: 'deepseek-v4-flash', labelKey: 'menu.model.packy' },
] as const

/** Strength options offered in the parameter menu. */
const LEVEL_OPTIONS = [
  { level: 'quick', labelKey: 'menu.level.quick' },
  { level: 'deep', labelKey: 'menu.level.deep' },
  { level: 'expert', labelKey: 'menu.level.expert' },
] as const satisfies ReadonlyArray<{ level: EnhanceLevel; labelKey: keyof typeof zh }>

/** Sparkle glyph (four-point star with accent rays), Lucide "sparkles"-style. */
function SparklesIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
        fill="currentColor"
      />
      <path d="M20 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 5h-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 18H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export interface BoostButtonProps extends BoostButtonInjected {
  /** The boost namespace translate face. */
  t: TranslateNS<'boost'>
  /** Standard-kit draft read (selector over the session input machine). */
  useInput: SessionStandardProps['useInput']
  /** Standard-kit draft write (the machine's single public write path). */
  inputActions: SessionStandardProps['inputActions']
}

/** localStorage key remembering the user's last parameter choices. */
const STORAGE_KEY = 'dsh.prompt-boost.params.v1'

interface StoredParams {
  level: EnhanceLevel
  modelIndex: number
  reasoning: boolean
}

/** Read the remembered parameters, falling back to defaults on any miss. */
function readParams(): StoredParams {
  const fallback: StoredParams = { level: 'deep', modelIndex: 0, reasoning: false }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredParams>
    const level: EnhanceLevel = parsed.level === 'quick' || parsed.level === 'deep' || parsed.level === 'expert'
      ? parsed.level
      : fallback.level
    const modelIndex = Number.isInteger(parsed.modelIndex) && (parsed.modelIndex as number) >= 0
      && (parsed.modelIndex as number) < MODEL_OPTIONS.length
      ? parsed.modelIndex as number
      : fallback.modelIndex
    const reasoning = parsed.reasoning === true
    return { level, modelIndex, reasoning }
  } catch {
    return fallback
  }
}

export function BoostButton({ onEnhance, t, useInput, inputActions }: BoostButtonProps) {
  const draft = useInput(s => s.draft)
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [writtenState, setWrittenState] = useState<WrittenState | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [level, setLevel] = useState<EnhanceLevel>(() => readParams().level)
  const [modelIndex, setModelIndex] = useState(() => readParams().modelIndex)
  const [reasoning, setReasoning] = useState(() => readParams().reasoning)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Remember the last parameter choices across sessions.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, modelIndex, reasoning } satisfies StoredParams))
    } catch {
      // Storage may be unavailable (private mode); the menu just stays in-memory.
    }
  }, [level, modelIndex, reasoning])

  // The undo affordance retires when the user edits the draft away from the
  // written text (or sends): writing itself changes the draft, so it must not
  // clear the undo - only a draft that matches neither the written text nor
  // its original signals the user moved on.
  useEffect(() => {
    if (writtenState === null) return
    if (draft !== writtenState.enhanced && draft !== writtenState.original) {
      setWrittenState(null)
    }
  }, [draft, writtenState])

  // Close the parameter menu on outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target
      if (target instanceof Node
        && menuRef.current !== null
        && !menuRef.current.contains(target)
        && buttonRef.current !== null
        && !buttonRef.current.contains(target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [menuOpen])

  const run = useCallback(async () => {
    const text = draft.trim()
    if (text === '') {
      setErrorMessage(t('error.empty'))
      setPhase('error')
      return
    }
    setErrorMessage(null)
    setPhase('running')
    const model = MODEL_OPTIONS[modelIndex]
    try {
      const result = await onEnhance({
        originalText: text,
        enhanceLevel: level,
        ...(reasoning ? { reasoningEffort: 'high' as const } : { reasoningEffort: 'off' as const }),
        ...(model === undefined ? {} : { provider: model.provider, model: model.model }),
      })
      // Do not clobber edits the user made while enhancing.
      if (draft !== text) {
        setPhase('idle')
        return
      }
      inputActions.setDraft(result.enhancedText)
      setWrittenState({ original: text, enhanced: result.enhancedText })
      setPhase('idle')
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : String(error)
      setErrorMessage(message)
      setPhase('error')
    }
  }, [draft, onEnhance, inputActions, t, level, modelIndex, reasoning])

  const undo = useCallback(() => {
    if (writtenState === null) return
    inputActions.setDraft(writtenState.original)
    setWrittenState(null)
  }, [writtenState, inputActions])

  const running = phase === 'running'
  const written = writtenState !== null
  const error = phase === 'error'

  const buttonLabel = written
    ? t('button.undo')
    : error
      ? (errorMessage ?? t('button.tooltip'))
      : t('button.tooltip')

  const selectedModel = MODEL_OPTIONS[modelIndex]

  return (
    <div className={css.wrap}>
      <Tooltip label={buttonLabel} side="top" delayMs={500} disabled={running}>
        <button
          ref={buttonRef}
          type="button"
          className={clsx(css.button, written && css.written, error && css.error)}
          aria-label={buttonLabel}
          disabled={running}
          onMouseDown={(e) => { e.preventDefault() }}
          onClick={() => {
            if (written) undo()
            else void run()
          }}
        >
          {running
            ? <IconLoadingOutline16 size={14} className={css.spin} />
            : written
              ? <IconRefreshOutline16 size={14} />
              : <SparklesIcon size={14} />}
          <span className={css.label}>{written ? t('button.undo') : 'boost'}</span>
        </button>
      </Tooltip>
      <div className={css.menuWrap} ref={menuRef}>
        <Tooltip label={t('menu.tooltip')} side="top" delayMs={500}>
          <button
            type="button"
            className={clsx(css.gear, menuOpen && css.gearOpen)}
            aria-label={t('menu.tooltip')}
            aria-expanded={menuOpen}
            onClick={() => { setMenuOpen(open => !open) }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" opacity="0" />
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </Tooltip>
        {menuOpen && (
          <div className={css.panel}>
            <div className={css.group}>
              <div className={css.groupTitle}>{t('menu.level.title')}</div>
              <div className={css.options}>
                {LEVEL_OPTIONS.map(option => (
                  <button
                    key={option.level}
                    type="button"
                    className={clsx(css.option, level === option.level && css.optionActive)}
                    onClick={() => { setLevel(option.level) }}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={css.group}>
              <div className={css.groupTitle}>{t('menu.model.title')}</div>
              <div className={css.options}>
                {MODEL_OPTIONS.map((option, index) => (
                  <button
                    key={option.model}
                    type="button"
                    className={clsx(css.option, modelIndex === index && css.optionActive)}
                    onClick={() => { setModelIndex(index) }}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={css.group}>
              <div className={css.groupTitle}>{t('menu.reasoning.title')}</div>
              <div className={css.options}>
                <button
                  type="button"
                  className={clsx(css.option, !reasoning && css.optionActive)}
                  onClick={() => { setReasoning(false) }}
                >
                  {t('menu.reasoning.off')}
                </button>
                <button
                  type="button"
                  className={clsx(css.option, reasoning && css.optionActive)}
                  onClick={() => { setReasoning(true) }}
                >
                  {t('menu.reasoning.on')}
                </button>
              </div>
            </div>
            <div className={css.current}>
              {t('menu.current', {
                level: t(LEVEL_OPTIONS.find(o => o.level === level)?.labelKey ?? 'menu.level.deep'),
                model: t(selectedModel?.labelKey ?? 'menu.model.luna'),
                reasoning: t(reasoning ? 'menu.reasoning.on' : 'menu.reasoning.off'),
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BoostButton
