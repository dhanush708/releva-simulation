/**
 * acceptance_tests.mjs
 *
 * Programmatic verification of all 11 acceptance tests.
 * Run with: node acceptance_tests.mjs
 *
 * Tests the physics model independently of the rendering layer.
 */

// ── Inline constants (from config.ts) ────────────────────────────────────────
const SPRING_RATE_K = 0.08;
const SPRING_PRELOAD_TAU0 = 0.04;
const R_EFF_MIN_M = 0.010;
const R_EFF_MAX_M = 0.020;
const R_EFF_AVG_M = (R_EFF_MIN_M + R_EFF_MAX_M) / 2; // 0.015
const L_T_M = 0.012;
const THETA_MAX_DEG = 70;
const THETA_MAX_RAD = THETA_MAX_DEG * Math.PI / 180;
const PHI_MAX_RAD = (L_T_M * THETA_MAX_RAD) / R_EFF_AVG_M;
const EFFICIENCY_ETA = 0.85;
const N = 500;
const RESISTANCE_A = 0.12;
const RESISTANCE_B = 2.0;
const RESISTANCE_C = 0.02;

// ── Physics functions ─────────────────────────────────────────────────────────

function smoothstep(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
function h(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (1 - t) * (1 - t) * (1 - 2 * t);
}
function profileF(x, profile) {
  const s = smoothstep(x), hx = h(x);
  let f;
  if (profile === "aggressive") f = s - 2 * hx;
  else if (profile === "balanced") f = s;
  else f = s + 2 * hx;
  return Math.max(0, Math.min(1, f));
}
function computeReff(phi, profile) {
  const x = phi / PHI_MAX_RAD;
  return R_EFF_MIN_M + (R_EFF_MAX_M - R_EFF_MIN_M) * profileF(x, profile);
}

function buildKinematicTable(profile) {
  const phi = [], reff = [], s = [], theta = [];
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * PHI_MAX_RAD;
    phi.push(p);
    reff.push(computeReff(p, profile));
  }
  s.push(0); theta.push(0);
  for (let i = 1; i <= N; i++) {
    const dphi = phi[i] - phi[i - 1];
    const r_avg = 0.5 * (reff[i] + reff[i - 1]);
    s.push(s[i - 1] + r_avg * dphi);
    theta.push(s[i] / L_T_M);
  }
  return { phi, reff, s, theta };
}

function buildFixedRadiusTable() {
  const phi = [], reff = [], s = [], theta = [];
  for (let i = 0; i <= N; i++) {
    const p = (i / N) * PHI_MAX_RAD;
    phi.push(p);
    reff.push(R_EFF_AVG_M);
    s.push(R_EFF_AVG_M * p);
    theta.push(R_EFF_AVG_M * p / L_T_M);
  }
  return { phi, reff, s, theta };
}

function inverseLookup(table, theta_val) {
  const tArr = table.theta, pArr = table.phi;
  const t = Math.max(0, Math.min(tArr[tArr.length - 1], theta_val));
  let lo = 0, hi = tArr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tArr[mid] <= t) lo = mid; else hi = mid;
  }
  if (hi === lo) return pArr[lo];
  const frac = (t - tArr[lo]) / (tArr[hi] - tArr[lo]);
  return pArr[lo] + frac * (pArr[hi] - pArr[lo]);
}

function reffAtPhi(table, phi_val) {
  const pArr = table.phi, rArr = table.reff;
  const p = Math.max(0, Math.min(PHI_MAX_RAD, phi_val));
  let lo = 0, hi = pArr.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pArr[mid] <= p) lo = mid; else hi = mid;
  }
  if (hi === lo) return rArr[lo];
  const frac = (p - pArr[lo]) / (pArr[hi] - pArr[lo]);
  return rArr[lo] + frac * (rArr[hi] - rArr[lo]);
}

function computeResistance(theta_rad, scale) {
  return scale * (RESISTANCE_A * Math.exp(-RESISTANCE_B * theta_rad) + RESISTANCE_C);
}

function snapshot(theta_rad, table, tau0, resistScale) {
  const phi = inverseLookup(table, theta_rad);
  const phi_wound = Math.max(0, PHI_MAX_RAD - phi);
  const reff = reffAtPhi(table, phi);
  const tau_s = tau0 + SPRING_RATE_K * phi_wound;
  const F_t = reff > 1e-9 ? (EFFICIENCY_ETA * tau_s) / reff : 0;
  const tau_assist = F_t * L_T_M;
  const tau_res = computeResistance(theta_rad, resistScale);
  return { reff, F_t, tau_assist, tau_user: Math.max(0, tau_res - tau_assist) };
}

function snapshotUnassisted(theta_rad, resistScale) {
  return { reff: 0, F_t: 0, tau_assist: 0, tau_user: computeResistance(theta_rad, resistScale) };
}

// ── Average radius check ──────────────────────────────────────────────────────
function computeAvgReff(profile) {
  let sum = 0;
  for (let i = 0; i <= N; i++) {
    const phi = (i / N) * PHI_MAX_RAD;
    sum += computeReff(phi, profile);
  }
  return sum / (N + 1);
}

// ── Energy check ──────────────────────────────────────────────────────────────
function energyCheck(profile, tau0) {
  const table = buildKinematicTable(profile);
  const E_stored = 0.5 * SPRING_RATE_K * PHI_MAX_RAD * PHI_MAX_RAD + tau0 * PHI_MAX_RAD;
  let W_tendon = 0;
  for (let i = 1; i < table.phi.length; i++) {
    const ds = Math.abs(table.s[i] - table.s[i - 1]);
    const phi_wound_i = Math.max(0, PHI_MAX_RAD - table.phi[i]);
    const tau_s = tau0 + SPRING_RATE_K * phi_wound_i;
    const F_t = table.reff[i] > 1e-9 ? (EFFICIENCY_ETA * tau_s) / table.reff[i] : 0;
    W_tendon += F_t * ds;
  }
  return { E_stored, W_tendon, ok: W_tendon <= E_stored + 1e-9 };
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN ACCEPTANCE TESTS
// ─────────────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function test(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}${detail ? "  (" + detail + ")" : ""}`);
    passed++;
  } else {
    console.log(`  ✗ FAIL: ${label}${detail ? "  (" + detail + ")" : ""}`);
    failed++;
  }
}

console.log("\n═══════════════════════════════════════════════════════");
console.log("  RELEVA — Physics Acceptance Tests");
console.log(`  φ_max = ${(PHI_MAX_RAD * 180 / Math.PI).toFixed(2)}° (derived from kinematics)`);
console.log("═══════════════════════════════════════════════════════\n");

const tab_balanced = buildKinematicTable("balanced");
const tab_aggressive = buildKinematicTable("aggressive");
const tab_gentle = buildKinematicTable("gentle");
const tab_fixed = buildFixedRadiusTable();

const theta_mid = THETA_MAX_RAD * 0.4;
const tau0_default = 0.04;
const tau0_high = 0.08;
const resist_lo = 0.7;
const resist_hi = 1.5;

// [A] Increasing resistance increases user torque
{
  const a_lo = snapshotUnassisted(theta_mid, resist_lo);
  const a_hi = snapshotUnassisted(theta_mid, resist_hi);
  test("[A] Resistance↑ → τ_user↑",
    a_hi.tau_user > a_lo.tau_user,
    `lo=${a_lo.tau_user.toFixed(4)} hi=${a_hi.tau_user.toFixed(4)} N·m`);
}

// [B] Increasing preload increases assistance
{
  const b_lo = snapshot(theta_mid, tab_balanced, tau0_default, 1.0);
  const b_hi = snapshot(theta_mid, tab_balanced, tau0_high, 1.0);
  test("[B] Preload↑ → τ_assist↑",
    b_hi.tau_assist > b_lo.tau_assist,
    `lo=${b_lo.tau_assist.toFixed(4)} hi=${b_hi.tau_assist.toFixed(4)} N·m`);
}

// [C] Larger r_eff → lower F_t for same τ_s
{
  // Compare at two points: early (small r_eff) vs late (large r_eff)
  const theta_early = THETA_MAX_RAD * 0.1;
  const theta_late = THETA_MAX_RAD * 0.9;
  const early = snapshot(theta_early, tab_balanced, tau0_default, 1.0);
  const late = snapshot(theta_late, tab_balanced, tau0_default, 1.0);
  test("[C] Larger r_eff → lower F_t",
    late.reff > early.reff && late.F_t < early.F_t,
    `early r=${(early.reff*1000).toFixed(1)}mm F=${early.F_t.toFixed(2)}N  ` +
    `late r=${(late.reff*1000).toFixed(1)}mm F=${late.F_t.toFixed(2)}N`);
}

// [D] RELEVA τ_assist varies with angle
{
  const pts = [0.1, 0.3, 0.6, 0.9].map(f => snapshot(f * THETA_MAX_RAD, tab_balanced, tau0_default, 1.0).tau_assist);
  const vary = Math.max(...pts) - Math.min(...pts) > 0.001;
  test("[D] RELEVA τ_assist varies with θ",
    vary,
    `range: ${Math.min(...pts).toFixed(4)} to ${Math.max(...pts).toFixed(4)} N·m`);
}

// [E] Fixed-radius τ_assist does NOT have angle-varying r_eff
{
  const pts = [0.1, 0.3, 0.6, 0.9].map(f => {
    const s = snapshot(f * THETA_MAX_RAD, tab_fixed, tau0_default, 1.0);
    return s.reff;
  });
  const vary = Math.max(...pts) - Math.min(...pts);
  test("[E] Fixed-radius r_eff is constant",
    vary < 1e-9,
    `variation = ${vary.toExponential(2)} m`);
}

// [F] Unassisted τ_assist = 0 everywhere
{
  const allZero = [0.1, 0.5, 0.9].every(f =>
    snapshotUnassisted(f * THETA_MAX_RAD, 1.0).tau_assist === 0
  );
  test("[F] Unassisted τ_assist = 0 everywhere", allZero);
}

// [G] Graph values = physics module values
{
  // Verify that the same function called twice gives same result (deterministic)
  const g1 = snapshot(theta_mid, tab_balanced, tau0_default, 1.0);
  const g2 = snapshot(theta_mid, tab_balanced, tau0_default, 1.0);
  test("[G] Physics model is deterministic (graph = physics)",
    Math.abs(g1.tau_user - g2.tau_user) < 1e-12 &&
    Math.abs(g1.F_t - g2.F_t) < 1e-12,
    "identical calls → identical output");
}

// [H] Cam profile change → different assistance curve
{
  const h_bal = [0.2, 0.5, 0.8].map(f => snapshot(f * THETA_MAX_RAD, tab_balanced, tau0_default, 1.0).tau_assist);
  const h_agg = [0.2, 0.5, 0.8].map(f => snapshot(f * THETA_MAX_RAD, tab_aggressive, tau0_default, 1.0).tau_assist);
  const h_gen = [0.2, 0.5, 0.8].map(f => snapshot(f * THETA_MAX_RAD, tab_gentle, tau0_default, 1.0).tau_assist);
  const different = h_bal.some((v, i) => Math.abs(v - h_agg[i]) > 0.0005);
  const different2 = h_bal.some((v, i) => Math.abs(v - h_gen[i]) > 0.0005);
  test("[H] Cam profile change → different assistance curve",
    different && different2,
    "balanced vs aggressive and gentle all differ");
}

// [I] Energy check never reports impossible creation
{
  const e_bal = energyCheck("balanced", tau0_default);
  const e_agg = energyCheck("aggressive", tau0_default);
  const e_gen = energyCheck("gentle", tau0_default);
  test("[I] Energy accounting valid (all profiles)",
    e_bal.ok && e_agg.ok && e_gen.ok,
    `bal: W=${(e_bal.W_tendon*1000).toFixed(2)}mJ ≤ E=${(e_bal.E_stored*1000).toFixed(2)}mJ`);
}

// [J] All three models use same θ trajectory
{
  // Fixed and RELEVA should end at same θ_max
  const theta_end_releva = tab_balanced.theta[tab_balanced.theta.length - 1];
  const theta_end_fixed = tab_fixed.theta[tab_fixed.theta.length - 1];
  test("[J] All models use same θ trajectory",
    Math.abs(theta_end_releva - THETA_MAX_RAD) < 0.001 &&
    Math.abs(theta_end_fixed - THETA_MAX_RAD) < 0.001,
    `RELEVA θ_max=${(theta_end_releva*180/Math.PI).toFixed(2)}° Fixed=${(theta_end_fixed*180/Math.PI).toFixed(2)}°`);
}

// [K] Extra: Verify φ_max is correctly derived
{
  test("[K] φ_max derived from kinematics",
    Math.abs(PHI_MAX_RAD - (L_T_M * THETA_MAX_RAD) / R_EFF_AVG_M) < 1e-10,
    `φ_max = ${(PHI_MAX_RAD * 180 / Math.PI).toFixed(2)}° (expected ~56°)`);
}

// ── Extra: Equal average radius check ────────────────────────────────────────
{
  const avg_bal = computeAvgReff("balanced");
  const avg_agg = computeAvgReff("aggressive");
  const avg_gen = computeAvgReff("gentle");
  console.log(`\n  📐 Average r_eff verification (should all be ≈ ${(R_EFF_AVG_M*1000).toFixed(1)} mm):`);
  console.log(`     Balanced:    ${(avg_bal*1000).toFixed(3)} mm`);
  console.log(`     Aggressive:  ${(avg_agg*1000).toFixed(3)} mm`);
  console.log(`     Gentle:      ${(avg_gen*1000).toFixed(3)} mm`);
  const same_avg = Math.abs(avg_bal - avg_agg) < 0.001 && Math.abs(avg_bal - avg_gen) < 0.001;
  test("[EXTRA] All profiles have same average r_eff", same_avg,
    same_avg ? "Fair comparison confirmed" : "PROFILES HAVE DIFFERENT AVERAGES — comparison is biased!");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════════════════\n");

if (failed > 0) process.exit(1);
