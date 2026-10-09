// ============================================================
// INSIGHTS PAGE (reads saved workouts from IndexedDB)
// ============================================================

import { getWorkouts, getSetting, setSetting, getCurrentUser } from "./db.js";

import {
    NAMES,
    analyze,
    heatmap,
    coachText,
    bestRep,
    dayKey,
    pickDefaultExercise
} from "./insights-data.js";

const $ = (id) => document.getElementById(id);

let all = [];
let exercise = "squat";


// ---------- small helpers ----------

function countUp(el, target, decimals = 0) {

    if (!el) return;

    if (target === null || target === undefined) {
        el.textContent = "—";
        return;
    }

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

function deltaHTML(delta, decimals = 1) {

    if (delta === null || delta === undefined) return "";

    if (Math.abs(delta) < 0.05) return `<em class="flat">steady</em>`;

    const up = delta > 0;

    return `<em class="${up ? "up" : "down"}">${up ? "▲ +" : "▼ "}${delta.toFixed(decimals)}</em>`;
}


// ---------- init ----------

async function init() {

    all = await getWorkouts();

    $("cntSquat").textContent = all.filter((w) => w.exercise === "squat").length;
    $("cntCurl").textContent = all.filter((w) => w.exercise === "bicep-curl").length;

    const user = getCurrentUser();

    $("insNote").textContent = user
        ? `Signed in as ${user.name}`
        : "Based on the workouts saved on this device. Log in to keep them with an account.";

    const saved = getSetting("insightsExercise", null);

    exercise = saved && NAMES[saved] ? saved : pickDefaultExercise(all);

    $("insSeg").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-ex]");
        if (!btn) return;
        exercise = btn.dataset.ex;
        setSetting("insightsExercise", exercise);      // localStorage
        render();
    });

    render();
}


// ---------- render ----------

function render() {

    document.querySelectorAll("#insSeg [data-ex]").forEach((b) => {
        const on = b.dataset.ex === exercise;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-selected", String(on));
    });

    $("insSeg").hidden = all.length === 0;

    const info = analyze(all, exercise);

    if (!info) {

        $("insContent").hidden = true;
        $("insEmpty").hidden = false;

        if (all.length === 0) {
            $("emptyTitle").textContent = "No insights yet";
            $("emptyText").textContent =
                "Analyze a video and save the workout. Your insights appear here as soon as you have a session.";
        } else {
            const name = NAMES[exercise].toLowerCase();
            $("emptyTitle").textContent = `No ${name} sessions yet`;
            $("emptyText").textContent =
                `Save a ${name} workout and your ${name} insights will appear here. You can switch exercise above.`;
        }

        return;
    }

    $("insEmpty").hidden = true;
    $("insContent").hidden = false;

    const heat = heatmap(all);

    const n = info.list.length;

    const banner = $("insBanner");

    banner.hidden = n >= 3;
    banner.textContent =
        `Based on ${n} ${NAMES[exercise].toLowerCase()} ${n === 1 ? "session" : "sessions"} so far. Save a few more for stronger insights.`;

    renderScore(info);
    renderRadar(info);
    renderStrongFocus(info);
    renderHeat(heat);
    renderTrends(info);

    $("coachText").textContent = coachText(info, heat, exercise);

    renderReport(info, heat);
}


// ---------- score pill ----------

function renderScore(info) {

    countUp($("scoreNow"), info.scoreNow, 1);

    const d = info.scoreBefore !== null && info.scoreNow !== null
        ? info.scoreNow - info.scoreBefore
        : null;

    $("scoreDelta").outerHTML = `<em id="scoreDelta" class="${d === null ? "" : d > 0.05 ? "up" : d < -0.05 ? "down" : "flat"}">${d === null ? "" : Math.abs(d) < 0.05 ? "steady" : (d > 0 ? "▲ +" : "▼ ") + d.toFixed(1)
        }</em>`;
}


// ---------- radar chart ----------

function renderRadar(info) {

    const svg = $("radar");
    const axes = info.axes;
    const count = axes.length;

    if (count < 3) {
        svg.innerHTML =
            `<text x="200" y="165" text-anchor="middle" class="r-lab">Not enough detail saved yet for a profile.</text>`;
        return;
    }

    const cx = 200, cy = 160, R = 105;

    const frac = (v) => Math.max(0, Math.min(1, (v - 40) / 60));
    const angle = (i) => ((-90 + (i * 360) / count) * Math.PI) / 180;
    const point = (i, f) => [cx + R * f * Math.cos(angle(i)), cy + R * f * Math.sin(angle(i))];
    const fmt = (p) => p.map((v) => v.toFixed(1)).join(",");

    const polygon = (valueOf) => axes.map((a, i) => fmt(point(i, frac(valueOf(a))))).join(" ");

    let out = "";

    [0.25, 0.5, 0.75, 1].forEach((f) => {
        out += `<polygon class="r-ring" points="${axes.map((_, i) => fmt(point(i, f))).join(" ")}"/>`;
    });

    axes.forEach((_, i) => {
        const [sx, sy] = point(i, 1);
        out += `<line class="r-spoke" x1="${cx}" y1="${cy}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}"/>`;
    });

    const hasBefore = axes.every((a) => a.before !== null);

    $("legendBefore").hidden = !hasBefore;

    if (hasBefore) {
        out += `<polygon class="r-before r-shape" points="${polygon((a) => a.before)}"/>`;
    }

    out += `<polygon class="r-now r-shape" points="${polygon((a) => a.now)}"/>`;

    axes.forEach((a, i) => {
        const [x, y] = point(i, frac(a.now));
        out += `<g class="r-shape"><circle class="r-halo" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="11"/><circle class="r-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/></g>`;
    });

    axes.forEach((a, i) => {
        const [x, y] = point(i, 1.3);
        const cos = Math.cos(angle(i));
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";

        out += `<text x="${x.toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="${anchor}" class="r-lab">${a.short}</text>` +
            `<text x="${x.toFixed(1)}" y="${(y + 18).toFixed(1)}" text-anchor="${anchor}" class="r-val">${Math.round(a.now)}</text>`;
    });

    svg.innerHTML = out;
}


// ---------- strongest and focus ----------

function renderStrongFocus(info) {

    const s = info.strongest;
    const f = info.focus;

    $("strongName").textContent = s ? s.label : "—";
    $("strongText").textContent = s ? s.strong : "";
    countUp($("strongVal"), s ? s.now : null, 0);

    $("focusName").textContent = f ? f.label : "—";
    $("focusText").textContent = f ? f.tip : "";
    countUp($("focusVal"), f ? f.now : null, 0);
}


// ---------- consistency heatmap ----------

function renderHeat(heat) {

    const todayKey = dayKey(new Date());

    $("heat").innerHTML = heat.cells.map((c, i) => {

        const label = c.date.toLocaleDateString(undefined, { day: "numeric", month: "short" });

        const text = c.count
            ? `${label}: best score ${c.score !== null ? c.score.toFixed(1) : "—"}${c.count > 1 ? ` (${c.count} sessions)` : ""}`
            : `${label}: no workout`;

        const cls = [
            c.level ? `l${c.level}` : "",
            c.future ? "is-future" : "",
            c.key === todayKey ? "is-today" : ""
        ].join(" ").trim();

        return `<i class="${cls}" style="--n:${i}" title="${text}"></i>`;

    }).join("");

    countUp($("streakNow"), heat.current, 0);
    countUp($("streakBest"), heat.best, 0);
    countUp($("activeDays"), heat.activeDays, 0);
}


// ---------- trend cards ----------

let sparkId = 0;

function spark(values, down) {

    const w = 120, h = 44, p = 5;

    if (values.length < 2) {
        return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="${p}" y1="${h / 2}" x2="${w - p}" y2="${h / 2}" stroke="rgba(12,44,71,0.18)" stroke-width="2" stroke-dasharray="3 5" stroke-linecap="round"/></svg>`;
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    const pts = values.map((v, i) => [
        p + (i * (w - 2 * p)) / (values.length - 1),
        range === 0 ? h / 2 : p + (1 - (v - min) / range) * (h - 2 * p)
    ]);

    const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `M${pts[0][0].toFixed(1)},${h} L${line.replace(/ /g, " L")} L${pts[pts.length - 1][0].toFixed(1)},${h} Z`;
    const color = down ? "#c98a2b" : "#2D5652";
    const id = `sp${(sparkId += 1)}`;
    const last = pts[pts.length - 1];

    return `<svg viewBox="0 0 ${w} ${h}" aria-hidden="true">
        <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient></defs>
        <path d="${area}" fill="url(#${id})"/>
        <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>
    </svg>`;
}

function renderTrends(info) {

    $("trends").innerHTML = info.trends.map((t, i) => {

        const value = t.value === null ? "—" : (t.label === "Form score" ? t.value.toFixed(1) : String(Math.round(t.value)));

        return `<article class="ins-trend" style="animation: insUp 0.6s cubic-bezier(0.2,0.7,0.2,1) ${0.3 + i * 0.08}s both">
            <span>${t.label}</span>
            <strong>${value}${deltaHTML(t.delta)}</strong>
            ${spark(t.series, t.delta !== null && t.delta < -0.05)}
        </article>`;

    }).join("");
}


// ---------- report card (canvas) ----------

const SANS = "Manrope, 'Segoe UI', Arial, sans-serif";

function drawReport(d) {

    const canvas = $("reportCanvas");
    const c = canvas.getContext("2d");
    const W = 1200, H = 630;

    c.clearRect(0, 0, W, H);

    c.fillStyle = "#0C2C47";
    c.fillRect(0, 0, W, H);

    let g = c.createRadialGradient(1000, 90, 0, 1000, 90, 520);
    g.addColorStop(0, "rgba(151,211,205,0.35)");
    g.addColorStop(1, "rgba(151,211,205,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    g = c.createRadialGradient(60, 640, 0, 60, 640, 420);
    g.addColorStop(0, "rgba(226,165,77,0.24)");
    g.addColorStop(1, "rgba(226,165,77,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.strokeStyle = "rgba(151,211,205,0.14)";
    c.lineWidth = 2;

    [260, 380].forEach((r) => {
        c.beginPath();
        c.arc(1040, 60, r, 0, Math.PI * 2);
        c.stroke();
    });

    const cx = 250, cy = 300, r = 128;
    const score = d.score === null ? 0 : d.score;

    c.lineWidth = 24;
    c.lineCap = "round";

    c.strokeStyle = "rgba(255,255,255,0.12)";
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    c.strokeStyle = "#7fd6bd";
    c.beginPath();
    c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * Math.min(score, 100)) / 100);
    c.stroke();

    c.textAlign = "center";
    c.fillStyle = "#ffffff";
    c.font = "500 84px Georgia, serif";
    c.fillText(d.score === null ? "—" : score.toFixed(1), cx, cy + 22);

    c.font = `500 21px ${SANS}`;
    c.fillStyle = "rgba(255,255,255,0.65)";
    c.fillText("form score", cx, cy + 62);

    const x0 = 520;

    c.textAlign = "left";
    c.fillStyle = "#97D3CD";
    c.font = `800 19px ${SANS}`;
    c.letterSpacing = "4px";
    c.fillText("FORMFIT AI REPORT CARD", x0, 118);
    c.letterSpacing = "0px";

    let size = 78;
    c.fillStyle = "#ffffff";
    c.font = `500 ${size}px Georgia, serif`;

    while (c.measureText(d.name).width > 620 && size > 38) {
        size -= 4;
        c.font = `500 ${size}px Georgia, serif`;
    }

    c.fillText(d.name, x0, 205);

    c.fillStyle = "rgba(255,255,255,0.75)";
    c.font = `500 27px ${SANS}`;
    c.fillText(`${d.exerciseName} · latest ${d.k} ${d.k === 1 ? "session" : "sessions"}`, x0, 256);

    c.fillStyle = "rgba(255,255,255,0.14)";
    c.fillRect(x0, 292, 620, 2);

    const stats = [
        [String(d.sessions), "sessions saved"],
        [d.best === null ? "—" : d.best.toFixed(1), "best rep"],
        [`${d.streak}d`, "current streak"]
    ];

    stats.forEach(([value, label], i) => {
        const x = x0 + i * 215;
        c.fillStyle = "#ffffff";
        c.font = "500 56px Georgia, serif";
        c.fillText(value, x, 372);
        c.fillStyle = "rgba(255,255,255,0.6)";
        c.font = `600 19px ${SANS}`;
        c.fillText(label, x, 405);
    });

    c.fillStyle = "#97D3CD";
    c.font = `800 16px ${SANS}`;
    c.letterSpacing = "3px";
    c.fillText("STRONGEST AREA", x0, 470);
    c.fillStyle = "#E2A54D";
    c.fillText("FOCUS NEXT", x0 + 330, 470);
    c.letterSpacing = "0px";

    c.fillStyle = "#ffffff";
    c.font = "500 38px Georgia, serif";
    c.fillText(d.strongest, x0, 516);
    c.fillText(d.focus, x0 + 330, 516);

    c.fillStyle = "rgba(255,255,255,0.5)";
    c.font = `600 19px ${SANS}`;
    c.fillText(`Created ${new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`, 60, 585);

    c.textAlign = "right";
    c.fillStyle = "#ffffff";
    c.font = "italic 500 30px Georgia, serif";
    c.fillText("FormFit AI", 1140, 585);
}

let reportData = null;

function renderReport(info, heat) {

    const user = getCurrentUser();

    reportData = {
        name: user ? user.name : "Your report card",
        exerciseName: NAMES[exercise],
        k: info.recent.length,
        score: info.scoreNow,
        sessions: all.length,
        best: bestRep(all),
        streak: heat.current,
        strongest: info.strongest ? info.strongest.label : "—",
        focus: info.focus ? info.focus.label : "—"
    };

    drawReport(reportData);

    // draw again once the web fonts are ready, so the canvas uses them
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => reportData && drawReport(reportData));
    }
}

$("downloadBtn").addEventListener("click", () => {

    if (!reportData) return;

    drawReport(reportData);

    $("reportCanvas").toBlob((blob) => {

        if (!blob) return;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "formfit-report-card.png";
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1500);

        const label = $("downloadBtn").querySelector("span");
        label.textContent = "Saved to your device";
        setTimeout(() => (label.textContent = "Download report card"), 2000);

    }, "image/png");
});


// ---------- mobile menu (same behaviour as the other pages) ----------

const toggle = document.querySelector(".nav-menu-toggle");
const mobileNav = $("mobileNav");

toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.classList.toggle("is-open", open);
    mobileNav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    mobileNav.setAttribute("aria-hidden", String(!open));
});


init();