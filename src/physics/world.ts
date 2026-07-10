import RAPIER from '@dimforge/rapier2d-compat';
import type {
  BodyDef,
  BodyId,
  BodySnapshot,
  BurstEvent,
  ContactEvent,
  DemoId,
  Hit,
  MaterialId,
  PhysicsSnapshot,
  PhysicsWorldApi,
} from '../shared/types.ts';
import {
  createBody,
  resetBodyIds,
  type BodyMeta,
} from './bodies.ts';
import { DEMO_IDS, loadDemo, type DemoContext } from './demos.ts';
import {
  createDistance,
  jointToSnapshot,
  resetJointIds,
  type JointMeta,
} from './joints.ts';
import { DEFAULT_COLORS, materialProps } from './materials.ts';
import type { SceneFile } from './serialize.ts';
import { snapshotToScene } from './serialize.ts';

type BodyEntry = {
  handle: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  meta: BodyMeta;
};

export class PhysicsWorld implements PhysicsWorldApi {
  private R!: typeof RAPIER;
  private world!: RAPIER.World;
  private bodies = new Map<BodyId, BodyEntry>();
  private joints: JointMeta[] = [];
  private colliderToBody = new Map<number, BodyId>();
  private t = 0;
  private ready = false;
  private ground!: RAPIER.RigidBody;
  private groundId: BodyId = 'ground0';
  private grab: {
    joint: RAPIER.ImpulseJoint | null;
    bodyId: BodyId | null;
    target: { x: number; y: number };
  } = { joint: null, bodyId: null, target: { x: 0, y: 0 } };
  private grabBody: RAPIER.RigidBody | null = null;
  private eventQueue!: RAPIER.EventQueue;
  private pendingContacts: ContactEvent[] = [];
  private paused = false;
  private timeScale = 1;
  private gravityY = -9.81;
  private selectedId: BodyId | null = null;
  private stepAccumulator = 0;
  private shellIds = new Set<BodyId>();
  private pendingBursts: BurstEvent[] = [];
  private shellColors = new Map<BodyId, string>();

  async init(): Promise<void> {
    await RAPIER.init();
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: this.gravityY });
    this.world.timestep = 1 / 60;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.ensureGround();
    this.ready = true;
    this.loadDemo('sandbox');
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, Math.min(2, scale));
  }

  getTimeScale(): number {
    return this.timeScale;
  }

  setGravity(y: number): void {
    this.gravityY = y;
    if (this.world) {
      this.world.gravity = { x: 0, y };
      // Wake all dynamics so new gravity applies immediately
      for (const [id, entry] of this.bodies) {
        if (id === this.groundId) continue;
        if (entry.meta.bodyType === 'dynamic') entry.handle.wakeUp();
      }
    }
  }

  getGravity(): number {
    return this.gravityY;
  }

  pinAt(worldX: number, worldY: number): BodyId | null {
    const id = this.pickBody(worldX, worldY);
    if (!id) return null;
    const entry = this.bodies.get(id);
    if (!entry || entry.meta.bodyType !== 'dynamic') return null;
    return this.pinBodyAt(entry, worldX, worldY);
  }

  private pinBodyAt(
    entry: BodyEntry,
    worldX: number,
    worldY: number,
  ): BodyId {
    const aPos = entry.handle.translation();
    const localA = {
      x: worldX - aPos.x,
      y: worldY - aPos.y,
    };
    const localB = { x: worldX, y: worldY };
    // Anchor to ground at world point (ground at origin: local = world)
    const params = this.R.JointData.revolute(localA, localB);
    const handle = this.world.createImpulseJoint(
      params,
      entry.handle,
      this.ground,
      true,
    );
    this.joints.push({
      id: `pin-${entry.meta.id}-${this.joints.length}`,
      kind: 'revolute',
      bodyA: entry.meta.id,
      bodyB: this.groundId,
      localA: [localA.x, localA.y],
      localB: [localB.x, localB.y],
      handle,
    });
    entry.handle.wakeUp();
    this.selectedId = entry.meta.id;
    return entry.meta.id;
  }

  private ensureGround(): void {
    // Invisible fixed body at origin for pinning joints to "world"
    const desc = this.R.RigidBodyDesc.fixed().setTranslation(0, 0);
    this.ground = this.world.createRigidBody(desc);
    // no collider — pure anchor
    this.bodies.set(this.groundId, {
      handle: this.ground,
      collider: null as unknown as RAPIER.Collider,
      meta: {
        id: this.groundId,
        kind: 'box',
        halfW: 0,
        halfH: 0,
        zDepth: 0,
        materialId: 'static',
        color: '#000000',
        bodyType: 'static',
      },
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  getDemoNames(): DemoId[] {
    return [...DEMO_IDS];
  }

  clear(): void {
    this.releasePointerGrab();

    for (const j of this.joints) {
      this.world.removeImpulseJoint(j.handle, true);
    }
    this.joints = [];

    for (const [id, entry] of this.bodies) {
      if (id === this.groundId) continue;
      this.world.removeRigidBody(entry.handle);
    }
    // Keep ground anchor body across clears
    const groundEntry = this.bodies.get(this.groundId);
    this.bodies.clear();
    this.colliderToBody.clear();
    this.pendingContacts = [];
    this.pendingBursts = [];
    this.shellIds.clear();
    this.shellColors.clear();
    resetBodyIds();
    resetJointIds();
    if (groundEntry) {
      this.bodies.set(this.groundId, groundEntry);
      this.ground = groundEntry.handle;
    } else {
      this.ensureGround();
    }
  }

  /** Latest body list without advancing the world (for tools). */
  peek(): PhysicsSnapshot {
    return this.snapshot();
  }

  loadDemo(name: DemoId): void {
    if (!this.ready) return;
    this.clear();
    this.selectedId = null;
    const ctx: DemoContext = {
      R: this.R,
      world: this.world,
      bodies: this.bodies,
      joints: this.joints,
      ground: this.ground,
      groundId: this.groundId,
      spawn: (def) => this.spawnInternal(def),
    };
    loadDemo(name, ctx);
  }

  exportScene(demo?: DemoId): SceneFile {
    const snap = this.snapshot();
    return snapshotToScene(snap.bodies, snap.joints, this.gravityY, demo);
  }

  loadScene(scene: SceneFile): void {
    if (!this.ready) return;
    this.clear();
    this.selectedId = null;
    this.setGravity(scene.gravityY ?? -9.81);

    const spawned: BodyEntry[] = [];
    for (const def of scene.bodies) {
      spawned.push(this.spawnInternal(def));
    }

    for (const pin of scene.pins ?? []) {
      const entry = spawned[pin.bodyIndex];
      if (entry && entry.meta.bodyType === 'dynamic') {
        this.pinBodyAt(entry, pin.x, pin.y);
      }
    }

    for (const rope of scene.ropes ?? []) {
      const a = spawned[rope.a];
      const b = spawned[rope.b];
      if (!a || !b) continue;
      const joint = createDistance(
        this.R,
        this.world,
        a.handle,
        b.handle,
        a.meta.id,
        b.meta.id,
        [rope.ax, rope.ay],
        [rope.bx, rope.by],
        rope.length,
      );
      this.joints.push(joint);
    }
  }

  spawn(def: BodyDef): BodyId {
    return this.spawnInternal(def).meta.id;
  }

  private spawnInternal(def: BodyDef): BodyEntry {
    const created = createBody(this.R, this.world, def);
    // Enable contact force events for dynamic colliders
    created.collider.setActiveEvents(this.R.ActiveEvents.CONTACT_FORCE_EVENTS);
    created.collider.setContactForceEventThreshold(0.5);

    const entry: BodyEntry = {
      handle: created.handle,
      collider: created.collider,
      meta: created.meta,
    };
    this.bodies.set(created.meta.id, entry);
    this.colliderToBody.set(created.collider.handle, created.meta.id);
    if (created.meta.shell) {
      this.shellIds.add(created.meta.id);
      this.shellColors.set(created.meta.id, created.meta.color);
    }
    return entry;
  }

  remove(id: BodyId): void {
    if (id === this.groundId) return;
    const entry = this.bodies.get(id);
    if (!entry) return;
    if (this.grab.bodyId === id) this.releasePointerGrab();
    this.shellIds.delete(id);
    this.shellColors.delete(id);
    // remove joints involving body
    this.joints = this.joints.filter((j) => {
      if (j.bodyA === id || j.bodyB === id) {
        this.world.removeImpulseJoint(j.handle, true);
        return false;
      }
      return true;
    });
    this.colliderToBody.delete(entry.collider.handle);
    this.world.removeRigidBody(entry.handle);
    this.bodies.delete(id);
  }

  applyImpulse(
    id: BodyId,
    ix: number,
    iy: number,
    px?: number,
    py?: number,
  ): void {
    const entry = this.bodies.get(id);
    if (!entry || entry.meta.bodyType !== 'dynamic') return;
    if (px !== undefined && py !== undefined) {
      const t = entry.handle.translation();
      entry.handle.applyImpulseAtPoint(
        { x: ix, y: iy },
        { x: px, y: py },
        true,
      );
      void t;
    } else {
      entry.handle.applyImpulse({ x: ix, y: iy }, true);
    }
  }

  setPointerGrab(worldX: number, worldY: number): void {
    this.grab.target = { x: worldX, y: worldY };

    if (this.grab.joint && this.grabBody) {
      // Update kinematic grab body position
      this.grabBody.setNextKinematicTranslation({ x: worldX, y: worldY });
      return;
    }

    // Find nearest dynamic body under point (small AABB)
    const hit = this.pickBody(worldX, worldY);
    if (!hit) return;

    const entry = this.bodies.get(hit)!;
    // Kinematic target + soft spring so throws feel natural on release
    const kDesc = this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(
      worldX,
      worldY,
    );
    this.grabBody = this.world.createRigidBody(kDesc);

    const aPos = entry.handle.translation();
    const localA = { x: worldX - aPos.x, y: worldY - aPos.y };
    const localB = { x: 0, y: 0 };
    const params = this.R.JointData.spring(
      0,
      80,
      12,
      localA,
      localB,
    );
    const joint = this.world.createImpulseJoint(
      params,
      entry.handle,
      this.grabBody,
      true,
    );

    // Wake body and damp spin while held
    entry.handle.wakeUp();
    this.grab.joint = joint;
    this.grab.bodyId = hit;
  }

  releasePointerGrab(): void {
    if (this.grab.joint) {
      this.world.removeImpulseJoint(this.grab.joint, true);
      this.grab.joint = null;
    }
    if (this.grabBody) {
      this.world.removeRigidBody(this.grabBody);
      this.grabBody = null;
    }
    this.grab.bodyId = null;
  }

  pickBody(
    x: number,
    y: number,
    includeStatic = false,
  ): BodyId | null {
    let best: BodyId | null = null;
    let bestDist = Infinity;
    for (const [id, entry] of this.bodies) {
      if (id === this.groundId) continue;
      // Skip invisible ground-size helpers
      if (entry.meta.halfW === 0 && entry.meta.halfH === 0 && !entry.meta.radius) {
        continue;
      }
      if (!includeStatic && entry.meta.bodyType !== 'dynamic') continue;
      const t = entry.handle.translation();
      let r = 0.5;
      if (entry.meta.radius) r = entry.meta.radius * 1.5;
      else if (entry.meta.halfW && entry.meta.halfH) {
        r = Math.hypot(entry.meta.halfW, entry.meta.halfH);
      }
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < r && d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    if (best) this.selectedId = best;
    return best;
  }

  raycast(x0: number, y0: number, x1: number, y1: number): Hit | null {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ray = new this.R.Ray({ x: x0, y: y0 }, { x: dx / len, y: dy / len });
    const hit = this.world.castRay(ray, len, true);
    if (!hit) return null;
    const collider = hit.collider;
    const bodyId = this.colliderToBody.get(collider.handle);
    if (!bodyId) return null;
    const point = ray.pointAt(hit.timeOfImpact);
    return {
      bodyId,
      point: [point.x, point.y],
      normal: [0, 1],
      toi: hit.timeOfImpact,
    };
  }

  step(dt: number): PhysicsSnapshot {
    if (!this.ready) {
      return {
        t: this.t,
        bodies: [],
        joints: [],
        contacts: [],
        bursts: [],
        timeScale: this.timeScale,
        paused: this.paused,
        gravityY: this.gravityY,
        activeBodyId: null,
      };
    }

    this.pendingContacts = [];
    this.pendingBursts = [];

    if (!this.paused && this.timeScale > 0) {
      const fixed = 1 / 60;
      this.stepAccumulator += Math.min(dt, 0.05) * this.timeScale;
      // Cap substeps to avoid spiral of death
      let steps = 0;
      while (this.stepAccumulator >= fixed && steps < 8) {
        this.world.step(this.eventQueue);
        this.collectContacts();
        this.processShells();
        this.stepAccumulator -= fixed;
        this.t += fixed;
        steps++;
      }
    }

    return this.snapshot();
  }

  /** Detonate shells near apex into spark bodies + BurstEvent for VFX */
  private processShells(): void {
    const toBurst: BodyId[] = [];
    for (const id of this.shellIds) {
      const entry = this.bodies.get(id);
      if (!entry) {
        toBurst.push(id);
        continue;
      }
      const t = entry.handle.translation();
      const v = entry.handle.linvel();
      // Apex: high enough and starting to fall (or hanging)
      if (t.y >= 5.5 && v.y <= 1.2) {
        toBurst.push(id);
      }
    }

    for (const id of toBurst) {
      const entry = this.bodies.get(id);
      this.shellIds.delete(id);
      if (!entry) continue;
      const t = entry.handle.translation();
      const color = this.shellColors.get(id) ?? entry.meta.color;
      this.shellColors.delete(id);
      const power = 14 + Math.random() * 8;

      this.pendingBursts.push({
        x: t.x,
        y: t.y,
        power,
        color,
      });

      // Remove shell first
      this.colliderToBody.delete(entry.collider.handle);
      this.world.removeRigidBody(entry.handle);
      this.bodies.delete(id);

      // Spawn sparklets
      const n = 10 + Math.floor(Math.random() * 6);
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 4 + Math.random() * 7;
        const spark = this.spawnInternal({
          kind: Math.random() > 0.45 ? 'circle' : 'box',
          x: t.x,
          y: t.y,
          halfW: 0.1 + Math.random() * 0.08,
          halfH: 0.1 + Math.random() * 0.08,
          radius: 0.1 + Math.random() * 0.08,
          materialId: 'neon',
          color:
            i % 3 === 0
              ? color
              : ['#5cffb0', '#6eb5ff', '#ff8e6e', '#e8d44d', '#c79bff'][
                  i % 5
                ],
          density: 0.35,
          restitution: 0.55,
          friction: 0.2,
          linearDamping: 0.15,
          zDepth: 0.25,
        });
        spark.handle.setLinvel(
          {
            x: Math.cos(ang) * speed,
            y: Math.sin(ang) * speed + 2,
          },
          true,
        );
      }
    }
  }

  private collectContacts(): void {
    this.eventQueue.drainContactForceEvents((event) => {
      const c1 = event.collider1();
      const c2 = event.collider2();
      const idA = this.colliderToBody.get(c1);
      const idB = this.colliderToBody.get(c2);
      if (!idA || !idB) return;
      const force = event.totalForce();
      const mag = Math.hypot(force.x, force.y);
      // Approximate contact point as midpoint of body centers
      const a = this.bodies.get(idA)?.handle.translation();
      const b = this.bodies.get(idB)?.handle.translation();
      if (!a || !b) return;
      this.pendingContacts.push({
        bodyA: idA,
        bodyB: idB,
        point: [(a.x + b.x) / 2, (a.y + b.y) / 2],
        normal: [force.x / (mag || 1), force.y / (mag || 1)],
        impulse: mag * (1 / 60),
      });
    });
  }

  private snapshot(): PhysicsSnapshot {
    const bodies: BodySnapshot[] = [];
    for (const [id, entry] of this.bodies) {
      if (id === this.groundId) continue;
      // Skip zero-size ground helpers
      if (entry.meta.halfW === 0 && entry.meta.halfH === 0 && !entry.meta.radius) {
        continue;
      }
      const t = entry.handle.translation();
      const lin = entry.handle.linvel();
      const ang = entry.handle.angvel();
      const active =
        entry.meta.id === this.grab.bodyId ||
        entry.meta.id === this.selectedId;
      bodies.push({
        id: entry.meta.id,
        kind: entry.meta.kind,
        x: t.x,
        y: t.y,
        angle: entry.handle.rotation(),
        vx: lin.x,
        vy: lin.y,
        omega: ang,
        halfW: entry.meta.halfW,
        halfH: entry.meta.halfH,
        radius: entry.meta.radius,
        halfHeight: entry.meta.halfHeight,
        // Vertices used for gear visual even when collider is a circle
        vertices: entry.meta.vertices,
        zDepth: entry.meta.zDepth,
        materialId: entry.meta.materialId,
        color: entry.meta.color,
        sleeping: entry.handle.isSleeping(),
        bodyType: entry.meta.bodyType,
        highlighted: active,
        visualHint: entry.meta.visualHint,
      });
    }

    const joints = this.joints.map((j) => {
      const a = this.bodies.get(j.bodyA)?.handle;
      const b = j.bodyB ? this.bodies.get(j.bodyB)?.handle ?? null : this.ground;
      if (!a) {
        return {
          id: j.id,
          kind: j.kind,
          anchorA: j.localA,
          anchorB: j.localB,
          bodyA: j.bodyA,
          bodyB: j.bodyB,
        };
      }
      return jointToSnapshot(j, a, b ?? null);
    });

    const contacts = this.pendingContacts.splice(0);
    const bursts = this.pendingBursts.splice(0);
    const activeBodyId = this.grab.bodyId ?? this.selectedId;

    return {
      t: this.t,
      bodies,
      joints,
      contacts,
      bursts,
      timeScale: this.timeScale,
      paused: this.paused,
      gravityY: this.gravityY,
      activeBodyId,
    };
  }

  setBodyAppearance(
    id: BodyId,
    appearance: { materialId?: MaterialId; color?: string },
  ): boolean {
    const entry = this.bodies.get(id);
    if (!entry || id === this.groundId) return false;
    // Skip pure anchor helpers
    if (entry.meta.halfW === 0 && entry.meta.halfH === 0 && !entry.meta.radius) {
      return false;
    }

    if (appearance.materialId) {
      entry.meta.materialId = appearance.materialId;
      const mat = materialProps(appearance.materialId);
      if (entry.collider) {
        entry.collider.setFriction(mat.friction);
        entry.collider.setRestitution(mat.restitution);
        if (entry.meta.bodyType === 'dynamic' && mat.density > 0) {
          entry.collider.setDensity(mat.density);
        }
      }
      if (appearance.color === undefined) {
        entry.meta.color =
          DEFAULT_COLORS[appearance.materialId] ?? entry.meta.color;
      }
    }

    if (appearance.color !== undefined) {
      entry.meta.color = appearance.color;
      if (this.shellColors.has(id)) this.shellColors.set(id, appearance.color);
    }

    this.selectedId = id;
    if (entry.meta.bodyType === 'dynamic') entry.handle.wakeUp();
    return true;
  }

  /** Manual shell launch — useful for boom tool on fireworks demo */
  launchShell(x: number, y: number, color?: string): BodyId {
    const palette = ['#5cffb0', '#6eb5ff', '#ff8e6e', '#e8d44d', '#c79bff', '#ff6bcb'];
    const c = color ?? palette[Math.floor(Math.random() * palette.length)];
    const entry = this.spawnInternal({
      kind: 'circle',
      x,
      y,
      radius: 0.28,
      materialId: 'neon',
      color: c,
      density: 0.8,
      restitution: 0.2,
      shell: true,
      zDepth: 0.4,
    });
    entry.handle.setLinvel(
      {
        x: (Math.random() - 0.5) * 3,
        y: 11 + Math.random() * 4,
      },
      true,
    );
    return entry.meta.id;
  }
}

export async function createPhysicsWorld(): Promise<PhysicsWorld> {
  const w = new PhysicsWorld();
  await w.init();
  return w;
}
