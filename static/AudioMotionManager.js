class EyeBlinkController {
  constructor() {
    // Possible param IDs
    this.paramLeft = "ParamEyeLOpen";
    this.paramRight = "ParamEyeROpen";

    // Current parameter values; default eyes fully open
    this.paramValues = {
      [this.paramLeft]: 1,
      [this.paramRight]: 1,
    };

    // List of possible random blink actions
    // Each action is defined by:
    //   name: string (for debugging),
    //   steps: array of animation steps.
    //
    // Each "step" object can have:
    //   - duration (ms)
    //   - targetL, targetR (final param values for left/right)
    //   - hold (boolean): if true, we simply hold the target for 'duration' (no interpolation).
    //       if false/omitted, we animate from current value to target over 'duration'.
    //
    // The "steps" array is played in sequence.
    //
    // Example actions:
    //   1) Normal quick blink
    //   2) Double blink (blink then blink again)
    //   3) Asymmetric partial blink (left=0.1, right=0.3)
    //   4) Fully closed for 5s
    this.actions = [
      {
        name: "Quick Blink",
        steps: [
          // Close
          { duration: 100, targetL: 0,   targetR: 0 },
          // Open
          { duration: 150, targetL: 1,   targetR: 1 },
        ],
      },
      {
        name: "Double Blink",
        steps: [
          // Blink 1 (close)
          { duration: 100, targetL: 0,   targetR: 0 },
          // Blink 1 (open)
          { duration: 150, targetL: 1,   targetR: 1 },
          // Blink 2 (close)
          { duration: 100, targetL: 0,   targetR: 0 },
          // Blink 2 (open)
          { duration: 150, targetL: 1,   targetR: 1 },
        ],
      },
      {
        name: "Asymmetric Partial Blink",
        steps: [
          // Move to partial
          { duration: 200, targetL: 0.1, targetR: 0.3 },
          // Hold partial for a short moment
          { duration: 400, targetL: 0.1, targetR: 0.3, hold: true },
          // Move back to fully open
          { duration: 300, targetL: 1,   targetR: 1 },
        ],
      },
      {
        name: "Full Close (5 sec)",
        steps: [
          // Close
          { duration: 300, targetL: 0,   targetR: 0 },
          // Hold closed for 5 seconds
          { duration: 5000, targetL: 0,   targetR: 0, hold: true },
          // Open
          { duration: 300, targetL: 1,   targetR: 1 },
        ],
      },
              {
        name: "Full  (5 sec)",
        steps: [
          // Close
          { duration: 300, targetL: 0,   targetR: 0 },
          // Hold closed for 5 seconds
          { duration: 2000, targetL: 0.6,   targetR: 0.6, hold: true },
          // Open
          { duration: 300, targetL: 1,   targetR: 1 },
        ],
      },
                      {
        name: "Full  (5 sec)",
        steps: [
          // Close
          { duration: 300, targetL: 0,   targetR: 0 },
          // Hold closed for 5 seconds
          { duration: 2000, targetL: 0.3,   targetR: 0.3, hold: true },
          // Open
          { duration: 300, targetL: 1,   targetR: 1 },
        ],
      },
                      {
        name: "Full2  (5 sec)",
        steps: [
          // Close
          { duration: 300, targetL: 0,   targetR: 0 },
          // Hold closed for 5 seconds
          { duration: 5000, targetL: 0.8,   targetR: 0.8, hold: true },
          // Open
          { duration: 300, targetL: 1,   targetR: 1 },
        ],
      },
    ];

    // Internal state for the current action
    this.currentAction = null;     // the chosen action object
    this.currentStepIndex = 0;     // which step we are in the current action
    this.stepStartTime = 0;        // when the current step started
    this.startValues = {           // param values at the start of a step
      [this.paramLeft]: 1,
      [this.paramRight]: 1,
    };

    // Set time to pick the next random blink (start as soon as possible)
    this.nextActionTime = performance.now();

    // Kick off the animation loop
    requestAnimationFrame(this._update.bind(this));
  }

  // Called once per frame
  _update(now) {
    // If we do not have a current action but it's time to do one, pick a random blink action
    if (!this.currentAction && now >= this.nextActionTime) {
      this._startRandomAction(now);
    }

    // If we have an action in progress, update it
    if (this.currentAction) {
      this._updateCurrentAction(now);
    }
    if(window.model2) {
      // Update the actual model2 parameters
      model2.internalModel.coreModel.setParameterValueById(
          this.paramLeft,
          this.paramValues[this.paramLeft]
      );
      model2.internalModel.coreModel.setParameterValueById(
          this.paramRight,
          this.paramValues[this.paramRight]
      );
    }
    // Schedule the next frame
    requestAnimationFrame(this._update.bind(this));
  }

  _startRandomAction(now) {
    // Pick a random blink action from the list
    this.currentAction = this.actions[Math.floor(Math.random() * this.actions.length)];
    this.currentStepIndex = 0;
    this.stepStartTime = now;

    // Store the values at the beginning of the action
    this.startValues[this.paramLeft] = this.paramValues[this.paramLeft];
    this.startValues[this.paramRight] = this.paramValues[this.paramRight];
  }

  _updateCurrentAction(now) {
    const step = this.currentAction.steps[this.currentStepIndex];
    const elapsed = now - this.stepStartTime;
    const duration = step.duration;

    // If the step is "hold", we just keep the target until it finishes
    if (step.hold) {
      // Set to target instantly
      this.paramValues[this.paramLeft]  = step.targetL;
      this.paramValues[this.paramRight] = step.targetR;
    } else {
      // Interpolate from startValues -> target over the duration
      const t = Math.min(elapsed / duration, 1); // from 0 to 1
      this.paramValues[this.paramLeft]  = this._lerp(this.startValues[this.paramLeft],  step.targetL,  t);
      this.paramValues[this.paramRight] = this._lerp(this.startValues[this.paramRight], step.targetR, t);
    }

    if (elapsed >= duration) {
      // Step finished, move to next step
      this.currentStepIndex++;

      if (this.currentStepIndex < this.currentAction.steps.length) {
        // Prepare for next step
        this.stepStartTime = now;
        // new start values are the current param values
        this.startValues[this.paramLeft]  = this.paramValues[this.paramLeft];
        this.startValues[this.paramRight] = this.paramValues[this.paramRight];
      } else {
        // Action completed
        this.currentAction = null;
        // Schedule next action after some random delay
        // e.g., wait 1-5 seconds for the next random blink
        const randomDelay = 1000 + Math.random() * 4000;
        this.nextActionTime = now + randomDelay;
      }
    }
  }

  _lerp(a, b, t) {
    return a + (b - a) * t;
  }
}



/**
 * ========================================================
 * Example single-file code demonstrating:
 * 1) An AnimationController class with a simple two-state
 *    state machine (IDLE and SPEAKING).
 * 2) An AudioMotionManager class that uses the
 *    AnimationController to drive Live2D model parameters.
 * 3) The AnimationController handles generating animations
 *    for IDLE (using IDLE_MOTIONS) and for SPEAKING
 *    (using a "start_random_motion"-style random param).
 * 4) Each animation is "triple-phase":
 *    - Phase 1: transition from default to target
 *    - Phase 2: do the main "active" motion
 *    - Phase 3: transition back to default
 *    The final frame always resets to default.
 * 5) The state machine:
 *    - Initially IDLE
 *    - When AudioMotionManager plays audio (lip-sync),
 *      we set state to SPEAKING.
 *    - When audio ends, we set state to IDLE again.
 *
 * NOTE: This is just an illustrative example. You can
 * adapt the logic / structure to your needs. Also note
 * that some functions (like setMouth) and the global
 * `model2` reference are placeholders for your environment.
 * ========================================================
 */

// -------------------------------------------
// Global references (example placeholders)
// -------------------------------------------


// -------------------------------------------
// Parameter definitions
// -------------------------------------------
const paramRanges = {
  ParamAngleX:      [-15,  15],
  ParamAngleY:      [-10,  10],
  ParamAngleZ:      [-30,  30],
  ParamBodyAngleZ:  [-10,  10],
  // ParamEyeROpen:    [0,    1],
  // ParamEyeLOpen:    [0,    1],
  ParamBrowRY:      [-0.5,   0.5],
  ParamBrowLY:      [-0.5,   0.5],
  ParamEyeBallY:   [-1,   1],
  ParamEyeBallX:   [-1,   1],
};

const moodOffsets = {
  happy: {
    ParamAngleX:     5,
    ParamAngleY:     5,
    ParamAngleZ:     0,
    ParamBodyAngleZ: 0,
    // ParamEyeROpen:   1,
    // ParamEyeLOpen:   1,
    ParamBrowRY:     0.2,
    ParamBrowLY:     0.2,
    ParamEyeBallY:   0,
    ParamEyeBallX:   0,
  },
  sad: {
    ParamAngleX:     -5,
    ParamAngleY:     -5,
    ParamAngleZ:     0,
    ParamBodyAngleZ: -2,
    // ParamEyeROpen:   1,
    // ParamEyeLOpen:   1,
    ParamBrowRY:     -0.2,
    ParamBrowLY:     -0.2,
    ParamEyeBallY:   0,
    ParamEyeBallX:   0,
  },
  default: {
    ParamAngleX:     0,
    ParamAngleY:     0,
    ParamAngleZ:     0,
    ParamBodyAngleZ: 0,
    // ParamEyeROpen:   1,
    // ParamEyeLOpen:   1,
    ParamBrowRY:     0,
    ParamBrowLY:     0,
    ParamEyeBallY:   0,
    ParamEyeBallX:   0,
  },
};

// -------------------------------------------
// Idle motions (examples)
// -------------------------------------------
const IDLE_MOTIONS = [
    {
    name: "mouthX",
    duration: 3000,
    animate: (progress) => {
      const Form = Math.sin(progress * 2 * Math.PI * 2)*0.5 ;
      return {
        ParamMouthForm: Form,

      };
    },
  },
  {
    name: "shakeHeadY",
    duration: 3000,
    animate: (progress) => {
      // 2 full cycles of sin => multiply progress by 2
      const angleY = Math.sin(progress * 2 * Math.PI * 2) * 5;

      // Invert angleY for ParamEyeBallX so eyes remain forward
      let eyeBallY = -angleY / 30;
      const [eyeMinY, eyeMaxY] = paramRanges.ParamEyeBallX || [-1, 1];
      eyeBallY = clamp(eyeBallY, eyeMinY, eyeMaxY);

      return {
        ParamAngleY: angleY,
        ParamEyeBallY: eyeBallY,
        ParamEyeBallX: 0,
      };
    },
  },
  {
    name: "shakeHeadX",
    duration: 3000,
    animate: (progress) => {
      const angleX = Math.sin(progress * 2 * Math.PI * 2) * 10;

      // Invert angleX for ParamEyeBallX or ParamEyeBallY to keep eyes forward
      let eyeBallX = -angleX / 30;
      const [eyeMinX, eyeMaxX] = paramRanges.ParamEyeBallY || [-1, 1];
      eyeBallX = clamp(eyeBallX, eyeMinX, eyeMaxX);

      return {
        ParamAngleX: angleX,
        ParamEyeBallY: 0,
        ParamEyeBallX: eyeBallX,
      };
    },
  },
  {
    name: "lookAround",
    duration: 3000,
    animate: (progress) => {
      // This one explicitly moves eyeballs side-to-side
      const x = Math.sin(progress * Math.PI * 2) * 0.7;
      return { ParamEyeBallX: x };
    },
  },
  {
    name: "bodyWiggle",
    duration: 3000,
    animate: (progress) => {
      const bodyAngle = Math.sin(progress * 2 * Math.PI) * 5;
      return { ParamAngleZ: bodyAngle };
    },
  },
  {
    name: "bodyWiggle2",
    duration: 3000,
    animate: (progress) => {
      const bodyAngle = Math.sin(progress * 2 * Math.PI) * 5;
      return { ParamBodyAngleZ: bodyAngle };
    },
  },

{
  name: "lookAwayX",
  duration: 10000, // 10 seconds total
  animate: (progress) => {
    /*
      Timeline (normalized progress 0..1 over 10s):
        0.00 - 0.05: ramp from 0 → 30 using sine ease (0.5s)
        0.05 - 0.85: hold at 30                      (8s)
        0.85 - 0.90: ramp from 30 → 0 using sine ease (0.5s)
        0.90 - 1.00: hold at 0                       (1s)
    */
    const rampUpEnd   = 0.07;
    const holdEnd     = 0.93;
    const rampDownEnd = 1;

    // "easeInOutSine" function:
    // Produces a smooth 0..1 progression
    function easeInOutSine(t) {
      // standard formula: 0.5 * (1 - cos(π * t))
      return 0.5 * (1 - Math.cos(Math.PI * t));
    }

    let angleX = 0;

    if (progress < rampUpEnd) {
      // --- Ramp up (0..0.05) ---
      const localP = progress / rampUpEnd; // 0..1
      angleX = 30 * easeInOutSine(localP);
    }
    else if (progress < holdEnd) {
      // --- Hold at 30 (0.05..0.85) ---
      angleX = 30;
    }
    else if (progress < rampDownEnd) {
      // --- Ramp down (0.85..0.9) ---
      // localP in [0..1] for the ramp-down segment
      const localP = (progress - holdEnd) / (rampDownEnd - holdEnd);
      // Start at 30, go back to 0
      // We can invert the easeInOutSine curve, so 0 => 30, 1 => 0
      angleX = 30 * (1 - easeInOutSine(localP));
    }
    else {
      // --- Final hold (0.9..1.0) at 0 ---
      angleX = 0;
    }

    return {
      ParamAngleX: angleX,
      // If you want the eyes to counter-rotate so they keep looking
      // straight at the camera, you can add ParamEyeBallX/ParamEyeBallY here
      // using a negative fraction of angleX, e.g.:
      // ParamEyeBallY: -angleX / 30,  // up/down if angleX is nod
      // (clamp if needed)
    };
  },
},
{
  name: "lookAwayX2",
  duration: 10000, // 10 seconds total
  animate: (progress) => {
    /*
      Timeline (normalized progress 0..1 over 10s):
        0.00 - 0.05: ramp from 0 → 30 using sine ease (0.5s)
        0.05 - 0.85: hold at 30                      (8s)
        0.85 - 0.90: ramp from 30 → 0 using sine ease (0.5s)
        0.90 - 1.00: hold at 0                       (1s)
    */
    const rampUpEnd   = 0.07;
    const holdEnd     = 0.93;
    const rampDownEnd = 1;

    // "easeInOutSine" function:
    // Produces a smooth 0..1 progression
    function easeInOutSine(t) {
      // standard formula: 0.5 * (1 - cos(π * t))
      return 0.5 * (1 - Math.cos(Math.PI * t));
    }

    let angleX = 0;

    if (progress < rampUpEnd) {
      // --- Ramp up (0..0.05) ---
      const localP = progress / rampUpEnd; // 0..1
      angleX = 30 * easeInOutSine(localP);
    }
    else if (progress < holdEnd) {
      // --- Hold at 30 (0.05..0.85) ---
      angleX = 30;
    }
    else if (progress < rampDownEnd) {
      // --- Ramp down (0.85..0.9) ---
      // localP in [0..1] for the ramp-down segment
      const localP = (progress - holdEnd) / (rampDownEnd - holdEnd);
      // Start at 30, go back to 0
      // We can invert the easeInOutSine curve, so 0 => 30, 1 => 0
      angleX = 30 * (1 - easeInOutSine(localP));
    }
    else {
      // --- Final hold (0.9..1.0) at 0 ---
      angleX = 0;
    }

    return {
      ParamAngleX: -angleX,
      // If you want the eyes to counter-rotate so they keep looking
      // straight at the camera, you can add ParamEyeBallX/ParamEyeBallY here
      // using a negative fraction of angleX, e.g.:
      // ParamEyeBallY: -angleX / 30,  // up/down if angleX is nod
      // (clamp if needed)
    };
  },
},
{
  name: "lookdowncloseeye",
  duration: 10000, // 10 seconds total
  animate: (progress) => {
    /*
      Timeline (normalized progress 0..1 over 10s):
        0.00 - 0.05: ramp from 0 → 30 using sine ease (0.5s)
        0.05 - 0.85: hold at 30                      (8s)
        0.85 - 0.90: ramp from 30 → 0 using sine ease (0.5s)
        0.90 - 1.00: hold at 0                       (1s)
    */
    const rampUpEnd   = 0.07;
    const holdEnd     = 0.93;
    const rampDownEnd = 1;

    // "easeInOutSine" function:
    // Produces a smooth 0..1 progression
    function easeInOutSine(t) {
      // standard formula: 0.5 * (1 - cos(π * t))
      return 0.5 * (1 - Math.cos(Math.PI * t));
    }

    let angleX = 0;
    let eye=0;
    if (progress < rampUpEnd) {
      // --- Ramp up (0..0.05) ---
      const localP = progress / rampUpEnd; // 0..1
      eye=easeInOutSine(localP)
      angleX = 30 * eye;
      eye=1-eye;
    }
    else if (progress < holdEnd) {
      // --- Hold at 30 (0.05..0.85) ---
      angleX = 30;
      eye=0;
    }
    else if (progress < rampDownEnd) {
      // --- Ramp down (0.85..0.9) ---
      // localP in [0..1] for the ramp-down segment
      const localP = (progress - holdEnd) / (rampDownEnd - holdEnd);
      // Start at 30, go back to 0
      // We can invert the easeInOutSine curve, so 0 => 30, 1 => 0
      eye=(1 - easeInOutSine(localP))
      angleX = 30 * eye;
      eye=1-eye;
    }
    else {
      // --- Final hold (0.9..1.0) at 0 ---
      angleX = 0;
    }

    return {
      ParamAngleY: -angleX,
      ParamEyeROpen: eye,
      ParamEyeLOpen: eye,
      // If you want the eyes to counter-rotate so they keep looking
      // straight at the camera, you can add ParamEyeBallX/ParamEyeBallY here
      // using a negative fraction of angleX, e.g.:
      // ParamEyeBallY: -angleX / 30,  // up/down if angleX is nod
      // (clamp if needed)
    };
  },
},
];

function lerpParams(startObj, endObj, alpha) {
  const result = {};
  for (let key in startObj) {
    if (endObj.hasOwnProperty(key)) {
      const s = startObj[key];
      const e = endObj[key];
      result[key] = s + (e - s) * alpha;
    } else {
      // fallback if not in endObj
      result[key] = startObj[key];
    }
  }
  return result;
}


// -------------------------------------------
// Utility functions
// -------------------------------------------
function clamp(value, minVal, maxVal) {
  return Math.max(minVal, Math.min(maxVal, value));
}

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function getDefaultParams() {
  return { ...moodOffsets.default };
}

// -------------------------------------------
// Dance State: holds memory between calls
// -------------------------------------------
const danceState = {
  style: null,               // e.g. "X", "Y", or "ALL"
  styleStepsRemaining: 0,    // how many times we'll stick to this style
  lastParams: getDefaultParams(),

  // We'll store amplitude & direction for each angle so we can "bounce."
  // Example usage: if directionX = +1, we set ParamAngleX to +amplitudeX;
  // next time we'll flip sign to -1 => ParamAngleX = -amplitudeX.
  amplitudeX: 0,
  directionX: 1,  // +1 or -1
  amplitudeY: 0,
  directionY: 1,
  amplitudeZ: 0,
  directionZ: 1,
  amplitudeBodyZ: 0,
  directionBodyZ: 1,

  // Eye/brow/eyelid style chosen at style select
  eyeLookAtScreen: true,  // if true => eyes look at camera, else random
  chosenEyeROpen: 1,      // 0..1
  chosenEyeLOpen: 1,      // 0..1
  chosenBrowRY: 0,        // -0.5..0.5
  chosenBrowLY: 0,
};

// Helper: pick a new dance style and randomize any needed data
function pickNewDanceStyle() {
  // 1) Pick a random style out of 3 possibilities
  const styles = ["X", "Y", "ALL"];
  const nextStyle = styles[Math.floor(Math.random() * styles.length)];
  danceState.style = nextStyle;

  // 2) Decide how many steps we’ll keep this style
  //    For example, 8–15 steps before picking a new style:
  danceState.styleStepsRemaining = Math.floor(randomRange(8, 15));

  // 3) Randomize amplitude for each angle (these are max angles)
  //    - If the style is "X," we only do X with some amplitude, the others = 0
  //    - If "ALL," random amplitude for X, Y, Z, BodyZ
  //    - etc.
  if (nextStyle === "X") {
    danceState.amplitudeX     = randomRange(5, 15);  // 5..15
    danceState.amplitudeY     = 0;
    danceState.amplitudeZ     = 0;
    danceState.amplitudeBodyZ = 0;
  } else if (nextStyle === "Y") {
    danceState.amplitudeX     = 0;
    danceState.amplitudeY     = randomRange(5, 10);  // 5..10
    danceState.amplitudeZ     = 0;
    danceState.amplitudeBodyZ = 0;
  } else {
    // "ALL"
    danceState.amplitudeX     = randomRange(5, 15);
    danceState.amplitudeY     = randomRange(5, 10);
    danceState.amplitudeZ     = randomRange(10, 30);
    danceState.amplitudeBodyZ = randomRange(5, 10);
  }

  // Reset directions (so first step might be +)
  danceState.directionX = 1;
  danceState.directionY = 1;
  danceState.directionZ = 1;
  danceState.directionBodyZ = 1;

  // 4) Eye style: 50% chance to look at screen or random
  danceState.eyeLookAtScreen = Math.random() < 0.5;

  // 5) Eyelids: pick closed=0, half=0.5, or open=1
  //    Weighted random for variety:
  const eyelidOptions = [0, 0.5, 1];
  danceState.chosenEyeROpen = eyelidOptions[Math.floor(Math.random()*eyelidOptions.length)];
  danceState.chosenEyeLOpen = danceState.chosenEyeROpen;
  // (Optionally you can differentiate left/right, but often they match.)

  // 6) Brows: random in [-0.5..0.5]
  danceState.chosenBrowRY = randomRange(-0.5, 0.5);
  danceState.chosenBrowLY = randomRange(-0.5, 0.5);
}

// -------------------------------------------
// Main function: getRandomParams -> returns
// a new set of dancing parameters each call
// -------------------------------------------
function getRandomParams() {
  // 1) If we have no style steps left, pick a new style
  if (danceState.styleStepsRemaining <= 0) {
    pickNewDanceStyle();
  }

  // 2) Decrement style steps
  danceState.styleStepsRemaining--;

  // 3) Compute new angles according to style
  //    For each angle we care about, we’ll just flip direction each time,
  //    so we go from +amplitude to -amplitude back to +amplitude, etc.
  //    You can also store the "current" angle in danceState if you want more fine-grained control.
  let angleX = 0, angleY = 0, angleZ = 0, bodyAngleZ = 0;

  // If amplitudeX != 0, bounce it
  if (danceState.amplitudeX > 0) {
    angleX = danceState.directionX * danceState.amplitudeX;
    danceState.directionX *= -1; // flip
    // clamp to range
    const [minX, maxX] = paramRanges.ParamAngleX;
    angleX = clamp(angleX, minX, maxX);
  }

  if (danceState.amplitudeY > 0) {
    angleY = danceState.directionY * danceState.amplitudeY;
    danceState.directionY *= -1;
    const [minY, maxY] = paramRanges.ParamAngleY;
    angleY = clamp(angleY, minY, maxY);
  }

  if (danceState.amplitudeZ > 0) {
    angleZ = danceState.directionZ * danceState.amplitudeZ;
    danceState.directionZ *= -1;
    const [minZ, maxZ] = paramRanges.ParamAngleZ;
    angleZ = clamp(angleZ, minZ, maxZ);
  }

  if (danceState.amplitudeBodyZ > 0) {
    bodyAngleZ = danceState.directionBodyZ * danceState.amplitudeBodyZ;
    danceState.directionBodyZ *= -1;
    const [minBodyZ, maxBodyZ] = paramRanges.ParamBodyAngleZ;
    bodyAngleZ = clamp(bodyAngleZ, minBodyZ, maxBodyZ);
  }

  // 4) Eye direction
  //    If eyeLookAtScreen => (0,0), else random
  let eyeBallX = 0;
  let eyeBallY = 0;
  if (!danceState.eyeLookAtScreen) {
    // random within [-1..1], but smaller range for more subtle shifts
    eyeBallX = randomRange(-0.6, 0.6);
    eyeBallY = randomRange(-0.6, 0.6);
    eyeBallX = clamp(eyeBallX, paramRanges.ParamEyeBallX[0], paramRanges.ParamEyeBallX[1]);
    eyeBallY = clamp(eyeBallY, paramRanges.ParamEyeBallY[0], paramRanges.ParamEyeBallY[1]);
  }

  // 5) Eyelids (fixed once per style)
  let eyeROpen = clamp(danceState.chosenEyeROpen, 0, 1);
  let eyeLOpen = clamp(danceState.chosenEyeLOpen, 0, 1);

  // 6) Brows (fixed once per style)
  let browRY = clamp(danceState.chosenBrowRY, -0.5, 0.5);
  let browLY = clamp(danceState.chosenBrowLY, -0.5, 0.5);

  // 7) Build the new param object
  let newParams = {
    ParamAngleX: angleX,
    ParamAngleY: angleY,
    ParamAngleZ: angleZ,
    ParamBodyAngleZ: bodyAngleZ,

    ParamEyeBallX: eyeBallX,
    ParamEyeBallY: eyeBallY,

    // ParamEyeROpen: eyeROpen,
    // ParamEyeLOpen: eyeLOpen,

    ParamBrowRY: browRY,
    ParamBrowLY: browLY,
  };

  // 8) Store in danceState.lastParams in case you want it later
  danceState.lastParams = newParams;

  return newParams;
}

// -------------------------------------------
// AnimationController
// -------------------------------------------
class AnimationController {
  constructor() {
    /**
     * Two states: "idle" or "speaking"
     */
    this.state = "idle";

    /**
     * We'll store our animation chain as an array of "phases."
     * Each phase is an object: { totalTime, evalFn }
     * We'll play them in order, from index=0..N-1.
     */
    this.currentChain = null;
    this.chainIndex = 0;
    this.phaseStartTime = 0;

    // Keep track of last RAF timestamp
    this.lastTimestamp = null;

    // Start the requestAnimationFrame loop
    requestAnimationFrame((t) => this.update(t));
  }

  /**
   * Set the current state (idle or speaking).
   * If the new state is different, we will eventually pick
   * a new animation once the current chain finishes.
   */
  setState(newState) {
    if (newState !== this.state) {
      this.state = newState;
    }
  }

  /**
   * Called every frame by requestAnimationFrame.
   */
  update(timestamp) {
    // If no model, bail out
    if (!window.model2 || !model2.internalModel) {
      requestAnimationFrame((t) => this.update(t));
      return;
    }

    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }
    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    // ---------------------
    // If we have no chain, pick a new one (if we want continuous motion)
    // or skip if we want absolutely no motion.
    // Here we will always pick a new animation if none is running.
    // (You can conditionally do that only for "idle" or "speaking" if needed.)
    // ---------------------
    if (!this.currentChain) {
      this.currentChain = this.createNewChainForState(this.state);
      this.chainIndex = 0;
      this.phaseStartTime = timestamp;
    }

    // ---------------------
    // Update the current chain (phases)
    // ---------------------
    if (this.currentChain) {
      const currentPhase = this.currentChain[this.chainIndex];
      if (currentPhase) {
        const phaseElapsed = timestamp - this.phaseStartTime;
        let phaseDone = false;
        let phaseProgress = phaseElapsed / currentPhase.totalTime;

        if (phaseProgress >= 1.0) {
          phaseProgress = 1.0;
          phaseDone = true;
        }

        // Evaluate param values from this phase
        const paramValues = currentPhase.evalFn(phaseProgress);
        // Apply
        for (let pid in paramValues) {
          model2.internalModel.coreModel.setParameterValueById(pid, paramValues[pid]);
        }

        // If this phase is done, move to next
        if (phaseDone) {
          this.chainIndex++;
          this.phaseStartTime = timestamp;

          // If we ran out of phases, the chain is complete
          if (this.chainIndex >= this.currentChain.length) {
            // Mark chain as done
            this.currentChain = null;
          }
        }
      }
    }

    // Request next frame
    requestAnimationFrame((t) => this.update(t));
  }

  /**
   * Creates a new "animation chain" for the current state.
   * This chain might be triple-phase: fade in, active, fade out.
   * Then it returns an array of phases: [phase1, phase2, phase3].
   *
   * If you'd like to keep it simpler, you can do everything in 1 or 2 phases,
   * but here's a clearer approach using distinct objects.
   */
  createNewChainForState(state) {
    if (state === "idle") {
      // Pick a random idle motion
      const idx = Math.floor(Math.random() * IDLE_MOTIONS.length);
      const idleMotion = IDLE_MOTIONS[idx];
      // Example: 300ms fade in, motion.duration active, 300ms fade out
      return this.createTriplePhaseChain(idleMotion, Math.random()*300, Math.random()*300);
    } else {
      // state === "speaking"
      // For the speaking, let's create a chain that picks random params
      // Example: 500ms fade in, 1000ms hold, 500ms fade out
      return this.createRandomChain(Math.random()*500+150, Math.random()*500+150, Math.random()*1000+200);
    }
  }

  /**
   * Given a motion { duration, animate(progress) }, returns
   * a triple-phase array: [fadeIn, active, fadeOut].
   *
   * fadeIn: from default => motion(0)
   * active: uses motion.animate(progress) from 0..1
   * fadeOut: from motion(1) => default
   */
  createTriplePhaseChain(motion, fadeInTime, fadeOutTime) {
    const defaultParams = getDefaultParams();
    const motionStartVals = motion.animate(0);
    const motionEndVals   = motion.animate(1);
    console.log("now playing: "+motion.name)
    // fadeIn phase
    const phase1 = {
      totalTime: fadeInTime,
      evalFn: (p) => {
        // linear interpolation from defaultParams to motionStartVals
        return lerpParams(defaultParams, motionStartVals, p);
      },
    };

    // active phase
    const phase2 = {
      totalTime: motion.duration,
      evalFn: (p) => {
        // pass p (0..1) to motion's animate
        return motion.animate(p);
      },
    };

    // fadeOut phase
    const phase3 = {
      totalTime: fadeOutTime,
      evalFn: (p) => {
        // motionEndVals => defaultParams
        return lerpParams(motionEndVals, defaultParams, p);
      },
    };

    return [phase1, phase2, phase3];
  }

  /**
   * Creates a triple-phase "random param" chain for speaking.
   * fadeIn: default => randomTarget
   * hold: keep randomTarget (no motion) or you can do sinusoidal wiggle
   * fadeOut: randomTarget => default
   */
  createRandomChain(fadeInTime, fadeOutTime, holdTime) {
    const defaultParams = getDefaultParams();
    const targetParams = getRandomParams();

    // fade in
    const phase1 = {
      totalTime: fadeInTime,
      evalFn: (p) => {
        return lerpParams(defaultParams, targetParams, p);
      },
    };

    // hold / active
    const phase2 = {
      totalTime: holdTime,
      evalFn: (p) => {
        // Here we just hold the targetParams. If you want
        // a wave, you can do param changes based on p.
        return { ...targetParams };
      },
    };

    // fade out
    const phase3 = {
      totalTime: fadeOutTime,
      evalFn: (p) => {
        return lerpParams(targetParams, defaultParams, p);
      },
    };

    return [phase1, phase2, phase3];
  }
}

// -------------------------------------------
// AudioMotionManager
// - calls lipsync (async)
// - changes animation state to "speaking" when playing
// - changes animation state to "idle" when done
// -------------------------------------------
class AudioMotionManager {
  constructor(animationController) {
    this.animationController = animationController;
    const eyeBlinkHandler = new EyeBlinkController();
    // Audio / Lip-Sync
    this.currentAudio  = null;
    this.audioContext  = null;
    this.analyser      = null;
    this.dataArray     = null;
    this.rafId         = null;  // For lip-sync animation frame
    this.state         = "idle";

    this.fullResponse      = "";
    this.amplitudeHistory  = [];
    this.historySize       = 60;

    // For smoothing the mouth amplitude
    this.smoothedAmplitude = 0;
  }

  /**
   * Main API: Play audio from Base64, do lip-sync
   */
  playAudioLipSync2(
    audio_base64,
    volumes,
    slice_length,
    text = null,
    expression_list = null,
    play_with_motion = true,
    onComplete = () => {}
  ) {
    // If currently interrupted, bail
    if (this.state === "interrupted") {
      console.error("音频播放被阻止。状态：", this.state);
      onComplete();
      return;
    }

    // Optional text
    if (text) {
      this.fullResponse += text;
      const messageEl = document.getElementById("message");
      if (messageEl) {
        messageEl.textContent = text;
      }
    }

    // Expression handling
    const displayExpression = expression_list ? expression_list[0] : null;
    console.log("开始播放音频：", text, "| 表情：", displayExpression);

    // ================
    //  Async decode
    // ================
    const dataUrl = `data:audio/wav;base64,${audio_base64.replace(/^data:.*;base64,/, "")}`;

    // Convert base64 -> blob asynchronously via fetch
    fetch(dataUrl)
      .then(response => response.blob())
      .then(blob => {
        const audioUrl = URL.createObjectURL(blob);
        this.currentAudio = new Audio(audioUrl);

        // On ended
        this.currentAudio.addEventListener("ended", () => {
          console.log("语音播放结束");
          this.cleanupAudio();
          onComplete();
          // Switch to idle state
          this.animationController.setState("idle");
        });

        // On error
        this.currentAudio.addEventListener("error", (error) => {
          console.error("音频播放错误:", error);
          this.cleanupAudio();
          onComplete();
          this.animationController.setState("idle");
        });

        // Setup analyser for lip-sync
        this.setupAudioAnalysis(this.currentAudio);

        // Start playing
        this.state = "playing";
        this.currentAudio.play()
          .then(() => {
            console.log("音频开始播放");
            this.updateLipSync(); // Start lip-sync

            // Switch to speaking state for the animation
            if (play_with_motion) {
              this.animationController.setState("speaking");
            }
          })
          .catch((err) => {
            console.error("播放错误:", err);
            onComplete();
            this.resetMouth();
            this.animationController.setState("idle");
          });
      })
      .catch((error) => {
        console.error("playAudioLipSync2 函数错误:", error);
        onComplete();
        this.animationController.setState("idle");
      });
  }

  /**
   * Setup Web Audio API
   */
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

  /**
   * Animation frame: Lip-sync update
   */
  updateLipSync() {
    if (!this.analyser || this.state !== "playing") {
      return;
    }

    this.analyser.getByteTimeDomainData(this.dataArray);

    // compute avg amplitude
    let total = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      total += Math.abs(this.dataArray[i] - 128);
    }
    const avgAmplitude = total / this.dataArray.length;

    // rolling history
    this.amplitudeHistory.push(avgAmplitude);
    if (this.amplitudeHistory.length > this.historySize) {
      this.amplitudeHistory.shift();
    }

    // mean & std
    const { mean, stdev } = this.getMeanAndStd(this.amplitudeHistory);

    // z-score + clamp
    let zScore = 0;
    if (stdev > 1e-5) {
      zScore = (avgAmplitude - mean) / stdev;
    }
    let amplitudeNormalized = 0.5 + zScore * 0.1;
    amplitudeNormalized = Math.min(Math.max(amplitudeNormalized, 0.0), 1.0);

    // smoothing
    if (this.smoothedAmplitude == null) {
      this.smoothedAmplitude = amplitudeNormalized;
    }
    const smoothingFactor = 0.2;
    this.smoothedAmplitude =
      this.smoothedAmplitude * (1 - smoothingFactor) +
      amplitudeNormalized * smoothingFactor;

    // map to mouth
    const mouthY = this.smoothedAmplitude;
    const mouthX = -0.3 + this.smoothedAmplitude * 0.8;
    setMouth(mouthY, mouthX);

    // Next frame
    this.rafId = requestAnimationFrame(() => this.updateLipSync());
  }

  /**
   * Cleanup
   */
  cleanupAudio() {
    // Stop lip-sync
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Reset mouth
    this.resetMouth();

    // Release audio
    if (this.currentAudio) {
      URL.revokeObjectURL(this.currentAudio.src);
      this.currentAudio = null;
    }

    this.state = "idle";
  }

  /**
   * Interrupt
   */
  interrupt() {
    this.state = "interrupted";
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.cleanupAudio();
    this.resetMouth();
    console.warn("音频播放已被打断");
  }

  /**
   * Helper: reset mouth
   */
  resetMouth() {
    setMouth(0, 0.5); // neutral mouth pose
  }

  /**
   * Compute mean & std
   */
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
}
