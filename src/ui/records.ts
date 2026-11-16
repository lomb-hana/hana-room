// Playlist window for Hana's records, opened by clicking the turntable.
// Cream paper chrome, one shared audio element, no autoplay: playback starts
// only from a user click. Play/Pause, Stop, and Restart, with a progress bar
// on the current track.

export type Song = {
  title: string
  file: string
  duration: number
  added?: string
}

export type SongList = { songs: Song[] }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...children: Array<Node | string | null | false | undefined>) {
  const node = document.createElement(tag)
  const { class: className, ...rest } = props
  if (className) node.className = className
  Object.assign(node, rest)
  for (const child of children) if (child) node.append(child)
  return node
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(Number(seconds) || 0))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function srcOf(song: Song) {
  const name = song.file.replace(/^\/+/, '')
  return `/music/${name}`
}

export function createRecords({ host, onPlay }: { host: HTMLElement; onPlay?: (playing: boolean) => void }) {
  const close = el('button', { class: 'term-close', type: 'button', title: 'Close', ariaLabel: 'Close records window', textContent: '×' })
  const list = el('div', { class: 'rec-list' })
  const win = el(
    'div',
    { class: 'rec-win term-win', hidden: true, role: 'dialog', ariaLabel: "Hana's Records" },
    el('header', { class: 'term-bar' }, el('span', { class: 'term-title', textContent: "Hana's Records" }), close),
    list,
  )
  host.append(win)

  const audio = el('audio', { preload: 'none' }) as HTMLAudioElement
  audio.setAttribute('playsinline', '')
  host.append(audio)

  let songs: Song[] = []
  let current: string | null = null
  let playing = false
  let open = false
  let raf = 0
  let startGen = 0

  const idOf = (song: Song) => song.file

  function setPlaying(next: boolean) {
    if (playing === next) return
    playing = next
    if (next) startGen += 1
    onPlay?.(playing)
  }

  function tick() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    paintProgress()
    if (playing) raf = requestAnimationFrame(tick)
  }

  function paintProgress() {
    const row = current ? list.querySelector<HTMLElement>(`[data-file="${CSS.escape(current)}"]`) : null
    if (!row) return
    const bar = row.querySelector<HTMLElement>('.rec-bar-fill')
    const time = row.querySelector<HTMLElement>('.rec-time')
    const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : Number(row.dataset.duration || 0)
    const t = audio.currentTime || 0
    if (bar) bar.style.width = `${dur ? Math.min(100, (t / dur) * 100) : 0}%`
    if (time) time.textContent = `${formatDuration(t)} / ${formatDuration(dur)}`
  }

  function render() {
    list.replaceChildren()
    if (!songs.length) {
      list.append(el('p', { class: 'rec-empty', textContent: 'No records yet.' }))
      return
    }
    for (const song of songs) {
      const id = idOf(song)
      const active = current === id
      const isOn = active && playing
      const row = el('div', { class: `rec-track${active ? ' is-current' : ''}${isOn ? ' is-playing' : ''}` })
      row.dataset.file = id
      row.dataset.duration = String(song.duration || 0)
      const play = el('button', {
        class: 'btn rec-btn',
        type: 'button',
        textContent: isOn ? 'Pause' : 'Play',
        ariaLabel: isOn ? `Pause ${song.title}` : `Play ${song.title}`,
      })
      const stop = el('button', { class: 'btn rec-btn', type: 'button', textContent: 'Stop', ariaLabel: `Stop ${song.title}` })
      const restart = el('button', { class: 'btn rec-btn', type: 'button', textContent: 'Restart', ariaLabel: `Restart ${song.title}` })
      play.addEventListener('click', () => toggle(song))
      stop.addEventListener('click', () => stopTrack(song))
      restart.addEventListener('click', () => restartTrack(song))
      const dur = formatDuration(song.duration)
      row.append(
        el('div', { class: 'rec-meta' },
          el('div', { class: 'rec-title', textContent: song.title }),
          el('div', { class: 'rec-time', textContent: active ? `${formatDuration(audio.currentTime || 0)} / ${dur}` : dur }),
        ),
        el('div', { class: 'rec-actions' }, play, stop, restart),
      )
      if (active) {
        const bar = el('button', { class: 'rec-bar', type: 'button', ariaLabel: `Seek ${song.title}` }, el('span', { class: 'rec-bar-fill' }))
        bar.addEventListener('click', (e) => seek(song, e))
        row.append(bar)
      }
      list.append(row)
    }
    paintProgress()
  }

  function loadTrack(song: Song) {
    const id = idOf(song)
    if (current !== id) {
      audio.src = srcOf(song)
      current = id
    }
  }

  async function playTrack(song: Song) {
    loadTrack(song)
    try {
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
    render()
    tick()
  }

  function toggle(song: Song) {
    if (current === idOf(song) && playing) {
      audio.pause()
      setPlaying(false)
      render()
      return
    }
    void playTrack(song)
  }

  function stopTrack(song: Song) {
    loadTrack(song)
    audio.pause()
    audio.currentTime = 0
    setPlaying(false)
    render()
  }

  function restartTrack(song: Song) {
    loadTrack(song)
    audio.currentTime = 0
    startGen += 1
    void playTrack(song)
  }

  function seek(song: Song, e: MouseEvent) {
    const bar = e.currentTarget as HTMLElement
    const rect = bar.getBoundingClientRect()
    const u = rect.width ? Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) : 0
    loadTrack(song)
    const dur = audio.duration && Number.isFinite(audio.duration) ? audio.duration : song.duration
    audio.currentTime = u * dur
    paintProgress()
  }

  audio.addEventListener('ended', () => {
    audio.currentTime = 0
    setPlaying(false)
    render()
  })
  audio.addEventListener('timeupdate', paintProgress)
  audio.addEventListener('pause', () => {
    if (audio.ended) return
    if (playing && audio.paused) {
      // Paused from the element itself (e.g. interruption).
      setPlaying(false)
      render()
    }
  })

  close.addEventListener('click', (e) => {
    e.stopPropagation()
    hide()
  })
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && open) {
        e.stopImmediatePropagation()
        hide()
      }
    },
    true,
  )

  function show() {
    open = true
    win.hidden = false
    if (!songs.length) void loadSongs()
    else render()
  }
  function hide() {
    open = false
    win.hidden = true
  }

  async function loadSongs() {
    const res = await fetch('/music/songs.json', { cache: 'no-store' }).catch(() => null)
    const data = res?.ok ? ((await res.json().catch(() => null)) as SongList | null) : null
    songs = Array.isArray(data?.songs) ? data!.songs.filter((s) => s && s.title && s.file) : []
    render()
  }

  void loadSongs()

  return {
    toggle() {
      if (open) hide()
      else show()
      return open
    },
    open: show,
    close: hide,
    isOpen: () => open,
    isPlaying: () => playing,
    startGen: () => startGen,
    audio,
    load: loadSongs,
  }
}
