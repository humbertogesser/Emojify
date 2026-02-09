const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file");
const processBtn = document.getElementById("process");
const statusEl = document.getElementById("status");
const fpsInput = document.getElementById("fps");
const sizeInput = document.getElementById("size");
const formatSelect = document.getElementById("format");
const presetSelect = document.getElementById("preset");
const queueList = document.getElementById("queue");
const dropTitle = document.getElementById("drop-title");
const dropSub = document.getElementById("drop-sub");
const fpsControl = document.getElementById("fps-control");
const presetControl = document.getElementById("preset-control");
const liveToggleBtn = document.getElementById("live-toggle");
const liveStatus = document.getElementById("live-status");
const livePreview = document.getElementById("live-preview");
const liveSizeInput = document.getElementById("live-size");
const liveBlockInput = document.getElementById("live-block");

let selectedFile = null;
const jobs = [];
let liveRunning = false;

const presets = {
  custom: null,
  fast: { fps: 10, size: 16 },
  balanced: { fps: 8, size: 12 },
  detail: { fps: 5, size: 8 },
};

function setStatus(text) {
  statusEl.textContent = text;
}

function setBusy(isBusy) {
  processBtn.disabled = isBusy;
  fileInput.disabled = isBusy;
}

function currentMediaKind(file) {
  if (!file) return "unknown";
  if ((file.type || "").startsWith("image/")) return "image";
  if ((file.type || "").startsWith("video/")) return "video";
  const name = file.name.toLowerCase();
  if (/\.(png|jpe?g|webp)$/.test(name)) return "image";
  if (/\.(mp4|mov|m4v|avi|mkv|webm)$/.test(name)) return "video";
  return "unknown";
}

function refreshFormForFile(file) {
  const kind = currentMediaKind(file);
  if (kind === "image") {
    dropTitle.textContent = "Drop image here";
    dropSub.textContent = "or click to pick an image file";
    formatSelect.innerHTML = `
      <option value="png">PNG</option>
      <option value="jpg">JPG</option>
    `;
    fpsControl.style.display = "none";
    presetControl.style.display = "none";
  } else {
    dropTitle.textContent = "Drop video here";
    dropSub.textContent = "or click to pick a file";
    formatSelect.innerHTML = `
      <option value="mp4">MP4</option>
      <option value="gif">GIF</option>
    `;
    fpsControl.style.display = "";
    presetControl.style.display = "";
  }
}

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  const [file] = e.dataTransfer.files;
  if (file) {
    selectedFile = file;
    refreshFormForFile(file);
    setStatus(`Selected: ${file.name}`);
  }
});

fileInput.addEventListener("change", (e) => {
  const [file] = e.target.files;
  if (file) {
    selectedFile = file;
    refreshFormForFile(file);
    setStatus(`Selected: ${file.name}`);
  }
});

processBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    setStatus("Choose a video or image first.");
    return;
  }

  const kind = currentMediaKind(selectedFile);
  if (kind === "unknown") {
    setStatus("Unsupported file type.");
    return;
  }

  if (kind === "video") {
    const preset = presetSelect.value;
    if (preset !== "custom") {
      const values = presets[preset];
      fpsInput.value = values.fps;
      sizeInput.value = values.size;
    }
  }

  const formData = new FormData();
  formData.append("media", selectedFile);
  formData.append("fps", fpsInput.value);
  formData.append("size", sizeInput.value);
  formData.append("format", formatSelect.value);

  setBusy(true);
  setStatus("Queued...");

  try {
    const response = await fetch("/process", { method: "POST", body: formData });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "Processing failed");
    }

    const { job_id } = await response.json();
    addJob(job_id, selectedFile.name, formatSelect.value);
    setStatus("Queued. You can add more files.");
  } catch (err) {
    setStatus(err.message || "Something went wrong.");
  } finally {
    setBusy(false);
  }
});

presetSelect.addEventListener("change", () => {
  const preset = presetSelect.value;
  if (preset === "custom") return;
  const values = presets[preset];
  fpsInput.value = values.fps;
  sizeInput.value = values.size;
});

function addJob(id, name, format) {
  const item = document.createElement("div");
  item.className = "queue-item";
  item.dataset.jobId = id;
  item.innerHTML = `
    <div class="queue-name">${name}</div>
    <div class="queue-progress">
      <div class="bar"><span></span></div>
      <div class="label">Queued</div>
    </div>
    <button class="download" disabled>Download</button>
  `;
  queueList.prepend(item);
  jobs.push({ id, element: item, format });
  pollJob(id);
}

async function pollJob(id) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  const label = job.element.querySelector(".label");
  const bar = job.element.querySelector(".bar span");
  const download = job.element.querySelector(".download");

  try {
    const res = await fetch(`/status/${id}`);
    if (!res.ok) throw new Error("status failed");
    const data = await res.json();
    label.textContent = data.message || data.status;
    bar.style.width = `${data.progress || 0}%`;

    if (data.status === "done") {
      download.disabled = false;
      download.addEventListener("click", () => {
        window.location.href = `/download/${id}`;
      });
      return;
    }
    if (data.status === "error") {
      label.textContent = "Error";
      return;
    }
  } catch (err) {
    label.textContent = "Error";
    return;
  }

  setTimeout(() => pollJob(id), 2000);
}

function setLiveStatus(text) {
  if (liveStatus) liveStatus.textContent = text;
}

function startLive() {
  if (!liveToggleBtn || !livePreview || !liveSizeInput || !liveBlockInput) return;
  const size = Math.max(4, Math.min(48, parseInt(liveSizeInput.value || "12", 10)));
  const maxBlock = Math.max(1, Math.min(20, parseInt(liveBlockInput.value || "8", 10)));
  const url = `/live_stream?size=${size}&max_block=${maxBlock}&t=${Date.now()}`;

  liveRunning = true;
  liveToggleBtn.textContent = "Stop live webcam";
  livePreview.src = url;
  setLiveStatus("Starting live stream...");
}

function stopLive() {
  if (!liveToggleBtn || !livePreview) return;
  liveRunning = false;
  liveToggleBtn.textContent = "Start live webcam";
  livePreview.removeAttribute("src");
}

if (liveToggleBtn) {
  liveToggleBtn.addEventListener("click", () => {
    if (liveRunning) {
      stopLive();
      setLiveStatus("Live stream stopped.");
      return;
    }
    startLive();
  });
}

if (livePreview) {
  livePreview.addEventListener("load", () => {
    if (!liveRunning) return;
    setLiveStatus("Live stream running.");
  });

  livePreview.addEventListener("error", () => {
    if (!liveRunning) return;
    setLiveStatus("Could not start webcam stream. Close apps that are using the camera and try again.");
    stopLive();
  });
}
