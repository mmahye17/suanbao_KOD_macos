import { z } from 'zod'

export const suanbaoPetStateSchema = z.enum([
  'idle',
  'listening',
  'thinking',
  'executing',
  'success',
  'error',
  'reminding',
  'focus',
  'rest',
  'sleeping',
])
export type SuanbaoPetState = z.infer<typeof suanbaoPetStateSchema>

export const suanbaoAnimationLevelSchema = z.enum(['full', 'reduced', 'off'])
export type SuanbaoAnimationLevel = z.infer<typeof suanbaoAnimationLevelSchema>

export const suanbaoPlacementSchema = z
  .object({
    mode: z.enum(['in-app', 'desktop']),
    displayId: z.string().trim().min(1).max(128).optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    anchor: z.enum(['free', 'bottom-left', 'bottom-right']),
    scaleFactor: z.number().finite().positive().max(8).optional(),
    locked: z.boolean(),
  })
  .strict()
export type SuanbaoPlacement = z.infer<typeof suanbaoPlacementSchema>

export const suanbaoPlatformCapabilitiesSchema = z
  .object({
    overlay: z.enum(['desktop-window', 'in-app']),
    notifications: z.boolean(),
    backgroundScheduling: z.boolean(),
    geolocation: z.boolean(),
    systemCalendarRead: z.boolean(),
    reason: z.string().trim().max(160).optional(),
  })
  .strict()
export type SuanbaoPlatformCapabilities = z.infer<typeof suanbaoPlatformCapabilitiesSchema>

export const suanbaoViewModelSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    petState: suanbaoPetStateSchema,
    bubbleOpen: z.boolean(),
    message: z.string().max(4000).optional(),
    operationId: z.string().uuid().optional(),
    connection: z.enum(['online', 'offline', 'connecting']),
    updatedAt: z.number().int().nonnegative(),
  })
  .strict()
export type SuanbaoViewModel = z.infer<typeof suanbaoViewModelSchema>

export const suanbaoBootstrapSchema = z
  .object({
    enabled: z.boolean(),
    visible: z.boolean(),
    animation: suanbaoAnimationLevelSchema,
    placement: suanbaoPlacementSchema,
    capabilities: suanbaoPlatformCapabilitiesSchema,
    viewModel: suanbaoViewModelSchema,
  })
  .strict()
export type SuanbaoBootstrap = z.infer<typeof suanbaoBootstrapSchema>

export const suanbaoCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open-bubble') }).strict(),
  z.object({ type: z.literal('close-bubble') }).strict(),
  z.object({ type: z.literal('send-message'), input: z.string().trim().min(1).max(2000) }).strict(),
  z
    .object({
      type: z.literal('navigate'),
      route: z.enum(['new-chat', 'recent-chat', 'image-generation', 'task', 'suanbao-settings']),
    })
    .strict(),
])
export type SuanbaoCommand = z.infer<typeof suanbaoCommandSchema>

export const suanbaoOperationIdSchema = z.string().uuid()

export const suanbaoInteractiveRegionSchema = z
  .object({
    interactive: z.boolean(),
  })
  .strict()
export type SuanbaoInteractiveRegion = z.infer<typeof suanbaoInteractiveRegionSchema>

export const suanbaoCommandEnvelopeSchema = z
  .object({
    requestId: z.string().uuid(),
    command: suanbaoCommandSchema,
  })
  .strict()
export type SuanbaoCommandEnvelope = z.infer<typeof suanbaoCommandEnvelopeSchema>

export const suanbaoHostRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('dispatch-command'),
      requestId: z.string().uuid(),
      command: suanbaoCommandSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('confirm-operation'),
      requestId: z.string().uuid(),
      operationId: suanbaoOperationIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('cancel-operation'),
      requestId: z.string().uuid(),
      operationId: suanbaoOperationIdSchema,
    })
    .strict(),
])
export type SuanbaoHostRequest = z.infer<typeof suanbaoHostRequestSchema>

export interface SuanbaoPetWindowApi {
  getBootstrap(): Promise<SuanbaoBootstrap>
  dispatchCommand(command: SuanbaoCommand): Promise<{ accepted: true; requestId: string }>
  confirmOperation(operationId: string): Promise<{ accepted: true }>
  cancelOperation(operationId: string): Promise<{ accepted: true }>
  updatePlacement(placement: SuanbaoPlacement): Promise<SuanbaoPlacement>
  setInteractiveRegion(input: SuanbaoInteractiveRegion): Promise<void>
  hide(): Promise<void>
  openMainWindow(): Promise<void>
  onViewModelChanged(listener: (viewModel: SuanbaoViewModel) => void): () => void
  onNotificationClicked(listener: (entityId: string) => void): () => void
}

export interface SuanbaoHostBridgeApi {
  publishBootstrap(bootstrap: SuanbaoBootstrap): Promise<SuanbaoBootstrap>
  publishViewModel(viewModel: SuanbaoViewModel): Promise<SuanbaoViewModel>
  onCommand(listener: (request: SuanbaoHostRequest) => void): () => void
}
