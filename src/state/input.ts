// อินพุตจากปุ่มสัมผัส เก็บนอก store เพราะฉากเกมอ่านทุกเฟรมและไม่ต้องทำให้ React วาดใหม่

export const touchInput = {
  /** ทิศที่กดค้างอยู่: -1, 0, 1 */
  x: 0,
  y: 0,
  /** ตั้งเป็น true เมื่อแตะปุ่มโต้ตอบ ฉากเกมอ่านแล้วเคลียร์ */
  action: false,
};

export function resetTouchInput(): void {
  touchInput.x = 0;
  touchInput.y = 0;
  touchInput.action = false;
}
