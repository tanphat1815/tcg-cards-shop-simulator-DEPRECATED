# Isometric Refactor & Matter.js Integration

We have completed the high-level architectural refactor for the **TCG Card Shop Simulator** isometric migration. The system is now more robust, performant, and follows senior-level engineering standards.

## 1. Core Isometric Engine (`IsometricUtils.ts`)
We centralized all isometric math into a unified utility file.
- **Standardized Grid**: 64x32 tile size with 2:1 ratio.
- **Unified Depth Formula**: `depth = base + (worldX + worldY) + worldZ`.
- **Coordinate Conversion**: `screenToWorld` and `worldToScreen` helpers ensure consistent mapping between visual and logical space.
- **Depth Offsets**: Defined `DEPTH_OFFSETS` for Walls (+2000), Player (+20), and Furniture (+10).

## 2. Smart Physics System (`PhysicsUtils.ts`)
Replaced Arcade Physics with a context-aware Matter.js loader.
- **`loadCustomBody(key)`**: Automatically fetches complex vertex polygons from `iso_collisions.json`.
- **Diamond Fallback**: If a collision key is missing, the system generates a 64x32 diamond polygon instead of crashing.
- **Foot Colliders**: All entities (Player, NPC, Furniture) now have hitboxes shrunk to their "foot" area (base contact points) for realistic occlusion.

## 3. Rendering & Occlusion (`MainScene.ts`)
- **Wall Clipping**: South-facing walls (South-West, South-East) are now clipped to the floor level as requested, maintaining visibility for the player.
- **Wall Tops**: Rendered at `DEPTH_OFFSETS.WALL_TOP` (2000+) so they always overlay characters walking behind them.
- **Loop Optimization**: Cleaned up duplicated logic and standardized variable usage (`isWall`, `isInsideShop`).

## 4. Manager Refactoring
- **FurnitureManager**: All shelves, tables, and cashiers now use the smart diamond/custom body loader and unified depth sorting.
- **NPCManager & CustomerFSM**: NPCs now use `npc_iso` polygons and update their depth sorting every frame using the standardized formula.
- **Player**: Movement and shadow depth are now synchronized with the isometric grid.

---

### Verification Checklist
- [x] Walk behind North walls (Player should be occluded by `Wall_Top`).
- [x] Walk in front of South walls (Walls should be clipped to floor).
- [x] Collision with Furniture (Should use diamond hitboxes at the base).
- [x] Depth sorting when NPCs cross paths (Correct Z-order).
