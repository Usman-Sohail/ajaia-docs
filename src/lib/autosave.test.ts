import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutosaveController, type SaveState } from './autosave'
import { SaveConflictError } from './documents'

function deferred() {
  let resolve!: () => void
  let reject!: (error: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(save: (value: string) => Promise<void>) {
  const states: SaveState['status'][] = []
  const controller = new AutosaveController<string>({
    save,
    delayMs: 500,
    onStateChange: (state) => states.push(state.status),
  })
  return { controller, states }
}

describe('AutosaveController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces edits and saves only the latest value', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { controller, states } = setup(save)

    controller.update('a')
    controller.update('ab')
    await vi.advanceTimersByTimeAsync(499)
    expect(save).not.toHaveBeenCalled()
    controller.update('abc')
    await vi.advanceTimersByTimeAsync(500)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith('abc')
    expect(states.at(-1)).toBe('saved')
    expect(controller.hasUnsavedChanges).toBe(false)
  })

  it('never runs saves concurrently, so an older save cannot overwrite a newer one', async () => {
    const first = deferred()
    const persisted: string[] = []
    let concurrent = 0
    let maxConcurrent = 0
    const save = vi.fn(async (value: string) => {
      concurrent++
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      if (value === 'v1') await first.promise
      persisted.push(value)
      concurrent--
    })
    const { controller, states } = setup(save)

    controller.update('v1')
    await vi.advanceTimersByTimeAsync(500) // v1 in flight (slow)
    controller.update('v2')
    await vi.advanceTimersByTimeAsync(500) // debounce elapses while v1 is still in flight
    expect(save).toHaveBeenCalledTimes(1)
    expect(states.at(-1)).toBe('saving')

    first.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(states.at(-1)).toBe('unsaved') // v2 still pending → must not claim "saved"
    await vi.advanceTimersByTimeAsync(500)

    expect(persisted).toEqual(['v1', 'v2'])
    expect(maxConcurrent).toBe(1)
    expect(states.at(-1)).toBe('saved')
  })

  it('reports an error (never "saved") when persistence fails, and retries the value', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('Network down')).mockResolvedValue(undefined)
    const states: SaveState[] = []
    const controller = new AutosaveController<string>({ save, delayMs: 500, onStateChange: (s) => states.push(s) })

    controller.update('draft')
    await vi.advanceTimersByTimeAsync(500)

    expect(states.at(-1)).toEqual({ status: 'error', message: 'Network down' })
    expect(states.some((s) => s.status === 'saved')).toBe(false)
    expect(controller.hasUnsavedChanges).toBe(true)

    await controller.retry()
    expect(save).toHaveBeenLastCalledWith('draft')
    expect(states.at(-1)).toEqual({ status: 'saved' })
  })

  it('flush() saves immediately without waiting for the debounce', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { controller } = setup(save)

    controller.update('switching documents')
    await controller.flush()

    expect(save).toHaveBeenCalledWith('switching documents')
    expect(controller.hasUnsavedChanges).toBe(false)
  })

  it('flush() waits for an in-flight save and then writes newer edits', async () => {
    const slow = deferred()
    const persisted: string[] = []
    const save = vi.fn(async (value: string) => {
      if (value === 'old') await slow.promise
      persisted.push(value)
    })
    const { controller } = setup(save)

    controller.update('old')
    await vi.advanceTimersByTimeAsync(500)
    controller.update('new')
    const flushed = controller.flush()
    slow.resolve()
    await flushed

    expect(persisted).toEqual(['old', 'new'])
  })

  it('stops autosaving on a version conflict until resumed', async () => {
    const save = vi.fn().mockRejectedValueOnce(new SaveConflictError()).mockResolvedValue(undefined)
    const { controller, states } = setup(save)

    controller.update('mine')
    await vi.advanceTimersByTimeAsync(500)
    expect(states.at(-1)).toBe('conflict')

    controller.update('more typing')
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(1)

    controller.resume()
    await vi.advanceTimersByTimeAsync(500)
    expect(save).toHaveBeenLastCalledWith('more typing')
    expect(states.at(-1)).toBe('saved')
  })

  it('handles a save function that throws synchronously', async () => {
    const save = vi.fn(() => {
      throw new Error('boom')
    })
    const { controller, states } = setup(save)

    controller.update('x')
    await controller.flush()

    expect(states.at(-1)).toBe('error')
    expect(controller.hasUnsavedChanges).toBe(true)
  })
})
