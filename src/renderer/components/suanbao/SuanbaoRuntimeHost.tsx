import type {
  SuanbaoBootstrap,
  SuanbaoHostRequest,
  SuanbaoPlatformCapabilities,
  SuanbaoViewModel,
} from '@shared/types/suanbao'
import { useLocation } from '@tanstack/react-router'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { suanbaoRuntime } from '@/packages/suanbao/runtime'
import platform from '@/platform'
import { router } from '@/router'
import { currentSessionIdAtom } from '@/stores/atoms/sessionAtoms'
import { useSession } from '@/stores/chatStore'
import { useCurrentTaskId, useTaskSessionRecord } from '@/stores/taskSessionStore'
import { SuanbaoDesktopBridgeHost } from './SuanbaoDesktopBridgeHost'
import { continueRecentChat, openSuanbaoSettings, startNewChat, startSuanbaoMessage } from './suanbaoActions'
import { mapMessagesToSuanbaoState } from './suanbaoState'
import { useSuanbaoStore } from './suanbaoStore'

const IN_APP_CAPABILITIES: SuanbaoPlatformCapabilities = {
  overlay: 'in-app',
  notifications: false,
  backgroundScheduling: 'foreground-only',
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
  const accountKey = useSuanbaoStore((state) => state.accountKey)
  const runtimeSnapshot = useSyncExternalStore(
    suanbaoRuntime.subscribe.bind(suanbaoRuntime),
    suanbaoRuntime.getSnapshot
  )
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
    void suanbaoRuntime.switchAccount(accountKey)
    const reconcile = () => void suanbaoRuntime.reconcile()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconcile()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    const cancelFocus = platform.onWindowFocused(reconcile)
    const cancelShow = platform.onWindowShow(reconcile)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      cancelFocus()
      cancelShow()
    }
  }, [accountKey])

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
      message: runtimeSnapshot.operation?.message || STATUS_COPY[petState],
      operationId: runtimeSnapshot.operation?.operationId,
      operation: runtimeSnapshot.operation,
      connection: runtimeSnapshot.initialized ? 'online' : 'connecting',
      updatedAt,
    }
  }, [bubbleOpen, petState, runtimeSnapshot])

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

  const onCommand = useCallback((request: SuanbaoHostRequest) => {
    if (request.kind === 'confirm-operation') {
      void suanbaoRuntime.confirm(request.operationId)
      return
    }
    if (request.kind === 'cancel-operation') {
      void suanbaoRuntime.cancel(request.operationId)
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
    } else if (command.route === 'image-creator') {
      void router.navigate({ to: '/image-creator' })
    } else if (command.route === 'task-home') {
      void router.navigate({ to: '/task' })
    }
  }, [])

  return (
    <SuanbaoDesktopBridgeHost
      bootstrap={bootstrap}
      viewModel={viewModel}
      onCommand={onCommand}
      onIntegrationError={() => undefined}
    />
  )
}
