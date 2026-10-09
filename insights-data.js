// ============================================================
// INSIGHTS: calculations only (no DOM), so they are easy to test
// Input: the workouts saved in IndexedDB (see db.js)
// ============================================================

export const NAMES = { squat: "Squat", "bicep-curl": "Bicep curl" };

export const METRICS = {
    squat: [
        {
            key: "depthScore", label: "Depth", short: "Depth",
            strong: "You reach good depth in most of your reps.",
            tip: "Aim for thighs at or below parallel: sit back and down, as if onto a chair."
        },
        {
            key: "hipScore", label: "Hip position", short: "Hip",
            strong: "Your hips move cleanly through the whole rep.",
            tip: "Let your hips and chest rise together as you stand up out of the bottom."
        },
        {
            key: "torsoScore", label: "Torso control", short: "Torso",
            strong: "You keep your torso upright and controlled.",
            tip: "Keep your chest up and brace your core as you go down."
        },
        {
            key: "bottomStabilityScore", label: "Bottom stability", short: "Stability",
            strong: "You stay steady in the bottom position.",
            tip: "Pause for one second at the bottom to settle before you stand."
        }
    ],
    "bicep-curl": [
        {
            key: "elbowStabilityScore", label: "Elbow stability", short: "Elbow",
            strong: "Your elbows stay pinned where they should be.",
            tip: "Keep your elbows tight to your sides and don't let them swing forward."
        },
        {
            key: "torsoScore", label: "Torso control", short: "Torso",
            strong: "You curl without swinging your body.",
            tip: "Keep your torso still. If you start to lean back, lower the weight."
        },
        {
            key: "romScore", label: "Range of motion", short: "Range",
            strong: "You use the full range on every curl.",
            tip: "Lower all the way down and curl all the way up on each rep."
        },
        {
            key: "tempoScore", label: "Tempo", short: "Tempo",
            strong: "Your pace is smooth and controlled.",
            tip: "Count two seconds on the way up and two on the way down."
        }
    ]
};

const finite = (v) => typeof v === "number" && Number.isFinite(v);

export function mean(values) {
    const v = values.filter(finite);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export const sessionMetric = (workout, key) =>
    mean((workout.reps || []).map((r) => (r ? r[key] : null)));

const byDate = (a, b) => new Date(a.date) - new Date(b.date);

export function pickDefaultExercise(all) {
    const squats = all.filter((w) => w.exercise === "squat").length;
    const curls = all.filter((w) => w.exercise === "bicep-curl").length;
    return curls > squats ? "bicep-curl" : "squat";
}


// ------------------------------------------------------------
// Profile, strongest / weakest and trends for one exercise
// ------------------------------------------------------------

export function analyze(all, exercise) {

    const list = all.filter((w) => w.exercise === exercise).sort(byDate);

    if (!list.length) return null;

    const recent = list.slice(-5);
    const earlier = list.slice(0, list.length - recent.length);

    const axes = (METRICS[exercise] || [])
        .map((def) => ({
            ...def,
            now: mean(recent.map((w) => sessionMetric(w, def.key))),
            before: earlier.length
                ? mean(earlier.map((w) => sessionMetric(w, def.key)))
                : null
        }))
        .filter((a) => a.now !== null);

    const scoreNow = mean(recent.map((w) => w.formScore));
    const scoreBefore = earlier.length ? mean(earlier.map((w) => w.formScore)) : null;

    const ranked = [...axes].sort((a, b) => b.now - a.now);
    const strongest = ranked[0] || null;
    const focus = ranked.length ? ranked[ranked.length - 1] : null;

    const series = [
        { label: "Form score", get: (w) => w.formScore },
        ...axes.map((a) => ({ label: a.label, get: (w) => sessionMetric(w, a.key) }))
    ];

    const trends = series.map((t) => {

        const values = list.map(t.get).filter(finite);

        let delta = null;

        if (values.length >= 2) {
            const last = values.slice(-3);
            const prev = values.slice(-6, -3);
            delta = prev.length
                ? mean(last) - mean(prev)
                : values[values.length - 1] - values[0];
        }

        return {
            label: t.label,
            value: values.length ? values[values.length - 1] : null,
            delta,
            series: values.slice(-8)
        };
    });

    return { list, recent, earlier, axes, scoreNow, scoreBefore, strongest, focus, trends };
}


// ------------------------------------------------------------
// Best rep score across everything saved
// ------------------------------------------------------------

export function bestRep(all) {
    const scores = all.flatMap((w) => (w.reps || []).map((r) => (r ? r.formScore : null)));
    const v = scores.filter(finite);
    return v.length ? Math.max(...v) : null;
}


// ------------------------------------------------------------
// 12-week consistency heatmap + streaks (all exercises)
// ------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");

export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function levelOf(score) {
    if (!finite(score)) return 0;
    return score < 75 ? 1 : score < 85 ? 2 : score < 92 ? 3 : 4;
}

export function heatmap(all, now = new Date()) {

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // best score and session count for every day
    const days = new Map();

    all.forEach((w) => {
        const k = dayKey(new Date(w.date));
        const entry = days.get(k) || { score: null, count: 0 };
        entry.count += 1;
        if (finite(w.formScore) && (entry.score === null || w.formScore > entry.score)) {
            entry.score = w.formScore;
        }
        days.set(k, entry);
    });

    // 12 weeks, Monday first, ending with the current week
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = new Date(today);
    start.setDate(start.getDate() - mondayOffset - 11 * 7);

    const cells = [];

    for (let i = 0; i < 84; i++) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const key = dayKey(date);
        const entry = days.get(key);

        cells.push({
            date,
            key,
            future: date > today,
            count: entry ? entry.count : 0,
            score: entry ? entry.score : null,
            level: entry ? Math.max(1, levelOf(entry.score)) : 0
        });
    }

    // current streak: today counts if trained, otherwise start from yesterday
    const cursor = new Date(today);
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

    let current = 0;
    while (days.has(dayKey(cursor))) {
        current += 1;
        cursor.setDate(cursor.getDate() - 1);
    }

    // best streak ever
    const nums = [...days.keys()]
        .map((k) => {
            const [y, m, d] = k.split("-").map(Number);
            return Math.round(new Date(y, m - 1, d).getTime() / 864e5);
        })
        .sort((a, b) => a - b);

    let best = 0;
    let run = 0;

    nums.forEach((n, i) => {
        run = i > 0 && n === nums[i - 1] + 1 ? run + 1 : 1;
        if (run > best) best = run;
    });

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const thisWeek = all.filter((w) => new Date(w.date) >= weekAgo).length;

    return { cells, current, best, activeDays: days.size, thisWeek };
}


// ------------------------------------------------------------
// Coach summary: written from rules and templates (not ML)
// ------------------------------------------------------------

export function coachText(info, heat, exercise) {

    if (!info) return "";

    const name = (NAMES[exercise] || "workout").toLowerCase();
    const k = info.recent.length;
    const parts = [];

    const avg = info.scoreNow !== null ? info.scoreNow.toFixed(1) : null;

    if (avg) {
        parts.push(
            `Across your latest ${k} ${name} ${k === 1 ? "session" : "sessions"}, your form score averages ${avg}.`
        );
    }

    if (info.scoreBefore !== null && info.scoreNow !== null) {
        const d = info.scoreNow - info.scoreBefore;

        if (d >= 1) parts.push(`That is up ${d.toFixed(1)} points on your earlier sessions.`);
        else if (d <= -1) parts.push(`That is ${Math.abs(d).toFixed(1)} points lower than before, so keep an eye on it.`);
        else parts.push("That is steady compared with your earlier sessions.");
    } else {
        parts.push("Save a few more sessions and your trend will start to show.");
    }

    const gap = info.strongest && info.focus ? info.strongest.now - info.focus.now : 0;

    if (info.strongest && gap < 3) {
        parts.push("Your scores are well balanced across every area, which is a sign of consistent technique.");
    } else {
        if (info.strongest) {
            parts.push(`${info.strongest.label} is your strongest area at ${Math.round(info.strongest.now)}.`);
        }

        if (info.focus && info.focus !== info.strongest) {
            parts.push(`${info.focus.label} is the lowest at ${Math.round(info.focus.now)}. ${info.focus.tip}`);
        }
    }

    if (heat) {
        if (heat.thisWeek === 0) {
            parts.push("You haven't trained in the last week, so a short session soon would help the habit.");
        } else {
            parts.push(
                `You trained ${heat.thisWeek} ${heat.thisWeek === 1 ? "time" : "times"} in the last 7 days.`
            );
        }
    }

    return parts.join(" ");
}