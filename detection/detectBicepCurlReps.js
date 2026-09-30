import {
    getPoseHistory,
    setCompleteReps,
    setDetectedRepCount
} from "../state.js";


/* =========================================================
   BICEP CURL DETECTOR
   =========================================================

   V1 exercise:
   - Standing strict barbell curl
   - Side view
   - One reliable arm is analyzed

   State flow:

   EXTENDED
       ↓
   CURLING_UP
       ↓
   TOP
       ↓
   LOWERING
       ↓
   EXTENDED
       ↓
   REP COMPLETE
*/


/* =========================================================
   CONFIGURATION
   ========================================================= */

// Bottom of curl
const BOTTOM_ANGLE_TARGET = 150;

// Top of curl
const TOP_ANGLE_TARGET = 60;

// Minimum total elbow-angle movement
const MIN_ROM = 80;

// Minimum time for a complete repetition
const MIN_REP_DURATION = 0.45;

// Minimum meaningful angle change before considering
// that the arm has actually started moving.
const REVERSAL_THRESHOLD = 3;

// Small window used when locating the true top/bottom.
const EXTREME_TIME_WINDOW = 0.20;

// Minimum visibility required for the three landmarks
// used by the elbow-angle calculation.
const MIN_VISIBILITY = 0.45;

// Minimum number of valid frames required to analyze
// an individual side.
const MIN_VALID_FRAMES = 10;


/* =========================================================
   LANDMARK INDICES
   ========================================================= */

const SIDES = {
    left: {
        shoulder: 11,
        elbow: 13,
        wrist: 15
    },

    right: {
        shoulder: 12,
        elbow: 14,
        wrist: 16
    }
};


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}


function calculateAngle(a, b, c) {
    if (!a || !b || !c) return null;

    const ab = {
        x: a.x - b.x,
        y: a.y - b.y
    };

    const cb = {
        x: c.x - b.x,
        y: c.y - b.y
    };

    const dot =
        ab.x * cb.x +
        ab.y * cb.y;

    const magAB =
        Math.sqrt(
            ab.x * ab.x +
            ab.y * ab.y
        );

    const magCB =
        Math.sqrt(
            cb.x * cb.x +
            cb.y * cb.y
        );

    if (magAB === 0 || magCB === 0) {
        return null;
    }

    let cosine =
        dot / (magAB * magCB);

    cosine = Math.max(
        -1,
        Math.min(1, cosine)
    );

    const angle =
        Math.acos(cosine) *
        180 /
        Math.PI;

    return Number(angle.toFixed(1));
}


/* =========================================================
   SIDE RELIABILITY
   ========================================================= */

function determineReliableSide(frames) {

    const results = {
        left: {
            count: 0,
            visibilityTotal: 0
        },

        right: {
            count: 0,
            visibilityTotal: 0
        }
    };


    for (const frame of frames) {

        if (
            !frame ||
            !Array.isArray(frame.landmarks) ||
            frame.landmarks.length < 17
        ) {
            continue;
        }


        for (const side of ["left", "right"]) {

            const indices = SIDES[side];

            const shoulder =
                frame.landmarks[indices.shoulder];

            const elbow =
                frame.landmarks[indices.elbow];

            const wrist =
                frame.landmarks[indices.wrist];


            if (!shoulder || !elbow || !wrist) {
                continue;
            }


            const visibilityValues = [
                shoulder.visibility ?? 1,
                elbow.visibility ?? 1,
                wrist.visibility ?? 1
            ];


            const minimumVisibility =
                Math.min(...visibilityValues);


            if (
                minimumVisibility <
                MIN_VISIBILITY
            ) {
                continue;
            }


            const averageVisibility =
                visibilityValues.reduce(
                    (sum, value) => sum + value,
                    0
                ) / visibilityValues.length;


            results[side].count++;

            results[side].visibilityTotal +=
                averageVisibility;
        }
    }


    const leftAverage =
        results.left.count > 0
            ? results.left.visibilityTotal /
            results.left.count
            : 0;

    const rightAverage =
        results.right.count > 0
            ? results.right.visibilityTotal /
            results.right.count
            : 0;


    const leftValid =
        results.left.count >= MIN_VALID_FRAMES;

    const rightValid =
        results.right.count >= MIN_VALID_FRAMES;


    if (!leftValid && !rightValid) {
        return null;
    }


    if (leftValid && !rightValid) {
        return "left";
    }


    if (rightValid && !leftValid) {
        return "right";
    }


    return leftAverage >= rightAverage
        ? "left"
        : "right";
}


/* =========================================================
   BUILD ELBOW-ANGLE SIGNAL
   ========================================================= */

function buildSignal(frames, side) {

    const indices = SIDES[side];

    const signal = [];


    for (
        let sourceIndex = 0;
        sourceIndex < frames.length;
        sourceIndex++
    ) {

        const frame = frames[sourceIndex];


        if (
            !frame ||
            !Array.isArray(frame.landmarks) ||
            frame.landmarks.length < 17
        ) {
            continue;
        }


        const shoulder =
            frame.landmarks[indices.shoulder];

        const elbow =
            frame.landmarks[indices.elbow];

        const wrist =
            frame.landmarks[indices.wrist];


        if (!shoulder || !elbow || !wrist) {
            continue;
        }


        const visibility = Math.min(
            shoulder.visibility ?? 1,
            elbow.visibility ?? 1,
            wrist.visibility ?? 1
        );


        if (visibility < MIN_VISIBILITY) {
            continue;
        }


        let elbowAngle = null;


        /*
         * Prefer the angle already calculated by
         * processVideo.js when available.
         *
         * The detector still calculates the value
         * itself as a fallback.
         */

        if (
            frame.angles &&
            isFiniteNumber(frame.angles[`${side}Elbow`])
        ) {
            elbowAngle =
                frame.angles[`${side}Elbow`];
        }


        if (!isFiniteNumber(elbowAngle)) {

            elbowAngle =
                calculateAngle(
                    shoulder,
                    elbow,
                    wrist
                );
        }


        if (!isFiniteNumber(elbowAngle)) {
            continue;
        }


        signal.push({
            sourceIndex,
            time: isFiniteNumber(frame.time)
                ? frame.time
                : null,

            elbowAngle,

            shoulder,
            elbow,
            wrist,

            landmarks: frame.landmarks,
            angles: frame.angles ?? null,

            visibility
        });
    }


    return signal;
}


/* =========================================================
   LIGHT TEMPORAL SMOOTHING
   ========================================================= */

function median(values) {

    if (!values.length) {
        return null;
    }

    const sorted = [...values].sort(
        (a, b) => a - b
    );

    const middle =
        Math.floor(sorted.length / 2);


    if (sorted.length % 2 === 0) {

        return (
            sorted[middle - 1] +
            sorted[middle]
        ) / 2;
    }


    return sorted[middle];
}


function smoothSignal(signal) {

    const WINDOW = 5;

    return signal.map(
        (point, index) => {

            const start =
                Math.max(
                    0,
                    index - Math.floor(WINDOW / 2)
                );

            const end =
                Math.min(
                    signal.length,
                    index +
                    Math.floor(WINDOW / 2) +
                    1
                );


            const values =
                signal
                    .slice(start, end)
                    .map(point => point.elbowAngle)
                    .filter(isFiniteNumber);


            return {
                ...point,
                smoothedElbowAngle:
                    median(values)
            };
        }
    );
}


/* =========================================================
   FIND TRUE EXTREMES
   ========================================================= */

function findTrueTop(
    signal,
    startIndex,
    endIndex
) {

    if (!signal.length) {
        return null;
    }


    let minimumAngle = Infinity;
    let minimumIndex = -1;


    for (
        let i = startIndex;
        i <= endIndex;
        i++
    ) {

        const point = signal[i];

        if (
            !point ||
            !isFiniteNumber(
                point.smoothedElbowAngle
            )
        ) {
            continue;
        }


        if (
            point.smoothedElbowAngle <
            minimumAngle
        ) {
            minimumAngle =
                point.smoothedElbowAngle;

            minimumIndex = i;
        }
    }


    if (minimumIndex < 0) {
        return null;
    }


    const extreme =
        signal[minimumIndex];


    /*
     * Look around the minimum in time and use
     * the median angle from the local region.
     *
     * This prevents one noisy frame from defining
     * the entire top position.
     */

    const nearby = [];


    for (
        let i = 0;
        i < signal.length;
        i++
    ) {

        const point = signal[i];

        if (
            !point ||
            !isFiniteNumber(point.time) ||
            !isFiniteNumber(extreme.time)
        ) {
            continue;
        }


        if (
            Math.abs(
                point.time - extreme.time
            ) <= EXTREME_TIME_WINDOW
        ) {
            nearby.push(point);
        }
    }


    const topAngle =
        median(
            nearby
                .map(point =>
                    point.smoothedElbowAngle
                )
                .filter(isFiniteNumber)
        );


    return {
        index: minimumIndex,
        sourceIndex: extreme.sourceIndex,
        time: extreme.time,
        angle: isFiniteNumber(topAngle)
            ? topAngle
            : extreme.smoothedElbowAngle,
        landmarks: extreme.landmarks,
        angles: extreme.angles
    };
}


function findTrueBottom(
    signal,
    startIndex,
    endIndex
) {

    if (!signal.length) {
        return null;
    }


    let maximumAngle = -Infinity;
    let maximumIndex = -1;


    for (
        let i = startIndex;
        i <= endIndex;
        i++
    ) {

        const point = signal[i];

        if (
            !point ||
            !isFiniteNumber(
                point.smoothedElbowAngle
            )
        ) {
            continue;
        }


        if (
            point.smoothedElbowAngle >
            maximumAngle
        ) {
            maximumAngle =
                point.smoothedElbowAngle;

            maximumIndex = i;
        }
    }


    if (maximumIndex < 0) {
        return null;
    }


    const extreme =
        signal[maximumIndex];


    const nearby = [];


    for (
        let i = 0;
        i < signal.length;
        i++
    ) {

        const point = signal[i];

        if (
            !point ||
            !isFiniteNumber(point.time) ||
            !isFiniteNumber(extreme.time)
        ) {
            continue;
        }


        if (
            Math.abs(
                point.time - extreme.time
            ) <= EXTREME_TIME_WINDOW
        ) {
            nearby.push(point);
        }
    }


    const bottomAngle =
        median(
            nearby
                .map(point =>
                    point.smoothedElbowAngle
                )
                .filter(isFiniteNumber)
        );


    return {
        index: maximumIndex,
        sourceIndex: extreme.sourceIndex,
        time: extreme.time,
        angle: isFiniteNumber(bottomAngle)
            ? bottomAngle
            : extreme.smoothedElbowAngle,
        landmarks: extreme.landmarks,
        angles: extreme.angles
    };
}


/* =========================================================
   DETECT REPETITIONS
   ========================================================= */

function detectRepetitions(signal, side) {

    const reps = [];


    if (signal.length < MIN_VALID_FRAMES) {
        console.warn(
            "Bicep curl detector: signal too short."
        );

        return reps;
    }


    let state = "EXTENDED";

    let startIndex = null;
    let topIndex = null;

    let lowestAngle = Infinity;
    let highestAngle = -Infinity;


    // ========================================================
    // DEBUG STATE COUNTERS
    // ========================================================

    let extendedFrames = 0;
    let curlingFrames = 0;
    let loweringFrames = 0;

    let curlingTransitions = 0;
    let loweringTransitions = 0;

    let completedCycles = 0;


    // ========================================================
    // STATE MACHINE
    // ========================================================

    for (
        let i = 0;
        i < signal.length;
        i++
    ) {

        const point = signal[i];

        const angle =
            point.smoothedElbowAngle;


        if (!isFiniteNumber(angle)) {
            continue;
        }


        /* ====================================================
           EXTENDED
           ==================================================== */

        if (state === "EXTENDED") {

            extendedFrames++;


            if (
                angle <
                BOTTOM_ANGLE_TARGET -
                REVERSAL_THRESHOLD
            ) {

                state = "CURLING_UP";

                curlingTransitions++;


                console.log(
                    "CURL STATE → CURLING_UP",
                    {
                        signalIndex: i,
                        sourceIndex: point.sourceIndex,
                        time: point.time,
                        elbowAngle: angle
                    }
                );


                startIndex = i;

                lowestAngle = angle;
                highestAngle = angle;
            }


            continue;
        }


        /* ====================================================
           CURLING UP
           ==================================================== */

        if (state === "CURLING_UP") {

            curlingFrames++;


            lowestAngle =
                Math.min(
                    lowestAngle,
                    angle
                );


            highestAngle =
                Math.max(
                    highestAngle,
                    angle
                );


            /*
             * The elbow angle should decrease during
             * the concentric/curling phase.
             *
             * Once it starts increasing again,
             * we have reached the top.
             */

            if (
                i > startIndex + 1 &&
                angle >
                lowestAngle +
                REVERSAL_THRESHOLD
            ) {

                topIndex = i - 1;

                state = "LOWERING";

                loweringTransitions++;


                console.log(
                    "CURL STATE → LOWERING",
                    {
                        signalIndex: i,
                        sourceIndex: point.sourceIndex,
                        time: point.time,
                        elbowAngle: angle,
                        lowestAngle
                    }
                );
            }


            continue;
        }


        /* ====================================================
           LOWERING
           ==================================================== */

        if (state === "LOWERING") {

            loweringFrames++;


            highestAngle =
                Math.max(
                    highestAngle,
                    angle
                );


            /*
             * The repetition is considered complete
             * when the arm returns close to extension.
             */

            if (
                angle >=
                BOTTOM_ANGLE_TARGET -
                REVERSAL_THRESHOLD
            ) {

                completedCycles++;


                const endIndex = i;


                const top =
                    findTrueTop(
                        signal,
                        startIndex,
                        topIndex ?? i
                    );


                const bottom =
                    findTrueBottom(
                        signal,
                        startIndex,
                        endIndex
                    );


                if (top && bottom) {

                    const duration =
                        isFiniteNumber(
                            signal[endIndex].time
                        ) &&
                            isFiniteNumber(
                                signal[startIndex].time
                            )
                            ? (
                                signal[endIndex].time -
                                signal[startIndex].time
                            )
                            : null;


                    const bottomAngle =
                        bottom.angle;

                    const topAngle =
                        top.angle;


                    const rom =
                        bottomAngle -
                        topAngle;


                    const durationValid =
                        duration === null ||
                        duration >=
                        MIN_REP_DURATION;


                    const romValid =
                        rom >= MIN_ROM;


                    const meaningfulMovement =
                        bottomAngle -
                        topAngle >=
                        MIN_ROM;


                    console.log(
                        "CURL REP CANDIDATE",
                        {
                            startTime:
                                signal[startIndex].time,

                            topTime:
                                top.time,

                            endTime:
                                signal[endIndex].time,

                            duration,

                            topAngle,

                            bottomAngle,

                            rom,

                            durationValid,

                            romValid,

                            meaningfulMovement
                        }
                    );


                    /* =========================================
                       ACCEPT REP
                       ========================================= */

                    if (
                        durationValid &&
                        romValid &&
                        meaningfulMovement
                    ) {

                        const rep = {

                            repNumber:
                                reps.length + 1,

                            primarySide:
                                side,

                            startIndex:
                                signal[startIndex]
                                    .sourceIndex,

                            startSignalIndex:
                                startIndex,

                            topIndex:
                                top.sourceIndex,

                            topSignalIndex:
                                top.index,

                            bottomIndex:
                                bottom.sourceIndex,

                            bottomSignalIndex:
                                bottom.index,

                            endIndex:
                                signal[endIndex]
                                    .sourceIndex,

                            endSignalIndex:
                                endIndex,

                            startTime:
                                signal[startIndex]
                                    .time,

                            topTime:
                                top.time,

                            bottomTime:
                                bottom.time,

                            endTime:
                                signal[endIndex]
                                    .time,

                            duration,

                            topElbowAngle:
                                topAngle,

                            bottomElbowAngle:
                                bottomAngle,

                            rom,

                            topLandmarks:
                                top.landmarks,

                            bottomLandmarks:
                                bottom.landmarks,

                            topAngles:
                                top.angles,

                            bottomAngles:
                                bottom.angles
                        };


                        reps.push(rep);


                        console.log(
                            "CURL REP ACCEPTED",
                            {
                                repNumber:
                                    rep.repNumber,

                                duration:
                                    rep.duration,

                                topAngle:
                                    rep.topElbowAngle,

                                bottomAngle:
                                    rep.bottomElbowAngle,

                                rom:
                                    rep.rom
                            }
                        );

                    }
                    else {

                        console.log(
                            "CURL REP REJECTED",
                            {
                                duration,

                                topAngle,

                                bottomAngle,

                                rom,

                                minimumDuration:
                                    MIN_REP_DURATION,

                                minimumROM:
                                    MIN_ROM,

                                durationValid,

                                romValid,

                                meaningfulMovement
                            }
                        );
                    }

                }
                else {

                    console.warn(
                        "CURL REP CANDIDATE FAILED: could not determine top/bottom."
                    );
                }


                /*
                 * We are back at the starting position.
                 * A new curl can now begin.
                 */

                state = "EXTENDED";

                startIndex = null;
                topIndex = null;

                lowestAngle = Infinity;
                highestAngle = -Infinity;
            }
        }
    }


    // ========================================================
    // FINAL DEBUG SUMMARY
    // ========================================================

    console.log(
        "================================"
    );

    console.log(
        "BICEP CURL STATE DEBUG"
    );

    console.log(
        "================================"
    );

    console.log(
        "Final state:",
        state
    );

    console.log(
        "Extended frames:",
        extendedFrames
    );

    console.log(
        "Curling-up frames:",
        curlingFrames
    );

    console.log(
        "Lowering frames:",
        loweringFrames
    );

    console.log(
        "CURLING_UP transitions:",
        curlingTransitions
    );

    console.log(
        "LOWERING transitions:",
        loweringTransitions
    );

    console.log(
        "Completed movement cycles:",
        completedCycles
    );

    console.log(
        "Accepted reps:",
        reps.length
    );


    return reps;
}


/* =========================================================
   PUBLIC FUNCTION
   ========================================================= */

export function detectBicepCurlReps() {

    const poseHistory =
        getPoseHistory();


    if (
        !Array.isArray(poseHistory) ||
        poseHistory.length === 0
    ) {

        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];
    }


    const side =
        determineReliableSide(
            poseHistory
        );


    if (!side) {

        console.warn(
            "Bicep curl detector: no reliable arm side found."
        );

        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];
    }


    console.log(
        "Bicep curl primary side:",
        side
    );


    const signal =
        buildSignal(
            poseHistory,
            side
        );


    if (
        signal.length <
        MIN_VALID_FRAMES
    ) {

        console.warn(
            "Bicep curl detector: insufficient valid arm frames."
        );

        setCompleteReps([]);
        setDetectedRepCount(0);

        return [];
    }


    const smoothedSignal =
        smoothSignal(signal);

    // ============================================================
    // DEBUG: CURL ELBOW SIGNAL
    // ============================================================

    const validElbowAngles =
        smoothedSignal
            .map(point => point.smoothedElbowAngle)
            .filter(Number.isFinite);

    if (validElbowAngles.length > 0) {

        const minElbowAngle =
            Math.min(...validElbowAngles);

        const maxElbowAngle =
            Math.max(...validElbowAngles);

        console.log(
            "================================"
        );

        console.log(
            "BICEP CURL SIGNAL DEBUG"
        );

        console.log(
            "================================"
        );

        console.log(
            "Signal frames:",
            smoothedSignal.length
        );

        console.log(
            "Valid elbow angles:",
            validElbowAngles.length
        );

        console.log(
            "Minimum elbow angle:",
            minElbowAngle.toFixed(1) + "°"
        );

        console.log(
            "Maximum elbow angle:",
            maxElbowAngle.toFixed(1) + "°"
        );

        console.log(
            "First elbow angle:",
            validElbowAngles[0].toFixed(1) + "°"
        );

        console.log(
            "Last elbow angle:",
            validElbowAngles[
                validElbowAngles.length - 1
            ].toFixed(1) + "°"
        );

    }
    else {

        console.warn(
            "BICEP CURL SIGNAL DEBUG: No valid elbow angles."
        );

    }


    const reps =
        detectRepetitions(
            smoothedSignal,
            side
        );


    setCompleteReps(reps);
    setDetectedRepCount(reps.length);


    console.log(
        `Bicep curl reps detected: ${reps.length}`
    );


    return reps;
}