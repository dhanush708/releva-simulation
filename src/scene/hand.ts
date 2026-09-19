/**
 * hand.ts — Procedural 3D Hand Geometry
 *
 * Builds a stylized anatomical/mechanical hand from simple Three.js primitives.
 * Deliberately NOT photorealistic — designed to be clearly readable as a
 * mechanical engineering demonstrator.
 *
 * Finger joint angles driven by a single generalized opening angle θ.
 * Joint distribution: MCP 40%, PIP 35%, DIP 25%
 *
 * The hand is assembled as a Three.js Group so it can be transformed as a unit.
 */

import * as THREE from "three";
import { THETA_MAX_RAD } from "../config";

// ─── Visual constants ─────────────────────────────────────────────────────────
const PALM_COLOR = 0xe8e8e8;
const SEGMENT_COLOR = 0xd4d4d8;
const JOINT_COLOR = 0x94a3b8;
const DORSAL_COLOR = 0x1e40af;      // blue — orthosis frame
const TENDON_COLOR = 0x0d9488;      // teal — tendon line
const FORCE_ARROW_COLOR = 0x16a34a; // green — assistance arrow

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function makeBox(
  w: number, h: number, d: number, color: number,
  rx = 0, ry = 0, rz = 0
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.set(rx, ry, rz);
  return mesh;
}

function makeSphere(r: number, color: number): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, 12, 8);
  const mat = new THREE.MeshLambertMaterial({ color });
  return new THREE.Mesh(geo, mat);
}

// ─── Finger segment builder ───────────────────────────────────────────────────

interface FingerSegment {
  group: THREE.Group;     // pivot group (rotate this)
  length: number;
}

function makeFingerSegment(
  length: number, width: number, thick: number, color: number
): FingerSegment {
  const group = new THREE.Group();
  const body = makeBox(width, length, thick, color);
  body.position.y = length / 2; // pivot at bottom
  group.add(body);

  // Joint sphere at pivot
  const joint = makeSphere(width * 0.55, JOINT_COLOR);
  group.add(joint);

  return { group, length };
}

// ─── Full finger builder ──────────────────────────────────────────────────────

interface FingerJoints {
  mcp: THREE.Group;
  pip: THREE.Group;
  dip: THREE.Group;
}

function makeFinger(
  proxLen: number, midLen: number, distLen: number,
  width: number, thick: number
): { root: THREE.Group; joints: FingerJoints } {
  const root = new THREE.Group();

  // Proximal (MCP joint at base)
  const prox = makeFingerSegment(proxLen, width, thick, SEGMENT_COLOR);
  root.add(prox.group);

  // Middle (PIP joint)
  const pipGroup = new THREE.Group();
  pipGroup.position.y = proxLen;
  prox.group.add(pipGroup);
  const mid = makeFingerSegment(midLen, width * 0.9, thick * 0.9, SEGMENT_COLOR);
  pipGroup.add(mid.group);

  // Distal (DIP joint)
  const dipGroup = new THREE.Group();
  dipGroup.position.y = midLen;
  mid.group.add(dipGroup);
  const dist = makeFingerSegment(distLen, width * 0.8, thick * 0.8, SEGMENT_COLOR);
  dipGroup.add(dist.group);

  return {
    root: prox.group,
    joints: { mcp: root, pip: pipGroup, dip: dipGroup },
  };
}

// ─── Hand assembly ────────────────────────────────────────────────────────────

export interface HandRig {
  group: THREE.Group;
  fingers: FingerJoints[];   // index 0..3 = index..little finger
  thumb: { mcp: THREE.Group; pip: THREE.Group };
  tendonLine: THREE.Line;
  forceArrow: THREE.ArrowHelper;
  dorsalFrame: THREE.Mesh;
  /** Update all joint angles for a given generalized opening angle (rad) and physical tendon force (N) */
  setAngle(thetaRad: number, F_tendon_N?: number): void;
  /** Show/hide assistance indicators */
  setAssistanceVisible(visible: boolean): void;
}

export function buildHand(
  side: "left" | "right",
  isAssisted: boolean
): HandRig {
  const group = new THREE.Group();
  const mirror = side === "left" ? -1 : 1;

  // ── Palm ──────────────────────────────────────────────────────────────────
  const palmW = 0.070, palmH = 0.080, palmD = 0.025;
  const palm = makeBox(palmW, palmH, palmD, PALM_COLOR);
  palm.position.set(0, 0, 0);
  group.add(palm);

  // ── Dorsal orthosis frame (visual only — represents the device body) ──────
  const dorsalFrame = makeBox(palmW + 0.004, palmH * 0.6, palmD * 0.3, DORSAL_COLOR);
  dorsalFrame.position.set(0, palmH * 0.1, palmD * 0.6);
  dorsalFrame.material = new THREE.MeshLambertMaterial({
    color: DORSAL_COLOR,
    transparent: true,
    opacity: 0.6,
    wireframe: false,
  }) as THREE.MeshLambertMaterial;
  group.add(dorsalFrame);

  // ── Fingers ───────────────────────────────────────────────────────────────
  const fingerSpacing = palmW / 4;
  const fingerData = [
    { name: "index",  proxL: 0.040, midL: 0.028, distL: 0.020, w: 0.014, ox: -1.5 },
    { name: "middle", proxL: 0.045, midL: 0.030, distL: 0.022, w: 0.014, ox: -0.5 },
    { name: "ring",   proxL: 0.042, midL: 0.028, distL: 0.020, w: 0.013, ox:  0.5 },
    { name: "little", proxL: 0.032, midL: 0.022, distL: 0.016, w: 0.011, ox:  1.5 },
  ];

  const fingerJoints: FingerJoints[] = [];

  for (const fd of fingerData) {
    const fingerGroup = new THREE.Group();
    fingerGroup.position.set(
      fd.ox * fingerSpacing * mirror,
      palmH / 2,
      0
    );
    const { root, joints } = makeFinger(fd.proxL, fd.midL, fd.distL, fd.w, 0.018);
    fingerGroup.add(joints.mcp);
    group.add(fingerGroup);
    // Store the joint pivot groups with respect to the finger root
    fingerJoints.push({
      mcp: fingerGroup,
      pip: joints.pip,
      dip: joints.dip,
    });
  }

  // ── Thumb ─────────────────────────────────────────────────────────────────
  const thumbGroup = new THREE.Group();
  thumbGroup.position.set(mirror * (palmW / 2 + 0.008), -palmH * 0.1, 0);
  thumbGroup.rotation.z = mirror * Math.PI / 4;
  const { root: thumbRoot, joints: thumbJoints } = makeFinger(0.032, 0.026, 0, 0.016, 0.020);
  thumbGroup.add(thumbRoot);
  group.add(thumbGroup);

  // ── Tendon line ───────────────────────────────────────────────────────────
  const tendonPoints = [
    new THREE.Vector3(0, palmH * 0.1, palmD * 0.5),
    new THREE.Vector3(0, palmH / 2 + 0.040, palmD * 0.3),
  ];
  const tendonGeo = new THREE.BufferGeometry().setFromPoints(tendonPoints);
  const tendonMat = new THREE.LineBasicMaterial({
    color: TENDON_COLOR,
    linewidth: 2,
  });
  const tendonLine = new THREE.Line(tendonGeo, tendonMat);
  tendonLine.visible = isAssisted;
  group.add(tendonLine);

  // ── Force arrow (assistance direction indicator) ───────────────────────────
  const arrowDir = new THREE.Vector3(0, 1, 0.2).normalize();
  const arrowOrigin = new THREE.Vector3(0, palmH / 2, palmD * 0.3);
  const forceArrow = new THREE.ArrowHelper(
    arrowDir, arrowOrigin, 0.03, FORCE_ARROW_COLOR, 0.008, 0.005
  );
  forceArrow.visible = isAssisted;
  group.add(forceArrow);

  // ── Angle setter ──────────────────────────────────────────────────────────
  function setAngle(thetaRad: number, F_tendon_N = 0) {
    // Distribute generalized angle across joints
    // Fingers curl INWARD (negative rotation around local X)
    const mcp_frac = 0.40;
    const pip_frac = 0.35;
    const dip_frac = 0.25;

    // thetaRad = 0 is fully closed; thetaRad = THETA_MAX_RAD is fully open
    const curl = THETA_MAX_RAD - thetaRad; // max curl at closed, 0 at fully open

    for (const joints of fingerJoints) {
      joints.mcp.rotation.x = -curl * mcp_frac * 0.9;
      joints.pip.rotation.x = -curl * pip_frac * 0.9;
      joints.dip.rotation.x = -curl * dip_frac * 0.7;
    }

    // Thumb has simplified single-axis curl
    thumbGroup.rotation.z = mirror * (Math.PI / 4 + curl * 0.3);

    // Scale force arrow directly from physical tendon force (F_tendon_N)
    // F_tendon ranges from ~1.7 N (fully open) to ~10.0 N (start of release)
    if (isAssisted && F_tendon_N > 0.1) {
      forceArrow.visible = true;
      const clampedF = Math.max(0, Math.min(12, F_tendon_N));
      const len = 0.012 + (clampedF / 10) * 0.035;
      const headLen = 0.005 + (clampedF / 10) * 0.004;
      const headWidth = 0.003 + (clampedF / 10) * 0.003;
      forceArrow.setLength(len, headLen, headWidth);
    } else if (isAssisted) {
      forceArrow.visible = false;
    }
  }

  function setAssistanceVisible(visible: boolean) {
    tendonLine.visible = visible;
    forceArrow.visible = visible;
  }

  // Initialize at closed position
  setAngle(0);

  return {
    group,
    fingers: fingerJoints,
    thumb: { mcp: thumbGroup, pip: thumbJoints.pip },
    tendonLine,
    forceArrow,
    dorsalFrame,
    setAngle,
    setAssistanceVisible,
  };
}
