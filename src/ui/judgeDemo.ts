/**
 * judgeDemo.ts — Automated 9-Step Judge Demo Sequence
 *
 * Runs a deterministic 54-second scripted walkthrough showing:
 * 1. Unassisted hand opening (baseline problem)
 * 2. Unassisted torque curve (graphical problem)
 * 3. RELEVA introduction (passive assistance)
 * 4. Assisted motion (side-by-side comparison)
 * 5. Mechanism reveal (spring → cam → tendon)
 * 6. Effective moment arm r_eff (variable transmission)
 * 7. Three-model comparison (why variable geometry matters)
 * 8. Cam profile tuning (programmable design parameter)
 * 9. Engineering feasibility summary & physical next steps
 *
 * IMPORTANT: Uses technically honest language only.
 * No clinical claims, no grip-strength claims, no fake percentages.
 */

import { type CamProfile } from "../config";

export interface JudgeDemoCallbacks {
  setAnimating(running: boolean): void;
  setShowReleva(show: boolean): void;
  setShowMechanism(show: boolean): void;
  setHighlightReff(highlight: boolean): void;
  setHighlightForce(highlight: boolean): void;
  setShowAllCurves(show: boolean): void;
  setPresentationFocus(focus: "unassisted" | "hands" | "mechanism" | "graph" | "all"): void;
  setCamProfile(profile: CamProfile): void;
  showStep(stepNum: number, title: string, description: string, focalBadge?: string): void;
  hideStep(): void;
  onComplete(): void;
}

interface DemoStep {
  duration: number; // ms
  action(callbacks: JudgeDemoCallbacks): void;
}

const STEPS: DemoStep[] = [
  // ── Step 1: Unassisted Hand Opening (~5s) ───────────────────────────────────
  {
    duration: 5000,
    action(cb) {
      cb.setPresentationFocus("unassisted");
      cb.setShowReleva(false);
      cb.setShowMechanism(false);
      cb.setShowAllCurves(false);
      cb.setAnimating(true);
      cb.showStep(
        1,
        "Without Mechanical Assistance",
        "The stroke survivor struggles to voluntarily reopen the hand after grasping. The extensor muscles must overcome full finger-opening resistance alone.",
        "BASELINE DEFICIT"
      );
    },
  },

  // ── Step 2: Unassisted Torque Curve (~5s) ───────────────────────────────────
  {
    duration: 5000,
    action(cb) {
      cb.setPresentationFocus("unassisted");
      cb.setShowAllCurves(false);
      cb.showStep(
        2,
        "Baseline Opening Resistance Profile",
        "The grey curve shows simulated user torque required at each opening angle. Notice that resistance peaks early during extension.",
        "HIGH EARLY RESISTANCE"
      );
    },
  },

  // ── Step 3: Introducing RELEVA (~5s) ─────────────────────────────────────────
  {
    duration: 5000,
    action(cb) {
      cb.setPresentationFocus("hands");
      cb.setShowReleva(true);
      cb.setShowMechanism(false);
      cb.setShowAllCurves(true);
      cb.showStep(
        3,
        "Introducing RELEVA",
        "A passive spring-cam-tendon hand orthosis. Voluntary grasp winds a torsion spring; stored energy is released during extension to assist finger opening.",
        "PASSIVE ASSISTANCE"
      );
    },
  },

  // ── Step 4: Assisted Motion (~8s) ───────────────────────────────────────────
  {
    duration: 8000,
    action(cb) {
      cb.setPresentationFocus("hands");
      cb.setShowReleva(true);
      cb.setShowMechanism(false);
      cb.setShowAllCurves(true);
      cb.showStep(
        4,
        "Assisted Opening Motion",
        "Same finger opening motion with mechanical assistance. Notice that required user effort (green) is significantly lower, especially in the early opening arc.",
        "REDUCED USER EFFORT"
      );
    },
  },

  // ── Step 5: Mechanism Reveal (~7s) ──────────────────────────────────────────
  {
    duration: 7000,
    action(cb) {
      cb.setPresentationFocus("mechanism");
      cb.setShowMechanism(true);
      cb.showStep(
        5,
        "Mechanism Reveal: Spring → Cam → Tendon",
        "The variable-radius cam is the critical CNC-machined component. It converts rotary spring torque into linear tendon pulling force on the finger linkage.",
        "CRITICAL CNC COMPONENT"
      );
    },
  },

  // ── Step 6: Effective Moment Arm r_eff (~6s) ────────────────────────────────
  {
    duration: 6000,
    action(cb) {
      cb.setPresentationFocus("mechanism");
      cb.setShowMechanism(true);
      cb.setHighlightReff(true);
      cb.showStep(
        6,
        "Effective Tendon Moment Arm (r_eff)",
        "Smaller radius early produces higher tendon force where resistance is highest. Larger radius later produces gentler assistance as the hand opens.",
        "VARIABLE MOMENT ARM"
      );
    },
  },

  // ── Step 7: Three-Model Comparison (~8s) ───────────────────────────────────
  {
    duration: 8000,
    action(cb) {
      cb.setPresentationFocus("graph");
      cb.setShowAllCurves(true);
      cb.setHighlightReff(false);
      cb.showStep(
        7,
        "Three-Model Comparison",
        "Unassisted (grey) vs Fixed-Radius Passive (amber) vs RELEVA (teal). The fixed-radius baseline proves adding a spring is not enough—variable geometry shapes the assistance curve.",
        "SHAPED ASSISTANCE"
      );
    },
  },

  // ── Step 8: Cam Profile Tuning (~5s) ────────────────────────────────────────
  {
    duration: 5000,
    action(cb) {
      cb.setPresentationFocus("graph");
      cb.setCamProfile("aggressive");
      cb.showStep(
        8,
        "Cam Geometry as a Design Parameter",
        "By adjusting the CNC polar cam profile, assistance distribution is programmed to match specific patient resistance patterns.",
        "TUNABLE GEOMETRY"
      );
    },
  },

  // ── Step 9: Engineering Feasibility Summary (~5s) ───────────────────────────
  {
    duration: 5000,
    action(cb) {
      cb.setPresentationFocus("all");
      cb.setCamProfile("balanced");
      cb.showStep(
        9,
        "Engineering Feasibility Demonstrated",
        "Physically coherent, energy-conserving, and CNC-machinable. Demonstrates mechanical feasibility to justify physical prototype fabrication.",
        "READY FOR PROTOTYPE"
      );
    },
  },
];

export class JudgeDemo {
  private callbacks: JudgeDemoCallbacks;
  private currentStep = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;

  constructor(callbacks: JudgeDemoCallbacks) {
    this.callbacks = callbacks;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.currentStep = 0;
    this.runStep();
  }

  stop() {
    this.isRunning = false;
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.callbacks.setPresentationFocus("all");
    this.callbacks.setShowReleva(true);
    this.callbacks.setShowAllCurves(true);
    this.callbacks.setCamProfile("balanced");
    this.callbacks.hideStep();
    this.callbacks.onComplete();
  }

  private runStep() {
    if (!this.isRunning || this.currentStep >= STEPS.length) {
      this.stop();
      return;
    }

    const step = STEPS[this.currentStep];
    step.action(this.callbacks);
    this.currentStep++;

    this.timeoutId = setTimeout(() => {
      this.runStep();
    }, step.duration);
  }
}
