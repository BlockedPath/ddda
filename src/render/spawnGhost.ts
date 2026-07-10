import * as THREE from 'three';
import type { MaterialId, ToolMode } from '../shared/types.ts';
import { getBodyMaterial } from './materials.ts';

/**
 * Faint preview mesh under cursor for spawn / paint tools.
 */
export class SpawnGhost {
  private group = new THREE.Group();
  private box: THREE.Mesh;
  private ball: THREE.Mesh;
  private ring: THREE.Mesh;
  private mode: ToolMode | null = null;
  private visible = false;
  private materialId: MaterialId = 'wood';
  private color = '#c49a6c';

  constructor(scene: THREE.Scene) {
    this.box = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.8, 0.45),
      this.makeGhostMat('wood', '#c49a6c'),
    );
    this.box.visible = false;

    const ballGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.45, 28);
    ballGeo.rotateX(Math.PI / 2);
    this.ball = new THREE.Mesh(
      ballGeo,
      this.makeGhostMat('neon', '#5cffb0'),
    );
    this.ball.visible = false;

    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x5cffb0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.48, 0.56, 48),
      ringMat,
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = -0.02;
    this.ring.visible = false;

    this.group.add(this.box, this.ball, this.ring);
    this.group.visible = false;
    scene.add(this.group);
  }

  setAppearance(materialId: MaterialId, color: string): void {
    this.materialId = materialId;
    this.color = color;
    this.refreshMats();
  }

  setTool(tool: ToolMode): void {
    this.mode =
      tool === 'spawn-box' || tool === 'spawn-circle' || tool === 'paint'
        ? tool
        : null;
    this.box.visible = this.mode === 'spawn-box';
    this.ball.visible =
      this.mode === 'spawn-circle' || this.mode === 'paint';
    this.refreshMats();
    this.applyVisibility();
  }

  setWorldPos(x: number, y: number | null): void {
    if (y === null || this.mode === null) {
      this.visible = false;
      this.applyVisibility();
      return;
    }
    this.visible = true;
    this.group.position.set(x, y, 0);
    this.applyVisibility();
  }

  hide(): void {
    this.visible = false;
    this.applyVisibility();
  }

  update(dt: number): void {
    if (!this.visible) return;
    const t = performance.now() * 0.003;
    const breathe = 1 + Math.sin(t) * 0.03;
    if (this.box.visible) this.box.scale.setScalar(breathe);
    if (this.ball.visible) this.ball.scale.setScalar(breathe);
    this.ring.rotation.z += dt * 0.8;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(t * 1.4));
  }

  private makeGhostMat(
    materialId: MaterialId,
    color: string,
  ): THREE.MeshStandardMaterial {
    const m = getBodyMaterial(materialId, color).clone();
    m.transparent = true;
    m.opacity = 0.32;
    m.depthWrite = false;
    return m;
  }

  private refreshMats(): void {
    const oldBox = this.box.material as THREE.MeshStandardMaterial;
    const oldBall = this.ball.material as THREE.MeshStandardMaterial;
    this.box.material = this.makeGhostMat(this.materialId, this.color);
    this.ball.material = this.makeGhostMat(this.materialId, this.color);
    oldBox.dispose();
    oldBall.dispose();
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.color);
  }

  private applyVisibility(): void {
    const on = this.visible && this.mode !== null;
    this.group.visible = on;
    this.ring.visible = on;
  }
}
