/**
 * mechanism.ts — Mechanism Reveal Scene
 *
 * When the user clicks "VIEW MECHANISM", this scene shows:
 *   SPRING → CAM → TENDON → FINGER LINK → HAND OPENING
 *
 * Uses force-path arrows and clean engineering labels (HTML overlays).
 * No fake physics particles.
 */

import * as THREE from "three";
import { buildCamMesh } from "./camMesh";
import { type CamProfile } from "../config";
import { PHI_MAX_RAD, CAM_EXTRUDE_DEPTH_M } from "../config";

const SPRING_COLOR = 0x2563eb;
const TENDON_COLOR = 0x0d9488;
const LINK_COLOR = 0x475569;
const ARROW_COLOR = 0x16a34a;

export interface MechanismRig {
  group: THREE.Group;
  /** Update visual state from physics snapshot */
  update(phi_rad: number, reff_m: number, F_tendon_N: number, profile: CamProfile): void;
}

export function buildMechanism(profile: CamProfile): MechanismRig {
  const group = new THREE.Group();

  // ── Spring ────────────────────────────────────────────────────────────────
  const springGroup = buildSpringCoil();
  springGroup.position.set(-0.08, 0.05, 0);
  group.add(springGroup);

  // ── Cam ───────────────────────────────────────────────────────────────────
  const camRig = buildCamMesh(profile);
  camRig.group.position.set(0, 0, 0);
  group.add(camRig.group);

  // ── Tendon path ───────────────────────────────────────────────────────────
  const tendonGroup = buildTendonPath();
  group.add(tendonGroup);

  // ── Finger link ───────────────────────────────────────────────────────────
  const linkGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.05, 8);
  const linkMat = new THREE.MeshLambertMaterial({ color: LINK_COLOR });
  const link = new THREE.Mesh(linkGeo, linkMat);
  link.position.set(0.10, 0.00, 0);
  link.rotation.z = Math.PI / 2;
  group.add(link);

  // ── Force path arrows ─────────────────────────────────────────────────────
  const arrowSpring = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0).normalize(),
    new THREE.Vector3(-0.05, 0.05, 0),
    0.03, ARROW_COLOR, 0.008, 0.005
  );
  group.add(arrowSpring);

  const arrowTendon = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0).normalize(),
    new THREE.Vector3(0.03, 0.00, 0),
    0.04, ARROW_COLOR, 0.008, 0.005
  );
  group.add(arrowTendon);

  function update(phi_rad: number, reff_m: number, F_tendon_N: number, currentProfile: CamProfile) {
    camRig.setCamAngle(phi_rad, currentProfile);
    // Scale tendon arrow directly with physical force
    const normalizedForce = Math.min(1.2, Math.max(0, F_tendon_N / 10));
    arrowTendon.setLength(
      0.018 + normalizedForce * 0.045,
      0.007, 0.005
    );
    // Visibly rotate spring coil as cam rotates to represent torsion spring action
    springGroup.rotation.y = phi_rad * 1.5;
  }

  return { group, update };
}

function buildSpringCoil(): THREE.Group {
  const group = new THREE.Group();
  const coils = 6;
  const coilRadius = 0.012;
  const pitch = 0.006;
  const totalHeight = coils * pitch;
  const segments = coils * 20;

  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = t * coils * 2 * Math.PI;
    const y = t * totalHeight - totalHeight / 2;
    points.push(new THREE.Vector3(
      coilRadius * Math.cos(angle),
      y,
      coilRadius * Math.sin(angle)
    ));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, segments * 2, 0.002, 6, false);
  const tubeMat = new THREE.MeshLambertMaterial({ color: SPRING_COLOR });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tube);

  return group;
}

function buildTendonPath(): THREE.Group {
  const group = new THREE.Group();
  const points = [
    new THREE.Vector3(0.02, 0, 0),
    new THREE.Vector3(0.06, 0.01, 0),
    new THREE.Vector3(0.09, 0, 0),
  ];
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 20, 0.001, 4, false);
  const mat = new THREE.MeshLambertMaterial({ color: TENDON_COLOR });
  group.add(new THREE.Mesh(geo, mat));
  return group;
}
