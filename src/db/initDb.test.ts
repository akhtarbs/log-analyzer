import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_RULES, BUILTIN_TAGS, db, initDb } from './database'

describe('initDb', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('seeds built-in tags and rules exactly once when called twice concurrently', async () => {
    // React Strict Mode mounts effects twice in development, so two boot
    // sequences can overlap before either has written anything.
    await Promise.all([initDb(), initDb()])

    expect(await db.tags.count()).toBe(BUILTIN_TAGS.length)
    expect(await db.detectionRules.count()).toBe(BUILTIN_RULES.length)
  })

  it('does not seed again on a later launch', async () => {
    await initDb()
    await initDb()

    expect(await db.tags.count()).toBe(BUILTIN_TAGS.length)
    expect(await db.detectionRules.count()).toBe(BUILTIN_RULES.length)
  })
})
