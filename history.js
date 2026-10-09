// ============================================================
// HISTORY PAGE  (READ / UPDATE / DELETE on IndexedDB workouts)
// ============================================================

import {
    getWorkouts,
    updateWorkout,
    deleteWorkout,
    getSetting,
    setSetting,
    getCurrentUser
} from "./db.js";

const $ = (id) => document.getElementById(id);

const NAMES = { squat: "Squat", "bicep-curl": "Bicep curl" };

let all = [];
let filter = getSetting("historyFilter", "all");
let editingId = null;
let deletingId = null;

const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const verdictOf = (s) =>
    s >= 90 ? "Excellent" : s >= 75 ? "Good" : s >= 60 ? "Fair" : "Needs work";

const isPositive = (t) => /^(good|great|excellent)\b/i.test(t);

const tierOf = (s) => (s >= 75 ? "high" : s >= 60 ? "mid" : "low");

const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

const shortDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });


// ---------- load ----------

async function load() {
    all = await getWorkouts();
    render();
}


// ---------- render ----------

function render() {

    const list = filter === "all" ? all : all.filter((w) => w.exercise === filter);

    $("filterSelect").value = filter;
    document.querySelectorAll("#histSeg [data-f]").forEach((b) => {
        const on = b.dataset.f === filter;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-selected", String(on));
    });

    const user = getCurrentUser();
    $("histNote").textContent = user
        ? `Signed in as ${user.name}`
        : "Saved on this device. Log in to keep your history with an account.";

    const empty = list.length === 0;

    $("histContent").hidden = empty;
    $("histEmpty").hidden = !empty;

    if (empty) {
        $("emptyLogin").hidden = !!user;   // guests only
        const spot = $("histSpot");
        if (spot) spot.innerHTML = "";   // clear stale numbers (an empty card is hidden by CSS)

        $("emptyText").innerHTML = all.length
            ? "No sessions match this exercise filter."
            : "Analyze a video and press <b>Save workout</b>. It will show up here.";
        return;
    }

    renderStats(list);
    renderSpotlight(list);
    renderChart(list);
    renderList(list);
}

function countUp(el, target, decimals) {

    if (target === null) { el.textContent = "—"; return; }

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        el.textContent = target.toFixed(decimals);
        return;
    }

    const start = performance.now();

    (function frame(now) {
        const t = Math.min((now - start) / 900, 1);
        el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(decimals);
        if (t < 1) requestAnimationFrame(frame);
    })(start);
}

function renderSpotlight(list) {

    const box = $("histSpot");
    const latest = list[0];

    if (!box || !latest) return;

    const score = Number.isFinite(latest.formScore) ? latest.formScore : null;
    const same = all.filter((x) => x.exercise === latest.exercise);
    const prev = same[same.findIndex((x) => x.id === latest.id) + 1];
    const diff = score !== null && prev && Number.isFinite(prev.formScore) ? score - prev.formScore : null;

    const weekAgo = Date.now() - 7 * 864e5;
    const thisWeek = list.filter((w) => new Date(w.date).getTime() >= weekAgo).length;
    const scores = list.map((w) => w.formScore).filter(Number.isFinite);

    box.innerHTML = `
        <span class="hist-label">Latest session</span>
        <div class="hist-spot-row">
            <strong>${score !== null ? score.toFixed(1) : "—"}</strong>
            <div>
                <b>${score !== null ? verdictOf(score) : ""}</b>
                <small>${diff === null || Math.abs(diff) < 0.05 ? fmtDate(latest.date)
            : `${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)} vs last`}</small>
            </div>
        </div>
        <div class="hist-spot-foot">
            <span><b>${thisWeek}</b> this week</span>
            <span><b>${scores.length ? Math.max(...scores).toFixed(1) : "—"}</b> best</span>
        </div>`;
}

function renderStats(list) {

    const scores = list.map((w) => w.formScore).filter(Number.isFinite);
    const reps = list.reduce((sum, w) => sum + (w.repCount || 0), 0);

    countUp($("statSessions"), list.length, 0);
    countUp($("statReps"), reps, 0);
    countUp($("statAvg"), scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null, 1);
    countUp($("statBest"), scores.length ? Math.max(...scores) : null, 1);
}

function renderChart(list) {

    const data = [...list].reverse().filter((w) => Number.isFinite(w.formScore));

    $("chartRange").textContent = data.length
        ? (shortDate(data[0].date) === shortDate(data[data.length - 1].date)
            ? shortDate(data[0].date)
            : `${shortDate(data[0].date)} – ${shortDate(data[data.length - 1].date)}`)
        : "";

    if (data.length < 2) {
        $("chart").innerHTML = `
        <p class="c-one">
            <b>Your first session is saved.</b><br>
            Save one more and your trend line will appear here.
        </p>`;
        return;
    }

    const W = 800, H = 240, L = 36, R = 20, T = 20, B = 32;

    const scores = data.map((w) => w.formScore);
    const lo = Math.max(0, Math.floor((Math.min(...scores) - 8) / 10) * 10);
    const hi = Math.min(100, Math.ceil((Math.max(...scores) + 4) / 10) * 10);

    const x = (i) => L + (i / (data.length - 1)) * (W - L - R);
    const y = (v) => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B);

    const pts = data.map((w, i) => [x(i), y(w.formScore)]);

    // smooth curve through the points
    const curve = pts.map((p, i) => {
        if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
        const mx = ((pts[i - 1][0] + p[0]) / 2).toFixed(1);
        return `C${mx},${pts[i - 1][1].toFixed(1)} ${mx},${p[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    }).join(" ");

    const area = `${curve} L${x(data.length - 1)},${H - B} L${L},${H - B} Z`;

    const grid = [lo, (lo + hi) / 2, hi].map((t) =>
        `<line class="c-grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>
         <text class="c-txt" x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`
    ).join("");

    // if every session is on the same day, label with the time instead
    const sameDay = new Set(data.map((w) => shortDate(w.date))).size < data.length;
    const label = (w) => sameDay
        ? new Date(w.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
        : shortDate(w.date);

    const step = Math.ceil(data.length / 6);

    const labels = data.map((w, i) =>
        i % step === 0 || i === data.length - 1
            ? `<text class="c-txt" x="${x(i)}" y="${H - 8}" text-anchor="middle">${label(w)}</text>`
            : ""
    ).join("");

    const best = Math.max(...scores);
    const bestLine = `
        <line class="c-best" x1="${L}" x2="${W - R}" y1="${y(best)}" y2="${y(best)}"/>
        <text class="c-txt c-best-txt" x="${L + 16}" y="${y(best) - 12}" text-anchor="start">Personal best ${best.toFixed(1)}</text>`;

    const last = data.length - 1;

    const dots = data.map((w, i) => {
        const tip = `<title>${esc(w.title || NAMES[w.exercise])}: ${w.formScore} (${fmtDate(w.date)})</title>`;
        return i === last
            ? `<circle class="c-halo" cx="${x(i)}" cy="${y(w.formScore)}" r="14"/>
               <circle class="c-dot c-dot-last" cx="${x(i)}" cy="${y(w.formScore)}" r="7">${tip}</circle>`
            : `<circle class="c-dot" cx="${x(i)}" cy="${y(w.formScore)}" r="5.5">${tip}</circle>`;
    }).join("");

    $("chart").innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Form score over time">
            <defs>
                <linearGradient id="hFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#97D3CD" stop-opacity="0.5"/>
                    <stop offset="100%" stop-color="#97D3CD" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${grid}
            ${bestLine}
            <path d="${area}" fill="url(#hFill)"/>
            <path class="c-line" d="${curve}"/>
            ${dots}${labels}
        </svg>`;
}

function renderList(list) {

    $("histList").innerHTML = list.map((w, index) => {

        const score = Number.isFinite(w.formScore) ? w.formScore : null;

        // change versus the previous session of the same exercise
        const sameExercise = all.filter((x) => x.exercise === w.exercise);
        const prev = sameExercise[sameExercise.findIndex((x) => x.id === w.id) + 1];
        const diff = score !== null && prev && Number.isFinite(prev.formScore)
            ? score - prev.formScore
            : null;

        const delta = diff === null || Math.abs(diff) < 0.05
            ? ""
            : `<span class="hist-delta ${diff > 0 ? "up" : Math.abs(diff) < 1.5 ? "flat" : "down"}">${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)} vs last</span>`;

        const repChips = (w.reps || [])
            .map((r) => `<span>Rep ${esc(r.repNumber)} · ${Number.isFinite(r.formScore) ? Math.round(r.formScore) : "–"}</span>`)
            .join("");

        const focus = (w.reps || [])
            .flatMap((r) => r.feedback || [])
            .find((t) => typeof t === "string" && !isPositive(t));

        const time = new Date(w.date).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

        const metric = (label, value) =>
            `<div><span>${label}</span><strong>${value}</strong></div>`;

        return `
        <article class="hist-card" style="--i:${index}" data-tier="${score !== null ? tierOf(score) : "high"}">
            <div class="hist-score" style="--s:${score ?? 0}" aria-label="Form score">
                ${score !== null ? Math.round(score) : "–"}
            </div>

            <div class="hist-main">
                <div class="hist-title-row">
                    <h3>${esc(w.title || `${NAMES[w.exercise] || "Workout"} session`)}</h3>
                    ${index === 0 && filter === "all" ? `<span class="hist-latest">Latest</span>` : ""}
                </div>
                <div class="hist-meta">
                    <span class="hist-chip">${esc(NAMES[w.exercise] || w.exercise)}</span>
                    <span>${fmtDate(w.date)} · ${time}</span>
                    ${score !== null ? `<span class="hist-verdict">${verdictOf(score)}</span>` : ""}
                    ${delta}
                </div>
                ${repChips ? `<div class="hist-reps">${repChips}</div>` : ""}
                ${focus ? `<p class="hist-focus"><b>Focus next</b>${esc(focus)}</p>` : ""}
                ${w.notes ? `<p class="hist-notes">${esc(w.notes)}</p>` : ""}
            </div>

            <div class="hist-metrics">
                ${metric("Reps", w.repCount ?? 0)}
                ${metric("ROM", Number.isFinite(w.rangeOfMotion) ? Math.round(w.rangeOfMotion) + "°" : "—")}
                ${metric("Tempo", Number.isFinite(w.tempo) ? w.tempo + "s" : "—")}
            </div>

            <div class="hist-actions">
                <button type="button" class="hist-icon-btn" data-edit="${esc(w.id)}">Edit</button>
                <button type="button" class="hist-icon-btn danger" data-delete="${esc(w.id)}">Delete</button>
            </div>
        </article>`;
    }).join("");
}


// ---------- filter ----------

$("filterSelect").addEventListener("change", (e) => {
    filter = e.target.value;
    setSetting("historyFilter", filter);   // localStorage
    render();
});


// ---------- edit / delete (event delegation) ----------

$("histList").addEventListener("click", (e) => {

    const editBtn = e.target.closest("[data-edit]");
    const delBtn = e.target.closest("[data-delete]");

    if (editBtn) {
        const w = all.find((item) => item.id === editBtn.dataset.edit);
        if (!w) return;

        editingId = w.id;
        $("editTitle").value = w.title || "";
        $("editNotes").value = w.notes || "";
        $("editDialog").showModal();
    }

    if (delBtn) {
        deletingId = delBtn.dataset.delete;
        $("deleteDialog").showModal();
    }
});

$("editCancel").addEventListener("click", () => $("editDialog").close());

$("editSave").addEventListener("click", async () => {

    if (!editingId) return;

    await updateWorkout(editingId, {
        title: $("editTitle").value.trim(),
        notes: $("editNotes").value.trim()
    });

    $("editDialog").close();
    editingId = null;
    load();
});

$("deleteCancel").addEventListener("click", () => $("deleteDialog").close());

$("deleteConfirm").addEventListener("click", async () => {

    if (!deletingId) return;

    await deleteWorkout(deletingId);

    $("deleteDialog").close();
    deletingId = null;
    load();
});


// ---------- mobile nav (same behaviour as index.html) ----------

const toggle = document.querySelector(".nav-menu-toggle");
const mobileNav = $("mobileNav");

toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.classList.toggle("is-open", open);
    mobileNav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    mobileNav.setAttribute("aria-hidden", String(!open));
});


// right column: spotlight card + segmented filter
(function buildSide() {

    const intro = document.querySelector(".hist-intro");
    const nativeFilter = document.querySelector(".hist-filter");

    nativeFilter.hidden = true;   // the <select> stays in the DOM as the state holder

    const side = document.createElement("div");
    side.className = "hist-side";

    side.innerHTML = `
        <div class="hist-spot" id="histSpot"></div>
        <div class="hist-seg" id="histSeg" role="tablist" aria-label="Filter by exercise">
            <button type="button" role="tab" data-f="all">All</button>
            <button type="button" role="tab" data-f="squat">Squat</button>
            <button type="button" role="tab" data-f="bicep-curl">Bicep curl</button>
        </div>`;

    intro.appendChild(side);

    side.querySelector("#histSeg").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-f]");
        if (!btn) return;
        filter = btn.dataset.f;
        setSetting("historyFilter", filter);   // localStorage
        render();
    });
})();

load();