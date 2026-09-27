// German text-to-speech using the browser's built-in Web Speech API
// (speechSynthesis). Free, no backend, no upload — everything runs locally
// in the browser using whatever voices the OS/browser provides.

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

// --- Voice list -------------------------------------------------------

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
    speakBtn.disabled = true;
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
  speakBtn.disabled = true;
}

// --- Rate / pitch -------------------------------------------------------

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

// --- Character count -----------------------------------------------------

textInput.addEventListener("input", () => {
  charCount.textContent = `${textInput.value.length} Zeichen`;
});

// --- Text chunking --------------------------------------------------------
// Chrome silently stops speaking after ~15s on a single long utterance, so
// text is split into shorter chunks and queued as separate utterances —
// speechSynthesis plays consecutive speak() calls back-to-back on its own.

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

// --- Speaking control -----------------------------------------------------

let pendingUtterances = [];
let finishedCount = 0;

function setButtonsSpeaking(isSpeaking, isPaused) {
  speakBtn.disabled = isSpeaking;
  stopBtn.disabled = !isSpeaking;
  pauseBtn.hidden = isPaused;
  pauseBtn.disabled = !isSpeaking || isPaused;
  resumeBtn.hidden = !isPaused;
  resumeBtn.disabled = !isPaused;
}

// Cancelling mid-speech fires async onend/onerror callbacks from the
// utterance(s) that were in flight — this id lets stale callbacks from a
// superseded speak() recognize they no longer apply, instead of racing with
// (and overwriting) whatever the user just triggered (e.g. Stop).
let speechSessionId = 0;

function speak() {
  const text = textInput.value.trim();
  if (!text) {
    setStatus("Bitte zuerst Text eingeben.");
    return;
  }

  window.speechSynthesis.cancel(); // clear any previous queue
  const sessionId = ++speechSessionId;

  const selectedVoice = germanVoices.find((v) => v.voiceURI === voiceSelect.value) || germanVoices[0];
  const chunks = splitIntoChunks(text);
  pendingUtterances = chunks;
  finishedCount = 0;

  setStatus(`Spricht… (0/${chunks.length})`);
  setButtonsSpeaking(true, false);

  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.voice = selectedVoice;
    utterance.lang = selectedVoice ? selectedVoice.lang : "de-DE";
    utterance.rate = Number(rateInput.value);
    utterance.pitch = Number(pitchInput.value);

    utterance.onend = () => {
      if (sessionId !== speechSessionId) return;
      finishedCount += 1;
      if (finishedCount < chunks.length) {
        setStatus(`Spricht… (${finishedCount}/${chunks.length})`);
      } else {
        setStatus("Fertig.");
        setButtonsSpeaking(false, false);
      }
    };

    utterance.onerror = (e) => {
      if (sessionId !== speechSessionId) return;
      if (e.error === "canceled" || e.error === "interrupted") return;
      setStatus(`Fehler: ${e.error}`);
      setButtonsSpeaking(false, false);
    };

    window.speechSynthesis.speak(utterance);
  });
}

function pause() {
  window.speechSynthesis.pause();
  setStatus("Pausiert.");
  setButtonsSpeaking(true, true);
}

function resume() {
  window.speechSynthesis.resume();
  setStatus(`Spricht… (${finishedCount}/${pendingUtterances.length})`);
  setButtonsSpeaking(true, false);
}

function stop() {
  speechSessionId += 1; // invalidate any in-flight callbacks from the cancelled utterances
  window.speechSynthesis.cancel();
  setStatus("Gestoppt.");
  setButtonsSpeaking(false, false);
}

speakBtn.addEventListener("click", speak);
pauseBtn.addEventListener("click", pause);
resumeBtn.addEventListener("click", resume);
stopBtn.addEventListener("click", stop);

// Some browsers (notably Chrome) silently drop the speech queue if the tab
// is backgrounded for a while — reset the UI if that happens.
setInterval(() => {
  if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending && !stopBtn.disabled) {
    setButtonsSpeaking(false, false);
  }
}, 1000);
