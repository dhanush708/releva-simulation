/**
 * controls.ts — User Control Panel
 *
 * Only 3 major controls exposed:
 *   1. Resistance (synthetic resistance scale)
 *   2. Spring Preload (τ₀)
 *   3. Cam Profile (Aggressive Early / Balanced / Gentle)
 *
 * Changing any control immediately triggers recalculation.
 */

import {
  RESISTANCE_SCALE_MIN,
  RESISTANCE_SCALE_MAX,
  RESISTANCE_SCALE_DEFAULT,
  PRELOAD_MIN,
  PRELOAD_MAX,
  SPRING_PRELOAD_TAU0,
  CAM_PROFILE_LABELS,
  type CamProfile,
} from "../config";

export interface ControlState {
  resistanceScale: number;
  tau0: number;
  camProfile: CamProfile;
}

export interface ControlCallbacks {
  onChange(state: ControlState): void;
}

export interface ControlController {
  getState(): ControlState;
  setProfile(profile: CamProfile): void;
}

export function buildControls(
  container: HTMLElement,
  callbacks: ControlCallbacks
): ControlController {
  const state: ControlState = {
    resistanceScale: RESISTANCE_SCALE_DEFAULT,
    tau0: SPRING_PRELOAD_TAU0,
    camProfile: "balanced",
  };

  container.innerHTML = `
    <div class="controls-panel">
      <h3 class="controls-title">Simulation Controls</h3>
      <p class="controls-note">ILLUSTRATIVE PARAMETERS — NOT CLINICAL MEASUREMENTS</p>

      <div class="control-group">
        <label class="control-label">
          Opening Resistance
          <span class="control-value" id="resist-val">${state.resistanceScale.toFixed(1)}×</span>
        </label>
        <input type="range" id="resist-slider"
          min="${RESISTANCE_SCALE_MIN}" max="${RESISTANCE_SCALE_MAX}"
          step="0.05" value="${state.resistanceScale}"
          class="control-slider" />
        <div class="control-hint">Scales the synthetic resistance profile</div>
      </div>

      <div class="control-group">
        <label class="control-label">
          Spring Preload τ₀
          <span class="control-value" id="preload-val">${(state.tau0 * 1000).toFixed(0)} mN·m</span>
        </label>
        <input type="range" id="preload-slider"
          min="${PRELOAD_MIN}" max="${PRELOAD_MAX}"
          step="0.005" value="${state.tau0}"
          class="control-slider" />
        <div class="control-hint">Stored energy at start of release</div>
      </div>

      <div class="control-group">
        <label class="control-label">Cam Profile</label>
        <div class="cam-profile-buttons" id="cam-profile-buttons">
          ${(["aggressive", "balanced", "gentle"] as CamProfile[]).map((p) => `
            <button
              class="cam-btn ${p === state.camProfile ? "cam-btn--active" : ""}"
              data-profile="${p}"
            >${CAM_PROFILE_LABELS[p]}</button>
          `).join("")}
        </div>
        <div class="control-hint">Same avg. radius — only distribution changes</div>
      </div>
    </div>
  `;

  // ── Resistance slider ──────────────────────────────────────────────────────
  const resistSlider = container.querySelector<HTMLInputElement>("#resist-slider")!;
  const resistVal = container.querySelector<HTMLElement>("#resist-val")!;
  resistSlider.addEventListener("input", () => {
    state.resistanceScale = parseFloat(resistSlider.value);
    resistVal.textContent = `${state.resistanceScale.toFixed(1)}×`;
    callbacks.onChange({ ...state });
  });

  // ── Preload slider ────────────────────────────────────────────────────────
  const preloadSlider = container.querySelector<HTMLInputElement>("#preload-slider")!;
  const preloadVal = container.querySelector<HTMLElement>("#preload-val")!;
  preloadSlider.addEventListener("input", () => {
    state.tau0 = parseFloat(preloadSlider.value);
    preloadVal.textContent = `${(state.tau0 * 1000).toFixed(0)} mN·m`;
    callbacks.onChange({ ...state });
  });

  // ── Cam profile buttons ───────────────────────────────────────────────────
  const profileBtns = container.querySelectorAll<HTMLButtonElement>(".cam-btn");
  profileBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      profileBtns.forEach((b) => b.classList.remove("cam-btn--active"));
      btn.classList.add("cam-btn--active");
      state.camProfile = btn.dataset.profile as CamProfile;
      callbacks.onChange({ ...state });
    });
  });

  function setProfile(newProfile: CamProfile) {
    state.camProfile = newProfile;
    profileBtns.forEach((b) => {
      b.classList.toggle("cam-btn--active", b.dataset.profile === newProfile);
    });
  }

  return {
    getState: () => ({ ...state }),
    setProfile,
  };
}
