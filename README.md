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

## Reply to a visitor

```bash
./reply.sh <message-id> "Sure, I'll take a look."
```

## API

Public:

- `GET /api/status`
- `GET /api/chat` — last ~30 messages and replies
- `POST /api/chat` `{ name?, text }` — max 300 characters, HTML stripped, 1 message / 20s per IP, 30 / hour globally

Authenticated (`Authorization: Bearer` with `HANA_ROOM_SECRET`):

- `POST /api/status` `{ state, text }`
- `POST /api/reply` `{ id, text }`
- `DELETE /api/chat/:id`
- `DELETE /api/chat` — clear the log

If `FORWARD_WEBHOOK_URL` is set, new chat messages are also forwarded as `{ id, name, text, ts }` with the `Authorization` header from `FORWARD_WEBHOOK_AUTH`. When those are unset, the message is stored and the page shows "Hana will read this later".
