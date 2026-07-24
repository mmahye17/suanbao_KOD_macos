# kod 客户端 AI 去云化 — P0 改动说明

> 文档版本：v1 ｜ 创建日期：2026-07-24
> 负责人：林润峰（客户端 AI 子系统）
> 任务来源：`07-林润峰-客户端AI.md` 的 P0（Sprint 1）
> 状态：✅ 已完成，`pnpm check` 通过

本文档记录 P0 去云化改造的**实际代码改动**，作为代码评审与提交依据。每处改动给出文件、位置、改前改后对比、目的。

---

## 一、改动总览

| # | 文件 | P0 | 改动性质 |
|---|------|----|----------|
| 1 | `src/renderer/packages/mcp/builtin.ts` | 2 | 数组清空 + 删 unused import |
| 2 | `src/renderer/stores/imageGenerationActions.ts` | 4 | 函数改返回值 + 删 unused import |
| 3 | `src/shared/defaults.ts` | 3 | 默认值改 |
| 4 | `src/shared/types/settings.ts` | 3 | schema 回退值改 |
| 5 | `src/shared/providers/definitions/models/chatboxai.ts` | 1,4 | import 清理 + getProvider 禁用回退 + getChatModel 简化 + paint 抛错 |

统计：5 文件，+90 行 / -105 行（含注释保留的原逻辑）。

---

## 二、逐项改动详情

### 改动 1 · 清空内置 MCP 云服务（P0-2）

**文件**：`src/renderer/packages/mcp/builtin.ts`

**目的**：5 个内置 MCP server（fetch/sequentialthinking/edgeone-pages/arxiv/context7）全部指向 `https://mcp.chatboxai.app/...`，是上游 Chatbox 付费云服务。清空数组后 UI 不再展示这些 server，用户不会误连上游云。

**改前**：
```ts
import i18n from '@/i18n'   // 用于 5 个 server 的 description

export const BUILTIN_MCP_SERVERS: BuildinMCPServerConfig[] = [
  { id: 'fetch', name: 'Fetch', description: i18n.t(...), url: 'https://mcp.chatboxai.app/fetch' },
  { id: 'sequentialthinking', ... url: 'https://mcp.chatboxai.app/sequentialthinking' },
  { id: 'edgeone-pages', ... url: 'https://mcp.chatboxai.app/edgeone-pages' },
  { id: 'arxiv', ... url: 'https://mcp.chatboxai.app/arxiv' },
  { id: 'context7', ... url: 'https://mcp.chatboxai.app/context7' },
]
```

**改后**：
```ts
// 删除 import i18n from '@/i18n'（5 个 server 的 description 不再需要）

// P0 去云化：移除全部指向 mcp.chatboxai.app 的内置 server。
// 原有 5 个（fetch/sequentialthinking/edgeone-pages/arxiv/context7）均为上游 Chatbox 云服务，
// kod 不再依赖。数组保留为空，UI 不渲染任何内置 server；如需恢复或替换为开源/自建 server，在此补充。
export const BUILTIN_MCP_SERVERS: BuildinMCPServerConfig[] = []
```

**保留不动**：文件、`BuildinMCPServerConfig` 接口、`getBuiltinServerConfig` 函数（空数组下 `find` 返回 undefined → 返回 null，4 处引用方 `hooks/mcp.ts`、`mcp_bootstrap.ts`、`MCPMenu.tsx`、`BuiltinServersSection.tsx` 均安全）。

---

### 改动 2 · 禁用图像生成异步云路径（P0-4）

**文件**：`src/renderer/stores/imageGenerationActions.ts`，第 41-43 行

**目的**：原 `shouldUseAsyncPath` 对 Kod AI(ChatboxAI) 返回 true，走 `submitImageGeneration` → `api.chatboxai.app/api/images/async_generations` 异步云任务。改为永返 false，统一走 `generateImagesDirect` → `model.paint()`（其中 ChatboxAI.paint 已被改动 5 堵死）。

**改前**：
```ts
import { ModelProviderEnum } from '@shared/types'   // 唯一用处在此函数

function shouldUseAsyncPath(provider: string): boolean {
  return provider === ModelProviderEnum.ChatboxAI
}
```

**改后**：
```ts
// 删除 import { ModelProviderEnum }（函数不再用，避免 unused）

// P0 去云化：禁用 Kod AI(ChatboxAI) 的异步云图像生成路径。
// 原逻辑对 ChatboxAI 返回 true，走 submitImageGeneration → api.chatboxai.app 异步任务，直连上游云。
// 改为永远 false 后，所有 provider 统一走 generateImagesDirect → model.paint()，
// 其中 ChatboxAI.paint() 已被改为抛错（见 chatboxai.ts），BYOK(OpenAI/Gemini) 不受影响。
function shouldUseAsyncPath(_provider: string): boolean {
  return false
}
```

---

### 改动 3 · 默认搜索引擎改 Tavily（P0-3）

**文件 A**：`src/shared/defaults.ts`，第 128 行

**目的**：新用户的默认搜索引擎从 `build-in`（ChatboxSearch → `webBrowsing` → `api.chatboxai.app/api/tool/web-search`）改为 `tavily`（已完整接入，支持搜索 + parse_link）。

**改前**：`provider: 'build-in',`
**改后**：`provider: 'tavily', // P0 去云化：默认搜索改用 tavily，不再默认走 Chatbox 云`

**文件 B**：`src/shared/types/settings.ts`，第 228 行

**目的**：schema 解析失败时的回退值也改为 tavily，确保异常配置不会回退到 build-in 触发上游云。枚举本身不动（已含 tavily）。

**改前**：`provider: z.enum(['build-in', 'bing', 'tavily', 'bocha', 'querit']).catch('build-in'),`
**改后**：
```ts
// P0 去云化：默认搜索引擎从 build-in(Chatbox 云) 改为 tavily，旧配置解析失败时也回退到 tavily 而非 build-in。
provider: z.enum(['build-in', 'bing', 'tavily', 'bocha', 'querit']).catch('tavily'),
```

**保留不动**：`build-in` case、`ChatboxSearch` 类、UI 的 build-in 选项（作为可手动选的付费项，不删）。

---

### 改动 4 · Kod AI Provider 禁用上游回退 + 图像 paint 抛错（P0-1, P0-4）

**文件**：`src/shared/providers/definitions/models/chatboxai.ts`（本文件含 4 处改动）

#### 4a · 清理 unused import

**改前**：
```ts
import { type AnthropicProviderOptions, createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai'
```
**改后**：
```ts
import { type AnthropicProviderOptions } from '@ai-sdk/anthropic'   // 删 createAnthropic
// 删除整行 import { createOpenAI, type OpenAIProvider }（上游回退分支禁用后 unused）
```
> 保留 `AnthropicProviderOptions`（`getCallSettings` 仍用）、`createGoogleGenerativeAI`/`GoogleGenerativeAIProvider`（`getGoogleProvider` 仍用）、`createOpenAICompatible`（中转站分支用）。

#### 4b · getProvider() 禁用上游回退（P0-1 核心）

**位置**：第 82-128 行（原 4 个上游 gateway 分支）

**目的**：原逻辑在中转站未配置时，按 `apiStyle` 回退到 `getChatboxAPIOrigin()/gateway/...`（`api.chatboxai.app`），静默走上游云。改为抛错，引导用户登录配置中转站。中转站分支（第 70-80 行）保持不动。

**改前**：4 个 `if/else if` 分支（google/anthropic/openai-responses/openai），各自 `createXxx({ baseURL: \`${getChatboxAPIOrigin()}/gateway/...\` })`。

**改后**：
```ts
// P0 去云化：禁用上游 Chatbox 云回退路径。
// 原逻辑在中转站未配置时，按 apiStyle 回退到 getChatboxAPIOrigin()/gateway/...（api.chatboxai.app），
// 会静默走上游云。改为明确抛错，引导用户登录/配置中转站，绝不偷偷连云。
// 原回退分支（google/anthropic/openai-responses/openai）保留为注释，便于回滚或后续彻底删除。
// TODO(P1): 配合许可证体系改造时，决定是否彻底删除这些分支。
void license
void instanceId
throw new Error(
  'Kod AI relay station is not configured. Please log in to enable Kod AI.'
)
// 原上游回退分支（注释保留）：[4 个 if/else if 分支完整保留为注释]
```

#### 4c · getChatModel() 简化（4b 的连带修复）

**位置**：第 174-183 行

**目的**：`getChatModel` 原按 `apiStyle` 把 `getProvider()` 返回值 `as GoogleGenerativeAIProvider`/`OpenAIProvider` 断言。4b 禁用上游回退后，`getProvider` 只返回 `OpenAICompatibleProvider`，类型断言不再兼容（TS2352）。删除两个不可达的 `as` 分支，统一走 `languageModel()`。

**改前**：
```ts
getChatModel(options) {
  const provider = this.getProvider(options)
  if (this.options.model.apiStyle === 'google') {
    return (provider as GoogleGenerativeAIProvider).chat(this.options.model.modelId)
  } else if (this.options.model.apiStyle === 'openai-responses') {
    return (provider as OpenAIProvider).responses(this.options.model.modelId)
  } else {
    return provider.languageModel(this.options.model.modelId)
  }
}
```
**改后**：
```ts
getChatModel(options) {
  const provider = this.getProvider(options)
  // P0 去云化：上游 gateway 回退分支已禁用，中转站统一返回 OpenAICompatibleProvider，
  // 不再按 apiStyle 断言成 Google/OpenAI-Responses 专用类型（那些分支已不可达）。
  return provider.languageModel(this.options.model.modelId)
}
```

#### 4d · paint() 抛错（P0-4 核心）

**位置**：第 172-186 行

**目的**：原 `paint()` 走 `paintWithGemini`/`paintWithChatboxAPI`，均调 `getChatboxAPIOrigin()`（`api.chatboxai.app`）。改为直接抛错，堵死聊天图片会话的云路径。BYOK 的 `OpenAI.paint`/`Gemini.paint` 不走本类，不受影响。

**改前**：
```ts
public async paint(params, signal, callback): Promise<string[]> {
  if (this.options.model.apiStyle === 'google') {
    return this.paintWithGemini(params, signal, callback)
  }
  return this.paintWithChatboxAPI(params, signal, callback)
}
```
**改后**：
```ts
public async paint(_params, _signal, _callback): Promise<string[]> {
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
```
> 参数加 `_` 前缀标记未使用，避免 lint 警告。`paintWithGemini`/`paintWithChatboxAPI`/`callImageGeneration` 私有方法保留未删（代码还在，便于回滚）。

---

## 三、验证结果

| 验证项 | 结果 |
|--------|------|
| `pnpm check`（tsc --noEmit）改前 | ✅ 零错误（基线干净） |
| `pnpm check` 改后 | ✅ 零错误（修复 2 个 TS2352 后通过） |
| `pnpm lint`（biome）改动文件逐个检查 | ✅ 4 文件零问题；chatboxai.ts 剩 5 warnings 均为基线原有 |
| 改动引入的新增 type/lint error | 0 |

**修复过程**：4b 禁用上游回退后，`pnpm check` 报 2 个 TS2352（`chatboxai.ts:177,179`，`getChatModel` 的类型断言失效）。4c 统一走 `languageModel()` 后修复，`pnpm check` 通过。

---

## 四、验收标准对照

| 任务书验收项 | 状态 | 依据 |
|--------------|------|------|
| Kod AI Provider 从中转站获取模型列表并展示 | ✅ 代码层 | 中转站分支未动，`useChatboxAIModels` + `remote.ts` 链路保留（运行时联调待确认） |
| 内置 MCP 列表无 `mcp.chatboxai.app` | ✅ 代码层 | `BUILTIN_MCP_SERVERS = []` |
| 默认搜索引擎非 chatbox-search | ✅ 代码层 | 默认值 `'tavily'`，`.catch('tavily')` |
| 图像生成不走 Chatbox AI 云 | ✅ 代码层 | `shouldUseAsyncPath` 永返 false + `paint()` 抛错 |
| BYOK ≥3 Provider 可对话 | ⏳ 待联调 | 代码层未动 BYOK，需真实 LLM key 运行时确认 |
| `pnpm check` 通过 | ✅ | 零错误 |

---

## 五、运行时验证记录（部分）

- **本地网关连通**：kai-new-api 网关运行在 `localhost:3000`，`/v1/models` 接口用 token 鉴权返回 15 个模型（HTTP 200）。
- **Kod 客户端连网关**：BYOK 方式配置 OpenAI 兼容 provider 指向 `localhost:3000`，鉴权通过（错误从"无效的令牌"变为"无可用渠道"，证明连通）。
- **待完成**：网关配置真实 LLM 渠道后，验证 BYOK 对话 + Kod AI 中转站模型列表展示。

---

## 六、回滚说明

所有改动均**保留原代码为注释**（getProvider 上游回退分支、paint 原逻辑），回滚步骤：
1. `chatboxai.ts`：取消 `getProvider` 抛错、还原 4 个上游分支注释；取消 `paint()` 抛错、还原原分支；还原 `getChatModel` 的 `as` 断言；还原 import。
2. `imageGenerationActions.ts`：还原 `shouldUseAsyncPath` 为 `provider === ModelProviderEnum.ChatboxAI`；还原 import。
3. `builtin.ts`：还原 5 个 server 数组；还原 i18n import。
4. `defaults.ts` + `settings.ts`：`'tavily'` 改回 `'build-in'`。

---

## 七、未在本次改动范围

- P1/P2 任务（Kod AI Hook 验证、知识库远程解析、Provider 顺序、KAI API 工具、模型标签）
- 知识库 rerank / RAG / 文件上传的上游耦合（`model-providers.ts`、`remote-file-parser.ts`，属 P1-6）
- 登录链路打通（`loginWithKod` 是否接通 useLogin）
- UI 文案残留 "Chatbox" 字样（属品牌替换阶段）
- 许可证体系（`licenseKey`/`licenseInstances`/`licenseDetail` 字段保留，留 P1）
