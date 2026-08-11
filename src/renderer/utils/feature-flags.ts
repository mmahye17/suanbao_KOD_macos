import platform from '@/platform'
import { CHATBOX_BUILD_TARGET } from '@/variables'

const isDesktop = platform.type === 'desktop'
const isMAS = CHATBOX_BUILD_TARGET === 'mas'

export const featureFlags = {
  mcp: isDesktop && !isMAS,
  knowledgeBase: isDesktop,
  skills: false,
  taskMode: false,
  autoUpdate: isDesktop && !isMAS,
  sandbox: isDesktop && !isMAS,
}
