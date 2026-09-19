/**
 * RELEVA Simulation Configuration
 *
 * All simulation parameters live here.
 * Change PRODUCT_NAME to rename the product across the entire app.
 *
 * IMPORTANT: These are ILLUSTRATIVE SIMULATION PARAMETERS — NOT CLINICAL MEASUREMENTS.
 */

export const PRODUCT_NAME = "RELEVA";

// ─── Spring Parameters ────────────────────────────────────────────────────────
export const SPRING_RATE_K = 0.08;        // N·m/rad — torsion spring stiffness
export const SPRING_PRELOAD_TAU0 = 0.04;  // N·m — preload torque at start of release

// ─── Cam / Tendon Geometry ───────────────────────────────────────────────────
export const R_EFF_MIN_M = 0.010;         // m — min effective tendon moment arm (10 mm)
export const R_EFF_MAX_M = 0.020;         // m — max effective tendon moment arm (20 mm)
export const R_EFF_AVG_M = (R_EFF_MIN_M + R_EFF_MAX_M) / 2; // 15 mm

// Finger-side tendon moment arm (fixed)
export const L_T_M = 0.012;              // m (12 mm)

// ─── Opening Range ───────────────────────────────────────────────────────────
export const THETA_MAX_DEG = 70;          // degrees — generalized finger opening range
export const THETA_MAX_RAD = THETA_MAX_DEG * Math.PI / 180;

/**
 * φ_max is DERIVED from the kinematic constraint, not hard-coded.
 *
 * From:  s = integral(r_eff dφ)  and  θ = s / L_t
 * With average radius r̄:  θ_max = (r̄ × φ_max) / L_t
 * Therefore:  φ_max = (L_t × θ_max) / r̄
 *
 * With defaults: φ_max = (0.012 × 1.2217) / 0.015 ≈ 0.977 rad ≈ 56°
 * This ensures the cam rotation and finger opening are internally consistent.
 */
export const PHI_MAX_RAD = (L_T_M * THETA_MAX_RAD) / R_EFF_AVG_M;
export const PHI_MAX_DEG = PHI_MAX_RAD * 180 / Math.PI;

// ─── Transmission ─────────────────────────────────────────────────────────────
export const EFFICIENCY_ETA = 0.85;       // dimensionless — simplified transmission efficiency

// ─── Numerical Integration ───────────────────────────────────────────────────
export const N_INTEGRATION_STEPS = 500;  // lookup table resolution

// ─── Synthetic Resistance Profile ────────────────────────────────────────────
// Parameters for τ_resistance(θ) = A·exp(-B·θ) + C
// Clearly synthetic — not derived from patient data.
export const RESISTANCE_A = 0.12;        // N·m — exponential amplitude
export const RESISTANCE_B = 2.0;         // rad⁻¹ — decay rate
export const RESISTANCE_C = 0.02;        // N·m — baseline resistance

// ─── Resistance Scaling (user control) ───────────────────────────────────────
// User slider maps to a multiplier on the resistance curve.
export const RESISTANCE_SCALE_MIN = 0.5;
export const RESISTANCE_SCALE_MAX = 2.0;
export const RESISTANCE_SCALE_DEFAULT = 1.0;

// ─── Spring Preload Control ───────────────────────────────────────────────────
export const PRELOAD_MIN = 0.01;          // N·m
export const PRELOAD_MAX = 0.10;          // N·m

// ─── Safety / Mechanical Limits ──────────────────────────────────────────────
// These are design concepts — NOT clinically validated safety limits.
export const MAX_ASSISTANCE_TORQUE_NM = 0.20; // N·m — illustrative upper design limit
export const MAX_TENDON_FORCE_N = 15.0;        // N — illustrative upper design limit

// ─── CAM 3D Geometry ─────────────────────────────────────────────────────────
export const CAM_EXTRUDE_DEPTH_M = 0.008;  // m (8 mm cam thickness)
export const CAM_PROFILE_SEGMENTS = 120;   // polygon segments for cam Shape

// ─── Animation ────────────────────────────────────────────────────────────────
export const ANIMATION_CYCLE_DURATION_S = 4.0;  // seconds for one full open/close cycle

// ─── Judge Demo ───────────────────────────────────────────────────────────────
export const JUDGE_DEMO_TOTAL_DURATION_S = 55;  // target duration

// ─── Cam Profile Types ────────────────────────────────────────────────────────
export type CamProfile = "aggressive" | "balanced" | "gentle";

export const CAM_PROFILE_LABELS: Record<CamProfile, string> = {
  aggressive: "Aggressive Early",
  balanced: "Balanced",
  gentle: "Gentle",
};

// ─── Display Rounding ─────────────────────────────────────────────────────────
export const DISPLAY_DECIMALS_TORQUE = 3;
export const DISPLAY_DECIMALS_FORCE = 2;
export const DISPLAY_DECIMALS_RADIUS_MM = 1;
export const DISPLAY_DECIMALS_ANGLE_DEG = 1;
