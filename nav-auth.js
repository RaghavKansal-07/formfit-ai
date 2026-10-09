// ============================================================
// NAVBAR LOGIN STATE
// Include on every page:  <script type="module" src="nav-auth.js"></script>
// ============================================================

import { getCurrentUser } from "./db.js";

const user = getCurrentUser();

const label = user ? user.name.split(" ")[0] : "Login";
const href = user ? "account.html" : "login.html";

// Insights link: navbar, mobile menu and footer
(function addInsightsLinks() {

    const desktop = document.querySelector(".nav-links");

    if (desktop) {
        const a = document.createElement("a");
        a.href = "insights.html";
        a.textContent = "Insights";
        desktop.appendChild(a);
    }

    const mobileList = document.querySelector(".mobile-nav-links");

    if (mobileList) {
        const a = document.createElement("a");
        a.href = "insights.html";
        a.innerHTML = "<span>Insights</span><span>→</span>";
        mobileList.appendChild(a);
    }

    const footerCol = document.querySelector("nav.footer-col");

    if (footerCol) {
        const a = document.createElement("a");
        a.href = "insights.html";
        a.textContent = "Insights";
        footerCol.appendChild(a);
    }
})();

// desktop navbar
const links = document.querySelector(".nav-links");

if (links) {
    const a = document.createElement("a");
    a.href = href;
    a.className = "nav-auth-link";
    a.textContent = label;
    links.appendChild(a);
}

// mobile menu
const mobile = document.querySelector(".mobile-nav-links");

if (mobile) {
    const a = document.createElement("a");
    a.href = href;
    a.innerHTML = `<span>${label.replace(/[<>&]/g, "")}</span><span>→</span>`;
    mobile.appendChild(a);
}

// mark the link of the page you are on
const here = location.pathname.split("/").pop() || "index.html";

document.querySelectorAll(".nav-links a, .mobile-nav-links a").forEach((a) => {
    const file = (a.getAttribute("href") || "").split("#")[0];
    if (file && file === here) a.setAttribute("aria-current", "page");
});


// ============================================================
// TOAST: shows a message left by the previous page
// (sessionStorage key "ff_flash")
// ============================================================

const toastCss = document.createElement("style");
toastCss.textContent = `
.ff-toast {
    position: fixed;
    z-index: 3000;
    top: 118px;
    left: 50%;
    width: min(440px, calc(100% - 32px));
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 18px 20px 20px;
    overflow: hidden;
    border-radius: 24px;
    border: 1px solid rgba(12, 44, 71, 0.06);
    background:
        radial-gradient(260px 140px at 0% 0%, rgba(151, 211, 205, 0.45), transparent 70%),
        #fff;
    box-shadow: 0 28px 70px rgba(12, 44, 71, 0.22);
    transform: translate(-50%, -24px);
    opacity: 0;
    animation: ffToastIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards;
}

.ff-toast.is-leaving { animation: ffToastOut 0.35s ease forwards; }

.ff-toast-icon {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: #2D5652;
    color: #fff;
    box-shadow: 0 0 0 7px rgba(45, 86, 82, 0.12);
}

.ff-toast-icon svg { width: 22px; height: 22px; }

.ff-toast-body { flex: 1; min-width: 0; }

.ff-toast-body strong {
    display: block;
    color: #0C2C47;
    font-family: Georgia, "Times New Roman", serif;
    font-size: 21px;
    font-weight: 500;
    letter-spacing: -0.02em;
}

.ff-toast-body span { display: block; margin-top: 2px; color: #63717B; font-size: 14px; line-height: 1.45; }

.ff-toast-close {
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #63717B;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
}

.ff-toast-close:hover { background: #F7F4EF; color: #0C2C47; }

.ff-toast-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 4px;
    width: 100%;
    background: #E2A54D;
    transform-origin: left;
    animation: ffToastBar 1.4s linear 0.6s forwards;
}

@keyframes ffToastIn { to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes ffToastOut { to { opacity: 0; transform: translate(-50%, -20px); } }
@keyframes ffToastBar { to { transform: scaleX(0); } }

@media (max-width: 600px) { .ff-toast { top: 96px; } }

@media (prefers-reduced-motion: reduce) {
    .ff-toast { animation: none; opacity: 1; transform: translate(-50%, 0); }
    .ff-toast-bar { animation: none; display: none; }
}
`;

function showToast(title, text) {

    document.head.appendChild(toastCss);

    const toast = document.createElement("div");
    toast.className = "ff-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");

    toast.innerHTML = `
        <div class="ff-toast-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
        </div>
        <div class="ff-toast-body"><strong></strong><span></span></div>
        <button type="button" class="ff-toast-close" aria-label="Dismiss">×</button>
        <i class="ff-toast-bar"></i>`;

    toast.querySelector("strong").textContent = title;
    toast.querySelector("span").textContent = text;

    document.body.appendChild(toast);

    const close = () => {
        toast.classList.add("is-leaving");
        setTimeout(() => toast.remove(), 400);
    };

    toast.querySelector(".ff-toast-close").addEventListener("click", close);
    setTimeout(close, 2100);
}

try {
    const raw = sessionStorage.getItem("ff_flash");

    if (raw) {
        sessionStorage.removeItem("ff_flash");     // show it only once

        const note = JSON.parse(raw);

        // ignore old notes (for example from a closed tab)
        if (note && note.title && Date.now() - (note.time || 0) < 30000) {
            showToast(note.title, note.text || "");
        }
    }
} catch { /* ignore */ }