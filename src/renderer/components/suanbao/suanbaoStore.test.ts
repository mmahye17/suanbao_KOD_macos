// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getSuanbaoAccountKey, sanitizeSuanbaoPreferences, suanbaoStore } from './suanbaoStore'

describe('Suanbao preference store', () => {
  beforeEach(() => {
    localStorage.clear()
    suanbaoStore.getState().switchAccount(null)
    suanbaoStore.getState().restore()
  })

  it('defaults to enabled with full animation', () => {
    expect(sanitizeSuanbaoPreferences()).toEqual({
      enabled: true,
      hidden: false,
      position: { x: 0.9, y: 0.78 },
      animation: 'full',
    })
  })

  it('persists independently for each account key', () => {
    suanbaoStore.getState().switchAccount('first@example.com')
    suanbaoStore.getState().setPreferences({ hidden: true, animation: 'off' })
    suanbaoStore.getState().switchAccount('second@example.com')
    expect(suanbaoStore.getState().hidden).toBe(false)
    suanbaoStore.getState().switchAccount('first@example.com')
    expect(suanbaoStore.getState().hidden).toBe(true)
    expect(getSuanbaoAccountKey('first@example.com')).not.toBe(getSuanbaoAccountKey('second@example.com'))
  })

  it('restores visibility, position, and animation defaults', () => {
    suanbaoStore.getState().setPreferences({
      enabled: false,
      hidden: true,
      position: { x: 0, y: 0 },
      animation: 'off',
    })
    suanbaoStore.getState().restore()
    expect(suanbaoStore.getState()).toMatchObject({
      enabled: true,
      hidden: false,
      position: { x: 0.9, y: 0.78 },
      animation: 'full',
    })
  })
})
