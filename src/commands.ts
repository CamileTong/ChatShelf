import type { Channel, MessageSide } from './db'

export interface ParsedMessage {
  content: string
  side: MessageSide
}

export interface ConsoleParseResult extends ParsedMessage {
  channelIds: string[]
  aliases: string[]
  error?: string
}

export function parseChatInput(raw: string): ParsedMessage {
  const trimmed = raw.trim()
  const match = trimmed.match(/^\/c(?:\s+|$)([\s\S]*)$/i)
  if (match) return { content: match[1].trim(), side: 'other' }
  return { content: trimmed, side: 'self' }
}

export function parseConsoleInput(raw: string, channels: Channel[]): ConsoleParseResult {
  const trimmed = raw.trim()
  const tokens = trimmed.split(/\s+/)
  const commandTokens: string[] = []

  while (tokens[commandTokens.length]?.startsWith('/')) {
    commandTokens.push(tokens[commandTokens.length])
  }

  const body = tokens.slice(commandTokens.length).join(' ').trim()
  const side: MessageSide = commandTokens.some((token) => token.toLowerCase() === '/c')
    ? 'other'
    : 'self'
  const aliases = commandTokens
    .filter((token) => token.toLowerCase() !== '/c')
    .map((token) => token.slice(1).toLowerCase())
  const uniqueAliases = [...new Set(aliases)]
  const channelByAlias = new Map(channels.map((channel) => [channel.alias.toLowerCase(), channel]))
  const unknown = uniqueAliases.filter((alias) => !channelByAlias.has(alias))

  if (!aliases.length) {
    return { channelIds: [], aliases: [], content: body, side, error: 'Add at least one channel, like /fitness.' }
  }
  if (unknown.length) {
    return {
      channelIds: [],
      aliases: uniqueAliases,
      content: body,
      side,
      error: `Unknown channel: ${unknown.map((alias) => `/${alias}`).join(', ')}`,
    }
  }
  if (!body) {
    return { channelIds: [], aliases: uniqueAliases, content: '', side, error: 'Write a message after the channel commands.' }
  }

  return {
    channelIds: uniqueAliases.map((alias) => channelByAlias.get(alias)!.id),
    aliases: uniqueAliases,
    content: body,
    side,
  }
}
