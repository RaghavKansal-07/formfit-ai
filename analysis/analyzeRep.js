import { calculateAngle } from "../geometry/calculateAngle.js";

export function analyzeRep(rep, frames) {

    // ========================================================
    // 0. VALIDATION
    // ========================================================

    if (
        !rep ||
        !Array.isArray(frames) ||
        !frames.length
    ) {
        console.warn(
            "analyzeRep: invalid rep or frames"
        );

        return null;
    }


    // ========================================================
    // 1. HELPERS
    // ========================================================

    function getLandmarks(frame) {

        if (!frame) {
            return null;
        }

        if (Array.isArray(frame.landmarks)) {
            return frame.landmarks;
        }

        if (Array.isArray(frame.poseLandmarks)) {
            return frame.poseLandmarks;
        }

        if (Array.isArray(frame)) {
            return frame;
        }

        return null;
    }


    function getVisibility(point) {

        if (!point) {
            return 0;
        }

        if (
            typeof point.visibility !== "number"
        ) {
            return 1;
        }

        return clamp(point.visibility, 0, 1);
    }


    function distance(a, b) {

        if (!a || !b) {
            return null;
        }

        if (
            !Number.isFinite(a.x) ||
            !Number.isFinite(a.y) ||
            !Number.isFinite(b.x) ||
            !Number.isFinite(b.y)
        ) {
            return null;
        }

        return Math.hypot(
            a.x - b.x,
            a.y - b.y
        );
    }


    function median(values) {

        const valid =
            values
                .filter(Number.isFinite)
                .slice()
                .sort((a, b) => a - b);

        if (!valid.length) {
            return null;
        }

        const middle =
            Math.floor(valid.length / 2);

        if (valid.length % 2 === 0) {
            return (
                valid[middle - 1] +
                valid[middle]
            ) / 2;
        }

        return valid[middle];
    }


    function average(values) {

        const valid =
            values.filter(Number.isFinite);

        if (!valid.length) {
            return null;
        }

        return (
            valid.reduce(
                (sum, value) => sum + value,
                0
            ) / valid.length
        );
    }


    function clamp(value, min, max) {

        if (!Number.isFinite(value)) {
            return min;
        }

        return Math.max(
            min,
            Math.min(max, value)
        );
    }


    function scoreRange(
        value,
        points
    ) {

        if (!Number.isFinite(value)) {
            return null;
        }

        for (let i = 0; i < points.length - 1; i++) {

            const p1 = points[i];
            const p2 = points[i + 1];

            if (
                value >= p1.x &&
                value <= p2.x
            ) {

                const t =
                    (value - p1.x) /
                    (p2.x - p1.x);

                return (
                    p1.y +
                    (p2.y - p1.y) * t
                );
            }
        }

        if (value < points[0].x) {
            return points[0].y;
        }

        return points[points.length - 1].y;
    }


    // ========================================================
    // 2. INDEX RESOLUTION
    // ========================================================
    //
    // IMPORTANT:
    //
    // startIndex / bottomIndex / endIndex refer to indexes
    // inside poseHistory.
    //
    // startFrame / bottomFrame / endFrame are global frame
    // numbers.
    //
    // NEVER interchange these two systems.
    // ========================================================

    const startIndex =
        Number.isFinite(rep.startIndex)
            ? clamp(
                Math.floor(rep.startIndex),
                0,
                frames.length - 1
            )
            : 0;


    const endIndex =
        Number.isFinite(rep.endIndex)
            ? clamp(
                Math.floor(rep.endIndex),
                0,
                frames.length - 1
            )
            : frames.length - 1;


    if (endIndex <= startIndex) {

        console.warn(
            "analyzeRep: invalid frame range",
            {
                startIndex,
                endIndex,
                rep
            }
        );

        return null;
    }


    const repFrames =
        frames.slice(
            startIndex,
            endIndex + 1
        );


    if (!repFrames.length) {

        console.warn(
            "analyzeRep: no frames inside rep"
        );

        return null;
    }


    // ========================================================
    // 3. PRIMARY SIDE
    // ========================================================

    const primarySide =
        rep.primarySide === "left" ||
            rep.primarySide === "right"
            ? rep.primarySide
            : null;


    if (!primarySide) {

        console.warn(
            "analyzeRep: missing valid primarySide",
            { rep }
        );

        return null;
    }


    console.log(
        `analyzeRep: primary side = ${primarySide}`
    );


    const isLeft =
        primarySide === "left";


    // ========================================================
    // 4. MEDIAPIPE LANDMARK INDICES
    // ========================================================

    const SHOULDER =
        isLeft ? 11 : 12;

    const HIP =
        isLeft ? 23 : 24;

    const KNEE =
        isLeft ? 25 : 26;

    const ANKLE =
        isLeft ? 27 : 28;


    // ========================================================
    // 5. STANDING REFERENCE
    // ========================================================
    //
    // Use up to 30 frames before the rep.
    //
    // Median is used instead of average because it is more
    // resistant to one or two noisy MediaPipe frames.
    // ========================================================

    const standingReferenceFrames =
        frames.slice(
            Math.max(0, startIndex - 30),
            startIndex
        );


    const standingHipValues = [];
    const standingThighLengths = [];


    standingReferenceFrames.forEach(frame => {

        const lm =
            getLandmarks(frame);

        if (!lm || lm.length < 29) {
            return;
        }

        const hip = lm[HIP];
        const knee = lm[KNEE];

        if (
            hip &&
            Number.isFinite(hip.y) &&
            getVisibility(hip) >= 0.50
        ) {

            standingHipValues.push(
                hip.y
            );
        }

        if (
            hip &&
            knee &&
            getVisibility(hip) >= 0.50 &&
            getVisibility(knee) >= 0.50
        ) {

            const thighLength =
                distance(hip, knee);

            if (
                Number.isFinite(thighLength) &&
                thighLength > 1e-6
            ) {

                standingThighLengths.push(
                    thighLength
                );
            }
        }
    });


    // ========================================================
    // STANDING REFERENCE
    // ========================================================
    //
    // Prefer the standing reference calculated by the detector.
    // This keeps detector depth and analyzer normalization based
    // on the same reference.
    //
    // Fall back to analyzer-calculated values for compatibility
    // with older reps that do not contain these fields.
    //

    const detectorStandingHipY =
        Number.isFinite(rep.standingHipY)
            ? rep.standingHipY
            : null;


    const detectorStandingThighLength =
        Number.isFinite(rep.standingThighLength)
            ? rep.standingThighLength
            : null;


    const standingHipY =
        detectorStandingHipY ??
        median(standingHipValues);


    const standingThighLength =
        detectorStandingThighLength ??
        median(standingThighLengths);


    console.log(
        "analyzeRep: standing reference",
        {
            standingHipY,
            standingThighLength,
            referenceFrameCount:
                standingReferenceFrames.length
        }
    );


    // ========================================================
    // 6. COLLECT MEASUREMENTS
    // ========================================================

    const measurements = [];


    repFrames.forEach(
        (frame, localIndex) => {

            const lm =
                getLandmarks(frame);

            if (!lm || lm.length < 29) {
                return;
            }


            const shoulder = lm[SHOULDER];
            const hip = lm[HIP];
            const knee = lm[KNEE];
            const ankle = lm[ANKLE];


            if (
                !shoulder ||
                !hip ||
                !knee ||
                !ankle
            ) {
                return;
            }


            // ------------------------------------------------
            // Visibility
            // ------------------------------------------------

            const shoulderVisibility =
                getVisibility(shoulder);

            const hipVisibility =
                getVisibility(hip);

            const kneeVisibility =
                getVisibility(knee);

            const ankleVisibility =
                getVisibility(ankle);


            // ------------------------------------------------
            // Tracking confidence
            // ------------------------------------------------

            const trackingConfidence =
                hipVisibility * 0.35 +
                kneeVisibility * 0.35 +
                shoulderVisibility * 0.20 +
                ankleVisibility * 0.10;


            // ------------------------------------------------
            // Joint angles
            // ------------------------------------------------

            const kneeAngle =
                calculateAngle(
                    hip,
                    knee,
                    ankle
                );


            const hipAngle =
                calculateAngle(
                    shoulder,
                    hip,
                    knee
                );


            // ------------------------------------------------
            // Segment lengths
            // ------------------------------------------------

            const thighLength =
                distance(
                    hip,
                    knee
                );


            const torsoLength =
                distance(
                    shoulder,
                    hip
                );


            // ------------------------------------------------
            // Torso angle
            // ------------------------------------------------

            let torsoAngle = null;


            if (
                shoulder &&
                hip
            ) {

                const dx =
                    shoulder.x - hip.x;

                const dy =
                    shoulder.y - hip.y;

                torsoAngle =
                    Math.abs(
                        Math.atan2(
                            dx,
                            -dy
                        ) *
                        180 /
                        Math.PI
                    );
            }

            // ------------------------------------------------
            // Diagnostic depth ratio
            // ------------------------------------------------
            //
            // This is NOT the authoritative depth score.
            //
            // It is retained only for debugging/UI.
            // ------------------------------------------------

            let depthRatio = null;


            if (
                Number.isFinite(thighLength) &&
                thighLength > 1e-6
            ) {

                depthRatio =
                    (
                        hip.y - knee.y
                    ) /
                    thighLength;
            }


            measurements.push({

                frameIndex:
                    startIndex + localIndex,

                time:
                    Number.isFinite(frame.time)
                        ? frame.time
                        : null,

                trackingConfidence,

                shoulderVisibility,
                hipVisibility,
                kneeVisibility,
                ankleVisibility,

                kneeAngle,
                hipAngle,
                torsoAngle,

                thighLength,
                torsoLength,

                depthRatio,

                shoulderX: shoulder.x,
                shoulderY: shoulder.y,

                hipX: hip.x,
                hipY: hip.y,

                kneeX: knee.x,
                kneeY: knee.y,

                ankleX: ankle.x,
                ankleY: ankle.y
            });
        }
    );


    if (!measurements.length) {

        console.warn(
            "analyzeRep: no valid side-view measurements"
        );

        return null;
    }

    // ========================================================
    // 7. TRACKING QUALITY
    // ========================================================

    const trackingConfidence =
        average(
            measurements.map(
                m => m.trackingConfidence
            )
        ) ?? 0;


    const overallTrackingConfidence =
        clamp(
            trackingConfidence * 100,
            0,
            100
        );


    const validMeasurementRatio =
        measurements.length /
        Math.max(
            1,
            repFrames.length
        );


    const dataCompleteness =
        clamp(
            validMeasurementRatio,
            0,
            1
        );


    // ========================================================
    // 8. SIDE CONFIDENCE
    // ========================================================

    const leftConfidence =
        isLeft
            ? overallTrackingConfidence
            : 0;


    const rightConfidence =
        isLeft
            ? 0
            : overallTrackingConfidence;


    // ========================================================
    // 9. BOTTOM INDEX
    // ========================================================
    //
    // Prefer detector bottomIndex.
    // If detector did not provide one, use the lowest valid hip
    // position only as a fallback diagnostic estimate.
    //
    // If detector did not provide one, find the deepest point
    // from hip Y inside this rep.
    // ========================================================

    let bottomIndex =
        Number.isFinite(rep.bottomIndex)
            ? clamp(
                Math.floor(rep.bottomIndex),
                startIndex,
                endIndex
            )
            : null;


    const bottomIndexSource =
        Number.isFinite(rep.bottomIndex)
            ? "detector"
            : "analyzerFallback";


    if (!Number.isFinite(bottomIndex)) {

        let best = null;


        measurements.forEach(m => {

            if (!Number.isFinite(m.hipY)) {
                return;
            }

            if (
                !best ||
                m.hipY > best.hipY
            ) {
                best = m;
            }
        });


        if (best) {
            bottomIndex =
                best.frameIndex;
        }
    }


    // ========================================================
    // 10. BOTTOM FRAME NUMBER
    // ========================================================

    let bottomFrame =
        Number.isFinite(rep.bottomFrame)
            ? rep.bottomFrame
            : null;


    if (
        !Number.isFinite(bottomFrame) &&
        Number.isFinite(bottomIndex)
    ) {

        bottomFrame =
            frames[bottomIndex]?.frame ??
            frames[bottomIndex]?.frameIndex ??
            null;
    }


    // ========================================================
    // 11. BOTTOM MEASUREMENT
    // ========================================================
    //
    // bottomIndex remains authoritative and refers to the actual
    // detector-selected poseHistory index.
    //
    // bottomMeasurement is the analyzer measurement used for
    // calculations. Normally it matches bottomIndex.
    //
    // If MediaPipe data is unavailable at bottomIndex,
    // bottomMeasurement falls back to the nearest valid
    // measurement.
    //
    // Therefore:
    // bottomIndex !== bottomMeasurement.frameIndex
    // is possible and is intentional.

    let bottomMeasurement = null;


    if (Number.isFinite(bottomIndex)) {

        bottomMeasurement =
            measurements.find(
                m =>
                    m.frameIndex === bottomIndex
            );


        if (!bottomMeasurement) {

            let smallestDistance =
                Infinity;


            measurements.forEach(m => {

                const d =
                    Math.abs(
                        m.frameIndex -
                        bottomIndex
                    );


                if (d < smallestDistance) {

                    smallestDistance = d;
                    bottomMeasurement = m;
                }
            });
        }
    }

    const bottomMeasurementFrameIndex =
        bottomMeasurement?.frameIndex ?? null;

    const bottomMeasurementIsExact =
        Number.isFinite(bottomIndex) &&
        bottomMeasurementFrameIndex === bottomIndex;

    // ========================================================
    // 12. INDEX DEBUG
    // ========================================================

    console.log(
        "========== REP INDEX VALIDATION =========="
    );


    console.log({

        startIndex,
        bottomIndex,
        endIndex,

        startFrame:
            rep.startFrame,

        bottomFrame:
            rep.bottomFrame,

        endFrame:
            rep.endFrame,

        startPoseFrame:
            frames[startIndex]?.frame,

        bottomPoseFrame:
            Number.isFinite(bottomIndex)
                ? frames[bottomIndex]?.frame
                : undefined,

        endPoseFrame:
            frames[endIndex]?.frame
    });


    console.log(
        "=========================================="
    );


    // ========================================================
    // 13. BOTTOM LANDMARK DEBUG
    // ========================================================

    console.log(
        "========== BOTTOM LANDMARK DEBUG =========="
    );

    if (bottomMeasurement) {

        console.log({

            detectorBottomIndex:
                bottomIndex,

            measurementFrameIndex:
                bottomMeasurement.frameIndex,

            measurementIsExact:
                bottomMeasurementIsExact,

            shoulder: {
                x: bottomMeasurement.shoulderX,
                y: bottomMeasurement.shoulderY
            },

            hip: {
                x: bottomMeasurement.hipX,
                y: bottomMeasurement.hipY
            },

            knee: {
                x: bottomMeasurement.kneeX,
                y: bottomMeasurement.kneeY
            },

            ankle: {
                x: bottomMeasurement.ankleX,
                y: bottomMeasurement.ankleY
            },

            kneeAngle:
                bottomMeasurement.kneeAngle,

            hipAngle:
                bottomMeasurement.hipAngle,

            torsoAngle:
                bottomMeasurement.torsoAngle,

            thighLength:
                bottomMeasurement.thighLength,

            torsoLength:
                bottomMeasurement.torsoLength,

            depthRatio:
                bottomMeasurement.depthRatio
        });
    }


    console.log(
        "=========================================="
    );


    // ========================================================
    // 14. BOTTOM WINDOW
    // ========================================================
    //
    // Use actual poseHistory frame indexes rather than positions
    // inside the compressed measurements array.
    //
    // This gives us a true time-based window around the detector
    // bottom.
    //
    // Example:
    //
    // bottomIndex = 100
    //
    // window = 98, 99, 100, 101, 102
    //
    // Missing/invalid measurements are simply absent.

    const bottomWindow = [];

    if (Number.isFinite(bottomIndex)) {

        // Use a time-based window instead of a fixed
        // number of pose-history frames.
        //
        // This is more reliable because poseHistory can
        // contain a variable number of processed frames.

        const BOTTOM_WINDOW_SECONDS = 0.12;

        const bottomTime =
            Number.isFinite(rep.bottomTime)
                ? rep.bottomTime
                : bottomMeasurement?.time;

        if (Number.isFinite(bottomTime)) {

            for (const measurement of measurements) {

                if (!Number.isFinite(measurement.time)) {
                    continue;
                }

                if (
                    Math.abs(
                        measurement.time -
                        bottomTime
                    ) <= BOTTOM_WINDOW_SECONDS
                ) {

                    bottomWindow.push(
                        measurement
                    );
                }
            }
        }
    }

    // Fallback if the detector bottom is unavailable
    // or no measurements exist inside the +/- 2 frame window.

    if (
        !bottomWindow.length &&
        bottomMeasurement
    ) {

        bottomWindow.push(
            bottomMeasurement
        );
    }


    // Keep chronological order.

    bottomWindow.sort(
        (a, b) =>
            a.frameIndex -
            b.frameIndex
    );


    const bottomSource =
        bottomWindow.length
            ? bottomWindow
            : (
                bottomMeasurement
                    ? [bottomMeasurement]
                    : measurements
            );


    // ========================================================
    // 15. BOTTOM VALUES
    // ========================================================

    const bottomKneeAngle =
        median(
            bottomSource.map(
                m => m.kneeAngle
            )
        );


    const bottomHipAngle =
        median(
            bottomSource.map(
                m => m.hipAngle
            )
        );


    const bottomTorsoAngle =
        median(
            bottomSource.map(
                m => m.torsoAngle
            )
        );


    const bottomHipY =
        median(
            bottomSource.map(
                m => m.hipY
            )
        );


    // ========================================================
    // 16. AUTHORITATIVE DEPTH
    // ========================================================
    //
    // Detector depth is preferred.
    //
    // Analyzer-calculated hip displacement is a fallback and
    // diagnostic signal.
    // ========================================================

    const calculatedHipDisplacement =
        Number.isFinite(standingHipY) &&
            Number.isFinite(bottomHipY)
            ? bottomHipY - standingHipY
            : null;


    const detectorDepth =
        Number.isFinite(rep.depth)
            ? rep.depth
            : null;


    const detectorMaxHipDisplacement =
        Number.isFinite(rep.maxHipDisplacement)
            ? rep.maxHipDisplacement
            : null;


    const hipDisplacement =
        detectorDepth ??
        detectorMaxHipDisplacement ??
        calculatedHipDisplacement;

    const depthSource =
        Number.isFinite(detectorDepth)
            ? "detectorDepth"
            : Number.isFinite(detectorMaxHipDisplacement)
                ? "detectorMaxHipDisplacement"
                : Number.isFinite(calculatedHipDisplacement)
                    ? "analyzerCalculated"
                    : "none";



    console.log(
        "========== DEPTH SOURCE =========="
    );


    console.log({

        detectorDepth,

        detectorMaxHipDisplacement,

        calculatedAnalyzerDepth:
            calculatedHipDisplacement,

        authoritativeDepth:
            hipDisplacement,

        standingHipY,

        bottomHipY,

        standingThighLength
    });


    console.log(
        "=================================="
    );

    // ========================================================
    // 17. NORMALIZED DEPTH
    // ========================================================

    const normalizedHipDisplacement =
        Number.isFinite(hipDisplacement) &&
            Number.isFinite(standingThighLength) &&
            standingThighLength > 1e-6
            ? hipDisplacement /
            standingThighLength
            : null;


    // ========================================================
    // 18. KNEE ANGLES
    // ========================================================

    const kneeAngles =
        measurements
            .map(m => m.kneeAngle)
            .filter(Number.isFinite);


    const minimumKneeAngle =
        kneeAngles.length
            ? Math.min(...kneeAngles)
            : null;


    const primaryKneeAngle =
        Number.isFinite(bottomKneeAngle)
            ? bottomKneeAngle
            : minimumKneeAngle;


    // ========================================================
    // 19. HIP ANGLE
    // ========================================================

    const hipAngles =
        measurements
            .map(m => m.hipAngle)
            .filter(Number.isFinite);


    const primaryHipAngle =
        Number.isFinite(bottomHipAngle)
            ? bottomHipAngle
            : median(hipAngles);


    // ========================================================
    // 20. TORSO ANGLE
    // ========================================================

    const torsoAngles =
        measurements
            .map(m => m.torsoAngle)
            .filter(Number.isFinite);


    const torsoAngle =
        Number.isFinite(bottomTorsoAngle)
            ? bottomTorsoAngle
            : median(torsoAngles);

    // ========================================================
    // 21. DEPTH SCORE
    // ========================================================
    //
    // Side-view depth uses TWO signals:
    // 1. Knee flexion
    // 2. Standing-normalized hip displacement
    //
    // Neither signal is treated as perfect by default.
    //
    // IMPORTANT:
    // These thresholds are deliberately conservative for our
    // current side-view calibration tests.
    //
    // Lower knee angle = deeper squat.
    // Greater normalized hip displacement = greater descent.
    //
    // This is a heuristic side-view score, not a universal
    // biomechanical definition of perfect squat depth.
    // ========================================================

    let kneeDepthScore = null;
    let hipDepthScore = null;
    let depthScore = null;


    // --------------------------------------------------------
    // Knee depth
    // --------------------------------------------------------
    //
    // Lower angle = deeper.
    //
    // Approximate interpretation:
    //
    // 110°+  -> very shallow
    // 100°   -> shallow
    // 90°    -> borderline/moderate
    // 80°    -> good
    // 70°    -> very deep
    // 60°    -> extremely deep
    //
    // We deliberately DO NOT give 80° or above an automatic 100.
    // --------------------------------------------------------

    if (
        Number.isFinite(primaryKneeAngle)
    ) {

        kneeDepthScore =
            scoreRange(
                primaryKneeAngle,
                [
                    { x: 50, y: 100 },
                    { x: 60, y: 95 },
                    { x: 70, y: 90 },
                    { x: 80, y: 75 },
                    { x: 90, y: 55 },
                    { x: 100, y: 35 },
                    { x: 110, y: 15 },
                    { x: 120, y: 5 },
                    { x: 130, y: 0 }
                ]
            );

        kneeDepthScore =
            clamp(
                kneeDepthScore,
                0,
                100
            );
    }


    // --------------------------------------------------------
    // Hip displacement depth
    // --------------------------------------------------------
    //
    // normalizedHipDisplacement = hip displacement / standing thigh length
    // Greater displacement generally indicates greater vertical
    // descent in this side-view measurement.
    //
    // Again, this is NOT treated as a universal biomechanical
    // depth definition. It is a normalized visual proxy.
    // --------------------------------------------------------

    if (
        Number.isFinite(
            normalizedHipDisplacement
        )
    ) {

        hipDepthScore =
            scoreRange(
                normalizedHipDisplacement,
                [
                    { x: 0.20, y: 0 },
                    { x: 0.25, y: 10 },
                    { x: 0.35, y: 25 },
                    { x: 0.45, y: 45 },
                    { x: 0.55, y: 65 },
                    { x: 0.65, y: 82 },
                    { x: 0.75, y: 92 },
                    { x: 0.85, y: 97 },
                    { x: 0.95, y: 100 },
                    { x: 1.05, y: 98 },
                    { x: 1.15, y: 94 },
                    { x: 1.25, y: 88 },
                    { x: 1.35, y: 80 }
                ]
            );

        hipDepthScore =
            clamp(
                hipDepthScore,
                0,
                100
            );
    }


    // --------------------------------------------------------
    // Combined depth
    // --------------------------------------------------------
    //
    // Use both signals.
    //
    // Knee flexion:       55%
    // Hip displacement:   45%
    //
    // This prevents a single favorable measurement from making
    // a shallow squat appear excellent.
    // --------------------------------------------------------

    if (
        Number.isFinite(kneeDepthScore) &&
        Number.isFinite(hipDepthScore)
    ) {

        depthScore =
            kneeDepthScore * 0.55 +
            hipDepthScore * 0.45;

    } else if (
        Number.isFinite(kneeDepthScore)
    ) {

        depthScore =
            kneeDepthScore;

    } else if (
        Number.isFinite(hipDepthScore)
    ) {

        depthScore =
            hipDepthScore;

    } else {

        depthScore = 0;
    }


    console.log(
        "========== DEPTH SCORE DEBUG =========="
    );


    console.log({

        primaryKneeAngle,

        kneeDepthScore,

        hipDisplacement,

        standingThighLength,

        normalizedHipDisplacement,

        hipDepthScore,

        depthScore
    });


    console.log(
        "======================================="
    );


    // ========================================================
    // 22. KNEE CONTROL SCORE
    // ========================================================
    //
    // IMPORTANT:
    //
    // Knee angle is already used as a DEPTH measurement
    // in Section 21.
    //
    // Do not use the same knee angle again here,
    // otherwise knee angle gets double-counted.
    //
    // A true knee-control score should eventually measure
    // something different, such as knee tracking/alignment,
    // but that is not implemented yet.
    //
    // Therefore, keep this neutral for now.
    //

    const kneeScore = null;

    // ========================================================
    // 23. HIP SCORE
    // ========================================================
    //
    // Hip angle is highly camera/view dependent.
    //
    // Therefore this remains a broad metric and has relatively
    // low influence on the final form score.
    // ========================================================

    let hipScore = 100;


    if (Number.isFinite(primaryHipAngle)) {

        hipScore =
            scoreRange(
                primaryHipAngle,
                [
                    { x: 35, y: 82 },
                    { x: 45, y: 92 },
                    { x: 60, y: 100 },
                    { x: 90, y: 100 },
                    { x: 120, y: 98 },
                    { x: 140, y: 94 },
                    { x: 155, y: 84 },
                    { x: 170, y: 70 }
                ]
            );

        hipScore =
            clamp(
                hipScore,
                0,
                100
            );
    }


    // ========================================================
    // 24. TORSO SCORE
    // ========================================================
    //
    // Side-view squats naturally involve forward torso lean.
    //
    // This is intentionally tolerant.
    // ========================================================

    let torsoScore = 100;

    if (Number.isFinite(torsoAngle)) {
        torsoScore = scoreRange(torsoAngle, [
            { x: 0, y: 100 },
            { x: 20, y: 100 },
            { x: 30, y: 100 },
            { x: 40, y: 96 },
            { x: 45, y: 92 },
            { x: 50, y: 84 },
            { x: 55, y: 72 },
            { x: 60, y: 58 },
            { x: 65, y: 45 },
            { x: 70, y: 30 },
            { x: 80, y: 10 }
        ]);

        torsoScore = clamp(torsoScore, 0, 100);
    }

    // ========================================================
    // 25. BOTTOM STABILITY
    // ========================================================
    //
    // Use knee-angle range across the 5-frame bottom window.
    //
    // Small MediaPipe fluctuations are normal.
    // ========================================================

    let bottomStabilityScore = 100;

    let bottomKnees = [];
    let kneeRange = null;


    if (bottomWindow.length >= 3) {

        bottomKnees =
            bottomWindow
                .map(m => m.kneeAngle)
                .filter(Number.isFinite);


        if (bottomKnees.length >= 3) {

            const minKnee =
                Math.min(...bottomKnees);

            const maxKnee =
                Math.max(...bottomKnees);


            kneeRange =
                maxKnee - minKnee;


            bottomStabilityScore =
                scoreRange(
                    kneeRange,
                    [
                        { x: 0, y: 100 },
                        { x: 3, y: 100 },
                        { x: 5, y: 98 },
                        { x: 8, y: 95 },
                        { x: 12, y: 90 },
                        { x: 16, y: 83 },
                        { x: 20, y: 74 },
                        { x: 25, y: 64 },
                        { x: 30, y: 52 }
                    ]
                );


            bottomStabilityScore =
                clamp(
                    bottomStabilityScore,
                    0,
                    100
                );


            console.log(
                "BOTTOM STABILITY DEBUG",
                {
                    bottomFrame,
                    bottomWindowFrames:
                        bottomWindow.map(
                            m => m.frameIndex
                        ),
                    bottomKnees,
                    kneeRange,
                    bottomStabilityScore
                }
            );
        }
    }


    // ========================================================
    // 26. FORM SCORE
    // ========================================================
    //
    // Weighting:
    //
    // Depth       45%
    // Hip         15%
    // Torso       25%
    // Stability   15%
    //
    // Knee control is not scored independently yet.
    //
    // This keeps depth important while preventing one metric
    // from dominating the entire result.
    // ========================================================

    const formScore =
        clamp(

            depthScore * 0.45 +

            hipScore * 0.15 +

            torsoScore * 0.25 +

            bottomStabilityScore * 0.15,

            0,
            100
        );


    console.log(
        "========== FORM SCORE DEBUG =========="
    );


    console.log({

        primaryKneeAngle,

        primaryHipAngle,

        torsoAngle,

        hipDisplacement,

        standingThighLength,

        normalizedHipDisplacement,

        kneeDepthScore,

        hipDepthScore,

        depthScore,

        kneeScore,

        hipScore,

        torsoScore,

        bottomStabilityScore,

        formScore
    });


    console.log(
        "======================================"
    );


    // ========================================================
    // 27. FINAL TRACKING CONFIDENCE
    // ========================================================
    //
    // Confidence answers:
    //
    // "How much do we trust the measurements?"
    //
    // It should NOT be the same thing as:
    //
    // "How good was the squat?"
    // ========================================================

    const finalConfidence =
        clamp(

            overallTrackingConfidence *
            (
                0.80 +
                0.20 *
                dataCompleteness
            ),

            0,
            100
        );


    // ========================================================
    // 28. FEEDBACK
    // ========================================================

    const feedback = [];


    // --------------------------------------------------------
    // DEPTH
    // --------------------------------------------------------

    if (depthScore < 60) {

        feedback.push(
            "Squat depth appears shallow."
        );

    } else if (depthScore < 75) {

        feedback.push(
            "Squat depth is below the ideal range. Try to go deeper."
        );

    } else if (depthScore < 90) {

        feedback.push(
            "Squat depth is acceptable, but try to go a little deeper."
        );

    } else {

        feedback.push(
            "Good squat depth."
        );
    }


    // --------------------------------------------------------
    // TORSO
    // --------------------------------------------------------



    if (Number.isFinite(torsoAngle)) {

        if (torsoAngle >= 58) {

            feedback.push(
                "Your torso leans forward substantially during the squat."
            );

        } else if (torsoAngle >= 50) {

            feedback.push(
                "Your torso shows noticeable forward lean."
            );

        } else {

            feedback.push(
                "Good torso control."
            );
        }
    }

    // --------------------------------------------------------
    // STABILITY
    // --------------------------------------------------------

    if (bottomStabilityScore < 70) {

        feedback.push(
            "The bottom position shows noticeable movement."
        );

    } else if (bottomStabilityScore < 92) {

        feedback.push(
            "Your bottom position is fairly stable, but try to stay more controlled."
        );

    } else {

        feedback.push(
            "Good stability at the bottom."
        );
    }


    // --------------------------------------------------------
    // LOW CONFIDENCE WARNING
    // --------------------------------------------------------

    if (
        finalConfidence < 70
    ) {

        feedback.push(
            "Tracking confidence is limited, so form scores should be interpreted cautiously."
        );
    }


    // --------------------------------------------------------
    // FALLBACK
    // --------------------------------------------------------

    if (!feedback.length) {

        feedback.push(
            "Good squat mechanics detected."
        );
    }

    // ============================================================
    // RANGE OF MOTION
    // ============================================================

    const validKneeAngles =
        measurements
            .map(
                (measurement) =>
                    Number(measurement.kneeAngle)
            )
            .filter(
                (angle) =>
                    Number.isFinite(angle)
            );

    const rangeOfMotion =
        validKneeAngles.length >= 2
            ? Math.max(...validKneeAngles) -
            Math.min(...validKneeAngles)
            : null;


    // ========================================================
    // 29. RETURN RESULT
    // ========================================================

    return {

        // ----------------------------------------------------
        // REP ID
        // ----------------------------------------------------

        repNumber:
            rep.repNumber ??
            rep.number ??
            null,


        // ----------------------------------------------------
        // ARRAY INDEXES
        // ----------------------------------------------------

        startIndex,

        endIndex,

        bottomIndex:
            Number.isFinite(bottomIndex)
                ? bottomIndex
                : null,

        bottomIndexSource,


        // ----------------------------------------------------
        // GLOBAL FRAME NUMBERS
        // ----------------------------------------------------

        startFrame:
            rep.startFrame ??
            null,

        endFrame:
            rep.endFrame ??
            null,

        bottomFrame,


        // ----------------------------------------------------
        // PRIMARY SIDE
        // ----------------------------------------------------

        primarySide,


        // ----------------------------------------------------
        // DURATION
        // ----------------------------------------------------

        duration:
            Number.isFinite(rep.duration)
                ? rep.duration
                : (
                    Number.isFinite(rep.startTime) &&
                    Number.isFinite(rep.endTime)
                )
                    ? rep.endTime - rep.startTime
                    : null,


        // ====================================================
        // MAIN MEASUREMENTS
        // ====================================================

        primaryKneeAngle:
            Number.isFinite(primaryKneeAngle)
                ? primaryKneeAngle
                : null,

        rangeOfMotion:
            Number.isFinite(rangeOfMotion)
                ? rangeOfMotion
                : null,


        primaryHipAngle:
            Number.isFinite(primaryHipAngle)
                ? primaryHipAngle
                : null,


        torsoAngle:
            Number.isFinite(torsoAngle)
                ? torsoAngle
                : null,


        // ----------------------------------------------------
        // Diagnostic ratio
        // ----------------------------------------------------

        depthRatio:
            Number.isFinite(
                bottomMeasurement?.depthRatio
            )
                ? bottomMeasurement.depthRatio
                : null,


        // ====================================================
        // DEPTH
        // ====================================================

        detectorHipDisplacement:
            Number.isFinite(hipDisplacement)
                ? hipDisplacement
                : null,

        depthSource,

        hipDisplacement:
            Number.isFinite(hipDisplacement)
                ? hipDisplacement
                : null,

        normalizedHipDisplacement:
            Number.isFinite(
                normalizedHipDisplacement
            )
                ? normalizedHipDisplacement
                : null,

        standingThighLength:
            Number.isFinite(
                standingThighLength
            )
                ? standingThighLength
                : null,


        // ====================================================
        // DEPTH COMPONENTS
        // ====================================================

        kneeDepthScore:
            Number.isFinite(kneeDepthScore)
                ? kneeDepthScore
                : null,

        hipDepthScore:
            Number.isFinite(hipDepthScore)
                ? hipDepthScore
                : null,


        // ====================================================
        // SCORES
        // ====================================================

        depthScore:
            Number.isFinite(depthScore)
                ? depthScore
                : 0,

        kneeScore:
            Number.isFinite(kneeScore)
                ? kneeScore
                : null,

        hipScore:
            Number.isFinite(hipScore)
                ? hipScore
                : 0,

        torsoScore:
            Number.isFinite(torsoScore)
                ? torsoScore
                : 0,

        bottomStabilityScore:
            Number.isFinite(bottomStabilityScore)
                ? bottomStabilityScore
                : 0,

        formScore:
            Number.isFinite(formScore)
                ? formScore
                : 0,


        // ====================================================
        // CONFIDENCE
        // ====================================================

        overallConfidence:
            finalConfidence,

        leftConfidence,

        rightConfidence,

        trackingConfidence:
            overallTrackingConfidence,


        confidence: {

            overall:
                finalConfidence / 100,

            leftSide:
                leftConfidence / 100,

            rightSide:
                rightConfidence / 100
        },


        // ====================================================
        // FEEDBACK
        // ====================================================

        feedback,


        // ====================================================
        // DIAGNOSTICS
        // ====================================================

        measurementCount:
            measurements.length,

        validMeasurementRatio:
            dataCompleteness,

        bottomWindowFrames:
            bottomWindow.map(
                m => m.frameIndex
            ),

        bottomMeasurementFrameIndex,

        bottomMeasurementIsExact,

        bottomKneeRange:
            Number.isFinite(kneeRange)
                ? kneeRange
                : null,

        bottomMeasurement:
            bottomMeasurement || null
    };
}