// Visitor chat name: stored in the browser, checked again on the server.
// The slur list stays on the server and is never shipped here.

export const NAME_KEY = 'hana-room-name'
export const NAME_MIN = 2
export const NAME_MAX = 20

const RESERVED = new Set(['hana', 'daniel', 'tenderqwerty'])

export function normalizeName(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function reservedKey(name: string) {
  return normalizeName(name).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function isReservedName(name: string) {
  return RESERVED.has(reservedKey(name))
}

// Client-side checks only. Offensive names are rejected by the server.
export function checkNameLocal(value: string): string | null {
  const name = normalizeName(value)
  if (name.length < NAME_MIN || name.length > NAME_MAX) return 'Pick a name between 2 and 20 characters.'
  if (isReservedName(name)) return 'That name is reserved. Please pick another.'
  return null
}

export function readStoredName(): string | null {
  try {
    const raw = normalizeName(localStorage.getItem(NAME_KEY) || '')
    if (!raw || checkNameLocal(raw)) return null
    return raw
  } catch {
    return null
  }
}

export function writeStoredName(name: string) {
  localStorage.setItem(NAME_KEY, name)
}
