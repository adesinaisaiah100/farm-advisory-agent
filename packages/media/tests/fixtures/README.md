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
required. Chosen because it is broiler birds, matching the farmer this product
serves, and because a *healthy* flock is the right control: a vision pass that
"diagnoses" healthy chicks is the failure this test is looking for.

## Still wanted, and deliberately not faked

A real **Pidgin** voice note. A synthesised clip is not a Pidgin voice note, and
inventing one would have made the confidence gate look proven when the single
most important claim in the package — that Pidgin survives transcription verbatim
— is untested. Point `PIDGIN_FIXTURE_AUDIO` at a real recording to close it.

A photo of a **visibly unwell** bird. The public-domain chick photo proves the
JSON contract and that healthy birds are not diagnosed. It does not prove the
prompt holds its no-diagnosis rule when the bird looks sick, which is the case
that actually matters. Point `PHOTO_FIXTURE_IMAGE` at one to close it.

Both env vars override the committed defaults.
