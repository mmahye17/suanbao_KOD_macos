import 'fake-indexeddb/auto'
import type { SuanbaoOperation, SuanbaoTodoItem } from '@shared/types/suanbao'
import { afterEach, describe, expect, it } from 'vitest'
import { IndexedDBSuanbaoRepository } from './IndexedDBSuanbaoRepository'
import { MemorySuanbaoRepository } from './MemorySuanbaoRepository'
import type { SuanbaoRepository } from './SuanbaoRepository'

const operation = (id: string, key: string): SuanbaoOperation => ({
  id,
  command: { type: 'confirm', operationId: id },
  action: { kind: 'create-todo', title: '测试' },
  idempotencyKey: key,
  status: 'running',
  createdAt: 1,
  updatedAt: 1,
})

const todo = (id: string): SuanbaoTodoItem => ({
  id,
  title: '测试',
  completed: false,
  createdAt: 1,
  updatedAt: 1,
})

function repositoryContract(name: string, create: () => SuanbaoRepository) {
  describe(name, () => {
    let repository: SuanbaoRepository | null = null

    afterEach(async () => {
      await repository?.deleteDatabase()
      repository = null
    })

    it('provides CRUD and range queries', async () => {
      repository = create()
      await repository.initialize()
      await repository.saveTodo(todo('todo_1'))
      expect(await repository.getTodo('todo_1')).toMatchObject({ title: '测试' })
      await repository.saveReminder({
        id: 'reminder_1',
        title: '提醒',
        triggerAt: 100,
        timezone: 'UTC',
        status: 'scheduled',
        createdAt: 1,
        updatedAt: 1,
        revision: 1,
      })
      expect(await repository.listScheduledReminders(99)).toEqual([])
      expect(await repository.listScheduledReminders(100)).toHaveLength(1)
      await repository.saveCalendarEvent({
        id: 'event_1',
        title: '日程',
        startsAt: 100,
        endsAt: 200,
        timezone: 'UTC',
        createdAt: 1,
        updatedAt: 1,
      })
      expect(await repository.listCalendarEvents({ from: 150, to: 250 })).toHaveLength(1)
      await repository.deleteTodo('todo_1')
      expect(await repository.getTodo('todo_1')).toBeNull()
    })

    it('atomically records an entity result and replays the same operation', async () => {
      repository = create()
      await repository.initialize()
      await repository.saveOperation(operation('operation_1', 'key_1'))
      const first = await repository.executeOperation(operation('operation_1', 'key_1'), todo('todo_1'))
      const second = await repository.executeOperation(operation('operation_1', 'key_1'), todo('todo_2'))
      expect(second.resultEntityId).toBe(first.resultEntityId)
      expect(await repository.listTodos()).toHaveLength(1)
    })
  })
}

repositoryContract('MemorySuanbaoRepository', () => new MemorySuanbaoRepository())
repositoryContract(
  'IndexedDBSuanbaoRepository',
  () => new IndexedDBSuanbaoRepository(`test_${crypto.randomUUID().replaceAll('-', '_')}`)
)

// 第 5 周验证（arch §10.4）：不同 accountKey → 不同 IndexedDB 库，数据互不可见。
describe('IndexedDBSuanbaoRepository account isolation', () => {
  it('different accountKey → different DB (data not shared)', async () => {
    const keyA = `iso_a_${crypto.randomUUID().replaceAll('-', '_')}`
    const keyB = `iso_b_${crypto.randomUUID().replaceAll('-', '_')}`
    const repoA = new IndexedDBSuanbaoRepository(keyA)
    const repoB = new IndexedDBSuanbaoRepository(keyB)
    await repoA.initialize()
    await repoB.initialize()

    await repoA.saveTodo(todo('a_todo'))
    // A 看得到，B 看不到
    expect(await repoA.listTodos()).toHaveLength(1)
    expect(await repoB.listTodos()).toHaveLength(0)

    await repoB.saveTodo(todo('b_todo'))
    // 各自独立
    expect((await repoA.listTodos()).map((t) => t.id)).toEqual(['a_todo'])
    expect((await repoB.listTodos()).map((t) => t.id)).toEqual(['b_todo'])

    await repoA.deleteDatabase()
    await repoB.deleteDatabase()
  })
})
