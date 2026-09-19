/**
 * camMesh.ts — 3D Cam Geometry (Extruded 2D Profile)
 *
 * The cam is modelled as a 2D polar profile extruded along Z.
 * This mirrors the actual CNC manufacturing process for a flat cam disk.
 *
 * CRITICAL CNC COMPONENT — Variable-radius cam
 *
 * The 2D profile is generated directly from the r_eff(φ) function,
 * so the geometry is always consistent with the physics model.
 */

import * as THREE from "three";
import { buildCamProfilePoints, computeReff } from "../physics/cam";
import {
  CAM_PROFILE_SEGMENTS,
  CAM_EXTRUDE_DEPTH_M,
  PHI_MAX_RAD,
  type CamProfile,
} from "../config";

const CAM_COLOR = 0x475569;         // slate — machined metal look
const CAM_EDGE_COLOR = 0x1e3a5f;
const REFF_INDICATOR_COLOR = 0xdc2626; // red — highlights current effective radius

interface CamMeshRig {
  group: THREE.Group;
  camMesh: THREE.Mesh;
  reffIndicator: THREE.Line;  // line from center to profile at current φ
  centerMark: THREE.Mesh;
  /** Rotate cam to cam angle φ and update r_eff indicator */
  setCamAngle(phi: number, profile: CamProfile): void;
  /** Rebuild mesh for new profile */
  rebuild(profile: CamProfile): void;
}

export function buildCamMesh(profile: CamProfile): CamMeshRig {
  const group = new THREE.Group();

  // ── Build initial cam geometry ────────────────────────────────────────────
  let camMesh = buildCamGeometry(profile);
  group.add(camMesh);

  // ── Center axle ───────────────────────────────────────────────────────────
  const axleGeo = new THREE.CylinderGeometry(0.002, 0.002, CAM_EXTRUDE_DEPTH_M * 1.5, 12);
  const axleMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
  const axle = new THREE.Mesh(axleGeo, axleMat);
  axle.rotation.x = Math.PI / 2;
  group.add(axle);

  // ── Center mark ───────────────────────────────────────────────────────────
  const centerMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.003, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
  );
  group.add(centerMark);

  // ── r_eff indicator line and active contact point bead ───────────────────
  const indicatorPoints = [
    new THREE.Vector3(0, 0, CAM_EXTRUDE_DEPTH_M / 2 + 0.001),
    new THREE.Vector3(0.015, 0, CAM_EXTRUDE_DEPTH_M / 2 + 0.001),
  ];
  const indicatorGeo = new THREE.BufferGeometry().setFromPoints(indicatorPoints);
  const indicatorMat = new THREE.LineBasicMaterial({
    color: REFF_INDICATOR_COLOR,
    linewidth: 3,
  });
  const reffIndicator = new THREE.Line(indicatorGeo, indicatorMat);
  group.add(reffIndicator);

  // Active contact marker bead on perimeter
  const contactMarker = new THREE.Mesh(
    new THREE.SphereGeometry(0.0016, 10, 8),
    new THREE.MeshLambertMaterial({ color: REFF_INDICATOR_COLOR })
  );
  contactMarker.position.set(0.015, 0, CAM_EXTRUDE_DEPTH_M / 2 + 0.001);
  group.add(contactMarker);

  function setCamAngle(phi: number, currentProfile: CamProfile) {
    // Cam rotates as spring unwinds — phi is the cam angular position
    camMesh.rotation.z = -phi;

    // Update r_eff indicator to show effective moment arm at current angle
    const reff = computeReff(phi, currentProfile);
    const indicatorEnd = new THREE.Vector3(
      reff, // along tangent reference axis
      0,
      CAM_EXTRUDE_DEPTH_M / 2 + 0.001
    );
    const posArr = reffIndicator.geometry.attributes.position as THREE.BufferAttribute;
    posArr.setXYZ(1, indicatorEnd.x, indicatorEnd.y, indicatorEnd.z);
    posArr.needsUpdate = true;
    contactMarker.position.copy(indicatorEnd);
  }

  function rebuild(newProfile: CamProfile) {
    group.remove(camMesh);
    camMesh.geometry.dispose();
    camMesh = buildCamGeometry(newProfile);
    group.add(camMesh);
  }

  return { group, camMesh, reffIndicator, centerMark, setCamAngle, rebuild };
}

function buildCamGeometry(profile: CamProfile): THREE.Mesh {
  const rawPoints = buildCamProfilePoints(profile, CAM_PROFILE_SEGMENTS);

  // Build THREE.Shape from 2D polar profile
  const shape = new THREE.Shape();
  if (rawPoints.length > 0) {
    // Scale from metres to scene units (metres are fine for Three.js)
    shape.moveTo(rawPoints[0].x, rawPoints[0].y);
    for (let i = 1; i < rawPoints.length; i++) {
      shape.lineTo(rawPoints[i].x, rawPoints[i].y);
    }
    shape.closePath();
  }

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: CAM_EXTRUDE_DEPTH_M,
    bevelEnabled: true,
    bevelThickness: 0.001,
    bevelSize: 0.001,
    bevelSegments: 2,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Center the extrusion on Z
  geometry.translate(0, 0, -CAM_EXTRUDE_DEPTH_M / 2);

  const material = new THREE.MeshLambertMaterial({
    color: CAM_COLOR,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);

  // Add edge lines for engineering drawing look
  const edges = new THREE.EdgesGeometry(geometry, 20);
  const edgeMat = new THREE.LineBasicMaterial({ color: CAM_EDGE_COLOR });
  const edgeLines = new THREE.LineSegments(edges, edgeMat);
  mesh.add(edgeLines);

  return mesh;
}
