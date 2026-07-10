import * as THREE from 'three';

/**
 * Presentation camera for hybrid 2D-physics → 3D view.
 * Physics lives in XY; camera looks toward origin from +Z with a slight pitch.
 */
export class PresentationCamera {
  readonly camera: THREE.PerspectiveCamera;
  private target = new THREE.Vector3(0, 3, 0);
  private spherical = { radius: 22, theta: 0.15, phi: 1.15 }; // phi from Y
  private pan = new THREE.Vector2(0, 0);
  private idleSeconds = 0;
  private userActive = false;
  private readonly idleDelay = 4.5;
  private readonly idleSpeed = 0.08; // rad/s

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
    this.updateCamera();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Call on any user camera interaction to pause auto-orbit. */
  bumpActivity(): void {
    this.userActive = true;
    this.idleSeconds = 0;
  }

  /** Slow cinematic yaw when idle. */
  tickIdle(dt: number, paused: boolean): void {
    if (paused) {
      this.idleSeconds = 0;
      return;
    }
    if (this.userActive) {
      this.idleSeconds = 0;
      this.userActive = false;
      return;
    }
    this.idleSeconds += dt;
    if (this.idleSeconds < this.idleDelay) return;
    this.spherical.theta += this.idleSpeed * dt;
    this.updateCamera();
  }

  /** Orbit delta in radians */
  orbit(dTheta: number, dPhi: number): void {
    this.bumpActivity();
    this.spherical.theta += dTheta;
    this.spherical.phi = THREE.MathUtils.clamp(
      this.spherical.phi + dPhi,
      0.35,
      Math.PI / 2 - 0.05,
    );
    this.updateCamera();
  }

  zoom(delta: number): void {
    this.bumpActivity();
    this.spherical.radius = THREE.MathUtils.clamp(
      this.spherical.radius + delta,
      8,
      50,
    );
    this.updateCamera();
  }

  panBy(dx: number, dy: number): void {
    this.bumpActivity();
    this.pan.x += dx;
    this.pan.y += dy;
    this.target.x = this.pan.x;
    this.target.y = 3 + this.pan.y;
    this.updateCamera();
  }

  private updateCamera(): void {
    const { radius, theta, phi } = this.spherical;
    const x = this.target.x + radius * Math.sin(phi) * Math.sin(theta);
    const y = this.target.y + radius * Math.cos(phi);
    const z = this.target.z + radius * Math.sin(phi) * Math.cos(theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  /**
   * Unproject screen coords onto the z=0 plane (physics plane).
   * Returns physics (x, y) or null if ray is parallel.
   */
  screenToWorld(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ): { x: number; y: number } | null {
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x, y: hit.y };
  }
}
