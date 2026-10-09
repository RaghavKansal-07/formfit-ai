// ============================================================
// AUTH PAGES (signup / login / account)
// Accounts live in localStorage, the session lives in a cookie.
// ============================================================

import {
    signup,
    login,
    logout,
    getCurrentUser,
    updateProfile,
    deleteAccount,
    getWorkouts
} from "./db.js";

const $ = (id) => document.getElementById(id);
const page = document.body.dataset.page;
const user = getCurrentUser();

const emailOk = (v) => /^\S+@\S+\.\S+$/.test(v);

function say(el, text, ok = false) {
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
    el.classList.toggle("ok", ok);
}

// show a message and put the cursor in the field that needs fixing
function fail(msg, text, input) {
    say(msg, text);
    if (input) input.focus();
    return false;
}

// name rules: one clear message for each case
function nameProblem(value) {
    const v = value.trim();
    if (!v) return "Please enter your name.";
    if (v.length < 2) return "Your name needs at least 2 characters.";
    if (v.length > 60) return "Please keep your name under 60 characters.";
    return "";
}

function busy(btn, on, label) {
    btn.disabled = on;
    btn.querySelector("span").textContent = on ? "Please wait…" : label;
}

// only allow redirects to a local page like "history.html"
function nextPage() {
    const n = new URLSearchParams(location.search).get("next");
    return n && /^[\w-]+\.html$/.test(n) ? n : "history.html";
}

// show / hide password
document.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const input = $(btn.dataset.toggle);
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Hide" : "Show";
    });
});

// password strength meter
const meter = $("meter");

function strength(p) {
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return p ? Math.max(1, Math.min(4, s)) : 0;
}

$("password")?.addEventListener("input", (e) => {
    if (!meter) return;
    const level = strength(e.target.value);
    meter.dataset.level = level;
    meter.querySelector("small").textContent =
        ["", "Weak", "Okay", "Good", "Strong"][level];
});


// ---------------- SIGNUP ----------------

if (page === "signup") {

    if (user) location.replace("history.html");

    $("authForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = $("name").value.trim();
        const email = $("email").value.trim();
        const password = $("password").value;
        const msg = $("authMsg");
        const btn = $("authSubmit");

        const nameMsg = nameProblem(name);
        if (nameMsg) return fail(msg, nameMsg, $("name"));
        if (!email) return fail(msg, "Please enter your email address.", $("email"));
        if (!emailOk(email)) return fail(msg, "That email doesn't look right. Check for a missing @ or domain.", $("email"));
        if (!password) return fail(msg, "Please choose a password.", $("password"));
        if (password.length < 8) return fail(msg, "Your password needs at least 8 characters.", $("password"));

        say(msg, "");
        busy(btn, true);

        try {
            await signup({ name, email, password });   // localStorage + cookie
            say(msg, "Account created. Taking you to your history…", true);
            setTimeout(() => location.assign(nextPage()), 700);
        } catch (err) {
            say(msg, err.message);
            busy(btn, false, "Create account");
        }
    });
}


// ---------------- LOGIN ----------------

if (page === "login") {

    if (user) location.replace("history.html");

    $("authForm").addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = $("email").value.trim();
        const password = $("password").value;
        const msg = $("authMsg");
        const btn = $("authSubmit");

        if (!email) return fail(msg, "Please enter your email address.", $("email"));
        if (!emailOk(email)) return fail(msg, "That email doesn't look right. Check for a missing @ or domain.", $("email"));
        if (!password) return fail(msg, "Please enter your password.", $("password"));

        say(msg, "");
        busy(btn, true);

        try {
            const account = await login({ email, password, remember: $("remember").checked });

            // note for the next page, which shows it as a pop-up
            sessionStorage.setItem("ff_flash", JSON.stringify({
                title: "Logged in successfully",
                text: "Welcome back, " + account.name.split(" ")[0] + ".",
                time: Date.now()
            }));

            location.assign(nextPage());      // history.html unless a ?next= page was given
        } catch (err) {
            say(msg, err.message);
            busy(btn, false, "Log in");
        }
    });
}


// ---------------- ACCOUNT ----------------

if (page === "account") {

    if (!user) location.replace("login.html?next=account.html");

    else {

        const fill = (u) => {
            $("accAvatar").textContent = u.name.charAt(0).toUpperCase();
            $("accName").textContent = u.name;
            $("accEmail").textContent = u.email;
            $("name").value = u.name;
            $("email").value = u.email;
        };

        fill(user);

        $("accSince").textContent = new Date(user.createdAt)
            .toLocaleDateString(undefined, { month: "short", year: "numeric" });

        getWorkouts(user.id).then((list) => {
            $("accSessions").textContent = list.length;
            $("delSessions").textContent = list.length;
        });

        // UPDATE
        $("authForm").addEventListener("submit", async (e) => {
            e.preventDefault();

            const msg = $("authMsg");
            const email = $("email").value.trim();
            const newPassword = $("password").value;

            const nameMsg = nameProblem($("name").value);
            if (nameMsg) return fail(msg, nameMsg, $("name"));
            if (!email) return fail(msg, "Please enter your email address.", $("email"));
            if (!emailOk(email)) return fail(msg, "That email doesn't look right. Check for a missing @ or domain.", $("email"));
            if (newPassword && newPassword.length < 8) return fail(msg, "A new password needs at least 8 characters.", $("password"));

            try {
                const updated = await updateProfile({
                    name: $("name").value,
                    email,
                    newPassword: newPassword || undefined
                });

                fill(updated);
                $("password").value = "";
                if (meter) meter.dataset.level = 0;

                // leave a note for the next page (sessionStorage), then go home at once
                sessionStorage.setItem("ff_flash", JSON.stringify({
                    title: "Changes saved",
                    text: "Your profile has been updated.",
                    time: Date.now()
                }));

                location.assign("index.html");

            } catch (err) {
                say(msg, err.message);
            }
        });

        // LOGOUT
        $("logoutBtn").addEventListener("click", () => {
            logout();                                   // removes the ff_session cookie

            // note for the home page, which shows it as a pop-up
            sessionStorage.setItem("ff_flash", JSON.stringify({
                title: "You're logged out",
                text: "See you at your next workout.",
                time: Date.now()
            }));

            location.assign("index.html");
        });

        // DELETE
        const confirmInput = $("deleteConfirmInput");
        const confirmBtn = $("deleteConfirm");

        $("deleteBtn").addEventListener("click", () => {
            confirmInput.value = "";
            confirmBtn.disabled = true;
            $("deleteDialog").showModal();
            confirmInput.focus();
        });

        // the delete button unlocks only when the word DELETE is typed
        confirmInput.addEventListener("input", () => {
            confirmBtn.disabled = confirmInput.value.trim().toUpperCase() !== "DELETE";
        });
        $("deleteCancel").addEventListener("click", () => $("deleteDialog").close());

        $("deleteConfirm").addEventListener("click", async () => {
            if (confirmBtn.disabled) return;
            await deleteAccount();   // removes the user and their workouts
            location.assign("index.html");
        });
    }
}