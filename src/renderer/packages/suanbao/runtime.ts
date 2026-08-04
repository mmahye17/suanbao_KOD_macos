import type { SuanbaoConfirmation } from '@shared/types/suanbao'
import { suanbaoStore } from '@/components/suanbao/suanbaoStore'
import { SuanbaoAssistantService } from './assistant'
import { getSuanbaoRepository } from './repositories/createSuanbaoRepository'
import { SuanbaoReminderScheduler } from './scheduler'

const services = new Map<string, SuanbaoAssistantService>()
const confirmations = new Map<string, SuanbaoConfirmation>()

export function getSuanbaoAssistantService(accountKey = suanbaoStore.getState().accountKey) {
  let service = services.get(accountKey)
  if (!service) {
    const repository = getSuanbaoRepository(accountKey)
    service = new SuanbaoAssistantService(repository, new SuanbaoReminderScheduler(repository))
    services.set(accountKey, service)
  }
  return service
}

export async function prepareSuanbaoConfirmation(confirmation: SuanbaoConfirmation) {
  confirmations.set(confirmation.operationId, confirmation)
  await getSuanbaoAssistantService().prepareConfirmation(confirmation)
  return confirmation
}

export function getPreparedSuanbaoConfirmation(operationId: string) {
  return confirmations.get(operationId) ?? null
}
