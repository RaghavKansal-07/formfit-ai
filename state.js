// ============================================================
// STATE.JS
// Central application state
// ============================================================


// ============================================================
// MEDIAPIPE
// ============================================================

let poseLandmarker = null;
let poseLandmarkerReady = false;


// ============================================================
// VIDEO / CANVAS
// ============================================================

let video = null;

let canvas = null;
let ctx = null;

let videoFile = null;
let videoURL = null;

let videoWidth = 0;
let videoHeight = 0;
let videoDuration = 0;

let currentVideoTime = 0;
let currentFrame = 0;
let totalFrames = 0;

let lastVideoTime = -1;

let isProcessingVideo = false;
let isVideoAnalysisComplete = false;

// ============================================================
// EXERCISE SELECTION
// ============================================================

let selectedExercise = "squat";


export function getSelectedExercise() {
    return selectedExercise;
}

export function setSelectedExercise(value) {
    selectedExercise = value;
}


// ============================================================
// POSE HISTORY
// ============================================================

let poseHistory = [];


// ============================================================
// SIDE VIEW
// ============================================================

let sideViewQuality = 0;
let primarySide = null;


// ============================================================
// SQUAT RESULTS
// ============================================================

let completeReps = [];
let analyzedReps = [];

let detectedRepCount = 0;


// ============================================================
// ANALYSIS STATUS
// ============================================================

let analysisStatus = "idle";


// ============================================================
// DEBUG / TIMING
// ============================================================

let debugMode = false;

let analysisStartedAt = null;
let analysisFinishedAt = null;


// ============================================================
// MEDIAPIPE GETTERS / SETTERS
// ============================================================

export function getPoseLandmarker() {
    return poseLandmarker;
}

export function setPoseLandmarker(value) {
    poseLandmarker = value;
}


export function getPoseLandmarkerReady() {
    return poseLandmarkerReady;
}

export function setPoseLandmarkerReady(value) {
    poseLandmarkerReady = value;
}


// ============================================================
// VIDEO GETTERS / SETTERS
// ============================================================

export function getVideo() {
    return video;
}

export function setVideo(value) {
    video = value;
}


export function getCanvas() {
    return canvas;
}

export function setCanvas(value) {
    canvas = value;
}


export function getCtx() {
    return ctx;
}

export function setCtx(value) {
    ctx = value;
}


export function getVideoFile() {
    return videoFile;
}

export function setVideoFile(value) {
    videoFile = value;
}


export function getVideoURL() {
    return videoURL;
}

export function setVideoURL(value) {
    videoURL = value;
}


export function getVideoDimensions() {
    return {
        width: videoWidth,
        height: videoHeight
    };
}

export function setVideoDimensions(width, height) {
    videoWidth = width;
    videoHeight = height;
}


export function getVideoDuration() {
    return videoDuration;
}

export function setVideoDuration(value) {
    videoDuration = value;
}


export function getCurrentVideoTime() {
    return currentVideoTime;
}

export function setCurrentVideoTime(value) {
    currentVideoTime = value;
}


export function getCurrentFrame() {
    return currentFrame;
}

export function setCurrentFrame(value) {
    currentFrame = value;
}


export function incrementCurrentFrame() {
    currentFrame += 1;
    return currentFrame;
}


export function getTotalFrames() {
    return totalFrames;
}

export function setTotalFrames(value) {
    totalFrames = value;
}


export function getLastVideoTime() {
    return lastVideoTime;
}

export function setLastVideoTime(value) {
    lastVideoTime = value;
}


export function getIsProcessingVideo() {
    return isProcessingVideo;
}

export function setIsProcessingVideo(value) {
    isProcessingVideo = value;
}


export function getIsVideoAnalysisComplete() {
    return isVideoAnalysisComplete;
}

export function setIsVideoAnalysisComplete(value) {
    isVideoAnalysisComplete = value;
}


// ============================================================
// POSE HISTORY GETTERS / SETTERS
// ============================================================

export function getPoseHistory() {
    return poseHistory;
}

export function setPoseHistory(value) {
    poseHistory = value;
}

export function addPoseHistory(frameData) {
    poseHistory.push(frameData);
}


// ============================================================
// SIDE VIEW GETTERS / SETTERS
// ============================================================

export function getSideViewQuality() {
    return sideViewQuality;
}

export function setSideViewQuality(value) {
    sideViewQuality = value;
}


export function getPrimarySide() {
    return primarySide;
}

export function setPrimarySide(value) {
    primarySide = value;
}


// ============================================================
// SQUAT RESULT GETTERS / SETTERS
// ============================================================

export function getCompleteReps() {
    return completeReps;
}

export function setCompleteReps(value) {
    completeReps = value;
}


export function getAnalyzedReps() {
    return analyzedReps;
}

export function setAnalyzedReps(value) {
    analyzedReps = value;
}


export function getDetectedRepCount() {
    return detectedRepCount;
}

export function setDetectedRepCount(value) {
    detectedRepCount = value;
}


// ============================================================
// ANALYSIS STATUS GETTERS / SETTERS
// ============================================================

export function getAnalysisStatus() {
    return analysisStatus;
}

export function setAnalysisStatus(value) {
    analysisStatus = value;
}


// ============================================================
// DEBUG GETTERS / SETTERS
// ============================================================

export function getDebugMode() {
    return debugMode;
}

export function setDebugMode(value) {
    debugMode = value;
}


export function getAnalysisStartedAt() {
    return analysisStartedAt;
}

export function setAnalysisStartedAt(value) {
    analysisStartedAt = value;
}


export function getAnalysisFinishedAt() {
    return analysisFinishedAt;
}

export function setAnalysisFinishedAt(value) {
    analysisFinishedAt = value;
}


// ============================================================
// RESET ANALYSIS STATE
// ============================================================

export function resetAnalysisState() {

    poseHistory = [];

    currentVideoTime = 0;
    currentFrame = 0;
    totalFrames = 0;

    lastVideoTime = -1;

    sideViewQuality = 0;
    primarySide = null;

    completeReps = [];
    analyzedReps = [];

    detectedRepCount = 0;

    analysisStartedAt = null;
    analysisFinishedAt = null;

    isProcessingVideo = false;
    isVideoAnalysisComplete = false;

    analysisStatus = "idle";
}


// ============================================================
// COMPLETE ANALYSIS STATE
// ============================================================

export function getAnalysisState() {

    return {

        video: {
            width: videoWidth,
            height: videoHeight,
            duration: videoDuration,
            currentTime: currentVideoTime,
            currentFrame,
            totalFrames
        },

        pose: {
            poseHistoryLength: poseHistory.length
        },

        sideView: {
            quality: sideViewQuality,
            primarySide
        },

        squat: {
            reps: completeReps.length,
            analyzedReps: analyzedReps.length,
            detectedRepCount
        },

        status: analysisStatus,

        processing: {
            isProcessingVideo,
            isVideoAnalysisComplete
        }
    };
}