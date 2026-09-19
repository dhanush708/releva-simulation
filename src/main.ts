/**
 * main.ts — Application Orchestrator
 *
 * Architecture:
 *   PHYSICS MODEL → SIMULATION STATE → (3D Scene + Graph + UI Panels)
 *
 * The scene and graph never compute physics.
 * All numbers come from the physics module.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  PRODUCT_NAME,
  THETA_MAX_RAD,
  ANIMATION_CYCLE_DURATION_S,
  type CamProfile,
  PHI_MAX_RAD,
  PHI_MAX_DEG,
} from "./config";

import { buildModelCurves, computeLiveSnapshot, checkEnergyAccounting, buildTables } from "./physics/model";
import { runValidation } from "./physics/validation";

import { buildHand } from "./scene/hand";
import { buildCamMesh } from "./scene/camMesh";
import { buildMechanism } from "./scene/mechanism";

import { buildGraph } from "./ui/graph";
import { buildControls, type ControlState } from "./ui/controls";
import {
  renderValidationPanel,
  renderEnergyBadge,
  renderLiveReadouts,
  buildAssumptionsDrawer,
  buildSafetyPanel,
} from "./ui/panels";
import { JudgeDemo } from "./ui/judgeDemo";

// ─── State ────────────────────────────────────────────────────────────────────

let currentProfile: CamProfile = "balanced";
let currentTau0 = 0.04;
let currentResistScale = 1.0;
let showReleva = true;
let showMechanism = false;
let animating = true;
let showAllCurves = true;
let highlightReff = false;
let highlightForce = false;
let animTime = 0;
let lastFrameTime = 0;

// Pre-built kinematic tables (rebuilt when profile changes)
let tables = buildTables(currentProfile);

// ─── DOM Setup ────────────────────────────────────────────────────────────────

function setupDOM() {
  document.title = `${PRODUCT_NAME} — Engineering Feasibility Simulation`;

  document.body.innerHTML = `
    <div id="app">

      <!-- ── Header ── -->
      <header class="app-header">
        <div class="header-left">
          <div class="product-name">${PRODUCT_NAME}</div>
          <div class="product-subtitle">Variable-Assistance Hand Orthosis</div>
          <div class="sim-tag">Physics-Based Mechanical Feasibility Simulation</div>
        </div>
        <div class="header-right">
          <button id="judge-demo-btn" class="btn btn--primary">▶ JUDGE DEMO</button>
        </div>
      </header>

      <!-- ── Judge Demo Overlay (Top-Center Floating Banner) ── -->
      <div id="judge-overlay" class="judge-overlay hidden">
        <div class="judge-overlay-header">
          <div class="judge-step-num" id="judge-step-num">Step 1 / 9</div>
          <div class="judge-focal-badge" id="judge-focal-badge">BASELINE DEFICIT</div>
        </div>
        <div class="judge-step-title" id="judge-step-title"></div>
        <div class="judge-step-desc" id="judge-step-desc"></div>
        <div class="judge-overlay-footer">
          <button id="judge-stop-btn" class="btn btn--ghost btn--sm">✕ Exit Demo</button>
        </div>
      </div>

      <!-- ── Hero: Two Hand Views ── -->
      <section class="hero-section">
        <div class="hand-panel" id="panel-unassisted">
          <div class="hand-panel-label">
            UNASSISTED
            <span class="baseline-tag">WITHOUT MECHANICAL ASSISTANCE</span>
          </div>
          <canvas id="canvas-unassisted" class="hand-canvas"></canvas>
          <div class="hand-readouts" id="readouts-unassisted"></div>
        </div>

        <div class="hand-panel hand-panel--releva" id="panel-releva">
          <div class="hand-panel-label hand-panel-label--releva">
            ${PRODUCT_NAME}
            <span class="cnc-tag">CRITICAL CNC COMPONENT: Variable-radius cam</span>
          </div>
          <canvas id="canvas-releva" class="hand-canvas"></canvas>
          <div class="hand-readouts" id="readouts-releva"></div>
          <button id="view-mechanism-btn" class="btn btn--secondary">
            ⚙ VIEW MECHANISM
          </button>
        </div>
      </section>

      <!-- ── Mechanism Reveal ── -->
      <div id="mechanism-section" class="mechanism-section hidden">
        <div class="mechanism-label">
          SPRING → CAM → TENDON → FINGER LINK → HAND OPENING
        </div>
        <canvas id="canvas-mechanism" class="mechanism-canvas"></canvas>
        <div class="mechanism-readouts" id="mechanism-readouts">
          <div class="mech-row">
            <span class="mech-title">Effective Arm (r<sub>eff</sub>)</span>
            <span id="mech-reff" class="mech-val">— mm</span>
          </div>
          <div class="mech-row">
            <span class="mech-title">Tendon Force (F<sub>tendon</sub>)</span>
            <span id="mech-force" class="mech-val">— N</span>
          </div>
          <div class="mech-row">
            <span class="mech-title">Assistance Torque (τ<sub>assist</sub>)</span>
            <span id="mech-torque" class="mech-val">— N·m</span>
          </div>
        </div>
      </div>

      <!-- ── Graph Section ── -->
      <section class="graph-section">
        <div class="graph-disclaimer">
          SYNTHETIC RESISTANCE PROFILE — ILLUSTRATIVE, NOT PATIENT-DERIVED
        </div>
        <div class="graph-container">
          <canvas id="graph-canvas"></canvas>
        </div>
        <div class="graph-live-row">
          <span class="live-item">Opening Angle (θ): <strong id="live-theta">0.0°</strong></span>
          <span class="live-item">Effective Arm (r<sub>eff</sub>): <strong id="live-reff">— mm</strong></span>
          <span class="live-item">Tendon Force (F<sub>t</sub>): <strong id="live-ft">— N</strong></span>
          <span class="live-item">User Effort (RELEVA): <strong id="live-tau">— N·m</strong></span>
          <span class="live-item">Peak User Effort: <strong id="peak-tau">— N·m</strong></span>
        </div>
      </section>

      <!-- ── Bottom Row ── -->
      <div class="bottom-row">

        <!-- Controls -->
        <div class="bottom-card" id="controls-container"></div>

        <!-- Validation -->
        <div class="bottom-card" id="validation-container"></div>

        <!-- Energy + Assumptions -->
        <div class="bottom-card">
          <div id="energy-container"></div>
          <div id="assumptions-container"></div>
          <div id="safety-container"></div>
        </div>

      </div>

      <!-- ── Footer ── -->
      <footer class="app-footer">
        ENGINEERING SIMULATION · Illustrative parameters · Not clinical measurements ·
        SIH2026 Hardware PS SIH26113 · Physical prototype validation required
      </footer>

    </div>
  `;
}

// ─── Three.js Scene Setup ─────────────────────────────────────────────────────

function setupScene(canvas: HTMLCanvasElement, cameraZ = 0.22): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
} {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0xf8f9fa, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf8f9fa);

  // Lighting — clean diffuse, no drama
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(0.5, 1, 1);
  scene.add(dirLight);
  const fillLight = new THREE.DirectionalLight(0xdde8f0, 0.4);
  fillLight.position.set(-1, 0, 0.5);
  scene.add(fillLight);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.001, 10);
  camera.position.set(0, 0.02, cameraZ);
  camera.lookAt(0, 0.02, 0);

  return { renderer, scene, camera };
}

function resizeRenderer(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  canvas: HTMLCanvasElement
) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (renderer.domElement.width !== w || renderer.domElement.height !== h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

// ─── Main Entry ───────────────────────────────────────────────────────────────

function main() {
  setupDOM();

  // ── Three.js scenes ───────────────────────────────────────────────────────
  const canvasU = document.getElementById("canvas-unassisted") as HTMLCanvasElement;
  const canvasR = document.getElementById("canvas-releva") as HTMLCanvasElement;
  const canvasM = document.getElementById("canvas-mechanism") as HTMLCanvasElement;

  const sceneU = setupScene(canvasU);
  const sceneR = setupScene(canvasR);
  const sceneM = setupScene(canvasM, 0.30);

  // ── Procedural hands ──────────────────────────────────────────────────────
  const handUnassisted = buildHand("left", false);
  sceneU.scene.add(handUnassisted.group);

  const handReleva = buildHand("right", true);
  sceneR.scene.add(handReleva.group);

  // ── Mechanism ─────────────────────────────────────────────────────────────
  const mechanism = buildMechanism(currentProfile);
  sceneM.scene.add(mechanism.group);

  // ── Graph ─────────────────────────────────────────────────────────────────
  const graphCanvas = document.getElementById("graph-canvas") as HTMLCanvasElement;
  const graphCtrl = buildGraph(graphCanvas);

  // ── Controls ──────────────────────────────────────────────────────────────
  const controlsContainer = document.getElementById("controls-container")!;
  const controls = buildControls(controlsContainer, {
    onChange(state: ControlState) {
      currentProfile = state.camProfile;
      currentTau0 = state.tau0;
      currentResistScale = state.resistanceScale;
      tables = buildTables(currentProfile);
      refreshStaticOutputs();
    },
  });

  // ── Static panels ─────────────────────────────────────────────────────────
  buildAssumptionsDrawer(document.getElementById("assumptions-container")!);
  buildSafetyPanel(document.getElementById("safety-container")!);

  // Cache curves — only rebuild when parameters change, not every frame
  let cachedCurves = buildModelCurves(currentProfile, currentTau0, currentResistScale);

  function refreshStaticOutputs() {
    cachedCurves = buildModelCurves(currentProfile, currentTau0, currentResistScale);
    graphCtrl.update(cachedCurves, undefined, showAllCurves);

    const validation = runValidation(currentProfile, currentTau0, currentResistScale);
    renderValidationPanel(document.getElementById("validation-container")!, validation);

    const energy = checkEnergyAccounting(currentProfile, currentTau0, currentResistScale);
    renderEnergyBadge(document.getElementById("energy-container")!, energy);

    // Peak torque
    const peakReleva = Math.max(...cachedCurves.releva.map((s) => s.tau_user));
    const peakEl = document.getElementById("peak-tau");
    if (peakEl) peakEl.textContent = `${peakReleva.toFixed(3)} N·m`;
  }

  refreshStaticOutputs();

  // ── View Mechanism toggle ─────────────────────────────────────────────────
  const viewMechBtn = document.getElementById("view-mechanism-btn")!;
  const mechSection = document.getElementById("mechanism-section")!;
  viewMechBtn.addEventListener("click", () => {
    showMechanism = !showMechanism;
    mechSection.classList.toggle("hidden", !showMechanism);
    viewMechBtn.textContent = showMechanism ? "✕ HIDE MECHANISM" : "⚙ VIEW MECHANISM";
  });

  // ── Judge Demo ────────────────────────────────────────────────────────────
  const judgeDemoBtn = document.getElementById("judge-demo-btn") as HTMLButtonElement;
  const judgeOverlay = document.getElementById("judge-overlay")!;
  const judgeStepNum = document.getElementById("judge-step-num")!;
  const judgeStepTitle = document.getElementById("judge-step-title")!;
  const judgeStepDesc = document.getElementById("judge-step-desc")!;
  const judgeFocalBadge = document.getElementById("judge-focal-badge");
  const judgeStopBtn = document.getElementById("judge-stop-btn")!;

  const demo = new JudgeDemo({
    setAnimating(running) { animating = running; },
    setShowReleva(show) {
      showReleva = show;
      document.getElementById("panel-releva")!.style.opacity = show ? "1" : "0.25";
    },
    setShowMechanism(show) {
      showMechanism = show;
      mechSection.classList.toggle("hidden", !show);
      viewMechBtn.textContent = show ? "✕ HIDE MECHANISM" : "⚙ VIEW MECHANISM";
    },
    setHighlightReff(highlight) { highlightReff = highlight; },
    setHighlightForce(highlight) { highlightForce = highlight; },
    setShowAllCurves(show) {
      showAllCurves = show;
      graphCtrl.update(cachedCurves, undefined, showAllCurves);
    },
    setPresentationFocus(focus) {
      document.body.className = focus === "all" ? "" : `demo-focus--${focus}`;
    },
    setCamProfile(profile) {
      currentProfile = profile;
      controls.setProfile(profile);
      tables = buildTables(currentProfile);
      refreshStaticOutputs();
    },
    showStep(stepNum, title, description, focalBadge) {
      judgeOverlay.classList.remove("hidden");
      judgeStepNum.textContent = `Step ${stepNum} / 9`;
      judgeStepTitle.textContent = title;
      judgeStepDesc.textContent = description;
      if (judgeFocalBadge) {
        if (focalBadge) {
          judgeFocalBadge.textContent = focalBadge;
          judgeFocalBadge.style.display = "inline-block";
        } else {
          judgeFocalBadge.style.display = "none";
        }
      }
    },
    hideStep() {
      judgeOverlay.classList.add("hidden");
    },
    onComplete() {
      judgeDemoBtn.textContent = "▶ JUDGE DEMO";
      judgeDemoBtn.disabled = false;
      document.body.className = "";
      document.getElementById("panel-releva")!.style.opacity = "1";
      showReleva = true;
      showAllCurves = true;
      graphCtrl.update(cachedCurves, undefined, true);
    },
  });

  judgeDemoBtn.addEventListener("click", () => {
    animTime = 0;
    demo.start();
    judgeDemoBtn.textContent = "⏹ Running...";
    judgeDemoBtn.disabled = true;
  });

  judgeStopBtn.addEventListener("click", () => {
    demo.stop();
    judgeDemoBtn.textContent = "▶ JUDGE DEMO";
    judgeDemoBtn.disabled = false;
    document.body.className = "";
    document.getElementById("panel-releva")!.style.opacity = "1";
    showReleva = true;
    showAllCurves = true;
    graphCtrl.update(cachedCurves, undefined, true);
  });

  // ── Animation Loop ────────────────────────────────────────────────────────
  function animate(timestamp: number) {
    requestAnimationFrame(animate);

    const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
    lastFrameTime = timestamp;

    if (animating) {
      animTime += dt;
    }

    // Generalized finger angle: oscillates open and closed
    // 0 = fully closed, THETA_MAX_RAD = fully open
    const t = (animTime % ANIMATION_CYCLE_DURATION_S) / ANIMATION_CYCLE_DURATION_S;
    // Smooth sinusoidal — spend more time at ends (hold at open/closed)
    const rawAngle = 0.5 * (1 - Math.cos(t * 2 * Math.PI));
    const theta = rawAngle * THETA_MAX_RAD;

    // ── Physics snapshot ───────────────────────────────────────────────────
    const snaps = computeLiveSnapshot(
      theta,
      currentProfile,
      currentTau0,
      currentResistScale,
      tables.relevTable,
      tables.fixedTable
    );

    // ── Update hands ───────────────────────────────────────────────────────
    handUnassisted.setAngle(theta, 0);
    handReleva.setAngle(theta, snaps.releva.F_tendon);
    handReleva.setAssistanceVisible(showReleva);

    // ── Update mechanism scene ─────────────────────────────────────────────
    if (showMechanism) {
      mechanism.update(snaps.releva.phi_rad, snaps.releva.reff_m, snaps.releva.F_tendon, currentProfile);
      const mechReff = document.getElementById("mech-reff");
      const mechForce = document.getElementById("mech-force");
      const mechTorque = document.getElementById("mech-torque");
      if (mechReff) mechReff.textContent = `${snaps.releva.reff_mm.toFixed(1)} mm`;
      if (mechForce) mechForce.textContent = `${snaps.releva.F_tendon.toFixed(2)} N`;
      if (mechTorque) mechTorque.textContent = `${snaps.releva.tau_assist.toFixed(3)} N·m`;
    }

    // ── Update live readouts ───────────────────────────────────────────────
    renderLiveReadouts(
      document.getElementById("readouts-unassisted")!,
      snaps.unassisted,
      "UNASSISTED",
      false
    );
    renderLiveReadouts(
      document.getElementById("readouts-releva")!,
      snaps.releva,
      PRODUCT_NAME,
      true
    );

    // ── Update graph live marker (uses cached curves — only rebuilt on param change) ──
    graphCtrl.update(cachedCurves, theta * 180 / Math.PI, showAllCurves);

    // ── Live readout labels ────────────────────────────────────────────────
    const liveTheta = document.getElementById("live-theta");
    const liveReff = document.getElementById("live-reff");
    const liveFt = document.getElementById("live-ft");
    const liveTau = document.getElementById("live-tau");
    if (liveTheta) liveTheta.textContent = `${snaps.releva.theta_deg.toFixed(1)}°`;
    if (liveReff) liveReff.textContent = `${snaps.releva.reff_mm.toFixed(1)} mm`;
    if (liveFt) liveFt.textContent = `${snaps.releva.F_tendon.toFixed(2)} N`;
    if (liveTau) liveTau.textContent = `${snaps.releva.tau_user.toFixed(3)} N·m`;

    // ── Render scenes ──────────────────────────────────────────────────────
    resizeRenderer(sceneU.renderer, sceneU.camera, canvasU);
    resizeRenderer(sceneR.renderer, sceneR.camera, canvasR);
    sceneU.renderer.render(sceneU.scene, sceneU.camera);
    sceneR.renderer.render(sceneR.scene, sceneR.camera);

    if (showMechanism) {
      resizeRenderer(sceneM.renderer, sceneM.camera, canvasM);
      sceneM.renderer.render(sceneM.scene, sceneM.camera);
    }
  }

  lastFrameTime = performance.now();
  requestAnimationFrame(animate);
}

main();
