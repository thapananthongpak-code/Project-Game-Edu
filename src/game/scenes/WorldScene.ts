import * as Phaser from "phaser";
import { useGameStore } from "../../state/gameStore";
import { touchInput } from "../../state/input";
import { wangKey } from "./BootScene";
import {
  BASE_WIDTH,
  type Direction,
  FLOOR_BOTTOM,
  FLOOR_LEFT,
  FLOOR_RIGHT,
  FLOOR_TOP,
  MAP_COLS,
  MAP_ROWS,
  MAP_TOP,
  TILE,
} from "../constants";

const PLAYER_SPEED = 120;
const INTERACT_RANGE = 46;
/** หลังปิดหน้าต่าง รอสั้น ๆ ก่อนรับปุ่มโต้ตอบ กันปุ่มเดียวกันเปิดซ้ำทันที */
const ACTION_COOLDOWN_MS = 250;
/** สีย้อมของไทล์ผนังส่วนที่เป็นสันผนัง ให้ต่างจากหน้าผนังแถวล่าง */
const WALL_TOP_TINT = 0x8fa3b8;

export interface Interactable {
  id: string;
  x: number;
  y: number;
  prompt: () => string;
  action: () => void;
}

/** ฉากเดินสำรวจ: แผนที่ 20×11 ไทล์ ผู้เล่น การชน และการโต้ตอบกับวัตถุ */
export abstract class WorldScene extends Phaser.Scene {
  /** ตัวชนของผู้เล่น (มองไม่เห็น) ตำแหน่งคือจุดยืนที่เท้า */
  player!: Phaser.Physics.Arcade.Image;
  /** ภาพตัวละครที่ตามตัวชน แยกกันเพื่อขยับภาพเป็นจังหวะก้าวได้โดยไม่กระทบการชน */
  private avatar!: Phaser.GameObjects.Image;
  interactables: Interactable[] = [];
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Direction = "south";
  private actionReadyAt = 0;
  private actionQueued = false;
  private unsubscribe?: () => void;

  protected buildMap(tileset: string): void {
    const isFloor = (col: number, row: number) => row >= 2 && row < MAP_ROWS - 1 && col > 0 && col < MAP_COLS - 1;
    const wang = this.registry.get(wangKey(tileset)) as Record<string, number> | undefined;
    if (wang) this.buildWangMap(tileset, wang, isFloor);
    else this.buildSimpleMap(tileset, isFloor);
    this.physics.world.setBounds(FLOOR_LEFT, FLOOR_TOP, FLOOR_RIGHT - FLOOR_LEFT, FLOOR_BOTTOM - FLOOR_TOP);
    this.obstacles = this.physics.add.staticGroup();
  }

  /**
   * ชุดไทล์ Wang ของ Pixel Lab เลือกไทล์จากชนิดพื้นผิวที่มุมทั้งสี่ จึงวาดเลื่อนครึ่งไทล์
   * ให้มุมของไทล์ตกกลางช่องแผนที่ ขอบพื้นกับผนังจึงอยู่บนเส้นกริดพอดี
   */
  private buildWangMap(tileset: string, wang: Record<string, number>, isFloor: (col: number, row: number) => boolean): void {
    const bit = (col: number, row: number) => (isFloor(col, row) ? "0" : "1");
    for (let row = 0; row <= MAP_ROWS; row++) {
      for (let col = 0; col <= MAP_COLS; col++) {
        const corners = bit(col - 1, row - 1) + bit(col, row - 1) + bit(col - 1, row) + bit(col, row);
        this.add.image(col * TILE - TILE / 2, MAP_TOP + row * TILE - TILE / 2, tileset, wang[corners]).setOrigin(0);
      }
    }
  }

  /** ชุดไทล์ชั่วคราว: ภาพพื้น 1 ไทล์ และภาพผนัง 1 ไทล์ */
  private buildSimpleMap(tileset: string, isFloor: (col: number, row: number) => boolean): void {
    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        const floor = isFloor(col, row);
        const tile = this.add.image(col * TILE, MAP_TOP + row * TILE, floor ? `${tileset}_floor` : `${tileset}_wall`).setOrigin(0);
        // แถว 1 คือหน้าผนังที่หันหาผู้เล่น ผนังส่วนอื่นเป็นสันผนังมองจากด้านบน
        if (!floor && !(row === 1 && col > 0 && col < MAP_COLS - 1)) tile.setTint(WALL_TOP_TINT);
      }
    }
  }

  /** วางวัตถุโดยให้ฐานอยู่ที่ (x, baseY) และกันชนเฉพาะส่วนฐาน */
  protected addProp(key: string, x: number, baseY: number, bodyWidth: number, bodyHeight = 12): Phaser.GameObjects.Image {
    const image = this.add.image(x, baseY, key).setOrigin(0.5, 1).setDepth(baseY);
    if (bodyWidth > 0) {
      const zone = this.add.zone(x, baseY - bodyHeight / 2, bodyWidth, bodyHeight);
      this.physics.add.existing(zone, true);
      this.obstacles.add(zone);
    }
    return image;
  }

  protected createPlayer(x: number, y: number): void {
    // จุดยืนของตัวละครอยู่ที่ y = 60 ของภาพ 64×64 กล่องชนอยู่ที่เท้า
    this.player = this.physics.add.image(x, y, "ch_player_south").setOrigin(0.5, 60 / 64).setVisible(false);
    this.player.body!.setSize(18, 10).setOffset(23, 50);
    this.player.setCollideWorldBounds(true);
    this.facing = "south";
    this.avatar = this.add.image(x, y, "ch_player_south").setOrigin(0.5, 60 / 64).setDepth(y);
    this.physics.add.collider(this.player, this.obstacles);

    const { KeyCodes } = Phaser.Input.Keyboard;
    // ไม่ capture ปุ่ม เพื่อให้พิมพ์ในช่องคำตอบของหน้าต่าง React ได้ตามปกติ
    this.keys = this.input.keyboard!.addKeys(
      { up: KeyCodes.UP, down: KeyCodes.DOWN, left: KeyCodes.LEFT, right: KeyCodes.RIGHT, w: KeyCodes.W, a: KeyCodes.A, s: KeyCodes.S, d: KeyCodes.D, e: KeyCodes.E, space: KeyCodes.SPACE, enter: KeyCodes.ENTER },
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    // รับปุ่มโต้ตอบจาก event แทน JustDown เพราะ JustDown หายถ้ากดและปล่อยภายในเฟรมเดียว
    this.actionQueued = false;
    for (const key of [this.keys.e, this.keys.space, this.keys.enter]) {
      key.on(Phaser.Input.Keyboard.Events.DOWN, () => {
        // โฟกัสอยู่บนปุ่มของหน้าเว็บ (เช่น ปุ่มบน HUD ที่ผู้ใช้คีย์บอร์ด Tab ไปถึง): ปุ่มนี้เป็นของปุ่มนั้น ไม่ใช่คำสั่งโต้ตอบในเกม
        const focused = document.activeElement;
        if (focused && focused !== document.body && !(focused instanceof HTMLCanvasElement) && !focused.closest('[data-testid="touch-controls"]')) return;
        this.actionQueued = true;
      });
    }

    this.unsubscribe = useGameStore.subscribe((state, previous) => {
      const wasBusy = previous.overlay !== null || previous.tutorOpen;
      if (wasBusy && state.overlay === null && !state.tutorOpen) {
        this.actionReadyAt = this.time.now + ACTION_COOLDOWN_MS;
        this.input.keyboard?.resetKeys();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.interactables = [];
      const store = useGameStore.getState();
      store.setPrompt(null);
      store.setLabels([]);
    });
  }

  update(time: number): void {
    const store = useGameStore.getState();
    // เคลียร์ทุกเฟรม ปุ่มที่กดตอนพิมพ์ในหน้าต่างจึงไม่ค้างมาถึงตอนกลับเข้าเกม
    const actionPressed = this.actionQueued || touchInput.action;
    this.actionQueued = false;
    touchInput.action = false;

    if (store.screen === "menu" || store.screen === "onboarding" || store.overlay !== null || store.tutorOpen) {
      this.player.setVelocity(0);
      this.avatar.setPosition(this.player.x, this.player.y);
      return;
    }

    this.movePlayer(time);

    const nearest = this.nearestInteractable();
    store.setPrompt(nearest ? nearest.prompt() : null);
    if (nearest && actionPressed && time >= this.actionReadyAt) nearest.action();
  }

  private movePlayer(time: number): void {
    const k = this.keys;
    let dx = touchInput.x + (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let dy = touchInput.y + (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    dx = Phaser.Math.Clamp(dx, -1, 1);
    dy = Phaser.Math.Clamp(dy, -1, 1);
    const moving = dx !== 0 || dy !== 0;
    const scale = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
    this.player.setVelocity(dx * PLAYER_SPEED * scale, dy * PLAYER_SPEED * scale);

    if (moving) {
      const facing: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
      if (facing !== this.facing) {
        this.facing = facing;
        this.avatar.setTexture(`ch_player_${facing}`);
      }
    }
    // ยังไม่มีแอนิเมชันเดิน ใช้การขยับภาพขึ้น 1 px สลับกันเป็นจังหวะก้าว
    const step = moving && Math.floor(time / 140) % 2 === 0 ? 1 : 0;
    this.avatar.setPosition(this.player.x, this.player.y - step).setDepth(this.player.y);
  }

  private nearestInteractable(): Interactable | null {
    let nearest: Interactable | null = null;
    let best = INTERACT_RANGE;
    for (const item of this.interactables) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (distance < best) {
        best = distance;
        nearest = item;
      }
    }
    return nearest;
  }

  /** ตำแหน่ง x ของช่องที่ index จากทั้งหมด count ช่อง กระจายเท่ากันตามความกว้างห้อง */
  protected spreadX(index: number, count: number, margin = 3 * TILE): number {
    if (count === 1) return BASE_WIDTH / 2;
    return margin + (index * (BASE_WIDTH - 2 * margin)) / (count - 1);
  }
}
