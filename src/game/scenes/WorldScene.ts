import * as Phaser from "phaser";
import { useGameStore } from "../../state/gameStore";
import { touchInput } from "../../state/input";
import { type CharacterSheet, sheetKey, wangKey } from "./BootScene";
import { BASE_WIDTH, type Direction, MAP_COLS, MAP_ROWS, MAP_TOP, mentorTexture, playerTexture, TILE } from "../constants";
import { blockedCells, cellSpot, type GameMap, interactSpot, isFloorCell, type MapObject, objectBaseY, objectX } from "../maps";

const PLAYER_SPEED = 120;
const INTERACT_RANGE = 46;
/** หลังปิดหน้าต่าง รอสั้น ๆ ก่อนรับปุ่มโต้ตอบ กันปุ่มเดียวกันเปิดซ้ำทันที */
const ACTION_COOLDOWN_MS = 250;
/** สีย้อมของไทล์ผนังส่วนที่เป็นสันผนัง ให้ต่างจากหน้าผนังแถวล่าง */
const WALL_TOP_TINT = 0x8fa3b8;
const WALK_FPS = 10;
/** ปุ่มโต้ตอบ ระบุด้วยตำแหน่งปุ่มบนคีย์บอร์ด จึงใช้ได้แม้เปลี่ยนภาษาของแป้นพิมพ์เป็นไทย */
const ACTION_KEYS = ["KeyE", "Space", "Enter", "NumpadEnter"];
/** พี่บิตลอยตามผู้เล่น: เริ่มขยับเมื่อห่างเกินระยะนี้ */
const COMPANION_GAP = 34;
const COMPANION_SPEED = PLAYER_SPEED * 1.15;

export interface Interactable {
  id: string;
  x: number;
  y: number;
  /** ขอบบนของวัตถุ ใช้วางลูกศรชี้เป้าหมายและป้าย */
  top: number;
  prompt: () => string;
  action: () => void;
  /** ไม่ระบุ = โต้ตอบได้เสมอ (ของในเควสเสริมโต้ตอบได้เฉพาะตอนที่มองเห็น) */
  enabled?: () => boolean;
}

/** ฉากเดินสำรวจ: แผนที่ 20×11 ไทล์ตามผังของแต่ละฉาก ผู้เล่น พี่บิตที่เดินตาม การชน และการโต้ตอบกับวัตถุ */
export abstract class WorldScene extends Phaser.Scene {
  /** ตัวชนของผู้เล่น (มองไม่เห็น) ตำแหน่งคือจุดยืนที่เท้า */
  player!: Phaser.Physics.Arcade.Image;
  /** ภาพตัวละครที่ตามตัวชน */
  private avatar!: Phaser.GameObjects.Sprite;
  private avatarTexture = "";
  /** พี่บิต: ตำแหน่งจริงอยู่ใน companionAt ภาพลอยขึ้นลงรอบตำแหน่งนั้น */
  private companion!: Phaser.GameObjects.Image;
  private companionAt = new Phaser.Math.Vector2();
  private marker!: Phaser.GameObjects.Triangle;
  private markerTarget = "";
  interactables: Interactable[] = [];
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  protected map!: GameMap;
  /** ภาพของวัตถุแต่ละชิ้นบนแผนที่ */
  protected placed = new Map<MapObject, Phaser.GameObjects.Image>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private facing: Direction = "south";
  private actionReadyAt = 0;
  private actionQueued = false;
  private unsubscribe?: () => void;

  /** ตำแหน่งของพี่บิต (สำหรับการทดสอบอัตโนมัติ) */
  get companionPosition(): { x: number; y: number; texture: string } {
    return { x: this.companionAt.x, y: this.companionAt.y, texture: this.companion.texture.key };
  }

  /** แผ่นสไปรต์ที่ผู้เล่นใช้อยู่ และกำลังเล่นแอนิเมชันเดินหรือไม่ (สำหรับการทดสอบอัตโนมัติ) */
  get avatarState(): { texture: string; walking: boolean; frame: number } {
    return { texture: this.avatarTexture, walking: this.avatar.anims.isPlaying, frame: Number(this.avatar.frame.name) };
  }

  /** ผังและช่องที่วัตถุกันทางเดิน (สำหรับการทดสอบอัตโนมัติ) */
  get mapInfo(): { shape: string[]; blocked: string[] } {
    return { shape: this.map.shape, blocked: this.map.objects.flatMap(blockedCells).map((cell) => `${cell.col},${cell.row}`) };
  }

  /** วาดพื้น ผนัง และวัตถุทั้งหมดของแผนที่ พร้อมตัวกันชน */
  protected buildMap(map: GameMap): void {
    this.map = map;
    this.placed = new Map();
    this.markerTarget = "";
    const isFloor = (col: number, row: number) => isFloorCell(map, col, row);
    const wang = this.registry.get(wangKey(map.tileset)) as Record<string, number> | undefined;
    if (wang) this.buildWangMap(map.tileset, wang, isFloor);
    else this.buildSimpleMap(map.tileset, isFloor);
    this.physics.world.setBounds(0, MAP_TOP, BASE_WIDTH, MAP_ROWS * TILE);
    this.obstacles = this.physics.add.staticGroup();

    // ผนัง: รวมช่องผนังที่ติดกันในแถวเดียวกันเป็นตัวกันชนชิ้นเดียว
    for (let row = 0; row < MAP_ROWS; row++) {
      let start = -1;
      for (let col = 0; col <= MAP_COLS; col++) {
        const wall = col < MAP_COLS && !isFloor(col, row);
        if (wall && start < 0) start = col;
        if (!wall && start >= 0) {
          this.addObstacle(((start + col) / 2) * TILE, MAP_TOP + row * TILE + TILE / 2, (col - start) * TILE, TILE);
          start = -1;
        }
      }
    }
    for (const object of map.objects) this.placeObject(object);

    this.marker = this.add.triangle(0, 0, 0, 0, 12, 0, 6, 9, 0xffcd75).setStrokeStyle(1, 0x1a1c2c).setDepth(1000).setVisible(false);
    this.tweens.add({ targets: this.marker, scaleY: 0.7, duration: 450, yoyo: true, repeat: -1 });
  }

  private addObstacle(x: number, y: number, width: number, height: number): void {
    const zone = this.add.zone(x, y, width, height);
    this.physics.add.existing(zone, true);
    this.obstacles.add(zone);
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
        // ผนังที่มีพื้นอยู่ใต้คือหน้าผนังที่หันหาผู้เล่น ผนังส่วนอื่นเป็นสันผนังมองจากด้านบน
        if (!floor && !isFloor(col, row + 1)) tile.setTint(WALL_TOP_TINT);
      }
    }
  }

  /** วางวัตถุโดยให้ฐานอยู่ตามผัง วัตถุตั้งพื้นกันชนเฉพาะส่วนฐาน */
  private placeObject(object: MapObject): void {
    const x = objectX(object);
    const baseY = objectBaseY(object);
    // ของที่วางราบกับพื้นอยู่ใต้ตัวละครเสมอ
    const image = this.add.image(x, baseY, object.prop).setOrigin(0.5, 1).setDepth(object.flat ? 1 : baseY);
    this.placed.set(object, image);
    // ช่องตกแต่งของโถง: ซ่อนไว้จนกว่าฉากจะรู้ว่าผู้เล่นวางอะไร (HallScene) ช่องตั้งพื้นยังกันทางเดินเสมอ
    if (object.kind === "slot") image.setVisible(false);
    if (!object.mount && !object.flat) this.addObstacle(x, baseY - 6, Math.max(20, Math.min(image.width, (object.w ?? 1) * TILE) - 10), 12);
  }

  /** จุดโต้ตอบของวัตถุบนแผนที่ */
  protected addInteractable(object: MapObject, id: string, prompt: () => string, action: () => void, enabled?: () => boolean): Interactable {
    const image = this.placed.get(object) as Phaser.GameObjects.Image;
    // วัตถุติดผนัง (ประตู) สูงถึงขอบจอ ลูกศรชี้เป้าหมายจึงอยู่หน้าบานประตูแทนที่จะอยู่เหนือวัตถุ
    const top = object.mount ? objectBaseY(object) - 20 : objectBaseY(object) - image.height;
    const item = { id, ...interactSpot(object), top, prompt, action, enabled };
    this.interactables.push(item);
    return item;
  }

  protected objectsOf(kind: MapObject["kind"]): MapObject[] {
    return this.map.objects.filter((object) => object.kind === kind);
  }

  /** ย้ายลูกศรชี้เป้าหมายไปเหนือจุดโต้ตอบนั้น (null = ซ่อน) */
  protected pointAt(id: string | null): void {
    if (id === this.markerTarget) return;
    this.markerTarget = id ?? "";
    const target = this.interactables.find((item) => item.id === id);
    this.marker.setVisible(Boolean(target));
    if (target) this.marker.setPosition(target.x, Math.max(MAP_TOP + 8, target.top - 16));
  }

  private wantedTexture(): string {
    const { profile, shop } = useGameStore.getState();
    return playerTexture(profile?.avatar ?? "a", shop.outfit);
  }

  private walkKey(direction: Direction): string {
    return `${this.avatarTexture}:walk:${direction}`;
  }

  private idleFrame(direction: Direction): number {
    const sheet = this.registry.get(sheetKey(this.avatarTexture)) as CharacterSheet;
    return sheet.directions.indexOf(direction) * (1 + sheet.walkFrames);
  }

  /** เปลี่ยนแผ่นสไปรต์ของผู้เล่นตามตัวละครและชุดที่สวม และสร้างแอนิเมชันเดินของแผ่นนั้นถ้ายังไม่มี */
  private applyTexture(): void {
    const texture = this.wantedTexture();
    if (texture === this.avatarTexture) return;
    this.avatarTexture = texture;
    const sheet = this.registry.get(sheetKey(texture)) as CharacterSheet;
    const columns = 1 + sheet.walkFrames;
    sheet.directions.forEach((direction, row) => {
      if (this.anims.exists(this.walkKey(direction))) return;
      this.anims.create({ key: this.walkKey(direction), frames: this.anims.generateFrameNumbers(texture, { start: row * columns + 1, end: row * columns + sheet.walkFrames }), frameRate: WALK_FPS, repeat: -1 });
    });
    this.avatar.anims.stop();
    this.avatar.setTexture(texture, this.idleFrame(this.facing));
  }

  protected createPlayer(x: number, y: number): void {
    const texture = this.wantedTexture();
    // จุดยืนของตัวละครอยู่ที่ y = 60 ของภาพ 64×64 กล่องชนอยู่ที่เท้า
    this.player = this.physics.add.image(x, y, texture, 0).setOrigin(0.5, 60 / 64).setVisible(false);
    this.player.body!.setSize(18, 10).setOffset(23, 50);
    this.player.setCollideWorldBounds(true);
    this.facing = "south";
    this.avatar = this.add.sprite(x, y, texture, 0).setOrigin(0.5, 60 / 64).setDepth(y);
    this.avatarTexture = "";
    this.applyTexture();
    this.physics.add.collider(this.player, this.obstacles);

    this.companionAt.set(x - 30, y - 4);
    this.companion = this.add.image(this.companionAt.x, this.companionAt.y, mentorTexture(useGameStore.getState().shop.bit)).setOrigin(0.5, 60 / 64).setDepth(this.companionAt.y);

    const { KeyCodes } = Phaser.Input.Keyboard;
    // ไม่ capture ปุ่ม เพื่อให้พิมพ์ในช่องคำตอบของหน้าต่าง React ได้ตามปกติ
    this.keys = this.input.keyboard!.addKeys(
      { up: KeyCodes.UP, down: KeyCodes.DOWN, left: KeyCodes.LEFT, right: KeyCodes.RIGHT, w: KeyCodes.W, a: KeyCodes.A, s: KeyCodes.S, d: KeyCodes.D },
      false,
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    // ปุ่มโต้ตอบรับจาก event ของเบราว์เซอร์โดยตรง: ต้องดูว่าโฟกัสอยู่ที่ไหน "ตอนกดปุ่ม"
    // (Phaser ประมวลผลปุ่มในเฟรมถัดไป ซึ่งตอนนั้นปุ่มบนหน้าเว็บอาจปล่อยโฟกัสไปแล้ว ทำให้ Space ที่กดปุ่ม HUD กลายเป็นคำสั่งโต้ตอบในเกม)
    this.actionQueued = false;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !ACTION_KEYS.includes(event.code)) return;
      const target = event.target;
      // โฟกัสอยู่บนปุ่มของหน้าเว็บ (เช่น ปุ่มบน HUD ที่ผู้ใช้คีย์บอร์ด Tab ไปถึง): ปุ่มนี้เป็นของปุ่มนั้น ไม่ใช่คำสั่งโต้ตอบในเกม
      if (target instanceof Element && target !== document.body && !(target instanceof HTMLCanvasElement) && !target.closest('[data-testid="touch-controls"]')) return;
      this.actionQueued = true;
    };
    window.addEventListener("keydown", onKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => window.removeEventListener("keydown", onKeyDown));

    this.unsubscribe = useGameStore.subscribe((state, previous) => {
      const wasBusy = previous.overlay !== null || previous.tutorOpen;
      if (wasBusy && state.overlay === null && !state.tutorOpen) {
        this.actionReadyAt = this.time.now + ACTION_COOLDOWN_MS;
        this.input.keyboard?.resetKeys();
      }
      // เปลี่ยนตัวละครหรือชุด (ร้านค้า ตู้เสื้อผ้า หรือโหลดความคืบหน้าเสร็จ)
      if (state.profile?.avatar !== previous.profile?.avatar || state.shop.outfit !== previous.shop.outfit) this.applyTexture();
      // เปลี่ยนคอสตูมของพี่บิต
      if (state.shop.bit !== previous.shop.bit) this.companion.setTexture(mentorTexture(state.shop.bit));
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.interactables = [];
      const store = useGameStore.getState();
      store.setPrompt(null);
      store.setLabels([]);
    });
  }

  /** จุดยืนเริ่มต้นหน้าวัตถุ (เช่น หน้าประตูที่เพิ่งเดินออกมา) */
  protected spotBelow(object: MapObject): { x: number; y: number } {
    return cellSpot(Math.floor(object.col + ((object.w ?? 1) - 1) / 2), object.row + 1);
  }

  update(time: number, delta: number): void {
    const store = useGameStore.getState();
    // เคลียร์ทุกเฟรม ปุ่มที่กดตอนพิมพ์ในหน้าต่างจึงไม่ค้างมาถึงตอนกลับเข้าเกม
    const actionPressed = this.actionQueued || touchInput.action;
    this.actionQueued = false;
    touchInput.action = false;

    if (store.screen === "menu" || store.screen === "onboarding" || store.overlay !== null || store.tutorOpen) {
      this.player.setVelocity(0);
      this.stand();
      this.followPlayer(time, delta);
      return;
    }

    this.movePlayer();
    this.followPlayer(time, delta);

    const nearest = this.nearestInteractable();
    store.setPrompt(nearest ? nearest.prompt() : null);
    if (nearest && actionPressed && time >= this.actionReadyAt) nearest.action();
  }

  private stand(): void {
    this.avatar.anims.stop();
    this.avatar.setFrame(this.idleFrame(this.facing));
    this.avatar.setPosition(this.player.x, this.player.y).setDepth(this.player.y);
  }

  private movePlayer(): void {
    const k = this.keys;
    let dx = touchInput.x + (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    let dy = touchInput.y + (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    dx = Phaser.Math.Clamp(dx, -1, 1);
    dy = Phaser.Math.Clamp(dy, -1, 1);
    const moving = dx !== 0 || dy !== 0;
    const scale = dx !== 0 && dy !== 0 ? Math.SQRT1_2 : 1;
    this.player.setVelocity(dx * PLAYER_SPEED * scale, dy * PLAYER_SPEED * scale);

    if (!moving) return this.stand();
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
    this.avatar.anims.play(this.walkKey(this.facing), true);
    this.avatar.setPosition(this.player.x, this.player.y).setDepth(this.player.y);
  }

  /** พี่บิตลอยตามผู้เล่น เว้นระยะไว้เล็กน้อย และหันตามทิศที่เคลื่อน */
  private followPlayer(time: number, delta: number): void {
    const at = this.companionAt;
    const distance = Phaser.Math.Distance.Between(at.x, at.y, this.player.x, this.player.y - 4);
    if (distance > COMPANION_GAP) {
      const step = Math.min(distance - COMPANION_GAP, (COMPANION_SPEED * delta) / 1000);
      const dx = this.player.x - at.x;
      at.x += (dx / distance) * step;
      at.y += ((this.player.y - 4 - at.y) / distance) * step;
      if (Math.abs(dx) > 2) this.companion.setFlipX(dx < 0);
    }
    this.companion.setPosition(at.x, at.y + Math.sin(time / 320) * 2).setDepth(at.y);
  }

  private nearestInteractable(): Interactable | null {
    let nearest: Interactable | null = null;
    let best = INTERACT_RANGE;
    for (const item of this.interactables) {
      if (item.enabled && !item.enabled()) continue;
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (distance < best) {
        best = distance;
        nearest = item;
      }
    }
    return nearest;
  }
}
