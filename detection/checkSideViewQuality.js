export function checkSideViewQuality(data) {

    if (
        !Array.isArray(data) ||
        data.length === 0
    ) {
        return {
            valid: false,
            score: 0
        };
    }


    let totalScore = 0;
    let count = 0;


    for (const frame of data) {

        if (
            !frame ||
            !Array.isArray(frame.landmarks) ||
            frame.landmarks.length < 29
        ) {
            continue;
        }


        const leftHip =
            frame.landmarks[23];

        const rightHip =
            frame.landmarks[24];

        const leftKnee =
            frame.landmarks[25];

        const rightKnee =
            frame.landmarks[26];


        if (
            !leftHip ||
            !rightHip ||
            !leftKnee ||
            !rightKnee
        ) {
            continue;
        }


        // In a side view, the left/right body points
        // should overlap more in the image than they do
        // in a front-facing view.
        const hipSeparation =
            Math.abs(
                leftHip.x -
                rightHip.x
            );


        const kneeSeparation =
            Math.abs(
                leftKnee.x -
                rightKnee.x
            );


        const hipScore =
            Math.max(
                0,
                1 -
                hipSeparation / 0.20
            );


        const kneeScore =
            Math.max(
                0,
                1 -
                kneeSeparation / 0.25
            );


        totalScore +=
            (hipScore + kneeScore) / 2;

        count++;
    }


    if (count === 0) {

        return {
            valid: false,
            score: 0
        };
    }


    const score =
        totalScore / count;


    return {
        valid: score >= 0.45,
        score
    };
}