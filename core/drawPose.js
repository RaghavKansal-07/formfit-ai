import {
    DrawingUtils,
    PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

import {
    getCanvas,
    getCtx
} from "../state.js";


let drawingUtils = null;


export function drawPose(
    landmarks
) {

    const canvas =
        getCanvas();

    const ctx =
        getCtx();


    if (
        !canvas ||
        !ctx ||
        !landmarks
    ) {
        return;
    }


    if (!drawingUtils) {
        drawingUtils =
            new DrawingUtils(ctx);
    }


    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    drawingUtils.drawConnectors(
        landmarks,
        PoseLandmarker.POSE_CONNECTIONS
    );


    drawingUtils.drawLandmarks(
        landmarks,
        {
            radius: 4
        }
    );
}
