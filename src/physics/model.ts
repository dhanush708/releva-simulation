/**
 * model.ts — Core Quasi-Static Mechanical Model
 *
 * This is the SINGLE SOURCE OF TRUTH for all numerical values in the app.
 * The 3D scene and graph both read from SimulationState — neither computes
 * its own physics.
 *
 * MODEL ASSUMPTIONS (shown in UI):
 * - Quasi-static (inertia neglected)
 * - Single generalized finger-opening joint
 * - Tendon assumed taut throughout motion
 * - Simplified transmission losses (scalar η)
 * - Synthetic resistance profile (not patient-derived)
 * - Physical prototype validation required before clinical use
 *
 * THREE-MODEL COMPARISON (fair):
 * All three share:  same θ trajectory, same τ_resistance, same spring params, same L_t
 * Only r_eff(φ) differs.
 */

import {
  R_EFF_MIN_M,
  R_EFF_MAX_M,
  R_EFF_AVG_M,
  L_T_M,
  THETA_MAX_RAD,
  PHI_MAX_RAD,
  EFFICIENCY_ETA,
  N_INTEGRATION_STEPS,
  RESISTANCE_A,
  RESISTANCE_B,
  RESISTANCE_C,
  type CamProfile,
} from "../config";
import { buildReffTable } from "./cam";
import { springTorque, springEnergy } from "./spring";

// ─── Lookup Tables ────────────────────────────────────────────────────────────

interface KinematicTable {
  phi: number[];         // cam angle (rad)
  reff: number[];        // effective moment arm (m)
  s: number[];           // tendon displacement (m)
  theta: number[];       // finger opening angle (rad)
}

/**
 * Build the kinematic lookup table for a given cam profile via numerical integration.
 *
 * s(φ) = ∫₀^φ r_eff(φ') dφ'   (trapezoidal rule)
 * θ(φ) = s(φ) / L_t
 *
 * Then build inverse table: θ → φ  (for looking up φ given θ during simulation)
 */
function buildKinematicTable(profile: CamProfile): KinematicTable {
  const { phi, reff } = buildReffTable(profile, N_INTEGRATION_STEPS);
  const s: number[] = new Array(phi.length).fill(0);
  const theta: number[] = new Array(phi.length).fill(0);

  // Trapezoidal numerical integration
  for (let i = 1; i < phi.length; i++) {
    const dphi = phi[i] - phi[i - 1];
    const r_avg = 0.5 * (reff[i] + reff[i - 1]);
    s[i] = s[i - 1] + r_avg * dphi;
    theta[i] = s[i] / L_T_M;
  }

  return { phi, reff, s, theta };
}

/** Fixed-radius kinematic table (r_eff = r̄ everywhere) */
function buildFixedRadiusTable(): KinematicTable {
  const phi: number[] = [];
  const reff: number[] = [];
  const s: number[] = [];
  const theta: number[] = [];
  const r_fixed = R_EFF_AVG_M; // same average as variable cam

  for (let i = 0; i <= N_INTEGRATION_STEPS; i++) {
    const p = (i / N_INTEGRATION_STEPS) * PHI_MAX_RAD;
    phi.push(p);
    reff.push(r_fixed);
    const si = r_fixed * p; // linear since r is constant
    s.push(si);
    theta.push(si / L_T_M);
  }
  return { phi, reff, s, theta };
}

/**
 * Inverse lookup: given θ, find φ by linear interpolation in the table.
 * Returns the wound cam angle (phi_max - result = unwound angle).
 */
function inverseLookup(table: KinematicTable, theta: number): number {
  const thetaArr = table.theta;
  const phiArr = table.phi;
  const thetaMax = thetaArr[thetaArr.length - 1];
  const t = Math.max(0, Math.min(thetaMax, theta));

  // Binary search
  let lo = 0;
  let hi = thetaArr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (thetaArr[mid] <= t) lo = mid;
    else hi = mid;
  }

  if (hi === lo) return phiArr[lo];
  const frac = (t - thetaArr[lo]) / (thetaArr[hi] - thetaArr[lo]);
  return phiArr[lo] + frac * (phiArr[hi] - phiArr[lo]);
}

/** Linear interpolation of r_eff given φ from a kinematic table */
function reffAtPhi(table: KinematicTable, phi: number): number {
  const phiArr = table.phi;
  const reffArr = table.reff;
  const p = Math.max(0, Math.min(PHI_MAX_RAD, phi));

  let lo = 0;
  let hi = phiArr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (phiArr[mid] <= p) lo = mid;
    else hi = mid;
  }
  if (hi === lo) return reffArr[lo];
  const frac = (p - phiArr[lo]) / (phiArr[hi] - phiArr[lo]);
  return reffArr[lo] + frac * (reffArr[hi] - reffArr[lo]); // Fixed: reffArr[hi]
}

// ─── Resistance Model ─────────────────────────────────────────────────────────

/**
 * Synthetic generalized finger-opening resistance torque.
 *
 * SYNTHETIC RESISTANCE PROFILE — ILLUSTRATIVE, NOT PATIENT-DERIVED.
 *
 * Shape: higher resistance early (stiff at start of opening), declining later.
 * τ_resistance(θ) = A·exp(-B·θ) + C
 *
 * @param theta_rad  Finger opening angle (rad)
 * @param scale      User-controlled scaling factor (0.5..2.0)
 */
export function computeResistance(theta_rad: number, scale: number): number {
  return scale * (RESISTANCE_A * Math.exp(-RESISTANCE_B * theta_rad) + RESISTANCE_C);
}

// ─── Per-Frame State ──────────────────────────────────────────────────────────

export interface ModelSnapshot {
  theta_rad: number;       // current finger opening angle
  theta_deg: number;
  phi_rad: number;         // current cam wound angle
  reff_m: number;          // effective tendon moment arm (m)
  reff_mm: number;         // same, in mm (for display)
  tau_spring: number;      // spring torque (N·m)
  F_tendon: number;        // tendon force (N)
  tau_assist: number;      // finger assistance torque (N·m)
  tau_resistance: number;  // synthetic resistance torque (N·m)
  tau_user: number;        // required user torque (N·m) — clamped ≥ 0
}

/**
 * Compute a model snapshot for a given opening angle θ.
 * Used for RELEVA and Fixed-Radius models.
 *
 * @param theta_rad  Finger opening angle (rad)
 * @param table      Kinematic lookup table for this model
 * @param tau0       Spring preload (N·m) — user-controlled
 * @param resistScale  Resistance scale — user-controlled
 */
function snapshotAssisted(
  theta_rad: number,
  table: KinematicTable,
  tau0: number,
  resistScale: number
): ModelSnapshot {
  // Look up cam angle from finger angle
  const phi = inverseLookup(table, theta_rad);
  // At start of release the cam is wound to phi_max.
  // As hand opens (theta increases), cam unwinds (phi_wound decreases).
  const phi_wound = Math.max(0, PHI_MAX_RAD - phi);
  const reff = reffAtPhi(table, phi);

  const tau_spring = springTorque(phi_wound, tau0);
  const F_tendon = reff > 1e-9 ? (EFFICIENCY_ETA * tau_spring) / reff : 0;
  const tau_assist = F_tendon * L_T_M;
  const tau_resistance = computeResistance(theta_rad, resistScale);
  const tau_user = Math.max(0, tau_resistance - tau_assist);

  return {
    theta_rad,
    theta_deg: theta_rad * 180 / Math.PI,
    phi_rad: phi,
    reff_m: reff,
    reff_mm: reff * 1000,
    tau_spring,
    F_tendon,
    tau_assist,
    tau_resistance,
    tau_user,
  };
}

/** Unassisted model snapshot — no spring, no cam, zero assistance */
function snapshotUnassisted(theta_rad: number, resistScale: number): ModelSnapshot {
  const tau_resistance = computeResistance(theta_rad, resistScale);
  return {
    theta_rad,
    theta_deg: theta_rad * 180 / Math.PI,
    phi_rad: 0,
    reff_m: 0,
    reff_mm: 0,
    tau_spring: 0,
    F_tendon: 0,
    tau_assist: 0,
    tau_resistance,
    tau_user: tau_resistance, // user must overcome all resistance
  };
}

// ─── Full Curve (for graph) ───────────────────────────────────────────────────

export interface ModelCurves {
  thetaDeg: number[];
  unassisted: ModelSnapshot[];
  fixedRadius: ModelSnapshot[];
  releva: ModelSnapshot[];
}

/**
 * Build complete curves for all three models across the full opening range.
 * Used to render the static graph.
 *
 * All three use the same θ array — fair comparison.
 */
export function buildModelCurves(
  profile: CamProfile,
  tau0: number,
  resistScale: number,
  nPoints = 200
): ModelCurves {
  const relevTable = buildKinematicTable(profile);
  const fixedTable = buildFixedRadiusTable();

  const thetaDeg: number[] = [];
  const unassisted: ModelSnapshot[] = [];
  const fixedRadius: ModelSnapshot[] = [];
  const releva: ModelSnapshot[] = [];

  for (let i = 0; i <= nPoints; i++) {
    const theta_rad = (i / nPoints) * THETA_MAX_RAD;
    thetaDeg.push(theta_rad * 180 / Math.PI);
    unassisted.push(snapshotUnassisted(theta_rad, resistScale));
    fixedRadius.push(snapshotAssisted(theta_rad, fixedTable, tau0, resistScale));
    releva.push(snapshotAssisted(theta_rad, relevTable, tau0, resistScale));
  }

  return { thetaDeg, unassisted, fixedRadius, releva };
}

/**
 * Compute a live snapshot at the current animation angle for all three models.
 */
export function computeLiveSnapshot(
  theta_rad: number,
  profile: CamProfile,
  tau0: number,
  resistScale: number,
  relevTable: KinematicTable,
  fixedTable: KinematicTable
): {
  unassisted: ModelSnapshot;
  fixedRadius: ModelSnapshot;
  releva: ModelSnapshot;
} {
  return {
    unassisted: snapshotUnassisted(theta_rad, resistScale),
    fixedRadius: snapshotAssisted(theta_rad, fixedTable, tau0, resistScale),
    releva: snapshotAssisted(theta_rad, relevTable, tau0, resistScale),
  };
}

// ─── Energy Accounting ────────────────────────────────────────────────────────

export interface EnergyCheck {
  E_stored_J: number;      // spring energy at start of release
  W_tendon_J: number;      // tendon work over full release stroke
  isValid: boolean;        // W_tendon ≤ E_stored
  margin_J: number;        // E_stored - W_tendon
}

/**
 * Energy sanity check (Correction 5):
 * At beginning of release: E_stored = 0.5·k·φ_max² + τ₀·φ_max
 * During release: W_tendon = Σ F_t · |Δs|  (F_t already includes η)
 * Check: W_tendon ≤ E_stored
 */
export function checkEnergyAccounting(
  profile: CamProfile,
  tau0: number,
  resistScale: number
): EnergyCheck {
  const table = buildKinematicTable(profile);
  const E_stored = springEnergy(PHI_MAX_RAD, tau0);

  // Numerically integrate tendon work during release
  let W_tendon = 0;
  for (let i = 1; i < table.phi.length; i++) {
    const ds = Math.abs(table.s[i] - table.s[i - 1]);
    // phi_wound at step i: cam unwinds as phi increases
    const phi_wound_i = Math.max(0, PHI_MAX_RAD - table.phi[i]);
    const tau_s = springTorque(phi_wound_i, tau0);
    const reff_i = table.reff[i];
    const F_t = reff_i > 1e-9 ? (EFFICIENCY_ETA * tau_s) / reff_i : 0;
    W_tendon += F_t * ds;
  }

  return {
    E_stored_J: E_stored,
    W_tendon_J: W_tendon,
    isValid: W_tendon <= E_stored + 1e-9, // small tolerance for floating point
    margin_J: E_stored - W_tendon,
  };
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Build and return kinematic tables for both RELEVA and fixed-radius models.
 * Call this when the cam profile changes.
 */
export function buildTables(profile: CamProfile): {
  relevTable: KinematicTable;
  fixedTable: KinematicTable;
} {
  return {
    relevTable: buildKinematicTable(profile),
    fixedTable: buildFixedRadiusTable(),
  };
}
