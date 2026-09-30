// ============================================================
// processVideo.js
// Main per-frame MediaPipe processing pipeline
// ============================================================
//
// Responsibilities:
// 1. Read the current video frame
// 2. Run MediaPipe pose detection
// 3. Smooth landmarks
// 4. Draw the skeleton
// 5. Store canonical frame data in poseHistory
//
// Rep detection and form analysis happen AFTER video processing:
// detectSquatReps() → analyzeRep()
//
// ============================================================

import {
    getPoseLandmarker,
    getPoseLandmarkerReady,

    getVideo,
    getCanvas,
    getCtx,

    getLastVideoTime,
    setLastVideoTime,

    setCurrentVideoTime,
    incrementCurrentFrame,

    addPoseHistory,

    setIsProcessingVideo
} from "../state.js";


import {
    smoothLandmarks
} from "../landmarks/smoothLandmarks.js";


import {
    calculateAngle
} from "../geometry/calculateAngle.js";


import {
    drawPose
} from "./drawPose.js";


// ============================================================
// PROCESS VIDEO
// ============================================================

export function processVideo() {

    const landmarker =
        getPoseLandmarker();

    const landmarkerReady =
        getPoseLandmarkerReady();

    const video =
        getVideo();

    const canvas =
        getCanvas();

    const ctx =
        getCtx();


    // ========================================================
    // SAFETY CHECKS
    // ========================================================

    if (
        !landmarkerReady ||
        !landmarker
    ) {

        requestAnimationFrame(
            processVideo
        );

        return;
    }


    if (!video) {

        requestAnimationFrame(
            processVideo
        );

        return;
    }


    if (
        video.paused ||
        video.ended
    ) {

        setIsProcessingVideo(
            false
        );

        return;
    }


    try {

        // ====================================================
        // CURRENT VIDEO TIME
        // ====================================================

        const currentTime =
            video.currentTime;


        setCurrentVideoTime(
            currentTime
        );


        // ====================================================
        // PREVENT DUPLICATE FRAME PROCESSING
        // ====================================================

        const lastVideoTime =
            getLastVideoTime();


        if (
            currentTime ===
            lastVideoTime
        ) {

            requestAnimationFrame(
                processVideo
            );

            return;
        }


        setLastVideoTime(
            currentTime
        );


        // ====================================================
        // MEDIAPIPE TIMESTAMP
        // ====================================================

        const timestampMs =
            Math.round(
                currentTime * 1000
            );


        // ====================================================
        // RUN POSE DETECTION
        // ====================================================

        const results =
            landmarker.detectForVideo(
                video,
                timestampMs
            );


        // ====================================================
        // VALIDATE RESULTS
        // ====================================================

        if (
            !results ||
            !results.landmarks ||
            results.landmarks.length === 0
        ) {

            requestAnimationFrame(
                processVideo
            );

            return;
        }


        const rawLandmarks =
            results.landmarks[0];


        if (
            !rawLandmarks ||
            rawLandmarks.length < 33
        ) {

            requestAnimationFrame(
                processVideo
            );

            return;
        }


        // ====================================================
        // TEMPORAL SMOOTHING
        // ====================================================

        const landmarks =
            smoothLandmarks(
                rawLandmarks
            );


        if (
            !landmarks ||
            landmarks.length < 33
        ) {

            requestAnimationFrame(
                processVideo
            );

            return;
        }


        // ====================================================
        // DRAW SKELETON
        // ====================================================

        if (
            canvas &&
            ctx
        ) {

            drawPose(
                landmarks
            );

        }


        // ====================================================
        // COPY LANDMARKS
        // ====================================================
        //
        // Never store the MediaPipe landmark objects directly.
        //

        const storedLandmarks =
            landmarks.map(
                (point) => ({

                    x:
                        point.x,

                    y:
                        point.y,

                    z:
                        point.z,

                    visibility:
                        point.visibility ?? 0,

                    presence:
                        point.presence ?? 0

                })
            );


        // ====================================================
        // CALCULATE BASIC ANGLES
        // ====================================================
        //
        // These are stored with each frame so the downstream
        // squat detector can reuse them.
        //

        const storedAngles = {

            leftKnee:
                calculateAngle(
                    storedLandmarks[23],
                    storedLandmarks[25],
                    storedLandmarks[27]
                ),

            rightKnee:
                calculateAngle(
                    storedLandmarks[24],
                    storedLandmarks[26],
                    storedLandmarks[28]
                ),

            leftHip:
                calculateAngle(
                    storedLandmarks[11],
                    storedLandmarks[23],
                    storedLandmarks[25]
                ),

            rightHip:
                calculateAngle(
                    storedLandmarks[12],
                    storedLandmarks[24],
                    storedLandmarks[26]
                )

        };


        // ====================================================
        // BUILD FRAME DATA
        // ====================================================

        const frameData = {

            frame:
                incrementCurrentFrame(),

            time:
                currentTime,

            landmarks:
                storedLandmarks,

            angles:
                storedAngles

        };


        // ====================================================
        // STORE CANONICAL FRAME DATA
        // ====================================================
        //
        // poseHistory is now the single source of truth.
        //

        addPoseHistory(
            frameData
        );


        // ====================================================
        // PROCESS NEXT VIDEO FRAME
        // ====================================================

        requestAnimationFrame(
            processVideo
        );

    }

    catch (error) {

        console.error(
            "Pose detection error:",
            error
        );


        requestAnimationFrame(
            processVideo
        );

    }

}