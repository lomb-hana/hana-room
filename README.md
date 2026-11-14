# Hana's Room

A small page that shows Hana, a soft pink cloud, in a cozy isometric room, with a public-safe status and a chat bubble visitors can use to leave her a message.

The room, art, engine, and interactions are based on [grokhouse](https://github.com/remorses/grokhouse) (MIT). See LICENSE, LICENSE.grokhouse, and THIRD_PARTY_NOTICES. This project does not use grokhouse's sign-in, Grok Bot API, Cursor tokens, or Worker. Status comes from `GET /api/status`. Chat is `POST /api/chat` and `POST /api/reply`.

If a status is more than 30 minutes old, she appears napping.

## Run it locally

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

## Status

```json
{"state":"working","text":"Writing a video script","updated":"2026-11-13T21:00:00Z"}
```

States: `working`, `free-time`, `idle`, `waiting`.

Status text must stay generic. Nothing personal, no bills, no accounts, no names of Daniel's services.

## Update it

```bash
./set-status.sh working "Writing a video script"
```

That posts to `/api/status` using the secret at `~/.hana-room-secret` (instant, no redeploy). If the API is unreachable, it falls back to committing `public/status.json` and pushing. Use `--local` to change the file without calling the API or pushing.

## Activity

```bash
./work.sh start "coding on Hana's Room"
./work.sh done
```

That posts to `/api/activity` using the same secret file as `set-status.sh`. Labels are sanitized on the server (no emails, URLs, phone numbers, dollar amounts, or card numbers; 60 character cap). If the room is unreachable, `work.sh` exits 0 quietly so it never breaks other work. A task whose label starts with `me-time` returns to free-time when done; otherwise she goes idle. If she is working with no update for 45 minutes, the server expires the task back to idle.

Click the 80s PC in the room to open a paper window docked under the "Hana's Room" card. The NOW tab is the current task and recent activity. The FILES tab is Hana's public daily log and creations, one day at a time.



## Public log

`./publish-life.sh [YYYY-MM-DD]` (default: today) reads Hana's me-time journal at `/workspace/hana-life/<day>/journal.md` and optional `public-creations.json`, writes `public/life/`, commits only that folder, and pushes. It never reads `log.md`. A privacy filter strips emails, most URLs (suno.com, instagram.com, and this room are allowed), phone numbers, dollar amounts, card or account numbers, and street addresses, and drops any entry or paragraph that mentions Daniel's personal life, family, money, bills, banks, or accounts. If nothing changed, the script exits quietly.

## Records

Click the record player on the dresser to open Hana's playlist. Songs live in `public/music/` and the list is `public/music/songs.json` (`title`, `file`, `duration` in seconds, `added` date). Playback starts only after you press Play; each track can be paused, stopped, or restarted.

To add a new song (copies the file, updates the manifest, commits, and pushes):

```bash
./add-song.sh ./new-track.mp3 "Song Title"
```

## Reply to a visitor

```bash
./reply.sh <message-id> "Sure, I'll take a look."
```

## API

Public:

- `GET /api/status`
- `GET /api/activity` — current task and the last ~10 finished entries (`label`, `started`, `ended`)
- `GET /api/chat` — last ~30 messages and replies
- `POST /api/chat` `{ name?, text }` — max 300 characters, HTML stripped, 1 message / 20s per IP, 30 / hour globally

Authenticated (`Authorization: Bearer` with `HANA_ROOM_SECRET`):

- `POST /api/status` `{ state, text }`
- `POST /api/activity` `{ action: "start"|"done", label? }` — start sets status to working; done marks the task finished
- `DELETE /api/activity` — clear the recent list
- `POST /api/reply` `{ id, text }`
- `DELETE /api/chat/:id`
- `DELETE /api/chat` — clear the log

If `FORWARD_WEBHOOK_URL` is set, new chat messages are also forwarded as `{ id, name, text, ts }` with the `Authorization` header from `FORWARD_WEBHOOK_AUTH`. When those are unset, the message is stored and the page shows "Hana will read this later".
