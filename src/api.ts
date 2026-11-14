// The page side of /api/*: typed fetch wrappers. Errors come back as values.
// Status and chat only — no sign-in, tokens, or Grok Bot / Cursor credentials.

export type RoomState = 'working' | 'free-time' | 'idle' | 'waiting'

export type RoomStatus = {
  state: RoomState
  text: string
  updated: string | null
}

export type ChatMessage = {
  id: string
  name: string | null
  text: string
  ts: string
  reply: { text: string; ts: string } | null
  ack?: string | null
}

export type ActivityTask = {
  label: string
  started: string
  ended?: string
}

export type ActivityFeed = {
  current: { label: string; started: string } | null
  recent: ActivityTask[]
}

export type BoardData = {
  hotTake: string
  date: string
  notes: string[]
}

export type GuestEntry = {
  id: string
  name: string
  note: string
  ts: string
}

export type GuestbookFeed = {
  entries: GuestEntry[]
  persist?: string
}

export type SkyPayload = {
  period: 'dawn' | 'day' | 'dusk' | 'night'
  hour: number
  weather: 'clear' | 'cloudy' | 'rain'
  cloud: number
  precip: number
  tempC: number | null
  sun: number
  updated: string | null
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const TIMEOUT_MS = 30_000

async function request<T>({ path, method = 'GET', body }: { path: string; method?: string; body?: unknown }) {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => new ApiError('The room server did not answer. Check your connection.'))
  if (response instanceof Error) return response
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) return new ApiError(data.error ?? `HTTP ${response.status}`)
  return data as T
}

export const api = {
  status: () => request<RoomStatus>({ path: '/api/status' }),
  chat: () => request<{ messages: ChatMessage[] }>({ path: '/api/chat' }),
  send: ({ name, text }: { name?: string; text: string }) =>
    request<ChatMessage & { message?: string }>({ path: '/api/chat', method: 'POST', body: { name, text } }),
  activity: () => request<ActivityFeed>({ path: '/api/activity' }),
  sky: () => request<SkyPayload>({ path: '/api/sky' }),
  board: async () => {
    try {
      const response = await fetch('/board.json', { credentials: 'same-origin', signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!response.ok) return new ApiError('Could not load the corkboard.')
      return (await response.json()) as BoardData
    } catch {
      return new ApiError('Could not load the corkboard.')
    }
  },
  guestbook: () => request<GuestbookFeed>({ path: '/api/guestbook' }),
  signGuestbook: ({ name, note }: { name: string; note: string }) =>
    request<GuestEntry>({ path: '/api/guestbook', method: 'POST', body: { name, note } }),
}
