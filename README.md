# German Text to Speech

A small web app that reads text aloud in German, using the browser's
built-in speech synthesis (the Web Speech API). No backend, no build step,
no upload of your text anywhere — pure HTML/CSS/JS, deployable straight to
GitHub Pages.

## How it works

The app uses `window.speechSynthesis`, a standard browser API for
text-to-speech. It lists whatever German voices your browser/OS provides,
lets you pick one, adjust rate and pitch, and reads your text aloud.

Long text is automatically split into shorter chunks and queued as separate
utterances — this works around a long-standing Chrome bug where speech
synthesis silently stops after about 15 seconds on a single long utterance.

## Voice quality

Voice quality depends entirely on your browser and OS, not this app:

- **Chrome / Edge** tend to have the best German voices ("Google Deutsch",
  Microsoft neural voices) since they use online, cloud-quality synthesis.
- **Safari / macOS** uses Apple's on-device German voices — solid quality,
  works offline.
- If no German voice shows up, your OS likely doesn't have one installed —
  check your system's language/voice settings (e.g. on macOS: System
  Settings → Accessibility → Spoken Content → System Voice → Manage Voices).

If browser voices aren't good enough, the natural next step is a free
API-based TTS service for noticeably more natural German speech.

## Running locally

No install required. From this folder:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploying to GitHub Pages

This is a static site, so GitHub Pages can serve it directly from the `main`
branch with no build step. Push to `main`, then in the repo go to
**Settings → Pages** and set **Source** to "Deploy from a branch", branch
`main`, folder `/ (root)`.
