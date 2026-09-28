# `@poultry/bridge-host`

The WhatsApp transport. One long-running Node process that holds the linked-device
socket, turns raw WhatsApp events into the shared `InboundMessage` contract, and
hands them to the rest of the system.

This host is deliberately **not** part of the pnpm workspace. Baileys depends on
`libsignal` from a git repository, which the main workspace's supply-chain guard
refuses. Rather than relax that guard for every package in the repo, the exception
is scoped to this one host in [`pnpm-workspace.yaml`](./pnpm-workspace.yaml), and
this directory carries its own lockfile. Nothing in `packages/*` can pick up a git
dependency because of it.

## Pairing a number (QR)

```sh
pnpm install --dir apps/bridge
pnpm bridge
```

On first run the process prints a QR code in the terminal. In WhatsApp on the phone
you want to link: **Settings → Linked devices → Link a device**, then scan it.

The session is written to `BRIDGE_SESSION_DIR` (`./.bridge-session` by default).
After the first successful pairing, subsequent runs reconnect without printing a
new code. That directory holds account credentials: it is gitignored, and it must
never be committed or copied between machines.

To unlink deliberately, delete the session directory and pair again. If WhatsApp
unlinks you from the other end, the bridge logs that the account was unlinked and
stops; delete the directory to pair a new number.

## Configuration

Read from the repo-root `.env` (gitignored). `.env.example` is the committed
reference.

| Variable                | Default             | Notes                                                  |
| ----------------------- | ------------------- | ------------------------------------------------------ |
| `BRIDGE_SESSION_DIR`    | `./.bridge-session` | Linked-device session. Gitignored; never commit it.    |
| `BRIDGE_ALLOWED_FROM`   | _(empty)_           | Comma-separated E.164 numbers. **Empty means nobody.** |
| `BRIDGE_LOG_LEVEL`      | `info`              | `trace`…`silent`.                                      |
| `BRIDGE_OUTBOX_POLL_MS` | `10000`             | Reserved for the outbox poller.                        |
| `BRIDGE_TURN_URL`       | _(unset)_           | Reserved for the Phase 8 API handoff.                  |

`BRIDGE_ALLOWED_FROM` fails closed. An unpaired bridge that answers every number
that messages it is a bridge that answers strangers with veterinary advice, so an
empty or all-invalid list is treated as _nobody_ rather than _everyone_ and the
process warns at boot.

## What this phase does not do

- **No farmer-facing replies yet.** The turn handler returns `null` and the bridge
  stays silent. An improvised "consult a vet" string from the transport layer is
  still content the product never chose; Phase 8 makes the orchestrator the only
  source of farmer-facing words.
- **No media storage.** Downloaded bytes go to a `MediaIntake` port that throws
  until Phase 6's R2 pipeline is plugged in, rather than storing them somewhere
  unreviewable.
- **No outbox polling.** The outbox state machine is built and tested in
  `@poultry/bridge`, but no durable `outbox` table exists yet, so the host does
  not pretend to poll one.
- **Expired media is not re-requested.** Baileys 6.7.24 takes the download
  context (which carries the host-protocol re-upload call) as a fourth argument
  that only the library's own socket can build, so media WhatsApp has already
  expired fails rather than retrying.

## Verifying

```sh
pnpm bridge:check    # typecheck + lint + unit tests, from the repo root
```

Unit tests cover the env schema and the dispatch orchestrator against fakes. There
are no live-socket unit tests by design — the socket boot is smoke-tested manually
once, by pairing a real number and sending a message from a second device.
