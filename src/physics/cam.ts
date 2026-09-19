/**
 * cam.ts — Variable-Radius Cam Profile Functions
 *
 * Engineering model for the critical CNC component: the variable-radius cam.
 *
 * The "effective tendon moment arm" r_eff(φ) determines how spring torque
 * is converted to tendon force at each cam angle φ.
 *
 * KEY DESIGN PRINCIPLE (Correction 2):
 * All three profiles share the SAME r_min, r_max, and SAME AVERAGE RADIUS.
 * The only difference is the DISTRIBUTION of radius through the stroke.
 * This makes the three-model comparison scientifically fair.
 *
 * Profile math:
 *   x = φ / φ_max  (normalized cam angle, 0..1)
 *   smoothstep(x) = 3x² - 2x³    [C¹-continuous, maps 0→0, 1→1]
 *   h(x) = x²(1-x)²(1-2x)         [C¹, zero at endpoints, odd-ish]
 *
 *   AGGRESSIVE EARLY:  f(x) = smoothstep(x) - 2·h(x)
 *   BALANCED:          f(x) = smoothstep(x)
 *   GENTLE:            f(x) = smoothstep(x) + 2·h(x)
 *
 *   r_eff(φ) = r_min + (r_max - r_min) · clamp(f(x), 0, 1)
 *
 * Why this is fair: h(x) integrates to zero over [0,1], so average r_eff
 * is identical across all three profiles.
 */

import {
  R_EFF_MIN_M,
  R_EFF_MAX_M,
  PHI_MAX_RAD,
  type CamProfile,
} from "../config";

/** Smoothstep: C¹-continuous, maps [0,1]→[0,1] */
function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Shape perturbation h(x): zero at x=0 and x=1, antisymmetric around 0.5.
 * Integrates to zero over [0,1] — so it does NOT change the average radius.
 */
function h(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (1 - t) * (1 - t) * (1 - 2 * t);
}

/** Normalized profile function f(x) ∈ [0,1] for each cam profile */
function profileF(x: number, profile: CamProfile): number {
  const s = smoothstep(x);
  const hx = h(x);
  let f: number;
  switch (profile) {
    case "aggressive":
      // Keeps radius smaller early → higher force early → smoothstep pulls earlier
      f = s - 2 * hx;
      break;
    case "balanced":
      f = s;
      break;
    case "gentle":
      // Radius increases earlier → softer assistance early
      f = s + 2 * hx;
      break;
  }
  // Clamp to [0,1] to prevent r_eff going outside [r_min, r_max]
  return Math.max(0, Math.min(1, f));
}

/**
 * Compute effective tendon moment arm at cam angle φ.
 *
 * r_eff(φ) = r_min + (r_max - r_min) · f(φ/φ_max)
 *
 * Units: metres
 * Constraints: r_eff ∈ [r_min, r_max], always > 0
 */
export function computeReff(phi: number, profile: CamProfile): number {
  const x = phi / PHI_MAX_RAD;
  const f = profileF(x, profile);
  return R_EFF_MIN_M + (R_EFF_MAX_M - R_EFF_MIN_M) * f;
}

/**
 * Generate a lookup table of r_eff values at N evenly-spaced phi values.
 * Used by the kinematic integration step.
 */
export function buildReffTable(
  profile: CamProfile,
  nSteps: number
): { phi: number[]; reff: number[] } {
  const phi: number[] = [];
  const reff: number[] = [];
  for (let i = 0; i <= nSteps; i++) {
    const p = (i / nSteps) * PHI_MAX_RAD;
    phi.push(p);
    reff.push(computeReff(p, profile));
  }
  return { phi, reff };
}

/**
 * Compute the 2D cam profile polygon for Three.js ExtrudeGeometry.
 *
 * Returns an array of {x, y} points in the XY plane.
 * The cam is modeled as a polar curve: point at angle φ_i
 * is at radius r_eff(φ_i) from the center.
 *
 * This maps naturally to a flat CNC-machined cam disk.
 * The extrusion direction (Z) represents cam thickness.
 */
export function buildCamProfilePoints(
  profile: CamProfile,
  segments: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];

  // Cam profile arc covers φ ∈ [0, φ_max]
  // The rest of the cam is a circular return at r_min (base circle)
  const arcPoints: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const phi = (i / segments) * PHI_MAX_RAD;
    const r = computeReff(phi, profile);
    arcPoints.push({
      x: r * Math.cos(phi),
      y: r * Math.sin(phi),
    });
  }

  // Close the cam body with a circular arc at r_min from φ_max back to 0
  const returnSegments = Math.round(segments * 0.4);
  for (let i = 0; i <= returnSegments; i++) {
    const phi =
      PHI_MAX_RAD + (i / returnSegments) * (2 * Math.PI - PHI_MAX_RAD);
    points.push({
      x: R_EFF_MIN_M * Math.cos(phi),
      y: R_EFF_MIN_M * Math.sin(phi),
    });
  }

  // Add the main profile arc (reversed so polygon winds correctly)
  for (let i = arcPoints.length - 1; i >= 0; i--) {
    points.push(arcPoints[i]);
  }

  return points;
}
