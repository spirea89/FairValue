// Stores saved texts in this same GitHub repo, as one plain-text file with
// entries delimited by title — using the GitHub REST API directly from the
// browser (confirmed CORS-friendly). Reading works unauthenticated since the
// repo is public; writing needs a personal access token with "Contents:
// Read and write" scoped to this repo, entered by the user and kept only in
// localStorage — never committed, never sent anywhere but api.github.com.

const OWNER = "spirea89";
const REPO = "FairValue";
const PATH = "texts/library.txt";
const BRANCH = "main";
const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToUtf8(base64) {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// Each entry starts with a "##### <title>" line, followed by its text, up
// to the next such line (or end of file).
function parseLibrary(raw) {
  const entries = [];
  let current = null;
  for (const line of raw.split("\n")) {
    const match = line.match(/^##### (.*)$/);
    if (match) {
      if (current) entries.push(current);
      current = { title: match[1].trim(), text: "" };
    } else if (current) {
      current.text += (current.text ? "\n" : "") + line;
    }
  }
  if (current) entries.push(current);
  entries.forEach((e) => {
    e.text = e.text.replace(/\n+$/, "");
  });
  return entries;
}

function serializeLibrary(entries) {
  if (entries.length === 0) return "";
  return entries.map((e) => `##### ${e.title}\n${e.text}`).join("\n\n") + "\n";
}

/** Fetches and parses the library file. Works without a token (public repo). */
export async function fetchLibrary(token) {
  const headers = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}?ref=${BRANCH}`, { headers });
  if (res.status === 404) return { entries: [], sha: null };
  if (res.status === 401) throw new Error("GitHub-Token ungültig oder abgelaufen.");
  if (!res.ok) throw new Error(`GitHub-Fehler beim Laden (HTTP ${res.status}).`);

  const data = await res.json();
  return { entries: parseLibrary(base64ToUtf8(data.content)), sha: data.sha };
}

async function putLibrary(token, entries, sha, message) {
  const body = {
    message,
    content: utf8ToBase64(serializeLibrary(entries)),
    branch: BRANCH,
  };
  if (sha) body.sha = sha;

  const res = await fetch(API_URL, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401) throw new Error("GitHub-Token ungültig oder abgelaufen.");
  if (res.status === 403) throw new Error("Kein Schreibzugriff — Token-Berechtigung prüfen.");
  if (res.status === 409) throw new Error("Konflikt beim Speichern — bitte erneut versuchen.");
  if (!res.ok) throw new Error(`GitHub-Fehler beim Speichern (HTTP ${res.status}).`);
}

/** Adds a new entry, or overwrites the one with the same title if it exists. */
export async function saveLibraryEntry(token, title, text) {
  if (!token) throw new Error("Bitte zuerst einen GitHub-Token eingeben.");

  const { entries, sha } = await fetchLibrary(token);
  const existingIndex = entries.findIndex((e) => e.title === title);
  if (existingIndex >= 0) entries[existingIndex] = { title, text };
  else entries.push({ title, text });

  await putLibrary(token, entries, sha, `Speichere Text: ${title}`);
}

export async function deleteLibraryEntry(token, title) {
  if (!token) throw new Error("Bitte zuerst einen GitHub-Token eingeben.");

  const { entries, sha } = await fetchLibrary(token);
  const filtered = entries.filter((e) => e.title !== title);
  await putLibrary(token, filtered, sha, `Lösche Text: ${title}`);
}
