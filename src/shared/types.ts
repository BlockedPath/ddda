/** Shared bridge contract — physics ↔ render. Do not import physics/render internals here. */

export type BodyId = string;

export type BodyKind = 'box' | 'circle' | 'polygon' | 'capsule';

export type MaterialId =
  | 'matte'
  | 'metal'
  | 'glass'
  | 'neon'
  | 'wood'
  | 'rubber'
  | 'static';

export type DemoId =
  | 'sandbox'
  | 'tower'
  | 'dominoes'
  | 'newtons-cradle'
  | 'bridge'
  | 'seesaw'
  | 'catapult'
  | 'ramps'
  | 'chain'
  | 'fireworks'
  | 'gears'
  | 'stress';

export type ToolMode =
  | 'grab'
  | 'spawn-box'
  | 'spawn-circle'
  | 'pin'
  | 'delete'
  | 'explode'
  | 'paint';

export interface BodySnapshot {
  id: BodyId;
  kind: BodyKind;
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
  /** Half-extents for box */
  halfW?: number;
  halfH?: number;
  /** Radius for circle / capsule radius */
  radius?: number;
  /** Capsule half-height (along local Y) */
  halfHeight?: number;
  /** Local-space vertices for polygon */
  vertices?: [number, number][];
  /** Extrusion depth for 3D presentation */
  zDepth: number;
  materialId: MaterialId;
  color?: string;
  sleeping: boolean;
  /** Static / kinematic / dynamic */
  bodyType: 'static' | 'dynamic' | 'kinematic';
  /** Grabbed, pinned-target, or selected — render should glow */
  highlighted?: boolean;
  /**
   * Optional visual role for render polish (gears demo).
   * Physics may still use circle/polygon colliders.
   */
  visualHint?: 'gear' | 'motor' | 'paddle';
}

export type JointKind = 'revolute' | 'distance' | 'fixed';

export interface JointSnapshot {
  id: string;
  kind: JointKind;
  anchorA: [number, number];
  anchorB: [number, number];
  bodyA: BodyId;
  bodyB: BodyId | null;
}

export interface ContactEvent {
  bodyA: BodyId;
  bodyB: BodyId;
  point: [number, number];
  normal: [number, number];
  impulse: number;
}

/** Firework shell detonation — render confetti/sparks here */
export interface BurstEvent {
  x: number;
  y: number;
  power: number;
  color?: string;
}

export interface PhysicsSnapshot {
  t: number;
  bodies: BodySnapshot[];
  joints: JointSnapshot[];
  contacts: ContactEvent[];
  /** This frame's firework detonations (may be empty) */
  bursts: BurstEvent[];
  /** 0 = paused, 1 = normal, 0.25 = slow-mo */
  timeScale: number;
  paused: boolean;
  gravityY: number;
  /** Currently grabbed or selected body */
  activeBodyId: BodyId | null;
}

export interface BodyDef {
  kind: BodyKind;
  x: number;
  y: number;
  angle?: number;
  halfW?: number;
  halfH?: number;
  radius?: number;
  halfHeight?: number;
  vertices?: [number, number][];
  zDepth?: number;
  materialId?: MaterialId;
  color?: string;
  density?: number;
  friction?: number;
  restitution?: number;
  bodyType?: 'static' | 'dynamic' | 'kinematic';
  /** Linear damping */
  linearDamping?: number;
  angularDamping?: number;
  /** Firework shell — detonates near apex (physics) */
  shell?: boolean;
  visualHint?: 'gear' | 'motor' | 'paddle';
}

export interface Hit {
  bodyId: BodyId;
  point: [number, number];
  normal: [number, number];
  toi: number;
}

export interface PhysicsWorldApi {
  step(dt: number): PhysicsSnapshot;
  spawn(def: BodyDef): BodyId;
  remove(id: BodyId): void;
  applyImpulse(
    id: BodyId,
    ix: number,
    iy: number,
    px?: number,
    py?: number,
  ): void;
  setPointerGrab(worldX: number, worldY: number): void;
  releasePointerGrab(): void;
  /** Pin dynamic body under point to world with a revolute joint */
  pinAt(worldX: number, worldY: number): BodyId | null;
  /**
   * Pick nearest body under point.
   * @param includeStatic paint tool may recolor static geometry
   */
  pickBody(
    worldX: number,
    worldY: number,
    includeStatic?: boolean,
  ): BodyId | null;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  setTimeScale(scale: number): void;
  getTimeScale(): number;
  setGravity(y: number): void;
  getGravity(): number;
  loadDemo(name: DemoId): void;
  raycast(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): Hit | null;
  getDemoNames(): DemoId[];
  clear(): void;
  peek(): PhysicsSnapshot;
  /** Fireworks: launch a shell rocket that detonates near apex */
  launchShell(x: number, y: number, color?: string): BodyId;
  /** Recolor / rematerialize a body (paint tool + palette) */
  setBodyAppearance(
    id: BodyId,
    appearance: { materialId?: MaterialId; color?: string },
  ): boolean;
}
