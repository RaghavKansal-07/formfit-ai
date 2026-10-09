# FormFit AI

### AI-Powered Exercise Form Analyzer

FormFit AI is a web-based AI fitness application that analyzes exercise videos using computer vision and pose estimation. Everything runs **in the browser**: videos are never uploaded anywhere.

The application detects exercise repetitions and evaluates important aspects of movement technique, including:

- Range of motion
- Body and joint stability
- Posture
- Movement tempo
- Exercise-specific form

FormFit AI currently supports **squats** and **bicep curls**.

**Live demo:** https://raghavkansal-07.github.io/formfit-ai/

---

## Problem Statement

When exercising without a trainer, it can be difficult to determine whether an exercise is being performed with proper technique.

FormFit AI provides automated visual feedback by analyzing recorded exercise videos and identifying important movement characteristics. The system uses human pose landmarks extracted from video frames to detect repetitions and evaluate exercise form.

---

## Features

- **Video analysis:** upload a side-view video and get a form score, a rep count, range of motion and tempo.
- **Rep-by-rep breakdown:** a radar chart, score bars, a tempo split, joint measurements and coach notes for every repetition, with a "Watch this rep" playback.
- **Save workouts:** save any analysis to your history.
- **History page:** summary stats, a form-score trend chart, an exercise filter, and edit and delete for each session.
- **Accounts:** sign up, log in with an optional "Remember me", edit your profile, log out and delete your account.
- **Guest mode:** analyze and save workouts without an account. Guest workouts move into your account when you sign up or log in.
- **Responsive design:** built for mobile, tablet and desktop.

---

## How It Works

1. The user uploads an exercise video.
2. The video is processed frame by frame.
3. MediaPipe Pose Landmarker detects body landmarks.
4. Landmark data is smoothed to reduce frame-to-frame noise.
5. Joint angles and movement information are calculated.
6. Exercise-specific logic detects completed repetitions.
7. Each detected repetition is analyzed.
8. A form score and feedback are generated.

### Processing Pipeline

```text
Exercise Video
      |
      v
MediaPipe Pose Detection
      |
      v
Pose Landmarks
      |
      v
Landmark Smoothing
      |
      v
Joint Angle Calculation
      |
      v
Exercise Rep Detection
      |
      v
Rep-by-Rep Form Analysis
      |
      v
Form Score + Feedback
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, Flexbox, Grid, media queries, animations) |
| Logic | Vanilla JavaScript (ES modules, async/await) |
| Pose estimation | MediaPipe Pose Landmarker (runs in the browser) |
| Passwords | Web Crypto API (PBKDF2, SHA-256, random salt) |

No frameworks or build tools are used.

---

## Data Storage

| Storage type | Name | Used for |
|---|---|---|
| **IndexedDB** | `formfit-db` → `workouts` | Saved workouts: scores, reps, measurements, notes |
| **localStorage** | `ff_users` | User accounts (name, email, salted password hash) |
| **localStorage** | `ff_settings` | History exercise filter |
| **Cookie** | `ff_session` | Login session (7 days with "Remember me", otherwise until the browser closes) |
| **sessionStorage** | `ff_flash` | One-time pop-up message passed between pages |

---

## CRUD Operations

**Workouts (IndexedDB)**

| Operation | Where |
|---|---|
| Create | "Save workout" button on the analyzer results |
| Read | History page: stats, trend chart and session list |
| Update | History page: edit a session's title and notes |
| Delete | History page: delete a session, with confirmation |

**User accounts (localStorage + cookie)**

| Operation | Where |
|---|---|
| Create | Signup page |
| Read | Login page |
| Update | Account page: edit name, email or password |
| Delete | Account page: delete account (type `DELETE` to confirm) |

---

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Landing page and the video analyzer |
| `history.html` | Saved workouts, stats and trend chart |
| `login.html` | Log in |
| `signup.html` | Create an account |
| `account.html` | Profile, log out and delete account |

---

## Project Structure

```text
FitnessAI/
├── index.html           # Landing page + analyzer
├── history.html         # Workout history
├── login.html           # Log in
├── signup.html          # Sign up
├── account.html         # Account page
├── style.css            # Main styles
├── history.css          # History page styles
├── auth.css             # Login / signup / account styles
├── script.js            # Analyzer controller
├── state.js             # Shared analyzer state
├── constants.js
├── db.js                # IndexedDB, localStorage and cookie layer
├── history.js           # History page logic
├── auth.js              # Login / signup / account logic
├── nav-auth.js          # Navbar login state + pop-up messages
├── core/                # Pose model setup, video processing, drawing
├── detection/           # Rep detection and side-view check
├── analysis/            # Per-rep form analysis
├── geometry/            # Angle calculation
├── landmarks/           # Landmark smoothing
├── models/              # MediaPipe pose model
└── assets/              # Images
```

---

## Running Locally

The project uses ES modules and cookies, so it **must be served over HTTP**. Opening `index.html` directly from the file system will not work.

**Option 1: VS Code**

1. Install the *Live Server* extension.
2. Right-click `index.html` and choose **Open with Live Server**.

**Option 2: Python**

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`.

---

## Responsive Design

The layout adapts at three main breakpoints (about 1200px, 950px and 600px) and was tested on desktop, tablet and phone widths. On smaller screens the navbar collapses into a menu, card grids stack, and the login/signup artwork is hidden.

<!--
## Screenshots
Add images to docs/screenshots/ and uncomment:

![Home](docs/screenshots/home.png)
![Analyzer results](docs/screenshots/results.png)
![History](docs/screenshots/history.png)
![Account](docs/screenshots/account.png)
-->

---

## Limitations

- Accounts are stored in the browser only, so they are **not secure** and are not shared between devices. A real product would use a server.
- Clearing site data deletes saved workouts and accounts.
- Analysis works best with a clear **side-view** video where the whole body is visible.
- Only squats and bicep curls are supported; other exercises on the page are marked "Coming soon".
- The numbers shown in the home-page previews are sample data.

---

## Author

**Raghav Kansal**

## License

Released under the [MIT License](LICENSE).