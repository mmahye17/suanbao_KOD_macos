import type {
  SuanbaoBootstrap,
  SuanbaoHostRequest,
  SuanbaoPlatformCapabilities,
  SuanbaoViewModel,
} from '@shared/types/suanbao'
import { useLocation } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useState } from 'react'
import platform from '@/platform'
import { router } from '@/router'
import { currentSessionIdAtom } from '@/stores/atoms/sessionAtoms'
import { useSession } from '@/stores/chatStore'
import { useCurrentTaskId, useTaskSessionRecord } from '@/stores/taskSessionStore'
import { SuanbaoDesktopBridgeHost } from './SuanbaoDesktopBridgeHost'
import {
  cancelSuanbaoAction,
  continueRecentChat,
  openSuanbaoSettings,
  startNewChat,
  startSuanbaoMessage,
} from './suanbaoActions'
import { mapMessagesToSuanbaoState } from './suanbaoState'
import { useSuanbaoStore } from './suanbaoStore'

const IN_APP_CAPABILITIES: SuanbaoPlatformCapabilities = {
  overlay: 'in-app',
  notifications: false,
  backgroundScheduling: false,
  geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator,
  systemCalendarRead: false,
}

const STATUS_COPY: Record<SuanbaoViewModel['petState'], string> = {
  idle: 'Suanbao is ready',
  listening: 'Listening',
  thinking: 'Suanbao is thinking',
  executing: 'Suanbao is using a tool',
  success: 'Task completed',
  error: 'Something went wrong',
  reminding: 'You have a reminder',
  focus: 'Focus mode',
  rest: 'Time for a break',
  sleeping: 'Suanbao is resting',
}

/** Keeps the isolated Electron window synchronized with the main renderer business state. */
export function SuanbaoRuntimeHost() {
  const location = useLocation()
  const enabled = useSuanbaoStore((state) => state.enabled)
  const hidden = useSuanbaoStore((state) => state.hidden)
  const animation = useSuanbaoStore((state) => state.animation)
  const persistedSessionId = useAtomValue(currentSessionIdAtom)
  const routeSessionId = location.pathname.startsWith('/session/') ? location.pathname.slice('/session/'.length) : null
  const chatSessionId = routeSessionId || persistedSessionId
  const currentTaskId = useCurrentTaskId()
  const routeTaskId = location.pathname.startsWith('/task/') ? location.pathname.slice('/task/'.length) : null
  const taskId = routeTaskId || currentTaskId
  const { session } = useSession(chatSessionId)
  const { data: taskSession } = useTaskSessionRecord(taskId)
  const messages = location.pathname.startsWith('/task') ? taskSession?.messages : session?.messages
  const petState = mapMessagesToSuanbaoState(messages)
  const [bubbleOpen, setBubbleOpen] = useState(false)
  const [capabilities, setCapabilities] = useState<SuanbaoPlatformCapabilities>(IN_APP_CAPABILITIES)

  useEffect(() => {
    let active = true
    void platform
      .getSuanbaoController()
      .getCapabilities()
      .then((next) => {
        if (active) setCapabilities(next)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const controller = platform.getSuanbaoController()
    void controller
      .setEnabled(enabled)
      .then(() => {
        if (!enabled || hidden) return controller.hide()
        return controller.show()
      })
      .catch(() => undefined)
  }, [enabled, hidden])

  const viewModel = useMemo<SuanbaoViewModel>(() => {
    const updatedAt = Date.now()
    return {
      revision: updatedAt,
      petState,
      bubbleOpen,
      message: STATUS_COPY[petState],
      connection: 'online',
      updatedAt,
    }
  }, [bubbleOpen, petState])

  const bootstrap = useMemo<SuanbaoBootstrap>(
    () => ({
      enabled,
      visible: enabled && !hidden,
      animation,
      placement: {
        mode: capabilities.overlay === 'desktop-window' ? 'desktop' : 'in-app',
        x: 0,
        y: 0,
        anchor: 'bottom-right',
        locked: false,
      },
      capabilities,
      viewModel,
    }),
    [animation, capabilities, enabled, hidden, viewModel]
  )

  const onCommand = useCallback(
    (request: SuanbaoHostRequest) => {
      if (request.kind === 'confirm-operation') return
      if (request.kind === 'cancel-operation') {
        void cancelSuanbaoAction({ pathname: location.pathname, chatSessionId })
        return
      }

      const command = request.command
      if (command.type === 'open-bubble') {
        setBubbleOpen(true)
        return
      }
      if (command.type === 'close-bubble') {
        setBubbleOpen(false)
        return
      }
      if (command.type === 'send-message') {
        void startSuanbaoMessage(command.input)
        return
      }
      if (command.route === 'new-chat') {
        void startNewChat()
      } else if (command.route === 'recent-chat') {
        void continueRecentChat()
      } else if (command.route === 'suanbao-settings') {
        openSuanbaoSettings()
      } else if (command.route === 'image-generation') {
        void router.navigate({ to: '/image-creator' })
      } else if (command.route === 'task') {
        void router.navigate({ to: '/task' })
      }
    },
    [chatSessionId, location.pathname]
  )

  return (
    <SuanbaoDesktopBridgeHost
      bootstrap={bootstrap}
      viewModel={viewModel}
      onCommand={onCommand}
      onIntegrationError={() => undefined}
    />
  )
}
