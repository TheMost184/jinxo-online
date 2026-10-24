import { z } from 'zod';

/** ข้อมูลจาก client เชื่อไม่ได้ทั้งหมด — ตรวจรูปร่างก่อนส่งต่อให้ game engine ตรวจกติกาอีกชั้น */
const roomCode = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกรหัสห้อง')
  .max(12)
  .transform((s) => s.toUpperCase());
const name = z.string().max(100);

export const schemas = {
  create: z.object({ name }),
  join: z.object({ roomCode, name }),
  rejoin: z.object({
    roomCode,
    playerId: z.string().min(1).max(64),
    token: z.string().min(1).max(128),
  }),
  setCategories: z.object({ categories: z.array(z.string().max(40)).max(50) }),
  submit: z.object({
    placements: z
      .array(z.object({ cellIndex: z.number().int(), text: z.string().max(300) }))
      .max(9),
  }),
  kick: z.object({ playerId: z.string().min(1).max(64) }),
  question: z.object({ question: z.string().max(500) }),
  matchRequest: z.object({
    targetAnswerId: z.string().min(1).max(100),
    cellIndex: z.number().int().min(0).max(8),
  }),
  matchDecide: z.object({ requestId: z.string().min(1).max(40), approve: z.boolean() }),
  matchUndo: z.object({ requestId: z.string().min(1).max(40) }),
  like: z.object({ answerId: z.string().min(1).max(100), like: z.boolean() }),
};
