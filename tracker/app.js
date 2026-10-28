/* Weekly tracker.
   Ticks stay in localStorage, one key per Monday:
     jw-tracker:YYYY-MM-DD → { ticks: { "<row>:<date>": true }, dinner: { "<date>": true } }
   Settings stay on this device under jw-tracker:settings and are never uploaded.
   The week is Monday–Sunday in Asia/Singapore.
   Paths are relative so this folder can be copied to the root of a site. */

const CONFIG = {
  tz: "Asia/Singapore",
  storagePrefix: "jw-tracker:",
  settingsKey: "jw-tracker:settings",
  flashcardsUrl: "https://orientalfriedrice.github.io/spanish-concepts/"
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEGEND = [
  ["morning", "Morning"],
  ["commute", "Commute"],
  ["flash", "Flashcards"],
  ["worldly", "Lesson"],
  ["evening", "Evening"],
  ["zoom", "Zoom"],
  ["film", "Film"],
  ["sleep", "Sleep"]
];

const ROWS = [
  { id: "wake", label: "Alarm", category: "sleep", text: "Alarm" },
  { id: "pimsleur", label: "Morning Spanish", category: "morning", text: "Episode" },
  { id: "dreaming", label: "Spanish video", category: "morning", text: "Video" },
  { id: "transfer", label: "Commute", vary: "transfer" },
  { id: "flash", label: "Flashcards", category: "flash", text: "Cards", link: true },
  { id: "worldly", label: "Lesson", category: "worldly", text: "Lesson" },
  { id: "evening", label: "Evening", vary: "evening" },
  { id: "bed", label: "Bed", category: "sleep", text: "Lights out" }
];

const HINT_KEY = CONFIG.storagePrefix + "hint";
const CONFETTI_COUNT = 180;
const LONG_PRESS_MS = 600;
const DEFAULT_NAME = "My Week";

const $ = (id) => document.getElementById(id);
const board = $("board");
const grid = $("grid");
const settingsDialog = $("settings");

let viewMonday = mondayOf(todayISO());
let knownToday = todayISO();
let stickToCurrent = true;
let press = null;
let suppressClick = false;
let settings = loadSettings();

function parts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function addDays(iso, n) {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return dt.getUTCFullYear() + "-" + mm + "-" + dd;
}

function mondayOf(iso) {
  const { y, m, d } = parts(iso);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const delta = wd === 0 ? -6 : 1 - wd;
  return addDays(iso, delta);
}

function todayISO() {
  const bits = new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const get = (type) => bits.find((p) => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

function isoOk(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const { y, m, d } = parts(value);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function formatRange(monday) {
  const sun = addDays(monday, 6);
  const a = parts(monday);
  const b = parts(sun);
  const left = "Mon " + a.d + " " + MONTHS[a.m - 1];
  const right = "Sun " + b.d + " " + MONTHS[b.m - 1];
  if (a.y === b.y) return left + " to " + right + " " + a.y;
  return left + " " + a.y + " to " + right + " " + b.y;
}

function ariaWhen(iso) {
  const { y, m, d } = parts(iso);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

function defaultSettings() {
  return { name: "", times: {}, away: [], zoomUntil: "", films: {} };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(CONFIG.settingsKey);
    if (!raw) return defaultSettings();
    const data = JSON.parse(raw);
    const times = {};
    if (data.times && typeof data.times === "object") {
      for (const row of ROWS) {
        const value = data.times[row.id];
        if (typeof value === "string" && value.trim()) times[row.id] = value.trim();
      }
    }
    const away = [];
    if (Array.isArray(data.away)) {
      for (const range of data.away) {
        if (!range || !isoOk(range.start) || !isoOk(range.end)) continue;
        const start = range.start <= range.end ? range.start : range.end;
        const end = range.start <= range.end ? range.end : range.start;
        away.push({ start, end });
      }
    }
    const films = {};
    if (data.films && typeof data.films === "object") {
      for (const [date, title] of Object.entries(data.films)) {
        if (isoOk(date) && typeof title === "string" && title.trim()) films[date] = title.trim();
      }
    }
    return {
      name: typeof data.name === "string" ? data.name.trim() : "",
      times,
      away,
      zoomUntil: isoOk(data.zoomUntil) ? data.zoomUntil : "",
      films
    };
  } catch (err) {
    return defaultSettings();
  }
}

function isAway(iso) {
  return settings.away.some((range) => iso >= range.start && iso <= range.end);
}

function eveningTask(iso, dow) {
  const title = dow === 5 && typeof settings.films[iso] === "string" ? settings.films[iso] : "";
  if (dow === 5) {
    const subs = title ? [{ t: title, strong: true }] : [];
    return { text: "Film night", subs, category: "film" };
  }
  if (settings.zoomUntil && (dow === 1 || dow === 3) && iso <= settings.zoomUntil) {
    return { text: "Zoom", subs: [], category: "zoom" };
  }
  return { text: "Evening", subs: [], category: "evening" };
}

function taskFor(row, iso, dow) {
  if (row.vary === "evening") return eveningTask(iso, dow);
  if (row.vary === "transfer") return { text: "Commute", subs: [], category: "commute" };
  const subs = row.sub ? [{ t: row.sub }] : [];
  return { text: row.text, subs, category: row.category, link: !!row.link };
}

function weekKey(monday) {
  return CONFIG.storagePrefix + monday;
}

function loadWeek(monday) {
  try {
    const raw = localStorage.getItem(weekKey(monday));
    if (!raw) return { ticks: {}, dinner: {} };
    const data = JSON.parse(raw);
    return { ticks: data.ticks || {}, dinner: data.dinner || {} };
  } catch (err) {
    return { ticks: {}, dinner: {} };
  }
}

function saveWeek(monday, data) {
  const empty = !Object.keys(data.ticks).length && !Object.keys(data.dinner).length;
  try {
    if (empty) localStorage.removeItem(weekKey(monday));
    else localStorage.setItem(weekKey(monday), JSON.stringify({ ticks: data.ticks, dinner: data.dinner }));
  } catch (err) {}
}

function applyName() {
  const name = settings.name || DEFAULT_NAME;
  $("app-name").textContent = name;
  document.title = name;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else node.setAttribute(key, value);
    }
  }
  for (const child of children || []) if (child) node.append(child);
  return node;
}

function checkMark() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M3.2 8.3 6.4 11.4 12.8 4.6");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.3");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.append(path);
  return svg;
}

function buildChip(row, iso, dow, on) {
  const task = taskFor(row, iso, dow);
  const chip = el("div", { class: "chip" + (on ? " on" : ""), "data-cat": task.category, "data-row": row.id, "data-date": iso });
  const described = [task.text].concat(task.subs.map((s) => s.t)).join(", ");
  const button = el("button", {
    class: "hit",
    type: "button",
    "aria-pressed": on ? "true" : "false",
    "aria-label": (on ? "Done. " : "Not done. ") + described + ", " + row.label + ", " + ariaWhen(iso)
  });
  button.append(el("span", { class: "t", text: task.text }));
  for (const sub of task.subs) button.append(el("span", { class: sub.strong ? "s strong" : "s", text: sub.t }));
  chip.append(button);
  if (task.link) {
    chip.append(el("a", {
      class: "deck",
      href: CONFIG.flashcardsUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      text: "Open deck"
    }));
  }
  chip.append(el("span", { class: "tick", "aria-hidden": "true" }, [checkMark()]));
  return chip;
}

function render(opts) {
  opts = opts || {};
  const today = todayISO();
  const currentMonday = mondayOf(today);
  $("range").textContent = formatRange(viewMonday);
  $("jump").hidden = viewMonday === currentMonday;
  const data = loadWeek(viewMonday);
  const keep = opts.keepScroll;
  grid.replaceChildren();

  grid.append(el("div", { class: "corner sticky", role: "presentation" }));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(viewMonday, i);
    days.push(iso);
    const away = isAway(iso);
    const head = el("div", {
      class: "dayhead" + (i >= 5 ? " weekend" : "") + (iso === today ? " is-today" : "") + (away ? " is-away" : ""),
      role: "columnheader"
    });
    head.append(el("span", { class: "dow", text: DOWS[i] }));
    const dom = el("span", { class: "dom" });
    dom.append(String(parts(iso).d));
    dom.append(el("small", { text: MONTHS[parts(iso).m - 1] }));
    head.append(dom);
    if (away) head.append(el("span", { class: "away-note", text: "Away" }));
    grid.append(head);
  }

  for (const row of ROWS) {
    const label = el("div", { class: "rowlabel sticky", role: "rowheader" });
    label.append(el("span", { class: "name", text: row.label }));
    const time = (settings.times[row.id] || "").trim();
    if (time) label.append(el("span", { class: "time", text: time }));
    grid.append(label);
    for (let i = 0; i < 7; i++) {
      const iso = days[i];
      const away = isAway(iso);
      const dinner = row.vary === "evening" && !away && !!data.dinner[iso];
      const cell = el("div", {
        class: "cell" + (row.vary === "evening" ? " evening" : "") + (iso === today ? " is-today" : "") + (away ? " is-away" : "") + (dinner ? " is-dinner" : ""),
        role: "gridcell"
      });
      cell.dataset.date = iso;
      cell.dataset.row = row.id;
      if (dinner) {
        cell.setAttribute("aria-label", "Dinner night, " + ariaWhen(iso) + ". Hold to restore the evening task.");
      } else if (!away) {
        cell.append(buildChip(row, iso, i, !!data.ticks[row.id + ":" + iso]));
      }
      grid.append(cell);
    }
  }

  requestAnimationFrame(() => {
    if (keep != null) board.scrollLeft = keep;
    else scrollTodayIntoView();
  });
}

function scrollTodayIntoView() {
  const head = grid.querySelector(".dayhead.is-today");
  if (!head) {
    board.scrollLeft = 0;
    return;
  }
  const labelWidth = grid.querySelector(".corner").getBoundingClientRect().width;
  const boardRect = board.getBoundingClientRect();
  const headRect = head.getBoundingClientRect();
  const visibleLeft = boardRect.left + labelWidth + 2;
  const visibleRight = boardRect.right - 2;
  if (headRect.left < visibleLeft) board.scrollLeft += headRect.left - visibleLeft;
  else if (headRect.right > visibleRight) board.scrollLeft += headRect.right - visibleRight + 6;
}

function toggleTick(rowId, iso) {
  const data = loadWeek(viewMonday);
  const key = rowId + ":" + iso;
  const on = !data.ticks[key];
  if (on) data.ticks[key] = true;
  else delete data.ticks[key];
  saveWeek(viewMonday, data);
  const chip = grid.querySelector('.chip[data-row="' + rowId + '"][data-date="' + iso + '"]');
  if (!chip) return;
  chip.classList.toggle("on", on);
  const button = chip.querySelector("button");
  button.setAttribute("aria-pressed", on ? "true" : "false");
  const label = button.getAttribute("aria-label").replace(/^Done\. /, "").replace(/^Not done\. /, "");
  button.setAttribute("aria-label", (on ? "Done. " : "Not done. ") + label);
  if (on) {
    chip.classList.remove("pop");
    void chip.offsetWidth;
    chip.classList.add("pop");
    burst();
  }
}

function toggleDinner(iso) {
  const data = loadWeek(viewMonday);
  if (data.dinner[iso]) delete data.dinner[iso];
  else data.dinner[iso] = true;
  saveWeek(viewMonday, data);
  const hint = $("hint");
  if (!hint.hidden) hint.hidden = true;
  try { localStorage.setItem(HINT_KEY, "1"); } catch (err) {}
  render({ keepScroll: board.scrollLeft });
}

function shiftWeek(delta) {
  viewMonday = addDays(viewMonday, delta);
  stickToCurrent = viewMonday === mondayOf(todayISO());
  render();
}

function onMaybeNewDay() {
  const today = todayISO();
  if (today === knownToday) return;
  const previousMonday = mondayOf(knownToday);
  knownToday = today;
  const nextMonday = mondayOf(today);
  if (stickToCurrent && previousMonday !== nextMonday) {
    viewMonday = nextMonday;
    render();
    return;
  }
  if (viewMonday === previousMonday || viewMonday === nextMonday) render({ keepScroll: board.scrollLeft });
}

function buildLegend() {
  const list = $("legend");
  list.replaceChildren();
  for (const [id, name] of LEGEND) {
    const item = el("li");
    item.append(el("i", { class: "sw-" + id, "aria-hidden": "true" }));
    item.append(document.createTextNode(name));
    list.append(item);
  }
}

function showHintOnce() {
  const hint = $("hint");
  let seen = false;
  try { seen = localStorage.getItem(HINT_KEY) === "1"; } catch (err) { seen = true; }
  if (seen) {
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
  try { localStorage.setItem(HINT_KEY, "1"); } catch (err) {}
}

function addAwayRow(start, end) {
  const row = el("div", { class: "pair" });
  const from = el("input", { type: "date", class: "away-start", "aria-label": "Away start" });
  const to = el("input", { type: "date", class: "away-end", "aria-label": "Away end" });
  if (start) from.value = start;
  if (end) to.value = end;
  const remove = el("button", { type: "button", class: "iconx", "aria-label": "Remove range", text: "×" });
  remove.addEventListener("click", () => row.remove());
  row.append(from, to, remove);
  $("set-away").append(row);
}

function addFilmRow(date, title) {
  const row = el("div", { class: "film-block" });
  const top = el("div", { class: "pair" });
  const when = el("input", { type: "date", class: "film-date", "aria-label": "Saturday" });
  const name = el("input", { type: "text", class: "film-title", maxlength: "80", placeholder: "Title", autocomplete: "off", "aria-label": "Film title" });
  if (date) when.value = date;
  if (title) name.value = title;
  const remove = el("button", { type: "button", class: "iconx", "aria-label": "Remove film", text: "×" });
  remove.addEventListener("click", () => row.remove());
  top.append(when, remove);
  row.append(top, name);
  $("set-films").append(row);
}

function fillSettingsForm() {
  $("set-name").value = settings.name || "";
  $("set-zoom").value = settings.zoomUntil || "";
  const times = $("set-times");
  times.replaceChildren();
  for (const row of ROWS) {
    const label = el("label", { class: "time-row" });
    label.append(el("span", { text: row.label }));
    const input = el("input", {
      type: "text",
      "data-row": row.id,
      maxlength: "32",
      placeholder: "Optional",
      autocomplete: "off",
      "aria-label": row.label + " time"
    });
    input.value = settings.times[row.id] || "";
    label.append(input);
    times.append(label);
  }
  $("set-away").replaceChildren();
  for (const range of settings.away) addAwayRow(range.start, range.end);
  $("set-films").replaceChildren();
  const filmDates = Object.keys(settings.films).sort();
  for (const date of filmDates) addFilmRow(date, settings.films[date]);
}

function openSettings() {
  fillSettingsForm();
  if (typeof settingsDialog.showModal === "function") settingsDialog.showModal();
  else settingsDialog.setAttribute("open", "");
}

function closeSettings() {
  if (typeof settingsDialog.close === "function" && settingsDialog.open) settingsDialog.close();
  else settingsDialog.removeAttribute("open");
}

function saveSettingsFromForm() {
  const next = defaultSettings();
  next.name = $("set-name").value.trim();
  const zoom = $("set-zoom").value;
  next.zoomUntil = isoOk(zoom) ? zoom : "";
  for (const input of $("set-times").querySelectorAll("input")) {
    const value = input.value.trim();
    if (value) next.times[input.dataset.row] = value;
  }
  for (const row of $("set-away").querySelectorAll(".pair")) {
    let start = row.querySelector(".away-start").value;
    let end = row.querySelector(".away-end").value;
    if (!isoOk(start) || !isoOk(end)) continue;
    if (start > end) {
      const swap = start;
      start = end;
      end = swap;
    }
    next.away.push({ start, end });
  }
  for (const row of $("set-films").querySelectorAll(".film-block")) {
    const date = row.querySelector(".film-date").value;
    const title = row.querySelector(".film-title").value.trim();
    if (!isoOk(date) || !title) continue;
    next.films[date] = title;
  }
  try { localStorage.setItem(CONFIG.settingsKey, JSON.stringify(next)); } catch (err) {}
  settings = loadSettings();
  applyName();
  buildLegend();
  render({ keepScroll: board.scrollLeft });
  closeSettings();
}

/* ---------- confetti ---------- */
const canvas = $("confetti");
const ctx = canvas.getContext("2d");
const CONFETTI_COLORS = ["#ff7a3c", "#ff5d73", "#2dd4bf", "#fb7185", "#fbbf24", "#a78bfa", "#60a5fa", "#e879f9", "#ffffff", "#fde68a", "#c4b5fd", "#5eead4"];
let pieces = [];
let confettiOn = false;
let confettiLast = 0;

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function burst() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  sizeCanvas();
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight - 4;
  const now = performance.now();
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const u = Math.random() * 2 - 1;
    const dir = Math.sign(u) * Math.pow(Math.abs(u), 0.8) * 1.28;
    const angle = -Math.PI / 2 + dir;
    const speed = 780 + Math.random() * 1450;
    pieces.push({
      x: cx + (Math.random() - 0.5) * 36,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      g: 1180 + Math.random() * 460,
      drag: 0.45 + Math.random() * 0.7,
      w: 5 + Math.random() * 7,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 16,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      circle: Math.random() < 0.16,
      born: now + Math.random() * 40,
      wobble: Math.random() * Math.PI * 2
    });
  }
  if (!confettiOn) {
    confettiOn = true;
    confettiLast = performance.now();
    requestAnimationFrame(drawConfetti);
  }
}

function drawConfetti(now) {
  const dt = Math.min(0.034, (now - confettiLast) / 1000);
  confettiLast = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  pieces = pieces.filter((p) => now - p.born < 3000);
  for (const p of pieces) {
    if (now < p.born) continue;
    const age = (now - p.born) / 1000;
    p.vy += p.g * dt;
    p.vx *= Math.exp(-p.drag * dt);
    p.x += p.vx * dt + Math.sin(age * 10 + p.wobble) * 22 * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    const life = (now - p.born) / 3000;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = life < 0.6 ? 1 : Math.max(0, 1 - (life - 0.6) / 0.4);
    ctx.fillStyle = p.color;
    if (p.circle) {
      ctx.beginPath();
      ctx.arc(0, 0, p.w * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  if (pieces.length) requestAnimationFrame(drawConfetti);
  else {
    confettiOn = false;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

/* ---------- gestures ---------- */
grid.addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const button = event.target.closest("button.hit");
  if (!button) return;
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const chip = button.closest(".chip");
  toggleTick(chip.dataset.row, chip.dataset.date);
});

grid.addEventListener("pointerdown", (event) => {
  const cell = event.target.closest(".cell.evening");
  if (!cell || cell.classList.contains("is-away")) return;
  if (event.target.closest("a")) return;
  if (event.button != null && event.button !== 0) return;
  clearTimeout(press && press.timer);
  press = {
    date: cell.dataset.date,
    x: event.clientX,
    y: event.clientY,
    fired: false,
    timer: setTimeout(() => {
      if (!press) return;
      press.fired = true;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 700);
      toggleDinner(press.date);
    }, LONG_PRESS_MS)
  };
});

function endPress(event) {
  if (!press) return;
  if (event && press.fired === false && event.type === "pointermove") {
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (Math.hypot(dx, dy) <= 12) return;
  }
  clearTimeout(press.timer);
  press = null;
}

grid.addEventListener("pointerup", endPress);
grid.addEventListener("pointercancel", endPress);
grid.addEventListener("pointerleave", endPress);
grid.addEventListener("pointermove", endPress);
grid.addEventListener("contextmenu", (event) => event.preventDefault());

grid.addEventListener("keydown", (event) => {
  const button = event.target.closest("button.hit");
  if (!button) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const chip = button.closest(".chip");
  toggleTick(chip.dataset.row, chip.dataset.date);
});

$("prev").addEventListener("click", () => shiftWeek(-7));
$("next").addEventListener("click", () => shiftWeek(7));
$("jump").addEventListener("click", () => {
  viewMonday = mondayOf(todayISO());
  stickToCurrent = true;
  render();
});

$("open-settings").addEventListener("click", openSettings);
$("close-settings").addEventListener("click", closeSettings);
$("save-settings").addEventListener("click", saveSettingsFromForm);
$("add-away").addEventListener("click", () => addAwayRow("", ""));
$("add-film").addEventListener("click", () => addFilmRow("", ""));
$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettingsFromForm();
});
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) closeSettings();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) onMaybeNewDay();
});
setInterval(onMaybeNewDay, 30000);
window.addEventListener("resize", () => {
  if (confettiOn) sizeCanvas();
});

applyName();
buildLegend();
showHintOnce();
render();

if ("serviceWorker" in navigator && location.search.indexOf("nosw=1") === -1) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
  });
}
