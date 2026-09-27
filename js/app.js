// German text-to-speech with two engines:
//  - "browser": the Web Speech API (speechSynthesis) — free, built into the
//    browser, no signup, but voice quality varies a lot by browser/OS.
//  - "elevenlabs": ElevenLabs' TTS API — much more natural/human-sounding,
//    needs the user's own free API key (their quota, their key — never
//    committed to this repo, stored only in localStorage).

const textInput = document.getElementById("text-input");
const charCount = document.getElementById("char-count");
const voiceSelect = document.getElementById("voice-select");
const rateInput = document.getElementById("rate-input");
const rateValue = document.getElementById("rate-value");
const pitchInput = document.getElementById("pitch-input");
const pitchValue = document.getElementById("pitch-value");
const speakBtn = document.getElementById("speak-btn");
const pauseBtn = document.getElementById("pause-btn");
const resumeBtn = document.getElementById("resume-btn");
const stopBtn = document.getElementById("stop-btn");
const statusEl = document.getElementById("status");
const unsupportedSection = document.getElementById("unsupported");

const engineRadios = document.querySelectorAll('input[name="engine"]');
const browserControls = document.getElementById("browser-controls");
const elevenlabsControls = document.getElementById("elevenlabs-controls");
const elevenlabsHint = document.getElementById("elevenlabs-hint");
const elevenlabsKeyInput = document.getElementById("elevenlabs-key");
const elevenlabsVoiceSelect = document.getElementById("elevenlabs-voice-select");

const PREFS_KEY = "germanTts.prefs";

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function savePrefs(patch) {
  try {
    const current = loadPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // localStorage unavailable — non-fatal, just skip persisting.
  }
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setButtonsSpeaking(isSpeaking, isPaused) {
  speakBtn.disabled = isSpeaking;
  stopBtn.disabled = !isSpeaking;
  pauseBtn.hidden = isPaused;
  pauseBtn.disabled = !isSpeaking || isPaused;
  resumeBtn.hidden = !isPaused;
  resumeBtn.disabled = !isPaused;
}

// Splits text into shorter chunks on sentence boundaries (falling back to
// commas/spaces for very long sentences). Used by both engines: it works
// around a Chrome bug where speechSynthesis silently stops after ~15s on a
// single long utterance, and keeps each ElevenLabs request comfortably
// under its per-request character limit.
function splitIntoChunks(text, maxLen = 200) {
  const sentences = (text.match(/[^.!?\n]+[.!?]*/g) || [text])
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks = [];
  for (const sentence of sentences) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
      continue;
    }
    let remaining = sentence;
    while (remaining.length > maxLen) {
      let cut = remaining.lastIndexOf(",", maxLen);
      if (cut < maxLen * 0.4) cut = remaining.lastIndexOf(" ", maxLen);
      if (cut <= 0) cut = maxLen;
      chunks.push(remaining.slice(0, cut + 1).trim());
      remaining = remaining.slice(cut + 1).trim();
    }
    if (remaining) chunks.push(remaining);
  }
  return chunks;
}

// --- Engine: browser (Web Speech API) --------------------------------------

let germanVoices = [];

function refreshVoiceList() {
  const allVoices = window.speechSynthesis.getVoices();
  germanVoices = allVoices
    .filter((v) => v.lang.toLowerCase().startsWith("de"))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (allVoices.length === 0) return; // voices not loaded yet

  voiceSelect.innerHTML = "";

  if (germanVoices.length === 0) {
    unsupportedSection.hidden = false;
    voiceSelect.disabled = true;
    return;
  }

  const prefs = loadPrefs();
  germanVoices.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})${voice.localService ? "" : " — online"}`;
    voiceSelect.appendChild(option);
  });

  const preferredVoice = germanVoices.find((v) => v.voiceURI === prefs.voiceURI);
  voiceSelect.value = preferredVoice ? preferredVoice.voiceURI : germanVoices[0].voiceURI;
}

if ("speechSynthesis" in window) {
  refreshVoiceList();
  window.speechSynthesis.onvoiceschanged = refreshVoiceList;
} else {
  unsupportedSection.hidden = false;
}

const prefs = loadPrefs();
if (prefs.rate) {
  rateInput.value = prefs.rate;
  rateValue.textContent = Number(prefs.rate).toFixed(2);
}
if (prefs.pitch) {
  pitchInput.value = prefs.pitch;
  pitchValue.textContent = Number(prefs.pitch).toFixed(2);
}

rateInput.addEventListener("input", () => {
  rateValue.textContent = Number(rateInput.value).toFixed(2);
  savePrefs({ rate: rateInput.value });
});

pitchInput.addEventListener("input", () => {
  pitchValue.textContent = Number(pitchInput.value).toFixed(2);
  savePrefs({ pitch: pitchInput.value });
});

voiceSelect.addEventListener("change", () => {
  savePrefs({ voiceURI: voiceSelect.value });
});

// Cancelling mid-speech fires async onend/onerror callbacks from the
// utterance(s) that were in flight — this id lets stale callbacks from a
// superseded speak() recognize they no longer apply, instead of racing with
// (and overwriting) whatever the user just triggered (e.g. Stop).
let browserSessionId = 0;
let browserChunkCount = 0;
let browserFinishedCount = 0;

function browserSpeak(text) {
  window.speechSynthesis.cancel(); // clear any previous queue
  const sessionId = ++browserSessionId;

  const selectedVoice = germanVoices.find((v) => v.voiceURI === voiceSelect.value) || germanVoices[0];
  const chunks = splitIntoChunks(text);
  browserChunkCount = chunks.length;
  browserFinishedCount = 0;

  setStatus(`Spricht… (0/${chunks.length})`);
  setButtonsSpeaking(true, false);

  chunks.forEach((chunk) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice ? selectedVoice.lang : "de-DE";
    utterance.rate = Number(rateInput.value);
    utterance.pitch = Number(pitchInput.value);

    utterance.onend = () => {
      if (sessionId !== browserSessionId) return;
      browserFinishedCount += 1;
      if (browserFinishedCount < chunks.length) {
        setStatus(`Spricht… (${browserFinishedCount}/${chunks.length})`);
      } else {
        setStatus("Fertig.");
        setButtonsSpeaking(false, false);
      }
    };

    utterance.onerror = (e) => {
      if (sessionId !== browserSessionId) return;
      if (e.error === "canceled" || e.error === "interrupted") return;
      setStatus(`Fehler: ${e.error}`);
      setButtonsSpeaking(false, false);
    };

    window.speechSynthesis.speak(utterance);
  });
}

function browserPause() {
  window.speechSynthesis.pause();
  setStatus("Pausiert.");
  setButtonsSpeaking(true, true);
}

function browserResume() {
  window.speechSynthesis.resume();
  setStatus(`Spricht… (${browserFinishedCount}/${browserChunkCount})`);
  setButtonsSpeaking(true, false);
}

function browserStop() {
  browserSessionId += 1; // invalidate any in-flight callbacks from the cancelled utterances
  window.speechSynthesis.cancel();
  setStatus("Gestoppt.");
  setButtonsSpeaking(false, false);
}

// Some browsers (notably Chrome) silently drop the speech queue if the tab
// is backgrounded for a while — reset the UI if that happens.
setInterval(() => {
  if (
    currentEngine === "browser" &&
    !window.speechSynthesis.speaking &&
    !window.speechSynthesis.pending &&
    !stopBtn.disabled
  ) {
    setButtonsSpeaking(false, false);
  }
}, 1000);

// --- Engine: ElevenLabs -----------------------------------------------------

const ELEVENLABS_MAX_CHUNK = 1000;
let elevenlabsVoices = [];
let elevenlabsSessionId = 0;
let currentAudio = null;

function getElevenLabsKey() {
  return elevenlabsKeyInput.value.trim();
}

async function fetchElevenLabsVoices() {
  const apiKey = getElevenLabsKey();
  if (!apiKey) return;

  setStatus("Lade Stimmen…");
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    if (res.status === 401) {
      setStatus("API-Key ungültig.");
      return;
    }
    if (!res.ok) {
      setStatus(`Fehler beim Laden der Stimmen (HTTP ${res.status}).`);
      return;
    }
    const data = await res.json();
    elevenlabsVoices = data.voices || [];

    elevenlabsVoiceSelect.innerHTML = "";
    elevenlabsVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.voice_id;
      option.textContent = voice.name;
      elevenlabsVoiceSelect.appendChild(option);
    });

    const savedVoiceId = loadPrefs().elevenlabsVoiceId;
    const preferred = elevenlabsVoices.find((v) => v.voice_id === savedVoiceId);
    if (preferred) elevenlabsVoiceSelect.value = preferred.voice_id;

    setStatus(elevenlabsVoices.length ? "" : "Keine Stimmen gefunden.");
  } catch (err) {
    setStatus("Netzwerkfehler beim Laden der Stimmen.");
  }
}

async function fetchElevenLabsAudio(text, voiceId, apiKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
    }),
  });

  if (res.status === 401) throw new Error("API-Key ungültig.");
  if (res.status === 429) throw new Error("Kontingent aufgebraucht (Rate Limit).");
  if (!res.ok) throw new Error(`Fehler (HTTP ${res.status}).`);

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function elevenlabsSpeak(text) {
  const apiKey = getElevenLabsKey();
  if (!apiKey) {
    setStatus("Bitte zuerst einen ElevenLabs API-Key eingeben.");
    return;
  }
  const voiceId = elevenlabsVoiceSelect.value;
  if (!voiceId) {
    setStatus("Bitte zuerst eine Stimme laden/auswählen.");
    return;
  }

  const sessionId = ++elevenlabsSessionId;
  const chunks = splitIntoChunks(text, ELEVENLABS_MAX_CHUNK);

  setButtonsSpeaking(true, false);

  for (let i = 0; i < chunks.length; i++) {
    if (sessionId !== elevenlabsSessionId) return; // stopped mid-way

    setStatus(`Lädt Audio… (${i + 1}/${chunks.length})`);
    let audioUrl;
    try {
      audioUrl = await fetchElevenLabsAudio(chunks[i], voiceId, apiKey);
    } catch (err) {
      if (sessionId !== elevenlabsSessionId) return;
      setStatus(err.message || "Fehler beim Laden des Audios.");
      setButtonsSpeaking(false, false);
      return;
    }

    if (sessionId !== elevenlabsSessionId) {
      URL.revokeObjectURL(audioUrl);
      return;
    }

    setStatus(`Spricht… (${i + 1}/${chunks.length})`);
    currentAudio = new Audio(audioUrl);

    try {
      await new Promise((resolve, reject) => {
        currentAudio.onended = resolve;
        currentAudio.onerror = () => reject(new Error("Audio-Wiedergabefehler."));
        currentAudio.play().catch(reject);
      });
    } catch (err) {
      URL.revokeObjectURL(audioUrl);
      if (sessionId !== elevenlabsSessionId) return; // stopped, not a real error
      setStatus(err.message || "Fehler bei der Wiedergabe.");
      setButtonsSpeaking(false, false);
      return;
    }
    URL.revokeObjectURL(audioUrl);
  }

  if (sessionId === elevenlabsSessionId) {
    setStatus("Fertig.");
    setButtonsSpeaking(false, false);
  }
}

function elevenlabsPause() {
  currentAudio?.pause();
  setStatus("Pausiert.");
  setButtonsSpeaking(true, true);
}

function elevenlabsResume() {
  currentAudio?.play();
  setStatus("Spricht…");
  setButtonsSpeaking(true, false);
}

function elevenlabsStop() {
  elevenlabsSessionId += 1; // stop the chunk loop from continuing
  currentAudio?.pause();
  currentAudio = null;
  setStatus("Gestoppt.");
  setButtonsSpeaking(false, false);
}

elevenlabsKeyInput.addEventListener("change", () => {
  savePrefs({ elevenlabsKey: elevenlabsKeyInput.value.trim() });
  fetchElevenLabsVoices();
});

elevenlabsVoiceSelect.addEventListener("change", () => {
  savePrefs({ elevenlabsVoiceId: elevenlabsVoiceSelect.value });
});

const savedElevenLabsKey = loadPrefs().elevenlabsKey;
if (savedElevenLabsKey) {
  elevenlabsKeyInput.value = savedElevenLabsKey;
  fetchElevenLabsVoices();
}

// --- Engine switching --------------------------------------------------------

let currentEngine = "browser";

function stopCurrentEngine() {
  if (currentEngine === "browser") browserStop();
  else elevenlabsStop();
}

engineRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    stopCurrentEngine();
    currentEngine = radio.value;
    browserControls.hidden = currentEngine !== "browser";
    elevenlabsControls.hidden = currentEngine !== "elevenlabs";
    elevenlabsHint.hidden = currentEngine !== "elevenlabs";
    setStatus("");
  });
});

// --- Character count -----------------------------------------------------

textInput.addEventListener("input", () => {
  charCount.textContent = `${textInput.value.length} Zeichen`;
});

// --- Wire up buttons -----------------------------------------------------

speakBtn.addEventListener("click", () => {
  const text = textInput.value.trim();
  if (!text) {
    setStatus("Bitte zuerst Text eingeben.");
    return;
  }
  if (currentEngine === "browser") browserSpeak(text);
  else elevenlabsSpeak(text);
});

pauseBtn.addEventListener("click", () => {
  if (currentEngine === "browser") browserPause();
  else elevenlabsPause();
});

resumeBtn.addEventListener("click", () => {
  if (currentEngine === "browser") browserResume();
  else elevenlabsResume();
});

stopBtn.addEventListener("click", stopCurrentEngine);
