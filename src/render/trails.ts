import * as THREE from 'three';
import type { BodySnapshot } from '../shared/types.ts';

interface TrailState {
  positions: Float32Array;
  head: number;
  count: number;
  line: THREE.Line;
  lastX: number;
  lastY: number;
  color: THREE.Color;
}

const MAX_POINTS = 36;
const SPEED_THRESHOLD = 4.5;
const MIN_SEGMENT = 0.08;

/**
 * Fading motion ribbons for fast-moving dynamic bodies.
 * Slow-mo boosts opacity and keeps trails longer.
 */
export class MotionTrails {
  private group = new THREE.Group();
  private trails = new Map<string, TrailState>();
  private slowBoost = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  setSlowMoBoost(boost: number): void {
    this.slowBoost = THREE.MathUtils.clamp(boost, 0, 1);
  }

  sync(bodies: BodySnapshot[], _dt: number): void {
    const seen = new Set<string>();
    const speedGate = SPEED_THRESHOLD * (1 - this.slowBoost * 0.45);
    const minSeg = MIN_SEGMENT * (1 - this.slowBoost * 0.35);

    for (const b of bodies) {
      if (b.bodyType !== 'dynamic' || b.sleeping) continue;
      const speed = Math.hypot(b.vx, b.vy);
      if (speed < speedGate && !this.trails.has(b.id)) continue;

      seen.add(b.id);
      let trail = this.trails.get(b.id);
      if (!trail) {
        trail = this.createTrail(b);
        this.trails.set(b.id, trail);
      }

      const dx = b.x - trail.lastX;
      const dy = b.y - trail.lastY;
      if (Math.hypot(dx, dy) >= minSeg || trail.count === 0) {
        this.pushPoint(trail, b.x, b.y, 0.12);
        trail.lastX = b.x;
        trail.lastY = b.y;
      }

      // Fade slower in slow-mo
      const fadeGate = speedGate * 0.55;
      if (speed < fadeGate && trail.count > 2) {
        const drop = this.slowBoost > 0.4 ? 0 : 1;
        trail.count = Math.max(0, trail.count - drop);
      }

      this.upload(trail);
      const mat = trail.line.material as THREE.LineBasicMaterial;
      const baseOp = THREE.MathUtils.clamp(speed / 16, 0.12, 0.55);
      mat.opacity = Math.min(0.65, baseOp + this.slowBoost * 0.15);
      trail.color.set(b.color ?? '#88aacc');
      mat.color.copy(trail.color);
    }

    for (const [id, trail] of this.trails) {
      if (seen.has(id)) continue;
      const decay = this.slowBoost > 0.4 ? 1 : 2;
      if (trail.count > 0) {
        trail.count = Math.max(0, trail.count - decay);
        this.upload(trail);
      }
      if (trail.count <= 0) {
        this.group.remove(trail.line);
        trail.line.geometry.dispose();
        (trail.line.material as THREE.Material).dispose();
        this.trails.delete(id);
      }
    }
  }

  private createTrail(b: BodySnapshot): TrailState {
    const positions = new Float32Array(MAX_POINTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setDrawRange(0, 0);

    const color = new THREE.Color(b.color ?? '#88aacc');
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      // Normal blending keeps trails from blooming into a haze
      blending: THREE.NormalBlending,
    });
    const line = new THREE.Line(geo, mat);
    line.frustumCulled = false;
    this.group.add(line);

    return {
      positions,
      head: 0,
      count: 0,
      line,
      lastX: b.x,
      lastY: b.y,
      color,
    };
  }

  private pushPoint(trail: TrailState, x: number, y: number, z: number): void {
    const i = trail.head % MAX_POINTS;
    trail.positions[i * 3] = x;
    trail.positions[i * 3 + 1] = y;
    trail.positions[i * 3 + 2] = z;
    trail.head++;
    trail.count = Math.min(MAX_POINTS, trail.count + 1);
  }

  private upload(trail: TrailState): void {
    const n = trail.count;
    const ordered = new Float32Array(n * 3);
    const start = trail.head - n;
    for (let i = 0; i < n; i++) {
      const src = ((start + i) % MAX_POINTS) * 3;
      ordered[i * 3] = trail.positions[src];
      ordered[i * 3 + 1] = trail.positions[src + 1];
      ordered[i * 3 + 2] = trail.positions[src + 2];
    }
    const attr = trail.line.geometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute;
    (attr.array as Float32Array).set(ordered);
    attr.needsUpdate = true;
    trail.line.geometry.setDrawRange(0, n);
    trail.line.geometry.computeBoundingSphere();
  }

  dispose(): void {
    for (const trail of this.trails.values()) {
      this.group.remove(trail.line);
      trail.line.geometry.dispose();
      (trail.line.material as THREE.Material).dispose();
    }
    this.trails.clear();
  }
}
