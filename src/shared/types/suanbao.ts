export type SuanbaoAnimation = 'full' | 'reduced' | 'off'
export type SuanbaoPetState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'executing'
  | 'success'
  | 'error'
  | 'reminding'
  | 'focus'
  | 'rest'
  | 'sleeping'

export interface SuanbaoPosition {
  x: number
  y: number
}

export interface SuanbaoPreferences {
  schemaVersion: 2
  enabled: boolean
  hidden: boolean
  activeMode: boolean
  soundEnabled: boolean
  animation: SuanbaoAnimation
  locked: boolean
  desktopOverlayEnabled: boolean
  notificationsEnabled: boolean
  locationMode: 'permission' | 'manual' | 'off'
  calendarEnabled: boolean
  doNotDisturb?: { start: string; end: string }
}

export interface SuanbaoPlacement extends SuanbaoPosition {
  mode: 'in-app' | 'desktop'
  displayId?: string
  anchor: 'free' | 'bottom-left' | 'bottom-right'
  scaleFactor?: number
  locked: boolean
}

export type SuanbaoRouteId = 'home' | 'new-chat' | 'recent-chat' | 'image-creator' | 'task-home' | 'suanbao-settings'

export type SuanbaoCommand =
  | { type: 'message'; input: string; locale: string }
  | { type: 'navigate'; route: SuanbaoRouteId }
  | { type: 'set-visibility'; hidden: boolean }
  | { type: 'set-locked'; locked: boolean }
  | { type: 'cancel'; operationId: string }
  | { type: 'confirm'; operationId: string }

export type SuanbaoOperationStatus =
  | 'draft'
  | 'awaiting-confirmation'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type SuanbaoAction =
  | { kind: 'create-todo'; title: string; dueAt?: number }
  | { kind: 'create-reminder'; title: string; triggerAt: number; timezone: string; recurrence?: 'daily' | 'weekly' }
  | { kind: 'start-pomodoro'; durationMs: number }
  | {
      kind: 'create-local-calendar-event'
      title: string
      startsAt: number
      endsAt: number
      timezone: string
      notes?: string
    }

export interface SuanbaoOperation {
  id: string
  command: SuanbaoCommand
  action?: SuanbaoAction
  idempotencyKey?: string
  status: SuanbaoOperationStatus
  createdAt: number
  updatedAt: number
  resultEntityId?: string
  errorCode?: string
}

export interface SuanbaoConfirmation {
  id: string
  operationId: string
  kind: 'todo' | 'reminder' | 'pomodoro' | 'local-calendar-event'
  title: string
  fields: Array<{ label: string; value: string }>
  idempotencyKey: string
  action: SuanbaoAction
}

export interface SuanbaoActivity {
  state: SuanbaoPetState
  operationId?: string
  message?: string
  confirmation?: SuanbaoConfirmation
}

export interface SuanbaoViewModel {
  revision: number
  preferences: SuanbaoPreferences
  activity: SuanbaoActivity
}

export interface SuanbaoTodoItem {
  id: string
  title: string
  completed: boolean
  dueAt?: number
  createdAt: number
  updatedAt: number
}

export interface SuanbaoReminder {
  id: string
  title: string
  triggerAt: number
  timezone: string
  recurrence?: 'daily' | 'weekly'
  status: 'scheduled' | 'fired' | 'dismissed' | 'cancelled'
  platformScheduleId?: string
  firedAt?: number
  createdAt: number
  updatedAt: number
  revision: number
}

export interface SuanbaoPomodoroSession {
  id: string
  phase: 'work' | 'short-break' | 'long-break'
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  durationMs: number
  startedAt?: number
  endsAt?: number
  remainingMs?: number
  completedWorkCycles: number
  createdAt: number
  updatedAt: number
  completedAt?: number
  revision: number
}

export interface SuanbaoLocalCalendarEvent {
  id: string
  title: string
  startsAt: number
  endsAt: number
  timezone: string
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface SuanbaoSystemCalendarEvent {
  externalId: string
  calendarName: string
  title: string
  startsAt: number
  endsAt: number
  allDay: boolean
  fetchedAt: number
}

export type SuanbaoWeatherLocation =
  | { type: 'coordinates'; latitude: number; longitude: number; label?: string }
  | { type: 'city'; name: string; countryCode?: string; latitude: number; longitude: number }

export interface SuanbaoWeatherSnapshot {
  location: SuanbaoWeatherLocation
  temperatureCelsius: number
  apparentTemperatureCelsius: number
  weatherCode: number
  fetchedAt: number
}

export type SuanbaoPermissionState = 'granted' | 'denied' | 'prompt' | 'limited' | 'unavailable'

export interface SuanbaoPlatformCapabilities {
  overlay: 'desktop-window' | 'in-app'
  notifications: boolean
  backgroundScheduling: 'reliable' | 'foreground-only' | 'unavailable'
  geolocation: boolean
  systemCalendarRead: boolean
}

export const MAX_SUANBAO_INPUT_LENGTH = 8_000

export function canTransitionSuanbaoOperation(from: SuanbaoOperationStatus, to: SuanbaoOperationStatus): boolean {
  return (
    (from === 'draft' && (to === 'awaiting-confirmation' || to === 'cancelled')) ||
    (from === 'awaiting-confirmation' && (to === 'running' || to === 'cancelled')) ||
    (from === 'running' && (to === 'succeeded' || to === 'failed' || to === 'cancelled')) ||
    (from === 'failed' && (to === 'running' || to === 'cancelled'))
  )
}

export function isSuanbaoRouteId(value: unknown): value is SuanbaoRouteId {
  return ['home', 'new-chat', 'recent-chat', 'image-creator', 'task-home', 'suanbao-settings'].includes(String(value))
}

export function isValidSuanbaoPosition(value: unknown): value is SuanbaoPosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Partial<SuanbaoPosition>
  return (
    typeof position.x === 'number' &&
    typeof position.y === 'number' &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.x <= 1 &&
    position.y >= 0 &&
    position.y <= 1
  )
}

export function isValidSuanbaoCommand(value: unknown): value is SuanbaoCommand {
  if (!value || typeof value !== 'object') return false
  const command = value as Record<string, unknown>
  switch (command.type) {
    case 'message':
      return (
        typeof command.input === 'string' &&
        command.input.trim().length > 0 &&
        command.input.length <= MAX_SUANBAO_INPUT_LENGTH &&
        typeof command.locale === 'string'
      )
    case 'navigate':
      return isSuanbaoRouteId(command.route)
    case 'set-visibility':
      return typeof command.hidden === 'boolean'
    case 'set-locked':
      return typeof command.locked === 'boolean'
    case 'cancel':
    case 'confirm':
      return typeof command.operationId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(command.operationId)
    default:
      return false
  }
}
