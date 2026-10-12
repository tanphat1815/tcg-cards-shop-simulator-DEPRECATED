/**
 * Script để generate isometric demo assets.
 * Chạy: npx ts-node scripts/generateIsoAssets.ts
 * Hoặc: node scripts/generateIsoAssets.js (sau khi compile)
 */
import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

// Đảm bảo thư mục tồn tại
const outDir = path.join(__dirname, '../../public/assets/isometric');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// ─── ISO TILE CONSTANTS ───────────────────────────────────────────────
const TILE_W = 64;
const TILE_H = 32;
const HW = TILE_W / 2; // 32
const HH = TILE_H / 2; // 16

// ─── HELPERS ─────────────────────────────────────────────────────────

/** Vẽ một diamond tile 2:1 */
function drawIsoDiamond(ctx: any, cx: number, cy: number, hw: number, hh: number, fillColor: string, strokeColor: string) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh);      // Top
  ctx.lineTo(cx + hw, cy);      // Right
  ctx.lineTo(cx, cy + hh);      // Bottom
  ctx.lineTo(cx - hw, cy);      // Left
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Vẽ isometric box (3D cube) */
function drawIsoBox(ctx: any, cx: number, cy: number, hw: number, hh: number, height: number, topColor: string, leftColor: string, rightColor: string) {
  // Top face
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh - height);
  ctx.lineTo(cx + hw, cy - height);
  ctx.lineTo(cx, cy + hh - height);
  ctx.lineTo(cx - hw, cy - height);
  ctx.closePath();
  ctx.fillStyle = topColor;
  ctx.fill();
  ctx.strokeStyle = '#00000033';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Left face
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - height);
  ctx.lineTo(cx, cy + hh - height);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx - hw, cy);
  ctx.closePath();
  ctx.fillStyle = leftColor;
  ctx.fill();
  ctx.strokeStyle = '#00000033';
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(cx + hw, cy - height);
  ctx.lineTo(cx, cy + hh - height);
  ctx.lineTo(cx, cy + hh);
  ctx.lineTo(cx + hw, cy);
  ctx.closePath();
  ctx.fillStyle = rightColor;
  ctx.fill();
  ctx.strokeStyle = '#00000033';
  ctx.stroke();
}

// ─── 1. FLOOR TILE ───────────────────────────────────────────────────

function createFloorTile() {
  const canvas = createCanvas(TILE_W, TILE_H);
  const ctx = canvas.getContext('2d');

  // Gradient cho depth
  const gradient = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
  gradient.addColorStop(0, '#4a6741');
  gradient.addColorStop(0.5, '#5a7751');
  gradient.addColorStop(1, '#4a6741');

  drawIsoDiamond(ctx, HW, HH, HW, HH, gradient, '#3a5731');

  // Grid lines nhẹ
  ctx.strokeStyle = '#3a573133';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(HW, 0);
  ctx.lineTo(0, HH);
  ctx.moveTo(HW, 0);
  ctx.lineTo(TILE_W, HH);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_floor.png'), buffer);
  console.log('Created: iso_floor.png');
}

// ─── 2. SIDEWALK TILE ───────────────────────────────────────────────

function createSidewalkTile() {
  const canvas = createCanvas(TILE_W, TILE_H);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, TILE_W, TILE_H);
  gradient.addColorStop(0, '#808080');
  gradient.addColorStop(0.5, '#9a9a9a');
  gradient.addColorStop(1, '#707070');

  drawIsoDiamond(ctx, HW, HH, HW, HH, gradient, '#606060');

  // Crack lines
  ctx.strokeStyle = '#50505055';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(HW * 0.5, HH * 0.3);
  ctx.lineTo(HW * 1.5, HH * 1.2);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_sidewalk.png'), buffer);
  console.log('Created: iso_sidewalk.png');
}

// ─── 3. WALL TILE ───────────────────────────────────────────────────

function createWallTile() {
  const canvas = createCanvas(TILE_W, TILE_H + 48);
  const ctx = canvas.getContext('2d');

  // Wall body (đứng trên tile)
  const wallH = 48;
  const topY = HH; // đỉnh của diamond floor

  // Left face
  ctx.beginPath();
  ctx.moveTo(0, topY);
  ctx.lineTo(HW, topY + HH);
  ctx.lineTo(HW, topY + HH + wallH);
  ctx.lineTo(0, topY + wallH);
  ctx.closePath();
  ctx.fillStyle = '#8b7355';
  ctx.fill();
  ctx.strokeStyle = '#6b5335';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Right face
  ctx.beginPath();
  ctx.moveTo(TILE_W, topY);
  ctx.lineTo(HW, topY + HH);
  ctx.lineTo(HW, topY + HH + wallH);
  ctx.lineTo(TILE_W, topY + wallH);
  ctx.closePath();
  ctx.fillStyle = '#a08060';
  ctx.fill();
  ctx.strokeStyle = '#705030';
  ctx.stroke();

  // Top cap
  ctx.beginPath();
  ctx.moveTo(0, topY);
  ctx.lineTo(HW, topY - HH);
  ctx.lineTo(TILE_W, topY);
  ctx.lineTo(HW, topY + HH);
  ctx.closePath();
  ctx.fillStyle = '#c0a080';
  ctx.fill();
  ctx.strokeStyle = '#907060';
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_wall.png'), buffer);
  console.log('Created: iso_wall.png');
}

// ─── 4. CHARACTER SPRITESHEET (8 dirs x 4 frames) ───────────────────

const ISO_DIRECTIONS = ['SE', 'S', 'SW', 'W', 'NW', 'N', 'NE', 'E'];
const FRAME_W = 32;
const FRAME_H = 48;
const FRAMES_PER_ROW = 8;
const TOTAL_FRAMES = 8 * 4; // 8 dirs x 4 frames

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 128, g: 128, b: 128 };
}

function lighten(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.min(255, r + amount)}, ${Math.min(255, g + amount)}, ${Math.min(255, b + amount)})`;
}
function darken(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.max(0, r - amount)}, ${Math.max(0, g - amount)}, ${Math.max(0, b - amount)})`;
}

function drawCharacterFrame(ctx: any, frameX: number, frameY: number, dirIndex: number, frameIndex: number, bodyColor: string) {
  const cx = frameX + FRAME_W / 2;
  const cy = frameY + FRAME_H; // chân nhân vật

  // Bob effect khi walk
  const isWalking = frameIndex > 0;
  const bobY = isWalking ? Math.sin(frameIndex * Math.PI / 2) * 2 : 0;
  const legOffset = isWalking ? Math.sin(frameIndex * Math.PI / 2) * 4 : 0;

  // Shadow
  ctx.beginPath();
  ctx.ellipse(cx, cy, 10, 4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  // Body
  const bodyTop = cy - 36 + bobY;
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(cx, bodyTop + 12, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(bodyColor, 40);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Legs
  ctx.fillStyle = darken(bodyColor, 30);
  // Left leg
  ctx.beginPath();
  ctx.ellipse(cx - 4 - legOffset, cy - 4, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Right leg
  ctx.beginPath();
  ctx.ellipse(cx + 4 + legOffset, cy - 4, 4, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = lighten(bodyColor, 60);
  ctx.beginPath();
  ctx.arc(cx, bodyTop - 2, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = darken(bodyColor, 20);
  ctx.stroke();

  // Direction indicator (eyes) - vị trí mắt thay đổi theo hướng
  const eyeOffsetX = Math.cos(dirIndex * Math.PI / 4) * 2;
  const eyeOffsetY = Math.sin(dirIndex * Math.PI / 4) * 1;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(cx - 2 + eyeOffsetX, bodyTop - 4 + eyeOffsetY, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 2 + eyeOffsetX, bodyTop - 4 + eyeOffsetY, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function createCharacterSheet(key: string, bodyColor: string) {
  const sheetW = FRAME_W * FRAMES_PER_ROW;
  const sheetH = FRAME_H * 4; // 4 rows
  const canvas = createCanvas(sheetW, sheetH);
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, sheetW, sheetH);

  for (let dir = 0; dir < 8; dir++) {
    for (let frame = 0; frame < 4; frame++) {
      const fx = dir * FRAME_W;
      const fy = frame * FRAME_H;
      drawCharacterFrame(ctx, fx, fy, dir, frame, bodyColor);
    }
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, `${key}_iso.png`), buffer);
  console.log(`Created: ${key}_iso.png`);
}

// ─── 5. FURNITURE ───────────────────────────────────────────────────

function createShelfSprite() {
  const canvas = createCanvas(TILE_W, TILE_H + 40);
  const ctx = canvas.getContext('2d');

  drawIsoBox(ctx, HW, HH + 20, HW * 0.9, HH * 0.9, 35, '#8B4513', '#6B3513', '#7B4513');

  // Shelf lines
  ctx.strokeStyle = '#5a2a0a';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const y = HH + 20 - 10 + i * 12;
    ctx.beginPath();
    ctx.moveTo(HW - HW * 0.8, y);
    ctx.lineTo(HW + HW * 0.8, y);
    ctx.stroke();
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_shelf.png'), buffer);
  console.log('Created: iso_shelf.png');
}

function createCashierDesk() {
  const canvas = createCanvas(TILE_W * 2, TILE_H + 30);
  const ctx = canvas.getContext('2d');

  drawIsoBox(ctx, TILE_W, HH + 15, TILE_W * 0.9, HH * 0.9, 25, '#4a5568', '#2d3748', '#3a4558');

  // Counter top
  ctx.fillStyle = '#718096';
  ctx.beginPath();
  ctx.moveTo(TILE_W, HH - 10);
  ctx.lineTo(TILE_W * 2 - 5, HH + 5);
  ctx.lineTo(TILE_W, HH + 20);
  ctx.lineTo(5, HH + 5);
  ctx.closePath();
  ctx.fill();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_cashier.png'), buffer);
  console.log('Created: iso_cashier.png');
}

function createPlayTable() {
  const canvas = createCanvas(TILE_W * 2, TILE_H + 20);
  const ctx = canvas.getContext('2d');

  // Table top (flat diamond)
  ctx.fillStyle = '#8B4513';
  ctx.beginPath();
  ctx.moveTo(TILE_W, HH - 10);
  ctx.lineTo(TILE_W * 2 - 5, HH + 5);
  ctx.lineTo(TILE_W, HH + 20);
  ctx.lineTo(5, HH + 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#6B3513';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Legs
  ctx.fillStyle = '#5a2a0a';
  const legPositions = [[15, HH + 5], [TILE_W - 5, HH + 5], [TILE_W * 2 - 15, HH + 5]];
  for (const [lx, ly] of legPositions) {
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + 4, ly + 18);
    ctx.lineTo(lx + 2, ly + 18);
    ctx.lineTo(lx - 2, ly + 18);
    ctx.lineTo(lx - 4, ly + 18);
    ctx.lineTo(lx, ly);
    ctx.fill();
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_table.png'), buffer);
  console.log('Created: iso_table.png');
}

function createBoxItem() {
  const canvas = createCanvas(TILE_W / 2, TILE_H / 2 + 10);
  const ctx = canvas.getContext('2d');

  const cx = TILE_W / 4;
  const cy = TILE_H / 4 + 5;
  const hw = TILE_W / 4;
  const hh = TILE_H / 4;

  drawIsoBox(ctx, cx, cy, hw, hh, 8, '#c0c0c0', '#909090', '#a0a0a0');

  // Tape
  ctx.strokeStyle = '#ffcc00';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - 8);
  ctx.lineTo(cx + hw, cy - 8);
  ctx.stroke();

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(outDir, 'iso_box.png'), buffer);
  console.log('Created: iso_box.png');
}

// ─── GENERATE ALL ────────────────────────────────────────────────────

console.log('\n=== Generating Isometric Demo Assets ===\n');

createFloorTile();
createSidewalkTile();
createWallTile();
createCharacterSheet('player', '#4a90d9');    // Blue
createCharacterSheet('npc', '#d94a6b');        // Red/Pink
createCharacterSheet('staff', '#4ad96a');      // Green
createShelfSprite();
createCashierDesk();
createPlayTable();
createBoxItem();

console.log('\n=== Done! All assets saved to public/assets/isometric/ ===\n');
