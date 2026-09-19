/**
 * force_gradient_analysis.mjs
 * 
 * Analyzes the actual F_t gradient to determine:
 * 1. What is the maximum ΔF_t/Δθ across the stroke?
 * 2. Is this a real discontinuity or just a large-but-smooth gradient?
 * 3. What threshold makes physical sense?
 * 4. What is the analytical derivative dF_t/dθ?
 */

// ── Parameters (from config.ts) ───────────────────────────────────────────────
const k = 0.08;       // N·m/rad spring rate
const tau0 = 0.04;    // N·m preload
const R_MIN = 0.010;  // m
const R_MAX = 0.020;  // m
const R_AVG = 0.015;  // m
const L_T  = 0.012;   // m
const ETA  = 0.85;
const THETA_MAX = 70 * Math.PI / 180;
const PHI_MAX = (L_T * THETA_MAX) / R_AVG;
const N = 500;

// ── Profile functions ─────────────────────────────────────────────────────────
function smoothstep(x) { const t = Math.max(0,Math.min(1,x)); return t*t*(3-2*t); }
function h(x)          { const t = Math.max(0,Math.min(1,x)); return t*t*(1-t)*(1-t)*(1-2*t); }

function profileF(x, profile) {
  const s = smoothstep(x), hx = h(x);
  let f;
  if (profile === "aggressive") f = s - 2*hx;
  else if (profile === "balanced") f = s;
  else f = s + 2*hx;
  return Math.max(0, Math.min(1, f));
}

function computeReff(phi, profile) {
  return R_MIN + (R_MAX - R_MIN) * profileF(phi / PHI_MAX, profile);
}

// ── Build kinematic table ─────────────────────────────────────────────────────
function buildTable(profile) {
  const phi = [], reff = [], s = [], theta = [];
  for (let i = 0; i <= N; i++) {
    const p = (i/N)*PHI_MAX;
    phi.push(p);
    reff.push(computeReff(p, profile));
  }
  s.push(0); theta.push(0);
  for (let i = 1; i <= N; i++) {
    const ds = 0.5*(reff[i]+reff[i-1])*(phi[i]-phi[i-1]);
    s.push(s[i-1]+ds);
    theta.push(s[i]/L_T);
  }
  return {phi, reff, s, theta};
}

function inverseLookup(table, tval) {
  const tArr = table.theta, pArr = table.phi;
  const t = Math.max(0, Math.min(tArr[tArr.length-1], tval));
  let lo=0, hi=tArr.length-1;
  while (hi-lo>1) { const mid=(lo+hi)>>1; if (tArr[mid]<=t) lo=mid; else hi=mid; }
  if (hi===lo) return pArr[lo];
  return pArr[lo] + (t-tArr[lo])/(tArr[hi]-tArr[lo])*(pArr[hi]-pArr[lo]);
}

function reffAtPhi(table, phi) {
  const pArr = table.phi, rArr = table.reff;
  const p = Math.max(0, Math.min(PHI_MAX, phi));
  let lo=0, hi=pArr.length-1;
  while (hi-lo>1) { const mid=(lo+hi)>>1; if (pArr[mid]<=p) lo=mid; else hi=mid; }
  if (hi===lo) return rArr[lo];
  return rArr[lo] + (p-pArr[lo])/(pArr[hi]-pArr[lo])*(rArr[hi]-rArr[lo]);
}

function F_t(theta_rad, table) {
  const phi = inverseLookup(table, theta_rad);
  const phi_wound = Math.max(0, PHI_MAX - phi);
  const reff = reffAtPhi(table, phi);
  const tau_s = tau0 + k * phi_wound;
  return reff > 1e-9 ? ETA * tau_s / reff : 0;
}

// ── Analysis ──────────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════════════════");
console.log("  FORCE GRADIENT ANALYSIS");
console.log("═══════════════════════════════════════════════════════\n");

const nPoints = 200;
const dtheta_step = THETA_MAX / nPoints;

for (const profile of ["aggressive","balanced","gentle"]) {
  const table = buildTable(profile);
  
  let maxGrad = 0, maxGradTheta = 0;
  let maxAbsDelta = 0, maxDeltaTheta = 0;
  let F_at_0 = F_t(0, table);
  let F_at_end = F_t(THETA_MAX, table);
  
  const forces = [];
  for (let i=0; i<=nPoints; i++) {
    forces.push(F_t((i/nPoints)*THETA_MAX, table));
  }
  
  for (let i=1; i<=nPoints; i++) {
    const dF = Math.abs(forces[i] - forces[i-1]);
    const grad = dF / dtheta_step;    // N/rad
    if (grad > maxGrad) { maxGrad = grad; maxGradTheta = (i/nPoints)*THETA_MAX*180/Math.PI; }
    if (dF > maxAbsDelta) { maxAbsDelta = dF; maxDeltaTheta = (i/nPoints)*THETA_MAX*180/Math.PI; }
  }
  
  // Physical range of F_t
  const allForces = forces;
  const F_min = Math.min(...allForces);
  const F_max = Math.max(...allForces);
  
  // Normalized gradient (relative to force range)
  const forceRange = F_max - F_min;
  const normalizedMaxGrad = maxGrad / (forceRange / (THETA_MAX * 180/Math.PI));  // per degree
  
  console.log(`Profile: ${profile.toUpperCase()}`);
  console.log(`  F_t at θ=0°:    ${F_at_0.toFixed(3)} N`);
  console.log(`  F_t at θ=70°:   ${F_at_end.toFixed(3)} N`);
  console.log(`  F_t range:      ${F_min.toFixed(3)} – ${F_max.toFixed(3)} N  (span = ${forceRange.toFixed(3)} N)`);
  console.log(`  Max |ΔF_t| per step (Δθ=${(dtheta_step*180/Math.PI).toFixed(2)}°): ${maxAbsDelta.toFixed(4)} N  at θ=${maxDeltaTheta.toFixed(1)}°`);
  console.log(`  Max ΔF_t/Δθ:    ${maxGrad.toFixed(1)} N/rad  at θ=${maxGradTheta.toFixed(1)}°`);
  console.log(`  (Current threshold: 5.0 N/rad → FAILS)`);
  console.log(`  `);
  
  // What threshold would pass?
  const thresholdNeeded = maxGrad * 1.1;  // 10% headroom
  console.log(`  Threshold to just pass: ${thresholdNeeded.toFixed(1)} N/rad`);
  console.log();
}

// ── Analytical check at θ=0 (spring fully wound, r_eff at minimum) ────────────
console.log("═══════════════════════════════════════════════════════");
console.log("  ANALYTICAL ESTIMATE");
console.log("═══════════════════════════════════════════════════════");
console.log();
console.log("  F_t = η·τ_s / r_eff   where τ_s = τ₀ + k·φ_wound");
console.log("  At θ=0°: φ_wound = φ_max, r_eff = r_min");
const tau_s_max = tau0 + k * PHI_MAX;
const F_max_analytical = ETA * tau_s_max / R_MIN;
console.log(`  F_t(0) = ${ETA}×(${tau0}+${k}×${PHI_MAX.toFixed(3)}) / ${R_MIN}`);
console.log(`        = ${ETA}×${tau_s_max.toFixed(4)} / ${R_MIN}`);
console.log(`        = ${F_max_analytical.toFixed(3)} N`);
console.log();
console.log("  At θ=70°: φ_wound ≈ 0, r_eff = r_max");
const F_min_analytical = ETA * tau0 / R_MAX;
console.log(`  F_t(70°) ≈ ${ETA}×${tau0} / ${R_MAX} = ${F_min_analytical.toFixed(3)} N`);
console.log();
console.log("  Total F_t range: " + (F_max_analytical - F_min_analytical).toFixed(3) + " N");
console.log("  Over θ_max =", (THETA_MAX*180/Math.PI).toFixed(0), "° =", THETA_MAX.toFixed(3), "rad");
console.log("  Average gradient: " + ((F_max_analytical - F_min_analytical)/THETA_MAX).toFixed(2) + " N/rad (AVERAGE — not peak)");
console.log();

// ── What SHOULD the threshold be? ─────────────────────────────────────────────
console.log("═══════════════════════════════════════════════════════");
console.log("  RECOMMENDED THRESHOLD ANALYSIS");
console.log("═══════════════════════════════════════════════════════");
console.log();
console.log("  The current threshold of 5 N/rad was set to detect DISCONTINUITIES.");
console.log("  But the force changes by ~8–12 N over 70° = 1.22 rad.");
console.log("  That AVERAGE gradient is already ~7–10 N/rad.");
console.log("  A threshold of 5 N/rad will ALWAYS fail for this parameter set.");
console.log();
console.log("  What the check SHOULD detect:");
console.log("  - Real discontinuities: step jumps of e.g. 1-2 N in a single step");
console.log("  - NOT: the expected smooth monotonic variation of F_t across the stroke");
console.log();
console.log("  The check should use ABSOLUTE step size, not derivative:");
console.log("  With nPoints=200 steps over 70°, each step = 0.35°");
console.log("  Max physically expected |ΔF_t per step|:");
const table_bal = buildTable("balanced");
const forces_bal = [];
for (let i=0;i<=200;i++) forces_bal.push(F_t(i/200*THETA_MAX, table_bal));
let maxAbsPerStep = 0;
for (let i=1;i<=200;i++) maxAbsPerStep = Math.max(maxAbsPerStep, Math.abs(forces_bal[i]-forces_bal[i-1]));
console.log(`  = ${maxAbsPerStep.toFixed(4)} N per step (balanced profile)`);
console.log();
console.log("  RECOMMENDATION:");
console.log("  Replace gradient check (ΔF/Δθ) with absolute-per-step check (|ΔF|).");
console.log("  Threshold: 0.5 N absolute change per step (allows smooth curves, catches step jumps).");
console.log("  Or: compute second derivative d²F/dθ² instead, checking for kinks, not slope.");
console.log();
console.log("  ALTERNATIVELY: Change the test to check for C1-continuity violation:");
console.log("  d(ΔF/Δθ)/dθ — i.e. check if the derivative ITSELF jumps.");
console.log("  The current F_t curve IS smooth — it just has a large gradient.");
