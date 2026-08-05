import { ModelProviderEnum, type ProviderModelInfo } from '@shared/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { KOD_RELAY_STORAGE_KEY } from '@/packages/kodRelay'
import { enrichModelsFromRegistry } from '@/packages/model-registry'
import { fetchKodRelayStationModels, getKodRelayStationConfig } from '@/packages/remote'
import { useAuthInfoStore } from '@/stores/authInfoStore'
import { useProviderSettings } from '@/stores/settingsStore'

const EMPTY_MODELS: ProviderModelInfo[] = []

const useChatboxAIModels = () => {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const { providerSettings: kodSettings, setProviderSettings } = useProviderSettings(ModelProviderEnum.ChatboxAI)
  const manualRelaySelected = Boolean(localStorage.getItem(KOD_RELAY_STORAGE_KEY))

  const { data, ...others } = useQuery({
    queryKey: ['kod-ai-models', accessToken, manualRelaySelected],
    enabled: Boolean(accessToken) && !manualRelaySelected,
    queryFn: async () => {
      if (!accessToken) {
        return { models: EMPTY_MODELS }
      }

      const relayStation = await getKodRelayStationConfig(accessToken)
      const fetchedModels = await fetchKodRelayStationModels(relayStation)
      const models = enrichModelsFromRegistry(fetchedModels, ModelProviderEnum.ChatboxAI)

      setProviderSettings((previousSettings) => ({
        ...previousSettings,
        apiHost: relayStation.url,
        apiKey: relayStation.apiKey,
        models,
        excludedModels: previousSettings?.excludedModels?.filter((modelId) =>
          models.some((m) => m.modelId === modelId)
        ),
      }))

      return { relayStation, models }
    },
    staleTime: 3600 * 1000,
    retry: 1,
  })

  const allChatboxAIModels = accessToken && !manualRelaySelected ? data?.models || EMPTY_MODELS : EMPTY_MODELS

  const chatboxAIModels = useMemo(
    () => allChatboxAIModels.filter((m) => m.type !== 'image' && !kodSettings?.excludedModels?.includes(m.modelId)),
    [allChatboxAIModels, kodSettings]
  )

  // 图像生成模型（type === 'image'），分拣到 image 组供 Image Creator / 图片会话使用
  const chatboxAIImageModels = useMemo(() => allChatboxAIModels.filter((m) => m.type === 'image'), [allChatboxAIModels])

  return {
    allChatboxAIModels,
    chatboxAIModels,
    chatboxAIImageModels,
    ...others,
  }
}

export default useChatboxAIModels
