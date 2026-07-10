import type RAPIER from '@dimforge/rapier2d-compat';
import type { BodyDef, DemoId } from '../shared/types.ts';
import type { BodyMeta } from './bodies.ts';
import {
  createDistance,
  createMotorRevolute,
  createRevolute,
  type JointMeta,
} from './joints.ts';

export type SpawnFn = (def: BodyDef) => {
  handle: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  meta: BodyMeta;
};

export interface DemoContext {
  R: typeof RAPIER;
  world: RAPIER.World;
  spawn: SpawnFn;
  bodies: Map<
    string,
    { handle: RAPIER.RigidBody; collider: RAPIER.Collider; meta: BodyMeta }
  >;
  joints: JointMeta[];
  ground: RAPIER.RigidBody;
  groundId: string;
}

function floorAndWalls(ctx: DemoContext): void {
  ctx.spawn({
    kind: 'box',
    x: 0,
    y: -0.5,
    halfW: 18,
    halfH: 0.5,
    bodyType: 'static',
    materialId: 'static',
    zDepth: 1.2,
    color: '#2a3140',
    friction: 0.7,
    restitution: 0.1,
  });
  ctx.spawn({
    kind: 'box',
    x: -12,
    y: 6,
    halfW: 0.4,
    halfH: 8,
    bodyType: 'static',
    materialId: 'static',
    zDepth: 1,
  });
  ctx.spawn({
    kind: 'box',
    x: 12,
    y: 6,
    halfW: 0.4,
    halfH: 8,
    bodyType: 'static',
    materialId: 'static',
    zDepth: 1,
  });
}

export function loadDemo(name: DemoId, ctx: DemoContext): void {
  switch (name) {
    case 'sandbox':
      demoSandbox(ctx);
      break;
    case 'tower':
      demoTower(ctx);
      break;
    case 'dominoes':
      demoDominoes(ctx);
      break;
    case 'newtons-cradle':
      demoNewtonsCradle(ctx);
      break;
    case 'bridge':
      demoBridge(ctx);
      break;
    case 'seesaw':
      demoSeesaw(ctx);
      break;
    case 'catapult':
      demoCatapult(ctx);
      break;
    case 'ramps':
      demoRamps(ctx);
      break;
    case 'chain':
      demoChain(ctx);
      break;
    case 'fireworks':
      demoFireworks(ctx);
      break;
    case 'gears':
      demoGears(ctx);
      break;
    case 'stress':
      demoStress(ctx);
      break;
  }
}

/** Gear tooth outline for render (physics may use circle colliders). */
function gearVerts(
  teeth: number,
  outerR: number,
  innerR: number,
): [number, number][] {
  const verts: [number, number][] = [];
  const n = teeth * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR : innerR;
    verts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return verts;
}

function demoSandbox(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const colors = ['#5cffb0', '#6eb5ff', '#ff8e6e', '#e8d44d', '#c79bff'];
  for (let i = 0; i < 14; i++) {
    const isCircle = i % 2 === 0;
    ctx.spawn({
      kind: isCircle ? 'circle' : 'box',
      x: -4 + (i % 7) * 1.2 + Math.random() * 0.1,
      y: 1.5 + Math.floor(i / 7) * 1.4 + Math.random() * 0.15,
      halfW: 0.35 + Math.random() * 0.15,
      halfH: 0.35 + Math.random() * 0.15,
      radius: 0.32 + Math.random() * 0.12,
      materialId: isCircle ? 'rubber' : 'wood',
      color: colors[i % colors.length],
      zDepth: 0.4 + Math.random() * 0.2,
      restitution: isCircle ? 0.45 : 0.2,
    });
  }
  for (let i = 0; i < 4; i++) {
    ctx.spawn({
      kind: 'circle',
      x: -2 + i * 1.2,
      y: 7 + i * 0.25,
      radius: 0.32,
      materialId: 'neon',
      color: '#5cffb0',
      restitution: 0.7,
    });
  }
}

function demoTower(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const rows = 9;
  const cols = 4;
  const size = 0.42;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const offset = (r % 2) * size * 0.5;
      ctx.spawn({
        kind: 'box',
        x: -1.1 + c * (size * 2.08) + offset,
        y: size + 0.02 + r * (size * 2.08),
        halfW: size,
        halfH: size,
        materialId: r % 3 === 0 ? 'metal' : 'wood',
        color: r % 2 === 0 ? '#c49a6c' : '#a67c52',
        zDepth: 0.5,
        friction: 0.65,
        restitution: 0.05,
        density: 1.1,
      });
    }
  }
  const ball = ctx.spawn({
    kind: 'circle',
    x: -6.5,
    y: 5.5,
    radius: 0.65,
    materialId: 'metal',
    color: '#888899',
    density: 6,
    zDepth: 0.7,
  });
  ctx.joints.push(
    createDistance(
      ctx.R,
      ctx.world,
      ball.handle,
      ctx.ground,
      ball.meta.id,
      ctx.groundId,
      [-6.5, 5.5],
      [-6.5, 9.5],
      4.0,
    ),
  );
  ball.handle.applyImpulse({ x: 22, y: 2 }, true);
}

function demoDominoes(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const n = 14;
  for (let i = 0; i < n; i++) {
    ctx.spawn({
      kind: 'box',
      x: -5.5 + i * 0.8,
      y: 0.85,
      halfW: 0.11,
      halfH: 0.85,
      materialId: 'wood',
      color: i % 2 === 0 ? '#e8a0a0' : '#a0c4e8',
      zDepth: 0.55,
      friction: 0.35,
      restitution: 0.05,
      density: 0.9,
    });
  }
  ctx.spawn({
    kind: 'circle',
    x: -7.2,
    y: 1.0,
    radius: 0.45,
    materialId: 'rubber',
    color: '#5cffb0',
    density: 2.5,
    friction: 0.4,
  }).handle.setLinvel({ x: 7.5, y: 0 }, true);
}

function demoNewtonsCradle(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const n = 5;
  const r = 0.4;
  // Slight gap so they don't start interpenetrating (was jamming cradle)
  const spacing = r * 2.08;
  const startX = -((n - 1) * spacing) / 2;
  const pivotY = 6.2;
  const ballY = 3.2;
  const len = pivotY - ballY;

  const balls: {
    handle: RAPIER.RigidBody;
    meta: BodyMeta;
    restX: number;
  }[] = [];

  for (let i = 0; i < n; i++) {
    const x = startX + i * spacing;
    // Raise first ball BEFORE joint so constraint is consistent
    let bx = x;
    let by = ballY;
    if (i === 0) {
      const angle = -0.95;
      bx = x + Math.sin(angle) * len;
      by = pivotY - Math.cos(angle) * len;
    }
    const ball = ctx.spawn({
      kind: 'circle',
      x: bx,
      y: by,
      radius: r,
      materialId: 'metal',
      color: '#d0d8e8',
      density: 2.2,
      friction: 0.0,
      restitution: 0.98,
      linearDamping: 0.02,
      angularDamping: 0.8,
      zDepth: 0.5,
    });
    balls.push({ handle: ball.handle, meta: ball.meta, restX: x });
  }

  for (const b of balls) {
    ctx.joints.push(
      createRevolute(
        ctx.R,
        ctx.world,
        b.handle,
        ctx.ground,
        b.meta.id,
        ctx.groundId,
        [b.restX, pivotY],
      ),
    );
  }
}

function demoBridge(ctx: DemoContext): void {
  floorAndWalls(ctx);
  // Support pillars under ends (helps stability vs pure pin joints)
  ctx.spawn({
    kind: 'box',
    x: -5.5,
    y: 1.2,
    halfW: 0.35,
    halfH: 1.2,
    bodyType: 'static',
    materialId: 'static',
    color: '#3a4250',
  });
  ctx.spawn({
    kind: 'box',
    x: 5.5,
    y: 1.2,
    halfW: 0.35,
    halfH: 1.2,
    bodyType: 'static',
    materialId: 'static',
    color: '#3a4250',
  });

  const planks = 8;
  const plankW = 0.6;
  const plankH = 0.14;
  const y = 2.55;
  const gap = 0.06;
  const span = planks * (plankW * 2 + gap) - gap;
  const startX = -span / 2 + plankW;
  const handles: { handle: RAPIER.RigidBody; meta: BodyMeta }[] = [];

  for (let i = 0; i < planks; i++) {
    const x = startX + i * (plankW * 2 + gap);
    const p = ctx.spawn({
      kind: 'box',
      x,
      y,
      halfW: plankW,
      halfH: plankH,
      materialId: 'wood',
      color: '#c49a6c',
      density: 0.7,
      friction: 0.7,
      restitution: 0.05,
      zDepth: 0.6,
      angularDamping: 0.4,
      linearDamping: 0.1,
    });
    handles.push(p);
  }

  const left = handles[0];
  const right = handles[handles.length - 1];
  // Pin at plank centers to pillars (more stable)
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      left.handle,
      ctx.ground,
      left.meta.id,
      ctx.groundId,
      [left.handle.translation().x, y],
    ),
  );
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      right.handle,
      ctx.ground,
      right.meta.id,
      ctx.groundId,
      [right.handle.translation().x, y],
    ),
  );

  for (let i = 0; i < handles.length - 1; i++) {
    const a = handles[i];
    const b = handles[i + 1];
    const ax = a.handle.translation().x + plankW;
    const bx = b.handle.translation().x - plankW;
    const midX = (ax + bx) / 2;
    ctx.joints.push(
      createRevolute(ctx.R, ctx.world, a.handle, b.handle, a.meta.id, b.meta.id, [
        midX,
        y,
      ]),
    );
  }

  // Drop weight mid-span after a brief free-fall
  ctx.spawn({
    kind: 'circle',
    x: 0,
    y: 6.5,
    radius: 0.55,
    materialId: 'metal',
    density: 4,
    color: '#666677',
  });
}

function demoSeesaw(ctx: DemoContext): void {
  floorAndWalls(ctx);
  ctx.spawn({
    kind: 'box',
    x: 0,
    y: 0.55,
    halfW: 0.4,
    halfH: 0.55,
    bodyType: 'static',
    materialId: 'static',
    color: '#3a4250',
  });
  const plank = ctx.spawn({
    kind: 'box',
    x: 0,
    y: 1.25,
    halfW: 4.5,
    halfH: 0.14,
    materialId: 'wood',
    color: '#c49a6c',
    density: 0.55,
    friction: 0.7,
    zDepth: 0.7,
  });
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      plank.handle,
      ctx.ground,
      plank.meta.id,
      ctx.groundId,
      [0, 1.25],
    ),
  );
  ctx.spawn({
    kind: 'circle',
    x: -3.2,
    y: 2.8,
    radius: 0.5,
    materialId: 'metal',
    density: 3.5,
    color: '#8899aa',
  });
  ctx.spawn({
    kind: 'box',
    x: 3.0,
    y: 2.4,
    halfW: 0.38,
    halfH: 0.38,
    materialId: 'wood',
    density: 1.0,
    color: '#e8a070',
  });
  ctx.spawn({
    kind: 'circle',
    x: 3.6,
    y: 4.5,
    radius: 0.32,
    materialId: 'neon',
    color: '#5cffb0',
  });
}

function demoCatapult(ctx: DemoContext): void {
  floorAndWalls(ctx);
  // Static base
  ctx.spawn({
    kind: 'box',
    x: -3.5,
    y: 0.35,
    halfW: 1.4,
    halfH: 0.35,
    bodyType: 'static',
    materialId: 'static',
  });

  const pivot: [number, number] = [-3.5, 1.05];
  // Arm: longer throw side to the right
  const arm = ctx.spawn({
    kind: 'box',
    x: -2.0,
    y: 1.05,
    halfW: 2.6,
    halfH: 0.12,
    materialId: 'wood',
    color: '#a67c52',
    density: 0.7,
    zDepth: 0.55,
    friction: 0.5,
  });
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      arm.handle,
      ctx.ground,
      arm.meta.id,
      ctx.groundId,
      pivot,
    ),
  );

  // Counterweight FIXED to short end of arm (was free — broken)
  const cw = ctx.spawn({
    kind: 'circle',
    x: -4.7,
    y: 1.05,
    radius: 0.5,
    materialId: 'metal',
    density: 12,
    color: '#666677',
  });
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      cw.handle,
      arm.handle,
      cw.meta.id,
      arm.meta.id,
      [-4.7, 1.05],
    ),
  );

  // Hold arm cocked with a temporary setup: rotate arm via impulse after rest
  // Projectile in a shallow cup near long tip
  ctx.spawn({
    kind: 'circle',
    x: 0.4,
    y: 1.55,
    radius: 0.32,
    materialId: 'neon',
    color: '#ff8e6e',
    density: 1.2,
    friction: 0.3,
    restitution: 0.1,
  });

  // Kick counterweight down so arm flings (more reliable than pure gravity start)
  cw.handle.applyImpulse({ x: 0, y: -40 }, true);

  // Target
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.spawn({
        kind: 'box',
        x: 6.5 + c * 0.68,
        y: 0.35 + r * 0.68,
        halfW: 0.3,
        halfH: 0.3,
        materialId: 'wood',
        color: r % 2 === 0 ? '#c49a6c' : '#8b6914',
        friction: 0.5,
      });
    }
  }
}

function demoRamps(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const ramps: { x: number; y: number; angle: number; w: number }[] = [
    { x: -6, y: 4.0, angle: -0.4, w: 3.2 },
    { x: -2.2, y: 2.6, angle: 0.42, w: 3.0 },
    { x: 2.2, y: 1.7, angle: -0.32, w: 2.6 },
    { x: 6.0, y: 1.0, angle: 0.22, w: 2.2 },
  ];
  for (const r of ramps) {
    ctx.spawn({
      kind: 'box',
      x: r.x,
      y: r.y,
      halfW: r.w,
      halfH: 0.12,
      angle: r.angle,
      bodyType: 'static',
      materialId: 'static',
      color: '#3d4a60',
      zDepth: 0.9,
      friction: 0.35,
      restitution: 0.3,
    });
  }
  ctx.spawn({
    kind: 'box',
    x: 9.2,
    y: 1.4,
    halfW: 0.2,
    halfH: 1.4,
    bodyType: 'static',
    materialId: 'static',
  });
  const palette = ['#5cffb0', '#6eb5ff', '#ff8e6e', '#e8d44d', '#c79bff'];
  for (let i = 0; i < 10; i++) {
    ctx.spawn({
      kind: 'circle',
      x: -7.8 + (i % 4) * 0.45,
      y: 7.2 + Math.floor(i / 4) * 0.55,
      radius: 0.26 + (i % 3) * 0.04,
      materialId: i % 2 === 0 ? 'neon' : 'rubber',
      color: palette[i % palette.length],
      restitution: 0.55,
      friction: 0.25,
    });
  }
}

function demoChain(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const n = 10;
  const r = 0.26;
  const linkSpacing = r * 2.05;
  const links: { handle: RAPIER.RigidBody; meta: BodyMeta }[] = [];
  const startX = -2.5;
  const topY = 7.2;

  for (let i = 0; i < n; i++) {
    const y = topY - i * linkSpacing;
    const link = ctx.spawn({
      kind: 'circle',
      x: startX,
      y,
      radius: r,
      materialId: i === n - 1 ? 'metal' : 'neon',
      color: i === n - 1 ? '#aab' : i % 2 === 0 ? '#5cffb0' : '#6eb5ff',
      density: i === n - 1 ? 5 : 1.0,
      friction: 0.35,
      restitution: 0.1,
      zDepth: 0.4,
      linearDamping: 0.08,
      angularDamping: 0.15,
    });
    links.push(link);
  }

  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      links[0].handle,
      ctx.ground,
      links[0].meta.id,
      ctx.groundId,
      [startX, topY + 0.15],
    ),
  );

  for (let i = 0; i < links.length - 1; i++) {
    const a = links[i];
    const b = links[i + 1];
    const ay = a.handle.translation().y;
    const by = b.handle.translation().y;
    // Rope length ≈ center distance (was far too short — chain exploded)
    const rest = Math.abs(ay - by) * 0.98;
    ctx.joints.push(
      createDistance(
        ctx.R,
        ctx.world,
        a.handle,
        b.handle,
        a.meta.id,
        b.meta.id,
        [startX, ay - r * 0.2],
        [startX, by + r * 0.2],
        rest,
      ),
    );
  }

  links[n - 1].handle.applyImpulse({ x: 14, y: 2 }, true);

  for (let r0 = 0; r0 < 4; r0++) {
    for (let c = 0; c < 3; c++) {
      ctx.spawn({
        kind: 'box',
        x: 4 + c * 0.62,
        y: 0.32 + r0 * 0.62,
        halfW: 0.28,
        halfH: 0.28,
        materialId: 'wood',
        color: (r0 + c) % 2 === 0 ? '#c49a6c' : '#e8a070',
      });
    }
  }
}

function demoFireworks(ctx: DemoContext): void {
  floorAndWalls(ctx);
  const palette = [
    '#5cffb0',
    '#6eb5ff',
    '#ff8e6e',
    '#e8d44d',
    '#c79bff',
    '#ff6bcb',
    '#ffffff',
  ];

  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 3;
    ctx.spawn({
      kind: 'box',
      x,
      y: 0.55,
      halfW: 0.28,
      halfH: 0.55,
      bodyType: 'static',
      materialId: 'static',
      color: '#2a3140',
      zDepth: 0.5,
    });
    const shell = ctx.spawn({
      kind: 'circle',
      x: x + (Math.random() - 0.5) * 0.05,
      y: 1.35,
      radius: 0.24,
      materialId: 'neon',
      color: palette[i % palette.length],
      density: 0.9,
      restitution: 0.1,
      shell: true,
      zDepth: 0.4,
    });
    shell.handle.setLinvel(
      {
        x: (Math.random() - 0.5) * 1.8,
        y: 11.5 + i * 0.35 + Math.random() * 1.5,
      },
      true,
    );
  }

  for (let i = 0; i < 3; i++) {
    const x = -3 + i * 2.8;
    const shell = ctx.spawn({
      kind: 'circle',
      x,
      y: 3.5 + Math.random(),
      radius: 0.22,
      materialId: 'neon',
      color: palette[(i + 3) % palette.length],
      density: 0.75,
      shell: true,
      zDepth: 0.35,
    });
    shell.handle.setLinvel(
      {
        x: (Math.random() - 0.5) * 2.5,
        y: 7 + Math.random() * 2,
      },
      true,
    );
  }

  ctx.spawn({
    kind: 'box',
    x: 0,
    y: 0.15,
    halfW: 10,
    halfH: 0.12,
    bodyType: 'static',
    materialId: 'static',
    color: '#1a2030',
    restitution: 0.4,
  });
}

/**
 * Circle colliders (stable) + tooth verts for render visualHint.
 * Polygon teeth were jamming / exploding the train.
 */
function demoGears(ctx: DemoContext): void {
  floorAndWalls(ctx);

  const y = 3.0;
  // Pitch radii — centers at r1+r2 for clean circle mesh
  const r1 = 1.05;
  const r2 = 0.7;
  const r3 = 1.25;
  const tooth = 0.16;

  const g1x = -3.0;
  const g2x = g1x + r1 + r2;
  const g3x = g2x + r2 + r3;

  const drive = ctx.spawn({
    kind: 'circle',
    x: g1x,
    y,
    radius: r1 * 0.92,
    vertices: gearVerts(14, r1, r1 - tooth),
    materialId: 'metal',
    color: '#c0c8d4',
    density: 2.0,
    friction: 0.98,
    restitution: 0.0,
    angularDamping: 0.25,
    zDepth: 0.55,
    visualHint: 'motor',
  });
  ctx.joints.push(
    createMotorRevolute(
      ctx.R,
      ctx.world,
      drive.handle,
      ctx.ground,
      drive.meta.id,
      ctx.groundId,
      [g1x, y],
      1.8,
      10,
    ),
  );

  const mid = ctx.spawn({
    kind: 'circle',
    x: g2x,
    y,
    radius: r2 * 0.92,
    vertices: gearVerts(10, r2, r2 - tooth * 0.9),
    materialId: 'metal',
    color: '#8a9bb0',
    density: 1.6,
    friction: 0.98,
    restitution: 0.0,
    angularDamping: 0.2,
    zDepth: 0.5,
    visualHint: 'gear',
  });
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      mid.handle,
      ctx.ground,
      mid.meta.id,
      ctx.groundId,
      [g2x, y],
    ),
  );

  const big = ctx.spawn({
    kind: 'circle',
    x: g3x,
    y,
    radius: r3 * 0.92,
    vertices: gearVerts(18, r3, r3 - tooth),
    materialId: 'metal',
    color: '#a8b4c4',
    density: 2.2,
    friction: 0.98,
    restitution: 0.0,
    angularDamping: 0.2,
    zDepth: 0.6,
    visualHint: 'gear',
  });
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      big.handle,
      ctx.ground,
      big.meta.id,
      ctx.groundId,
      [g3x, y],
    ),
  );

  // Flapper on big gear
  const armLen = r3 * 0.7;
  const arm = ctx.spawn({
    kind: 'box',
    x: g3x + armLen * 0.55,
    y,
    halfW: armLen * 0.55,
    halfH: 0.13,
    materialId: 'wood',
    color: '#c49a6c',
    density: 0.8,
    friction: 0.7,
    zDepth: 0.45,
    visualHint: 'paddle',
  });
  ctx.joints.push(
    createRevolute(
      ctx.R,
      ctx.world,
      arm.handle,
      big.handle,
      arm.meta.id,
      big.meta.id,
      [g3x + 0.2, y],
    ),
  );

  for (const x of [g1x, g2x, g3x]) {
    ctx.spawn({
      kind: 'circle',
      x,
      y,
      radius: 0.16,
      bodyType: 'static',
      materialId: 'metal',
      color: '#5cffb0',
      zDepth: 0.75,
    });
  }

  const hues = ['#5cffb0', '#6eb5ff', '#ff8e6e', '#e8d44d', '#c79bff'];
  for (let i = 0; i < 8; i++) {
    ctx.spawn({
      kind: 'circle',
      x: g3x - 0.4 + (i % 3) * 0.4,
      y: 6.2 + Math.floor(i / 3) * 0.45,
      radius: 0.2,
      materialId: 'neon',
      color: hues[i % hues.length],
      density: 0.65,
      restitution: 0.4,
      zDepth: 0.35,
    });
  }

  ctx.spawn({
    kind: 'box',
    x: 9,
    y: 1.4,
    halfW: 0.2,
    halfH: 1.4,
    bodyType: 'static',
    materialId: 'static',
    color: '#3a4250',
  });
  ctx.spawn({
    kind: 'box',
    x: 7.5,
    y: 0.35,
    halfW: 1.8,
    halfH: 0.15,
    angle: -0.12,
    bodyType: 'static',
    materialId: 'static',
    color: '#2a3140',
  });
}

function demoStress(ctx: DemoContext): void {
  ctx.spawn({
    kind: 'box',
    x: 0,
    y: -0.5,
    halfW: 20,
    halfH: 0.5,
    bodyType: 'static',
    materialId: 'static',
    zDepth: 1.2,
    color: '#2a3140',
  });
  ctx.spawn({
    kind: 'box',
    x: -14,
    y: 5,
    halfW: 0.4,
    halfH: 7,
    bodyType: 'static',
    materialId: 'static',
    zDepth: 1,
  });
  ctx.spawn({
    kind: 'box',
    x: 14,
    y: 5,
    halfW: 0.4,
    halfH: 7,
    bodyType: 'static',
    materialId: 'static',
    zDepth: 1,
  });
  ctx.spawn({
    kind: 'box',
    x: 0,
    y: 14,
    halfW: 16,
    halfH: 0.3,
    bodyType: 'static',
    materialId: 'static',
    color: '#1a2030',
  });

  const hues = [
    '#5cffb0',
    '#6eb5ff',
    '#ff8e6e',
    '#e8d44d',
    '#c79bff',
    '#c49a6c',
    '#e07070',
    '#8899aa',
  ];
  const mats = ['wood', 'rubber', 'metal', 'neon', 'matte'] as const;
  const N = 250;

  for (let i = 0; i < N; i++) {
    const isCircle = i % 3 !== 0;
    const col = (i % 16) - 7.5;
    const row = Math.floor(i / 16);
    const x = col * 0.55 + (Math.random() - 0.5) * 0.06;
    const y = 1.2 + row * 0.5 + Math.random() * 0.04;
    const mat = mats[i % mats.length];
    const color = hues[i % hues.length];

    if (isCircle) {
      ctx.spawn({
        kind: 'circle',
        x,
        y,
        radius: 0.18 + (i % 4) * 0.02,
        materialId: mat,
        color,
        density: 0.8,
        restitution: 0.2 + (i % 5) * 0.04,
        friction: 0.4,
        zDepth: 0.3,
        linearDamping: 0.1,
        angularDamping: 0.1,
      });
    } else {
      const s = 0.16 + (i % 3) * 0.03;
      ctx.spawn({
        kind: 'box',
        x,
        y,
        halfW: s,
        halfH: s,
        angle: (i % 5) * 0.12,
        materialId: mat === 'neon' ? 'wood' : mat,
        color,
        density: 0.9,
        restitution: 0.12,
        friction: 0.5,
        zDepth: 0.32,
        linearDamping: 0.1,
        angularDamping: 0.1,
      });
    }
  }
}

export const DEMO_IDS: DemoId[] = [
  'sandbox',
  'tower',
  'dominoes',
  'newtons-cradle',
  'bridge',
  'seesaw',
  'catapult',
  'ramps',
  'chain',
  'fireworks',
  'gears',
  'stress',
];
