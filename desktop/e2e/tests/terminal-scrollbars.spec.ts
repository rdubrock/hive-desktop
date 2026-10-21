import { readFileSync } from 'node:fs'
import type { Locator, Page, WebSocketRoute } from '@playwright/test'
import { expect, test } from './fixtures.js'

// Headless Chromium hides native scrollbars by default, including their hit targets.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

function binding(service: string, method: string): number {
  const source = readFileSync(new URL(`../../frontend/bindings/github.com/hay-kot/hive-desktop/internal/adapter/wailsui/${service}.ts`, import.meta.url), 'utf8')
  const match = source.match(new RegExp(`function ${method}\\([^]*?ByID\\((\\d+)\\)`))
  if (!match) throw new Error(`Missing binding ${service}.${method}`)
  return Number(match[1])
}

async function terminalFixture(page: Page) {
  const available = binding('terminalservice', 'Available')
  const list = binding('sessionservice', 'ListSessions')
  const scratch = binding('terminalservice', 'Scratch')
  let socket: WebSocketRoute | undefined
  let cols = 100
  let rows = 30
  let split = false
  let zoomed = false
  const state = () => ({
    windowId: '@1', name: 'Scrollback', active: true, activePane: '%1', width: cols, height: rows, zoomed,
    layout: split ? {
      split: 'leftright', x: 0, y: 0, width: cols, height: rows,
      cells: [
        { paneId: '%1', x: 0, y: 0, width: Math.floor(cols / 2), height: rows },
        { paneId: '%2', x: Math.floor(cols / 2) + 1, y: 0, width: cols - Math.floor(cols / 2) - 1, height: rows },
      ],
    } : { paneId: '%1', x: 0, y: 0, width: cols, height: rows },
  })
  const sendLayout = () => socket?.send(Buffer.concat([Buffer.from([1]), Buffer.from(JSON.stringify({ kind: 'layout-changed', ...state() }))]))
  await page.route('**/wails/runtime', async (route) => {
    const id = route.request().postDataJSON()?.args?.methodID
    let answer: unknown
    if (id === available) answer = { available: true, reason: '' }
    else if (id === list) answer = [{ id: 'scrollbars', name: 'Scrollback', slug: 'scrollbars', repo: '', state: 'active' }]
    else if (id === scratch) answer = { slug: '', name: '' }
    else return route.fallback()
    await route.fulfill({ json: answer })
  })
  await page.route('**/api/terminal/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/terminal/', '')
    const headers = {
      'Access-Control-Allow-Origin': route.request().headers().origin ?? '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    if (path === 'attach') return route.fulfill({ json: { windows: [state()] }, headers })
    if (path === 'windows/list') return route.fulfill({ json: { sessions: { scrollbars: [state()] } }, headers })
    if (path === 'resize') {
      const size = route.request().postDataJSON()
      cols = size.cols
      rows = size.rows
      sendLayout()
    }
    await route.fulfill({ status: 204, headers })
  })
  await page.routeWebSocket('**/api/terminal/stream?*', (stream) => {
    socket = stream
    stream.send(Buffer.concat([
      Buffer.from([0, 2]), Buffer.from('@1'), Buffer.from([2]), Buffer.from('%1'),
      Buffer.from(Array.from({ length: 200 }, (_, i) => `scrollback line ${i}\r\n`).join('')),
    ]))
  })
  return {
    layout(nextSplit: boolean, nextZoomed: boolean) {
      split = nextSplit
      zoomed = nextZoomed
      sendLayout()
    },
  }
}

async function navigate(page: Page, hash: string) {
  await page.evaluate((next) => { location.hash = next }, hash)
}

async function waitForFittedTail(pane: Locator) {
  await expect.poll(() => pane.evaluate((el) => {
    const viewport = el.querySelector('.xterm-viewport')!
    const remaining = el.parentElement!.clientWidth - el.clientWidth
    const tailGap = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
    return remaining >= 0 && remaining < 12 && viewport.scrollHeight > viewport.clientHeight && Math.abs(tailGap) <= 1
  })).toBe(true)
  // xterm synchronizes its buffer on the DOM scroll event after moving to the tail.
  await pane.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
}

test('terminal scrollbars persist, drag beside the canvas, and follow single/split/zoom layouts', async ({ page }) => {
  const terminal = await terminalFixture(page)
  await page.goto('/#/terminal/scrollbars')
  const pane = page.locator('[data-pane-id="%1"]')
  const viewport = pane.locator('.xterm-viewport')
  await expect(viewport).toBeVisible()
  await expect(pane).not.toHaveClass(/terminal-pane-scrollbar/)

  await navigate(page, '/settings/terminal')
  const toggle = page.getByTestId('settings-terminal-show-scrollbars')
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await navigate(page, '/terminal/scrollbars')
  await expect(pane).toHaveClass(/terminal-pane-scrollbar/)
  await expect.poll(() => viewport.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await expect.poll(() => pane.evaluate((el) => {
    const screen = el.querySelector('.xterm-screen')!.getBoundingClientRect()
    const view = el.querySelector('.xterm-viewport')!.getBoundingClientRect()
    return Math.round(view.right - screen.right)
  })).toBe(12)

  const bottom = page.getByTestId('terminal-scroll-to-bottom')
  await waitForFittedTail(pane)
  await page.screenshot({ path: `screenshots/terminal-scrollbars-${test.info().project.name}.png` })
  await pane.hover()
  await page.mouse.wheel(0, -300)
  await expect(bottom).toBeVisible()
  await bottom.click()
  await expect(bottom).toBeHidden()

  await waitForFittedTail(pane)
  const box = (await viewport.boundingBox())!
  const thumbY = await viewport.evaluate((el) => {
    const thumbHeight = el.clientHeight * el.clientHeight / el.scrollHeight
    return el.clientHeight - thumbHeight / 2
  })
  await page.mouse.move(box.x + box.width - 6, box.y + thumbY)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 6, box.y + 30, { steps: 12 })
  await page.mouse.up()
  await expect(bottom).toBeVisible()
  await bottom.click()
  await expect(bottom).toBeHidden()

  terminal.layout(true, false)
  await expect(page.getByTestId('terminal-pane-host')).toHaveCount(2)
  await expect(pane).not.toHaveClass(/terminal-pane-scrollbar/)
  terminal.layout(true, true)
  await expect(pane).toHaveClass(/terminal-pane-scrollbar/)
  terminal.layout(false, false)
  await expect(pane).toHaveClass(/terminal-pane-scrollbar/)

  await page.reload()
  await expect(pane).toHaveClass(/terminal-pane-scrollbar/)
  await navigate(page, '/settings/terminal')
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await navigate(page, '/terminal/scrollbars')
  await expect(pane).not.toHaveClass(/terminal-pane-scrollbar/)
  await waitForFittedTail(pane)
  await pane.hover()
  await page.mouse.wheel(0, -300)
  await expect(bottom).toBeVisible()
})
