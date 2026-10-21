<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { TerminalPane } from '../composables/useTerminalWindows'

const props = defineProps<{ pane: TerminalPane; active: boolean; scrollbarWidth: number }>()
const emit = defineEmits<{ mount: [paneId: string, host: HTMLElement]; select: [paneId: string] }>()

const host = ref<HTMLElement | null>(null)

onMounted(() => {
  if (host.value) emit('mount', props.pane.paneId, host.value)
})
</script>

<template>
  <!-- Select on the pane box, not xterm's whole-cell screen, so the fractional
       remainder also accepts focus. -->
  <div
    class="terminal-pane absolute overflow-hidden"
    :class="{ 'terminal-pane-scrollbar': scrollbarWidth > 0 }"
    :style="{ '--terminal-scrollbar-width': `${scrollbarWidth}px` }"
    data-testid="terminal-pane-host"
    :data-pane-id="pane.paneId"
    :data-active-pane="active ? 'true' : undefined"
    @mousedown="emit('select', pane.paneId)"
  >
    <div ref="host" class="size-full" />
  </div>
</template>

<style scoped>
/* The pane includes a gutter beyond the canvas when its scrollbar is enabled. */
.terminal-pane :deep(.xterm-viewport) { scrollbar-width: none; }
.terminal-pane :deep(.xterm-viewport::-webkit-scrollbar) { display: none; }
.terminal-pane-scrollbar :deep(.xterm-viewport) { scrollbar-width: auto; }
.terminal-pane-scrollbar :deep(.xterm-viewport::-webkit-scrollbar) {
  display: block;
  width: var(--terminal-scrollbar-width);
}
.terminal-pane-scrollbar :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: var(--color-text-4);
  border: 3px solid transparent;
  border-radius: 6px;
  background-clip: padding-box;
}
.terminal-pane-scrollbar :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: var(--color-app);
}
</style>
