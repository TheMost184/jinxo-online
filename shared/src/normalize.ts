/**
 * ทำให้คำตอบอยู่ในรูปมาตรฐานก่อนเทียบกัน
 * - Unicode NFC (สระ/วรรณยุกต์ไทยที่พิมพ์ลำดับต่างกันแต่หน้าตาเหมือนกัน)
 * - ตัด zero-width characters ที่ติดมาจากการ copy
 * - ตัดช่องว่างหัวท้าย และยุบช่องว่างซ้อน
 * - ช่องว่างระหว่างตัวอักษรไทยถูกตัดทิ้ง ("ไก่ ทอด" = "ไก่ทอด") เพราะภาษาไทยไม่เว้นวรรคระหว่างคำ
 * - ไม่สนตัวพิมพ์เล็ก/ใหญ่
 * - ตัดเครื่องหมายวรรคตอนหัวท้าย ("แมว!" = "แมว")
 *
 * ไม่มีการเดาว่าคำที่สะกดต่างกันคือคำเดียวกัน — ให้ Host รวมกลุ่มเองในขั้น Review
 */
const ZERO_WIDTH = /[​-‍⁠﻿]/g;
const THAI = '฀-๿';
const SPACE_BETWEEN_THAI = new RegExp(`(?<=[${THAI}])\\s+(?=[${THAI}])`, 'g');
const EDGE_PUNCT = /^[\s.,!?;:'"`~\-_()[\]{}…]+|[\s.,!?;:'"`~\-_()[\]{}…]+$/g;

/** ใช้กับข้อความที่จะแสดง: ตัดช่องว่างเกิน แต่คงรูปแบบที่ผู้เล่นพิมพ์ */
export function cleanAnswer(raw: string): string {
  return raw.normalize('NFC').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

/** ใช้เป็น key สำหรับเทียบคำตอบ */
export function normalizeAnswer(raw: string): string {
  return cleanAnswer(raw)
    .replace(SPACE_BETWEEN_THAI, '')
    .replace(EDGE_PUNCT, '')
    .toLocaleLowerCase('th-TH');
}
