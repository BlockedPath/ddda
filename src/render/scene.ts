import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PresentationCamera } from './camera.ts';
import { BodyMeshPool } from './bodyMeshes.ts';
import { Effects } from './effects.ts';
import { MotionTrails } from './trails.ts';
import { SpawnGhost } from './spawnGhost.ts';
import type { MaterialId, PhysicsSnapshot, ToolMode } from '../shared/types.ts';

/**
 * Main visual scene. Cursor owns visual excellence here.
 */
export class RenderScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly presentation: PresentationCamera;
  readonly pool: BodyMeshPool;
  readonly effects: Effects;
  readonly trails: MotionTrails;
  readonly ghost: SpawnGhost;
  private canvas: HTMLCanvasElement;
  private pmrem: THREE.PMREMGenerator;
  private pauseOverlay: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x080b12);
    this.scene.fog = new THREE.FogExp2(0x080b12, 0.016);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.pauseOverlay = document.createElement('div');
    this.pauseOverlay.className = 'pause-banner';
    this.pauseOverlay.innerHTML = '<span>PAUSED</span>';
    this.pauseOverlay.hidden = true;
    container.appendChild(this.pauseOverlay);

    this.presentation = new PresentationCamera(
      container.clientWidth / Math.max(1, container.clientHeight),
    );

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.setupLights();
    this.setupEnvironment();

    this.pool = new BodyMeshPool(this.scene);
    this.trails = new MotionTrails(this.scene);
    this.ghost = new SpawnGhost(this.scene);
    this.effects = new Effects(
      this.renderer,
      this.scene,
      this.presentation.camera,
    );

    window.addEventListener('resize', () => this.onResize(container));
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setTool(tool: ToolMode): void {
    this.ghost.setTool(tool);
  }

  setGhostAppearance(materialId: MaterialId, color: string): void {
    this.ghost.setAppearance(materialId, color);
  }

  setGhostWorld(x: number | null, y: number | null): void {
    if (x === null || y === null) this.ghost.hide();
    else this.ghost.setWorldPos(x, y);
  }

  boomAt(x: number, y: number, fireworks = false): void {
    if (fireworks) {
      this.effects.spawnFirework(x, y, { hue: Math.random(), scale: 1.15 });
    } else {
      this.effects.spawnShockwave(x, y, 6);
    }
  }

  fireworkAt(x: number, y: number, hue?: number): void {
    this.effects.spawnFirework(x, y, { hue, scale: 1 });
  }

  /** Capture current frame as PNG download. */
  captureScreenshot(filename = 'ddda-shot.png'): boolean {
    try {
      // Ensure latest frame is in the drawing buffer
      this.effects.render();
      const url = this.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      return true;
    } catch (err) {
      console.error('Screenshot failed', err);
      return false;
    }
  }

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0x6a7a90, 0.22);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xa8b8d0, 0x121820, 0.32);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff2e0, 1.05);
    key.position.set(8, 18, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -20;
    key.shadow.camera.right = 20;
    key.shadow.camera.top = 20;
    key.shadow.camera.bottom = -10;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x6a88ff, 0.28);
    fill.position.set(-10, 6, -8);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x5cffb0, 0.28, 36, 2);
    rim.position.set(0, 5, 7);
    this.scene.add(rim);

    const warm = new THREE.PointLight(0xffaa66, 0.2, 28, 2);
    warm.position.set(-6, 3, 4);
    this.scene.add(warm);
  }

  private setupEnvironment(): void {
    const room = new RoomEnvironment();
    const envMap = this.pmrem.fromScene(room, 0.04).texture;
    this.scene.environment = envMap;
    room.dispose();

    const bgGeo = new THREE.SphereGeometry(80, 32, 16);
    const bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x121826) },
        bottomColor: { value: new THREE.Color(0x04060a) },
        accentColor: { value: new THREE.Color(0x1a3a32) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 accentColor;
        varying vec3 vWorld;
        void main() {
          vec3 n = normalize(vWorld);
          float h = n.y * 0.5 + 0.5;
          vec3 col = mix(bottomColor, topColor, pow(h, 1.15));
          float glow = pow(max(0.0, n.y * 0.35 + 0.15), 2.0);
          col = mix(col, accentColor, glow * 0.35);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(bgGeo, bgMat));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({
        color: 0x141a28,
        roughness: 0.82,
        metalness: 0.18,
        envMapIntensity: 0.5,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, 0x3a4a68, 0x1c2230);
    grid.position.y = 0.01;
    const gridMat = grid.material as THREE.LineBasicMaterial;
    if (Array.isArray(gridMat)) {
      gridMat.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.55;
      });
    } else {
      gridMat.transparent = true;
      gridMat.opacity = 0.55;
    }
    this.scene.add(grid);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(24, 0.04, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x5cffb0,
        emissive: 0x5cffb0,
        emissiveIntensity: 0.12,
        roughness: 0.35,
        metalness: 0.2,
      }),
    );
    strip.position.set(0, 0.02, 2.5);
    this.scene.add(strip);
  }

  onResize(container: HTMLElement): void {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    this.presentation.setAspect(w / h);
    this.renderer.setSize(w, h);
    this.effects.setSize(w, h);
  }

  applySnapshot(snap: PhysicsSnapshot, dt: number): void {
    this.effects.setPlayback(snap.paused, snap.timeScale);
    this.pool.sync(snap.bodies, snap.joints, dt);
    this.trails.setSlowMoBoost(
      snap.paused ? 0 : Math.max(0, 1 - snap.timeScale),
    );
    this.trails.sync(snap.bodies, dt);
    this.ghost.update(dt);
    this.presentation.tickIdle(dt, snap.paused);

    if (this.pauseOverlay) {
      this.pauseOverlay.hidden = !snap.paused;
    }

    if (snap.contacts.length) {
      this.effects.onContacts(snap.contacts);
      const gearIds = this.pool.getGearIds();
      if (gearIds.size) {
        for (const c of snap.contacts) {
          if (
            (gearIds.has(c.bodyA) || gearIds.has(c.bodyB)) &&
            c.impulse > 1.5
          ) {
            this.effects.onGearMesh(
              c.point[0],
              c.point[1],
              c.normal,
              c.impulse,
            );
          }
        }
      }
    }
    if (snap.bursts.length) {
      for (const b of snap.bursts) {
        this.effects.spawnFirework(b.x, b.y, {
          color: b.color,
          scale: 0.75 + Math.min(1.5, b.power * 0.18),
        });
      }
    }
    const shake = this.effects.update(dt);
    this.presentation.camera.position.add(shake);
    this.effects.render();
    this.presentation.camera.position.sub(shake);
  }
}
