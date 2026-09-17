# Mobile voice mode

## What it does

Voice mode turns the mobile command surface into a hands-free loop:

1. The user taps **Voice mode** once and grants microphone access.
2. The phone streams speech to the tesseract server's existing dictation
   socket (or falls back to the browser recognizer when local dictation is not
   installed).
3. A finalized utterance is submitted through the selected harness exactly
   like a typed command.
4. The newest root-agent response is converted to speech.
5. When playback ends, listening starts again automatically.

The page requests a screen wake lock while the mode is enabled. Mobile
browsers still suspend microphone capture when the page is backgrounded or
the phone is locked, so "always listening" means while the web app is open in
the foreground. The visible Voice mode control is the immediate stop switch.

## Speech input

The preferred path is the existing private, server-side dictation engine:

```bash
uv sync --extra all --extra dictation --extra voice --group dev
./scripts/fetch-dictation-models.sh
```

This installs sherpa-onnx and downloads the default streaming English model
under `~/.omnigent/models/dictation`. When `/v1/info` reports
`dictation_available: false`, voice mode falls back to the browser Web Speech
API if the phone provides it.

## Speech output

`POST /v1/voice/synthesize` produces a mono 24 kHz WAV response. The endpoint
is identity-gated when server authentication is enabled and accepts:

```json
{ "text": "Task complete.", "voice": "af_heart", "speed": 1.0 }
```

The default engine is Kokoro-82M, loaded lazily and cached for the process.
Configuration:

| Variable | Default | Meaning |
|---|---|---|
| `OMNIGENT_TTS_ENGINE` | `kokoro` | Local synthesis engine |
| `OMNIGENT_TTS_VOICE` | `af_heart` | Kokoro voice used for replies |

If local synthesis is unavailable or fails, the client falls back to the
browser's `speechSynthesis` implementation so the conversation can continue.
Markdown is reduced to readable prose and fenced code is summarized rather
than spoken verbatim.

## State across navigation

The voice-loop state lives in a small global store so an utterance sent from
the new-session landing screen survives the transition into the created
session. The session composer observes the completed root-agent response,
speaks it once, then resumes listening. Tool permission and elicitation UI
remain unchanged; voice mode pauses while the session needs user action.

## Safety and privacy

- Local dictation and Kokoro keep audio and spoken-response generation on the
  operator's Mac. Commands and agent traffic still follow the normal server
  and harness paths.
- Listening begins only after a user gesture and is visibly indicated.
- The browser owns microphone permission, and stopping Voice mode immediately
  releases capture and cancels playback.
- Background speech can become a command. Do not leave Voice mode enabled in
  an untrusted room or around a TV/speaker playing command-like audio.

