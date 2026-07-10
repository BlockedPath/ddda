# COORD — Live agent board

**Contract version:** 1.6  
**Last:** Demo repair + vitest smoke suite

## Ownership
Grok: physics/demos · Cursor: render/UI

## Done
- Phases 1–10 jointly closed
- **Demo repair:** cradle, bridge, catapult, chain, gears, dominoes/tower/ramps
- **Tests:** `npm test` — 14/14 pass (load+step all demos, fireworks bursts, gear spin)
- Gears physics: circle colliders + `vertices` for visual tooth mesh

## Cursor note
Gear/motor still use `visualHint` + optional `vertices` on circle bodies. Keep individual mesh path.

## Handoff
http://127.0.0.1:5173/ · `npm test`
