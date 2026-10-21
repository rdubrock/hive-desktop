import { flushPromises } from '@vue/test-utils'
import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ read: vi.fn(), persist: vi.fn() }))
vi.mock('../../../bindings/github.com/hay-kot/hive-desktop/internal/adapter/wailsui/settingsservice', () => ({
  AppearanceSettings: mocks.read,
  SetTerminalShowScrollbars: mocks.persist,
}))

beforeEach(() => {
  vi.resetModules()
  mocks.read.mockReset().mockResolvedValue({ terminalShowScrollbars: false })
  mocks.persist.mockReset().mockResolvedValue(undefined)
})

it('hydrates the saved preference once for every mounted consumer', async () => {
  mocks.read.mockResolvedValue({ terminalShowScrollbars: true })
  const { useTerminalScrollbars } = await import('../useTerminalScrollbars')
  const first = useTerminalScrollbars()
  const second = useTerminalScrollbars()
  expect(first.showScrollbars.value).toBe(false)
  await flushPromises()
  expect(first.showScrollbars).toBe(second.showScrollbars)
  expect(second.showScrollbars.value).toBe(true)
  expect(mocks.read).toHaveBeenCalledTimes(1)
})

it('preserves a toggle made during hydration and serializes rapid writes', async () => {
  let loaded!: (value: { terminalShowScrollbars: boolean }) => void
  let saved!: () => void
  mocks.read.mockImplementation(() => new Promise((resolve) => { loaded = resolve }))
  mocks.persist.mockImplementationOnce(() => new Promise<void>((resolve) => { saved = resolve }))
  const { useTerminalScrollbars, setTerminalShowScrollbars } = await import('../useTerminalScrollbars')
  const { showScrollbars } = useTerminalScrollbars()
  setTerminalShowScrollbars(true)
  loaded({ terminalShowScrollbars: false })
  await flushPromises()
  expect(showScrollbars.value).toBe(true)
  setTerminalShowScrollbars(false)
  await flushPromises()
  expect(mocks.persist.mock.calls).toEqual([[true]])
  saved()
  await flushPromises()
  expect(mocks.persist.mock.calls).toEqual([[true], [false]])
  expect(showScrollbars.value).toBe(false)
})
