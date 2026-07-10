# DDDA Physics Lab

High-visual hybrid physics sandbox: **2D Rapier simulation** + **3D Three.js presentation**.

## Run

```bash
npm install
npm run dev
```

## Controls

| Input | Action |
|-------|--------|
| LMB | Use active tool |
| 1–7 | Grab · Box · Ball · Pin · Delete · Boom · Paint |
| Space | Pause / resume |
| `,` / `.` | Half / double time scale |
| Delete | Remove active body |
| Scroll | Zoom |
| RMB drag | Orbit camera |
| R | Reset current demo |
| Gravity slider | Change world gravity |

## Demos

Sandbox · Tower · Dominoes · Newton's Cradle · Bridge · Seesaw · Catapult · Ramps · Chain · Fireworks · Gears · Stress

## Tests

```bash
npm test          # headless demo smoke (load + step all demos)
npm run test:watch
```

## Agent ownership

See `AGENTS.md` and live board `COORD.md`.

- **Grok:** `src/physics/**`, `src/shared/**`, `src/app.ts`
- **Cursor:** `src/render/**`, `src/ui/**`
