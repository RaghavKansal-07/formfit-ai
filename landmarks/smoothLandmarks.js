import {
    SMOOTHING_FACTOR
} from "../constants.js";


let previousSmoothedLandmarks = null;


// ============================================================
// SMOOTH LANDMARKS
// ============================================================

export function smoothLandmarks(
    currentLandmarks
) {

    // --------------------------------------------------------
    // First frame
    // --------------------------------------------------------

    if (!previousSmoothedLandmarks) {

        previousSmoothedLandmarks =
            currentLandmarks.map(
                point => ({
                    x: point.x,
                    y: point.y,
                    z: point.z,
                    visibility:
                        point.visibility ?? 1
                })
            );

        return previousSmoothedLandmarks;
    }


    // --------------------------------------------------------
    // Temporal smoothing
    // --------------------------------------------------------

    const smoothed =
        currentLandmarks.map(
            (point, index) => {

                const previous =
                    previousSmoothedLandmarks[index];


                return {

                    x:
                        previous.x +
                        SMOOTHING_FACTOR *
                        (point.x - previous.x),

                    y:
                        previous.y +
                        SMOOTHING_FACTOR *
                        (point.y - previous.y),

                    z:
                        previous.z +
                        SMOOTHING_FACTOR *
                        (point.z - previous.z),

                    visibility:
                        point.visibility ?? 1

                };

            }
        );


    previousSmoothedLandmarks =
        smoothed;


    return smoothed;
}


// ============================================================
// RESET SMOOTHING
// ============================================================

export function resetSmoothing() {

    previousSmoothedLandmarks = null;

}