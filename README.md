# FormFit AI

## AI-Powered Exercise Form Analyzer

FormFit AI is a web-based AI fitness application that analyzes exercise videos using computer vision and pose estimation.

The application detects exercise repetitions and evaluates important aspects of movement technique, including:

- Range of motion
- Body and joint stability
- Posture
- Movement tempo
- Exercise-specific form

FormFit AI currently includes analysis support for **squats** and **bicep curls**.

---

## Problem Statement

When exercising without a trainer, it can be difficult to determine whether an exercise is being performed with proper technique.

FormFit AI aims to provide automated visual feedback by analyzing recorded exercise videos and identifying important movement characteristics.

The system uses human pose landmarks extracted from video frames to detect repetitions and evaluate exercise form.

---

## How It Works

The application follows this general workflow:

1. The user uploads an exercise video.
2. The video is processed frame by frame.
3. MediaPipe Pose Landmarker detects body landmarks.
4. Landmark data is smoothed to reduce frame-to-frame noise.
5. Joint angles and movement information are calculated.
6. Exercise-specific logic detects completed repetitions.
7. Each detected repetition is analyzed.
8. A form score and feedback are generated.

### Processing Pipeline

```text
Exercise Video
      |
      v
MediaPipe Pose Detection
      |
      v
Pose Landmarks
      |
      v
Landmark Smoothing
      |
      v
Joint Angle Calculation
      |
      v
Exercise Rep Detection
      |
      v
Rep-by-Rep Form Analysis
      |
      v
Form Score + Feedback