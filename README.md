# Hana's Room

A small test page that shows Hana in a cozy room, with a public-safe status.

Open `public/index.html` locally, or the live Render URL once it is deployed. The page reads `public/status.json` about every 20 seconds. If that status is more than 30 minutes old, she appears napping.

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

On this static-site test, that commits `status.json` and pushes, then Render redeploys (about a minute). Use `--local` to change the file without pushing.

A later version could serve status from a tiny endpoint so the room updates in seconds without a redeploy.
