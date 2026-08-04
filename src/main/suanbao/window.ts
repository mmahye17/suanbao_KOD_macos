import path from 'node:path'
import type { SuanbaoAnimationLevel, SuanbaoPlacement, SuanbaoPlatformCapabilities } from '@shared/types/suanbao'
import { suanbaoPlacementSchema } from '@shared/types/suanbao'
import { BrowserWindow, screen } from 'electron'
import log from 'electron-log/main'
import { clampDesktopPlacement, defaultDesktopPlacement, type SuanbaoDisplaySnapshot } from './placement'

const PET_WINDOW_SIZE = { width: 360, height: 420 }
const SAVE_DELAY_MS = 150

export interface SuanbaoWindowManagerOptions {
  getMainWindow(): BrowserWindow | null
  preloadPath: string
  productionHtmlPath: string
  developmentUrl?: string
  loadPlacement(): unknown
  savePlacement(placement: SuanbaoPlacement): void
  openMainWindow(): void
}

function getDisplaySnapshots(): SuanbaoDisplaySnapshot[] {
  const primaryId = String(screen.getPrimaryDisplay().id)
  return screen.getAllDisplays().map((display) => ({
    id: String(display.id),
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    primary: String(display.id) === primaryId,
  }))
}

export class SuanbaoWindowManager {
  private petWindow: BrowserWindow | null = null
  private enabled = false
  private animation: SuanbaoAnimationLevel = 'off'
  private placement: SuanbaoPlacement
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private readonly displayChanged = () => this.restorePlacement()

  constructor(private readonly options: SuanbaoWindowManagerOptions) {
    const parsedPlacement = suanbaoPlacementSchema.safeParse(options.loadPlacement())
    this.placement = parsedPlacement.success ? parsedPlacement.data : defaultDesktopPlacement()

    screen.on('display-added', this.displayChanged)
    screen.on('display-removed', this.displayChanged)
    screen.on('display-metrics-changed', this.displayChanged)
  }

  getCapabilities(): SuanbaoPlatformCapabilities {
    return {
      overlay: 'desktop-window',
      notifications: true,
      backgroundScheduling: true,
      geolocation: false,
      systemCalendarRead: false,
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  isVisible(): boolean {
    return this.petWindow?.isVisible() ?? false
  }

  shouldKeepMainRendererAlive(): boolean {
    return this.enabled
  }

  getAnimation(): SuanbaoAnimationLevel {
    return this.animation
  }

  setAnimation(animation: SuanbaoAnimationLevel): void {
    this.animation = animation
  }

  getPlacement(): SuanbaoPlacement {
    return { ...this.placement }
  }

  getWindow(): BrowserWindow | null {
    return this.petWindow
  }

  isPetWindowSender(webContentsId: number): boolean {
    return this.petWindow?.webContents.id === webContentsId
  }

  isMainWindowSender(webContentsId: number): boolean {
    return this.options.getMainWindow()?.webContents.id === webContentsId
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    if (!enabled) {
      this.hide()
      return
    }
    await this.show()
  }

  async show(): Promise<void> {
    if (!this.enabled) return
    const window = await this.ensureWindow()
    if (!window.isVisible()) window.showInactive()
  }

  hide(): void {
    this.petWindow?.hide()
  }

  async toggleFromTray(): Promise<void> {
    if (!this.enabled) {
      await this.setEnabled(true)
      return
    }
    if (this.isVisible()) this.hide()
    else await this.show()
  }

  setInteractive(interactive: boolean): void {
    this.petWindow?.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  updatePlacement(nextPlacement: SuanbaoPlacement): SuanbaoPlacement {
    const parsed = suanbaoPlacementSchema.parse(nextPlacement)
    this.placement = clampDesktopPlacement(parsed, getDisplaySnapshots(), PET_WINDOW_SIZE)
    this.petWindow?.setBounds({
      x: this.placement.x,
      y: this.placement.y,
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
    })
    this.scheduleSave()
    return this.getPlacement()
  }

  restorePlacement(): void {
    this.placement = clampDesktopPlacement(this.placement, getDisplaySnapshots(), PET_WINDOW_SIZE)
    this.petWindow?.setBounds({
      x: this.placement.x,
      y: this.placement.y,
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
    })
    this.scheduleSave()
  }

  openMainWindow(): void {
    this.options.openMainWindow()
  }

  destroy(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.options.savePlacement(this.placement)
    screen.off('display-added', this.displayChanged)
    screen.off('display-removed', this.displayChanged)
    screen.off('display-metrics-changed', this.displayChanged)
    this.petWindow?.destroy()
    this.petWindow = null
  }

  private async ensureWindow(): Promise<BrowserWindow> {
    if (this.petWindow && !this.petWindow.isDestroyed()) return this.petWindow

    this.restorePlacement()
    const window = new BrowserWindow({
      width: PET_WINDOW_SIZE.width,
      height: PET_WINDOW_SIZE.height,
      x: this.placement.x,
      y: this.placement.y,
      transparent: true,
      frame: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        preload: this.options.preloadPath,
      },
    })

    this.petWindow = window
    window.setMenuBarVisibility(false)
    window.setAlwaysOnTop(true, 'floating')
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.on('will-attach-webview', (event) => event.preventDefault())
    window.on('closed', () => {
      if (this.petWindow === window) this.petWindow = null
    })
    window.on('move', () => this.captureCurrentBounds())

    try {
      if (this.options.developmentUrl) await window.loadURL(this.options.developmentUrl)
      else await window.loadFile(this.options.productionHtmlPath)
    } catch (error) {
      log.error('[Suanbao] Failed to load pet window:', error)
      window.destroy()
      throw error
    }

    return window
  }

  private captureCurrentBounds(): void {
    if (!this.petWindow || this.petWindow.isDestroyed()) return
    const bounds = this.petWindow.getBounds()
    this.placement = clampDesktopPlacement(
      { ...this.placement, x: bounds.x, y: bounds.y, anchor: 'free' },
      getDisplaySnapshots(),
      PET_WINDOW_SIZE
    )
    this.scheduleSave()
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.options.savePlacement(this.placement)
      this.saveTimer = undefined
    }, SAVE_DELAY_MS)
  }
}

export function resolveSuanbaoPreloadPath(isPackaged: boolean, dirname: string): string {
  return isPackaged ? path.join(dirname, '../preload/suanbao.js') : path.join(dirname, '../../out/preload/suanbao.js')
}
