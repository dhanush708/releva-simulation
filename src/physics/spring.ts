/**
 * spring.ts — Torsion Spring Energy and Torque Model
 *
 * Models a passive torsion spring that stores energy during grasp
 * and releases it during finger opening.
 *
 * IMPORTANT: Energy accounting (Correction 5):
 * - During grasp: spring winds, E_spring increases (user supplies work)
 * - During release: spring unwinds, E_spring decreases (tendon does work)
 * - We check W_tendon ≤ E_stored at START of release, NOT globally.
 *
 * There is no ratchet or one-way clutch modelled here (Correction 3).
 * The simulation simply represents:
 *   grasp → cam rotates forward → spring winds
 *   release → cam rotates back → tendon assists opening
 */

import { SPRING_RATE_K } from "../config";

/**
 * Spring torque at cam angle φ (measured from start of release).
 *
 * τ_s(φ) = τ₀ + k·φ
 *
 * During release phase, φ decreases from φ_max toward 0.
 * We evaluate at φ = φ_start - φ_unwound.
 *
 * For the simulation we treat φ as the "wound angle" — how far the spring
 * has been wound from its free position. At start of release, φ = φ_max.
 * As the hand opens, φ decreases.
 *
 * @param phi_wound  Current wound angle (rad) — decreases during release
 * @param tau0       Preload torque (N·m)
 */
export function springTorque(phi_wound: number, tau0: number): number {
  return tau0 + SPRING_RATE_K * phi_wound;
}

/**
 * Spring stored energy at wound angle φ.
 *
 * E_spring(φ) = 0.5·k·φ² + τ₀·φ
 *
 * @param phi_wound  Wound angle (rad)
 * @param tau0       Preload torque (N·m)
 */
export function springEnergy(phi_wound: number, tau0: number): number {
  return 0.5 * SPRING_RATE_K * phi_wound * phi_wound + tau0 * phi_wound;
}
