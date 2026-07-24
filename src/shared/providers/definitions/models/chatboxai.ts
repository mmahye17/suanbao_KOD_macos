import { type AnthropicProviderOptions } from '@ai-sdk/anthropic'
import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
  type GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type ModelMessage, streamText, type ToolSet } from 'ai'
import AbstractAISDKModel, { type CallSettings } from '../../../models/abstract-ai-sdk'
import { addAnthropicCacheControl } from '../../../models/anthropic-cache'
import type {
  CallChatCompletionOptions,
  ChatStreamOptions,
  ModelInterface,
  ModelStreamPart,
} from '../../../models/types'
import { getChatboxAPIOrigin } from '../../../request/chatboxai_pool'
import type { ChatboxAILicenseDetail, ProviderModelInfo, StreamTextResult } from '../../../types'
import type { ModelDependencies } from '../../../types/adapters'
import { buildGeminiImageConfig } from '../gemini-types'

interface Options {
  licenseKey?: string
  apiHost?: string
  apiKey?: string
  model: ProviderModelInfo
  licenseInstances?: {
    [key: string]: string
  }
  licenseDetail?: ChatboxAILicenseDetail
  language: string
  dalleStyle: 'vivid' | 'natural'
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  stream?: boolean
}

interface Config {
  uuid: string
}

// 将chatboxAIFetch移到类内部作为私有方法

export default class ChatboxAI extends AbstractAISDKModel implements ModelInterface {
  public name = 'ChatboxAI'

  constructor(
    public options: Options,
    public config: Config,
    dependencies: ModelDependencies
  ) {
    options.stream = true
    super(options, dependencies)
  }

  private async chatboxAIFetch(url: RequestInfo | URL, options?: RequestInit) {
    return this.dependencies.request.fetchWithOptions(url.toString(), options, { parseChatboxRemoteError: true })
  }

  static isSupportTextEmbedding() {
    return true
  }

  protected getProvider(options: CallChatCompletionOptions) {
    const license = this.options.licenseKey || ''
    const instanceId = (this.options.licenseInstances ? this.options.licenseInstances[license] : '') || ''
    const relayApiHost = this.options.apiHost?.replace(/\/+$/, '')
    if (relayApiHost && this.options.apiKey) {
      return createOpenAICompatible({
        name: 'KodAI',
        apiKey: this.options.apiKey,
        baseURL: relayApiHost,
        headers: {
          'chatbox-session-id': options.sessionId || '',
        },
        fetch: this.chatboxAIFetch.bind(this),
      })
    }

    // P0 去云化：禁用上游 Chatbox 云回退路径。
    // 原逻辑在中转站未配置时，按 apiStyle 回退到 getChatboxAPIOrigin()/gateway/...（api.chatboxai.app），
    // 会静默走上游云。改为明确抛错，引导用户登录/配置中转站，绝不偷偷连云。
    // 原回退分支（google/anthropic/openai-responses/openai）保留为注释，便于回滚或后续彻底删除。
    // TODO(P1): 配合许可证体系改造时，决定是否彻底删除这些分支。
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void license
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void instanceId
    throw new Error(
      'Kod AI relay station is not configured. Please log in to enable Kod AI.'
    )
    // 原上游回退分支（注释保留）：
    // if (this.options.model.apiStyle === 'google') {
    //   const provider = createGoogleGenerativeAI({
    //     apiKey: this.options.licenseKey || '',
    //     baseURL: `${getChatboxAPIOrigin()}/gateway/google-ai-studio/v1beta`,
    //     headers: {
    //       'Instance-Id': instanceId,
    //       Authorization: `Bearer ${this.options.licenseKey || ''}`,
    //       'chatbox-session-id': options.sessionId,
    //     },
    //     fetch: this.chatboxAIFetch.bind(this),
    //   })
    //   return provider
    // } else if (this.options.model.apiStyle === 'anthropic') {
    //   const provider = createAnthropic({
    //     apiKey: this.options.licenseKey || '',
    //     baseURL: `${getChatboxAPIOrigin()}/gateway/anthropic/v1`,
    //     headers: {
    //       'Instance-Id': instanceId,
    //       'chatbox-session-id': options.sessionId || '',
    //     },
    //     fetch: this.chatboxAIFetch.bind(this),
    //   })
    //   return provider
    // } else if (this.options.model.apiStyle === 'openai-responses') {
    //   const provider = createOpenAI({
    //     apiKey: this.options.licenseKey || '',
    //     baseURL: `${getChatboxAPIOrigin()}/gateway/openai-responses/v1`,
    //     headers: {
    //       'Instance-Id': instanceId,
    //       'chatbox-session-id': options.sessionId || '',
    //     },
    //     fetch: this.chatboxAIFetch.bind(this),
    //   })
    //   return provider
    // } else {
    //   const provider = createOpenAICompatible({
    //     name: 'ChatboxAI',
    //     apiKey: this.options.licenseKey || '',
    //     baseURL: `${getChatboxAPIOrigin()}/gateway/openai/v1`,
    //     headers: {
    //       'Instance-Id': instanceId,
    //       'chatbox-session-id': options.sessionId || '',
    //     },
    //     fetch: this.chatboxAIFetch.bind(this),
    //   })
    //   return provider
    // }
  }

  protected getCallSettings(options: CallChatCompletionOptions): CallSettings {
    if (this.options.model.apiStyle === 'anthropic') {
      const isModelSupportReasoning = this.isSupportReasoning()
      let providerOptions = {} as { anthropic: AnthropicProviderOptions }
      if (isModelSupportReasoning) {
        providerOptions = {
          anthropic: {
            ...(options.providerOptions?.claude || {}),
          },
        }
      }
      // Anthropic API requires only one of temperature or topP
      const callSettings: CallSettings = {
        providerOptions,
        maxOutputTokens: this.options.maxOutputTokens,
      }
      if (this.options.temperature !== undefined) {
        callSettings.temperature = this.options.temperature
      } else if (this.options.topP !== undefined) {
        callSettings.topP = this.options.topP
      }
      return callSettings
    }
    return {
      temperature: this.options.temperature,
      topP: this.options.topP,
      maxOutputTokens: this.options.maxOutputTokens,
    }
  }

  getChatModel(options: CallChatCompletionOptions) {
    const provider = this.getProvider(options)
    // P0 去云化：上游 gateway 回退分支已禁用，中转站统一返回 OpenAICompatibleProvider，
    // 不再按 apiStyle 断言成 Google/OpenAI-Responses 专用类型（那些分支已不可达）。
    return provider.languageModel(this.options.model.modelId)
  }

  public async paint(
    _params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    _signal?: AbortSignal,
    _callback?: (picBase64: string) => void | Promise<void>
  ): Promise<string[]> {
    // P0 去云化：关闭 Kod AI 图像生成云路径。
    // 原 paint() 走 paintWithGemini/paintWithChatboxAPI，均调用 getChatboxAPIOrigin()（api.chatboxai.app）。
    // BYOK 图像生成(OpenAI DALL·E / Gemini 自实现 paint)不走本类，不受影响。
    // 如需恢复，取消下方抛错并还原原分支逻辑。
    throw new Error('Kod AI image generation is disabled. Please use a BYOK provider (e.g. OpenAI DALL·E).')
    // 原逻辑保留（注释）便于回滚：
    // if (this.options.model.apiStyle === 'google') {
    //   return this.paintWithGemini(params, signal, callback)
    // }
    // return this.paintWithChatboxAPI(params, signal, callback)
  }

  private async paintWithGemini(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void | Promise<void>
  ): Promise<string[]> {
    const provider = this.getGoogleProvider()
    const model = provider.chat(this.options.model.modelId)

    const messageContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: string }> = []
    if (params.images && params.images.length > 0) {
      for (const img of params.images) {
        messageContent.push({ type: 'image', image: img.imageUrl })
      }
    }
    messageContent.push({ type: 'text', text: params.prompt })

    const results: string[] = []
    for (let i = 0; i < params.num; i++) {
      const providerOptions: GoogleGenerativeAIProviderOptions = {
        responseModalities: ['TEXT', 'IMAGE'],
      }
      const imageConfig = buildGeminiImageConfig(params.aspectRatio)
      if (imageConfig) {
        providerOptions.imageConfig = imageConfig
      }

      const result = streamText({
        model,
        messages: [{ role: 'user', content: messageContent }],
        abortSignal: signal,
        providerOptions: {
          google: providerOptions,
        },
        // Image generation is billable; network-error retries could double-charge.
        maxRetries: 0,
      })

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'file' && chunk.file.mediaType?.startsWith('image/') && chunk.file.base64) {
          const dataUrl = `data:${chunk.file.mediaType};base64,${chunk.file.base64}`
          results.push(dataUrl)
          await callback?.(dataUrl)
        }
      }
    }
    return results
  }

  private getGoogleProvider(): GoogleGenerativeAIProvider {
    const license = this.options.licenseKey || ''
    const instanceId = (this.options.licenseInstances ? this.options.licenseInstances[license] : '') || ''
    return createGoogleGenerativeAI({
      apiKey: this.options.licenseKey || '',
      baseURL: `${getChatboxAPIOrigin()}/gateway/google-ai-studio/v1beta`,
      headers: {
        'Instance-Id': instanceId,
        Authorization: `Bearer ${this.options.licenseKey || ''}`,
      },
      fetch: this.chatboxAIFetch.bind(this),
    })
  }

  private async paintWithChatboxAPI(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void | Promise<void>
  ): Promise<string[]> {
    const concurrence: Promise<string>[] = []
    for (let i = 0; i < params.num; i++) {
      concurrence.push(
        this.callImageGeneration(params.prompt, params.images, params.aspectRatio, signal).then(async (picBase64) => {
          await callback?.(picBase64)
          return picBase64
        })
      )
    }
    return await Promise.all(concurrence)
  }

  private async callImageGeneration(
    prompt: string,
    images?: { imageUrl: string }[],
    aspectRatio?: string,
    signal?: AbortSignal
  ): Promise<string> {
    const license = this.options.licenseKey || ''
    const instanceId = (this.options.licenseInstances ? this.options.licenseInstances[license] : '') || ''
    const modelId = this.options.model.modelId
    const res = await this.chatboxAIFetch(`${getChatboxAPIOrigin()}/api/ai/paint`, {
      headers: {
        Authorization: `Bearer ${license}`,
        'Instance-Id': instanceId,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      body: JSON.stringify({
        prompt,
        ...(modelId ? { model: modelId } : {}),
        images: images?.map((i) => ({ image_url: i.imageUrl })),
        response_format: 'b64_json',
        style: this.options.dalleStyle,
        aspect_ratio: aspectRatio,
        uuid: this.config.uuid,
        language: this.options.language,
      }),
      signal,
    })
    const json = await res.json()
    if (!json['data'] || !json['data'][0]) {
      throw new Error('Invalid response format from image generation API')
    }
    return json['data'][0]['b64_json']
  }

  public async chat(messages: ModelMessage[], options: CallChatCompletionOptions): Promise<StreamTextResult> {
    const cached = this.options.model.apiStyle === 'anthropic' ? addAnthropicCacheControl(messages) : messages
    return super.chat(cached, options)
  }

  public async *chatStream<T extends ToolSet>(
    messages: ModelMessage[],
    options: ChatStreamOptions
  ): AsyncGenerator<ModelStreamPart<T>> {
    const cached = this.options.model.apiStyle === 'anthropic' ? addAnthropicCacheControl(messages) : messages
    yield* super.chatStream<T>(cached, options)
  }

  isSupportSystemMessage() {
    return ![
      'o1-mini',
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash-thinking-exp',
      'gemini-2.0-flash-exp-image-generation',
    ].includes(this.options.model.modelId)
  }

  public isSupportToolUse() {
    return true
  }
}
