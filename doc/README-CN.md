<p align="right">
  <a href="../README.md">English</a> |
  <a href="README-CN.md">简体中文</a>
</p>

<h1 align="center">
<img src='./statics/icon.png' width='30'>
<span>
    Kod
</span>
</h1>
<p align="center">
    <em>Kod 是一个 AI 模型桌面客户端，支持 ChatGPT、Claude、Google Gemini、Ollama 等主流模型，适用于 Windows、Mac、Linux</em>
</p>

<p align="center">
<img alt="macOS" src="https://img.shields.io/badge/-macOS-black?style=flat-square&logo=apple&logoColor=white" />
<img alt="Windows" src="https://img.shields.io/badge/-Windows-blue?style=flat-square&logo=windows&logoColor=white" />
<img alt="Linux" src="https://img.shields.io/badge/-Linux-yellow?style=flat-square&logo=linux&logoColor=white" />
<img alt="License" src="https://img.shields.io/badge/License-GPLv3-blue?style=flat-square" />
<img alt="Privacy" src="https://img.shields.io/badge/-Local%20First-green?style=flat-square&logo=shield&logoColor=white" />
</p>

<p align="center">
  <a href="./statics/snapshot_light.png">
    <img src="./statics/snapshot_light.png" width="400"/>
  </a>
  <a href="./statics/snapshot_dark.png">
    <img src="./statics/snapshot_dark.png" width="400"/>
  </a>
</p>

---

**Kod** 是一个开源的桌面端 AI 客户端，以 GPLv3 许可证开源。

Kod 基于 [Chatbox 社区版](https://github.com/chatboxai/chatbox)（GPLv3）构建。感谢上游项目，我们在其基础上继续开发，并保持 Kod 完全开源。

## 从源码构建

Kod 目前尚未提供预编译安装包。如需体验，请按下方[开发指南](#开发)从源码构建，并对目标平台运行 `pnpm run package`。

## 特性

-   **本地数据存储**  
    :floppy_disk: 您的数据保留在您的设备上，确保数据永不丢失并保护您的隐私。

-   **无需部署、直接安装的安装包**  
    :package: 通过可下载的安装包快速开始使用。无需复杂设置！

-   **支持多个 LLM 提供商**  
    :gear: 无缝集成多种 AI 模型：

    -   OpenAI (ChatGPT)
    -   Azure OpenAI
    -   Claude
    -   Google Gemini Pro
    -   Ollama (启用对本地模型的访问，如 llama2、Mistral、Mixtral、codellama、vicuna、yi 和 solar)
    -   ChatGLM-6B

-   **使用 Dall-E-3 生成图像**  
    :art: 使用 Dall-E-3 创建您想象中的图像。

-   **增强提示**  
    :speech_balloon: 高级提示功能，精炼并聚焦您的查询以获得更好的响应。

-   **键盘快捷键**  
    :keyboard: 使用加速您工作流程的快捷键保持高效。

-   **Markdown、Latex 和代码高亮**  
    :scroll: 使用 Markdown 和 Latex 的全部功能生成消息，并结合各种编程语言的语法高亮，提高可读性和呈现效果。

-   **提示库和消息引用**  
    :books: 保存和组织提示以供重复使用，并引用消息以在讨论中提供上下文。

-   **流式回复**  
    :arrow_forward: 通过即时、渐进式回复快速响应您的互动。

-   **人体工程学 UI 和深色主题**  
    :new_moon: 用户友好的界面，带有夜间模式选项，减少长时间使用时的眼睛疲劳。

-   **团队协作**  
    :busts_in_silhouette: 轻松协作并在团队中共享 OpenAI API 资源。[了解更多](../team-sharing/README.md)

-   **跨平台可用性**  
    :computer: Kod 已为 Windows、Mac、Linux 用户准备就绪。

-   **通过 Web 版本随处访问**  
    :globe_with_meridians: 在任何设备上使用带有浏览器的 Web 应用程序，随时随地。

-   **多语言支持**  
    :earth_americas: 通过提供多种语言的支持，迎合全球受众：

    -   English
    -   简体中文 (Simplified Chinese)
    -   繁體中文 (Traditional Chinese)
    -   日本語 (Japanese)
    -   한국어 (Korean)
    -   Français (French)
    -   Deutsch (German)
    -   Русский (Russian)

-   **更多...**  
    :sparkles: 不断增强体验，加入新功能！

## 常见问题解答

-   [常见问题](./FAQ-CN.md)

## 如何贡献

欢迎任何形式的贡献，包括但不限于：

-   提交问题
-   提交合并请求（Merge Request）
-   提交功能请求
-   提交错误报告
-   提交文档修订
-   提交翻译
-   提交任何其他形式的贡献

## 开发

### 环境要求

- **Node.js**（v22.x 或更高版本）
- **pnpm**（v10.x 或更高版本），通过 `corepack enable && corepack prepare pnpm@latest --activate` 安装
- **Git**

### 构建指南

1. 克隆仓库

```bash
git clone https://gitlab.kaiweb.org/kod-projects/kod.git
cd kod
```

2. 安装所需的依赖

```bash
pnpm install
```

3. 启动应用程序（开发模式）

```bash
pnpm run dev
```

4. 构建应用程序，为当前平台打包安装程序

```bash
pnpm run package
```

5. 构建应用程序，为所有平台打包安装程序

```bash
pnpm run package:all
```

## 许可证

Kod 以 [GPLv3](../LICENSE) 许可证开源，与其上游项目 Chatbox 社区版保持一致。
