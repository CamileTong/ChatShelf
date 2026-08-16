import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createBackup, importBackup, validateBackup } from './backup'
import { createChannel, createMessage, db, dispatchMessages, editMessage } from './db'

afterEach(async () => {
  await Promise.all([db.channels.clear(), db.messages.clear(), db.preferences.clear()])
})

describe('storage and backups', () => {
  it('keeps the original timestamp when editing', async () => {
    const channel = await createChannel({
      name: 'Fitness',
      alias: 'fitness',
      selfProfile: { name: 'Me' },
      otherProfile: { name: 'Coach' },
    })
    const message = await createMessage(channel.id, 'first', 'self')
    await editMessage(message.id, 'changed')
    const saved = await db.messages.get(message.id)

    expect(saved?.content).toBe('changed')
    expect(saved?.createdAt).toBe(message.createdAt)
    expect(saved?.updatedAt).toBeTruthy()
  })

  it('atomically fans out a Console message under one dispatch group', async () => {
    const first = await createChannel({
      name: 'Fitness', alias: 'fitness',
      selfProfile: { name: 'Me' }, otherProfile: { name: 'Coach' },
    })
    const second = await createChannel({
      name: 'Boxing', alias: 'boxing',
      selfProfile: { name: 'Me' }, otherProfile: { name: 'Trainer' },
    })
    const messages = await dispatchMessages([first.id, second.id], 'Shared note', 'other')

    expect(messages).toHaveLength(2)
    expect(new Set(messages.map((message) => message.dispatchGroupId)).size).toBe(1)
    expect(await db.messages.count()).toBe(2)
    expect(messages.every((message) => message.side === 'other')).toBe(true)
  })

  it('filters a channel export by inclusive local month range', async () => {
    const channel = await createChannel({
      name: 'Reading',
      alias: 'reading',
      selfProfile: { name: 'Me' },
      otherProfile: { name: 'Library' },
    })
    await db.messages.bulkAdd([
      { id: 'jan', channelId: channel.id, content: 'January', side: 'self', createdAt: new Date(2026, 0, 31, 23).toISOString() },
      { id: 'feb', channelId: channel.id, content: 'February', side: 'self', createdAt: new Date(2026, 1, 1, 0).toISOString() },
      { id: 'mar', channelId: channel.id, content: 'March', side: 'self', createdAt: new Date(2026, 2, 1, 0).toISOString() },
    ])

    const backup = await createBackup({ channelId: channel.id, fromMonth: '2026-02', toMonth: '2026-02' })
    expect(backup.messages.map((message) => message.id)).toEqual(['feb'])
  })

  it('validates and restores a portable backup', async () => {
    const backup = validateBackup({
      schemaVersion: 1,
      exportedAt: '2026-08-16T00:00:00.000Z',
      scope: { type: 'all' },
      preferences: [],
      channels: [{
        id: 'channel-1', name: 'Ideas', alias: 'ideas',
        selfProfile: { name: 'Me' }, otherProfile: { name: 'Muse' },
        createdAt: '2026-08-16T00:00:00.000Z', updatedAt: '2026-08-16T00:00:00.000Z',
      }],
      messages: [{
        id: 'message-1', channelId: 'channel-1', content: 'A thought',
        side: 'other', createdAt: '2026-08-16T00:00:00.000Z',
      }],
    })
    await importBackup(backup, 'replace')
    expect(await db.channels.count()).toBe(1)
    expect((await db.messages.get('message-1'))?.side).toBe('other')
  })

  it('rejects orphaned messages before touching storage', () => {
    expect(() => validateBackup({
      schemaVersion: 1,
      scope: { type: 'all' },
      channels: [],
      messages: [{ id: 'm', channelId: 'missing', content: 'No', side: 'self' }],
    })).toThrow('missing channel')
  })
})
