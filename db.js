/* ============================================================
   FormFit AI : storage layer (db.js)
 
   IndexedDB   -> workouts (full CRUD)
   localStorage -> user accounts + small settings
   Cookie      -> login session (user id only)
 
   Usage:  import { createWorkout, getWorkouts } from "./db.js";
============================================================ */
 
const DB_NAME = "formfit-db";
const DB_VERSION = 1;
const STORE = "workouts";
 
const USERS_KEY = "ff_users";
const SETTINGS_KEY = "ff_settings";
const COOKIE_NAME = "ff_session";
const GUEST_ID = "guest";
 
 
/* ============================================================
   INDEXEDDB: WORKOUTS (CRUD)
============================================================ */
 
let dbPromise = null;
 
function openDB() {
    if (dbPromise) return dbPromise;
 
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
 
        request.onupgradeneeded = () => {
            const db = request.result;
 
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "id" });
                store.createIndex("userId", "userId", { unique: false });
                store.createIndex("date", "date", { unique: false });
            }
        };
 
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
 
    return dbPromise;
}
 
async function run(mode, action) {
    const db = await openDB();
 
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = action(store);
 
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
}
 
function makeId() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
 
 
/* ---------- CREATE ---------- */
 
export async function createWorkout(data) {
    const record = {
        id: makeId(),
        userId: getCurrentUserId(),
        date: new Date().toISOString(),
        title: "",
        notes: "",
        ...data
    };
 
    await run("readwrite", store => store.add(record));
    return record;
}
 
 
/* ---------- READ ---------- */
 
export async function getWorkouts(userId = getCurrentUserId()) {
    const all = await run("readonly", store => store.index("userId").getAll(userId));
    return (all || []).sort((a, b) => new Date(b.date) - new Date(a.date));
}
 
export async function getWorkout(id) {
    return run("readonly", store => store.get(id));
}
 
 
/* ---------- UPDATE ---------- */
 
export async function updateWorkout(id, changes) {
    const existing = await getWorkout(id);
    if (!existing) throw new Error("Workout not found");
 
    const updated = { ...existing, ...changes, id: existing.id, userId: existing.userId };
    await run("readwrite", store => store.put(updated));
    return updated;
}
 
 
/* ---------- DELETE ---------- */
 
export async function deleteWorkout(id) {
    await run("readwrite", store => store.delete(id));
}
 
export async function deleteAllWorkouts(userId = getCurrentUserId()) {
    const list = await getWorkouts(userId);
    await Promise.all(list.map(w => deleteWorkout(w.id)));
}
 
 
/* ============================================================
   BUILD A WORKOUT RECORD FROM ANALYZER OUTPUT
   Stores numbers and feedback only (never the video).
============================================================ */
 
const round = (v, d = 1) =>
    Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null;
 
export function buildWorkoutRecord({ exercise = "squat", summary = {}, reps = [] }) {
    return {
        exercise,
        formScore: round(summary.formScore),
        repCount: Number.isFinite(summary.repCount) ? summary.repCount : reps.length,
        rangeOfMotion: round(summary.rangeOfMotion),
        tempo: round(summary.tempo),
        reps: reps.map(r => {
            // confidence: squat = 0-100 number, curl = 0-100 number or {overall: 0-1}
            const conf =
                Number.isFinite(r.overallConfidence) ? r.overallConfidence
                    : Number.isFinite(r.confidence) ? r.confidence
                        : Number.isFinite(r.confidence?.overall) ? r.confidence.overall * 100
                            : null;
 
            return {
                repNumber: r.repNumber,
                formScore: round(r.formScore),
                rangeOfMotion: round(r.rangeOfMotion ?? r.rom),
                duration: round(r.duration, 2),
                confidence: round(conf, 0),
                side: r.primarySide ?? r.side ?? null,
 
                // squat
                depthScore: round(r.depthScore),
                hipScore: round(r.hipScore),
                torsoScore: round(r.torsoScore ?? r.torso?.score),
                bottomStabilityScore: round(r.bottomStabilityScore),
                kneeAngle: round(r.primaryKneeAngle),
                hipAngle: round(r.primaryHipAngle),
                torsoAngle: round(r.torsoAngle),
 
                // bicep curl
                elbowStabilityScore: round(r.elbowStability?.score),
                romScore: round(r.totalRom?.score),
                tempoScore: round(r.tempo?.score),
                topAngle: round(r.topAngle ?? r.topElbowAngle),
                bottomAngle: round(r.bottomAngle ?? r.bottomElbowAngle),
 
                feedback: Array.isArray(r.feedback) ? r.feedback : []
            };
        })
    };
}
 
 
/* ============================================================
   COOKIE: SESSION
============================================================ */
 
function setCookie(name, value, days) {
    let cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
 
    if (days) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        cookie += `; expires=${expires}`;
    }
 
    document.cookie = cookie;
}
 
function getCookie(name) {
    const match = document.cookie
        .split("; ")
        .find(row => row.startsWith(name + "="));
 
    return match ? decodeURIComponent(match.split("=")[1]) : null;
}
 
function deleteCookie(name) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
 
 
/* ============================================================
   LOCALSTORAGE: USERS
   Passwords are salted and hashed (PBKDF2). This is fine for a
   college project but is NOT real security: a real product
   needs a server.
============================================================ */
 
function readUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
    } catch {
        return [];
    }
}
 
function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
 
const toHex = buf =>
    [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
 
async function hashPassword(password, saltHex) {
    const salt = saltHex
        ? Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)))
        : crypto.getRandomValues(new Uint8Array(16));
 
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
 
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
        key,
        256
    );
 
    return { hash: toHex(bits), salt: toHex(salt) };
}
 
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });
 
 
/* ---------- CREATE (signup) ---------- */
 
export async function signup({ name, email, password }) {
    const users = readUsers();
    email = String(email).trim().toLowerCase();
 
    if (users.some(u => u.email === email)) {
        throw new Error("An account with this email already exists.");
    }
 
    const { hash, salt } = await hashPassword(password);
 
    const user = {
        id: makeId(),
        name: String(name).trim(),
        email,
        hash,
        salt,
        createdAt: new Date().toISOString()
    };
 
    users.push(user);
    writeUsers(users);
 
    setCookie(COOKIE_NAME, user.id, 7);
    await adoptGuestWorkouts(user.id);
 
    return publicUser(user);
}
 
 
/* ---------- READ (login) ---------- */
 
export async function login({ email, password, remember = false }) {
    email = String(email).trim().toLowerCase();
 
    const user = readUsers().find(u => u.email === email);
    if (!user) throw new Error("Incorrect email or password.");
 
    const { hash } = await hashPassword(password, user.salt);
    if (hash !== user.hash) throw new Error("Incorrect email or password.");
 
    // remember = persistent cookie (7 days), otherwise a session cookie
    setCookie(COOKIE_NAME, user.id, remember ? 7 : 0);
    await adoptGuestWorkouts(user.id);
 
    return publicUser(user);
}
 
export function logout() {
    deleteCookie(COOKIE_NAME);
}
 
export function getCurrentUser() {
    const id = getCookie(COOKIE_NAME);
    if (!id) return null;
 
    const user = readUsers().find(u => u.id === id);
    return user ? publicUser(user) : null;
}
 
export function getCurrentUserId() {
    return getCurrentUser()?.id || GUEST_ID;
}
 
export function isLoggedIn() {
    return getCurrentUser() !== null;
}
 
 
/* ---------- UPDATE (edit profile) ---------- */
 
export async function updateProfile({ name, email, newPassword }) {
    const current = getCurrentUser();
    if (!current) throw new Error("You are not logged in.");
 
    const users = readUsers();
    const user = users.find(u => u.id === current.id);
 
    if (email) {
        email = String(email).trim().toLowerCase();
 
        if (users.some(u => u.email === email && u.id !== user.id)) {
            throw new Error("That email is already in use.");
        }
        user.email = email;
    }
 
    if (name) user.name = String(name).trim();
 
    if (newPassword) {
        const { hash, salt } = await hashPassword(newPassword);
        user.hash = hash;
        user.salt = salt;
    }
 
    writeUsers(users);
    return publicUser(user);
}
 
 
/* ---------- DELETE (delete account) ---------- */
 
export async function deleteAccount() {
    const current = getCurrentUser();
    if (!current) return;
 
    await deleteAllWorkouts(current.id);
    writeUsers(readUsers().filter(u => u.id !== current.id));
    logout();
}
 
 
/* ============================================================
   GUEST WORKOUTS
   Workouts saved before logging in move to the new account.
============================================================ */
 
async function adoptGuestWorkouts(userId) {
    const guestWorkouts = await getWorkouts(GUEST_ID);
 
    await Promise.all(
        guestWorkouts.map(w =>
            run("readwrite", store => store.put({ ...w, userId }))
        )
    );
}
 
 
/* ============================================================
   LOCALSTORAGE: SETTINGS (e.g. History filter)
============================================================ */
 
export function getSetting(key, fallback = null) {
    try {
        const all = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        return key in all ? all[key] : fallback;
    } catch {
        return fallback;
    }
}
 
export function setSetting(key, value) {
    let all = {};
 
    try {
        all = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch { /* ignore */ }
 
    all[key] = value;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
}