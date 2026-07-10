import type RAPIER from '@dimforge/rapier2d-compat';
import type { BodyDef, BodyId, BodyKind, MaterialId } from '../shared/types.ts';
import { DEFAULT_COLORS, materialProps } from './materials.ts';

export interface BodyMeta {
  id: BodyId;
  kind: BodyKind;
  halfW?: number;
  halfH?: number;
  radius?: number;
  halfHeight?: number;
  vertices?: [number, number][];
  zDepth: number;
  materialId: MaterialId;
  color: string;
  bodyType: 'static' | 'dynamic' | 'kinematic';
  /** Firework shell — detonates near apex */
  shell?: boolean;
  visualHint?: 'gear' | 'motor' | 'paddle';
}

let nextId = 1;

export function allocBodyId(prefix = 'b'): BodyId {
  return `${prefix}${nextId++}`;
}

export function resetBodyIds(): void {
  nextId = 1;
}

export function createBody(
  R: typeof RAPIER,
  world: RAPIER.World,
  def: BodyDef,
): { handle: RAPIER.RigidBody; collider: RAPIER.Collider; meta: BodyMeta } {
  const materialId = def.materialId ?? (def.bodyType === 'static' ? 'static' : 'matte');
  const mat = materialProps(materialId);
  const density = def.density ?? mat.density;
  const friction = def.friction ?? mat.friction;
  const restitution = def.restitution ?? mat.restitution;
  const bodyType = def.bodyType ?? 'dynamic';
  const zDepth = def.zDepth ?? 0.45;
  const color = def.color ?? DEFAULT_COLORS[materialId] ?? '#8899aa';
  const id = allocBodyId();

  let desc: RAPIER.RigidBodyDesc;
  if (bodyType === 'static') {
    desc = R.RigidBodyDesc.fixed();
  } else if (bodyType === 'kinematic') {
    desc = R.RigidBodyDesc.kinematicPositionBased();
  } else {
    desc = R.RigidBodyDesc.dynamic()
      .setLinearDamping(def.linearDamping ?? 0.05)
      .setAngularDamping(def.angularDamping ?? 0.05);
  }

  desc.setTranslation(def.x, def.y).setRotation(def.angle ?? 0);
  const handle = world.createRigidBody(desc);

  const kind = def.kind;
  let colliderDesc: RAPIER.ColliderDesc;
  const meta: BodyMeta = {
    id,
    kind,
    zDepth,
    materialId,
    color,
    bodyType,
    shell: def.shell === true,
    visualHint: def.visualHint,
  };

  switch (kind) {
    case 'box': {
      const hw = def.halfW ?? 0.5;
      const hh = def.halfH ?? 0.5;
      meta.halfW = hw;
      meta.halfH = hh;
      colliderDesc = R.ColliderDesc.cuboid(hw, hh);
      break;
    }
    case 'circle': {
      const r = def.radius ?? 0.4;
      meta.radius = r;
      // Optional vertices retained for render-only gear outlines
      if (def.vertices) meta.vertices = def.vertices;
      colliderDesc = R.ColliderDesc.ball(r);
      break;
    }
    case 'capsule': {
      const r = def.radius ?? 0.25;
      const hh = def.halfHeight ?? 0.5;
      meta.radius = r;
      meta.halfHeight = hh;
      colliderDesc = R.ColliderDesc.capsule(hh, r);
      break;
    }
    case 'polygon': {
      const verts = def.vertices ?? [
        [-0.5, -0.4],
        [0.5, -0.4],
        [0, 0.5],
      ];
      meta.vertices = verts;
      const flat = new Float32Array(verts.length * 2);
      for (let i = 0; i < verts.length; i++) {
        flat[i * 2] = verts[i][0];
        flat[i * 2 + 1] = verts[i][1];
      }
      const poly = R.ColliderDesc.convexHull(flat);
      if (!poly) {
        colliderDesc = R.ColliderDesc.cuboid(0.5, 0.5);
        meta.kind = 'box';
        meta.halfW = 0.5;
        meta.halfH = 0.5;
      } else {
        colliderDesc = poly;
      }
      break;
    }
  }

  colliderDesc.setFriction(friction).setRestitution(restitution);
  if (bodyType === 'dynamic') {
    colliderDesc.setDensity(density > 0 ? density : 1);
  }

  // Encode body id index in userData via a map outside; use collider handle later
  const collider = world.createCollider(colliderDesc, handle);

  return { handle, collider, meta };
}
