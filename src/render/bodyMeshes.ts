import * as THREE from 'three';
import type { BodySnapshot, JointSnapshot } from '../shared/types.ts';
import { getBodyMaterial } from './materials.ts';
import { InstancedBodyLayer } from './instancedBodies.ts';

interface CableMesh {
  mesh: THREE.Mesh;
  kind: string;
}

interface BodyEntry {
  /** Root object (Group for fancy gears, Mesh otherwise) */
  root: THREE.Object3D;
  mesh: THREE.Mesh;
  rim: THREE.Mesh;
  hubGlow?: THREE.Mesh;
  pulse: number;
  visualKey: string;
}

const HIGHLIGHT = new THREE.Color(0x5cffb0);
const HIGHLIGHT_CORE = new THREE.Color(0xb8ffe0);
const MOTOR_GLOW = new THREE.Color(0xffaa55);

/**
 * Mesh pool: sync Three.js meshes from PhysicsSnapshot each frame.
 * visualHint gear/motor/paddle get beveled metallic / wood polish.
 */
export class BodyMeshPool {
  private scene: THREE.Scene;
  private group = new THREE.Group();
  private entries = new Map<string, BodyEntry>();
  private cables = new Map<string, CableMesh>();
  private cableMat: THREE.MeshStandardMaterial;
  private ribbonMat: THREE.MeshStandardMaterial;
  private rimMat: THREE.MeshBasicMaterial;
  private hubMat: THREE.MeshStandardMaterial;
  private instanced: InstancedBodyLayer;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);
    this.instanced = new InstancedBodyLayer(scene);

    this.cableMat = new THREE.MeshStandardMaterial({
      color: 0xa8c4e0,
      roughness: 0.4,
      metalness: 0.5,
      emissive: new THREE.Color(0x223344),
      emissiveIntensity: 0.12,
      envMapIntensity: 0.7,
    });
    this.ribbonMat = new THREE.MeshStandardMaterial({
      color: 0x6ad4a8,
      roughness: 0.4,
      metalness: 0.3,
      emissive: new THREE.Color(0x1a6648),
      emissiveIntensity: 0.22,
      envMapIntensity: 0.55,
    });
    this.rimMat = new THREE.MeshBasicMaterial({
      color: HIGHLIGHT,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    // Hub ring: metallic accent, barely emissive (clarity pass — no bloom wash)
    this.hubMat = new THREE.MeshStandardMaterial({
      color: 0xd4a06a,
      emissive: MOTOR_GLOW,
      emissiveIntensity: 0.1,
      roughness: 0.32,
      metalness: 0.72,
      envMapIntensity: 0.9,
    });
  }

  sync(bodies: BodySnapshot[], joints: JointSnapshot[], dt = 1 / 60): void {
    const seen = new Set<string>();
    const individual: BodySnapshot[] = [];
    const forInstance: BodySnapshot[] = [];

    for (const b of bodies) {
      if (InstancedBodyLayer.canInstance(b)) forInstance.push(b);
      else individual.push(b);
    }

    this.instanced.sync(forInstance);

    for (const b of individual) {
      seen.add(b.id);
      const visualKey = `${b.kind}:${b.visualHint ?? ''}:${b.vertices?.length ?? 0}`;
      let entry = this.entries.get(b.id);
      if (!entry || entry.visualKey !== visualKey) {
        if (entry) {
          this.group.remove(entry.root);
          this.disposeEntry(entry);
        }
        entry = this.createEntry(b);
        this.entries.set(b.id, entry);
        this.group.add(entry.root);
      }

      const { mesh, rim, hubGlow, root } = entry;
      root.position.set(b.x, b.y, 0);
      root.rotation.set(0, 0, b.angle);

      const lookKey = `${b.materialId}:${b.color ?? ''}:${b.visualHint ?? ''}`;
      if (mesh.userData.lookKey !== lookKey) {
        this.applyLook(mesh, b);
        mesh.userData.lookKey = lookKey;
        mesh.userData.hadHighlightEmissive = false;
      }

      const mat = mesh.material as THREE.MeshStandardMaterial;
      const base = mat.userData.baseEmissive ?? 0;

      // Hub ring: subtle spin cue via scale + tiny emissive (IBL does the metal work)
      if (hubGlow) {
        const spin = Math.min(1, Math.abs(b.omega) / 5);
        const hm = hubGlow.material as THREE.MeshStandardMaterial;
        const idle = b.visualHint === 'motor' ? 0.1 : 0.04;
        hm.emissiveIntensity = idle + spin * 0.14;
        hubGlow.scale.setScalar(1 + spin * 0.05);
      }

      if (b.highlighted) {
        entry.pulse += dt * 3.2;
        const wave = 0.5 + 0.5 * Math.sin(entry.pulse);
        if (!mat.userData.hadHighlightEmissive) {
          mat.userData.prevEmissive = mat.emissive.clone();
          mat.userData.hadHighlightEmissive = true;
        }
        // Prefer rim outline over emissive wash
        mat.emissive.copy(HIGHLIGHT_CORE);
        mat.emissiveIntensity = Math.max(base, 0.08) + 0.18 + wave * 0.12;

        rim.visible = true;
        const rimScale = 1.06 + wave * 0.03;
        rim.scale.setScalar(rimScale);
        const rimMat = rim.material as THREE.MeshBasicMaterial;
        rimMat.opacity = 0.28 + wave * 0.22;
        rimMat.color.copy(HIGHLIGHT).lerp(HIGHLIGHT_CORE, wave * 0.25);

        root.scale.setScalar(1.012);
      } else {
        if (mat.userData.hadHighlightEmissive) {
          mat.emissive = mat.userData.prevEmissive ?? new THREE.Color(0x000000);
          mat.userData.hadHighlightEmissive = false;
        }
        if (b.visualHint === 'motor') {
          mat.emissiveIntensity =
            Math.max(base, 0.04) + Math.min(0.1, Math.abs(b.omega) * 0.02);
        } else {
          mat.emissiveIntensity = b.sleeping ? base * 0.3 : base;
        }
        rim.visible = false;
        root.scale.setScalar(1);
        entry.pulse = 0;
      }
    }

    for (const [id, entry] of this.entries) {
      if (!seen.has(id)) {
        this.group.remove(entry.root);
        this.disposeEntry(entry);
        this.entries.delete(id);
      }
    }

    this.syncJoints(joints);
  }

  /** Body ids currently tagged as gear/motor (for mesh-spark filtering). */
  getGearIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, entry] of this.entries) {
      const hint = entry.mesh.userData.visualHint as string | undefined;
      if (hint === 'gear' || hint === 'motor') ids.add(id);
    }
    return ids;
  }

  private applyLook(mesh: THREE.Mesh, b: BodySnapshot): void {
    const old = mesh.material as THREE.MeshStandardMaterial;
    let next: THREE.MeshStandardMaterial;

    if (b.visualHint === 'gear' || b.visualHint === 'motor') {
      // Sharp metal via IBL + low roughness — not emissive bloom
      next = getBodyMaterial('metal', b.color ?? '#c0c8d4').clone();
      next.metalness = 0.88;
      next.roughness = b.visualHint === 'motor' ? 0.24 : 0.3;
      next.envMapIntensity = 1.05;
      if (b.visualHint === 'motor') {
        next.emissive = new THREE.Color(0x2a1808);
        next.emissiveIntensity = 0.08;
      } else {
        next.emissiveIntensity = 0;
      }
    } else if (b.visualHint === 'paddle') {
      next = getBodyMaterial('wood', b.color ?? '#c49a6c').clone();
      next.roughness = 0.62;
      next.metalness = 0.04;
      next.envMapIntensity = 0.4;
      next.emissiveIntensity = 0;
    } else {
      next = getBodyMaterial(b.materialId, b.color).clone();
    }

    next.userData.baseEmissive = next.emissiveIntensity;
    mesh.material = next;
    old.dispose();
  }

  private disposeEntry(entry: BodyEntry): void {
    entry.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else if (m !== this.hubMat && m !== this.rimMat) m.dispose();
      }
    });
  }

  private createEntry(b: BodySnapshot): BodyEntry {
    const hint = b.visualHint;
    let root: THREE.Object3D;
    let mesh: THREE.Mesh;
    let hubGlow: THREE.Mesh | undefined;

    if (hint === 'gear' || hint === 'motor') {
      const built = this.createGearAssembly(b, hint === 'motor');
      root = built.group;
      mesh = built.mesh;
      hubGlow = built.hubGlow;
    } else if (hint === 'paddle') {
      const built = this.createPaddleAssembly(b);
      root = built.group;
      mesh = built.mesh;
    } else {
      mesh = this.createMesh(b);
      root = mesh;
    }

    const rimGeo = mesh.geometry.clone();
    const rim = new THREE.Mesh(rimGeo, this.rimMat.clone());
    rim.visible = false;
    rim.scale.setScalar(1.1);
    rim.renderOrder = -1;
    mesh.add(rim);

    mesh.userData.kind = b.kind;
    mesh.userData.visualHint = hint;
    mesh.userData.lookKey = `${b.materialId}:${b.color ?? ''}:${hint ?? ''}`;

    return {
      root,
      mesh,
      rim,
      hubGlow,
      pulse: 0,
      visualKey: `${b.kind}:${hint ?? ''}:${b.vertices?.length ?? 0}`,
    };
  }

  private createGearAssembly(
    b: BodySnapshot,
    isMotor: boolean,
  ): { group: THREE.Group; mesh: THREE.Mesh; hubGlow: THREE.Mesh } {
    const group = new THREE.Group();
    const depth = b.zDepth || 0.55;
    // Prefer physics-provided tooth verts (circle collider + render outline);
    // fall back to procedural teeth from radius if verts missing.
    const verts =
      b.vertices && b.vertices.length >= 6
        ? b.vertices
        : this.proceduralGearVerts(b.radius ?? 0.8, 12);

    // Outer radius from vertices
    let rMax = 0.5;
    for (const v of verts) rMax = Math.max(rMax, Math.hypot(v[0], v[1]));

    const shape = new THREE.Shape();
    shape.moveTo(verts[0][0], verts[0][1]);
    for (let i = 1; i < verts.length; i++) {
      shape.lineTo(verts[i][0], verts[i][1]);
    }
    shape.closePath();

    // Hub bore
    const bore = Math.max(0.12, rMax * 0.18);
    const hole = new THREE.Path();
    hole.absarc(0, 0, bore, 0, Math.PI * 2, true);
    shape.holes.push(hole);

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: Math.min(0.05, depth * 0.1),
      bevelSize: 0.028,
      bevelSegments: 3,
      curveSegments: 1,
    });
    geo.translate(0, 0, -depth / 2);

    const mat = getBodyMaterial('metal', b.color ?? '#c0c8d4').clone();
    mat.metalness = 0.88;
    mat.roughness = isMotor ? 0.24 : 0.3;
    mat.envMapIntensity = 1.05;
    if (isMotor) {
      mat.emissive = new THREE.Color(0x2a1808);
      mat.emissiveIntensity = 0.08;
    } else {
      mat.emissiveIntensity = 0;
    }
    mat.userData.baseEmissive = mat.emissiveIntensity;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Inner hub disc — polished metal, no glow
    const hubR = bore * 1.65;
    const hubGeo = new THREE.CylinderGeometry(hubR, hubR, depth * 1.05, 28);
    hubGeo.rotateX(Math.PI / 2);
    const hubMat = getBodyMaterial('metal', '#6a7380').clone();
    hubMat.metalness = 0.9;
    hubMat.roughness = 0.22;
    hubMat.envMapIntensity = 1.1;
    hubMat.emissiveIntensity = 0;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.castShadow = true;
    group.add(hub);

    // Axle pin
    const axleGeo = new THREE.CylinderGeometry(
      bore * 0.55,
      bore * 0.55,
      depth * 1.35,
      14,
    );
    axleGeo.rotateX(Math.PI / 2);
    const axleMat = getBodyMaterial('metal', '#3a4250').clone();
    axleMat.metalness = 0.85;
    axleMat.roughness = 0.38;
    axleMat.envMapIntensity = 0.85;
    axleMat.emissiveIntensity = 0;
    const axle = new THREE.Mesh(axleGeo, axleMat);
    group.add(axle);

    // Accent ring (motor: warm metal; gear: cool steel) — low emissive
    const glowGeo = new THREE.TorusGeometry(hubR * 1.12, 0.028, 8, 32);
    const glowMat = this.hubMat.clone();
    if (!isMotor) {
      glowMat.emissiveIntensity = 0.04;
      glowMat.color.set('#8899aa');
      glowMat.emissive.set('#223344');
      glowMat.metalness = 0.8;
      glowMat.roughness = 0.28;
    }
    const hubGlow = new THREE.Mesh(glowGeo, glowMat);
    hubGlow.position.z = depth * 0.52;
    group.add(hubGlow);

    return { group, mesh, hubGlow };
  }

  /** Render-only tooth outline when snapshot has radius but no vertices. */
  private proceduralGearVerts(
    outerR: number,
    teeth: number,
  ): [number, number][] {
    const innerR = outerR * 0.82;
    const verts: [number, number][] = [];
    const n = teeth * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = i % 2 === 0 ? outerR : innerR;
      verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return verts;
  }

  private createPaddleAssembly(
    b: BodySnapshot,
  ): { group: THREE.Group; mesh: THREE.Mesh } {
    const group = new THREE.Group();
    const depth = b.zDepth || 0.45;
    const hw = (b.halfW ?? 0.5) * 2;
    const hh = (b.halfH ?? 0.5) * 2;

    // Soft-beveled paddle via rounded box approximation (box + edge strips)
    const geo = new THREE.BoxGeometry(hw, hh, depth, 1, 1, 1);
    const mat = getBodyMaterial('wood', b.color ?? '#c49a6c').clone();
    mat.roughness = 0.55;
    mat.metalness = 0.05;
    mat.envMapIntensity = 0.55;
    mat.userData.baseEmissive = mat.emissiveIntensity;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Tip accent strip
    const tip = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 0.12, hh * 1.05, depth * 1.08),
      getBodyMaterial('metal', '#8a9bb0').clone(),
    );
    tip.position.x = hw * 0.42;
    tip.castShadow = true;
    group.add(tip);

    return { group, mesh };
  }

  private createMesh(b: BodySnapshot): THREE.Mesh {
    const depth = b.zDepth || 0.45;
    let geo: THREE.BufferGeometry;

    switch (b.kind) {
      case 'circle': {
        const r = b.radius ?? 0.4;
        geo = new THREE.CylinderGeometry(r, r, depth, 32);
        geo.rotateX(Math.PI / 2);
        break;
      }
      case 'capsule': {
        const r = b.radius ?? 0.25;
        const hh = b.halfHeight ?? 0.5;
        geo = new THREE.CapsuleGeometry(r, hh * 2, 6, 12);
        geo.rotateX(Math.PI / 2);
        break;
      }
      case 'polygon': {
        const verts = b.vertices ?? [
          [-0.5, -0.4],
          [0.5, -0.4],
          [0, 0.5],
        ];
        const shape = new THREE.Shape();
        shape.moveTo(verts[0][0], verts[0][1]);
        for (let i = 1; i < verts.length; i++) {
          shape.lineTo(verts[i][0], verts[i][1]);
        }
        shape.closePath();
        geo = new THREE.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: false,
        });
        geo.translate(0, 0, -depth / 2);
        break;
      }
      case 'box':
      default: {
        const hw = (b.halfW ?? 0.5) * 2;
        const hh = (b.halfH ?? 0.5) * 2;
        geo = new THREE.BoxGeometry(hw, hh, depth);
        break;
      }
    }

    const mat = getBodyMaterial(b.materialId, b.color).clone();
    mat.userData.baseEmissive = mat.emissiveIntensity;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = b.bodyType !== 'static';
    mesh.receiveShadow = true;
    mesh.userData.kind = b.kind;
    mesh.userData.lookKey = `${b.materialId}:${b.color ?? ''}:`;
    return mesh;
  }

  private syncJoints(joints: JointSnapshot[]): void {
    const seen = new Set<string>();

    for (const j of joints) {
      seen.add(j.id);
      const ax = j.anchorA[0];
      const ay = j.anchorA[1];
      const bx = j.anchorB[0];
      const by = j.anchorB[1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy);

      let entry = this.cables.get(j.id);
      const useRibbon = j.kind === 'distance';
      const wantKind = useRibbon ? 'ribbon' : 'tube';

      if (!entry || entry.kind !== wantKind) {
        if (entry) {
          this.group.remove(entry.mesh);
          entry.mesh.geometry.dispose();
        }
        entry = this.createCable(wantKind);
        this.cables.set(j.id, entry);
        this.group.add(entry.mesh);
      }

      if (len < 1e-4) {
        entry.mesh.visible = false;
        continue;
      }
      entry.mesh.visible = true;

      const midX = (ax + bx) * 0.5;
      const midY = (ay + by) * 0.5;
      const angle = Math.atan2(dy, dx);

      entry.mesh.scale.set(len, 1, 1);
      entry.mesh.position.set(midX, midY, useRibbon ? 0.04 : 0);
      entry.mesh.rotation.set(0, 0, angle);

      if (useRibbon) {
        const pulse =
          0.18 + 0.08 * Math.sin(performance.now() * 0.004 + midX * 0.5);
        (entry.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
          pulse;
      }
    }

    for (const [id, entry] of this.cables) {
      if (!seen.has(id)) {
        this.group.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        if (entry.kind === 'ribbon') {
          (entry.mesh.material as THREE.Material).dispose();
        }
        this.cables.delete(id);
      }
    }
  }

  private createCable(kind: 'tube' | 'ribbon'): CableMesh {
    if (kind === 'ribbon') {
      const geo = new THREE.CylinderGeometry(0.055, 0.055, 1, 10, 1, false);
      geo.rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, this.ribbonMat.clone());
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      return { mesh, kind };
    }

    const geo = new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, false);
    geo.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geo, this.cableMat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    return { mesh, kind };
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.disposeEntry(entry);
    }
    this.entries.clear();
    for (const entry of this.cables.values()) {
      this.group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      if (entry.kind === 'ribbon') {
        (entry.mesh.material as THREE.Material).dispose();
      }
    }
    this.cables.clear();
    this.cableMat.dispose();
    this.ribbonMat.dispose();
    this.rimMat.dispose();
    this.hubMat.dispose();
    this.instanced.dispose();
  }
}
