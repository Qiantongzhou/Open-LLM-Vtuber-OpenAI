class MotionManager {
  constructor() {
    // Store current & target parameter states
    this.currentParams = {};
    this.targetParams  = {};

    // Initialize currentParams to the midpoint of each range
    for (let param in paramRanges) {
      const [minVal, maxVal] = paramRanges[param];
      const midVal = (minVal + maxVal) / 2;
      this.currentParams[param] = midVal;
      this.targetParams[param]  = midVal;
    }

    // Animation / timing
    this.transitionTime = 2000; // ms to move from one random pose to next
    this.progress       = 0;
    this.lastTimestamp  = null;
    this.state          = "idle";

    // Mood
    this.mood = "default"; // or "happy", "sad", etc.

    // Audio element reference (optional)
    this.currentAudio = null;
    this.rafId        = null;
  }

  /**
   * Start a motion session with given audio & mood.
   * - Plays the audio (if provided).
   * - Starts the animation loop for random motion with mood bias.
   */
  startMotion(audio, mood = "default") {
    // Set mood
    this.mood = mood;

    // If audio is provided, store & play it
    if (audio) {
      this.currentAudio = audio;
      this.currentAudio.play().catch(err => {
        console.error("Audio play error:", err);
      });
    }

    // Begin the motion animation
    this.state = "playing";
    this.progress = 0;
    this.lastTimestamp = null;

    // Generate a new random target to transition toward
    this.generateNewTargetParams();

    // Kick off the update loop
    const loop = (timestamp) => {
      if (this.state !== "playing") return; // Stop if not playing

      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const dt = timestamp - this.lastTimestamp; // ms since last frame
      this.lastTimestamp = timestamp;

      this.updateParams(dt);
      this.renderParams(); // apply to Live2D

      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /**
   * Stop the motion (and audio if any).
   */
  stopMotion() {
    this.state = "stopped";

    // Stop animation
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    // Stop audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    // Optionally reset all parameters to neutral or zero
    this.resetParams();
  }

  /**
   * Interpolate currentParams toward targetParams.
   */
  updateParams(dt) {
    // If we've spent 'dt' ms out of transitionTime
    this.progress += dt;
    const ratio = Math.min(this.progress / this.transitionTime, 1);

    // Linear interpolation from current -> target
    for (let param in this.currentParams) {
      const startVal = this.currentParams[param];
      const endVal   = this.targetParams[param];
      const newVal   = startVal + (endVal - startVal) * ratio;
      this.currentParams[param] = newVal;
    }

    // If we reached the end of the transition, pick a new random pose
    if (ratio >= 1) {
      this.generateNewTargetParams();
      this.progress = 0;
    }
  }

  /**
   * Generate a new random target for each parameter, then apply mood bias.
   */
  generateNewTargetParams() {
    for (let param in paramRanges) {
      const [minVal, maxVal] = paramRanges[param];

      // Random within range
      let randomVal = this.randomRange(minVal, maxVal);

      // Add mood offset
      const offset   = this.getMoodOffset(param, this.mood);
      randomVal     += offset;

      // Clamp to ensure we stay within param’s allowed range
      randomVal = Math.min(Math.max(randomVal, minVal), maxVal);

      this.targetParams[param] = randomVal;
    }
  }

  /**
   * Return offset for the specified param & mood.
   */
  getMoodOffset(param, mood) {
    const moodMap = moodOffsets[mood] || moodOffsets.default;
    return moodMap[param] || 0;
  }

  /**
   * Helper to get random number in [min, max].
   */
  randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }

  /**
   * Apply currentParams to the Live2D model each frame.
   * Adjust this to match your Live2D parameter setting API.
   */
  renderParams() {
    for (let param in this.currentParams) {
      const value = this.currentParams[param];
      // Example for Live2D parameter setting:
      if (typeof model2.internalModel.coreModel.setParameterValueById === "function") {
        model2.internalModel.coreModel.setParameterValueById(param, value);
      } else {
        model2.internalModel.coreModel.setParamFloat(param, value);
      }
    }
  }

  /**
   * (Optional) Reset all parameters to a neutral or zero state.
   */
  resetParams() {
    for (let param in paramRanges) {
      // For instance, set everything to the midpoint or 0
      const [minVal, maxVal] = paramRanges[param];
      const midVal = (minVal + maxVal) / 2;

      // Or if you want the mouth closed, eyes open, etc., define custom logic
      this.currentParams[param] = midVal;
      this.targetParams[param]  = midVal;
    }

    // Apply once to the model
    this.renderParams();
  }
}
// Define the Live2D parameters you want to animate, plus their allowed min/max
const paramRanges = {
  ParamAngleX:      [-30,  30],
  ParamAngleY:      [-30,  30],
  ParamAngleZ:      [-30,  30],
  ParamBodyAngleZ:  [-10,  10],
  ParamEyeROpen:    [0,    1],
  ParamEyeLOpen:    [0,    1],
  ParamEyeBallX:    [-1,   1],
  ParamEyeBallY:    [-1,   1],
  ParamBrowRY:      [-1,   1],
  ParamBrowLY:      [-1,   1],
};

// Mood “biases” – offsets added to each parameter
// Example: “happy” lifts eyebrows, opens eyes, angles head a bit upward, etc.
const moodOffsets = {
  happy: {
    ParamAngleX:  5,
    ParamAngleY:  5,
    ParamAngleZ:  0,
    ParamBodyAngleZ:  0,
    ParamEyeROpen:  0.2,
    ParamEyeLOpen:  0.2,
    ParamEyeBallX:  0,
    ParamEyeBallY:  0,
    ParamBrowRY:    0.2,
    ParamBrowLY:    0.2,
  },
  sad: {
    ParamAngleX:  -5,
    ParamAngleY:  -5,
    ParamAngleZ:   0,
    ParamBodyAngleZ: -2,
    ParamEyeROpen:  -0.2,
    ParamEyeLOpen:  -0.2,
    ParamEyeBallX:   0,
    ParamEyeBallY:   0,
    ParamBrowRY:    -0.2,
    ParamBrowLY:    -0.2,
  },
  // Fallback
  default: {
    ParamAngleX:  0,
    ParamAngleY:  0,
    ParamAngleZ:  0,
    ParamBodyAngleZ: 0,
    ParamEyeROpen:  0,
    ParamEyeLOpen:  0,
    ParamEyeBallX:  0,
    ParamEyeBallY:  0,
    ParamBrowRY:    0,
    ParamBrowLY:    0,
  }
};
// 1. Create a new MotionManager
const motionManager = new MotionManager();