import { type AnthropicProviderOptions } from '@ai-sdk/anthropic'
import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
  type GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { type ModelMessage, streamText, type ToolSet } from 'ai'
import AbstractAISDKModel, { type CallSettings } from '../../../models/abstract-ai-sdk'
import { addAnthropicCacheControl } from '../../../models/anthropic-cache'
import { ApiError } from '../../../models/errors'
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

/**
 * 从中转站（kai-new-api）返回的文本中提取 data URL 图片。
 * 网关会把 Gemini inlineData 转成：![image](data:image/png;base64,...)
 */
function extractImagesFromRelayText(text: string): string[] {
  if (!text) return []
  const images: string[] = []
  const regex = /data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const mediaType = match[1]
    const base64 = match[2].replace(/\s+/g, '')
    if (base64) {
      images.push(`data:${mediaType};base64,${base64}`)
    }
  }
  return images
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
    throw new Error('Kod AI relay station is not configured. Please log in to enable Kod AI.')
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

  // P0→增强：图像生成改走中转站（对话式生图，Gemini 风格）。
  // 不再用 OpenAI 的 /v1/images/generations 接口（中转站 Gemini 渠道不支持，报 convert_request_failed）。
  // 改为走 /v1/chat/completions。中转站对 Gemini imagine 模型会自动注入 ResponseModalities。
  // 注意：kai-new-api 把 Gemini inlineData 转成 markdown 文本 ![image](data:...;base64,...)，
  // OpenAI 兼容流只会产出 text-delta，不会产出 file chunk，因此必须从文本中解析图片。
  public async paint(
    params: {
      prompt: string
      images?: { imageUrl: string }[]
      num: number
      aspectRatio?: string
    },
    signal?: AbortSignal,
    callback?: (picBase64: string) => void | Promise<void>
  ): Promise<string[]> {
    const relayApiHost = this.options.apiHost?.replace(/\/+$/, '')
    if (!relayApiHost || !this.options.apiKey) {
      throw new Error('Kod AI relay station is not configured. Please log in to enable Kod AI image generation.')
    }

    const provider = createOpenAI({
      apiKey: this.options.apiKey,
      baseURL: relayApiHost,
      fetch: this.chatboxAIFetch.bind(this),
    })
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
      const result = streamText({
        model,
        messages: [{ role: 'user', content: messageContent }],
        abortSignal: signal,
        // Image generation is billable; network-error retries could double-charge.
        maxRetries: 0,
      })

      const textParts: string[] = []
      const seen = new Set<string>()
      const pushImage = async (dataUrl: string) => {
        if (seen.has(dataUrl)) return
        seen.add(dataUrl)
        results.push(dataUrl)
        await callback?.(dataUrl)
      }

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'file' && chunk.file.mediaType?.startsWith('image/') && chunk.file.base64) {
          await pushImage(`data:${chunk.file.mediaType};base64,${chunk.file.base64}`)
        } else if (chunk.type === 'text-delta' && chunk.text) {
          // AI SDK v6: text-delta 字段是 `text`，不是 `textDelta`
          textParts.push(chunk.text)
        } else if (chunk.type === 'error') {
          console.error('[KodAI.paint] stream error:', chunk.error)
          throw chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error))
        }
      }

      // 中转站把图片嵌在文本里：![image](data:image/png;base64,...)
      for (const dataUrl of extractImagesFromRelayText(textParts.join(''))) {
        await pushImage(dataUrl)
      }
    }

    if (results.length === 0) {
      throw new Error(
        'No image returned from relay station. Make sure the selected model supports image generation (e.g. gemini-*-image*).'
      )
    }
    return results
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
