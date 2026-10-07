import { isCiEnvironment } from '#helpers/ci'
import { describe, expect, it } from 'vitest'

describe('isCiEnvironment', () => {
  it('is false when CI is not set', () => {
    expect(isCiEnvironment({})).toBe(false)
  })

  it.each(['', '0', 'false', 'FALSE', ' false '])('is false when CI is %j', (value) => {
    expect(isCiEnvironment({ CI: value })).toBe(false)
  })

  it.each(['true', '1', 'TRUE', 'woodpecker'])('is true when CI is %j', (value) => {
    expect(isCiEnvironment({ CI: value })).toBe(true)
  })
})
