/**
 * AskGptToggle: the ask_gpt control in the composer tool row, right before the
 * send button ('conversation.input.right'), laid out like prompt-boost: a pill
 * switch (the primary action — click toggles the web ChatGPT consultation
 * tool) beside a small gear button that opens the settings panel above it:
 *  - 咨询模式 (consultation mode): 指定会话询问 / 新建会话询问, selectable
 *    chips exactly like boost's parameter groups.
 *  - 指定会话名称: the named GPT conversation the agent always uses in
 *    "specified" mode.
 * The panel footer shows the live state (switch + mode + conversation).
 *
 * All state lives in the host-owned `gpt-web` settings namespace, so the Host
 * plugin and the model-facing usage section see the switch live.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { AskGptToggleInjected, GptWebOverride, GptWebSettings } from './slots.ts'
import { zh } from './locales.ts'
import css from './AskGptToggle.module.css'

export interface AskGptToggleProps extends AskGptToggleInjected {
  /** The ask_gpt namespace translate face. */
  t: TranslateNS<'askGpt'>
  /** Standard-kit session identity (session-scoped seat); keys this session's override. */
  sessionId: string | undefined
}

/**
 * The official OpenAI flower (three interwoven petals around a void square),
 * as the canonical 24x24 mark. Filled with currentColor so it reads at icon
 * size on both light and dark composer surfaces.
 */
function GptFlower({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5145 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0406l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

/** Gear glyph (Lucide "settings"-style), matching boost's gear affordance. */
function GearIcon({ size = 13, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/** The two consultation modes surfaced by the settings panel. */
type Mode = GptWebSettings['mode']

/** Mode chips offered in the settings panel. */
const MODE_OPTIONS: ReadonlyArray<{ mode: Mode; labelKey: 'menu.specified' | 'menu.auto' }> = [
  { mode: 'specified', labelKey: 'menu.specified' },
  { mode: 'auto', labelKey: 'menu.auto' },
]

/** Browser-window chips offered in the settings panel. */
const BROWSER_OPTIONS: ReadonlyArray<{ show: boolean; labelKey: 'menu.browser.visible' | 'menu.browser.minimized' }> = [
  { show: true, labelKey: 'menu.browser.visible' },
  { show: false, labelKey: 'menu.browser.minimized' },
]

export function AskGptToggle({ scope, t, sessionId }: AskGptToggleProps) {
  const [snapshot, setSnapshot] = useState(() => scope.getSnapshot())
  useEffect(() => scope.subscribe(() => setSnapshot(scope.getSnapshot())), [scope])

  // Per-session isolation: read the global document, then overlay THIS
  // session's override entry (keyed by the standard-kit sessionId) so every
  // conversation carries its own switch state.
  const settings = snapshot.value
  const over = sessionId === undefined ? undefined : settings?.sessionOverrides?.[sessionId]
  const enabled = over?.enabled ?? settings?.enabled ?? false
  const mode = over?.mode ?? settings?.mode ?? 'specified'
  const conversation = over?.conversation ?? settings?.conversation ?? ''
  const showBrowser = over?.showBrowser ?? settings?.showBrowser ?? true

  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState(conversation)
  const gearRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  /**
   * Write one field of THIS session's override entry (read-modify-write the
   * whole `sessionOverrides` map so other sessions' entries stay intact).
   */
  const writeOverride = useCallback((patch: Partial<GptWebOverride>) => {
    if (sessionId === undefined) return
    const current = scope.getSnapshot().value
    const next: Record<string, GptWebOverride> = { ...(current?.sessionOverrides ?? {}) }
    const prev = next[sessionId]
    next[sessionId] = {
      enabled: prev?.enabled ?? false,
      mode: prev?.mode ?? 'specified',
      conversation: prev?.conversation ?? '',
      showBrowser: prev?.showBrowser ?? true,
      ...patch,
    }
    void scope.set('sessionOverrides', next).catch(() => {})
  }, [scope, sessionId])

  // Keep the draft in sync when the stored conversation changes outside.
  useEffect(() => {
    if (!menuOpen) setDraft(conversation)
  }, [conversation, menuOpen])

  // Close the settings panel on an outside click (same contract as boost).
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target
      if (target instanceof Node
        && menuRef.current !== null
        && !menuRef.current.contains(target)
        && gearRef.current !== null
        && !gearRef.current.contains(target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => { document.removeEventListener('mousedown', onDown) }
  }, [menuOpen])

  /** Clicking the switch ONLY toggles the tool; the panel never opens on a switch click. */
  const toggleEnabled = useCallback(() => {
    writeOverride({ enabled: !enabled })
  }, [writeOverride, enabled])

  const pickMode = useCallback((next: Mode) => {
    writeOverride({ mode: next })
  }, [writeOverride])

  const pickBrowser = useCallback((show: boolean) => {
    writeOverride({ showBrowser: show })
  }, [writeOverride])

  const confirmSpecified = useCallback(() => {
    const name = draft.trim()
    if (name === '') return
    writeOverride({ conversation: name, mode: 'specified' })
  }, [writeOverride, draft])

  const currentMode = mode === 'specified'
    ? (conversation.trim() !== '' ? t('specified.current', { name: conversation.trim() }) : t('unspecified'))
    : t('menu.auto')

  return (
    <div className={css.wrap}>
      <button
        type="button"
        className={css.switch}
        aria-label={enabled ? t('toggle.on') : t('toggle.off')}
        aria-pressed={enabled}
        title={`ask_gpt · ${currentMode}`}
        onMouseDown={(e) => { e.preventDefault() }}
        onClick={toggleEnabled}
      >
        <span className={css.track}>
          <span className={enabled ? css.thumbOn : css.thumbOff}>
            <GptFlower size={14} className={css.flower ?? ''} />
          </span>
        </span>
      </button>

      <div className={css.menuWrap} ref={menuRef}>
        <button
          ref={gearRef}
          type="button"
          className={clsx(css.gear, menuOpen && css.gearOpen)}
          aria-label="ask_gpt 设置"
          aria-expanded={menuOpen}
          onMouseDown={(e) => { e.preventDefault() }}
          onClick={() => { setMenuOpen(open => !open) }}
        >
          <GearIcon size={13} />
        </button>
        {menuOpen && (
          <div className={css.panel}>
            <div className={css.group}>
              <div className={css.groupTitle}>{t('menu.mode.title')}</div>
              <div className={css.options}>
                {MODE_OPTIONS.map(option => (
                  <button
                    key={option.mode}
                    type="button"
                    className={clsx(css.option, mode === option.mode && css.optionActive)}
                    onClick={() => { pickMode(option.mode) }}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={css.group}>
              <div className={css.groupTitle}>{t('menu.browser.title')}</div>
              <div className={css.options}>
                {BROWSER_OPTIONS.map(option => (
                  <button
                    key={option.labelKey}
                    type="button"
                    className={clsx(css.option, showBrowser === option.show && css.optionActive)}
                    onClick={() => { pickBrowser(option.show) }}
                  >
                    {t(option.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={css.group}>
              <div className={css.groupTitle}>{t('menu.conversation.title')}</div>
              <div className={css.convRow}>
                <input
                  className={css.input}
                  value={draft}
                  placeholder={t('specified.placeholder')}
                  onChange={(e) => { setDraft(e.target.value) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmSpecified()
                  }}
                />
                <button
                  type="button"
                  className={css.confirm}
                  disabled={draft.trim() === ''}
                  onClick={confirmSpecified}
                >
                  {t('specified.confirm')}
                </button>
              </div>
            </div>
            <div className={css.current}>
              {enabled ? t('toggle.on') : t('toggle.off')}
              {' · '}
              {currentMode}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AskGptToggle
export type { Mode }
export { zh }
