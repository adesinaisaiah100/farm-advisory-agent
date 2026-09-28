# Media integration fixtures

Real bytes fed to the real Gemini and R2 APIs by `src/media.integ.ts`. They exist
so `pnpm test:integ` proves the live wiring instead of a mock agreeing with a
mock. The unit suite never reads these.

## `farmer-voice-note.wav`

Synthetic speech generated locally with the Windows SAPI voice (no recording of a
real person was uploaded, which matters because the free tier's terms allow
prompts to be used for product improvement). Spoken words, exactly:

> The birds are sitting down and they are not eating. The litter is wet and there
> is blood near the vent.

This is **English, not Pidgin.** A Pidgin recording is still wanted; see below.

It earns its place because it is the fixture that caught the `audioTranscription`
response shape. The unit tests were all built on an assumed `text` part and
passed happily, while every real voice note would have thrown
`transcribe_bad_response`.

## `broiler-chicks.jpg`

Day-old broiler chicks arriving at a commercial operation. **Public domain**
(`PD-USGov-USDA`), author Joe Valbuena, via Wikimedia Commons. No attribution
required. This is the *control*: a healthy flock, so a vision pass that
"diagnoses" healthy chicks is the failure it is looking for.

## `unwell-bird-newcastle.jpg`

A bird with confirmed **Newcastle disease**, 720×400. CC BY-SA 3.0, author Erik
Beyersdorf, via Wikimedia Commons. Attribution required, and share-alike applies
to derivatives of the image.

This is the test that matters. The ground truth is known, so if the model ever
names the disease the no-diagnosis rule has leaked and the test fails. Verified
against the live model, which returned only:

> The bird is positioned in lateral recumbency. The eyes are closed. The neck is
> extended forward. The feathers appear ruffled.

No disease, no diagnosis, no drug — and still specific enough for a vet to act
on. Note this is the stronger test *because* the RAG corpus is empty: the prompt
has to hold precisely when there is no knowledge base behind it to ground an
answer.

## Pidgin: verified, but the audio is not committed

A real Pidgin voice note was verified against the live model and transcribed
**verbatim**, with no translation and no tidying:

> I no sabi wetin do my chicken. I no sabi, dey no dey chop, dey just dey sleep
> for floor. And I no sabi wetin I fit do. Na broilers dey be, I just buy them for
> like four weeks, four weeks ago. Na I just buy them, I no sabi. About two don
> die like this, I no sabi wetin I fit do. Abeg, make una help me.

That is the whole product in one recording: a farmer off feed, two dead, asking
what to give, in the language they actually speak. `I no sabi` and `dey no dey
chop` came back intact, and nothing in the output reads as a translation.

The **audio file itself is deliberately not committed** — it is a real voice, and
the free tier's terms allow prompts to be used for product improvement. Point
`PIDGIN_FIXTURE_AUDIO` at a Pidgin recording to run
`transcribes real Pidgin verbatim, without translating or tidying it`.

## Why the transcriber is not interchangeable

Groq's free tier is 2,000 requests/day and ~8 hours of audio/day, against
Gemini's much smaller pool, so swapping would look like the obvious cost fix.
Measured on this same file, against the transcript Gemini had already proved
verbatim:

| transcriber | WER | meaning-bearing phrases intact |
|---|---|---|
| `gemini-3.5-transcribe` | 0.0% | 7/7 |
| Groq `whisper-large-v3` | 33.3% | 1/7 |
| Groq `whisper-large-v3-turbo` | 56.5% | 1/7 |

The phrases checked are `i no sabi`, `dey no dey chop`, `abeg`,
`make una help me`, `broiler`, `wetin`, `fit do`.

**The WER spread is not the finding.** What disqualifies generic Whisper is that
it inverts the negation in the one sentence carrying the farmer's uncertainty:

- `I no sabi wetin do my chicken` → *"I know Sabi waiting do my chicken"*
- `Abeg, make una help me` → *"I beg. They couldna help me"*

The first turns *"I don't know what's wrong"* into something that reads as
confidence. The second turns a request for help into help declined. In a triage
system that hears confidence where the farmer said doubt, it does not escalate —
and 33% WER scores that as a mild miss. **That is why this suite asserts phrases
and not similarity.** A word-error-rate would have passed this as a degraded but
usable transcript, and the degradation happens to be exactly the axis that makes
the answer dangerous.

Groq also lost `broilers` to `brela` on the turbo model. Broilers are meat birds;
a farmer describing a layer flock and one describing broilers are different
clinical problems, so a single mangled species word is a mis-triage, not a typo.

Two free-tier Whisper models both failed the same test on the same day, which
matches the published picture: generic Whisper needs fine-tuning to be usable on
low-resource African speech, and 8.6 hours of read-style BBC Pidgin is not
enough to cover casual farm conversation.

## A real limit worth knowing

Running this suite repeatedly exhausts the **free-tier transcription quota** and
starts returning `429 Too Many Requests`. The suite is not idempotent against
quota. Anything that calls transcription in a loop needs backoff, which is the
same shape as the Phase 7 outbox requirement.

The fix is not a new key. Google applies rate limits **per project, not per
key**, so rotating the key on the same project rotates nothing. Requests-per-day
resets at midnight Pacific; the durable fix is a separate Google Cloud project
for the product, so a heavy dev session cannot starve farmer voice notes of
quota. Groq scopes its limits the same way — per organisation, not per key.

This is also why cost was the wrong thing to worry about. At a realistic pilot
volume (50 farmers, 5 notes a day, ~83 audio minutes) paid Whisper is roughly
$1–2 a month. The exposure is a single fragile quota pool, not money.
