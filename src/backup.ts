import { db, type Channel, type Message, type Preference } from './db'

export interface BackupFile {
  schemaVersion: 1
  exportedAt: string
  scope: {
    type: 'all' | 'channel'
    channelId?: string
    fromMonth?: string
    toMonth?: string
  }
  channels: Channel[]
  messages: Message[]
  preferences: Preference[]
}

export interface ExportOptions {
  channelId?: string
  fromMonth?: string
  toMonth?: string
}

export interface ReadableExport {
  format: 'chatshelf-readable'
  version: 1
  exportedAt: string
  range: {
    type: 'all' | 'channel'
    channel?: string
    fromMonth?: string
    toMonth?: string
  }
  chats: Array<{
    name: string
    alias: string
    participants: {
      self: string
      other: string
    }
    messages: Array<{
      timestamp: string
      editedAt?: string
      speaker: 'self' | 'other'
      speakerName: string
      content: string
    }>
  }>
}

const localMonthStart = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number)
  return new Date(year, monthIndex - 1, 1).getTime()
}

const localMonthEnd = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number)
  return new Date(year, monthIndex, 1).getTime()
}

export async function createBackup(options: ExportOptions = {}): Promise<BackupFile> {
  const channels = options.channelId
    ? (await db.channels.get(options.channelId) ? [await db.channels.get(options.channelId)] : []).filter(Boolean) as Channel[]
    : await db.channels.toArray()
  const channelIds = new Set(channels.map((channel) => channel.id))
  let messages = (await db.messages.toArray()).filter((message) => channelIds.has(message.channelId))

  if (options.fromMonth) {
    const from = localMonthStart(options.fromMonth)
    messages = messages.filter((message) => new Date(message.createdAt).getTime() >= from)
  }
  if (options.toMonth) {
    const to = localMonthEnd(options.toMonth)
    messages = messages.filter((message) => new Date(message.createdAt).getTime() < to)
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: {
      type: options.channelId ? 'channel' : 'all',
      channelId: options.channelId,
      fromMonth: options.fromMonth,
      toMonth: options.toMonth,
    },
    channels,
    messages: messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    preferences: await db.preferences.toArray(),
  }
}

export async function shareBackup(backup: BackupFile) {
  const date = backup.exportedAt.slice(0, 10)
  const suffix = backup.scope.type === 'all'
    ? 'all'
    : `${backup.channels[0]?.alias ?? 'channel'}${backup.scope.fromMonth ? `-${backup.scope.fromMonth}` : ''}${backup.scope.toMonth ? `-${backup.scope.toMonth}` : ''}`
  const filename = `chatshelf-${suffix}-${date}.json`
  const text = JSON.stringify(backup, null, 2)
  const file = new File([text], filename, { type: 'application/json' })

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'ChatShelf backup' })
    return
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function createReadableExport(
  options: ExportOptions = {},
): Promise<ReadableExport> {
  const backup = await createBackup(options)
  const messagesByChannel = new Map<string, Message[]>()
  for (const message of backup.messages) {
    const messages = messagesByChannel.get(message.channelId) ?? []
    messages.push(message)
    messagesByChannel.set(message.channelId, messages)
  }

  return {
    format: 'chatshelf-readable',
    version: 1,
    exportedAt: backup.exportedAt,
    range: {
      type: backup.scope.type,
      channel: backup.scope.type === 'channel' ? backup.channels[0]?.name : undefined,
      fromMonth: backup.scope.fromMonth,
      toMonth: backup.scope.toMonth,
    },
    chats: [...backup.channels]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((channel) => ({
        name: channel.name,
        alias: channel.alias,
        participants: {
          self: channel.selfProfile.name,
          other: channel.otherProfile.name,
        },
        messages: (messagesByChannel.get(channel.id) ?? []).map((message) => ({
          timestamp: message.createdAt,
          editedAt: message.updatedAt,
          speaker: message.side,
          speakerName: message.side === 'self'
            ? channel.selfProfile.name
            : channel.otherProfile.name,
          content: message.content,
        })),
      })),
  }
}

export async function shareReadableExport(report: ReadableExport) {
  const date = report.exportedAt.slice(0, 10)
  const channel = report.range.channel
    ?.toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-|-$/g, '')
  const suffix = report.range.type === 'all' ? 'all' : channel || 'channel'
  const filename = `chatshelf-readable-${suffix}-${date}.json`
  const file = new File([JSON.stringify(report, null, 2)], filename, {
    type: 'application/json;charset=utf-8',
  })

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'ChatShelf readable export' })
    return
  }

  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function validateBackup(value: unknown): BackupFile {
  if (!value || typeof value !== 'object') throw new Error('This is not a ChatShelf backup.')
  const candidate = value as Partial<BackupFile>
  if (candidate.schemaVersion !== 1) throw new Error('This backup version is not supported.')
  if (!Array.isArray(candidate.channels) || !Array.isArray(candidate.messages)) {
    throw new Error('The backup is missing channels or messages.')
  }
  const validChannels = candidate.channels.every((channel) =>
    channel && typeof channel.id === 'string' && typeof channel.alias === 'string' &&
    typeof channel.name === 'string' && channel.selfProfile && channel.otherProfile)
  const validMessages = candidate.messages.every((message) =>
    message && typeof message.id === 'string' && typeof message.channelId === 'string' &&
    typeof message.content === 'string' && ['self', 'other'].includes(message.side))
  if (!validChannels || !validMessages) throw new Error('The backup contains invalid data.')
  const ids = new Set(candidate.channels.map((channel) => channel.id))
  if (candidate.messages.some((message) => !ids.has(message.channelId))) {
    throw new Error('Some messages reference a missing channel.')
  }
  return {
    ...candidate,
    exportedAt: candidate.exportedAt ?? new Date().toISOString(),
    scope: candidate.scope ?? { type: 'all' },
    preferences: Array.isArray(candidate.preferences) ? candidate.preferences : [],
  } as BackupFile
}

export async function importBackup(backup: BackupFile, mode: 'merge' | 'replace') {
  await db.transaction('rw', db.channels, db.messages, db.preferences, async () => {
    if (mode === 'replace') {
      await Promise.all([db.channels.clear(), db.messages.clear(), db.preferences.clear()])
    }
    await db.channels.bulkPut(backup.channels)
    await db.messages.bulkPut(backup.messages)
    await db.preferences.bulkPut(backup.preferences)
  })
}

export async function readBackupFile(file: File) {
  return validateBackup(JSON.parse(await file.text()))
}
