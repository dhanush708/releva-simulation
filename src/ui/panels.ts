/**
 * panels.ts — Info Panels: Validation, Energy, Live Readouts, Assumptions Drawer
 */

import type { ValidationReport } from "../physics/validation";
import type { EnergyCheck } from "../physics/model";
import type { ModelSnapshot } from "../physics/model";
import {
  DISPLAY_DECIMALS_TORQUE,
  DISPLAY_DECIMALS_FORCE,
  DISPLAY_DECIMALS_RADIUS_MM,
  DISPLAY_DECIMALS_ANGLE_DEG,
  PHI_MAX_DEG,
  PRODUCT_NAME,
} from "../config";

// ─── Validation Panel ─────────────────────────────────────────────────────────

export function renderValidationPanel(
  container: HTMLElement,
  report: ValidationReport
): void {
  const rows = report.results
    .map(
      (r) => `
      <div class="val-row ${r.passed ? "val-row--pass" : "val-row--fail"}">
        <span class="val-icon">${r.passed ? "✓" : "✗"}</span>
        <span class="val-label">${r.label}</span>
        <span class="val-detail">${r.detail}</span>
      </div>
    `
    )
    .join("");

  const overallClass = report.allPassed ? "val-badge--ok" : "val-badge--warn";
  const overallText = report.allPassed
    ? "MODEL VALIDATION ✓"
    : "⚠ VALIDATION ISSUES";

  container.innerHTML = `
    <div class="validation-panel">
      <div class="val-badge ${overallClass}">${overallText}</div>
      <div class="val-rows">${rows}</div>
    </div>
  `;
}

// ─── Energy Accounting Badge ──────────────────────────────────────────────────

export function renderEnergyBadge(
  container: HTMLElement,
  check: EnergyCheck
): void {
  if (check.isValid) {
    container.innerHTML = `
      <div class="energy-badge energy-badge--ok">
        ENERGY ACCOUNTED FOR ✓
        <span class="energy-detail">
          W<sub>tendon</sub> = ${(check.W_tendon_J * 1000).toFixed(2)} mJ ≤
          E<sub>stored</sub> = ${(check.E_stored_J * 1000).toFixed(2)} mJ
        </span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="energy-badge energy-badge--fail">
        ⚠ ENERGY VIOLATION
        <span class="energy-detail">
          W<sub>tendon</sub> = ${(check.W_tendon_J * 1000).toFixed(2)} mJ >
          E<sub>stored</sub> = ${(check.E_stored_J * 1000).toFixed(2)} mJ
          — check model parameters
        </span>
      </div>
    `;
  }
}

// ─── Live Readouts ────────────────────────────────────────────────────────────

export function renderLiveReadouts(
  container: HTMLElement,
  snap: ModelSnapshot,
  label: string,
  isAssisted: boolean
): void {
  const reffStr = isAssisted
    ? `<div class="readout-row">
        <span class="readout-key">
          <span class="readout-title">Effective Moment Arm</span>
          <span class="readout-sub">r<sub>eff</sub></span>
        </span>
        <span class="readout-val">${snap.reff_mm.toFixed(DISPLAY_DECIMALS_RADIUS_MM)} mm</span>
       </div>
       <div class="readout-row">
        <span class="readout-key">
          <span class="readout-title">Tendon Force</span>
          <span class="readout-sub">F<sub>tendon</sub></span>
        </span>
        <span class="readout-val">${snap.F_tendon.toFixed(DISPLAY_DECIMALS_FORCE)} N</span>
       </div>
       <div class="readout-row">
        <span class="readout-key">
          <span class="readout-title">Assistance Torque</span>
          <span class="readout-sub">τ<sub>assist</sub></span>
        </span>
        <span class="readout-val">${snap.tau_assist.toFixed(DISPLAY_DECIMALS_TORQUE)} N·m</span>
       </div>`
    : "";

  const userTorqueClass = snap.tau_user > 0.08 ? "readout-val--high" : "readout-val--normal";

  container.innerHTML = `
    <div class="readout-panel">
      <div class="readout-header">${label}</div>
      <div class="readout-row">
        <span class="readout-key">
          <span class="readout-title">Opening Angle</span>
          <span class="readout-sub">θ</span>
        </span>
        <span class="readout-val">${snap.theta_deg.toFixed(DISPLAY_DECIMALS_ANGLE_DEG)}°</span>
      </div>
      <div class="readout-row">
        <span class="readout-key">
          <span class="readout-title">Opening Resistance</span>
          <span class="readout-sub">τ<sub>resistance</sub> (synthetic)</span>
        </span>
        <span class="readout-val">${snap.tau_resistance.toFixed(DISPLAY_DECIMALS_TORQUE)} N·m</span>
      </div>
      ${reffStr}
      <div class="readout-row readout-row--user">
        <span class="readout-key">
          <span class="readout-title">User Effort Required</span>
          <span class="readout-sub">τ<sub>user</sub></span>
        </span>
        <span class="readout-val ${userTorqueClass}">${snap.tau_user.toFixed(DISPLAY_DECIMALS_TORQUE)} N·m</span>
      </div>
    </div>
  `;
}

// ─── Model Assumptions Drawer ─────────────────────────────────────────────────

export function buildAssumptionsDrawer(container: HTMLElement): void {
  container.innerHTML = `
    <details class="assumptions-drawer">
      <summary class="assumptions-summary">MODEL ASSUMPTIONS ▾</summary>
      <div class="assumptions-body">
        <ul>
          <li>Quasi-static model (inertia neglected)</li>
          <li>Single generalized finger-opening joint</li>
          <li>Tendon assumed taut throughout motion</li>
          <li>Simplified transmission losses (scalar η = 0.85)</li>
          <li>Synthetic resistance profile — not patient-derived</li>
          <li>Friction, slack, multi-finger biomechanics simplified for feasibility</li>
          <li>φ<sub>max</sub> = ${PHI_MAX_DEG.toFixed(1)}° — derived from kinematic constraint</li>
          <li>Physical prototype validation required before any clinical use</li>
        </ul>
        <div class="assumptions-note">
          ENGINEERING SIMULATION · Illustrative parameters · Not clinical measurements
        </div>
      </div>
    </details>
  `;
}

// ─── Safety Notice ────────────────────────────────────────────────────────────

export function buildSafetyPanel(container: HTMLElement): void {
  container.innerHTML = `
    <div class="safety-panel">
      <div class="safety-title">Design Safety Concepts</div>
      <div class="safety-row">
        <span class="safety-tag">MAX ASSISTANCE LIMIT</span>
        <span class="safety-desc">Mechanical stop on cam rotation</span>
      </div>
      <div class="safety-row">
        <span class="safety-tag">OPENING STOP</span>
        <span class="safety-desc">Hard limit at θ<sub>max</sub></span>
      </div>
      <div class="safety-note">
        Prototype safety features to be physically validated.
        Not clinically validated limits.
      </div>
    </div>
  `;
}
