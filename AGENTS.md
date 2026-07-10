# AGENTS — Physics Emulator

## Product
Browser hybrid physics sandbox: **2D Rapier simulation**, **3D Three.js presentation**.

## Agent roles
- **Grok:** physics, demos, shared types, app orchestration
- **Cursor:** rendering, VFX, UI, camera, visual polish

## Rules
1. Read/update `COORD.md` when starting or finishing work.
2. Do not edit the other agent’s owned tree without COORD agreement.
3. Shared files (`src/shared/*`, `src/app.ts`, `package.json`): announce in COORD; one writer at a time.
4. Communicate via herdr panes for live handoffs; keep messages short.
5. Contract: both sides only couple through `PhysicsSnapshot` / `PhysicsWorld` API in `src/shared`.

## Run
```bash
npm install
npm run dev
```

## Hybrid mapping
- Physics: 2D `(x, y)` meters, gravity −Y
- Render: plane at `z = 0`, extrude bodies along Z by `zDepth`
