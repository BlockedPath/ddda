import type RAPIER from '@dimforge/rapier2d-compat';
import type { BodyId, JointKind, JointSnapshot } from '../shared/types.ts';

export interface JointMeta {
  id: string;
  kind: JointKind;
  bodyA: BodyId;
  bodyB: BodyId | null;
  /** Local anchors stored for snapshot */
  localA: [number, number];
  localB: [number, number];
  handle: RAPIER.ImpulseJoint;
}

let nextJointId = 1;

export function allocJointId(): string {
  return `j${nextJointId++}`;
}

export function resetJointIds(): void {
  nextJointId = 1;
}

export function createRevolute(
  R: typeof RAPIER,
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody | null,
  idA: BodyId,
  idB: BodyId | null,
  worldAnchor: [number, number],
): JointMeta {
  const aPos = bodyA.translation();
  const localA: [number, number] = [
    worldAnchor[0] - aPos.x,
    worldAnchor[1] - aPos.y,
  ];
  let localB: [number, number] = [worldAnchor[0], worldAnchor[1]];
  if (bodyB) {
    const bPos = bodyB.translation();
    localB = [worldAnchor[0] - bPos.x, worldAnchor[1] - bPos.y];
  }

  const params = R.JointData.revolute(
    { x: localA[0], y: localA[1] },
    { x: localB[0], y: localB[1] },
  );

  // World anchor as second body: use a fixed ground body if null — caller should pass ground
  if (!bodyB) {
    throw new Error('createRevolute requires bodyB (use ground body for world pins)');
  }

  const handle = world.createImpulseJoint(params, bodyA, bodyB, true);
  return {
    id: allocJointId(),
    kind: 'revolute',
    bodyA: idA,
    bodyB: idB,
    localA,
    localB,
    handle,
  };
}

/** Revolute pin with continuous motor (drive gear). */
export function createMotorRevolute(
  R: typeof RAPIER,
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody,
  idA: BodyId,
  idB: BodyId | null,
  worldAnchor: [number, number],
  targetVel: number,
  factor = 8,
): JointMeta {
  const meta = createRevolute(R, world, bodyA, bodyB, idA, idB, worldAnchor);
  // createImpulseJoint returns ImpulseJoint; revolute joints are UnitImpulseJoint
  const revolute = meta.handle as RAPIER.RevoluteImpulseJoint;
  revolute.configureMotorModel(R.MotorModel.ForceBased);
  revolute.configureMotorVelocity(targetVel, factor);
  return meta;
}

export function createDistance(
  R: typeof RAPIER,
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody,
  idA: BodyId,
  idB: BodyId,
  anchorAWorld: [number, number],
  anchorBWorld: [number, number],
  length?: number,
): JointMeta {
  const aPos = bodyA.translation();
  const bPos = bodyB.translation();
  const localA: [number, number] = [
    anchorAWorld[0] - aPos.x,
    anchorAWorld[1] - aPos.y,
  ];
  const localB: [number, number] = [
    anchorBWorld[0] - bPos.x,
    anchorBWorld[1] - bPos.y,
  ];
  const dx = anchorBWorld[0] - anchorAWorld[0];
  const dy = anchorBWorld[1] - anchorAWorld[1];
  const dist = length ?? Math.hypot(dx, dy);

  const params = R.JointData.rope(dist, {
    x: localA[0],
    y: localA[1],
  }, {
    x: localB[0],
    y: localB[1],
  });

  const handle = world.createImpulseJoint(params, bodyA, bodyB, true);
  return {
    id: allocJointId(),
    kind: 'distance',
    bodyA: idA,
    bodyB: idB,
    localA,
    localB,
    handle,
  };
}

export function jointToSnapshot(
  meta: JointMeta,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody | null,
): JointSnapshot {
  const a = bodyA.translation();
  const rotA = bodyA.rotation();
  const cA = Math.cos(rotA);
  const sA = Math.sin(rotA);
  const ax = a.x + cA * meta.localA[0] - sA * meta.localA[1];
  const ay = a.y + sA * meta.localA[0] + cA * meta.localA[1];

  let bx = meta.localB[0];
  let by = meta.localB[1];
  if (bodyB) {
    const b = bodyB.translation();
    const rotB = bodyB.rotation();
    const cB = Math.cos(rotB);
    const sB = Math.sin(rotB);
    bx = b.x + cB * meta.localB[0] - sB * meta.localB[1];
    by = b.y + sB * meta.localB[0] + cB * meta.localB[1];
  }

  return {
    id: meta.id,
    kind: meta.kind,
    anchorA: [ax, ay],
    anchorB: [bx, by],
    bodyA: meta.bodyA,
    bodyB: meta.bodyB,
  };
}
