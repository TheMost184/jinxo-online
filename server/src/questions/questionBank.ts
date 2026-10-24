import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { CategoryInfo, Topic } from '@jinxo/shared';
import { SERVER_ROOT } from '../config.js';

const questionSchema = z.object({
  id: z.number().int(),
  category: z.string().min(1),
  question: z.string().min(1),
  language: z.string().default('th'),
});
const categorySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  emoji: z.string().default('❓'),
});

export interface Question extends Topic {
  language: string;
}

/**
 * คลังคำถาม — โหลดจาก data/questions.json และ data/categories.json
 * เพิ่มคำถามได้โดยแก้ JSON แล้วรีสตาร์ท server (id ต้องไม่ซ้ำ)
 */
export class QuestionBank {
  readonly questions: Question[];
  readonly categories: CategoryInfo[];

  constructor(questions: Question[], categories: Omit<CategoryInfo, 'count'>[]) {
    const ids = new Set<number>();
    for (const q of questions) {
      if (ids.has(q.id)) throw new Error(`questions.json: id ${q.id} ซ้ำ`);
      ids.add(q.id);
    }
    this.questions = questions;
    const known = new Map(categories.map((c) => [c.id, c]));
    // หมวดที่มีในคำถามแต่ไม่ได้ประกาศใน categories.json ก็ยังใช้ได้
    for (const q of questions) {
      if (!known.has(q.category)) known.set(q.category, { id: q.category, label: q.category, emoji: '❓' });
    }
    this.categories = [...known.values()]
      .map((c) => ({ ...c, count: questions.filter((q) => q.category === c.id).length }))
      .filter((c) => c.count > 0);
  }

  static fromFiles(
    questionsFile = process.env.JINXO_QUESTIONS ?? 'data/questions.json',
    categoriesFile = 'data/categories.json',
  ): QuestionBank {
    const qs = z.array(questionSchema).parse(
      JSON.parse(readFileSync(resolve(SERVER_ROOT, questionsFile), 'utf8')),
    );
    const cats = z.array(categorySchema).parse(
      JSON.parse(readFileSync(resolve(SERVER_ROOT, categoriesFile), 'utf8')),
    );
    return new QuestionBank(qs, cats);
  }

  hasCategory(id: string): boolean {
    return this.categories.some((c) => c.id === id);
  }

  countIn(categories: string[]): number {
    const set = new Set(categories);
    return this.questions.filter((q) => set.has(q.category)).length;
  }

  /**
   * สุ่มคำถาม `count` ข้อจากหมวดที่เลือก โดยไม่ซ้ำกันเอง
   * และพยายามเลี่ยงคำถามที่ห้องนี้เคยเล่นไปแล้ว (ถ้าคำถามไม่พอค่อยยอมใช้ซ้ำ)
   */
  pick(categories: string[], count: number, avoid: ReadonlySet<number>, rng = Math.random): Topic[] | null {
    const set = new Set(categories);
    const pool = this.questions.filter((q) => set.has(q.category));
    if (pool.length < count) return null;
    const fresh = shuffle(pool.filter((q) => !avoid.has(q.id)), rng);
    const used = shuffle(pool.filter((q) => avoid.has(q.id)), rng);
    return [...fresh, ...used]
      .slice(0, count)
      .map(({ id, category, question }) => ({ id, category, question }));
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
