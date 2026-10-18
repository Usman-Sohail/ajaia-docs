import { SaveConflictError } from './documents'
import { errorMessage } from './errors'

export type SaveState =
  | { status: 'saved' }
  | { status: 'unsaved' }
  | { status: 'saving' }
  | { status: 'error'; message: string }
  | { status: 'conflict'; message: string }

export interface AutosaveOptions<T> {
  /** Persists a value. Must reject on failure; resolving means the write succeeded. */
  save: (value: T) => Promise<void>
  onStateChange: (state: SaveState) => void
  delayMs?: number
}

/**
 * Debounced, serialized autosave.
 *
 * - Edits are coalesced: only the latest value is saved once `delayMs` passes without edits.
 * - At most one save is in flight. Edits made during a save are written by a follow-up
 *   save, so an older request can never land after (and overwrite) a newer one.
 * - "saved" is reported only after the latest value has actually been persisted.
 * - Failed values are kept and retried on the next edit, `flush()` or `retry()`.
 * - A conflict stops autosaving until the owner of this controller resolves it.
 */
export class AutosaveController<T> {
  private readonly save: (value: T) => Promise<void>
  private readonly onStateChange: (state: SaveState) => void
  private readonly delayMs: number

  private pending: { value: T } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private halted = false
  private state: SaveState = { status: 'saved' }

  constructor(options: AutosaveOptions<T>) {
    this.save = options.save
    this.onStateChange = options.onStateChange
    this.delayMs = options.delayMs ?? 800
  }

  get currentState(): SaveState {
    return this.state
  }

  /** True when there are edits that have not been confirmed as persisted. */
  get hasUnsavedChanges(): boolean {
    return this.pending !== null || this.inFlight !== null
  }

  update(value: T): void {
    this.pending = { value }
    if (this.halted) return
    if (!this.inFlight) this.setState({ status: 'unsaved' })
    this.schedule()
  }

  /** Saves any pending value immediately and resolves once everything is persisted (or failed). */
  async flush(): Promise<void> {
    while (!this.halted) {
      this.clearTimer()
      if (this.inFlight) {
        await this.inFlight
        continue
      }
      if (!this.pending) return
      await this.startSave()
      if (this.state.status === 'error') return
    }
  }

  retry(): Promise<void> {
    return this.flush()
  }

  /** Resumes after a conflict, e.g. once the caller has refreshed its base version. */
  resume(): void {
    this.halted = false
    if (this.pending) {
      this.setState({ status: 'unsaved' })
      this.schedule()
    } else {
      this.setState({ status: 'saved' })
    }
  }

  /** Drops pending edits and stops saving (e.g. the document was deleted). */
  cancel(): void {
    this.pending = null
    this.halted = true
    this.clearTimer()
  }

  private startSave(): Promise<void> {
    const run = this.runSave().finally(() => {
      if (this.inFlight === run) this.inFlight = null
    })
    this.inFlight = run
    return run
  }

  private async runSave(): Promise<void> {
    const entry = this.pending
    if (!entry) return
    this.pending = null
    this.setState({ status: 'saving' })
    try {
      await this.save(entry.value)
      // Edits made during the save are still pending, so we are not "saved" yet;
      // they go out in a follow-up (debounced) save.
      if (this.pending) {
        this.setState({ status: 'unsaved' })
        if (!this.timer) this.schedule()
      } else {
        this.setState({ status: 'saved' })
      }
    } catch (error) {
      // Keep the failed value unless the user has typed something newer since.
      this.pending ??= entry
      if (error instanceof SaveConflictError) {
        this.halted = true
        this.clearTimer()
        this.setState({ status: 'conflict', message: error.message })
      } else {
        this.setState({ status: 'error', message: errorMessage(error, 'Save failed') })
      }
    }
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      // An in-flight save reschedules itself on completion if edits are pending.
      if (!this.inFlight && !this.halted) void this.startSave()
    }, this.delayMs)
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private setState(state: SaveState): void {
    this.state = state
    this.onStateChange(state)
  }
}

