// ============================================================
// detectSquatReps.js
// Squat repetition detection
// ============================================================

import {
    getPoseHistory,
    setCompleteReps,
    setDetectedRepCount
} from "../state.js";


// ============================================================
// CONFIGURATION
// ============================================================

const START_THRESHOLD = 0.025;

// Minimum movement required to recognize a squat rep.
// This is deliberately lower than the depth-quality
// threshold because shallow squats must still be counted.
const MIN_REP_MOVEMENT = 0.030;

const RETURN_THRESHOLD = 0.025;

const MIN_REP_DURATION = 0.55;

const BOTTOM_TIME_WINDOW = 0.20;

const MIN_VISIBILITY = 0.45;
const MIN_VALID_FRAMES = 10;

const REVERSAL_THRESHOLD = 0.008;

// ============================================================
// HELPERS
// ============================================================

function finite(value) {
    return (
        typeof value === "number" &&
        Number.isFinite(value)
    );
}


function clamp(value, min, max) {
    return Math.max(
        min,
        Math.min(max, value)
    );
}


// ============================================================
// DETERMINE RELIABLE SIDE
// ============================================================

function determineReliableSide(frames) {

    let leftScore = 0;
    let rightScore = 0;

    let leftCount = 0;
    let rightCount = 0;


    for (const frame of frames) {

        if (
            !frame ||
            !Array.isArray(frame.landmarks) ||
            frame.landmarks.length < 33
        ) {
            continue;
        }


        const lm = frame.landmarks;


        const leftVisibility = Math.min(
            finite(lm[23]?.visibility)
                ? lm[23].visibility
                : 0,

            finite(lm[25]?.visibility)
                ? lm[25].visibility
                : 0,

            finite(lm[27]?.visibility)
                ? lm[27].visibility
                : 0
        );


        const rightVisibility = Math.min(
            finite(lm[24]?.visibility)
                ? lm[24].visibility
                : 0,

            finite(lm[26]?.visibility)
                ? lm[26].visibility
                : 0,

            finite(lm[28]?.visibility)
                ? lm[28].visibility
                : 0
        );


        if (leftVisibility >= MIN_VISIBILITY) {

            leftScore += leftVisibility;
            leftCount++;

        }


        if (rightVisibility >= MIN_VISIBILITY) {

            rightScore += rightVisibility;
            rightCount++;

        }

    }


    const leftAverage =
        leftCount > 0
            ? leftScore / leftCount
            : 0;


    const rightAverage =
        rightCount > 0
            ? rightScore / rightCount
            : 0;


    console.log(
        "Primary-side visibility:",
        {
            left: leftAverage.toFixed(3),
            right: rightAverage.toFixed(3)
        }
    );


    if (
        leftCount >= 3 &&
        leftAverage >= rightAverage
    ) {
        return "left";
    }


    if (rightCount >= 3) {
        return "right";
    }


    return null;
}


// ============================================================
// SIDE INDICES
// ============================================================

function getSideIndices(side) {

    if (side === "right") {

        return {
            hip: 24,
            knee: 26,
            ankle: 28
        };

    }


    return {
        hip: 23,
        knee: 25,
        ankle: 27
    };
}


// ============================================================
// KNEE ANGLE
// ============================================================

function calculateKneeAngle(
    hip,
    knee,
    ankle
) {

    if (!hip || !knee || !ankle) {
        return null;
    }


    const ax =
        hip.x - knee.x;

    const ay =
        hip.y - knee.y;

    const bx =
        ankle.x - knee.x;

    const by =
        ankle.y - knee.y;


    const magnitudeA =
        Math.hypot(ax, ay);

    const magnitudeB =
        Math.hypot(bx, by);


    if (
        magnitudeA < 1e-6 ||
        magnitudeB < 1e-6
    ) {
        return null;
    }


    const cosine =
        clamp(
            (
                ax * bx +
                ay * by
            ) /
            (
                magnitudeA *
                magnitudeB
            ),
            -1,
            1
        );


    return (
        Math.acos(cosine) *
        180 /
        Math.PI
    );
}


// ============================================================
// BUILD MOVEMENT SIGNAL
// ============================================================

function buildSignal(
    frames,
    side
) {

    const indices =
        getSideIndices(side);


    const signal = [];


    for (
        let index = 0;
        index < frames.length;
        index++
    ) {

        const frame =
            frames[index];


        if (
            !frame ||
            !Array.isArray(frame.landmarks) ||
            frame.landmarks.length < 33
        ) {
            continue;
        }


        const hip =
            frame.landmarks[
            indices.hip
            ];

        const knee =
            frame.landmarks[
            indices.knee
            ];

        const ankle =
            frame.landmarks[
            indices.ankle
            ];


        if (!hip || !knee || !ankle) {
            continue;
        }


        if (
            !finite(hip.x) ||
            !finite(hip.y)
        ) {
            continue;
        }


        const visibility =
            Math.min(
                finite(hip.visibility)
                    ? hip.visibility
                    : 0,

                finite(knee.visibility)
                    ? knee.visibility
                    : 0,

                finite(ankle.visibility)
                    ? ankle.visibility
                    : 0
            );


        if (
            visibility <
            MIN_VISIBILITY
        ) {
            continue;
        }


        let kneeAngle = null;


        if (frame.angles) {

            kneeAngle =
                side === "left"
                    ? frame.angles.leftKnee
                    : frame.angles.rightKnee;

        }


        if (!finite(kneeAngle)) {

            kneeAngle =
                calculateKneeAngle(
                    hip,
                    knee,
                    ankle
                );

        }


        signal.push({

            // IMPORTANT:
            // Index inside original poseHistory
            sourceIndex: index,

            // Global/frame counter
            originalIndex:
                finite(frame.frame)
                    ? frame.frame
                    : index,

            time:
                finite(frame.time)
                    ? frame.time
                    : index / 30,

            hipY:
                hip.y,

            kneeAngle:
                finite(kneeAngle)
                    ? kneeAngle
                    : null,

            visibility,

            landmarks:
                frame.landmarks,

            angles:
                frame.angles || {}

        });

    }


    return signal;
}


// ============================================================
// MEDIAN SMOOTHING
// ============================================================

function smoothSignal(signal) {

    if (signal.length < 3) {

        return signal.map(frame => ({
            ...frame,
            smoothedHipY: frame.hipY
        }));

    }


    const WINDOW = 5;


    return signal.map(
        (frame, index) => {

            const start =
                Math.max(
                    0,
                    index -
                    Math.floor(WINDOW / 2)
                );


            const end =
                Math.min(
                    signal.length,
                    index +
                    Math.ceil(WINDOW / 2)
                );


            const values = [];


            for (
                let i = start;
                i < end;
                i++
            ) {

                if (
                    finite(
                        signal[i].hipY
                    )
                ) {

                    values.push(
                        signal[i].hipY
                    );

                }

            }


            if (!values.length) {

                return {
                    ...frame,
                    smoothedHipY: frame.hipY
                };

            }


            values.sort(
                (a, b) => a - b
            );


            const middle =
                Math.floor(
                    values.length / 2
                );


            const median =
                values.length % 2 === 0
                    ? (
                        values[middle - 1] +
                        values[middle]
                    ) / 2
                    : values[middle];


            return {
                ...frame,
                smoothedHipY: median
            };

        }
    );
}


// ============================================================
// STANDING REFERENCE
// ============================================================

function calculateStandingHipY(signal) {

    if (!signal.length) {
        return null;
    }


    /*
     * Use the highest/most-upright portion of the signal.
     *
     * Smaller normalized Y = higher hip.
     *
     * We take the lowest 20% of hip-Y values as candidates
     * for standing instead of assuming a single first frame.
     */

    const values =
        signal
            .map(
                frame =>
                    frame.smoothedHipY
            )
            .filter(finite);


    if (!values.length) {
        return null;
    }


    values.sort(
        (a, b) => a - b
    );


    const sampleCount =
        Math.max(
            5,
            Math.floor(
                values.length * 0.20
            )
        );


    const standingValues =
        values.slice(
            0,
            sampleCount
        );


    const middle =
        Math.floor(
            standingValues.length / 2
        );


    return standingValues.length % 2 === 0
        ? (
            standingValues[middle - 1] +
            standingValues[middle]
        ) / 2
        : standingValues[middle];
}

// ============================================================
// STANDING THIGH LENGTH
// ============================================================
//
// Uses the same upright portion of the signal that is used
// to establish standingHipY.
//
// This value is stored in the rep so analyzeRep() can normalize
// detector depth against the exact same standing reference.
//

function calculateStandingThighLength(
    signal,
    side
) {

    if (!signal.length) {
        return null;
    }

    const indices =
        getSideIndices(side);

    const candidates =
        signal
            .filter(frame =>
                finite(frame.smoothedHipY) &&
                Array.isArray(frame.landmarks)
            )
            .slice()
            .sort(
                (a, b) =>
                    a.smoothedHipY -
                    b.smoothedHipY
            );

    if (!candidates.length) {
        return null;
    }

    const sampleCount =
        Math.max(
            5,
            Math.floor(
                candidates.length * 0.20
            )
        );

    const standingCandidates =
        candidates.slice(
            0,
            sampleCount
        );

    const lengths = [];

    for (const frame of standingCandidates) {

        const hip =
            frame.landmarks[
            indices.hip
            ];

        const knee =
            frame.landmarks[
            indices.knee
            ];

        if (
            !hip ||
            !knee ||
            !finite(hip.x) ||
            !finite(hip.y) ||
            !finite(knee.x) ||
            !finite(knee.y)
        ) {
            continue;
        }

        const length =
            Math.hypot(
                hip.x - knee.x,
                hip.y - knee.y
            );

        if (
            finite(length) &&
            length > 1e-6
        ) {
            lengths.push(length);
        }
    }

    if (!lengths.length) {
        return null;
    }

    lengths.sort(
        (a, b) => a - b
    );

    const middle =
        Math.floor(
            lengths.length / 2
        );

    return lengths.length % 2 === 0
        ? (
            lengths[middle - 1] +
            lengths[middle]
        ) / 2
        : lengths[middle];
}


// ============================================================
// ADD DISPLACEMENT
// ============================================================

function addDisplacement(
    signal,
    standingHipY
) {

    return signal.map(
        frame => ({

            ...frame,

            displacement:
                frame.smoothedHipY -
                standingHipY

        })
    );
}


// ============================================================
// FIND TRUE BOTTOM
// ============================================================

function findTrueBottom(
    signal,
    deepestIndex,
    startSignalIndex,
    endSignalIndex
) {

    if (
        deepestIndex < 0 ||
        deepestIndex >= signal.length
    ) {
        return null;
    }


    const deepest =
        signal[deepestIndex];


    const candidates = [];


    for (
        let i = startSignalIndex;
        i <= endSignalIndex;
        i++
    ) {

        const frame =
            signal[i];


        if (
            Math.abs(
                frame.time -
                deepest.time
            ) >
            BOTTOM_TIME_WINDOW
        ) {
            continue;
        }


        if (
            !finite(frame.displacement)
        ) {
            continue;
        }


        candidates.push({
            index: i,

            // IMPORTANT:
            // This is the original poseHistory index.
            sourceIndex:
                frame.sourceIndex,

            frame
        });

    }


    // ========================================================
    // FALLBACK
    // ========================================================

    if (!candidates.length) {

        return {
            // poseHistory index
            index:
                deepest.sourceIndex,

            // signal index
            signalIndex:
                deepestIndex,

            frame:
                deepest
        };

    }


    // ========================================================
    // FIND FRAMES CLOSE TO DEEPEST POSITION
    // ========================================================

    const depthTolerance =
        0.015;


    const nearBottom =
        candidates.filter(
            candidate =>
                candidate.frame.displacement >=
                deepest.displacement -
                depthTolerance
        );


    let best =
        nearBottom.length
            ? nearBottom[0]
            : {
                index: deepestIndex,
                sourceIndex: deepest.sourceIndex,
                frame: deepest
            };


    // ========================================================
    // AMONG NEAR-BOTTOM FRAMES,
    // PREFER THE SMALLEST KNEE ANGLE
    // ========================================================

    for (
        const candidate of nearBottom
    ) {

        const currentAngle =
            candidate.frame.kneeAngle;

        const bestAngle =
            best.frame.kneeAngle;


        if (
            finite(currentAngle) &&
            (
                !finite(bestAngle) ||
                currentAngle < bestAngle
            )
        ) {

            best =
                candidate;

        }

    }


    // ========================================================
    // RETURN
    // ========================================================

    return {

        // IMPORTANT:
        // index = original poseHistory index
        index:
            best.sourceIndex,

        // signal index is kept separately
        // for debugging / diagnostics
        signalIndex:
            best.index,

        frame:
            best.frame
    };
}


// ============================================================
// DETECT SQUAT REPS
// ============================================================

export function detectSquatReps(
    inputFrames = null
) {

    console.log(
        "================================"
    );

    console.log(
        "SQUAT REP DETECTION STARTED"
    );

    console.log(
        "================================"
    );


    const frames =
        Array.isArray(inputFrames)
            ? inputFrames
            : getPoseHistory();


    if (
        !Array.isArray(frames) ||
        !frames.length
    ) {

        console.warn(
            "detectSquatReps: no pose history available"
        );


        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];

    }


    console.log(
        "Frames received:",
        frames.length
    );


    // ========================================================
    // PRIMARY SIDE
    // ========================================================

    const primarySide =
        determineReliableSide(
            frames
        );


    if (!primarySide) {

        console.warn(
            "detectSquatReps: unable to determine reliable side"
        );


        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];

    }


    console.log(
        "Primary side:",
        primarySide
    );


    // ========================================================
    // BUILD SIGNAL
    // ========================================================

    let signal =
        buildSignal(
            frames,
            primarySide
        );


    console.log(
        "Valid movement frames:",
        signal.length
    );


    if (
        signal.length <
        MIN_VALID_FRAMES
    ) {

        console.warn(
            "detectSquatReps: insufficient valid movement frames"
        );


        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];

    }


    // ========================================================
    // SMOOTH
    // ========================================================

    signal =
        smoothSignal(
            signal
        );


    // ========================================================
    // STANDING REFERENCE
    // ========================================================

    const standingHipY =
        calculateStandingHipY(
            signal
        );


    if (!finite(standingHipY)) {

        console.warn(
            "detectSquatReps: unable to establish standing hip position"
        );


        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];

    }

    const standingThighLength =
        calculateStandingThighLength(
            signal,
            primarySide
        );


    console.log(
        "Standing reference:",
        {
            standingHipY,
            standingThighLength
        }
    );


    console.log(
        "Standing hip Y:",
        standingHipY
    );


    // ========================================================
    // DISPLACEMENT
    // ========================================================

    signal =
        addDisplacement(
            signal,
            standingHipY
        );


    // ========================================================
    // STATE MACHINE
    // ========================================================

    const reps = [];


    let state =
        "STANDING";


    let currentRep =
        null;


    for (
        let i = 0;
        i < signal.length;
        i++
    ) {

        const frame =
            signal[i];


        const displacement =
            frame.displacement;


        if (!finite(displacement)) {
            continue;
        }


        // ====================================================
        // STANDING
        // ====================================================

        if (
            state ===
            "STANDING"
        ) {

            if (
                displacement >=
                START_THRESHOLD
            ) {

                currentRep = {

                    // Original poseHistory index
                    startSourceIndex:
                        frame.sourceIndex,

                    // Signal index
                    startSignalIndex:
                        i,

                    startFrame:
                        frame.originalIndex,

                    startTime:
                        frame.time,

                    // Signal index of deepest frame
                    deepestSignalIndex:
                        i,

                    // Original poseHistory index of deepest frame
                    deepestSourceIndex:
                        frame.sourceIndex,

                    maxHipDisplacement:
                        displacement,

                    minKneeAngle:
                        finite(frame.kneeAngle)
                            ? frame.kneeAngle
                            : Infinity

                };


                state =
                    "DESCENDING";


                console.log(
                    `Rep candidate started at frame ${frame.originalIndex}`
                );

            }


            continue;
        }


        // ====================================================
        // DESCENDING
        // ====================================================

        if (
            state ===
            "DESCENDING"
        ) {

            // Track deepest point reached so far.
            if (
                displacement >
                currentRep.maxHipDisplacement
            ) {

                currentRep.maxHipDisplacement =
                    displacement;

                currentRep.deepestSignalIndex =
                    i;

                currentRep.deepestSourceIndex =
                    frame.sourceIndex;

            }


            if (
                finite(frame.kneeAngle) &&
                frame.kneeAngle <
                currentRep.minKneeAngle
            ) {

                currentRep.minKneeAngle =
                    frame.kneeAngle;

            }


            /*
             * We do NOT require a particular depth
             * to enter the bottom phase.
             *
             * A shallow squat is still a squat.
             *
             * Once the displacement stops increasing
             * and begins returning toward standing,
             * we consider the movement to be ascending.
             */

            const peakDisplacement =
                currentRep.maxHipDisplacement;

            if (
                peakDisplacement -
                displacement >=
                REVERSAL_THRESHOLD
            ) {

                state =
                    "ASCENDING";

            }


            continue;
        }

                // ====================================================
        // ASCENDING
        // ====================================================

        if (
            state ===
            "ASCENDING"
        ) {

            // ------------------------------------------------
            // Keep tracking the deepest point
            // ------------------------------------------------

            if (
                displacement >
                currentRep.maxHipDisplacement
            ) {

                currentRep.maxHipDisplacement =
                    displacement;

                currentRep.deepestSignalIndex =
                    i;

                currentRep.deepestSourceIndex =
                    frame.sourceIndex;

            }


            // ------------------------------------------------
            // Track minimum knee angle
            // ------------------------------------------------

            if (
                finite(frame.kneeAngle) &&
                frame.kneeAngle <
                currentRep.minKneeAngle
            ) {

                currentRep.minKneeAngle =
                    frame.kneeAngle;

            }


            // ------------------------------------------------
            // Return toward standing
            // ------------------------------------------------

            if (
                displacement <=
                RETURN_THRESHOLD
            ) {

                const endTime =
                    frame.time;

                const duration =
                    endTime -
                    currentRep.startTime;

                const enoughDuration =
                    duration >=
                    MIN_REP_DURATION;

                const enoughMovement =
                    currentRep.maxHipDisplacement >=
                    MIN_REP_MOVEMENT;


                // ------------------------------------------------
                // ACCEPT REP
                // ------------------------------------------------

                if (
                    enoughDuration &&
                    enoughMovement
                ) {

                    const bottom =
                        findTrueBottom(
                            signal,
                            currentRep.deepestSignalIndex,
                            currentRep.startSignalIndex,
                            i
                        );


                    if (bottom) {

                        const rep = {

                            repNumber:
                                reps.length + 1,

                            primarySide,

                            standingHipY:
                                finite(standingHipY)
                                    ? standingHipY
                                    : null,

                            standingThighLength:
                                finite(standingThighLength)
                                    ? standingThighLength
                                    : null,


                            // ------------------------------------
                            // ARRAY INDEXES
                            // ------------------------------------

                            startIndex:
                                currentRep.startSourceIndex,

                            bottomIndex:
                                bottom.frame.sourceIndex,

                            endIndex:
                                frame.sourceIndex,


                            // ------------------------------------
                            // GLOBAL FRAME NUMBERS
                            // ------------------------------------

                            startFrame:
                                currentRep.startFrame,

                            bottomFrame:
                                bottom.frame.originalIndex,

                            endFrame:
                                frame.originalIndex,


                            // ------------------------------------
                            // TIMES
                            // ------------------------------------

                            startTime:
                                currentRep.startTime,

                            bottomTime:
                                bottom.frame.time,

                            endTime,

                            duration,


                            // ------------------------------------
                            // DEPTH
                            // ------------------------------------

                            depth:
                                currentRep.maxHipDisplacement,

                            maxHipDisplacement:
                                currentRep.maxHipDisplacement,


                            // ------------------------------------
                            // KNEE
                            // ------------------------------------

                            bottomKneeAngle:
                                finite(
                                    bottom.frame.kneeAngle
                                )
                                    ? bottom.frame.kneeAngle
                                    : null,

                            minimumKneeAngle:
                                finite(
                                    currentRep.minKneeAngle
                                )
                                    ? currentRep.minKneeAngle
                                    : null,


                            // ------------------------------------
                            // LANDMARKS / ANGLES
                            // ------------------------------------

                            bottomLandmarks:
                                bottom.frame.landmarks,

                            bottomAngles:
                                bottom.frame.angles || {}

                        };


                        reps.push(rep);


                        console.log(
                            `Rep ${rep.repNumber} completed`
                        );


                        console.log(
                            "Rep data:",
                            rep
                        );

                    }

                }


                // ------------------------------------------------
                // RESET STATE
                // ------------------------------------------------

                currentRep =
                    null;

                state =
                    "STANDING";

            }

            continue;
        }

    }


    // ========================================================
    // SUMMARY
    // ========================================================

    console.log(
        "================================"
    );

    console.log(
        "SQUAT DETECTION COMPLETE"
    );

    console.log(
        "================================"
    );


    console.log(
        "Total reps detected:",
        reps.length
    );


    setCompleteReps(
        reps
    );


    setDetectedRepCount(
        reps.length
    );


    return reps;

}