/**
 * validation.ts — Model Validation Checks
 *
 * Automatically run at startup and when parameters change.
 * All 7 checks are performed and results displayed in the UI.
 *
 * If any check fails, a clear warning is shown — problems are never hidden.
 */

import {
  R_EFF_MIN_M,
  R_EFF_MAX_M,
  THETA_MAX_RAD,
  N_INTEGRATION_STEPS,
  type CamProfile,
} from "../config";
import { buildModelCurves, checkEnergyAccounting } from "./model";
import { computeReff } from "./cam";
import { PHI_MAX_RAD } from "../config";

export interface ValidationResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ValidationReport {
  results: ValidationResult[];
  allPassed: boolean;
}

/**
 * Run all validation checks for the current parameter set.
 *
 * Checks:
 * 1. r_eff > 0 everywhere
 * 2. r_eff ∈ [r_min, r_max]
 * 3. No NaN / Infinity in curves
 * 4. Force continuity (|ΔF_t / Δθ| below threshold)
 * 5. τ_user ≥ 0 everywhere
 * 6. W_tendon ≤ E_stored (release phase)
 * 7. θ ∈ [0, θ_max]
 */
export function runValidation(
  profile: CamProfile,
  tau0: number,
  resistScale: number
): ValidationReport {
  const results: ValidationResult[] = [];
  const curves = buildModelCurves(profile, tau0, resistScale, 200);
  const energyCheck = checkEnergyAccounting(profile, tau0, resistScale);

  // ── Check 1: r_eff > 0 everywhere ─────────────────────────────────────────
  {
    let minReff = Infinity;
    for (let i = 0; i <= N_INTEGRATION_STEPS; i++) {
      const phi = (i / N_INTEGRATION_STEPS) * PHI_MAX_RAD;
      const r = computeReff(phi, profile);
      if (r < minReff) minReff = r;
    }
    const passed = minReff > 0;
    results.push({
      id: "reff_positive",
      label: "Radius > 0",
      passed,
      detail: passed
        ? `Min r_eff = ${(minReff * 1000).toFixed(1)} mm`
        : `r_eff reached ${(minReff * 1000).toFixed(2)} mm — must be > 0`,
    });
  }

  // ── Check 2: r_eff within bounds ──────────────────────────────────────────
  {
    let maxReff = -Infinity;
    let minReff = Infinity;
    for (let i = 0; i <= N_INTEGRATION_STEPS; i++) {
      const phi = (i / N_INTEGRATION_STEPS) * PHI_MAX_RAD;
      const r = computeReff(phi, profile);
      if (r > maxReff) maxReff = r;
      if (r < minReff) minReff = r;
    }
    const passed =
      minReff >= R_EFF_MIN_M - 1e-9 && maxReff <= R_EFF_MAX_M + 1e-9;
    results.push({
      id: "reff_bounds",
      label: "Radius bounds",
      passed,
      detail: passed
        ? `r_eff ∈ [${(minReff * 1000).toFixed(1)}, ${(maxReff * 1000).toFixed(1)}] mm`
        : `r_eff out of [${R_EFF_MIN_M * 1000}, ${R_EFF_MAX_M * 1000}] mm bounds`,
    });
  }

  // ── Check 3: No NaN / Infinity ────────────────────────────────────────────
  {
    const allValues = [
      ...curves.releva.map((s) => s.F_tendon),
      ...curves.releva.map((s) => s.tau_assist),
      ...curves.releva.map((s) => s.tau_user),
      ...curves.fixedRadius.map((s) => s.F_tendon),
    ];
    const hasNaN = allValues.some((v) => !isFinite(v) || isNaN(v));
    results.push({
      id: "no_nan",
      label: "No undefined values",
      passed: !hasNaN,
      detail: hasNaN ? "NaN or Infinity detected in physics output" : "All values finite",
    });
  }

  // ── Check 4: Force continuity ─────────────────────────────────────────────
  // We check for DISCONTINUITIES (sudden jumps), NOT for steep gradients.
  // F_t intentionally spans ~10 N → ~1.7 N across 70° — average gradient
  // is ~7 N/rad, which is physically correct behaviour, not an error.
  // A genuine discontinuity = |ΔF_t| in a single step disproportionate
  // to its neighbours. Threshold: 0.5 N per step (smooth curves produce
  // ~0.09 N per step — well within this limit).
  {
    const ABS_THRESHOLD = 0.5; // N — genuine discontinuity in one ~0.35° step
    let maxAbsDelta = 0;
    let smoothnessViolation = false;
    const forces = curves.releva.map((s) => s.F_tendon);

    for (let i = 1; i < forces.length; i++) {
      const dF = Math.abs(forces[i] - forces[i - 1]);
      if (dF > maxAbsDelta) maxAbsDelta = dF;
    }

    // Local ratio check: flag if any single step is 5× its neighbours (kink)
    for (let i = 2; i < forces.length - 1; i++) {
      const prev = Math.abs(forces[i] - forces[i - 1]);
      const next = Math.abs(forces[i + 1] - forces[i]);
      const localAvg = (prev + next) / 2;
      if (localAvg > 0.001 && prev > 5 * localAvg) {
        smoothnessViolation = true;
        break;
      }
    }

    const passed = maxAbsDelta < ABS_THRESHOLD && !smoothnessViolation;
    results.push({
      id: "force_continuity",
      label: "Force continuity",
      passed,
      detail: passed
        ? `Smooth: max |ΔF_t| per step = ${(maxAbsDelta * 1000).toFixed(1)} mN`
        : `Discontinuity: max |ΔF_t| per step = ${maxAbsDelta.toFixed(3)} N (threshold ${ABS_THRESHOLD} N)`,
    });
  }

  // ── Check 5: τ_user ≥ 0 everywhere ───────────────────────────────────────
  {
    const minUser = Math.min(
      ...curves.releva.map((s) => s.tau_user),
      ...curves.fixedRadius.map((s) => s.tau_user),
      ...curves.unassisted.map((s) => s.tau_user)
    );
    const passed = minUser >= -1e-9;
    results.push({
      id: "tau_user_nonneg",
      label: "Torque ≥ 0",
      passed,
      detail: passed
        ? `Min τ_user = ${(minUser * 1000).toFixed(1)} mN·m`
        : `τ_user went negative: ${(minUser * 1000).toFixed(1)} mN·m`,
    });
  }

  // ── Check 6: Energy accounting ────────────────────────────────────────────
  results.push({
    id: "energy_accounting",
    label: "Energy accounting",
    passed: energyCheck.isValid,
    detail: energyCheck.isValid
      ? `W_tendon (${(energyCheck.W_tendon_J * 1000).toFixed(1)} mJ) ≤ E_stored (${(energyCheck.E_stored_J * 1000).toFixed(1)} mJ)`
      : `VIOLATION: W_tendon (${(energyCheck.W_tendon_J * 1000).toFixed(1)} mJ) > E_stored (${(energyCheck.E_stored_J * 1000).toFixed(1)} mJ)`,
  });

  // ── Check 7: θ within range ───────────────────────────────────────────────
  {
    const maxTheta = Math.max(...curves.releva.map((s) => s.theta_rad));
    const passed = maxTheta <= THETA_MAX_RAD + 1e-6;
    results.push({
      id: "theta_bounds",
      label: "Angle bounds",
      passed,
      detail: passed
        ? `θ_max = ${(maxTheta * 180 / Math.PI).toFixed(1)}°`
        : `θ exceeded limit: ${(maxTheta * 180 / Math.PI).toFixed(1)}° > ${(THETA_MAX_RAD * 180 / Math.PI).toFixed(1)}°`,
    });
  }

  return {
    results,
    allPassed: results.every((r) => r.passed),
  };
}
