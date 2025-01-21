var app, model2;
var modelInfo, emoMap;
var pointerInteractionEnabled = true;
// Known list of expression files:
  const expressionFiles = [
'∑扇子.exp3.json',
'侧发.exp3.json',
'兔兔.exp3.json',
'口水.exp3.json',
'后衣.exp3.json',
'哭泣.exp3.json',
'头发切换.exp3.json',
'头饰.exp3.json',
'对手指.exp3.json',
'心眼.exp3.json',
'慌张.exp3.json',
'拿扇子.exp3.json',
'拿手机.exp3.json',
'斗篷.exp3.json',
'星星眼.exp3.json',
'比心.exp3.json',
'申请.exp3.json',
'紫色.exp3.json',
'紫色瞳孔.exp3.json',
'红1.exp3.json',
'红2.exp3.json',
'纱.exp3.json',
'绿色.exp3.json',
'耳朵.exp3.json',
'脖子项圈.exp3.json',
'脸红.exp3.json',
'腿环.exp3.json',
'袖子.exp3.json',
'麦克风.exp3.json',
'黑脸.exp3.json'
  ];
  const expdir="exp/兔喽/";
let expressionsData
const live2dModule = (function () {
  const live2d = PIXI.live2d;

  async function init() {
    app = new PIXI.Application({
      view: document.getElementById("canvas"),
      autoStart: true,
      resizeTo: window,
      transparent: true,
      backgroundAlpha: 0,
    });
  }

  async function loadModel(modelInfo) {
    emoMap = modelInfo["emotionMap"];

    if (model2) {
      app.stage.removeChild(model2); // Remove old model
    }

    const models = await Promise.all([
      live2d.Live2DModel.from(modelInfo.url, {
        autoInteract: window.pointerInteractionEnabled
      }),
    ]);

    models.forEach((model) => {
      app.stage.addChild(model);

      const scaleX = (innerWidth * modelInfo.kScale);
      const scaleY = (innerHeight * modelInfo.kScale);

      model.scale.set(Math.min(scaleX, scaleY));
      model.y = innerHeight * 0.01;

      draggable(model);
    });

    model2 = models[0];
    //console.log(model2.internalModel.coreModel.setParameterValueById("Param9", 1.0))

    if (!modelInfo.initialXshift) modelInfo.initialXshift = 0;
    if (!modelInfo.initialYshift) modelInfo.initialYshift = 0;

    model2.x = app.view.width / 2 - model2.width / 2 + modelInfo["initialXshift"];
    model2.y = app.view.height / 2 - model2.height / 2 + modelInfo["initialYshift"];


  app.ticker.add(() => {
    if (!pointerInteractionEnabled) {
      currentX += (targetX - currentX) * lerpSpeed;
      currentY += (targetY - currentY) * lerpSpeed;
      //console.log(currentX, currentY);
      model2.internalModel.focusController.targetX = currentX;
      model2.internalModel.focusController.targetY = currentY;

    }
  });


  }

  function draggable(model) {
    model.buttonMode = true;
    model.on("pointerdown", (e) => {
      model.dragging = true;
      model._pointerX = e.data.global.x - model.x;
      model._pointerY = e.data.global.y - model.y;
    });
    model.on("pointermove", (e) => {
      if (model.dragging) {
        model.position.x = e.data.global.x - model._pointerX;
        model.position.y = e.data.global.y - model._pointerY;
      }
    });
    model.on("pointerupoutside", () => (model.dragging = false));
    model.on("pointerup", () => (model.dragging = false));
  }

  function changeBackgroundImage(imageUrl) {
    document.body.style.backgroundImage = `url('${imageUrl}')`;
  }

  return {
    init,
    loadModel,
    changeBackgroundImage
  };
})();

let idleInterval;
let currentX = 0;
let currentY = 0;
let targetX = 0;
let targetY = 0;

// Interpolation speed (adjust to taste)
const lerpSpeed = 0.05; // Smaller = slower, smoother; larger = quicker

document.addEventListener('DOMContentLoaded', function () {
  const pointerInteractionBtn = document.getElementById('pointerInteractionBtn');



  pointerInteractionBtn.addEventListener('click', function () {
    pointerInteractionEnabled = !pointerInteractionEnabled;
    pointerInteractionBtn.textContent = pointerInteractionEnabled
      ? "👀 Pointer Interactive On"
      : "❌ Pointer Interactive Off";

    if (model2) {
      model2.interactive = pointerInteractionEnabled;
    }

    if (!pointerInteractionEnabled) {
      // When interaction turns off, start idle motion
      // startIdleMotion();
      // startEyeMotion();
    } else {
      // When interaction turns on, stop idle motion and reset
      // stopIdleMotion();
      resetFocus();
      // stopEyeMotion()
    }
  });
});



let patternInterval;


let patternActive = false;

// Call this to start idle behavior
function startIdleMotion() {
  stopIdleMotion(); // Prevent duplicates

  // Immediately choose the first random target
  setRandomTarget();

  // Change gaze every 10 seconds
  idleInterval = setInterval(() => {
    // Only change target if we are not currently running a pattern
    if (!patternActive) {
      setRandomTarget();
    }
  }, 10000);

  // Every 1 minute (60,000 ms), trigger a pattern
  patternInterval = setInterval(() => {
    if (!patternActive) {
      // Pick a pattern at random, or choose a specific one
      const patterns = ["shake", "upDown","lookLeftRight"];
      const chosen = patterns[Math.floor(Math.random() * patterns.length)];
      startPattern(chosen, 3000); // run pattern for 3s
    }
  }, 60000);
}

// Call this to stop idle motion entirely
function stopIdleMotion() {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
  }

  if (patternInterval) {
    clearInterval(patternInterval);
    patternInterval = null;
  }

  patternActive = false;
}

// Reset focus back to center
function resetFocus() {
  if (model2 && model2.internalModel && model2.internalModel.focusController) {
    currentX = 0;
    currentY = 0;
    targetX = 0;
    targetY = 0;

    model2.internalModel.focusController.targetX = 0;
    model2.internalModel.focusController.targetY = 0;
  }
}

// Choose a random target for subtle movement
function setRandomTarget() {
  // Adjust these ranges for desired movement
  targetX = (Math.random() * 1.6) - 0.8;
  targetY = (Math.random() * 0.4) - 0.3;
}

// Start a special pattern
// type: string ("shake", "upDown", more can be added)
// duration: how long the pattern lasts (in ms)
function startPattern(type, duration) {
  patternActive = true;
  const startTime = Date.now();

  function runPattern() {
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      // Pattern complete, revert back to normal state
      patternActive = false;
      setRandomTarget(); // pick a new random target after pattern ends
      return;
    }

    // Calculate pattern-based positions
    const t = elapsed / 1000; // time in seconds
    if (type === "shake") {
      // Make targetX oscillate rapidly like a shake
      const frequency = 10; // shakes per second
      const amplitude = 0.2;
      targetX = Math.sin(t * frequency) * amplitude;
      targetY = 0;
    } else if (type === "upDown") {
      // Smoothly move up and down
      // One up/down cycle per second
      targetX = 0;
      targetY = Math.sin(t) * 0.3;
    }else if (type === "lookLeftRight") {
  targetX = Math.sin(t * 2) * 0.5;
  targetY = 0;
}


    requestAnimationFrame(runPattern);
  }

  requestAnimationFrame(runPattern);
}


  async function loadExpressions(fileList) {
    const expressions = {};
    for (const filePath of fileList) {
      const response = await fetch(expdir+filePath);
      if (!response.ok) {
        console.error(`Failed to load ${filePath}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      const baseName = filePath.split('/').pop().replace('.exp3.json', '');
      expressions[baseName] = data;
    }
    return expressions;
  }

  function populateExpressionSelect(expressionsObj) {
    const select = document.getElementById('expressionSelect');

    // Clear any existing options (other than the placeholder)
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add each expression as an option
    for (const expressionName in expressionsObj) {
      const option = document.createElement('option');
      option.value = expressionName;
      option.textContent = expressionName;
      select.appendChild(option);
    }
  }

  function setExpression1(expressionName) {
    const chosenExpression = expressionsData[expressionName];
    if (chosenExpression && chosenExpression.Parameters && model2 && model2.internalModel && model2.internalModel.coreModel) {
      chosenExpression.Parameters.forEach(param => {
        model2.internalModel.coreModel.setParameterValueById(param.Id, param.Value);
      });
    } else {
      console.log("No valid expression/model found or model2 is not initialized.");
    }
  }
    function unsetExpression1(expressionName) {
    const chosenExpression = expressionsData[expressionName];
    if (chosenExpression && chosenExpression.Parameters && model2 && model2.internalModel && model2.internalModel.coreModel) {
      chosenExpression.Parameters.forEach(param => {
        model2.internalModel.coreModel.setParameterValueById(param.Id, 0);
      });
    } else {
      console.log("No valid expression/model found or model2 is not initialized.");
    }
  }
  function setExpressionWithTimeout(expressionName, durationMs = 5000) {
  // Apply the expression
  setExpression1(expressionName);

  // Start a timer to unset the expression after `durationMs`
  setTimeout(() => {
    unsetExpression1(expressionName);
  }, durationMs);
}

  // Event listener for select change
  document.getElementById('expressionSelect').addEventListener('change', function() {
    const selectedExpression = this.value;
    if (selectedExpression) {
      setExpression1(selectedExpression);
    }
  });

  // On page load, fetch the expressions and populate the select menu
  (async () => {
    expressionsData = await loadExpressions(expressionFiles);
    console.log("Loaded expressions:", expressionsData);
    populateExpressionSelect(expressionsData);
  })();

let currentEyeX = 0;
let currentEyeY = 0;
let targetEyeX = 0;
let targetEyeY = 0;
const eyeLerpSpeed = 0.02; // Adjust for smoother or faster transitions
let eyeMoveInterval = null;

// Call this function once the model is loaded and ready
function startEyeMotion() {
  stopEyeMotion(); // Ensure we're not double-running

  // Immediately set an initial target
  setRandomEyeTarget();

  // Change the eye target every 5-10 seconds
  const minInterval = 5000;
  const maxInterval = 10000;
  const intervalTime = Math.round(Math.random() * (maxInterval - minInterval)) + minInterval;

  eyeMoveInterval = setInterval(() => {
    setRandomEyeTarget();
  }, intervalTime);

  // If you're using Pixi's ticker:
  app.ticker.add(updateEyes);

  // If you're using requestAnimationFrame:
  // function animateEyes() {
  //   updateEyes();
  //   requestAnimationFrame(animateEyes);
  // }
  // animateEyes();
}

// Stop the eye motion
function stopEyeMotion() {
  if (eyeMoveInterval) {
    clearInterval(eyeMoveInterval);
    eyeMoveInterval = null;
  }
}

// Set a random small target for the eyes
function setRandomEyeTarget() {
  // Keep the eyes within a small range, e.g. [-0.3, 0.3] for X and Y
  targetEyeX = (Math.random() * 0.8) - 0.4;
  targetEyeY = (Math.random() * 0.8) - 0.4;
}

// Update eyes each frame, smoothly interpolating towards target
function updateEyes() {
  if (!model2 || !model2.internalModel || !model2.internalModel.coreModel) return;

  // Interpolate (lerp) towards the target
  currentEyeX += (targetEyeX - currentEyeX) * eyeLerpSpeed;
  currentEyeY += (targetEyeY - currentEyeY) * eyeLerpSpeed;

  // Set the model parameters for eyes
  const coreModel = model2.internalModel.coreModel;
  coreModel.setParameterValueById("ParamEyeBallX", currentEyeX);
  coreModel.setParameterValueById("ParamEyeBallY", currentEyeY);
}
