// ============================================================
// initializePoseLandmarker.js
// MediaPipe Pose Landmarker initialization
// ============================================================

import {
    FilesetResolver,
    PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";


import {
    setPoseLandmarker,
    setPoseLandmarkerReady,
    setAnalysisStatus
} from "../state.js";


// ============================================================
// INITIALIZE
// ============================================================

export async function initializePoseLandmarker() {

    try {

        console.log(
            "Loading MediaPipe..."
        );


        setAnalysisStatus(
            "loading"
        );


        // ----------------------------------------------------
        // LOAD WASM
        // ----------------------------------------------------

        const vision =
            await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
            );


        console.log(
            "MediaPipe WASM loaded."
        );


        // ----------------------------------------------------
        // CREATE LANDMARKER
        // ----------------------------------------------------

        const landmarker =
            await PoseLandmarker.createFromOptions(
                vision,
                {

                    baseOptions: {

                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

                    },


                    runningMode:
                        "VIDEO",


                    numPoses:
                        1,


                    minPoseDetectionConfidence:
                        0.5,


                    minPosePresenceConfidence:
                        0.5,


                    minTrackingConfidence:
                        0.5

                }
            );


        // ----------------------------------------------------
        // SAVE MODEL
        // ----------------------------------------------------

        setPoseLandmarker(
            landmarker
        );


        setPoseLandmarkerReady(
            true
        );


        setAnalysisStatus(
            "idle"
        );


        console.log(
            "Pose model loaded!"
        );


        return landmarker;

    }

    catch (error) {

        setPoseLandmarkerReady(
            false
        );


        setAnalysisStatus(
            "error"
        );


        console.error(
            "Failed to load Pose Landmarker:",
            error
        );


        throw error;

    }

}