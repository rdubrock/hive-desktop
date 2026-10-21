import { ref, type Ref } from 'vue'
import {
  AppearanceSettings as GetAppearanceSettings,
  SetTerminalShowScrollbars as PersistTerminalShowScrollbars,
} from '../../bindings/github.com/hay-kot/hive-desktop/internal/adapter/wailsui/settingsservice'

export const terminalScrollbarWidth = 12

const showScrollbars = ref(false)
let hydrated = false
let version = 0
let persistChain: Promise<void> = Promise.resolve()

async function hydrate(): Promise<void> {
  const startedAt = version
  try {
    const settings = await GetAppearanceSettings()
    if (version === startedAt) showScrollbars.value = settings.terminalShowScrollbars === true
  } catch (error) {
    console.warn('Unable to load terminal scrollbars from settings.yaml', error)
  }
}

export function setTerminalShowScrollbars(next: boolean): void {
  version++
  showScrollbars.value = next
  persistChain = persistChain
    .then(async () => { await PersistTerminalShowScrollbars(next) })
    .catch((error: unknown) => {
      console.warn('Unable to persist terminal scrollbars to settings.yaml', error)
    })
}

export function useTerminalScrollbars(): { showScrollbars: Ref<boolean> } {
  if (!hydrated) {
    hydrated = true
    void hydrate()
  }
  return { showScrollbars }
}

export function scrollbarWidthFor(tab: { panes: unknown[]; zoomed: boolean }, enabled: boolean): number {
  return enabled && (tab.zoomed || tab.panes.length === 1) ? terminalScrollbarWidth : 0
}
