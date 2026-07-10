import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { HueSaturationShader } from 'three/examples/jsm/shaders/HueSaturationShader.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import type { ContactEvent } from '../shared/types.ts';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  spin: number;
  /** Confetti flutter (lighter gravity + tumble) */
  flutter?: boolean;
  drag?: number;
}

interface Flash {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

/** Kept conservative so bodies stay sharp (not milky/fuzzy). */
const BLOOM_BASE = 0.16;
const BLOOM_SLOW = 0.28;

/**
 * Bloom composer + pause/slow-mo grading + impacts + boom shockwaves.
 */
export class Effects {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private hueSat: ShaderPass;
  private vignette: ShaderPass;
  private particles: Particle[] = [];
  private flashes: Flash[] = [];
  private waves: Shockwave[] = [];
  private particleGeo: THREE.SphereGeometry;
  private sparkGeo: THREE.ConeGeometry;
  private particleGroup = new THREE.Group();
  private shake = 0;
  private shakeSeed = 0;
  private paused = false;
  private timeScale = 1;
  private pauseBlend = 0;
  private slowBlend = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // strength, radius, threshold — high threshold + tight radius = crisp, not gloopy
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      BLOOM_BASE,
      0.28,
      0.88,
    );
    this.composer.addPass(this.bloom);

    this.hueSat = new ShaderPass(HueSaturationShader);
    this.hueSat.uniforms.saturation.value = 0;
    this.composer.addPass(this.hueSat);

    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset.value = 1.35;
    this.vignette.uniforms.darkness.value = 1.0;
    this.composer.addPass(this.vignette);

    this.composer.addPass(new OutputPass());

    this.particleGeo = new THREE.SphereGeometry(0.05, 6, 6);
    this.sparkGeo = new THREE.ConeGeometry(0.035, 0.14, 4);
    scene.add(this.particleGroup);
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  setPlayback(paused: boolean, timeScale: number): void {
    this.paused = paused;
    this.timeScale = timeScale;
  }

  /** Boom tool shockwave ring at world point. */
  spawnShockwave(x: number, y: number, radius = 6): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.08, 0.95, 0.65),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.35, 64),
      mat,
    );
    mesh.position.set(x, y, 0.3);
    this.particleGroup.add(mesh);
    this.waves.push({
      mesh,
      life: 0.55,
      maxLife: 0.55,
      maxScale: radius * 1.05,
    });

    // Inner flash
    this.spawnFlash(x, y, 12);
    this.shake = Math.min(0.4, this.shake + 0.22);
    this.shakeSeed += 1;

    // Extra sparks
    this.spawnBurst(x, y, [0, 1], 10);
  }

  /**
   * Colorful fireworks / confetti burst (Phase 7).
   * Driven by `snap.bursts` from shell detonations.
   */
  spawnFirework(
    x: number,
    y: number,
    opts?: { hue?: number; scale?: number; color?: string },
  ): void {
    let hue = opts?.hue;
    if (hue === undefined && opts?.color) {
      hue = new THREE.Color(opts.color).getHSL({ h: 0, s: 0, l: 0 }).h;
    }
    hue ??= Math.random();
    const scale = opts?.scale ?? 1;
    const count = Math.floor(36 * scale);
    const base = new THREE.Color().setHSL(hue, 0.95, 0.58);

    // Outer colored shock ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: base.clone(),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.32, 56), ringMat);
    ring.position.set(x, y, 0.35);
    this.particleGroup.add(ring);
    this.waves.push({
      mesh: ring,
      life: 0.7,
      maxLife: 0.7,
      maxScale: 6.2 * scale,
    });

    // Inner white-hot flash
    const flashMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(hue, 0.35, 0.92),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const flash = new THREE.Mesh(
      new THREE.CircleGeometry(0.42 * scale, 24),
      flashMat,
    );
    flash.position.set(x, y, 0.42);
    this.particleGroup.add(flash);
    this.flashes.push({ mesh: flash, life: 0.2, maxLife: 0.2 });

    // Secondary glitter ring (delayed feel via shorter life / smaller start)
    const glitterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL((hue + 0.08) % 1, 0.9, 0.7),
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const glitter = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.14, 32),
      glitterMat,
    );
    glitter.position.set(x, y, 0.38);
    this.particleGroup.add(glitter);
    this.waves.push({
      mesh: glitter,
      life: 0.45,
      maxLife: 0.45,
      maxScale: 3.2 * scale,
    });

    for (let i = 0; i < count; i++) {
      const roll = i % 5;
      const isConfetti = roll === 0 || roll === 1 || roll === 2;
      const isStreak = roll === 3;
      const h = (hue + (Math.random() - 0.5) * 0.12 + (i % 7) * 0.09) % 1;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(
          h,
          isConfetti ? 0.9 : 0.95,
          isConfetti ? 0.55 : 0.75,
        ),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      let mesh: THREE.Mesh;
      if (isConfetti) {
        const w = 0.07 + Math.random() * 0.1;
        const hgt = 0.035 + Math.random() * 0.055;
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat);
        mesh.rotation.set(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI,
        );
      } else if (isStreak) {
        mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(0.04, 0.22 + Math.random() * 0.18),
          mat,
        );
        mesh.rotation.z = Math.random() * Math.PI;
      } else {
        mesh = new THREE.Mesh(this.sparkGeo, mat);
        mesh.rotation.z = Math.random() * Math.PI;
      }

      mesh.position.set(x, y, 0.15 + Math.random() * 0.35);
      this.particleGroup.add(mesh);

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.25;
      const speed = (2.4 + Math.random() * 5.2) * scale;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed + 1.4,
          (Math.random() - 0.5) * speed * 0.7,
        ),
        life: isConfetti
          ? 0.7 + Math.random() * 0.7
          : 0.4 + Math.random() * 0.45,
        maxLife: isConfetti ? 1.35 : 0.85,
        spin: (Math.random() - 0.5) * (isConfetti ? 22 : 14),
        flutter: isConfetti,
        drag: isConfetti ? 0.97 : 0.985,
      });
    }

    this.shake = Math.min(0.4, this.shake + 0.14 * scale);
    this.shakeSeed += 1;
    // Tiny bloom bump only — clarity pass keeps threshold high
    this.bloom.strength = Math.min(0.28, this.bloom.strength + 0.06 * scale);
  }

  onContacts(contacts: ContactEvent[]): void {
    for (const c of contacts) {
      if (c.impulse < 0.65) continue;

      const strength = Math.min(c.impulse, 18);
      this.spawnFlash(c.point[0], c.point[1], strength);
      this.spawnBurst(c.point[0], c.point[1], c.normal, strength);

      const punch = strength * 0.012;
      this.shake = Math.min(0.28, this.shake + punch);
      this.shakeSeed += 1;
    }
  }

  /** Tiny metallic sparks when gear teeth mesh hard. */
  onGearMesh(
    x: number,
    y: number,
    normal: [number, number],
    impulse: number,
  ): void {
    if (impulse < 1.2) return;
    const count = Math.min(10, 2 + Math.floor(impulse * 1.2));
    const nx = normal[0];
    const ny = normal[1];

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(
          0.08 + Math.random() * 0.06,
          0.9,
          0.65 + Math.random() * 0.2,
        ),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.position.set(x, y, 0.25);
      mesh.rotation.z = Math.random() * Math.PI;
      this.particleGroup.add(mesh);

      const speed = 1.2 + impulse * 0.35 + Math.random();
      const spread = (Math.random() - 0.5) * 1.2;
      const dirX = nx * Math.cos(spread) - ny * Math.sin(spread);
      const dirY = nx * Math.sin(spread) + ny * Math.cos(spread);

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          dirX * speed,
          dirY * speed + 0.4,
          (Math.random() - 0.5) * speed * 0.4,
        ),
        life: 0.18 + Math.random() * 0.2,
        maxLife: 0.35,
        spin: (Math.random() - 0.5) * 20,
        drag: 0.96,
      });
    }

    this.shake = Math.min(0.2, this.shake + impulse * 0.004);
  }

  private spawnFlash(x: number, y: number, impulse: number): void {
    const size = 0.18 + Math.min(0.55, impulse * 0.04);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.1, 0.95, 0.72),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(size, 16), mat);
    mesh.position.set(x, y, 0.25);
    this.particleGroup.add(mesh);
    this.flashes.push({
      mesh,
      life: 0.08 + Math.min(0.12, impulse * 0.008),
      maxLife: 0.16,
    });
  }

  private spawnBurst(
    x: number,
    y: number,
    normal: [number, number],
    impulse: number,
  ): void {
    const count = Math.min(18, 4 + Math.floor(impulse * 1.6));
    const nx = normal[0];
    const ny = normal[1];

    for (let i = 0; i < count; i++) {
      const isSpark = i % 3 === 0;
      const hue = isSpark
        ? 0.12 + Math.random() * 0.06
        : 0.05 + Math.random() * 0.1;
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(hue, 0.95, isSpark ? 0.7 : 0.55),
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(
        isSpark ? this.sparkGeo : this.particleGeo,
        mat,
      );
      mesh.position.set(x, y, 0.15 + Math.random() * 0.2);
      if (isSpark) {
        mesh.rotation.z = Math.random() * Math.PI;
      }
      this.particleGroup.add(mesh);

      const speed = 1.8 + impulse * 0.55 + Math.random() * 1.2;
      const spread = (Math.random() - 0.5) * Math.PI * 0.9;
      const dirX = nx * Math.cos(spread) - ny * Math.sin(spread);
      const dirY = nx * Math.sin(spread) + ny * Math.cos(spread);
      const mix = 0.55 + Math.random() * 0.45;

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          dirX * speed * mix + (Math.random() - 0.5) * speed * 0.4,
          dirY * speed * mix + Math.random() * speed * 0.35 + 0.6,
          (Math.random() - 0.5) * speed * 0.5,
        ),
        life: 0.28 + Math.random() * 0.35,
        maxLife: 0.55,
        spin: (Math.random() - 0.5) * 12,
      });
    }
  }

  update(dt: number): THREE.Vector3 {
    // Smooth pause / slow-mo grading
    const pauseTarget = this.paused ? 1 : 0;
    const slowTarget =
      !this.paused && this.timeScale < 0.99
        ? THREE.MathUtils.clamp(1 - this.timeScale, 0, 1)
        : 0;
    this.pauseBlend += (pauseTarget - this.pauseBlend) * Math.min(1, dt * 6);
    this.slowBlend += (slowTarget - this.slowBlend) * Math.min(1, dt * 5);

    this.hueSat.uniforms.saturation.value = -0.55 * this.pauseBlend;
    this.vignette.uniforms.darkness.value = 1.0 + 0.85 * this.pauseBlend;
    this.vignette.uniforms.offset.value = 1.35 - 0.25 * this.pauseBlend;

    this.bloom.strength =
      BLOOM_BASE + this.slowBlend * (BLOOM_SLOW - BLOOM_BASE);

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      const t = 1 - Math.max(0, w.life / w.maxLife);
      const ease = 1 - Math.pow(1 - t, 3);
      w.mesh.scale.setScalar(0.2 + ease * w.maxScale);
      const mat = w.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - t) * 0.75;
      if (w.life <= 0) {
        this.particleGroup.remove(w.mesh);
        w.mesh.geometry.dispose();
        mat.dispose();
        this.waves.splice(i, 1);
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = Math.max(0, f.life / f.maxLife);
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = t * 0.95;
      f.mesh.scale.setScalar(1 + (1 - t) * 1.8);
      if (f.life <= 0) {
        this.particleGroup.remove(f.mesh);
        f.mesh.geometry.dispose();
        mat.dispose();
        this.flashes.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const g = p.flutter ? 4.5 : 11;
      p.vel.y -= g * dt;
      if (p.flutter) {
        p.vel.x += Math.sin(performance.now() * 0.01 + i) * 2.5 * dt;
        p.mesh.rotation.x += p.spin * 0.6 * dt;
        p.mesh.rotation.y += p.spin * 0.4 * dt;
      }
      p.vel.multiplyScalar(p.drag ?? 0.985);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.z += p.spin * dt;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      const t = Math.max(0, p.life / p.maxLife);
      mat.opacity = p.flutter ? t * 0.95 : t;
      p.mesh.scale.setScalar(0.5 + t * 0.6);
      if (p.life <= 0) {
        this.particleGroup.remove(p.mesh);
        // Confetti/streak planes are unique geos — dispose them
        if (p.flutter || p.mesh.geometry !== this.sparkGeo) {
          if (
            p.mesh.geometry !== this.particleGeo &&
            p.mesh.geometry !== this.sparkGeo
          ) {
            p.mesh.geometry.dispose();
          }
        }
        mat.dispose();
        this.particles.splice(i, 1);
      }
    }

    const s = this.shake * (this.paused ? 0.15 : 1);
    const shakeOffset = new THREE.Vector3(
      Math.sin(this.shakeSeed * 17.1 + performance.now() * 0.04) * s,
      Math.cos(this.shakeSeed * 11.3 + performance.now() * 0.05) * s * 0.85,
      0,
    );
    this.shake *= Math.pow(0.001, dt);
    if (this.shake < 0.0008) this.shake = 0;
    return shakeOffset;
  }

  /** 0–1 slow-mo intensity for trails etc. */
  getSlowMoBoost(): number {
    return this.slowBlend;
  }

  render(): void {
    this.composer.render();
  }
}
