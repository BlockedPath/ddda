import * as THREE from 'three';
import type { BodySnapshot } from '../shared/types.ts';

const MAX_INSTANCES = 512;

/**
 * Fast path for plain box/circle bodies (no visualHint).
 * Uses InstancedMesh + instanceColor for dense scenes.
 */
export class InstancedBodyLayer {
  private group = new THREE.Group();
  private boxMesh: THREE.InstancedMesh;
  private circleMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.55,
      metalness: 0.12,
      envMapIntensity: 0.5,
    });

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.boxMesh = new THREE.InstancedMesh(boxGeo, mat.clone(), MAX_INSTANCES);
    this.boxMesh.castShadow = true;
    this.boxMesh.receiveShadow = true;
    this.boxMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.boxMesh.frustumCulled = false;

    const circleGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
    circleGeo.rotateX(Math.PI / 2);
    this.circleMesh = new THREE.InstancedMesh(
      circleGeo,
      mat.clone(),
      MAX_INSTANCES,
    );
    this.circleMesh.castShadow = true;
    this.circleMesh.receiveShadow = true;
    this.circleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.circleMesh.frustumCulled = false;

    // Enable per-instance colors
    this.boxMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_INSTANCES * 3),
      3,
    );
    this.circleMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_INSTANCES * 3),
      3,
    );

    this.group.add(this.boxMesh, this.circleMesh);
    scene.add(this.group);
  }

  /** Returns true if this body should use the instanced path. */
  static canInstance(b: BodySnapshot): boolean {
    return (
      (b.kind === 'box' || b.kind === 'circle') &&
      !b.visualHint &&
      !b.highlighted
    );
  }

  sync(bodies: BodySnapshot[]): void {
    let boxCount = 0;
    let circleCount = 0;

    for (const b of bodies) {
      if (!InstancedBodyLayer.canInstance(b)) continue;

      if (b.kind === 'box') {
        if (boxCount >= MAX_INSTANCES) continue;
        const hw = (b.halfW ?? 0.5) * 2;
        const hh = (b.halfH ?? 0.5) * 2;
        const depth = b.zDepth || 0.45;
        this.dummy.position.set(b.x, b.y, 0);
        this.dummy.rotation.set(0, 0, b.angle);
        this.dummy.scale.set(hw, hh, depth);
        this.dummy.updateMatrix();
        this.boxMesh.setMatrixAt(boxCount, this.dummy.matrix);
        this.color.set(b.color ?? '#8899aa');
        if (b.sleeping) this.color.offsetHSL(0, 0, -0.08);
        this.boxMesh.setColorAt(boxCount, this.color);
        boxCount++;
      } else {
        if (circleCount >= MAX_INSTANCES) continue;
        const r = b.radius ?? 0.4;
        const depth = b.zDepth || 0.45;
        this.dummy.position.set(b.x, b.y, 0);
        this.dummy.rotation.set(0, 0, b.angle);
        this.dummy.scale.set(r, r, depth);
        this.dummy.updateMatrix();
        this.circleMesh.setMatrixAt(circleCount, this.dummy.matrix);
        this.color.set(b.color ?? '#8899aa');
        if (b.sleeping) this.color.offsetHSL(0, 0, -0.08);
        this.circleMesh.setColorAt(circleCount, this.color);
        circleCount++;
      }
    }

    this.boxMesh.count = boxCount;
    this.circleMesh.count = circleCount;
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.circleMesh.instanceMatrix.needsUpdate = true;
    if (this.boxMesh.instanceColor)
      this.boxMesh.instanceColor.needsUpdate = true;
    if (this.circleMesh.instanceColor)
      this.circleMesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.boxMesh.geometry.dispose();
    this.circleMesh.geometry.dispose();
    (this.boxMesh.material as THREE.Material).dispose();
    (this.circleMesh.material as THREE.Material).dispose();
  }
}
