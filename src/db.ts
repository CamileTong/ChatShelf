import Dexie, { type EntityTable } from 'dexie'

export type MessageSide = 'self' | 'other'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Profile {
  name: string
  avatar?: string
}

export interface Channel {
  id: string
  name: string
  alias: string
  selfProfile: Profile
  otherProfile: Profile
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  channelId: string
  content: string
  side: MessageSide
  createdAt: string
  updatedAt?: string
  dispatchGroupId?: string
}

export interface Preference {
  key: string
  value: unknown
}

class ChatShelfDatabase extends Dexie {
  channels!: EntityTable<Channel, 'id'>
  messages!: EntityTable<Message, 'id'>
  preferences!: EntityTable<Preference, 'key'>

  constructor() {
    super('chatshelf')
    this.version(1).stores({
      channels: 'id, &alias, updatedAt',
      messages: 'id, channelId, createdAt, [channelId+createdAt], dispatchGroupId',
      preferences: 'key',
    })
  }
}

export const db = new ChatShelfDatabase()

const now = () => new Date().toISOString()
const makeId = () => crypto.randomUUID()

export const normalizeAlias = (value: string) =>
  value.trim().toLowerCase().replace(/^\/+/, '').replace(/\s+/g, '-')

export async function createChannel(
  input: Pick<Channel, 'name' | 'alias' | 'selfProfile' | 'otherProfile'>,
) {
  const timestamp = now()
  const channel: Channel = {
    ...input,
    id: makeId(),
    alias: normalizeAlias(input.alias),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await db.channels.add(channel)
  return channel
}

export async function updateChannel(
  id: string,
  patch: Pick<Channel, 'name' | 'alias' | 'selfProfile' | 'otherProfile'>,
) {
  await db.channels.update(id, {
    ...patch,
    alias: normalizeAlias(patch.alias),
    updatedAt: now(),
  })
}

export async function deleteChannel(id: string) {
  await db.transaction('rw', db.channels, db.messages, async () => {
    await db.messages.where('channelId').equals(id).delete()
    await db.channels.delete(id)
  })
}

export async function createMessage(
  channelId: string,
  content: string,
  side: MessageSide,
  dispatchGroupId?: string,
) {
  const message: Message = {
    id: makeId(),
    channelId,
    content: content.trim(),
    side,
    createdAt: now(),
    dispatchGroupId,
  }
  await db.transaction('rw', db.channels, db.messages, async () => {
    await db.messages.add(message)
    await db.channels.update(channelId, { updatedAt: message.createdAt })
  })
  return message
}

export async function dispatchMessages(
  channelIds: string[],
  content: string,
  side: MessageSide,
) {
  const dispatchGroupId = makeId()
  const createdAt = now()
  const messages = channelIds.map<Message>((channelId) => ({
    id: makeId(),
    channelId,
    content: content.trim(),
    side,
    createdAt,
    dispatchGroupId,
  }))
  await db.transaction('rw', db.channels, db.messages, async () => {
    await db.messages.bulkAdd(messages)
    await Promise.all(channelIds.map((id) => db.channels.update(id, { updatedAt: createdAt })))
  })
  return messages
}

export async function editMessage(id: string, content: string) {
  await db.messages.update(id, { content: content.trim(), updatedAt: now() })
}

export async function deleteMessage(id: string) {
  await db.messages.delete(id)
}

export async function getPreference<T>(key: string, fallback: T): Promise<T> {
  const preference = await db.preferences.get(key)
  return (preference?.value as T | undefined) ?? fallback
}

export async function setPreference(key: string, value: unknown) {
  await db.preferences.put({ key, value })
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export function imageFileToAvatar(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, size / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
      URL.revokeObjectURL(image.src)
    }
    image.onerror = reject
    image.src = URL.createObjectURL(file)
  })
}
