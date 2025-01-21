// Idle motions definition
const IDLE_MOTIONS = [
  {
    name: "shakeHeadY",
    duration: 1500,
    animate: (elapsed, totalDuration) => {
      const progress = elapsed / totalDuration;
      const angle = Math.sin(progress * 2 * Math.PI * 2) * 5;
      return { ParamAngleY: angle };
    },
  },
  {
    name: "shakeHeadX",
    duration: 1500,
    animate: (elapsed, totalDuration) => {
      const progress = elapsed / totalDuration;
      const angle = Math.sin(progress * 2 * Math.PI * 2) * 10;
      return { ParamAngleX: angle };
    },
  },
  {
    name: "lookAround",
    duration: 2000,
    animate: (elapsed, totalDuration) => {
      const progress = elapsed / totalDuration;
      const x = Math.sin(progress * Math.PI * 2);
      return { ParamEyeBallX: x };
    },
  },
  {
    name: "bodyWiggleZ",
    duration: 1500,
    animate: (elapsed, totalDuration) => {
      const progress = elapsed / totalDuration;
      const bodyAngle = Math.sin(progress * 2 * Math.PI) * 5;
      return { ParamAngleZ: bodyAngle };
    },
  },
  {
    name: "bodyWiggle2",
    duration: 1500,
    animate: (elapsed, totalDuration) => {
      const progress = elapsed / totalDuration;
      const bodyAngle = Math.sin(progress * 2 * Math.PI) * 10;
      return { ParamBodyAngleZ: bodyAngle };
    },
  },
];


// Example ranges and mood offsets
const paramRanges = {
  ParamAngleX:     [-30, 30],
  ParamAngleY:     [-30, 30],
  ParamAngleZ:     [-30, 30],
  ParamBodyAngleZ: [-10, 10],
  ParamEyeROpen:   [0,    1],
  ParamEyeLOpen:   [0,    1],
  ParamBrowRY:     [-1,   1],
  ParamBrowLY:     [-1,   1],
};

const moodOffsets = {
  happy: {
    ParamAngleX:    5,
    ParamAngleY:    5,
    ParamAngleZ:    0,
    ParamBodyAngleZ: 0,
    ParamEyeROpen:   0.2,
    ParamEyeLOpen:   0.2,
    ParamBrowRY:     0.2,
    ParamBrowLY:     0.2,
  },
  sad: {
    ParamAngleX:    -5,
    ParamAngleY:    -5,
    ParamAngleZ:     0,
    ParamBodyAngleZ: -2,
    ParamEyeROpen:   -0.2,
    ParamEyeLOpen:   -0.2,
    ParamBrowRY:     -0.2,
    ParamBrowLY:     -0.2,
  },
  default: {
    ParamAngleX:     0,
    ParamAngleY:     0,
    ParamAngleZ:     0,
    ParamBodyAngleZ: 0,
    ParamEyeROpen:   0,
    ParamEyeLOpen:   0,
    ParamBrowRY:     0,
    ParamBrowLY:     0,
  },
};


// Core manager class
class AudioMotionManager {
  constructor() {
    this.currentAudio   = null;
    this.audioContext   = null;
    this.analyser       = null;
    this.dataArray      = null;
    this.rafId          = null; // Lip-sync
    this.motionRafId    = null; // Random motion
    this.state          = "idle";

    this.fullResponse   = "";
    this.amplitudeHistory = [];
    this.historySize    = 60;
    this.smoothedAmplitude = 0;

    // Random motion
    this.playMotion     = false;
    this.lastTimestamp  = null;
    this.motionProgress = 0;
    this.transitionTime = 2000;
    this.currentParams  = {};
    this.targetParams   = {};

    // Idle motion
    this.isIdle            = false;
    this.idleRafId         = null;
    this.currentIdleMotion = null;
    this.currentIdleStartTime = null;

    // 5-second wait before idle motion
    this.idleTimer   = null;
    this.fadeRafId   = null;

    // Initialize current & target from default
    for (let param in moodOffsets.default) {
      this.currentParams[param] = moodOffsets.default[param];
      this.targetParams[param]  = moodOffsets.default[param];
    }

    // If you want to start idle motion immediately on load, uncomment:
    // this.startIdleMotionLoop();
  }

  // --------------------------------------------------------------------------
  // MAIN API to play audio with lip-sync and random motion
  // --------------------------------------------------------------------------
  playAudioLipSync2(
    audio_base64,
    volumes,
    slice_length,
    text = null,
    expression_list = null,
    play_with_motion = true,
    onComplete = () => {}
  ) {
    // Cancel any idle motion or pending fade
    this.stopIdleMotionLoop();
    this.cancelFadeToDefault();
    this.clearIdleTimer();

    // If blocked
    if (this.state === "interrupted") {
      console.error("Playback blocked; state=", this.state);
      onComplete();
      return;
    }

    // Optional text
    if (text) {
      this.fullResponse += text;
      const messageEl = document.getElementById("message");
      if (messageEl) messageEl.textContent = text;
    }

    // Expression handling
    const displayExpression = expression_list ? expression_list[0] : null;
    console.log("Starting audio playback:", text, "| Expression=", displayExpression);

    // Attempt decode + play
    try {
      const audioBlob = this.base64ToBlob(audio_base64, "audio/wav");
      const audioUrl  = URL.createObjectURL(audioBlob);
      this.currentAudio = new Audio(audioUrl);

      // On ended
      this.currentAudio.addEventListener("ended", () => {
        console.log("Audio ended");
        this.cleanupAudio();
        onComplete();

        // Now schedule idle motion after a 5s wait (if no new audio arrives)
        this.scheduleIdleMotionStart();
      });

      // On error
      this.currentAudio.addEventListener("error", (error) => {
        console.error("Audio error:", error);
        this.cleanupAudio();
        onComplete();
        // Also wait 5s to go idle
        this.scheduleIdleMotionStart();
      });

      // Setup audio analyser
      this.setupAudioAnalysis(this.currentAudio);

      // Start playing
      this.state = "playing";
      this.currentAudio.play()
        .then(() => {
          console.log("Audio started");
          this.updateLipSync(); // Start lip-sync

          // Optionally random motion
          if (play_with_motion) {
            this.playMotion     = true;
            this.motionProgress = 0;
            this.lastTimestamp  = null;
            this.generateNewTargetParams();
            this.motionRafId = requestAnimationFrame((t) => this.updateMotion(t));
          }
        })
        .catch((err) => {
          console.error("Playback error:", err);
          onComplete();
          this.resetMouth();
          // Also wait 5s to go idle
          this.scheduleIdleMotionStart();
        });
    } catch (error) {
      console.error("playAudioLipSync2 error:", error);
      onComplete();
      // Wait 5s to go idle
      this.scheduleIdleMotionStart();
    }
  }

  // --------------------------------------------------------------------------
  // LIP-SYNC
  // --------------------------------------------------------------------------
  setupAudioAnalysis(htmlAudio) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    const source = this.audioContext.createMediaElementSource(htmlAudio);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.dataArray = new Uint8Array(this.analyser.fftSize);

    source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
  }

  updateLipSync() {
    if (!this.analyser || this.state !== "playing") return;

    this.analyser.getByteTimeDomainData(this.dataArray);

    // Compute average amplitude
    let total = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      total += Math.abs(this.dataArray[i] - 128);
    }
    const avgAmplitude = total / this.dataArray.length;

    // Rolling history
    this.amplitudeHistory.push(avgAmplitude);
    if (this.amplitudeHistory.length > this.historySize) {
      this.amplitudeHistory.shift();
    }

    // Calculate mean + std
    const { mean, stdev } = this.getMeanAndStd(this.amplitudeHistory);

    // Z-score, clamp, smoothing
    let zScore = 0;
    if (stdev > 1e-5) {
      zScore = (avgAmplitude - mean) / stdev;
    }
    let amplitudeNormalized = 0.5 + zScore * 0.1;
    amplitudeNormalized = Math.min(Math.max(amplitudeNormalized, 0.0), 1.0);

    if (this.smoothedAmplitude == null) {
      this.smoothedAmplitude = amplitudeNormalized;
    }
    const smoothingFactor = 0.2;
    this.smoothedAmplitude =
      this.smoothedAmplitude * (1 - smoothingFactor) +
      amplitudeNormalized * smoothingFactor;

    // Map to mouth
    const mouthY = this.smoothedAmplitude;
    const mouthX = -0.3 + (this.smoothedAmplitude * 0.8);
    setMouth(mouthY, mouthX);

    // Next frame
    this.rafId = requestAnimationFrame(() => this.updateLipSync());
  }

  // --------------------------------------------------------------------------
  // RANDOM MOTION WHILE PLAYING
  // --------------------------------------------------------------------------
  generateNewTargetParams(mood = "default") {
    for (let param in paramRanges) {
      const [minVal, maxVal] = paramRanges[param];
      let rndVal = this.randomRange(minVal, maxVal);

      const offset = moodOffsets[mood]?.[param] ?? 0;
      rndVal += offset;

      // clamp
      rndVal = Math.max(minVal, Math.min(maxVal, rndVal));
      this.targetParams[param] = rndVal;
    }
  }

  updateMotion(timestamp) {
    if (!this.playMotion || this.state !== "playing") return;

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }
    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.motionProgress += dt;
    const ratio = Math.min(this.motionProgress / this.transitionTime, 1);

    // Lerp
    for (let param in this.currentParams) {
      const startVal = this.currentParams[param] ?? 0;
      const endVal   = this.targetParams[param]  ?? 0;
      const newVal   = startVal + (endVal - startVal) * ratio;
      this.currentParams[param] = newVal;
    }

    // If we reached end, pick new target
    if (ratio >= 1) {
      this.generateNewTargetParams();
      this.motionProgress = 0;
    }

    this.renderMotionParams();
    this.motionRafId = requestAnimationFrame((t) => this.updateMotion(t));
  }

  renderMotionParams() {
    // Apply the current param values
    for (let param in this.currentParams) {
      model2.internalModel.coreModel.setParameterValueById(param, this.currentParams[param]);
    }

    // Force eyes to look forward
    const angleX = this.currentParams["ParamAngleX"] || 0;
    const angleY = this.currentParams["ParamAngleY"] || 0;
    let eyeBallX = -angleX / 30;
    let eyeBallY = -angleY / 30;
    eyeBallX = Math.max(-1, Math.min(1, eyeBallX));
    eyeBallY = Math.max(-1, Math.min(1, eyeBallY));

    model2.internalModel.coreModel.setParameterValueById("ParamEyeBallX", eyeBallX);
    model2.internalModel.coreModel.setParameterValueById("ParamEyeBallY", eyeBallY);
  }

  // --------------------------------------------------------------------------
  // AUDIO CLEANUP
  // --------------------------------------------------------------------------
  cleanupAudio() {
    // stop lip-sync
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // stop random motion
    this.playMotion = false;
    if (this.motionRafId) {
      cancelAnimationFrame(this.motionRafId);
      this.motionRafId = null;
    }
    // reset mouth
    this.resetMouth();
    // release audio
    if (this.currentAudio) {
      URL.revokeObjectURL(this.currentAudio.src);
      this.currentAudio = null;
    }
    // set state = idle
    this.state = "idle";
  }

  // --------------------------------------------------------------------------
  // FADE BACK TO DEFAULT PARAMS
  // --------------------------------------------------------------------------
  fadeToDefaultParams(duration = 1000, onComplete = () => {}) {
    // If a fade is in progress, cancel it first
    this.cancelFadeToDefault();

    const startTime = performance.now();
    const startParams = { ...this.currentParams };
    const endParams   = moodOffsets.default;

    const animateFade = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);

      for (let param in startParams) {
        const startVal = startParams[param] ?? 0;
        const endVal   = endParams[param]  ?? 0;
        const val      = startVal + (endVal - startVal) * t;
        this.currentParams[param] = val;
        model2.internalModel.coreModel.setParameterValueById(param, val);
      }

      if (t < 1) {
        this.fadeRafId = requestAnimationFrame(animateFade);
      } else {
        this.fadeRafId = null;
        onComplete();
      }
    };

    this.fadeRafId = requestAnimationFrame(animateFade);
  }

  cancelFadeToDefault() {
    if (this.fadeRafId) {
      cancelAnimationFrame(this.fadeRafId);
      this.fadeRafId = null;
    }
  }

  // --------------------------------------------------------------------------
  // IDLE MOTION (with random delay between motions)
  // --------------------------------------------------------------------------
  startIdleMotionLoop() {
    if (this.state !== "idle") return;
    this.isIdle = true;
    this.scheduleNextIdleMotion();
  }

  stopIdleMotionLoop() {
    this.isIdle = false;
    if (this.idleRafId) {
      cancelAnimationFrame(this.idleRafId);
      this.idleRafId = null;
    }
  }

  scheduleNextIdleMotion() {
    if (!this.isIdle) return;

    // Pick a random idle motion
    const motionIndex = Math.floor(Math.random() * IDLE_MOTIONS.length);
    this.currentIdleMotion = IDLE_MOTIONS[motionIndex];
    this.currentIdleStartTime = performance.now();

    this.idleRafId = requestAnimationFrame(this.updateIdleMotion.bind(this));
  }

  updateIdleMotion(timestamp) {
    if (!this.isIdle) return;

    const elapsed = timestamp - this.currentIdleStartTime;
    const motion  = this.currentIdleMotion;

    if (elapsed < motion.duration) {
      // Animate
      const paramValues = motion.animate(elapsed, motion.duration);
      for (let param in paramValues) {
        model2.internalModel.coreModel.setParameterValueById(param, paramValues[param]);
      }
      this.idleRafId = requestAnimationFrame(this.updateIdleMotion.bind(this));
    } else {
      // Motion finished -> fade back to default quickly
      this.fadeToDefaultParams(500, () => {
        // Then after a random delay, do next idle motion
        const nextDelay = this.randomRange(1000, 3000); // 1-3s
        setTimeout(() => {
          if (this.isIdle) {
            this.scheduleNextIdleMotion();
          }
        }, nextDelay);
      });
    }
  }

  // --------------------------------------------------------------------------
  // 5-SECOND WAIT BEFORE IDLE
  // --------------------------------------------------------------------------
  scheduleIdleMotionStart() {
    // Clear any existing idle timer
    this.clearIdleTimer();

    // Wait 5s. If no new audio arrives, fade to default then start idle
    this.idleTimer = setTimeout(() => {
      // Fade to default first
      this.fadeToDefaultParams(1000, () => {
        // Then only start idle motion once fully at default
        this.startIdleMotionLoop();
      });
    }, 5000);
  }

  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // UTILS
  // --------------------------------------------------------------------------
  interrupt() {
    this.state = "interrupted";
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.cleanupAudio();
    this.resetMouth();
    console.warn("Audio interrupted");
  }

  resetMouth() {
    setMouth(0, 0.5);
  }

  base64ToBlob(base64Data, contentType) {
    const base64 = base64Data.replace(/^data:.*;base64,/, "");
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  }

  getMeanAndStd(values) {
    if (!values || values.length === 0) {
      return { mean: 0, stdev: 1 };
    }
    const n = values.length;
    const mean = values.reduce((acc, v) => acc + v, 0) / n;
    let variance = 0;
    for (let i = 0; i < n; i++) {
      const diff = values[i] - mean;
      variance += diff * diff;
    }
    variance /= n;
    const stdev = Math.sqrt(variance);
    return { mean, stdev };
  }

  randomRange(min, max) {
    return Math.random() * (max - min) + min;
  }
}
