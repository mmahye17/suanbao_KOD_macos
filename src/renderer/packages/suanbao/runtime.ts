import type {
  SuanbaoConfirmation,
  SuanbaoOperation,
  SuanbaoOperationPresentation,
  SuanbaoPomodoroSession,
} from '@shared/types/suanbao'
import { suanbaoStore } from '@/components/suanbao/suanbaoStore'
import { SuanbaoAssistantService, type SuanbaoExecutionResult } from './assistant'
import { closeSuanbaoRepository, getSuanbaoRepository } from './repositories/createSuanbaoRepository'
import type { SuanbaoRepository } from './repositories/SuanbaoRepository'
import { SuanbaoReminderScheduler } from './scheduler'

export interface SuanbaoRuntimeSnapshot {
  accountKey: string
  revision: number
  initialized: boolean
  errorCode?: string
  operation?: SuanbaoOperationPresentation
  activePomodoro?: SuanbaoPomodoroSession
}

type RuntimeListener = (snapshot: SuanbaoRuntimeSnapshot) => void

const confirmationFromOperation = (operation: SuanbaoOperation): SuanbaoConfirmation | null => {
  if (!operation.action || !operation.idempotencyKey) return null
  const action = operation.action
  switch (action.kind) {
    case 'create-todo':
      return {
        id: operation.id,
        operationId: operation.id,
        kind: 'todo',
        title: '创建待办',
        fields: [
          { label: '事项', value: action.title },
          ...(action.dueAt ? [{ label: '截止时间', value: new Date(action.dueAt).toLocaleString() }] : []),
        ],
        idempotencyKey: operation.idempotencyKey,
        action,
      }
    case 'create-reminder':
      return {
        id: operation.id,
        operationId: operation.id,
        kind: 'reminder',
        title: '创建提醒',
        fields: [
          { label: '事项', value: action.title },
          { label: '时间', value: new Date(action.triggerAt).toLocaleString() },
          { label: '时区', value: action.timezone },
        ],
        idempotencyKey: operation.idempotencyKey,
        action,
      }
    case 'start-pomodoro':
      return {
        id: operation.id,
        operationId: operation.id,
        kind: 'pomodoro',
        title: '开始番茄钟',
        fields: [{ label: '时长', value: `${Math.round(action.durationMs / 60_000)} 分钟` }],
        idempotencyKey: operation.idempotencyKey,
        action,
      }
    case 'create-local-calendar-event':
      return {
        id: operation.id,
        operationId: operation.id,
        kind: 'local-calendar-event',
        title: '创建本地日程',
        fields: [
          { label: '日程', value: action.title },
          { label: '开始', value: new Date(action.startsAt).toLocaleString() },
          { label: '结束', value: new Date(action.endsAt).toLocaleString() },
        ],
        idempotencyKey: operation.idempotencyKey,
        action,
      }
  }
}

const presentationFromConfirmation = (confirmation: SuanbaoConfirmation): SuanbaoOperationPresentation => ({
  operationId: confirmation.operationId,
  phase: 'awaiting-confirmation',
  title: confirmation.title,
  fields: confirmation.fields,
})

export class SuanbaoRuntime {
  private service: SuanbaoAssistantService | null = null
  private repository: SuanbaoRepository | null = null
  private accountKey = ''
  private generation = 0
  private revision = 0
  private wakeTimer: ReturnType<typeof setTimeout> | undefined
  private readonly listeners = new Set<RuntimeListener>()
  private snapshot: SuanbaoRuntimeSnapshot = { accountKey: '', revision: 0, initialized: false }

  getSnapshot = () => this.snapshot

  subscribe(listener: RuntimeListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getService(accountKey = this.accountKey || suanbaoStore.getState().accountKey) {
    if (!this.service || !this.snapshot.initialized || accountKey !== this.accountKey) {
      throw new Error('SUANBAO_RUNTIME_NOT_READY')
    }
    return this.service
  }

  async switchAccount(accountKey: string) {
    if (this.accountKey === accountKey && this.snapshot.initialized) return
    const generation = ++this.generation
    const oldAccountKey = this.accountKey
    const oldService = this.service
    const oldRepository = this.repository
    this.clearWakeTimer()
    this.service = null
    this.repository = null
    this.accountKey = accountKey
    this.publish({
      accountKey,
      initialized: false,
      errorCode: undefined,
      operation: undefined,
      activePomodoro: undefined,
    })
    if (oldService && oldAccountKey && oldRepository) {
      await oldService.close()
      await closeSuanbaoRepository(oldAccountKey, oldRepository)
    }
    if (generation !== this.generation) return
    const repository = getSuanbaoRepository(accountKey)
    const scheduler = new SuanbaoReminderScheduler(repository, {
      deliver: (reminder) => {
        if (generation !== this.generation || accountKey !== this.accountKey) return
        this.publish({
          operation: {
            operationId: reminder.id,
            phase: 'succeeded',
            message: `提醒：${reminder.title}`,
          },
        })
      },
    })
    const service = new SuanbaoAssistantService(repository, scheduler)
    this.service = service
    this.repository = repository
    try {
      await service.initialize()
      if (generation !== this.generation) {
        await service.close()
        await closeSuanbaoRepository(accountKey, repository)
        return
      }
      await this.reconcile()
    } catch (reason) {
      if (generation !== this.generation) return
      this.publish({
        initialized: false,
        errorCode: reason instanceof Error ? reason.message : 'SUANBAO_RUNTIME_INITIALIZE_FAILED',
      })
      throw reason
    }
  }

  async reconcile() {
    const service = this.service
    if (!service) return
    const generation = this.generation
    const [operation, activePomodoro] = await Promise.all([
      service.getLatestAwaitingOperation(),
      service.recoverPomodoro(),
    ])
    if (generation !== this.generation || service !== this.service) return
    const confirmation = operation ? confirmationFromOperation(operation) : null
    this.publish({
      initialized: true,
      activePomodoro: activePomodoro ?? undefined,
      errorCode: undefined,
      operation: confirmation ? presentationFromConfirmation(confirmation) : undefined,
    })
    this.scheduleWake(activePomodoro ?? undefined)
  }

  async prepare(confirmation: SuanbaoConfirmation) {
    const service = this.requireService()
    await service.prepareConfirmation(confirmation)
    this.publish({ operation: presentationFromConfirmation(confirmation) })
    return confirmation
  }

  async confirm(operationId: string): Promise<SuanbaoExecutionResult> {
    const service = this.requireService()
    this.publish({ operation: { operationId, phase: 'running' } })
    try {
      const result = await service.confirm(operationId)
      this.publish({ operation: { operationId, phase: 'succeeded', message: result.message } })
      await this.reconcile()
      return result
    } catch (reason) {
      const errorCode = reason instanceof Error ? reason.message : 'SUANBAO_EXECUTION_FAILED'
      this.publish({ operation: { operationId, phase: 'failed', errorCode } })
      throw reason
    }
  }

  async cancel(operationId: string) {
    const operation = await this.requireService().cancelConfirmation(operationId)
    this.publish({ operation: { operationId, phase: 'cancelled' } })
    return operation
  }

  async close() {
    ++this.generation
    this.clearWakeTimer()
    const service = this.service
    const repository = this.repository
    const accountKey = this.accountKey
    this.service = null
    this.repository = null
    this.accountKey = ''
    if (service) await service.close()
    if (accountKey && repository) await closeSuanbaoRepository(accountKey, repository)
    this.publish({
      accountKey: '',
      initialized: false,
      errorCode: undefined,
      operation: undefined,
      activePomodoro: undefined,
    })
  }

  private requireService() {
    if (!this.service) throw new Error('SUANBAO_RUNTIME_NOT_READY')
    return this.service
  }

  private scheduleWake(session?: SuanbaoPomodoroSession) {
    this.clearWakeTimer()
    if (session?.status !== 'running' || !session.endsAt) return
    const delay = Math.min(Math.max(session.endsAt - Date.now(), 0), 2_147_000_000)
    this.wakeTimer = setTimeout(() => {
      void this.reconcile().catch(() => undefined)
    }, delay)
  }

  private clearWakeTimer() {
    if (this.wakeTimer) clearTimeout(this.wakeTimer)
    this.wakeTimer = undefined
  }

  private publish(changes: Partial<Omit<SuanbaoRuntimeSnapshot, 'revision'>>) {
    this.snapshot = {
      ...this.snapshot,
      ...changes,
      accountKey: changes.accountKey ?? this.accountKey,
      revision: ++this.revision,
    }
    for (const listener of this.listeners) listener(this.snapshot)
  }
}

export const suanbaoRuntime = new SuanbaoRuntime()

export function getSuanbaoAssistantService(accountKey = suanbaoStore.getState().accountKey) {
  return suanbaoRuntime.getService(accountKey)
}

export function prepareSuanbaoConfirmation(confirmation: SuanbaoConfirmation) {
  return suanbaoRuntime.prepare(confirmation)
}

export function getPreparedSuanbaoConfirmation(operationId: string) {
  const operation = suanbaoRuntime.getSnapshot().operation
  if (operation?.operationId !== operationId || operation.phase !== 'awaiting-confirmation') return null
  return operation
}
