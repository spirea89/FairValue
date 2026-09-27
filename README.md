# German Text to Speech

A small web app that reads text aloud in German — either with the browser's
built-in voices, or with ElevenLabs' more natural-sounding voices via your
own free API key. No backend, no build step, no upload of your text to
this app's servers (it has none) — pure HTML/CSS/JS, deployable straight to
GitHub Pages.

## How it works

Two selectable engines:

- **Browser voice** — `window.speechSynthesis`, a standard browser API for
  text-to-speech. Lists whatever German voices your browser/OS provides,
  lets you pick one, adjust rate and pitch. Free, instant, no signup.
- **ElevenLabs** — noticeably more natural/human-sounding German speech.
  Needs a free ElevenLabs API key (no credit card, ~10,000 characters/month
  free), entered in the app and stored only in your browser's
  `localStorage` — it's your key and your quota, never sent anywhere but
  ElevenLabs, and never committed to this repo.

Long text is automatically split into shorter chunks either way: for the
browser engine, this works around a long-standing Chrome bug where speech
synthesis silently stops after about 15 seconds on a single long utterance;
for ElevenLabs, it keeps each request comfortably under its per-request
character limit.

## Voice quality

Browser-voice quality depends entirely on your browser and OS, not this
app:

- **Chrome / Edge** tend to have the best German voices ("Google Deutsch",
  Microsoft neural voices) since they use online, cloud-quality synthesis.
- **Safari / macOS** uses Apple's on-device German voices — solid quality,
  works offline.
- If no German voice shows up, your OS likely doesn't have one installed —
  check your system's language/voice settings (e.g. on macOS: System
  Settings → Accessibility → Spoken Content → System Voice → Manage Voices).

If that's not natural enough, switch to the ElevenLabs engine in the app.

## Saving texts

Texts can be saved (with a title) directly into this repo, as
[`texts/library.txt`](./texts/library.txt) — one plain-text file, entries
delimited by a `##### <title>` line. Reading the saved list works with no
setup (the repo is public); saving or deleting needs a GitHub personal
access token with write access, since a static site can't keep a shared
write credential private:

1. Create a free, fine-grained token at
   [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new),
   scoped to **only this repository**, with **Contents: Read and write**
   permission.
2. Paste it into "GitHub-Zugang einrichten" in the app. It's stored only in
   your browser's `localStorage` — never committed, never sent anywhere but
   `api.github.com`.
3. Give a text a title, then click "Aktuellen Text speichern". Saving with
   an existing title overwrites that entry (with confirmation).

Each save/delete creates a commit on `main` in this repo.

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
