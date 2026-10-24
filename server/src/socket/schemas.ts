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
  merge: z.object({
    topicIndex: z.number().int().min(0).max(20),
    groupIds: z.array(z.string().max(200)).min(2).max(50),
  }),
  split: z.object({ groupId: z.string().max(200) }),
};
