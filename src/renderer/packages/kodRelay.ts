import { ModelProviderType, type ProviderBaseInfo, type ProviderModelInfo, type Settings } from '@shared/types'

export const KOD_RELAY_PROVIDER_ID = '__kod_relay_station__'
export const KOD_RELAY_STORAGE_KEY = 'kod_relay'
export const KOD_STATIONS_STORAGE_KEY = 'kod_stations'

export interface KodRelayStation {
  id: number
  url: string
  create_time?: string
}

export interface KodRelayKey {
  id: number
  station_id: number
  api_key: string
  status: number
  create_time?: string
}

export interface KodRelaySelection {
  stationId: number
  stationUrl: string
  apiKeyId: number
  apiKey: string
}

export interface KodRelayBalance {
  can_chat?: boolean
  connected_station_id?: number | null
  connected_station_url?: string | null
  connected_key_id?: number | null
  connected_api_key?: string | null
}

export interface KodRelayApiResult<T> {
  code: number
  message?: string
  data?: T | null
}

export class KodRelayConflictError extends Error {
  constructor(message = '所选节点已被占用，请重新选择') {
    super(message)
    this.name = 'KodRelayConflictError'
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

async function parseKodRelayResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as KodRelayApiResult<T>
  if (response.status === 409 || result.code === 409) {
    throw new KodRelayConflictError(result.message)
  }
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || `Kod API request failed (${response.status})`)
  }
  if (result.data == null) {
    throw new Error(result.message || 'Kod API response missing data')
  }
  return result.data
}

export async function listKodRelayStations(apiOrigin: string, signal?: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/relay-station/list`, { signal })
  return parseKodRelayResponse<KodRelayStation[]>(response)
}

export async function listKodRelayKeys(apiOrigin: string, stationId: number, signal?: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/relay-station/${stationId}/keys`, { signal })
  return parseKodRelayResponse<KodRelayKey[]>(response)
}

export async function selectKodRelayKey(apiOrigin: string, token: string, selection: KodRelaySelection) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/session/select-key`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ station_id: selection.stationId, api_key_id: selection.apiKeyId }),
  })
  const result = (await response.json()) as KodRelayApiResult<unknown>
  if (response.status === 409 || result.code === 409) {
    throw new KodRelayConflictError(result.message)
  }
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || `Kod API request failed (${response.status})`)
  }
}

export async function releaseKodRelayKey(apiOrigin: string, token: string) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/session/release-key`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  const result = (await response.json()) as KodRelayApiResult<unknown>
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || `Kod API request failed (${response.status})`)
  }
}

export async function getKodRelayBalance(apiOrigin: string, token: string) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/session/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return parseKodRelayResponse<KodRelayBalance>(response)
}

export async function startKodRelayLogSync(apiOrigin: string, token: string) {
  const response = await fetch(`${normalizeBaseUrl(apiOrigin)}/api/log/sync/start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`Kod log sync failed (${response.status})`)
  }
}

export async function fetchKodRelayModels(selection: KodRelaySelection, signal?: AbortSignal) {
  const response = await fetch(`${normalizeBaseUrl(selection.stationUrl)}/models`, {
    headers: { Authorization: `Bearer ${selection.apiKey}` },
    signal,
  })
  if (!response.ok) {
    throw new Error(`Relay models request failed (${response.status})`)
  }
  const result = (await response.json()) as { data?: Array<{ id?: unknown; name?: unknown }> }
  return (result.data || []).flatMap<ProviderModelInfo>((item) => {
    if (typeof item.id !== 'string') return []
    return [{ modelId: item.id, nickname: typeof item.name === 'string' ? item.name : item.id, type: 'chat' }]
  })
}

export function readKodRelaySelection(storage: Pick<Storage, 'getItem'>): KodRelaySelection | null {
  try {
    const value = storage.getItem(KOD_RELAY_STORAGE_KEY)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<KodRelaySelection>
    if (
      typeof parsed.stationId !== 'number' ||
      typeof parsed.stationUrl !== 'string' ||
      typeof parsed.apiKeyId !== 'number' ||
      typeof parsed.apiKey !== 'string'
    ) {
      return null
    }
    return parsed as KodRelaySelection
  } catch {
    return null
  }
}

export function relaySelectionFromBalance(balance: KodRelayBalance): KodRelaySelection | null {
  if (
    typeof balance.connected_station_id !== 'number' ||
    typeof balance.connected_station_url !== 'string' ||
    typeof balance.connected_key_id !== 'number' ||
    typeof balance.connected_api_key !== 'string'
  ) {
    return null
  }
  return {
    stationId: balance.connected_station_id,
    stationUrl: balance.connected_station_url,
    apiKeyId: balance.connected_key_id,
    apiKey: balance.connected_api_key,
  }
}

export function applyKodRelayProvider(
  settings: Settings,
  selection: KodRelaySelection | null,
  models: ProviderModelInfo[]
): Partial<Settings> {
  const providers = { ...(settings.providers || {}) }
  const customProviders = (settings.customProviders || []).filter((provider) => provider.id !== KOD_RELAY_PROVIDER_ID)
  delete providers[KOD_RELAY_PROVIDER_ID]

  if (!selection) return { providers, customProviders }

  providers[KOD_RELAY_PROVIDER_ID] = {
    apiHost: selection.stationUrl,
    apiKey: selection.apiKey,
    models,
  }
  const provider: ProviderBaseInfo = {
    id: KOD_RELAY_PROVIDER_ID,
    name: 'KOD AI',
    type: ModelProviderType.OpenAI,
    isCustom: true,
    defaultSettings: {
      apiHost: selection.stationUrl,
      apiKey: selection.apiKey,
      models,
    },
  }
  return { providers, customProviders: [...customProviders, provider] }
}

export function isKodRelayModel(model: ProviderModelInfo, providerId?: string) {
  return providerId === KOD_RELAY_PROVIDER_ID && Boolean(model.modelId)
}
