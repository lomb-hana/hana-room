// Houston sky for Hana's window: time of day in America/Chicago, plus
// weather from Open-Meteo (or the same-origin /api/sky cache).

import type { Hand, InkName, Rng, Vec } from './press.ts'
import { blob, rd } from './press.ts'

export const HOUSTON_TZ = 'America/Chicago'
export const HOUSTON = { lat: 29.76, lon: -95.37 }

export type Period = 'dawn' | 'day' | 'dusk' | 'night'
export type SkyWeather = 'clear' | 'cloudy' | 'rain'

export type SkyState = {
  period: Period
  hour: number
  weather: SkyWeather
  cloud: number
  precip: number
  tempC: number | null
  sun: number
  updated: string | null
}

export const PERIODS: Period[] = ['dawn', 'day', 'dusk', 'night']

export function houstonParts(at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: HOUSTON_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(at)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return { hour, minute, frac: hour + minute / 60 }
}

export function periodOfHour(frac: number): Period {
  if (frac >= 6 && frac < 7.5) return 'dawn'
  if (frac >= 7.5 && frac < 17.25) return 'day'
  if (frac >= 17.25 && frac < 19) return 'dusk'
  return 'night'
}

export function sunOf(period: Period, cloud: number) {
  const base = period === 'day' ? 1 : period === 'dawn' ? 0.45 : period === 'dusk' ? 0.35 : 0
  return base * (1 - Math.min(0.75, cloud) * 0.7)
}

export function weatherFrom(code: number, precip: number, cloud: number): SkyWeather {
  if (precip > 0.1 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99)) return 'rain'
  if (cloud >= 0.45 || (code >= 1 && code <= 3) || (code >= 45 && code <= 48)) return 'cloudy'
  return 'clear'
}

export function skyNow(o: { period?: Period; weather?: SkyWeather; cloud?: number; precip?: number; tempC?: number | null; updated?: string | null } = {}): SkyState {
  const { frac } = houstonParts()
  const period = o.period ?? periodOfHour(frac)
  const cloud = o.cloud ?? (o.weather === 'clear' ? 0.08 : o.weather === 'rain' ? 0.8 : 0.55)
  const weather = o.weather ?? 'clear'
  const precip = o.precip ?? (weather === 'rain' ? 1 : 0)
  return {
    period,
    hour: frac,
    weather,
    cloud,
    precip,
    tempC: o.tempC ?? null,
    sun: sunOf(period, cloud),
    updated: o.updated ?? null,
  }
}

export function parseTimeQuery(search = typeof location !== 'undefined' ? location.search : ''): { period?: Period; weather?: SkyWeather } {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const raw = (q.get('time') || '').toLowerCase()
  const period = PERIODS.includes(raw as Period) ? (raw as Period) : undefined
  const w = (q.get('weather') || '').toLowerCase()
  const weather = w === 'rain' || w === 'cloudy' || w === 'clear' ? w : undefined
  return { period, weather }
}

export function applySkyPayload(data: Partial<SkyState> | null, override: { period?: Period; weather?: SkyWeather } = {}): SkyState {
  const period = override.period ?? (data?.period && PERIODS.includes(data.period) ? data.period : periodOfHour(houstonParts().frac))
  const weather = override.weather ?? (data?.weather === 'rain' || data?.weather === 'cloudy' || data?.weather === 'clear' ? data.weather : 'clear')
  const cloud = override.weather ? (weather === 'clear' ? 0.08 : weather === 'rain' ? 0.85 : 0.6) : Number(data?.cloud ?? (weather === 'clear' ? 0.08 : 0.55))
  return skyNow({
    period,
    weather,
    cloud: Math.min(1, Math.max(0, cloud)),
    precip: override.weather ? (weather === 'rain' ? 1 : 0) : Number(data?.precip ?? 0),
    tempC: typeof data?.tempC === 'number' ? data.tempC : null,
    updated: typeof data?.updated === 'string' ? data.updated : null,
  })
}

const METEO = `https://api.open-meteo.com/v1/forecast?latitude=${HOUSTON.lat}&longitude=${HOUSTON.lon}&current=temperature_2m,weather_code,precipitation,cloud_cover,rain,showers&timezone=America%2FChicago`

export function skyFromMeteo(json: { current?: Record<string, number | string | null> }): SkyState {
  const cur = json.current || {}
  const code = Number(cur.weather_code ?? 0)
  const precip = Number(cur.precipitation ?? cur.rain ?? cur.showers ?? 0)
  const cloud = Math.min(1, Math.max(0, Number(cur.cloud_cover ?? 0) / 100))
  const weather = weatherFrom(code, precip, cloud)
  const { frac } = houstonParts()
  const period = periodOfHour(frac)
  return {
    period,
    hour: frac,
    weather,
    cloud,
    precip,
    tempC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : Number(cur.temperature_2m ?? NaN) || null,
    sun: sunOf(period, cloud),
    updated: typeof cur.time === 'string' ? cur.time : new Date().toISOString(),
  }
}

export async function fetchOpenMeteo(): Promise<SkyState | null> {
  try {
    const res = await fetch(METEO, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return skyFromMeteo(await res.json())
  } catch {
    return null
  }
}

type Wash = { ink: InkName; tone: number; ink2?: InkName; tone2?: number }

export function skyWash(period: Period): Wash {
  if (period === 'dawn') return { ink: 'coral', tone: 0.28, ink2: 'sun', tone2: 0.45 }
  if (period === 'day') return { ink: 'blue', tone: 0.22, ink2: 'teal', tone2: 0.1 }
  if (period === 'dusk') return { ink: 'coral', tone: 0.55, ink2: 'blue', tone2: 0.28 }
  return { ink: 'blue', tone: 0.72, ink2: 'black', tone2: 0.35 }
}

export function dimOf(period: Period, weather: SkyWeather): { fill: string; alpha: number } | null {
  if (period === 'night') return { fill: 'rgb(18, 20, 42)', alpha: 0.52 }
  if (period === 'dusk') return { fill: 'rgb(78, 36, 28)', alpha: 0.2 }
  if (period === 'dawn') return { fill: 'rgb(255, 186, 150)', alpha: 0.07 }
  if (weather === 'rain' || weather === 'cloudy') return { fill: 'rgb(40, 50, 70)', alpha: 0.08 }
  return null
}

export function drawSkyView(H: Hand, R: Rng, pane: Vec[], sky: SkyState) {
  const wash = skyWash(sky.period)
  H.fill(pane, wash.ink, wash.tone)
  if (wash.ink2) H.tint(pane, wash.ink2, wash.tone2 ?? 0.2)
  const c = pane.reduce((a, p) => [a[0] + p[0] / pane.length, a[1] + p[1] / pane.length] as Vec, [0, 0] as Vec)
  H.clip(pane, () => {
    if (sky.period === 'night') {
      H.dot(c[0] + 10, c[1] - 8, 5.5, 'paper', 1, { knock: true })
      H.dot(c[0] + 12, c[1] - 8, 4.2, 'blue', 0.15, { knock: true })
      for (let n = 0; n < 9; n++) {
        const x = c[0] + rd(R, -22, 22)
        const y = c[1] + rd(R, -16, 10)
        H.dot(x, y, rd(R, 0.5, 1.1), 'paper', 1, { knock: true })
      }
    } else {
      const sunY = sky.period === 'dawn' ? c[1] + 6 : sky.period === 'dusk' ? c[1] + 8 : c[1] - 7
      const sunX = sky.period === 'dusk' ? c[0] + 14 : c[0] - 12
      const ink: InkName = sky.period === 'day' ? 'sun' : 'coral'
      H.dot(sunX, sunY, sky.period === 'day' ? 7 : 6, ink, 1, { knock: true })
    }
    const cloudy = sky.weather !== 'clear' || sky.cloud > 0.3
    if (cloudy) {
      const n = sky.weather === 'rain' ? 4 : 3
      for (let k = 0; k < n; k++) {
        const x = c[0] + (k - 1.2) * 11 + rd(R, -3, 3)
        const y = c[1] - 4 + (k % 2) * 5
        H.fill(blob(R, x, y, 11 + sky.cloud * 4, 6.5, 0), sky.period === 'night' ? 'blue' : 'paper', sky.period === 'night' ? 0.45 : 0.92)
      }
    }
  })
}

export function drawRain(H: Hand, pane: Vec[], t: number, sky: SkyState, reduced: boolean) {
  if (sky.weather !== 'rain' || sky.precip <= 0) return
  const ctx = H.ctx()
  const c = pane.reduce((a, p) => [a[0] + p[0] / pane.length, a[1] + p[1] / pane.length] as Vec, [0, 0] as Vec)
  ctx.save()
  ctx.beginPath()
  pane.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
  ctx.clip()
  const drops = reduced ? 8 : 18
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = 0.9
  ctx.lineCap = 'round'
  for (let n = 0; n < drops; n++) {
    const seed = n * 17.17
    const x = c[0] + ((seed * 13) % 44) - 22
    const span = 36
    const y0 = reduced ? c[1] - 14 + ((seed * 7) % span) : c[1] - 16 + ((t * 42 + seed * 9) % span)
    ctx.beginPath()
    ctx.moveTo(x, y0)
    ctx.lineTo(x + 2.2, y0 + 7)
    ctx.stroke()
  }
  ctx.restore()
}

export function skyKey(sky: SkyState) {
  return `${sky.period}|${sky.weather}|${Math.round(sky.cloud * 8)}`
}


// Autumn leaves drifting past the window, Houston-style late (mid-October to
// early December). Original little almond-shaped leaves drawn on the canvas.
export function isLeafSeason(at = new Date(), search = typeof location !== 'undefined' ? location.search : ''): boolean {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const s = (q.get('season') || '').toLowerCase()
  if (s === 'autumn' || s === 'fall') return true
  if (s) return false
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: HOUSTON_TZ, month: 'numeric', day: 'numeric' }).formatToParts(at)
  const m = Number(parts.find((p) => p.type === 'month')?.value ?? 0)
  const d = Number(parts.find((p) => p.type === 'day')?.value ?? 0)
  return (m === 10 && d >= 15) || m === 11 || (m === 12 && d <= 7)
}

const LEAF_COLORS = ['rgba(214, 112, 46, A)', 'rgba(178, 64, 38, A)', 'rgba(222, 168, 52, A)', 'rgba(150, 92, 40, A)']

export function drawLeaves(H: Hand, pane: Vec[], t: number, sky: SkyState, reduced: boolean, season: boolean) {
  if (!season) return
  const ctx = H.ctx()
  const c = pane.reduce((a, p) => [a[0] + p[0] / pane.length, a[1] + p[1] / pane.length] as Vec, [0, 0] as Vec)
  const alpha = sky.period === 'night' ? 0.55 : 0.9
  const gust = sky.weather === 'rain' ? 1.6 : 1
  ctx.save()
  ctx.beginPath()
  pane.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
  ctx.clip()
  const n = reduced ? 3 : 5
  for (let k = 0; k < n; k++) {
    const seed = k * 23.71 + 3.3
    const speed = (7 + (seed % 5)) * gust
    const span = 44
    const fall = reduced ? (seed * 11) % span : (t * speed + seed * 9) % span
    const y = c[1] - 22 + fall
    const sway = reduced ? 0 : Math.sin(t * 1.3 + seed) * 5
    const x = c[0] - 20 + ((seed * 17) % 40) + sway + fall * 0.25 * gust
    const rot = reduced ? seed : t * (1.1 + (k % 3) * 0.4) + seed
    const col = LEAF_COLORS[k % LEAF_COLORS.length].replace('A', String(alpha))
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.cos(rot * 0.7)))
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(-3.2, 0)
    ctx.quadraticCurveTo(0, -2.4, 3.2, 0)
    ctx.quadraticCurveTo(0, 2.4, -3.2, 0)
    ctx.fill()
    ctx.strokeStyle = `rgba(90, 50, 25, ${alpha * 0.7})`
    ctx.lineWidth = 0.45
    ctx.beginPath()
    ctx.moveTo(-3.6, 0)
    ctx.lineTo(2.6, 0)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}


// Thanksgiving parade week: one original little pumpkin balloon (with a tiny
// leaf on top and tether lines) floats slowly across the window, from the
// Monday before Thanksgiving through Thanksgiving Day (Houston time).
// ?parade=on forces it on, ?parade=off hides it.
export function isParadeWeek(at = new Date(), search = typeof location !== 'undefined' ? location.search : ''): boolean {
  const q = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  const p = (q.get('parade') || '').toLowerCase()
  if (p === 'on' || p === '1') return true
  if (p) return false
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: HOUSTON_TZ, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(at)
  const y = Number(parts.find((x) => x.type === 'year')?.value ?? 0)
  const m = Number(parts.find((x) => x.type === 'month')?.value ?? 0)
  const d = Number(parts.find((x) => x.type === 'day')?.value ?? 0)
  if (m !== 11) return false
  const firstDow = new Date(Date.UTC(y, 10, 1)).getUTCDay() // 0 = Sunday
  const thanksgiving = 1 + ((4 - firstDow + 7) % 7) + 21
  return d >= thanksgiving - 3 && d <= thanksgiving
}

export function drawParadeBalloon(H: Hand, pane: Vec[], t: number, sky: SkyState, reduced: boolean, on: boolean) {
  if (!on) return
  const ctx = H.ctx()
  const xs = pane.map((p) => p[0])
  const ys = pane.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const yTop = Math.min(...ys)
  const yBot = Math.max(...ys)
  const w = x1 - x0 + 40
  const alpha = sky.period === 'night' ? 0.6 : 0.95
  const cycle = 46 // seconds per pass
  const u = reduced ? 0.55 : (t % cycle) / cycle
  const x = x0 - 20 + u * w
  const y = yTop + (yBot - yTop) * 0.34 + (reduced ? 0 : Math.sin(t * 0.9) * 1.6)
  const tilt = reduced ? 0 : Math.sin(t * 0.6) * 0.08
  ctx.save()
  ctx.beginPath()
  pane.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])))
  ctx.closePath()
  ctx.clip()
  // tether lines trailing down and back toward the (unseen) street
  ctx.strokeStyle = `rgba(70, 60, 55, ${alpha * 0.55})`
  ctx.lineWidth = 0.4
  for (const dx of [-3, 0, 3]) {
    ctx.beginPath()
    ctx.moveTo(x + dx, y + 5)
    ctx.quadraticCurveTo(x + dx - 3, y + 14, x + dx - 6, yBot + 4)
    ctx.stroke()
  }
  ctx.translate(x, y)
  ctx.rotate(tilt)
  // pumpkin body: three puffy lobes
  const lobes: Array<[number, number, string]> = [[-3.4, 4.2, 'rgba(214, 108, 40, A)'], [3.4, 4.2, 'rgba(214, 108, 40, A)'], [0, 4.8, 'rgba(232, 128, 52, A)']]
  for (const [lx, r, col] of lobes) {
    ctx.fillStyle = col.replace('A', String(alpha))
    ctx.beginPath()
    ctx.ellipse(lx, 0, r, 5, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.strokeStyle = `rgba(120, 55, 25, ${alpha * 0.6})`
  ctx.lineWidth = 0.45
  for (const lx of [-1.9, 1.9]) {
    ctx.beginPath()
    ctx.moveTo(lx, -4.4)
    ctx.quadraticCurveTo(lx * 1.3, 0, lx, 4.4)
    ctx.stroke()
  }
  // shine
  ctx.fillStyle = `rgba(255, 236, 200, ${alpha * 0.45})`
  ctx.beginPath()
  ctx.ellipse(-1.2, -2.4, 1.1, 0.6, -0.4, 0, Math.PI * 2)
  ctx.fill()
  // stem and a tiny leaf
  ctx.fillStyle = `rgba(96, 72, 40, ${alpha})`
  ctx.fillRect(-0.6, -6.6, 1.2, 2)
  ctx.fillStyle = `rgba(98, 140, 70, ${alpha})`
  ctx.beginPath()
  ctx.moveTo(0.4, -6)
  ctx.quadraticCurveTo(2.6, -7.8, 3.6, -5.8)
  ctx.quadraticCurveTo(2, -5, 0.4, -6)
  ctx.fill()
  ctx.restore()
}
