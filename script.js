// ============================================================
// FITNESS AI
// MAIN APPLICATION CONTROLLER
// ============================================================
//
// script.js is intentionally kept small.
//
// Responsibilities:
// 1. Connect HTML elements to shared state
// 2. Initialize MediaPipe
// 3. Handle video selection
// 4. Start / resume video processing
// 5. Route analysis to the selected exercise
// 6. Run exercise-specific detection
// 7. Run exercise-specific analysis when available
// 8. Print final results
//
// Computer-vision logic belongs to the other modules.
// ============================================================


// ============================================================
// CORE
// ============================================================

import {
    initializePoseLandmarker
} from "./core/initializePoseLandmarker.js";

import {
    processVideo
} from "./core/processVideo.js";


// ============================================================
// DETECTION
// ============================================================

import {
    detectSquatReps
} from "./detection/detectSquatReps.js";

import {
    detectBicepCurlReps
} from "./detection/detectBicepCurlReps.js";

import {
    checkSideViewQuality
} from "./detection/checkSideViewQuality.js";


// ============================================================
// ANALYSIS
// ============================================================

import {
    analyzeRep
} from "./analysis/analyzeRep.js";

import {
    analyzeBicepCurlRep
} from "./analysis/analyzeBicepCurlRep.js";


// IMPORTANT
// ------------------------------------------------------------
// This is temporary.
//
// We are testing the bicep curl pipeline before building
// the actual exercise-selection UI.
//
// Change this to:
//
// "squat"
//
// when you want to test the existing squat pipeline.
//
// Change this to:
//
// "bicep-curl"
//
// when testing the curl detector.
// ============================================================



// ============================================================
// SHARED STATE
// ============================================================

import {
    getPoseHistory,
    getSelectedExercise,
    setSelectedExercise,

    setVideo,
    setCanvas,
    setCtx,

    setVideoFile,
    setVideoURL,
    setVideoDimensions,
    setVideoDuration,

    setIsProcessingVideo,
    setIsVideoAnalysisComplete,

    setAnalysisStatus,

    setSideViewQuality,

    setCompleteReps,
    setAnalyzedReps,

    resetAnalysisState
} from "./state.js";

import {
    createWorkout,
    buildWorkoutRecord,
    isLoggedIn
} from "./db.js";


// ============================================================
// DOM ELEMENTS
// ============================================================

const videoInput =
    document.getElementById("videoInput");

const video =
    document.getElementById("video");

const canvas =
    document.getElementById("canvas");

const uploadArea =
    document.getElementById("uploadArea");

const analysisStatusElement =
    document.getElementById("analysisStatus");

function updateAnalysisStatusUI(status) {

    if (!analysisStatusElement) {
        return;
    }

    const statusMessages = {
        loading: "Initializing AI",
        idle: "Ready for analysis",
        processing: "Processing movement",
        analyzing: "Analyzing form",
        complete: "Analysis complete",
        error: "Analysis error"
    };

    analysisStatusElement.textContent =
        statusMessages[status] ??
        "Ready for analysis";
}

const analyzerWorkspace =
    document.getElementById("analyzerWorkspace");

const scoreRingElement =
    document.getElementById("scoreRing");

const scoreVerdictElement =
    document.getElementById("scoreVerdict");

const workspaceStateByStatus = {
    loading: "idle",
    idle: "idle",
    processing: "analyzing",
    analyzing: "analyzing",
    complete: "results",
    error: "error"
};

const WORKSPACE_COPY = {
    idle: {
        step: "02", label: "Video upload",
        title: "Show us your <em>movement.</em>",
        sub: "Record from a clear side view for the most reliable analysis."
    },
    analyzing: {
        step: "02", label: "Analysis",
        title: "Reading your <em>form…</em>",
        sub: "We're tracking every joint while your video plays."
    },
    results: {
        step: "03", label: "Your report",
        title: "Here's your <em>form report.</em>",
        sub: "Scores, a rep-by-rep breakdown and coaching notes from your set."
    },
    error: {
        step: "02", label: "Analysis",
        title: "Let's try <em>that again.</em>",
        sub: "We couldn't get a reliable read on this video."
    }
};

function applyWorkspaceCopy(state) {

    const copy = WORKSPACE_COPY[state] ?? WORKSPACE_COPY.idle;

    const step = document.getElementById("wsStep");
    const label = document.getElementById("wsEyebrow");
    const title = document.getElementById("wsTitle");
    const sub = document.getElementById("wsSub");

    if (step) step.textContent = copy.step;
    if (label) label.textContent = copy.label;
    if (title) title.innerHTML = copy.title;
    if (sub) sub.textContent = copy.sub;
}

function setWorkspaceState(next) {

    if (!analyzerWorkspace || analyzerWorkspace.dataset.state === next) {
        return;
    }

    analyzerWorkspace.dataset.state = next;

    if (next !== "results") {
        delete analyzerWorkspace.dataset.tier;
    }

    applyWorkspaceCopy(next);

    if (next === "results") {
        renderResults();
    }
}

function syncWorkspaceState(status) {

    if (!analyzerWorkspace) {
        return;
    }

    const current = analyzerWorkspace.dataset.state;
    const next = workspaceStateByStatus[status] ?? "idle";

    // Late AI initialization must not pull the user back to the upload view.
    if (next === "idle" && current !== "idle") return;

    // An error before any video exists should not hide the upload view.
    if (next === "error" && !video.getAttribute("src")) return;

    // Replaying a finished video fires "processing" again: keep the results.
    // A new upload sets the state itself.
    if (next === "analyzing" && (current === "results" || current === "error")) return;

    setWorkspaceState(next);
}

function updateAnalysisStatus(status) {

    setAnalysisStatus(status);

    updateAnalysisStatusUI(status);

    syncWorkspaceState(status);
}

// ============================================================
// CANVAS / VIDEO ALIGNMENT
// ============================================================

function syncCanvasToVideo() {
    const videoStage =
        video.closest(".video-stage");

    if (!videoStage || !video.videoWidth || !video.videoHeight) {
        return;
    }

    const videoRect =
        video.getBoundingClientRect();

    const stageRect =
        videoStage.getBoundingClientRect();

    canvas.style.left =
        `${videoRect.left - stageRect.left}px`;

    canvas.style.top =
        `${videoRect.top - stageRect.top}px`;

    canvas.style.width =
        `${videoRect.width}px`;

    canvas.style.height =
        `${videoRect.height}px`;
}

window.addEventListener(
    "resize",
    syncCanvasToVideo
);

const exerciseCards =
    document.querySelectorAll(".exercise-card");

const selectedExerciseLabel =
    document.getElementById("selectedExerciseLabel");

const currentExerciseLabel =
    document.getElementById("currentExerciseLabel");

const repCountElement =
    document.getElementById("repCount");

const formScoreElement =
    document.getElementById("formScore");

const rangeOfMotionElement =
    document.getElementById("rangeOfMotion");

const tempoElement =
    document.getElementById("tempo");

const analysisFeedbackText =
    document.getElementById("analysisFeedbackText");

// ============================================================
// UPDATE ANALYZER METRICS
// ============================================================

let latestAnalyzedReps = [];

function averageOf(reps, ...keys) {

    const values = [];

    reps.forEach((rep) => {
        for (const key of keys) {
            const raw = rep?.[key];
            if (raw == null) continue;
            const value = Number(raw);
            if (Number.isFinite(value)) {
                values.push(value);
                return;
            }
        }
    });

    return values.length
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : null;
}

function updateAnalyzerMetrics(analyzedReps) {

    latestAnalyzedReps = Array.isArray(analyzedReps) ? analyzedReps : [];

    const reps = latestAnalyzedReps;

    if (analysisFeedbackText) {
        analysisFeedbackText.innerHTML = "";
    }

    if (reps.length === 0) {
        setText(repCountElement, "0");
        setText(formScoreElement, "—");
        setText(rangeOfMotionElement, "—");
        setText(tempoElement, "—");
        return;
    }

    const score = averageOf(reps, "formScore");
    const rom = averageOf(reps, "rangeOfMotion", "rom");
    const tempo = averageOf(reps, "duration");

    setText(repCountElement, String(reps.length));
    setText(formScoreElement, score !== null ? score.toFixed(1) : "—");
    setText(rangeOfMotionElement, rom !== null ? `${rom.toFixed(1)}°` : "—");
    setText(tempoElement, tempo !== null ? `${tempo.toFixed(1)}s` : "—");

    const feedback = [...new Set(
        reps
            .flatMap((rep) => Array.isArray(rep.feedback) ? rep.feedback : [])
            .filter((text) => typeof text === "string" && text.trim().length > 0)
    )];

    if (!analysisFeedbackText) {
        return;
    }

    if (feedback.length === 0) {
        const item = document.createElement("div");
        item.className = "analysis-feedback-item";
        item.textContent = "No specific form feedback available.";
        analysisFeedbackText.appendChild(item);
        return;
    }

    feedback.forEach((text) => {

        const normalized = text.toLowerCase();

        const isPositive =
            normalized.startsWith("good ") ||
            normalized.startsWith("great ") ||
            normalized.startsWith("excellent ") ||
            normalized.includes("good squat mechanics");

        const item = document.createElement("div");

        item.className = isPositive
            ? "analysis-feedback-item is-positive"
            : "analysis-feedback-item is-correction";

        item.textContent = text;

        analysisFeedbackText.appendChild(item);
    });
}


// ============================================================
// EXERCISE SELECTION
// ============================================================

exerciseCards.forEach((card) => {
    card.addEventListener("click", () => {
        const exercise = card.dataset.exercise;

        if (!exercise) {
            return;
        }

        setSelectedExercise(exercise);

        exerciseCards.forEach((item) => {
            item.classList.remove("is-selected");
        });

        card.classList.add("is-selected");

        const exerciseName =
            exercise === "bicep-curl"
                ? "Bicep Curl"
                : "Squat";

        if (selectedExerciseLabel) {
            selectedExerciseLabel.textContent =
                `${exerciseName} selected`;
        }

        if (currentExerciseLabel) {
            currentExerciseLabel.textContent =
                exerciseName;
        }

        console.log(
            "Exercise selected:",
            getSelectedExercise()
        );
    });
});

const revealItems = document.querySelectorAll(".exercise-card, .coming-soon-card");

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.15 });

revealItems.forEach((el, i) => {
    el.style.setProperty("--delay", `${i * 80}ms`);
    el.classList.add("reveal");
    revealObserver.observe(el);
});

// ============================================================
// BASIC VALIDATION
// ============================================================

if (!videoInput) {

    throw new Error(
        "videoInput element was not found in index.html"
    );

}


if (!video) {

    throw new Error(
        "video element was not found in index.html"
    );

}


if (!canvas) {

    throw new Error(
        "canvas element was not found in index.html"
    );

}


// ============================================================
// CANVAS CONTEXT
// ============================================================

const ctx =
    canvas.getContext("2d");

if (!ctx) {

    throw new Error(
        "Could not create 2D canvas context."
    );

}


// ============================================================
// REGISTER DOM WITH SHARED STATE
// ============================================================
//
// IMPORTANT
// ------------------------------------------------------------
// processVideo.js does NOT create its own video/canvas.
// It gets them from state.js.
//
// Therefore this must happen before processing begins.
// ============================================================

setVideo(video);

setCanvas(canvas);

setCtx(ctx);


// ============================================================
// LOCAL VIDEO URL
// ============================================================

let currentVideoURL = null;


// ============================================================
// APPLICATION INITIALIZATION
// ============================================================

async function initializeApplication() {

    try {

        console.log(
            "================================"
        );

        console.log(
            "INITIALIZING FITNESS AI"
        );

        console.log(
            "================================"
        );


        console.log(
            "Selected exercise:",
            getSelectedExercise()
        );


        updateAnalysisStatus(
            "loading"
        );


        await initializePoseLandmarker();


        updateAnalysisStatus(
            "idle"
        );


        console.log(
            "Application initialized."
        );

    }

    catch (error) {

        updateAnalysisStatus(
            "error"
        );


        console.error(
            "Application initialization failed:",
            error
        );

    }

}


// ============================================================
// VIDEO SELECTION
// ============================================================

videoInput.addEventListener(
    "change",
    async (event) => {

        const file =
            event.target.files?.[0];


        if (!file) {
            return;
        }


        console.log(
            "================================"
        );

        console.log(
            "NEW VIDEO SELECTED"
        );

        console.log(
            "================================"
        );


        console.log(
            "Exercise:",
            getSelectedExercise()
        );


        console.log(
            "File:",
            file.name
        );

        console.log(
            "Type:",
            file.type
        );

        console.log(
            "Size:",
            (file.size / 1024 / 1024).toFixed(2),
            "MB"
        );


        // ====================================================
        // STOP PREVIOUS PROCESSING
        // ====================================================

        setIsProcessingVideo(
            false
        );


        video.pause();


        // ====================================================
        // RESET PREVIOUS ANALYSIS
        // ====================================================

        resetAnalysisState();


        // ====================================================
        // RELEASE OLD OBJECT URL
        // ====================================================

        if (currentVideoURL) {

            URL.revokeObjectURL(
                currentVideoURL
            );

            currentVideoURL = null;

        }


        // ====================================================
        // STORE FILE
        // ====================================================

        setVideoFile(
            file
        );


        // ====================================================
        // CREATE NEW OBJECT URL
        // ====================================================

        currentVideoURL =
            URL.createObjectURL(
                file
            );


        setVideoURL(
            currentVideoURL
        );


        video.src =
            currentVideoURL;


        video.load();


        // ====================================================
        // VIDEO METADATA
        // ====================================================

        video.onloadedmetadata =
            async () => {

                console.log(
                    "================================"
                );

                console.log(
                    "VIDEO METADATA LOADED"
                );

                console.log(
                    "================================"
                );


                console.log(
                    "Resolution:",
                    video.videoWidth,
                    "x",
                    video.videoHeight
                );


                console.log(
                    "Duration:",
                    video.duration,
                    "seconds"
                );


                // ------------------------------------------------
                // STORE VIDEO INFORMATION
                // ------------------------------------------------

                setVideoDimensions(
                    video.videoWidth,
                    video.videoHeight
                );


                setVideoDuration(
                    video.duration
                );


                // ------------------------------------------------
                // MATCH CANVAS TO VIDEO
                // ------------------------------------------------

                canvas.width =
                    video.videoWidth;

                canvas.height =
                    video.videoHeight;

                syncCanvasToVideo();


                // ------------------------------------------------
                // CLEAR OLD SKELETON
                // ------------------------------------------------

                ctx.clearRect(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );


                // ------------------------------------------------
                // STATUS
                // ------------------------------------------------

                updateAnalysisStatus(
                    "processing"
                );

                // ------------------------------------------------
                // FRESH LANDMARKER FOR THIS VIDEO
                // ------------------------------------------------

                if (!(await prepareLandmarkerForNewVideo())) {
                    return;
                }


                // ------------------------------------------------
                // START PLAYBACK
                // ------------------------------------------------

                try {

                    await video.play();


                    console.log(
                        "Video playback started."
                    );

                }

                catch (error) {

                    console.warn(
                        "Automatic playback failed."
                    );

                    console.warn(
                        "Press play manually."
                    );

                    console.error(
                        error
                    );

                }

            };

    }
);

// ============================================================
// DRAG AND DROP VIDEO UPLOAD
// ============================================================

if (uploadArea) {

    uploadArea.addEventListener(
        "dragover",
        (event) => {

            event.preventDefault();

            uploadArea.classList.add(
                "is-dragging"
            );

        }
    );


    uploadArea.addEventListener(
        "dragleave",
        () => {

            uploadArea.classList.remove(
                "is-dragging"
            );

        }
    );


    uploadArea.addEventListener(
        "drop",
        (event) => {

            event.preventDefault();

            uploadArea.classList.remove(
                "is-dragging"
            );


            const file =
                event.dataTransfer.files?.[0];


            if (!file) {
                return;
            }


            if (!file.type.startsWith("video/")) {

                console.warn(
                    "Dropped file is not a video."
                );

                return;

            }


            const dataTransfer =
                new DataTransfer();

            dataTransfer.items.add(file);

            videoInput.files =
                dataTransfer.files;


            videoInput.dispatchEvent(
                new Event(
                    "change",
                    {
                        bubbles: true
                    }
                )
            );

        }
    );

}


// ============================================================
// VIDEO PLAY
// ============================================================
//
// If the video is resumed after a pause,
// processing resumes as well.
// ============================================================

video.addEventListener(
    "play",
    () => {

        if (video.ended) {
            return;
        }


        const workspaceState = analyzerWorkspace?.dataset.state;

        if (workspaceState === "results" || workspaceState === "error") {
            return;
        }


        console.log(
            "Starting / resuming pose analysis..."
        );


        setIsProcessingVideo(
            true
        );


        updateAnalysisStatus(
            "processing"
        );


        requestAnimationFrame(
            processVideo
        );

    }
);


// ============================================================
// VIDEO PAUSE
// ============================================================
//
// IMPORTANT:
// We DO NOT reset poseHistory here.
//
// Pausing a video must not destroy accumulated
// analysis data.
// ============================================================

video.addEventListener(
    "pause",
    () => {

        setIsProcessingVideo(
            false
        );


        // Do not reset analysis state.

    }
);


// ============================================================
// VIDEO ENDED
// ============================================================

video.addEventListener(
    "ended",
    () => {

        setIsProcessingVideo(
            false
        );

        const workspaceState = analyzerWorkspace?.dataset.state;

        if (workspaceState === "results" || workspaceState === "error") {
            return;
        }


        console.log(
            "================================"
        );

        console.log(
            "VIDEO ANALYSIS FINISHED"
        );

        console.log(
            "================================"
        );


        console.log(
            "Exercise:",
            getSelectedExercise()
        );


        // ====================================================
        // GET FRAME DATA
        // ====================================================
        //
        // poseHistory is the canonical frame-data store.
        //
        // It contains the processed MediaPipe pose frames
        // that were collected during video playback.
        // ====================================================

        const poseHistory =
            getPoseHistory();


        console.log(
            "Processed pose frames:",
            poseHistory.length
        );


        // ====================================================
        // NO FRAME DATA
        // ====================================================

        if (
            poseHistory.length === 0
        ) {

            console.warn(
                "No pose frames were collected."
            );


            updateAnalysisStatus(
                "error"
            );


            return;

        }


        // ====================================================
        // EXERCISE ROUTING
        // ====================================================
        //
        // IMPORTANT
        // ----------------------------------------------------
        // Squat and bicep curl have different:
        //
        // - side-view requirements
        // - movement signals
        // - repetition logic
        // - form metrics
        //
        // Therefore we must NOT run the squat pipeline
        // on a bicep curl video.
        // ====================================================


        // ====================================================
        // SQUAT PIPELINE
        // ====================================================

        if (
            getSelectedExercise() === "squat"
        ) {

            console.log(
                "================================"
            );

            console.log(
                "RUNNING SQUAT PIPELINE"
            );

            console.log(
                "================================"
            );


            // ==================================================
            // SQUAT SIDE VIEW QUALITY
            // ==================================================

            let sideViewResult = null;


            try {

                sideViewResult =
                    checkSideViewQuality(
                        poseHistory
                    );

            }

            catch (error) {

                console.error(
                    "Side-view quality check failed:",
                    error
                );


                updateAnalysisStatus(
                    "error"
                );


                return;

            }


            // ==================================================
            // STORE / PRINT SIDE VIEW QUALITY
            // ==================================================

            if (
                sideViewResult &&
                Number.isFinite(
                    sideViewResult.score
                )
            ) {

                setSideViewQuality(
                    sideViewResult.score
                );


                console.log(
                    "Side-view quality:",
                    sideViewResult.score.toFixed(3)
                );

            }


            // ==================================================
            // SQUAT SIDE VIEW VALIDATION
            // ==================================================

            if (
                sideViewResult &&
                sideViewResult.valid === false
            ) {

                console.warn(
                    "================================"
                );

                console.warn(
                    "SIDE VIEW REJECTED"
                );

                console.warn(
                    "================================"
                );


                console.warn(
                    "Please upload a proper side-view squat video."
                );


                updateAnalysisStatus(
                    "error"
                );


                return;

            }


            // ==================================================
            // DETECT SQUAT REPS
            // ==================================================

            let reps = [];


            try {

                reps =
                    detectSquatReps(
                        poseHistory
                    );

            }

            catch (error) {

                console.error(
                    "Squat detection failed:",
                    error
                );


                updateAnalysisStatus(
                    "error"
                );


                return;

            }


            // ==================================================
            // VALIDATE REP RESULT
            // ==================================================

            if (
                !Array.isArray(reps)
            ) {

                console.error(
                    "detectSquatReps() did not return an array."
                );


                updateAnalysisStatus(
                    "error"
                );


                return;

            }


            // ==================================================
            // STORE DETECTED REPS
            // ==================================================

            setCompleteReps(
                reps
            );

            latestRawReps = reps;


            console.log(
                "Total squat reps detected:",
                reps.length
            );


            // ==================================================
            // ANALYZE EVERY SQUAT REP
            // ==================================================

            updateAnalysisStatus(
                "analyzing"
            );


            const analyzedReps =
                reps
                    .map(
                        (rep) => {

                            try {

                                return analyzeRep(
                                    rep,
                                    poseHistory
                                );

                            }

                            catch (error) {

                                console.error(
                                    `Failed to analyze squat rep ${rep?.repNumber ??
                                    "unknown"
                                    }:`,
                                    error
                                );


                                return null;

                            }

                        }
                    )
                    .filter(
                        Boolean
                    );


            // ==================================================
            // STORE ANALYZED REPS
            // ==================================================

            setAnalyzedReps(
                analyzedReps
            );

            updateAnalyzerMetrics(analyzedReps);


            // ==================================================
            // DETAILED SQUAT REP ANALYSIS
            // ==================================================

            console.log(
                "================================"
            );

            console.log(
                "DETAILED SQUAT REP ANALYSIS"
            );

            console.log(
                "================================"
            );


            analyzedReps.forEach(
                (rep) => {

                    console.log(
                        `REP ${rep.repNumber}`
                    );


                    console.log(
                        "------------------------------"
                    );


                    console.log(
                        "Duration:",
                        Number.isFinite(
                            rep.duration
                        )
                            ? rep.duration.toFixed(2) +
                            " seconds"
                            : "Unavailable"
                    );


                    console.log(
                        "Primary side:",
                        rep.primarySide ??
                        "Unavailable"
                    );


                    console.log(
                        "Primary knee angle:",
                        Number.isFinite(
                            rep.primaryKneeAngle
                        )
                            ? rep.primaryKneeAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Primary hip angle:",
                        Number.isFinite(
                            rep.primaryHipAngle
                        )
                            ? rep.primaryHipAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Hip asymmetry:",
                        Number.isFinite(
                            rep.hipDifference
                        )
                            ? rep.hipDifference.toFixed(1) +
                            "°"
                            : "Not reliable"
                    );


                    console.log(
                        "Torso angle:",
                        Number.isFinite(
                            rep.torsoAngle
                        )
                            ? rep.torsoAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Depth ratio:",
                        Number.isFinite(
                            rep.depthRatio
                        )
                            ? rep.depthRatio.toFixed(3)
                            : "Unavailable"
                    );


                    console.log(
                        "Depth score:",
                        Number.isFinite(
                            rep.depthScore
                        )
                            ? rep.depthScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Knee score:",
                        Number.isFinite(
                            rep.kneeScore
                        )
                            ? rep.kneeScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Hip score:",
                        Number.isFinite(
                            rep.hipScore
                        )
                            ? rep.hipScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Torso score:",
                        Number.isFinite(
                            rep.torsoScore
                        )
                            ? rep.torsoScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Bottom stability:",
                        Number.isFinite(
                            rep.bottomStabilityScore
                        )
                            ? rep.bottomStabilityScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Form score:",
                        Number.isFinite(
                            rep.formScore
                        )
                            ? rep.formScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Feedback:",
                        Array.isArray(
                            rep.feedback
                        )
                            ? rep.feedback.join(
                                " | "
                            )
                            : "Unavailable"
                    );


                    // ------------------------------------------
                    // CONFIDENCE
                    // ------------------------------------------

                    if (
                        rep.confidence
                    ) {

                        console.log(
                            "Overall confidence:",
                            Number.isFinite(
                                rep.confidence.overall
                            )
                                ? (
                                    rep.confidence.overall *
                                    100
                                ).toFixed(1) + "%"
                                : "Unavailable"
                        );


                        console.log(
                            "Left side confidence:",
                            Number.isFinite(
                                rep.confidence.leftSide
                            )
                                ? (
                                    rep.confidence.leftSide *
                                    100
                                ).toFixed(1) + "%"
                                : "Unavailable"
                        );


                        console.log(
                            "Right side confidence:",
                            Number.isFinite(
                                rep.confidence.rightSide
                            )
                                ? (
                                    rep.confidence.rightSide *
                                    100
                                ).toFixed(1) + "%"
                                : "Unavailable"
                        );

                    }


                    console.log("");

                }
            );


            // ==================================================
            // FINAL SQUAT REP RESULTS
            // ==================================================

            console.log(
                "================================"
            );

            console.log(
                "SQUAT REP RESULTS"
            );

            console.log(
                "================================"
            );


            console.log(
                "Total reps detected:",
                reps.length
            );


            reps.forEach(
                (rep) => {

                    console.log(
                        `REP ${rep.repNumber}`
                    );


                    console.log(
                        "Start:",
                        Number.isFinite(
                            rep.startTime
                        )
                            ? rep.startTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Bottom:",
                        Number.isFinite(
                            rep.bottomTime
                        )
                            ? rep.bottomTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "End:",
                        Number.isFinite(
                            rep.endTime
                        )
                            ? rep.endTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Duration:",
                        Number.isFinite(
                            rep.duration
                        )
                            ? rep.duration.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Hip displacement:",
                        Number.isFinite(
                            rep.depth
                        )
                            ? rep.depth.toFixed(3)
                            : "Unavailable"
                    );


                    console.log(
                        "Minimum knee angle:",
                        Number.isFinite(
                            rep.bottomKneeAngle
                        )
                            ? rep.bottomKneeAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Bottom frame:",
                        Number.isInteger(
                            rep.bottomFrame
                        )
                            ? rep.bottomFrame
                            : "Unavailable"
                    );


                    console.log("");

                }
            );


            // ==================================================
            // COMPLETE DATA
            // ==================================================

            console.log(
                "Complete reps:",
                reps
            );


            console.log(
                "Analyzed reps:",
                analyzedReps
            );


            // ==================================================
            // MARK SQUAT ANALYSIS COMPLETE
            // ==================================================

            setIsVideoAnalysisComplete(
                true
            );


            setIsProcessingVideo(
                false
            );


            updateAnalysisStatus(
                "complete"
            );


            console.log(
                "================================"
            );

            console.log(
                "SQUAT ANALYSIS COMPLETE"
            );

            console.log(
                "================================"
            );


            return;

        }


        // ====================================================
        // BICEP CURL PIPELINE
        // ====================================================

        if (
            getSelectedExercise() === "bicep-curl"
        ) {

            console.log(
                "================================"
            );

            console.log(
                "RUNNING BICEP CURL PIPELINE"
            );

            console.log(
                "================================"
            );


            console.log(
                "Pose history frames:",
                poseHistory.length
            );


            // ==================================================
            // IMPORTANT
            // --------------------------------------------------
            // DO NOT run the squat side-view check here.
            //
            // The current squat side-view checker evaluates
            // hip and knee separation.
            //
            // Bicep curls require shoulder / elbow / wrist
            // visibility instead.
            //
            // A curl-specific side-view checker will be added
            // later.
            // ==================================================


            // ==================================================
            // DETECT BICEP CURL REPS
            // ==================================================

            let reps = [];


            try {

                console.log(
                    "Starting bicep curl rep detection..."
                );


                reps =
                    detectBicepCurlReps();


            }

            catch (error) {

                console.error(
                    "Bicep curl detection failed:",
                    error
                );


                updateAnalysisStatus(
                    "error"
                );


                return;

            }


            // ==================================================
            // VALIDATE REP RESULT
            // ==================================================

            if (
                !Array.isArray(reps)
            ) {

                console.error(
                    "detectBicepCurlReps() did not return an array."
                );


                updateAnalysisStatus(
                    "error"
                );


                return;

            }


            // ==================================================
            // STORE DETECTED REPS
            // ==================================================

            setCompleteReps(
                reps
            );

            latestRawReps = reps;


            // ==================================================
            // ANALYZE EVERY BICEP CURL REP
            // ==================================================

            updateAnalysisStatus(
                "analyzing"
            );


            console.log(
                "================================"
            );

            console.log(
                "STARTING BICEP CURL FORM ANALYSIS"
            );

            console.log(
                "================================"
            );


            const analyzedReps =
                reps
                    .map(
                        (rep) => {

                            try {

                                return analyzeBicepCurlRep(
                                    rep,
                                    poseHistory
                                );

                            }

                            catch (error) {

                                console.error(
                                    `Failed to analyze bicep curl rep ${rep?.repNumber ??
                                    "unknown"
                                    }:`,
                                    error
                                );


                                return null;

                            }

                        }
                    )
                    .filter(
                        Boolean
                    );


            // ==================================================
            // STORE ANALYZED CURL REPS
            // ==================================================

            setAnalyzedReps(
                analyzedReps
            );

            updateAnalyzerMetrics(analyzedReps);

            console.log(
                "================================"
            );

            console.log(
                "BICEP CURL REP DETECTION RESULT"
            );

            console.log(
                "================================"
            );


            console.log(
                "Total reps detected:",
                reps.length
            );


            // ==================================================
            // PRINT EVERY CURL REP
            // ==================================================

            reps.forEach(
                (rep) => {

                    console.log(
                        `REP ${rep.repNumber}`
                    );


                    console.log(
                        "------------------------------"
                    );


                    console.log(
                        "Side:",
                        rep.primarySide ??
                        rep.side ??
                        "Unavailable"
                    );


                    console.log(
                        "Start:",
                        Number.isFinite(
                            rep.startTime
                        )
                            ? rep.startTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Top:",
                        Number.isFinite(
                            rep.topTime
                        )
                            ? rep.topTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Bottom:",
                        Number.isFinite(
                            rep.bottomTime
                        )
                            ? rep.bottomTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "End:",
                        Number.isFinite(
                            rep.endTime
                        )
                            ? rep.endTime.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Duration:",
                        Number.isFinite(
                            rep.duration
                        )
                            ? rep.duration.toFixed(2) +
                            " s"
                            : "Unavailable"
                    );


                    console.log(
                        "Top elbow angle:",
                        Number.isFinite(
                            rep.topElbowAngle
                        )
                            ? rep.topElbowAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Bottom elbow angle:",
                        Number.isFinite(
                            rep.bottomElbowAngle
                        )
                            ? rep.bottomElbowAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "ROM:",
                        Number.isFinite(
                            rep.rom
                        )
                            ? rep.rom.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Top frame:",
                        rep.topIndex ?? "Unavailable"
                    );

                    console.log(
                        "Bottom frame:",
                        rep.bottomIndex ?? "Unavailable"
                    );


                    console.log("");

                }
            );


            // ==================================================
            // COMPLETE CURL DATA
            // ==================================================

            console.log(
                "Complete reps:",
                reps
            );


            // ==================================================
            // BICEP CURL FORM ANALYSIS COMPLETE
            // ==================================================

            console.log(
                "================================"
            );

            console.log(
                "BICEP CURL FORM ANALYSIS RESULTS"
            );

            console.log(
                "================================"
            );


            analyzedReps.forEach(
                (rep) => {

                    console.log(
                        `REP ${rep.repNumber}`
                    );


                    console.log(
                        "------------------------------"
                    );


                    console.log(
                        "Side:",
                        rep.side ??
                        "Unavailable"
                    );


                    console.log(
                        "Duration:",
                        Number.isFinite(
                            rep.duration
                        )
                            ? rep.duration.toFixed(2) +
                            " seconds"
                            : "Unavailable"
                    );


                    console.log(
                        "Top elbow angle:",
                        Number.isFinite(
                            rep.topAngle
                        )
                            ? rep.topAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Bottom elbow angle:",
                        Number.isFinite(
                            rep.bottomAngle
                        )
                            ? rep.bottomAngle.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "ROM:",
                        Number.isFinite(
                            rep.rom
                        )
                            ? rep.rom.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Elbow stability score:",
                        Number.isFinite(
                            rep.elbowStability?.score
                        )
                            ? rep.elbowStability.score.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Maximum elbow drift:",
                        Number.isFinite(
                            rep.elbowStability?.maxDrift
                        )
                            ? rep.elbowStability.maxDrift.toFixed(3)
                            : "Unavailable"
                    );


                    console.log(
                        "Torso score:",
                        Number.isFinite(
                            rep.torso?.score
                        )
                            ? rep.torso.score.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Maximum torso lean:",
                        Number.isFinite(
                            rep.torso?.maxLean
                        )
                            ? rep.torso.maxLean.toFixed(1) +
                            "°"
                            : "Unavailable"
                    );


                    console.log(
                        "Total ROM score:",
                        Number.isFinite(
                            rep.totalRom?.score
                        )
                            ? rep.totalRom.score.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Tempo score:",
                        Number.isFinite(
                            rep.tempo?.score
                        )
                            ? rep.tempo.score.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Form score:",
                        Number.isFinite(
                            rep.formScore
                        )
                            ? rep.formScore.toFixed(1)
                            : "Unavailable"
                    );


                    console.log(
                        "Confidence:",
                        Number.isFinite(
                            rep.confidence
                        )
                            ? rep.confidence.toFixed(1) +
                            "%"
                            : "Unavailable"
                    );


                    console.log(
                        "Feedback:",
                        Array.isArray(
                            rep.feedback
                        )
                            ? rep.feedback.join(
                                " | "
                            )
                            : "Unavailable"
                    );


                    console.log("");

                }
            );


            console.log(
                "Analyzed curl reps:",
                analyzedReps
            );


            // ==================================================
            // MARK CURL DETECTION COMPLETE
            // ==================================================

            setIsVideoAnalysisComplete(
                true
            );


            setIsProcessingVideo(
                false
            );


            updateAnalysisStatus(
                "complete"
            );


            console.log(
                "================================"
            );

            console.log(
                "BICEP CURL ANALYSIS COMPLETE"
            );

            console.log(
                "================================"
            );


            return;

        }


        // ====================================================
        // UNKNOWN EXERCISE
        // ====================================================

        console.error(
            "Unknown exercise:",
            getSelectedExercise()
        );


        updateAnalysisStatus(
            "error"
        );

    }
);

// ============================================================
// BICEP CURL PIPELINE
// ============================================================

// ... existing bicep curl code ...


// ============================================================
// NAVBAR / MOBILE NAVIGATION
// ============================================================

const navMenuToggle =
    document.querySelector(".nav-menu-toggle");

const mobileNav =
    document.getElementById("mobileNav");

const mobileNavLinks =
    document.querySelectorAll(".mobile-nav-links a");

const mobileNavCTA =
    document.querySelector(".mobile-nav-cta");


function setMobileNavState(isOpen) {

    if (!navMenuToggle || !mobileNav) {
        return;
    }

    navMenuToggle.classList.toggle(
        "is-open",
        isOpen
    );

    mobileNav.classList.toggle(
        "is-open",
        isOpen
    );

    navMenuToggle.setAttribute(
        "aria-expanded",
        String(isOpen)
    );

    navMenuToggle.setAttribute(
        "aria-label",
        isOpen
            ? "Close navigation menu"
            : "Open navigation menu"
    );

    mobileNav.setAttribute(
        "aria-hidden",
        String(!isOpen)
    );

    document.body.classList.toggle(
        "mobile-nav-open",
        isOpen
    );
}


function closeMobileNav() {
    setMobileNavState(false);
}


if (navMenuToggle && mobileNav) {

    navMenuToggle.addEventListener(
        "click",
        () => {

            const isOpen =
                navMenuToggle.getAttribute(
                    "aria-expanded"
                ) === "true";

            setMobileNavState(!isOpen);
        }
    );


    mobileNavLinks.forEach((link) => {

        link.addEventListener(
            "click",
            () => {

                const href = link.getAttribute("href");

                // Close menu for same-page navigation.
                if (href && href.startsWith("#")) {
                    closeMobileNav();
                }

                // For page navigation such as history.html,
                // let the browser navigate naturally.
            }
        );

    });


    if (mobileNavCTA) {

        mobileNavCTA.addEventListener(
            "click",
            () => {
                closeMobileNav();
            }
        );

    }


    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {
                closeMobileNav();
            }

        }
    );


    document.addEventListener(
        "click",
        (event) => {

            if (!mobileNav.classList.contains("is-open")) {
                return;
            }

            const clickedInsideHeader =
                event.target.closest(".site-header");

            if (!clickedInsideHeader) {
                closeMobileNav();
            }

        }
    );


    window.addEventListener(
        "resize",
        () => {

            if (window.innerWidth > 950) {
                closeMobileNav();
            }

        }
    );

}
// ============================================================
// HERO METRIC ANIMATION
// ============================================================

function animateHeroMetrics() {

    const formScore = document.getElementById("heroFormScore");
    const kneeAngle = document.getElementById("heroKneeAngle");

    if (!formScore || !kneeAngle) {
        return;
    }

    const formScoreTarget = 96;
    const kneeAngleTarget = 82;

    const animationDuration = 1600;
    const startTime = performance.now();

    formScore.textContent = "0";
    kneeAngle.textContent = "0°";

    function easeOutCubic(progress) {
        return 1 - Math.pow(1 - progress, 3);
    }

    function updateRing(score) {

        formScore.style.background = `
            radial-gradient(
                circle,
                rgba(255, 255, 255, 0.98) 0 62%,
                transparent 63%
            ),
            conic-gradient(
                #B3E0DA 0 ${score}%,
                rgba(151, 211, 205, 0.24) ${score}% 100%
            )
        `;
    }

    function animate(currentTime) {

        const elapsed = currentTime - startTime;

        const rawProgress = Math.min(
            elapsed / animationDuration,
            1
        );

        const progress = easeOutCubic(rawProgress);

        const currentScore = Math.round(
            formScoreTarget * progress
        );

        const currentAngle = Math.round(
            kneeAngleTarget * progress
        );

        formScore.textContent = currentScore;
        updateRing(currentScore);

        kneeAngle.textContent = `${currentAngle}°`;

        if (rawProgress < 1) {

            requestAnimationFrame(animate);

        } else {

            formScore.textContent = "96";
            kneeAngle.textContent = "82°";

            updateRing(96);
        }
    }

    requestAnimationFrame(animate);
}


// Start hero metric animation.
animateHeroMetrics();


// ============================================================
// ANALYZER WORKSPACE — TWO-STATE UI (v2)
// ============================================================

const fileNameElement = document.getElementById("fileName");
const fileMetaElement = document.getElementById("fileMeta");
const dropErrorElement = document.getElementById("dropError");
const replaceVideoButton = document.getElementById("replaceVideoBtn");
const removeVideoButton = document.getElementById("removeVideoBtn");
const analyzeAnotherButton = document.getElementById("analyzeAnotherBtn");
const retryVideoButton = document.getElementById("retryVideoBtn");
const progressElement = document.querySelector(".ws-progress");
const videoStageElement = video.closest(".video-stage");

const scoreSummaryElement = document.getElementById("scoreSummary");
const heroChipsElement = document.getElementById("heroChips");
const repDotsElement = document.getElementById("repDots");
const repStripElement = document.getElementById("repStrip");
const insightCountsElement = document.getElementById("insightCounts");
const priorityFixElement = document.getElementById("priorityFix");
const priorityTextElement = document.getElementById("priorityText");

let resultsAnimated = false;
let landmarkerHasBeenUsed = false;


// ---------- helpers ----------

function setText(element, text) {
    if (element) element.textContent = text;
}

function formatDuration(seconds) {
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = String(total % 60).padStart(2, "0");
    return `${m}:${s}`;
}

function formatSize(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function scrollWorkspaceIntoView() {
    analyzerWorkspace?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showDropError(message) {
    if (!dropErrorElement) return;
    dropErrorElement.textContent = message;
    dropErrorElement.hidden = false;
}

function hideDropError() {
    if (dropErrorElement) dropErrorElement.hidden = true;
}

function tierOf(score) {
    return score >= 75 ? "high" : score >= 60 ? "mid" : "low";
}

function verdictOf(score) {
    return score >= 90 ? "Excellent"
        : score >= 75 ? "Good"
            : score >= 60 ? "Fair"
                : "Needs work";
}


// ---------- reset ----------

function resetResultsUI() {

    resetSaveButton();

    resultsAnimated = false;
    latestAnalyzedReps = [];

    setText(repCountElement, "0");
    setText(formScoreElement, "—");
    setText(rangeOfMotionElement, "—");
    setText(tempoElement, "—");

    scoreRingElement?.style.setProperty("--score", "0");

    if (analyzerWorkspace) delete analyzerWorkspace.dataset.tier;

    setText(scoreVerdictElement, "Measuring…");
    setText(scoreSummaryElement, "Tracking every joint as the video plays.");

    [heroChipsElement, repDotsElement, repStripElement,
        insightCountsElement, analysisFeedbackText].forEach((el) => {
            if (el) el.innerHTML = "";
        });

    if (priorityFixElement) priorityFixElement.hidden = true;

    progressElement?.style.setProperty("--progress", "0");
}


// ---------- count-up animation ----------

function animateMetricValue(element, onFrame) {

    if (!element) return;

    const finalText = element.textContent.trim();
    const match = finalText.match(/^(-?\d+(?:\.\d+)?)(.*)$/);

    if (!match) return;

    const target = parseFloat(match[1]);
    const suffix = match[2];
    const decimals = (match[1].split(".")[1] || "").length;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        onFrame?.(target);
        return;
    }

    const duration = 1100;
    const start = performance.now();

    function frame(now) {

        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = target * eased;

        element.textContent = value.toFixed(decimals) + suffix;
        onFrame?.(value);

        if (t < 1) {
            requestAnimationFrame(frame);
        } else {
            element.textContent = finalText;
            onFrame?.(target);
        }
    }

    requestAnimationFrame(frame);
}

function animateMetricValues() {

    if (resultsAnimated) return;
    resultsAnimated = true;

    animateMetricValue(repCountElement);
    animateMetricValue(rangeOfMotionElement);
    animateMetricValue(tempoElement);

    animateMetricValue(formScoreElement, (value) => {
        scoreRingElement?.style.setProperty(
            "--score",
            Math.min(100, value).toFixed(1)
        );
    });
}


// ---------- render the finished report ----------

function renderInsights() {

    const list = analysisFeedbackText;

    const fixes = [...list.querySelectorAll(".is-correction")];
    const goods = [...list.querySelectorAll(".is-positive")];

    const makeLabel = (kind, text) => {
        const label = document.createElement("div");
        label.className = `rs-group-label rs-group-label--${kind}`;
        label.textContent = text;
        return label;
    };

    if (fixes.length) list.appendChild(makeLabel("fix", `Fix next · ${fixes.length}`));
    if (goods.length) list.appendChild(makeLabel("good", `Doing well · ${goods.length}`));

    insightCountsElement.innerHTML = "";

    if (fixes.length) {
        const chip = document.createElement("span");
        chip.className = "rs-count rs-count--fix";
        chip.textContent = `${fixes.length} to refine`;
        insightCountsElement.appendChild(chip);
    }

    if (goods.length) {
        const chip = document.createElement("span");
        chip.className = "rs-count rs-count--good";
        chip.textContent = `${goods.length} strong`;
        insightCountsElement.appendChild(chip);
    }

    if (fixes.length) {
        priorityTextElement.textContent = fixes[0].textContent;
        priorityFixElement.hidden = false;
    } else {
        priorityFixElement.hidden = true;
    }

    return { fixes, goods };
}

// ---------- per-rep breakdown ----------

const repDetailElement = document.getElementById("repDetail");

let latestRawReps = [];     // raw detector output (start / bottom / end times)
let repRecords = [];        // analyzed + raw data merged, one entry per rep
let segmentWatcher = null;

const esc = (value) =>
    String(value).replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));

function num(value) {
    if (value == null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function confidenceOf(rep) {
    const c = rep.confidence;
    if (typeof c === "number") return c <= 1 ? c * 100 : c;
    if (c && Number.isFinite(c.overall)) return c.overall * 100;
    return null;
}

function formatClock(seconds) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(1).padStart(4, "0");
    return `${m}:${s}`;
}

function isPositiveFeedback(text) {
    const t = text.toLowerCase();
    return t.startsWith("good ") || t.startsWith("great ") ||
        t.startsWith("excellent ") || t.includes("good squat mechanics");
}

function formatTile(value, fmt) {

    if (fmt === "text") {
        if (value == null || value === "") return null;
        const text = String(value);
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    const n = num(value);
    if (n === null) return null;

    switch (fmt) {
        case "deg": return `${n.toFixed(1)}°`;
        case "ratio": return n.toFixed(3);
        case "sec": return `${n.toFixed(2)}s`;
        case "pct": return `${Math.round(n)}%`;
        default: return n.toFixed(1);
    }
}

// What to show for each exercise. A row or tile is skipped automatically
// if the rep has no value for it, so a missing field never breaks the UI.
const REP_METRICS = {

    squat: {
        mid: "bottomTime",
        phases: ["Descent", "Ascent"],
        scores: [
            { label: "Depth", short: "Depth", get: (r) => r.depthScore },
            { label: "Knee position", short: "Knee", get: (r) => r.kneeScore },
            { label: "Hip position", short: "Hip", get: (r) => r.hipScore },
            { label: "Torso control", short: "Torso", get: (r) => r.torsoScore },
            { label: "Bottom stability", short: "Stability", get: (r) => r.bottomStabilityScore }
        ],
        tiles: [
            { label: "Knee angle", fmt: "deg", get: (r) => r.primaryKneeAngle ?? r.bottomKneeAngle },
            { label: "Hip angle", fmt: "deg", get: (r) => r.primaryHipAngle },
            { label: "Torso angle", fmt: "deg", get: (r) => r.torsoAngle },
            { label: "Depth ratio", fmt: "ratio", get: (r) => r.depthRatio },
            { label: "Hip asymmetry", fmt: "deg", get: (r) => r.hipDifference },
            { label: "Duration", fmt: "sec", get: (r) => r.duration },
            { label: "Camera side", fmt: "text", get: (r) => r.primarySide },
            { label: "Tracking confidence", fmt: "pct", get: confidenceOf }
        ]
    },

    "bicep-curl": {
        mid: "topTime",
        phases: ["Curl up", "Lower"],
        scores: [
            { label: "Elbow stability", short: "Elbow", get: (r) => r.elbowStability?.score },
            { label: "Torso control", short: "Torso", get: (r) => r.torso?.score },
            { label: "Range of motion", short: "ROM", get: (r) => r.totalRom?.score },
            { label: "Tempo", short: "Tempo", get: (r) => r.tempo?.score }
        ],
        tiles: [
            { label: "Top elbow angle", fmt: "deg", get: (r) => r.topAngle ?? r.topElbowAngle },
            { label: "Bottom elbow angle", fmt: "deg", get: (r) => r.bottomAngle ?? r.bottomElbowAngle },
            { label: "Range of motion", fmt: "deg", get: (r) => r.rom },
            { label: "Max elbow drift", fmt: "ratio", get: (r) => r.elbowStability?.maxDrift },
            { label: "Max torso lean", fmt: "deg", get: (r) => r.torso?.maxLean },
            { label: "Duration", fmt: "sec", get: (r) => r.duration },
            { label: "Arm", fmt: "text", get: (r) => r.side ?? r.primarySide },
            { label: "Tracking confidence", fmt: "pct", get: confidenceOf }
        ]
    }
};

function radarSVG(axes, showAverage) {

    const n = axes.length;
    const cx = 140, cy = 118, r = 78;

    const angleOf = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

    const point = (i, value, radius = r) => {
        const rr = (radius * Math.max(0, Math.min(100, value))) / 100;
        return [cx + rr * Math.cos(angleOf(i)), cy + rr * Math.sin(angleOf(i))];
    };

    const fmt = (p) => p.map((c) => c.toFixed(1)).join(",");

    const poly = (values) => values.map((v, i) => fmt(point(i, v))).join(" ");

    const rings = [25, 50, 75, 100]
        .map((p) => `<polygon class="ring" points="${poly(axes.map(() => p))}"/>`)
        .join("");

    const spokes = axes
        .map((_, i) => {
            const [x, y] = point(i, 100);
            return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`;
        })
        .join("");

    const average = showAverage
        ? `<polygon class="avg" points="${poly(axes.map((a) => a.avg ?? a.value))}"/>`
        : "";

    const dots = axes
        .map((a, i) => {
            const [x, y] = point(i, a.value);
            return `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`;
        })
        .join("");

    const labels = axes
        .map((a, i) => {
            const cos = Math.cos(angleOf(i));
            const x = cx + (r + 18) * cos;
            const y = cy + (r + 18) * Math.sin(angleOf(i)) + 4;
            const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
            return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}">${esc(a.short)}</text>`;
        })
        .join("");

    return `<svg viewBox="0 0 280 240" role="img" aria-label="Score profile for this rep">
        ${rings}${spokes}${average}
        <polygon class="shape" points="${poly(axes.map((a) => a.value))}"/>
        ${dots}${labels}
    </svg>`;
}

function watchRep(start, end) {

    if (segmentWatcher) {
        video.removeEventListener("timeupdate", segmentWatcher);
        segmentWatcher = null;
    }

    video.pause();
    video.currentTime = Math.max(0, start - 0.15);

    // the skeleton is only drawn live during analysis
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (Number.isFinite(end)) {

        segmentWatcher = () => {
            if (video.currentTime >= end + 0.1) {
                video.pause();
                video.removeEventListener("timeupdate", segmentWatcher);
                segmentWatcher = null;
            }
        };

        video.addEventListener("timeupdate", segmentWatcher);
    }

    video.play().catch(() => { });

    if (window.innerWidth <= 950) {
        document.querySelector(".ws-video-card")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function renderRepDetail(index) {

    const rec = repRecords[index];

    if (!rec || !repDetailElement) return;

    const d = rec.data;
    const cfg = REP_METRICS[getSelectedExercise()] ?? REP_METRICS.squat;
    const multi = repRecords.length > 1;

    const formScore = num(d.formScore);
    const tier = formScore !== null ? tierOf(formScore) : "high";

    // ----- score breakdown -----

    const axes = cfg.scores
        .map((s) => {

            const value = num(s.get(d));

            const others = repRecords
                .map((r) => num(s.get(r.data)))
                .filter((v) => v !== null);

            const avg = others.length
                ? others.reduce((sum, v) => sum + v, 0) / others.length
                : null;

            return { ...s, value, avg };
        })
        .filter((s) => s.value !== null);

    const rowsHTML = axes.map((a) => `
        <div class="rd-row" data-tier="${tierOf(a.value)}">
            <div class="rd-row-top">
                <span>${esc(a.label)}</span>
                <strong>${Math.round(a.value)}</strong>
            </div>
            <div class="rd-track">
                <i style="--w:${Math.max(2, Math.min(100, a.value)).toFixed(1)}"></i>
                ${multi && a.avg !== null
            ? `<b style="--a:${Math.max(0, Math.min(100, a.avg)).toFixed(1)}" title="Set average ${Math.round(a.avg)}"></b>`
            : ""}
            </div>
        </div>`).join("");

    const bodyHTML = axes.length
        ? `<div class="rd-body">
               ${axes.length >= 3
            ? `<div class="rd-radar">${radarSVG(axes, multi)}</div>`
            : ""}
               <div class="rd-bars">
                   ${rowsHTML}
                   ${multi ? `<p class="rd-legend"><b></b> Your average across all reps</p>` : ""}
               </div>
           </div>`
        : "";

    // ----- timing -----

    const t0 = num(d.startTime);
    const t1 = num(d.endTime);
    const tm = num(d[cfg.mid]);

    const duration =
        num(d.duration) ??
        (t0 !== null && t1 !== null ? t1 - t0 : null);

    const timeText = [
        t0 !== null && t1 !== null
            ? `${formatClock(t0)} – ${formatClock(t1)}`
            : null,
        duration !== null ? `${duration.toFixed(1)}s` : null
    ].filter(Boolean).join(" · ");

    const seekTo = [t0, tm].find((v) => v !== null);

    const phasesHTML =
        t0 !== null && tm !== null && t1 !== null && t0 < tm && tm < t1
            ? `<div class="rd-section">
                   <span class="ws-label">Tempo split</span>
                   <div class="rd-phase-bar">
                       <span style="flex:${(tm - t0).toFixed(2)}"><b>${cfg.phases[0]}</b>${(tm - t0).toFixed(1)}s</span>
                       <span style="flex:${(t1 - tm).toFixed(2)}"><b>${cfg.phases[1]}</b>${(t1 - tm).toFixed(1)}s</span>
                   </div>
               </div>`
            : "";

    // ----- measurements -----

    const tiles = cfg.tiles
        .map((t) => ({ label: t.label, text: formatTile(t.get(d), t.fmt) }))
        .filter((t) => t.text !== null);

    const tilesHTML = tiles.length
        ? `<div class="rd-section">
               <span class="ws-label">Measurements</span>
               <div class="rd-tiles">
                   ${tiles.map((t) => `<div class="rd-tile"><span>${esc(t.label)}</span><strong>${esc(t.text)}</strong></div>`).join("")}
               </div>
           </div>`
        : "";

    // ----- notes for this rep -----

    const notes = (Array.isArray(d.feedback) ? d.feedback : [])
        .filter((t) => typeof t === "string" && t.trim().length > 0);

    const fixes = notes.filter((t) => !isPositiveFeedback(t));
    const goods = notes.filter(isPositiveFeedback);

    const noteHTML = (text, positive) =>
        `<div class="rd-note ${positive ? "is-positive" : "is-correction"}"><i>${positive ? "✓" : "!"}</i><span>${esc(text)}</span></div>`;

    const notesHTML = notes.length
        ? `<div class="rd-section">
               <span class="ws-label">Coach notes for this rep</span>
               <div class="rd-notes">
                   ${fixes.map((t) => noteHTML(t, false)).join("")}
                   ${goods.map((t) => noteHTML(t, true)).join("")}
               </div>
           </div>`
        : "";

    const emptyHTML = !axes.length && !tiles.length
        ? `<p class="rd-empty">No detailed measurements were returned for this rep.</p>`
        : "";

    repDetailElement.innerHTML = `
        <div class="rd" data-tier="${tier}">

            <div class="rd-head">

                <div class="rd-title">
                    <span class="ws-label">Rep ${index + 1} of ${repRecords.length}</span>
                    <h5>Rep ${esc(rec.n)}${formScore !== null ? `<span class="rd-badge">${verdictOf(formScore)}</span>` : ""}</h5>
                    ${timeText ? `<p class="rd-time">${timeText}</p>` : ""}
                    ${seekTo !== undefined
            ? `<button type="button" class="rd-watch">
                               <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1l9 5-9 5z"/></svg>
                               Watch this rep
                           </button>`
            : ""}
                </div>

                ${formScore !== null
            ? `<div class="rd-score"><strong>${formScore.toFixed(1)}</strong><span>form score</span></div>`
            : ""}

            </div>

            ${bodyHTML}${phasesHTML}${tilesHTML}${notesHTML}${emptyHTML}

        </div>`;

    repDetailElement.querySelector(".rd-watch")
        ?.addEventListener("click", () => watchRep(seekTo, t1));
}

function selectRep(index) {

    repStripElement.querySelectorAll(".rs-rep").forEach((card, i) => {
        card.classList.toggle("is-active", i === index);
        card.setAttribute("aria-selected", String(i === index));
    });

    renderRepDetail(index);
}

function renderRepBreakdown(reps) {

    // dots under the rep count
    repDotsElement.innerHTML = "";
    reps.slice(0, 12).forEach(() => repDotsElement.appendChild(document.createElement("i")));

    if (reps.length > 12) {
        const more = document.createElement("span");
        more.textContent = `+${reps.length - 12}`;
        repDotsElement.appendChild(more);
    }

    // merge analyzed reps with the raw detector output (times, bottom angle, ...)
    repRecords = reps.map((analyzed, i) => {

        const n = analyzed.repNumber ?? i + 1;

        const raw =
            latestRawReps.find((r) => r.repNumber === n) ??
            latestRawReps[i] ??
            {};

        return { n, data: { ...raw, ...analyzed } };
    });

    // best / lowest chips
    const scored = repRecords
        .map((rec) => ({ n: rec.n, score: num(rec.data.formScore) }))
        .filter((item) => item.score !== null);

    heroChipsElement.innerHTML = "";

    if (scored.length > 1) {

        const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
        const low = scored.reduce((a, b) => (b.score < a.score ? b : a));

        const addChip = (label, item) => {
            const chip = document.createElement("span");
            chip.className = "rs-chip";
            chip.innerHTML = `<b>${label}</b> Rep ${item.n} · ${item.score.toFixed(1)}`;
            heroChipsElement.appendChild(chip);
        };

        addChip("Best", best);
        if (low.n !== best.n) addChip("Lowest", low);
    }

    // rep selector
    repStripElement.innerHTML = "";

    repRecords.forEach((rec, i) => {

        const score = num(rec.data.formScore);

        const card = document.createElement("button");
        card.type = "button";
        card.className = "rs-rep";
        card.setAttribute("role", "tab");
        card.setAttribute("aria-label", `Show details for rep ${rec.n}`);

        if (score !== null) card.dataset.tier = tierOf(score);

        card.innerHTML = `
            <span class="rs-rep-n">Rep ${esc(rec.n)}</span>
            <span class="rs-rep-bar"><i style="--h:${score !== null ? Math.max(4, Math.min(100, score)) : 0}"></i></span>
            <strong>${score !== null ? Math.round(score) : "–"}</strong>`;

        card.addEventListener("click", () => selectRep(i));

        repStripElement.appendChild(card);
    });

    selectRep(0);
}

function renderResults() {

    const reps = latestAnalyzedReps;

    if (!reps.length) {
        setText(scoreVerdictElement, "No reps detected");
        setText(
            scoreSummaryElement,
            "We couldn't find a complete repetition. Try a side view with your full body in frame."
        );
        return;
    }

    const score = parseFloat(formScoreElement?.textContent);
    const hasScore = Number.isFinite(score);

    analyzerWorkspace.dataset.tier = hasScore ? tierOf(score) : "high";

    setText(scoreVerdictElement, hasScore ? verdictOf(score) : "Analysis complete");

    const { fixes, goods } = renderInsights();

    const repWord = reps.length === 1 ? "rep" : "reps";

    if (fixes.length) {
        setText(
            scoreSummaryElement,
            `${reps.length} ${repWord} analyzed. ${fixes.length} ${fixes.length === 1 ? "thing" : "things"} to refine.`
        );
    } else if (goods.length) {
        setText(scoreSummaryElement, `${reps.length} ${repWord} analyzed. No corrections needed.`);
    } else {
        setText(scoreSummaryElement, `${reps.length} ${repWord} analyzed.`);
    }

    renderRepBreakdown(reps);

    animateMetricValues();
}


// ---------- MediaPipe: fresh landmarker for every new video ----------
//
// The first video uses the landmarker created at page load.
// Every later video gets a new one, so stale timestamps / state from
// the previous video can't break pose detection.

async function prepareLandmarkerForNewVideo() {

    if (!landmarkerHasBeenUsed) {
        landmarkerHasBeenUsed = true;
        return true;
    }

    try {

        updateAnalysisStatus("loading");

        await initializePoseLandmarker();

        return true;

    } catch (error) {

        console.error("Could not re-initialize the pose landmarker:", error);

        updateAnalysisStatus("error");

        return false;
    }
}


// ---------- upload interactions ----------

// Lets the same file be chosen twice in a row (Replace).
videoInput.addEventListener("click", () => {
    videoInput.value = "";
});

// Runs right after the original change handler above.
videoInput.addEventListener("change", (event) => {

    const file = event.target.files?.[0];

    if (!file) return;

    hideDropError();
    resetResultsUI();

    setText(fileNameElement, file.name);
    setText(fileMetaElement, formatSize(file.size));

    setWorkspaceState("analyzing");

    scrollWorkspaceIntoView();
});

video.addEventListener("loadedmetadata", () => {

    if (!fileMetaElement || !Number.isFinite(video.duration)) return;

    const file = videoInput.files?.[0];

    fileMetaElement.textContent = [
        formatDuration(video.duration),
        `${video.videoWidth}×${video.videoHeight}`,
        file ? formatSize(file.size) : ""
    ].filter(Boolean).join(" · ");
});

// Unreadable / unsupported file.
video.addEventListener("error", () => {
    if (video.getAttribute("src")) {
        updateAnalysisStatus("error");
    }
});

// Progress follows playback, because analysis runs live while the video plays.
video.addEventListener("timeupdate", () => {

    if (analyzerWorkspace?.dataset.state !== "analyzing" || !video.duration) {
        return;
    }

    const percent = Math.min(100, Math.round((video.currentTime / video.duration) * 100));

    progressElement?.style.setProperty("--progress", String(percent));

    if (analysisStatusElement?.textContent.startsWith("Processing")) {
        analysisStatusElement.textContent = `Processing movement · ${percent}%`;
    }
});

// Keep the skeleton canvas aligned whenever the stage changes size.
if (videoStageElement && "ResizeObserver" in window) {
    new ResizeObserver(() => syncCanvasToVideo()).observe(videoStageElement);
}


// ---------- dropzone: click, keyboard, wrong file type ----------

if (uploadArea) {

    uploadArea.addEventListener("click", () => videoInput.click());

    uploadArea.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            videoInput.click();
        }
    });

    uploadArea.addEventListener("drop", (event) => {

        const file = event.dataTransfer?.files?.[0];

        if (file && !file.type.startsWith("video/")) {
            showDropError("That file isn't a video. Please choose an MP4 or WebM file.");
        } else {
            hideDropError();
        }
    });
}


// ---------- file bar + result actions ----------

function clearVideo() {

    setIsProcessingVideo(false);

    video.pause();

    resetAnalysisState();

    if (currentVideoURL) {
        URL.revokeObjectURL(currentVideoURL);
        currentVideoURL = null;
    }

    video.removeAttribute("src");
    video.load();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    videoInput.value = "";

    resetResultsUI();
    hideDropError();

    setWorkspaceState("idle");

    updateAnalysisStatus("idle");
}

replaceVideoButton?.addEventListener("click", () => videoInput.click());
analyzeAnotherButton?.addEventListener("click", () => videoInput.click());
retryVideoButton?.addEventListener("click", () => videoInput.click());
removeVideoButton?.addEventListener("click", clearVideo);


// ---------- auto-scroll when an exercise is chosen ----------

exerciseCards.forEach((card) => {
    card.addEventListener("click", () => {
        if (card.dataset.exercise) {
            scrollWorkspaceIntoView();
        }
    });
});


// ============================================================
// SAVE WORKOUT (IndexedDB)
// ============================================================

const saveWorkoutButton = document.getElementById("saveWorkoutBtn");
const saveStatusElement = document.getElementById("saveStatus");

const SAVE_STATUS_DEFAULT =
    "Want to compare? Save this set, then upload another.";

function resetSaveButton() {
    if (saveWorkoutButton) {
        saveWorkoutButton.disabled = false;
        saveWorkoutButton.textContent = "Save workout";
    }
    setText(saveStatusElement, SAVE_STATUS_DEFAULT);
}

saveWorkoutButton?.addEventListener("click", async () => {

    const reps = latestAnalyzedReps;

    if (!reps.length) {
        setText(saveStatusElement, "There is nothing to save yet.");
        return;
    }

    const exercise = getSelectedExercise();

    const summary = {
        formScore: averageOf(reps, "formScore"),
        repCount: reps.length,
        rangeOfMotion: averageOf(reps, "rangeOfMotion", "rom"),
        tempo: averageOf(reps, "duration")
    };

    const exerciseName = exercise === "bicep-curl" ? "Bicep Curl" : "Squat";

    try {

        saveWorkoutButton.disabled = true;

        await createWorkout({
            ...buildWorkoutRecord({ exercise, summary, reps }),
            title: `${exerciseName} session`,
            videoName: videoInput.files?.[0]?.name ?? null
        });

        saveWorkoutButton.textContent = "Saved ✓";

        setText(
            saveStatusElement,
            isLoggedIn()
                ? "Saved to your history."
                : "Saved on this device. Log in to keep it with your account."
        );

    } catch (error) {

        console.error("Could not save workout:", error);

        saveWorkoutButton.disabled = false;

        setText(saveStatusElement, "Couldn't save this workout. Please try again.");
    }
});

// ============================================================
// START APPLICATION
// ============================================================

initializeApplication();
