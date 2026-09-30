import { calculateAngle } from "../geometry/calculateAngle.js";

const LANDMARKS = {
    LEFT_SHOULDER: 11,
    LEFT_ELBOW: 13,
    LEFT_WRIST: 15,

    RIGHT_SHOULDER: 12,
    RIGHT_ELBOW: 14,
    RIGHT_WRIST: 16,

    LEFT_HIP: 23,
    RIGHT_HIP: 24
};

const SCORE_THRESHOLDS = {
    elbowDriftGood: 0.15,
    elbowDriftCaution: 0.25,

    torsoLeanGood: 10,
    torsoLeanCaution: 15,

    torsoChangeGood: 5,
    torsoChangeCaution: 10,

    bottomGood: 150,
    bottomCaution: 135,

    topGood: 60,
    topCaution: 75,

    totalRomGood: 100,
    totalRomCaution: 80
};

function isValidPoint(point) {
    return (
        point &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y)
    );
}

function distance(a, b) {
    if (!isValidPoint(a) || !isValidPoint(b)) {
        return null;
    }

    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}

function clamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, value));
}

function scoreRange(value, goodLimit, cautionLimit, higherIsBetter = false) {
    if (!Number.isFinite(value)) {
        return 0;
    }

    if (higherIsBetter) {
        if (value >= goodLimit) return 100;
        if (value <= cautionLimit) return 50;

        return (
            50 +
            ((value - cautionLimit) /
                (goodLimit - cautionLimit)) *
            50
        );
    }

    if (value <= goodLimit) {
        return 100;
    }

    if (value >= cautionLimit) {
        return 0;
    }

    return (
        100 -
        ((value - goodLimit) /
            (cautionLimit - goodLimit)) *
        100
    );
}

function getSideIndices(side) {
    if (side === "left") {
        return {
            shoulder: LANDMARKS.LEFT_SHOULDER,
            elbow: LANDMARKS.LEFT_ELBOW,
            wrist: LANDMARKS.LEFT_WRIST,
            hip: LANDMARKS.LEFT_HIP
        };
    }

    return {
        shoulder: LANDMARKS.RIGHT_SHOULDER,
        elbow: LANDMARKS.RIGHT_ELBOW,
        wrist: LANDMARKS.RIGHT_WRIST,
        hip: LANDMARKS.RIGHT_HIP
    };
}

function getLandmarksFromFrame(frame, side) {
    if (!frame?.landmarks) {
        return null;
    }

    const indices = getSideIndices(side);

    const shoulder = frame.landmarks[indices.shoulder];
    const elbow = frame.landmarks[indices.elbow];
    const wrist = frame.landmarks[indices.wrist];
    const hip = frame.landmarks[indices.hip];

    if (
        !isValidPoint(shoulder) ||
        !isValidPoint(elbow) ||
        !isValidPoint(wrist) ||
        !isValidPoint(hip)
    ) {
        return null;
    }

    return {
        shoulder,
        elbow,
        wrist,
        hip
    };
}

function getFrameAngle(frame, side) {
    const landmarks = getLandmarksFromFrame(frame, side);

    if (!landmarks) {
        return null;
    }

    return calculateAngle(
        landmarks.shoulder,
        landmarks.elbow,
        landmarks.wrist
    );
}

function getTorsoLean(frame, side) {
    const landmarks = getLandmarksFromFrame(frame, side);

    if (!landmarks) {
        return null;
    }

    const dx =
        landmarks.shoulder.x -
        landmarks.hip.x;

    const dy =
        landmarks.shoulder.y -
        landmarks.hip.y;

    if (
        !Number.isFinite(dx) ||
        !Number.isFinite(dy)
    ) {
        return null;
    }

    // Angle of torso relative to vertical.
    const angleFromVertical =
        Math.atan2(
            Math.abs(dx),
            Math.abs(dy)
        ) *
        (180 / Math.PI);

    return angleFromVertical;
}

function getElbowRelativePosition(frame, side) {
    const landmarks = getLandmarksFromFrame(frame, side);

    if (!landmarks) {
        return null;
    }

    const upperArmLength = distance(
        landmarks.shoulder,
        landmarks.elbow
    );

    if (
        !Number.isFinite(upperArmLength) ||
        upperArmLength < 0.01
    ) {
        return null;
    }

    return {
        x:
            (landmarks.elbow.x -
                landmarks.shoulder.x) /
            upperArmLength,

        y:
            (landmarks.elbow.y -
                landmarks.shoulder.y) /
            upperArmLength
    };
}

function analyzeElbowStability(frames, side) {
    const positions = frames
        .map(frame =>
            getElbowRelativePosition(
                frame,
                side
            )
        )
        .filter(Boolean);

    if (positions.length < 3) {
        return {
            score: 0,
            maxDrift: null,
            averageDrift: null,
            validFrames: positions.length
        };
    }

    const meanX =
        positions.reduce(
            (sum, point) => sum + point.x,
            0
        ) / positions.length;

    const meanY =
        positions.reduce(
            (sum, point) => sum + point.y,
            0
        ) / positions.length;

    const drifts = positions.map(point =>
        Math.hypot(
            point.x - meanX,
            point.y - meanY
        )
    );

    const maxDrift = Math.max(...drifts);

    const averageDrift =
        drifts.reduce(
            (sum, value) => sum + value,
            0
        ) / drifts.length;

    const score = clamp(
        scoreRange(
            maxDrift,
            SCORE_THRESHOLDS.elbowDriftGood,
            SCORE_THRESHOLDS.elbowDriftCaution,
            false
        )
    );

    return {
        score,
        maxDrift,
        averageDrift,
        validFrames: positions.length
    };
}

function analyzeTorso(frames, side) {
    const torsoAngles = frames
        .map(frame =>
            getTorsoLean(frame, side)
        )
        .filter(Number.isFinite);

    if (torsoAngles.length < 3) {
        return {
            score: 0,
            maxLean: null,
            minLean: null,
            torsoChange: null,
            validFrames: torsoAngles.length
        };
    }

    const maxLean = Math.max(...torsoAngles);
    const minLean = Math.min(...torsoAngles);

    const torsoChange =
        maxLean - minLean;

    const leanScore = scoreRange(
        maxLean,
        SCORE_THRESHOLDS.torsoLeanGood,
        SCORE_THRESHOLDS.torsoLeanCaution
    );

    const changeScore = scoreRange(
        torsoChange,
        SCORE_THRESHOLDS.torsoChangeGood,
        SCORE_THRESHOLDS.torsoChangeCaution
    );

    const score =
        leanScore * 0.6 +
        changeScore * 0.4;

    return {
        score: clamp(score),
        maxLean,
        minLean,
        torsoChange,
        leanScore,
        changeScore,
        validFrames: torsoAngles.length
    };
}

function analyzeBottomRange(bottomAngle) {
    if (!Number.isFinite(bottomAngle)) {
        return {
            score: 0,
            quality: "unreliable"
        };
    }

    let score;

    if (
        bottomAngle >=
        SCORE_THRESHOLDS.bottomGood
    ) {
        score = 100;
    } else if (
        bottomAngle <
        SCORE_THRESHOLDS.bottomCaution
    ) {
        score = 0;
    } else {
        score =
            ((bottomAngle -
                SCORE_THRESHOLDS.bottomCaution) /
                (SCORE_THRESHOLDS.bottomGood -
                    SCORE_THRESHOLDS.bottomCaution)) *
            100;
    }

    return {
        score: clamp(score),
        quality:
            score >= 90
                ? "good"
                : score >= 50
                    ? "caution"
                    : "poor"
    };
}

function analyzeTopRange(topAngle) {
    if (!Number.isFinite(topAngle)) {
        return {
            score: 0,
            quality: "unreliable"
        };
    }

    let score;

    if (
        topAngle <=
        SCORE_THRESHOLDS.topGood
    ) {
        score = 100;
    } else if (
        topAngle >=
        SCORE_THRESHOLDS.topCaution
    ) {
        score = 0;
    } else {
        score =
            100 -
            ((topAngle -
                SCORE_THRESHOLDS.topGood) /
                (SCORE_THRESHOLDS.topCaution -
                    SCORE_THRESHOLDS.topGood)) *
            100;
    }

    return {
        score: clamp(score),
        quality:
            score >= 90
                ? "good"
                : score >= 50
                    ? "caution"
                    : "poor"
    };
}

function analyzeTotalRom(rom) {
    if (!Number.isFinite(rom)) {
        return {
            score: 0,
            quality: "unreliable"
        };
    }

    let score;

    if (
        rom >=
        SCORE_THRESHOLDS.totalRomGood
    ) {
        score = 100;
    } else if (
        rom <
        SCORE_THRESHOLDS.totalRomCaution
    ) {
        score = 0;
    } else {
        score =
            ((rom -
                SCORE_THRESHOLDS.totalRomCaution) /
                (SCORE_THRESHOLDS.totalRomGood -
                    SCORE_THRESHOLDS.totalRomCaution)) *
            100;
    }

    return {
        score: clamp(score),
        quality:
            score >= 90
                ? "good"
                : score >= 50
                    ? "caution"
                    : "poor"
    };
}

function analyzeTempo(rep) {
    const startTime = Number(rep?.startTime);
    const topTime = Number(rep?.topTime);
    const endTime = Number(rep?.endTime);

    if (
        !Number.isFinite(startTime) ||
        !Number.isFinite(topTime) ||
        !Number.isFinite(endTime)
    ) {
        return {
            score: 0,
            concentricDuration: null,
            eccentricDuration: null,
            ratio: null
        };
    }

    const concentricDuration =
        topTime - startTime;

    const eccentricDuration =
        endTime - topTime;

    if (
        concentricDuration <= 0 ||
        eccentricDuration <= 0
    ) {
        return {
            score: 0,
            concentricDuration,
            eccentricDuration,
            ratio: null
        };
    }

    const ratio =
        eccentricDuration /
        concentricDuration;

    // Controlled eccentric should generally
    // take at least as long as concentric.
    let score;

    if (ratio >= 1 && ratio <= 2.5) {
        score = 100;
    } else if (ratio >= 0.7 && ratio < 1) {
        score = 75;
    } else if (ratio > 2.5 && ratio <= 3.5) {
        score = 75;
    } else {
        score = 40;
    }

    return {
        score,
        concentricDuration,
        eccentricDuration,
        ratio
    };
}

function buildFeedback(results) {
    const feedback = [];

    if (
        results.elbowStability.maxDrift !== null &&
        results.elbowStability.maxDrift >
        SCORE_THRESHOLDS.elbowDriftCaution
    ) {
        feedback.push(
            "Keep your elbow more stable instead of letting it drift during the curl."
        );
    } else if (
        results.elbowStability.maxDrift !== null &&
        results.elbowStability.maxDrift >
        SCORE_THRESHOLDS.elbowDriftGood
    ) {
        feedback.push(
            "Your elbow moves slightly during the curl. Keep the upper arm steadier."
        );
    }

    if (
        results.torso.maxLean !== null &&
        results.torso.maxLean >
        SCORE_THRESHOLDS.torsoLeanCaution
    ) {
        feedback.push(
            "Avoid leaning your torso to help move the weight."
        );
    } else if (
        results.torso.maxLean !== null &&
        results.torso.maxLean >
        SCORE_THRESHOLDS.torsoLeanGood
    ) {
        feedback.push(
            "Keep your torso more upright throughout the rep."
        );
    }

    if (
        results.bottom.quality === "poor"
    ) {
        feedback.push(
            "Extend your arm more at the bottom of the curl."
        );
    } else if (
        results.bottom.quality === "caution"
    ) {
        feedback.push(
            "Try to reach a little more extension at the bottom."
        );
    }

    if (
        results.top.quality === "poor"
    ) {
        feedback.push(
            "Curl higher at the top while keeping the elbow controlled."
        );
    } else if (
        results.top.quality === "caution"
    ) {
        feedback.push(
            "Try to bring the forearm slightly closer at the top."
        );
    }

    if (
        results.totalRom.quality === "poor"
    ) {
        feedback.push(
            "Use a larger range of motion throughout the curl."
        );
    }

    if (
        results.tempo.score < 60
    ) {
        feedback.push(
            "Slow the movement down and control the weight."
        );
    }

    if (feedback.length === 0) {
        feedback.push(
            "Strong rep. Good range of motion and control."
        );
    }

    return feedback;
}

export function analyzeBicepCurlRep(
    rep,
    poseHistory
) {
    if (!rep) {
        return null;
    }

    const side =
        rep.side === "left"
            ? "left"
            : "right";

    const startIndex =
        Number.isInteger(rep.startIndex)
            ? rep.startIndex
            : null;

    const endIndex =
        Number.isInteger(rep.endIndex)
            ? rep.endIndex
            : null;

    let frames = [];

    if (
        Array.isArray(poseHistory) &&
        startIndex !== null &&
        endIndex !== null
    ) {
        frames = poseHistory.slice(
            startIndex,
            endIndex + 1
        );
    }

    /*
     * Detector output is already authoritative
     * for the rep's elbow angles.
     */
    const topAngle = Number(rep.topElbowAngle);
    const bottomAngle = Number(rep.bottomElbowAngle);

    const rom = Number(
        rep.rom
    );

    const duration = Number(
        rep.duration
    );

    const elbowStability =
        analyzeElbowStability(
            frames,
            side
        );

    const torso =
        analyzeTorso(
            frames,
            side
        );

    const bottom =
        analyzeBottomRange(
            bottomAngle
        );

    const top =
        analyzeTopRange(
            topAngle
        );

    const totalRom =
        analyzeTotalRom(
            rom
        );

    const tempo =
        analyzeTempo(rep);

    /*
     * Main V1 form score.
     *
     * Elbow control: 30%
     * Torso control: 25%
     * Bottom ROM:    15%
     * Top ROM:       15%
     * Total ROM:     15%
     */
    const formScore =
        elbowStability.score * 0.30 +
        torso.score * 0.25 +
        bottom.score * 0.15 +
        top.score * 0.15 +
        totalRom.score * 0.15;

    const confidence =
        frames.length >= 10
            ? 95
            : frames.length >= 5
                ? 85
                : 70;

    const results = {
        repNumber: rep.repNumber,
        side,

        duration,
        topAngle,
        bottomAngle,
        rom,

        elbowStability,
        torso,
        bottom,
        top,
        totalRom,
        tempo,

        formScore: clamp(formScore),
        confidence,

        feedback: []
    };

    results.feedback =
        buildFeedback(results);

    console.log(
        "========== BICEP CURL FORM ANALYSIS =========="
    );

    console.log(
        `REP ${results.repNumber}`
    );

    console.log({
        side: results.side,
        duration: results.duration,
        topAngle: results.topAngle,
        bottomAngle: results.bottomAngle,
        rom: results.rom,

        elbowStability:
            results.elbowStability,

        torso:
            results.torso,

        bottom:
            results.bottom,

        top:
            results.top,

        totalRom:
            results.totalRom,

        tempo:
            results.tempo,

        formScore:
            results.formScore,

        confidence:
            results.confidence,

        feedback:
            results.feedback
    });

    console.log(
        "==============================================="
    );

    return results;
}