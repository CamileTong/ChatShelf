import { describe, expect, it } from 'vitest'
import { parseChatInput, parseConsoleInput } from './commands'
import type { Channel } from './db'

const channel = (id: string, alias: string): Channel => ({
  id,
  alias,
  name: alias,
  selfProfile: { name: 'Me' },
  otherProfile: { name: 'Other' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('message commands', () => {
  it('uses /c only at the start of a chat message', () => {
    expect(parseChatInput('/c weekly summary')).toEqual({ content: 'weekly summary', side: 'other' })
    expect(parseChatInput('keep /c literal')).toEqual({ content: 'keep /c literal', side: 'self' })
  })

  it('parses multiple console destinations and /c', () => {
    const result = parseConsoleInput('/fitness /boxing /c Great week', [
      channel('1', 'fitness'),
      channel('2', 'boxing'),
    ])
    expect(result).toMatchObject({
      channelIds: ['1', '2'],
      content: 'Great week',
      side: 'other',
    })
    expect(result.error).toBeUndefined()
  })

  it('deduplicates destinations and rejects unknown channels', () => {
    expect(parseConsoleInput('/fitness /fitness hello', [channel('1', 'fitness')]).channelIds).toEqual(['1'])
    expect(parseConsoleInput('/missing hello', [])).toMatchObject({ error: 'Unknown channel: /missing' })
  })

  it('requires a target and message body', () => {
    expect(parseConsoleInput('hello', [])).toMatchObject({ error: 'Add at least one channel, like /fitness.' })
    expect(parseConsoleInput('/fitness', [channel('1', 'fitness')])).toMatchObject({
      error: 'Write a message after the channel commands.',
    })
  })
})
