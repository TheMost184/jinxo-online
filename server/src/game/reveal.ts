import type { AnswerGroup, BaseKey } from './scoring.js';

export interface RevealStep {
  topicIndex: number;
  kind: 'group' | 'unmatched';
  /** canonical group ids ที่ถูกเปิดในขั้นนี้ */
  groupIds: string[];
  baseKeys: BaseKey[];
}

/**
 * ลำดับการเปิดเผยคำตอบ (ระบบกำหนด):
 * ไล่ทีละหัวข้อ → ในแต่ละหัวข้อเปิดคำที่ "ตรงกัน" ทีละกลุ่ม (กลุ่มที่ตรงกันน้อยคนก่อน
 * เพื่อเก็บกลุ่มใหญ่ไว้เป็นไคลแม็กซ์ และ JinxO ได้โชว์เดี่ยว) → ปิดท้ายหัวข้อด้วยการเปิด
 * คำที่ไม่ตรงกับใครพร้อมกันทั้งหมด
 */
export function buildRevealSteps(groups: AnswerGroup[], topicCount: number): RevealStep[] {
  const steps: RevealStep[] = [];
  for (let t = 0; t < topicCount; t++) {
    const inTopic = groups.filter((g) => g.topicIndex === t);
    const matched = inTopic
      .filter((g) => g.playerIds.length >= 2)
      .sort((a, b) => a.playerIds.length - b.playerIds.length || a.id.localeCompare(b.id, 'th'));
    for (const g of matched) {
      steps.push({ topicIndex: t, kind: 'group', groupIds: [g.id], baseKeys: [...g.baseKeys] });
    }
    const unmatched = inTopic.filter((g) => g.playerIds.length < 2);
    if (unmatched.length > 0) {
      steps.push({
        topicIndex: t,
        kind: 'unmatched',
        groupIds: unmatched.map((g) => g.id),
        baseKeys: unmatched.flatMap((g) => g.baseKeys),
      });
    }
  }
  return steps;
}
