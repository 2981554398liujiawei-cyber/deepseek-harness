/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / Effort row pair (label + current value + a right chevron),
 * each drilling into its own list — the provider-grouped model list over
 * the shared directory, and the effort levels. Clicking the trigger opens
 * the menu (hover never pops it, so a pass-over cannot misfire), and
 * hovering a root row reveals its list as a flyout docked to
 * the menu's right edge, so both lists are reachable without clicking; the
 * click-to-drill path stays for keyboard and touch. The flyout lives and
 * dies with the seat zone (pointer dwell), never on a row-level mouseleave,
 * so the cursor can cross the menu's right edge into the flyout — or into
 * its unpainted slot on a fast move — without the list flickering shut.
 * The trigger (313:14108's
 * ToggleButton) shows both: model name + effort in the caption tone.
 * Data and submission ride the SAME per-session ModelDirectory as the
 * /model popup; exact-model reasoning metadata and the selected effort come
 * from the Host rather than a client-owned vocabulary. A rejected selection
 * announces through the shared transient Toast anchored to the composer
 * card; the in-menu strip with Retry remains the catalog-load surface.
 */
import {
  useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type FocusEvent, type KeyboardEvent,
} from 'react'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14,
  IconWarningOutline16, Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from './slots.ts'
import css from './ModelSelect.module.css'

/** Which pane the dropdown shows: the two-row root or one drilled-in list. */
type Pane = 'root' | 'model' | 'effort'

/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
  description?: string
}

/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
export function ModelSelect(
  { locked, available, directory, load, select, t }:
  ModelSelectInjected & { locked: boolean } & PropsLocale<'model'>,
) {
  const state = useSyncExternalStore(
    fn => directory.subscribe(fn),
    () => directory.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  // Pointer-driven flyout: hovering a root cell reveals its list beside the
  // menu, so the effort levels are reachable without drilling in. Clicking a
  // cell still drills (keyboard / touch keep the pane path).
  const [flyout, setFlyout] = useState<Exclude<Pane, 'root'> | null>(null)
  const flyoutRef = useRef<HTMLDivElement | null>(null)
  // Pointer dwell: while open, the menu stays as long as the cursor stays
  // within the seat's zone — the bounding box of trigger + menu + flyout,
  // padded — and closing only starts once the cursor leaves that zone.
  // Root-boundary mouseleave alone would kill the menu the moment the cursor
  // heads sideways off the narrow trigger toward the flyout, which is the
  // move that previously made it vanish. The close timer gives the exit a
  // short grace; any re-entry cancels it.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The in-menu error strip serves catalog loads (its Retry re-runs the
  // load); a rejected SELECTION announces through the transient toast
  // instead, so the strip renders only while the latest failure-capable
  // action was a load.
  const lastActionRef = useRef<'load' | 'select'>('load')
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const toastSeq = useRef(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  const choices = useMemo(() => state.groups.flatMap(group =>
    group.models.map(model => ({
      group,
      model,
      selection: {
        provider: group.id,
        model: model.id,
        ...model.reasoning?.defaultEffort === undefined
          ? {}
          : { reasoningEffort: model.reasoning.defaultEffort },
      } satisfies ModelSelection,
    }))), [state.groups])
  const selectedIndex = state.current === null
    ? -1
    : choices.findIndex(c => c.selection.provider === state.current?.provider && c.selection.model === state.current.model)
  const currentChoice = choices[selectedIndex]
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : [],
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
        ...effort.description === undefined ? {} : { description: effort.description },
      })),
    ], [reasoning, t])
  const busy = state.status === 'selecting'

  const reload = (): void => {
    lastActionRef.current = 'load'
    load()
  }

  // Mount-time load resolves the trigger label; every open refreshes.
  useEffect(() => {
    if (available) {
      lastActionRef.current = 'load'
      load()
    }
  }, [available, load])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  if (!available) return null

  const show = (): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setPane('root')
    setFlyout(null)
    setOpen(true)
    reload()
  }

  const close = useCallback((restoreFocus = false): void => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setOpen(false)
    setPane('root')
    setFlyout(null)
    if (restoreFocus) queueMicrotask(() => { triggerRef.current?.focus() })
  }, [])

  // Pointer dwell zone: a mousemove over the document decides whether the
  // cursor is still inside the seat zone (union of trigger/menu/flyout rects
  // padded by ZONE_PAD) — inside cancels any pending close, outside starts
  // the grace timer. Computing the rects once per animation frame keeps the
  // per-move cost a couple of comparisons. The zone re-reads on every move,
  // so a flyout appearing or the menu growing (loading strip) extends the
  // keep-open area immediately. While the flyout has NOT yet painted (a fast
  // cursor can cross into its future spot the frame the cell is hovered),
  // the zone reserves its expected slot — to the right of the menu and up to
  // its full height above the menu's baseline — so the move into it never
  // counts as an exit.
  useEffect(() => {
    if (!open) return
    const ZONE_PAD = 48
    const FLYOUT_SLOT = 256
    const FLYOUT_TOP_SLOT = 280
    let raf = 0
    const settleClose = (): void => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
    const scheduleClose = (): void => {
      if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
      closeTimerRef.current = setTimeout(() => { close() }, 250)
    }
    const onPointerMove = (event: MouseEvent): void => {
      if (raf !== 0) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const elements = [rootRef.current, menuRef.current, flyoutRef.current]
          .filter((el): el is HTMLDivElement => el !== null)
        if (elements.length === 0) return
        let left = Infinity
        let top = Infinity
        let right = -Infinity
        let bottom = -Infinity
        for (const el of elements) {
          const rect = el.getBoundingClientRect()
          left = Math.min(left, rect.left)
          top = Math.min(top, rect.top)
          right = Math.max(right, rect.right)
          bottom = Math.max(bottom, rect.bottom)
        }
        const hasFlyout = flyoutRef.current !== null
        const inside = event.clientX >= left - ZONE_PAD
          && event.clientX <= right + ZONE_PAD + (hasFlyout ? 0 : FLYOUT_SLOT)
          && event.clientY >= top - ZONE_PAD - (hasFlyout ? 0 : FLYOUT_TOP_SLOT)
          && event.clientY <= bottom + ZONE_PAD
        if (inside) settleClose()
        else scheduleClose()
      })
    }
    document.addEventListener('mousemove', onPointerMove)
    return () => {
      document.removeEventListener('mousemove', onPointerMove)
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [open, close])

  const moveFocus = (offset: number): void => {
    const items = itemRefs.current.filter(item => item !== null)
    if (items.length === 0) return
    const active = items.findIndex(item => item === document.activeElement)
    const next = (Math.max(active, 0) + offset + items.length) % items.length
    items[next]?.focus()
  }

  const onRootKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      // Escape backs out of a flyout first, then a drilled pane, then closes.
      if (pane === 'root' && flyout !== null) setFlyout(null)
      else if (pane !== 'root') setPane('root')
      else close(true)
      return
    }
    if (!open) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(event.key === 'ArrowDown' ? 1 : -1)
    }
  }

  // Hovering a root cell opens (or switches) the flyout. Its lifecycle is
  // the seat zone's alone: the flyout stays until the pointer leaves the
  // zone (whole menu closes), the cell switches to the other list, Escape,
  // or a selection lands. There is deliberately NO cell/flyout mouseleave
  // retraction here: moving from a cell toward the flyout crosses the
  // menu's right edge (and, with a fast cursor, passes the flyout's own
  // top before React has even painted it), and any mouseleave-triggered
  // hide in that window is exactly the flicker this seat must not have.
  const onCellMouseEnter = (target: Exclude<Pane, 'root'>): void => {
    setPane('root')
    setFlyout(target)
  }

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return
    close()
  }

  const settleSelection = (accepted: boolean): void => {
    if (accepted) {
      if (rootRef.current !== null) close(true)
      return
    }
    const message = directory.getSnapshot().error
    if (message !== null) {
      toastSeq.current += 1
      setToast({ seq: toastSeq.current, text: t('error.action', { message }) })
    }
  }

  const choose = (selection: ModelSelection): void => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    const selection: ModelSelection = {
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }
    lastActionRef.current = 'select'
    void select(selection).then(settleSelection)
  }

  const modelLabel = currentChoice?.model.name ?? t('trigger.fallback')
  const triggerLabel = effortLabel === undefined ? modelLabel : `${modelLabel} · ${effortLabel}`
  const triggerAria = currentChoice === undefined
    ? t('trigger.selectAria')
    : effortLabel === undefined
      ? t('trigger.aria', { model: modelLabel })
      : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })
  itemRefs.current = []
  let itemIndex = 0
  const itemRef = () => {
    const at = itemIndex++
    return (node: HTMLButtonElement | null) => { itemRefs.current[at] = node }
  }

  // The two list bodies, shared by the drilled panes and the hover flyouts.
  // Functions (not variables) keep itemRef() call order equal to DOM order:
  // the refs are consumed in render order wherever the body lands.
  const renderModelList = () => (
    <>
      {state.status === 'loading' && (
        <div className={css.status}>{t('status.loading')}</div>
      )}
      {state.error !== null && lastActionRef.current === 'load' && (
        <div className={css.error}>
          <span>{t('error.action', { message: state.error })}</span>
          <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
        </div>
      )}
      {state.failures.map(failure => (
        <div className={css.warning} key={failure.id}>
          <span>{t('warning.groupLoad', { name: failure.name, message: failure.message })}</span>
          <button type="button" className={css.retry} onClick={reload}>{t('retry')}</button>
        </div>
      ))}
      <div className={clsx(css.groups, 'scrollable')}>
        {state.groups.map((group) => {
          const headingId = `${id}-${group.id}`
          return (
            <section role="group" aria-labelledby={headingId} className={css.group} key={group.id}>
              <div className={css.groupTitle} id={headingId}>{group.name}</div>
              {group.models.map((model) => {
                const selected = state.current?.provider === group.id && state.current.model === model.id
                return (
                  <button
                    ref={itemRef()}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={clsx(css.option, selected && css.selected)}
                    key={model.id}
                    title={model.name}
                    disabled={busy}
                    onClick={() => { choose({ provider: group.id, model: model.id }) }}
                  >
                    <span className={css.optionCopy}>
                      <span className={css.modelName}>{model.name}</span>
                      {model.description !== undefined && (
                        <span className={css.description}>{model.description}</span>
                      )}
                    </span>
                    <span className={css.check}>
                      {selected ? <IconCheckOutline16 /> : null}
                    </span>
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
      {state.status === 'ready' && choices.length === 0 && (
        <div className={css.empty}>{t('empty.models')}</div>
      )}
    </>
  )

  const renderEffortList = () => (
    <>
      {state.error !== null && lastActionRef.current === 'load' && (
        <div className={css.error}>
          <span>{t('error.action', { message: state.error })}</span>
          <button type="button" className={css.retry} onClick={reload}>{t('action.reload')}</button>
        </div>
      )}
      {effortChoices.length === 0
        ? <div className={css.empty}>{t('empty.efforts')}</div>
        : effortChoices.map(level => (
          <button
            ref={itemRef()}
            type="button"
            role="menuitemradio"
            aria-checked={effectiveEffort === level.effort}
            className={clsx(css.option, effectiveEffort === level.effort && css.selected)}
            key={level.key}
            disabled={busy}
            onClick={() => { chooseEffort(level.effort) }}
          >
            <span className={css.optionCopy}>
              <span className={css.modelName}>{level.label}</span>
              {level.description !== undefined && (
                <span className={css.description}>{level.description}</span>
              )}
            </span>
            <span className={css.check}>
              {effectiveEffort === level.effort ? <IconCheckOutline16 /> : null}
            </span>
          </button>
        ))}
    </>
  )

  return (
    <div
      ref={rootRef}
      className={css.root}
      onKeyDown={onRootKeyDown}
      onBlur={onBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        className={css.trigger}
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        disabled={locked}
        // Clicking toggles the menu; hovering the trigger deliberately does
        // NOT open it — an accidental pass-over must not pop the menu. Once
        // open, hover drives the second level (rows reveal their flyouts).
        onClick={() => {
          if (open) {
            close()
          } else {
            show()
          }
        }}
      >
        <span className={css.triggerLabel}>{modelLabel}</span>
        {effortLabel !== undefined && <span className={css.triggerEffort}>{effortLabel}</span>}
        <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} />
      </button>

      {open && (
        <div
          id={`${id}-menu`}
          ref={menuRef}
          className={css.menu}
          role="menu"
          aria-label={t('menu.aria')}
          aria-busy={state.status === 'loading' || busy}
        >
          {pane === 'root' && (
            <>
              <button
                ref={itemRef()}
                type="button"
                role="menuitem"
                className={css.cell}
                onMouseEnter={() => { onCellMouseEnter('model') }}
                // Hover already reveals the list beside the menu; a MOUSE
                // click on the row does nothing (detail >= 1). Keyboard
                // activation (Enter/Space, detail === 0) still drills into
                // the pane — the accessible path has no hover.
                onClick={(event) => { if (event.detail === 0) setPane('model') }}
              >
                <span className={css.cellLabel}>{t('menu.model')}</span>
                <span className={css.cellValue}>{modelLabel}</span>
                <IconChevronRightOutline14 className={css.cellChevron} />
              </button>
              {reasoning !== undefined && (
                <button
                  ref={itemRef()}
                  type="button"
                  role="menuitem"
                  className={css.cell}
                  onMouseEnter={() => { onCellMouseEnter('effort') }}
                  onClick={(event) => { if (event.detail === 0) setPane('effort') }}
                >
                  <span className={css.cellLabel}>{t('menu.effort')}</span>
                  <span className={css.cellValue}>{effortLabel}</span>
                  <IconChevronRightOutline14 className={css.cellChevron} />
                </button>
              )}
            </>
          )}

          {pane === 'model' && renderModelList()}

          {pane === 'effort' && renderEffortList()}
        </div>
      )}

      {open && pane === 'root' && flyout !== null && (
        <div
          ref={flyoutRef}
          className={css.flyout}
          role="menu"
          aria-label={flyout === 'model' ? t('menu.model') : t('menu.effort')}
        >
          {flyout === 'model' ? renderModelList() : renderEffortList()}
        </div>
      )}

      {toast !== null && (
        <Toast
          key={toast.seq}
          text={toast.text}
          icon={<IconWarningOutline16 />}
          anchor={rootRef.current?.closest<HTMLElement>('[data-composer-card]') ?? null}
          onDone={() => { setToast(null) }}
        />
      )}
    </div>
  )
}
