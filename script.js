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


// ============================================================
// DOM ELEMENTS
// ============================================================

const videoInput =
    document.getElementById("videoInput");

const video =
    document.getElementById("video");

const canvas =
    document.getElementById("canvas");

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

function updateAnalyzerMetrics(analyzedReps) {

    if (
        !Array.isArray(analyzedReps) ||
        analyzedReps.length === 0
    ) {

        if (repCountElement) {
            repCountElement.textContent = "0";
        }

        if (formScoreElement) {
            formScoreElement.textContent = "—";
        }

        if (rangeOfMotionElement) {
            rangeOfMotionElement.textContent = "—";
        }

        if (tempoElement) {
            tempoElement.textContent = "—";
        }

        if (analysisFeedbackText) {

            analysisFeedbackText.innerHTML = "";

            const feedbackItem =
                document.createElement("div");

            feedbackItem.className =
                "analysis-feedback-item";

            feedbackItem.textContent =
                "Upload a workout video to receive form feedback.";

            analysisFeedbackText.appendChild(
                feedbackItem
            );
        }

        return;
    }


    // --------------------------------------------------------
    // REP COUNT
    // --------------------------------------------------------

    const repCount =
        analyzedReps.length;


    // --------------------------------------------------------
    // AVERAGE FORM SCORE
    // --------------------------------------------------------

    const formScores =
        analyzedReps
            .map(
                (rep) =>
                    Number(rep.formScore)
            )
            .filter(
                (score) =>
                    Number.isFinite(score)
            );


    const averageFormScore =
        formScores.length > 0
            ? formScores.reduce(
                (sum, score) =>
                    sum + score,
                0
            ) / formScores.length
            : null;


    // --------------------------------------------------------
    // UPDATE REP COUNT
    // --------------------------------------------------------

    if (repCountElement) {
        repCountElement.textContent =
            repCount;
    }


    // --------------------------------------------------------
    // UPDATE FORM SCORE
    // --------------------------------------------------------

    if (formScoreElement) {

        formScoreElement.textContent =
            averageFormScore !== null
                ? averageFormScore.toFixed(1)
                : "—";
    }


    // --------------------------------------------------------
    // RANGE OF MOTION
    // --------------------------------------------------------

    const rangeOfMotionValues =
        analyzedReps
            .map(
                (rep) =>
                    Number(rep.rangeOfMotion)
            )
            .filter(
                (value) =>
                    Number.isFinite(value)
            );

    const averageRangeOfMotion =
        rangeOfMotionValues.length > 0
            ? rangeOfMotionValues.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / rangeOfMotionValues.length
            : null;

    if (rangeOfMotionElement) {
        rangeOfMotionElement.textContent =
            averageRangeOfMotion !== null
                ? `${averageRangeOfMotion.toFixed(1)}°`
                : "—";
    }


    // ============================================================
    // TEMPO
    // ============================================================

    const durationValues =
        analyzedReps
            .map(
                (rep) =>
                    Number(rep.duration)
            )
            .filter(
                (value) =>
                    Number.isFinite(value)
            );

    const averageDuration =
        durationValues.length > 0
            ? durationValues.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / durationValues.length
            : null;

    if (tempoElement) {
        tempoElement.textContent =
            averageDuration !== null
                ? `${averageDuration.toFixed(1)}s`
                : "—";
    }

    // ============================================================
    // AI FEEDBACK
    // ============================================================

    // ============================================================
    // AI FEEDBACK
    // ============================================================

    const feedbackItems =
        analyzedReps
            .flatMap(
                (rep) =>
                    Array.isArray(rep.feedback)
                        ? rep.feedback
                        : []
            )
            .filter(
                (feedback) =>
                    typeof feedback === "string" &&
                    feedback.trim().length > 0
            );

    const uniqueFeedback =
        [...new Set(feedbackItems)];

    if (analysisFeedbackText) {

        analysisFeedbackText.innerHTML = "";

        if (uniqueFeedback.length > 0) {

            uniqueFeedback.forEach((feedback) => {

                const feedbackItem =
                    document.createElement("div");

                const normalizedFeedback =
                    feedback.toLowerCase();

                const isPositive =
                    normalizedFeedback.startsWith("good ") ||
                    normalizedFeedback.includes("good squat mechanics");

                feedbackItem.className =
                    isPositive
                        ? "analysis-feedback-item is-positive"
                        : "analysis-feedback-item is-correction";

                feedbackItem.textContent =
                    feedback;

                analysisFeedbackText.appendChild(
                    feedbackItem
                );

            });

        } else {

            const feedbackItem =
                document.createElement("div");

            feedbackItem.className =
                "analysis-feedback-item";

            feedbackItem.textContent =
                "No specific form feedback available.";

            analysisFeedbackText.appendChild(
                feedbackItem
            );

        }
    }
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


        setAnalysisStatus(
            "loading"
        );


        await initializePoseLandmarker();


        setAnalysisStatus(
            "idle"
        );


        console.log(
            "Application initialized."
        );

    }

    catch (error) {

        setAnalysisStatus(
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

                setAnalysisStatus(
                    "processing"
                );


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


        console.log(
            "Starting / resuming pose analysis..."
        );


        setIsProcessingVideo(
            true
        );


        setAnalysisStatus(
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


            setAnalysisStatus(
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


                setAnalysisStatus(
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


                setAnalysisStatus(
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


                setAnalysisStatus(
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


                setAnalysisStatus(
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


            console.log(
                "Total squat reps detected:",
                reps.length
            );


            // ==================================================
            // ANALYZE EVERY SQUAT REP
            // ==================================================

            setAnalysisStatus(
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


            setAnalysisStatus(
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


                setAnalysisStatus(
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


                setAnalysisStatus(
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


            // ==================================================
            // ANALYZE EVERY BICEP CURL REP
            // ==================================================

            setAnalysisStatus(
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


            setAnalysisStatus(
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


        setAnalysisStatus(
            "error"
        );

    }
);


// ============================================================
// START APPLICATION
// ============================================================

initializeApplication();