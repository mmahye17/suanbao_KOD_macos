import { createStore, useStore } from 'zustand'
import { deriveAccountKey } from '@/storage/accountKey'
import { authInfoStore } from '@/stores/authInfoStore'
import { clampNormalizedPosition, DEFAULT_SUANBAO_POSITION, type SuanbaoPosition } from './suanbaoUtils'

export type SuanbaoAnimation = 'full' | 'reduced' | 'off'
export interface SuanbaoPreferences {
  enabled: boolean
  hidden: boolean
  position: SuanbaoPosition
  animation: SuanbaoAnimation
}

const DEFAULT_PREFERENCES: SuanbaoPreferences = {
  enabled: true,
  hidden: false,
  position: DEFAULT_SUANBAO_POSITION,
  animation: 'full',
}
const STORAGE_PREFIX = 'suanbao-preferences-v1'

export function getSuanbaoAccountKey(email?: string | null): string {
  return email ? deriveAccountKey(email) : 'guest'
}

export function sanitizeSuanbaoPreferences(value?: Partial<SuanbaoPreferences> | null): SuanbaoPreferences {
  return {
    enabled: value?.enabled ?? true,
    hidden: value?.hidden ?? false,
    position: clampNormalizedPosition(value?.position ?? DEFAULT_SUANBAO_POSITION),
    animation: ['full', 'reduced', 'off'].includes(value?.animation || '')
      ? (value?.animation as SuanbaoAnimation)
      : 'full',
  }
}

const storageKey = (accountKey: string) => `${STORAGE_PREFIX}:${accountKey}`

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function persist(accountKey: string, preferences: SuanbaoPreferences): void {
  try {
    getLocalStorage()?.setItem(storageKey(accountKey), JSON.stringify(preferences))
  } catch {
    // Preferences remain active in memory when storage is unavailable.
  }
}

function load(accountKey: string): SuanbaoPreferences {
  try {
    const raw = getLocalStorage()?.getItem(storageKey(accountKey))
    return sanitizeSuanbaoPreferences(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_PREFERENCES, position: { ...DEFAULT_PREFERENCES.position } }
  }
}

interface SuanbaoState extends SuanbaoPreferences {
  accountKey: string
  setPreferences: (preferences: Partial<SuanbaoPreferences>) => void
  restore: () => void
  switchAccount: (email?: string | null) => void
}

const initialAccountKey = getSuanbaoAccountKey(authInfoStore.getState().loginEmail)
export const suanbaoStore = createStore<SuanbaoState>((set, get) => ({
  accountKey: initialAccountKey,
  ...load(initialAccountKey),
  setPreferences: (preferences) => {
    const next = sanitizeSuanbaoPreferences({ ...get(), ...preferences })
    persist(get().accountKey, next)
    set(next)
  },
  restore: () => {
    const next = { ...DEFAULT_PREFERENCES, position: { ...DEFAULT_PREFERENCES.position } }
    persist(get().accountKey, next)
    set(next)
  },
  switchAccount: (email) => {
    const accountKey = getSuanbaoAccountKey(email)
    set({ accountKey, ...load(accountKey) })
  },
}))

authInfoStore.subscribe(
  (state) => state.loginEmail,
  (email) => suanbaoStore.getState().switchAccount(email)
)

export function useSuanbaoStore<U>(selector: Parameters<typeof useStore<typeof suanbaoStore, U>>[1]) {
  return useStore<typeof suanbaoStore, U>(suanbaoStore, selector)
}
