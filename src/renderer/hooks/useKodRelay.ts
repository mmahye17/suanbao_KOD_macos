import type { ProviderModelInfo } from '@shared/types'
import { useCallback, useEffect, useMemo } from 'react'
import { createStore, useStore } from 'zustand'
import {
  applyKodRelayProvider,
  fetchKodRelayModels,
  getKodRelayBalance,
  isKodRelayModel,
  KOD_RELAY_PROVIDER_ID,
  KOD_RELAY_STORAGE_KEY,
  KodRelayConflictError,
  type KodRelaySelection,
  readKodRelaySelection,
  relaySelectionFromBalance,
  releaseKodRelayKey,
  selectKodRelayKey,
  startKodRelayLogSync,
} from '@/packages/kodRelay'
import { getKodApiOrigin } from '@/packages/remote'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import { settingsStore } from '@/stores/settingsStore'

export type KodRelayNotice = 'conflict' | 'balance' | 'unavailable' | null

interface KodRelayState {
  selection: KodRelaySelection | null
  models: ProviderModelInfo[]
  loading: boolean
  notice: KodRelayNotice
  initializedToken: string | null
}

export const kodRelayStore = createStore<KodRelayState>(() => ({
  selection: null,
  models: [],
  loading: false,
  notice: null,
  initializedToken: null,
}))

let operationId = 0
let restorePromise: Promise<void> | null = null

function persistSelection(selection: KodRelaySelection | null) {
  try {
    if (selection) localStorage.setItem(KOD_RELAY_STORAGE_KEY, JSON.stringify(selection))
    else localStorage.removeItem(KOD_RELAY_STORAGE_KEY)
  } catch {
    // Storage can be unavailable in restricted webviews.
  }
}

function commit(selection: KodRelaySelection | null, models: ProviderModelInfo[]) {
  kodRelayStore.setState({ selection, models })
  persistSelection(selection)
  settingsStore.setState((settings) => applyKodRelayProvider(settings, selection, models))
}

function setNotice(notice: KodRelayNotice) {
  kodRelayStore.setState({ notice })
}

export function clearKodRelayLocalState() {
  operationId += 1
  restorePromise = null
  kodRelayStore.setState({ initializedToken: null, loading: false, notice: null })
  commit(null, [])
}

export async function clearKodRelay(release = true) {
  const currentOperation = ++operationId
  const token = authInfoStore.getState().accessToken
  commit(null, [])
  if (release && token) {
    try {
      await releaseKodRelayKey(getKodApiOrigin(), token)
    } catch (error) {
      console.warn('[Kod relay] failed to release key', error)
    }
  }
  return currentOperation === operationId
}

export async function selectKodRelay(selection: KodRelaySelection | null) {
  if (!selection) {
    await clearKodRelay()
    return
  }

  const token = authInfoStore.getState().accessToken
  const apiOrigin = getKodApiOrigin()
  const currentOperation = ++operationId
  const previousSelection = kodRelayStore.getState().selection
  kodRelayStore.setState({ loading: true, notice: null })

  try {
    if (token && previousSelection) await releaseKodRelayKey(apiOrigin, token)
    if (currentOperation !== operationId) return

    let selectedOnServer = false
    try {
      if (token) {
        await selectKodRelayKey(apiOrigin, token, selection)
        selectedOnServer = true
      }
      const models = await fetchKodRelayModels(selection)
      if (currentOperation !== operationId) {
        if (selectedOnServer && token) await releaseKodRelayKey(apiOrigin, token).catch(() => undefined)
        return
      }
      commit(selection, models)
    } catch (error) {
      if (selectedOnServer && token) {
        await releaseKodRelayKey(apiOrigin, token).catch((releaseError) =>
          console.warn('[Kod relay] failed to compensate selected key', releaseError)
        )
      }
      throw error
    }
  } catch (error) {
    if (currentOperation !== operationId) return
    commit(null, [])
    if (error instanceof KodRelayConflictError) setNotice('conflict')
    else {
      setNotice('unavailable')
      console.warn('[Kod relay] failed to select key', error)
    }
  } finally {
    if (currentOperation === operationId) kodRelayStore.setState({ loading: false })
  }
}

export function ensureKodRelayRestored(token: string) {
  const state = kodRelayStore.getState()
  if (state.initializedToken === token && (state.selection === null || state.models.length > 0))
    return Promise.resolve()
  if (restorePromise && state.initializedToken === token) return restorePromise

  const currentOperation = ++operationId
  const apiOrigin = getKodApiOrigin()
  kodRelayStore.setState({ initializedToken: token, loading: true })
  restorePromise = (async () => {
    try {
      const stored = readKodRelaySelection(localStorage)
      const restored = stored || relaySelectionFromBalance(await getKodRelayBalance(apiOrigin, token))
      if (!restored) {
        if (currentOperation === operationId) commit(null, [])
        return
      }
      const models = await fetchKodRelayModels(restored)
      if (currentOperation === operationId) commit(restored, models)
    } catch (error) {
      if (currentOperation === operationId) {
        console.warn('[Kod relay] failed to restore selection', error)
        commit(null, [])
      }
    } finally {
      if (currentOperation === operationId) kodRelayStore.setState({ loading: false })
      restorePromise = null
    }
  })()
  return restorePromise
}

export function useKodRelay() {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const state = useStore(kodRelayStore)
  const apiOrigin = getKodApiOrigin()

  useEffect(() => {
    if (accessToken) void ensureKodRelayRestored(accessToken)
    else clearKodRelayLocalState()
  }, [accessToken])

  const checkReadyAndStartSync = useCallback(async () => {
    const { selection, models } = kodRelayStore.getState()
    const token = authInfoStore.getState().accessToken
    if (!token || !selection || models.length === 0) {
      setNotice('unavailable')
      return false
    }
    try {
      const balance = await getKodRelayBalance(apiOrigin, token)
      if (balance.can_chat === false) {
        setNotice('balance')
        return false
      }
    } catch (error) {
      console.warn('[Kod relay] balance check failed', error)
    }
    void startKodRelayLogSync(apiOrigin, token).catch((error) =>
      console.warn('[Kod relay] failed to start log sync', error)
    )
    return true
  }, [apiOrigin])

  const modelFilter = useMemo(
    () => (model: ProviderModelInfo, providerId?: string) =>
      Boolean(state.selection && state.models.length) && isKodRelayModel(model, providerId),
    [state.models.length, state.selection]
  )

  return {
    apiOrigin,
    ...state,
    setNotice,
    select: selectKodRelay,
    clear: clearKodRelay,
    checkBalanceAndStartSync: checkReadyAndStartSync,
    modelFilter,
    providerId: KOD_RELAY_PROVIDER_ID,
  }
}
