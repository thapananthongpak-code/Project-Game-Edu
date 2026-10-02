#!/usr/bin/env python3
"""สร้างภาพใน public/assets/ และเขียน assets-manifest.json

แอสเซตแต่ละชิ้นมาจากแหล่งใดแหล่งหนึ่ง:
- ภาพจริงจาก Pixel Lab: ถ้ามี assets-src/pixellab/<ASSET-ID>/source.json (เขียนโดย npm run pixellab -- fetch)
  สคริปต์จะจัดภาพต้นฉบับในโฟลเดอร์นั้นให้เข้ากับขนาดและจุดยืนที่เกมใช้ แล้วบันทึก status "generated"
- ภาพชั่วคราว: ถ้ายังไม่มี source.json สคริปต์วาดรูปทรงง่าย ๆ ตามขนาดและจานสีใน docs/ART_GUIDE.md (status "placeholder")

prompt ของแต่ละชิ้นดึงจาก docs/ART_GUIDE.md ตรงตัว ต้องใช้ Pillow (pip install pillow)
"""
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "public" / "assets"
SOURCES = ROOT / "assets-src" / "pixellab"
# จุดยืนของตัวละครในภาพ 64×64 ที่เกมใช้: กึ่งกลางแนวนอน เท้าอยู่ที่ y = 60
SPRITE_SIZE, FEET_X, FEET_Y = 64, 32, 60
MANIFEST = ASSETS / "assets-manifest.json"
ART_GUIDE = ROOT / "docs" / "ART_GUIDE.md"

INK, SLATE, STEEL, MIST, PAPER, CREAM = "#1A1C2C", "#333C57", "#566C86", "#94B0C2", "#F4F4F4", "#FFF4DC"
TEAL_D, TEAL, TEAL_L = "#1B6E73", "#2FB8AC", "#A8EDE0"
SKIN, SKIN_D, SCREEN, YELLOW = "#F2C9A0", "#C98E62", "#73EFF7", "#FFCD75"
GREEN, RED = "#38B764", "#B13E53"
# สีประจำห้อง (เข้ม, หลัก, อ่อน) จาก docs/ART_GUIDE.md ข้อ 3
ROOM_COLORS = {
    1: ("#1B6E73", "#2FB8AC", "#A8EDE0"),
    2: ("#46308F", "#7B5CE0", "#CDBDFF"),
    3: ("#1F6B45", "#38B764", "#A7F070"),
    4: ("#9C4A1A", "#F08C2E", "#FFCD75"),
    5: ("#9E2F4F", "#EF6A82", "#FFC4CC"),
    6: ("#2A4FA3", "#41A6F6", "#B8DCFF"),
}
ROOM_NAMES = {1: "ห้องปฐมนิเทศ", 2: "โรงฝึกสามสาย", 3: "คลังข้อมูล", 4: "โรงงานโมเดล", 5: "ลานชีวิตประจำวัน", 6: "สตูดิโอภาคสนาม"}

# size ของ Pixel Lab คือความสูงของตัวละครโดยประมาณ (ภาพที่ได้มีขอบว่างเพิ่มรอบตัว) 48 px = 1.5 ไทล์
CHARACTER_SETTINGS = {
    "n_directions": 4, "size": 48, "mode": "standard", "view": "low top-down",
    "outline": "single color outline", "shading": "basic shading", "detail": "medium detail",
    "proportions": json.dumps({"type": "preset", "name": "chibi"}),
}
TILESET_SETTINGS = {
    "tile_size": {"width": 32, "height": 32}, "mode": "standard", "transition_size": 0.0,
    "view": "low top-down", "outline": "lineless", "shading": "basic shading", "detail": "low detail",
}
IMAGE_SETTINGS = {
    "width": 64, "height": 64, "no_background": True, "view": "low top-down", "direction": "south",
    "outline": "single color outline", "shading": "basic shading", "detail": "medium detail",
}
ICON_SETTINGS = {
    "width": 32, "height": 32, "no_background": True,
    "outline": "single color outline", "shading": "basic shading", "detail": "low detail",
}
OBJECT_SETTINGS = {"no_background": True, "view": "low top-down", "outline": "single color outline", "shading": "basic shading", "detail": "medium detail"}
# ภาพของฉากต่อสู้ (แสดงใน HTML) เป็นมุมมองด้านข้าง
BATTLE_SETTINGS = {"no_background": True, "view": "side", "outline": "single color black outline", "shading": "medium shading", "detail": "medium detail"}
BACKDROP_SETTINGS = {"no_background": False, "view": "side", "outline": "lineless", "shading": "medium shading", "detail": "medium detail"}
DIRECTIONS = ("south", "north", "east", "west")
# แอนิเมชันเดิน: แม่แบบของ Pixel Lab ทิศละ 1 generation แผ่นสไปรต์ของตัวละคร = 4 แถว (ทิศ) × (ยืน 1 + เดิน WALK_FRAMES) คอลัมน์
WALK_FRAMES = 6
WALK_ANIMATION = {"template_animation_id": "walking-6-frames", "animation_name": "walk"}


def canvas(w, h, fill=(0, 0, 0, 0)):
    img = Image.new("RGBA", (w, h), fill)
    return img, ImageDraw.Draw(img)


def box(d, xy, fill, radius=0):
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=INK)


# ---------------------------------------------------------------- ตัวละคร

def draw_player(direction, coat=PAPER, shirt=TEAL, long_hair=False):
    img, d = canvas(64, 64)
    side = direction in ("east", "west")
    # ขาและรองเท้า
    for x in ((29, 34),) if side else ((25, 30), (33, 38)):
        box(d, (x[0], 49, x[1], 57), SLATE)
        box(d, (x[0] - (0 if side else 0), 56, x[1] + (2 if side else 0), 60), PAPER)
    # ลำตัว: เสื้อกาวน์
    body = (25, 33, 39, 51) if side else (21, 33, 43, 51)
    box(d, body, coat, 2)
    if direction == "south":
        d.rectangle((29, 34, 35, 44), fill=shirt)         # เสื้อโปโล
        d.line((32, 45, 32, 50), fill=MIST)                # สาบเสื้อกาวน์
        d.rectangle((37, 40, 40, 43), fill=TEAL_D)         # บัตรพนักงาน
        box(d, (18, 35, 22, 47), coat, 1)
        box(d, (42, 35, 46, 47), coat, 1)
        d.rectangle((19, 46, 21, 48), fill=SKIN)
        d.rectangle((43, 46, 45, 48), fill=SKIN)
    elif direction == "north":
        d.line((32, 34, 32, 50), fill=MIST)
        box(d, (18, 35, 22, 47), coat, 1)
        box(d, (42, 35, 46, 47), coat, 1)
    else:
        box(d, (30, 36, 35, 47), coat, 1)                  # แขนด้านที่เห็น
        d.rectangle((31, 46, 34, 48), fill=SKIN)
    # หัว
    box(d, (20, 11, 44, 34), SKIN, 6)
    if direction == "south":
        d.rounded_rectangle((20, 11, 44, 20), radius=5, fill=SLATE, outline=INK)
        d.rectangle((21, 18, 23, 24), fill=SLATE)
        d.rectangle((41, 18, 43, 24), fill=SLATE)
        d.rectangle((26, 24, 27, 27), fill=INK)
        d.rectangle((37, 24, 38, 27), fill=INK)
        d.line((30, 30, 34, 30), fill=SKIN_D)
    elif direction == "north":
        d.rounded_rectangle((20, 11, 44, 31), radius=6, fill=SLATE, outline=INK)
    else:
        d.rounded_rectangle((20, 11, 44, 20), radius=5, fill=SLATE, outline=INK)
        d.rectangle((21, 18, 30, 30), fill=SLATE)          # ผมด้านหลังศีรษะ
        d.rectangle((38, 24, 39, 27), fill=INK)
        d.line((40, 30, 42, 30), fill=SKIN_D)
    if long_hair and direction != "south":
        d.rectangle((22, 30, 27, 40) if direction != "north" else (29, 30, 35, 42), fill=SLATE, outline=INK)   # หางม้า
    return img.transpose(Image.FLIP_LEFT_RIGHT) if direction == "west" else img


def draw_player_sheet(**look):
    """แผ่นสไปรต์ชั่วคราว: ทุกเฟรมเป็นท่ายืน เฟรมเดินคู่ขยับขึ้น 1 px"""
    sheet = Image.new("RGBA", (SPRITE_SIZE * (1 + WALK_FRAMES), SPRITE_SIZE * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        pose = draw_player(direction, **look)
        for col in range(1 + WALK_FRAMES):
            sheet.alpha_composite(pose, (col * SPRITE_SIZE, row * SPRITE_SIZE - (1 if col % 2 == 0 and col > 0 else 0)))
    return sheet


def draw_block(width, height, fill, accent=None):
    """วัตถุชั่วคราว: กล่องมนฐานชิดขอบล่าง"""
    img, d = canvas(width, height)
    box(d, (2, max(2, height // 4), width - 3, height - 2), fill, 4)
    if accent:
        d.rectangle((width // 4, height // 2, width - width // 4 - 1, height // 2 + 4), fill=accent)
    return img


def draw_blob(size, fill, eye):
    """ตัวละครฉากต่อสู้ชั่วคราว: ก้อนกลมมีตา"""
    img, d = canvas(size, size)
    d.ellipse((size // 8, size // 5, size - size // 8, size - 4), fill=fill, outline=INK, width=3)
    d.ellipse((size // 3, size // 2 - 8, size // 3 + 12, size // 2 + 4), fill=eye, outline=INK)
    return img


def draw_backdrop(sky, ground):
    img, d = canvas(320, 180, sky)
    d.rectangle((0, 128, 319, 179), fill=ground)
    d.line((0, 128, 319, 128), fill=INK)
    return img


def draw_mentor(direction):
    img, d = canvas(64, 64)
    side = direction in ("east", "west")
    d.line((32, 9, 32, 17), fill=INK, width=2)             # เสาอากาศ
    d.ellipse((29, 5, 35, 11), fill=YELLOW, outline=INK)
    d.ellipse((14, 16, 50, 52), fill=PAPER, outline=INK)   # ลำตัวกลม
    d.arc((16, 18, 48, 50), start=20, end=110, fill=MIST, width=2)
    if direction == "south":
        box(d, (21, 25, 43, 40), SLATE, 4)
        d.rectangle((27, 30, 29, 34), fill=SCREEN)
        d.rectangle((35, 30, 37, 34), fill=SCREEN)
        d.line((29, 37, 35, 37), fill=SCREEN)
    elif direction == "north":
        box(d, (25, 27, 39, 38), MIST, 2)
        for y in (30, 33, 36):
            d.line((28, 35 if y > 40 else y, 36, y), fill=STEEL)
    else:
        box(d, (33, 25, 49, 40), SLATE, 4)
        d.rectangle((41, 30, 43, 34), fill=SCREEN)
    # มือลอย
    hands = ((27, 44, 33, 50),) if side else ((9, 34, 15, 40), (49, 34, 55, 40))
    for h in hands:
        d.ellipse(h, fill=PAPER, outline=INK)
    return img.transpose(Image.FLIP_LEFT_RIGHT) if direction == "west" else img


# ---------------------------------------------------------------- ไทล์

def draw_floor(base, seam):
    img, d = canvas(32, 32, base)
    d.line((0, 31, 31, 31), fill=seam)
    d.line((31, 0, 31, 31), fill=seam)
    d.point((7, 9), fill=seam)
    d.point((22, 20), fill=seam)
    return img


def draw_wall(trim, trim_dark, stripe=None):
    img, d = canvas(32, 32, PAPER)
    d.line((31, 0, 31, 31), fill=MIST)
    d.rectangle((0, 0, 31, 2), fill=MIST)
    d.rectangle((0, 22, 31, 27), fill=trim)
    d.rectangle((0, 28, 31, 31), fill=trim_dark)
    if stripe:
        d.rectangle((0, 18, 31, 19), fill=stripe)
    else:
        d.ellipse((13, 9, 18, 14), fill=trim, outline=trim_dark)   # ไฟสถานะ
    return img


# ---------------------------------------------------------------- วัตถุ

def draw_door(open_):
    img, d = canvas(32, 64)
    box(d, (1, 4, 30, 63), SLATE, 3)
    box(d, (5, 10, 26, 63), INK if open_ else STEEL)
    d.ellipse((13, 5, 18, 9), fill=GREEN if open_ else RED, outline=INK)
    if not open_:
        d.line((16, 10, 16, 63), fill=SLATE)
        d.regular_polygon((16, 36, 6), 6, fill=SLATE, outline=INK)   # ช่องหกเหลี่ยมรอแกน AI
    return img


def draw_terminal():
    img, d = canvas(32, 64)
    box(d, (13, 34, 18, 58), STEEL)
    box(d, (8, 57, 23, 62), SLATE, 2)
    box(d, (5, 14, 26, 36), SLATE, 3)
    d.rectangle((8, 17, 23, 32), fill=SCREEN)
    d.line((10, 21, 21, 21), fill=PAPER)
    d.line((10, 25, 18, 25), fill=PAPER)
    return img


def draw_learning_machine():
    img, d = canvas(64, 64)
    d.polygon(((14, 4), (50, 4), (40, 18), (24, 18)), fill=MIST, outline=INK)   # กรวยรับตัวอย่าง
    for x in (22, 30, 38):
        d.rectangle((x, 1, x + 4, 6), fill=CREAM, outline=INK)                  # การ์ดตัวอย่าง
    box(d, (8, 18, 55, 60), TEAL, 8)
    d.ellipse((22, 26, 42, 46), fill=SLATE, outline=INK)
    d.ellipse((27, 31, 37, 41), fill=TEAL_L, outline=TEAL_D)                    # แกนเรืองแสง
    box(d, (22, 50, 42, 56), INK, 1)                                            # ช่องผลลัพธ์
    d.rectangle((10, 54, 53, 58), fill=TEAL_D)
    return img


def draw_notebook_desk():
    img, d = canvas(64, 64)
    box(d, (6, 28, 57, 44), PAPER, 2)
    for x in (9, 51):
        box(d, (x, 44, x + 4, 60), MIST)
    box(d, (18, 20, 44, 36), CREAM, 1)
    d.line((31, 21, 31, 35), fill=MIST)
    for y in (25, 29):
        d.line((21, y, 28, y), fill=MIST)
        d.line((34, y, 41, y), fill=MIST)
    d.line((46, 24, 52, 32), fill=TEAL_D, width=2)                              # ปากกา
    return img


def draw_pedestal():
    img, d = canvas(32, 64)
    box(d, (9, 40, 22, 60), PAPER, 1)
    box(d, (5, 58, 26, 63), MIST, 2)
    box(d, (6, 36, 25, 41), MIST, 2)
    d.chord((7, 16, 24, 54), start=180, end=360, fill="#DDF6FF", outline=INK)   # โดมแก้ว
    d.line((7, 35, 24, 35), fill=INK)
    return img


def draw_core(room):
    dark, base, light = ROOM_COLORS[room]
    img, d = canvas(32, 32)
    d.polygon(((16, 28), (4, 8), (28, 8)), fill=base, outline=INK)              # เสี้ยวหนึ่งในหกของหกเหลี่ยม
    d.polygon(((16, 23), (9, 11), (16, 11)), fill=light)
    box(d, (13, 12, 19, 17), dark)                                              # สัญลักษณ์กลางเสี้ยว
    return img


# ---------------------------------------------------------------- นำเข้าภาพจริงจาก Pixel Lab

def normalize_sprite(img, postprocess=None):
    """วางตัวละครลงภาพ 64×64 ให้เท้าอยู่ที่จุดยืนของเกม โดยไม่ย่อขยายพิกเซล"""
    img = img.convert("RGBA")
    remove = (postprocess or {}).get("removeColor")
    if remove:
        # ลบเงาพื้นที่ติดมากับภาพ (ตัวละครอื่นไม่มีเงา) เฉพาะแถวล่างตามที่บันทึกไว้
        color = tuple(int(remove["color"][i:i + 2], 16) for i in (1, 3, 5))
        px = img.load()
        for y in range(remove["fromRow"], img.height):
            for x in range(img.width):
                if px[x, y][:3] == color:
                    px[x, y] = (0, 0, 0, 0)
    left, top, right, bottom = img.getbbox()
    content = img.crop((left, top, right, bottom))
    if content.width > SPRITE_SIZE or content.height > FEET_Y:
        raise SystemExit(f"ตัวละครใหญ่เกินกรอบ {SPRITE_SIZE}×{SPRITE_SIZE}: {content.size}")
    out = Image.new("RGBA", (SPRITE_SIZE, SPRITE_SIZE), (0, 0, 0, 0))
    out.alpha_composite(content, (FEET_X - content.width // 2, FEET_Y - content.height))
    return out


def anchor_bottom(img, width, height):
    """วางวัตถุลงภาพขนาดที่เกมใช้ ให้ฐานชิดขอบล่างและอยู่กึ่งกลางแนวนอน โดยไม่ย่อขยายพิกเซล"""
    img = img.convert("RGBA")
    box_ = img.getbbox()
    if box_ is None:
        raise SystemExit("ภาพว่าง")
    content = img.crop(box_)
    if content.width > width or content.height > height:
        raise SystemExit(f"วัตถุใหญ่เกินกรอบ {width}×{height}: {content.size}")
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out.alpha_composite(content, ((width - content.width) // 2, height - content.height))
    return out


def character_sheet(folder):
    """แผ่นสไปรต์ 64×64 ต่อเฟรม: แถว = ทิศ คอลัมน์ 0 = ยืน คอลัมน์ 1.. = เดิน ทุกเฟรมของทิศเดียวกันเลื่อนเท่ากับท่ายืน เท้าจึงไม่กระตุก"""
    sheet = Image.new("RGBA", (SPRITE_SIZE * (1 + WALK_FRAMES), SPRITE_SIZE * len(DIRECTIONS)), (0, 0, 0, 0))
    for row, direction in enumerate(DIRECTIONS):
        idle = Image.open(folder / f"{direction}.png").convert("RGBA")
        left, top, right, bottom = idle.getbbox()
        if right - left > SPRITE_SIZE or bottom - top > FEET_Y:
            raise SystemExit(f"ตัวละครใหญ่เกินกรอบ {SPRITE_SIZE}×{SPRITE_SIZE}: {(right - left, bottom - top)}")
        dx, dy = FEET_X - (right - left) // 2 - left, FEET_Y - bottom
        frames = [idle] + [Image.open(folder / "walk" / f"{direction}_{i}.png").convert("RGBA") for i in range(WALK_FRAMES)]
        for col, frame in enumerate(frames):
            cell = Image.new("RGBA", (SPRITE_SIZE, SPRITE_SIZE), (0, 0, 0, 0))
            cell.paste(frame, (dx, dy), frame)
            sheet.alpha_composite(cell, (col * SPRITE_SIZE, row * SPRITE_SIZE))
    return sheet


def import_generated(asset, source):
    """คืน dict ของ key -> ภาพ จากไฟล์ต้นฉบับใน assets-src/pixellab/<ASSET-ID>/"""
    folder = SOURCES / asset["id"]
    images = {}
    if source["fetchTool"] == "get_topdown_tileset":
        # ชุด Wang 16 ไทล์: เก็บแผ่นไทล์ตามเดิม แล้วบันทึกว่าไทล์ของแต่ละรูปแบบมุมอยู่ที่ frame ใด
        sheet = Image.open(folder / "tileset.png").convert("RGBA")
        meta = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        size = meta["tileset_data"]["tile_size"]["width"]
        wang = {}
        for tile in meta["tileset_data"]["tiles"]:
            box = tile["bounding_box"]
            corners = "".join("1" if tile["corners"][c] == "upper" else "0" for c in ("NW", "NE", "SW", "SE"))
            wang[corners] = (box["y"] // size) * (sheet.width // size) + box["x"] // size
        if len(wang) != 16:
            raise SystemExit(f"{asset['id']}: ชุด Wang ต้องมี 16 รูปแบบมุม แต่พบ {len(wang)}")
        key = next(iter(asset["files"])).rsplit("_", 1)[0]
        asset["files"] = {key: f"tiles/{key}.png"}
        asset["wang"] = {"tileSize": size, "frames": dict(sorted(wang.items()))}
        images[key] = sheet
    elif asset["kind"] == "character":
        key = next(iter(asset["files"]))
        sheet = character_sheet(folder)
        images[key] = sheet
        # ภาพยืนหันหน้าสำหรับหน้าจอ HTML (โปรไฟล์ ร้านค้า หน้าเลือกตัวละคร)
        images[f"{key}_south"] = sheet.crop((0, 0, SPRITE_SIZE, SPRITE_SIZE))
    elif asset["kind"] == "backdrop":
        key = next(iter(asset["web"]))
        scene = Image.open(folder / "image.png").convert("RGB")
        if list(scene.size) != asset["size"]:
            raise SystemExit(f"{asset['id']}: ภาพต้องมีขนาด {asset['size']} แต่ได้ {scene.size}")
        # ฉากที่เจนมาบางภาพมีแถบดำบนล่าง ตัดออก (หน้าเกมขยายฉากให้เต็มกรอบเอง)
        dark = lambda y: max(max(scene.getpixel((x, y))) for x in range(0, scene.width, 4)) < 48
        top, bottom = 0, scene.height
        while top < bottom - 1 and dark(top):
            top += 1
        while bottom > top + 1 and dark(bottom - 1):
            bottom -= 1
        images[key] = scene.crop((0, top, scene.width, bottom))
        asset["size"] = [scene.width, bottom - top]
    elif asset["kind"] in ("icon", "portrait"):
        # ใช้ภาพตามที่เจนมา ต้องได้ขนาดตรงกับที่เกมใช้
        key = next(iter({**asset["files"], **asset.get("web", {})}))
        icon = Image.open(folder / "image.png").convert("RGBA")
        if list(icon.size) != asset["size"]:
            raise SystemExit(f"{asset['id']}: ภาพต้องมีขนาด {asset['size']} แต่ได้ {icon.size}")
        images[key] = icon
    elif asset["kind"] in ("prop", "battle"):
        key = next(iter({**asset["files"], **asset.get("web", {})}))
        try:
            images[key] = anchor_bottom(Image.open(folder / "image.png"), *asset["size"])
        except SystemExit as error:
            raise SystemExit(f"{asset['id']}: {error}")
    else:
        for key in list(asset["files"]):
            direction = key.rsplit("_", 1)[1]
            images[key] = normalize_sprite(Image.open(folder / f"{direction}.png"), source.get("postprocess"))
    return images


# ---------------------------------------------------------------- manifest

def art_guide_prompts():
    """ไฟล์ -> prompt ตามตารางใน docs/ART_GUIDE.md"""
    prompts = {}
    for line in ART_GUIDE.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and re.fullmatch(r"`[a-z0-9_]+`", cells[1]):
            prompts[cells[1].strip("`")] = cells[-1]
    return prompts


# สีชุดของตัวละครชั่วคราว (ใช้เมื่อยังไม่มีภาพจริง)
OUTFIT_COLORS = {"lab": PAPER, "engineer": "#F08C2E", "pilot": "#2A4FA3", "guardian": "#333C57", "researcher": "#C9B27C", "commander": "#FFF4DC"}
# ตัวละครผู้เล่น: (รหัส, แบบ, ชุด) แบบ a = ผมสั้น แบบ b = ผมหางม้า
PLAYER_CHARACTERS = [
    ("CH-01", "a", "lab"), ("CH-07", "b", "lab"),
    ("CH-08", "a", "engineer"), ("CH-09", "a", "pilot"), ("CH-10", "a", "guardian"),
    ("CH-11", "b", "engineer"), ("CH-12", "b", "pilot"), ("CH-13", "b", "guardian"),
    ("CH-14", "a", "researcher"), ("CH-15", "a", "commander"), ("CH-16", "b", "researcher"), ("CH-17", "b", "commander"),
]
# ภาพประกอบเนื้อเรื่องที่เจนจาก Pixel Lab: (รหัส, ไฟล์)
STORY_PANELS = [
    ("ST-01", "st_prologue_1"), ("ST-02", "st_prologue_2"), ("ST-03", "st_prologue_3"), ("ST-04", "st_corridor"), ("ST-05", "st_prologue_5"),
    ("ST-06", "st_field"), ("ST-08", "st_ending_2"), ("ST-09", "st_ending_3"),
]
# ภาพประกอบเนื้อเรื่องที่ประกอบจากฉากหลังกับไคจู: ไฟล์ -> (ฉากหลัง, ภาพไคจู)
STORY_COMPOSITES = {
    **{f"st_kaiju_{n}": (f"bg_battle_{n}", f"bt_kaiju_{n}") for n in range(1, 7)},
    "st_boss_2": ("bg_battle_6", "bt_boss_2"),
    "st_boss_3": ("bg_battle_6", "bt_boss_3"),
}
# บทนำช่องที่ 4: ทางเดินห้องวิจัย + แกน AI ทั้ง 6 ชิ้นของเกม (เจนภาพให้มีลูกแก้วครบ 6 ไม่ได้ จึงวางภาพแกนจริงทับ)
STORY_CORES = ("st_prologue_4", "st_corridor")
# บทส่งท้ายช่องที่ 1: หุ่นการ์เดียนของเกมยืนอยู่ โอเมก้าล้มอยู่ข้างหลัง (ภาพที่เจนได้หุ่นหน้าตาไม่ตรงกับการ์เดียน จึงประกอบจากภาพของเกมเอง)
STORY_VICTORY = ("st_ending_1", "bg_battle_5", "bt_robot", "bt_kaiju_6")
KAIJU_COLORS = {1: "#2FB8AC", 2: "#7B5CE0", 3: "#38B764", 4: "#F08C2E", 5: "#EF6A82", 6: "#2A4FA3"}
# วัตถุประจำห้องจาก docs/ART_GUIDE.md ข้อ 5.3 ที่เกมใช้: (รหัส, ไฟล์, ขนาด)
ROOM_PROPS = [
    ("PR-101", "pr_r1_rule_machine", (64, 64)), ("PR-103", "pr_r1_mail_sorter", (64, 32)), ("PR-104", "pr_r1_photo_board", (64, 32)),
    ("PR-201", "pr_r2_basket_supervised", (64, 64)), ("PR-202", "pr_r2_basket_unsupervised", (64, 64)), ("PR-203", "pr_r2_basket_reinforcement", (64, 64)),
    ("PR-204", "pr_r2_flashcard_desk", (64, 64)), ("PR-206", "pr_r2_maze_arena", (64, 64)),
    ("PR-301", "pr_r3_cabinet_structured", (64, 64)), ("PR-302", "pr_r3_crate_unstructured", (64, 64)), ("PR-303", "pr_r3_server_rack", (32, 64)),
    ("PR-305", "pr_r3_quality_scanner", (64, 64)),
    ("PR-411", "pr_r4_station_collect", (64, 64)), ("PR-412", "pr_r4_station_prepare", (64, 64)), ("PR-413", "pr_r4_station_split", (64, 64)),
    ("PR-414", "pr_r4_station_train", (64, 64)), ("PR-415", "pr_r4_station_evaluate", (64, 64)), ("PR-416", "pr_r4_station_deploy", (64, 64)),
    ("PR-420", "pr_r4_calculator", (64, 64)),
    ("PR-501", "pr_r5_tv", (64, 64)), ("PR-502", "pr_r5_face_phone", (64, 64)), ("PR-503", "pr_r5_speaker", (64, 64)),
    ("PR-504", "pr_r5_shop_kiosk", (64, 64)), ("PR-505", "pr_r5_mailbox", (64, 64)), ("PR-506", "pr_r5_dictation", (64, 64)),
    ("PR-508", "pr_r5_notice_board", (32, 64)),
    ("PR-601", "pr_r6_portal_pc", (64, 64)), ("PR-602", "pr_r6_webcam", (32, 64)), ("PR-606", "pr_r6_result_board", (64, 64)),
    ("PR-607", "pr_r6_checklist_stand", (32, 64)), ("PR-608", "pr_r6_cert_printer", (64, 64)),
]

def art_guide_names():
    """ไฟล์ -> ชื่อชิ้นงานตามตารางใน docs/ART_GUIDE.md"""
    names = {}
    for line in ART_GUIDE.read_text(encoding="utf-8").splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) >= 4 and re.fullmatch(r"`[a-z0-9_]+`", cells[1]):
            names[cells[1].strip("`")] = cells[2]
    return names


def main():
    prompts = art_guide_prompts()
    names = art_guide_names()

    def player(asset_id, who, outfit):
        base = f"ch_{who}_{outfit}"
        look = {"coat": OUTFIT_COLORS[outfit], "long_hair": who == "b"}
        return {
            "id": asset_id, "kind": "character", "name": names[base], "requested": True, "size": [64, 64],
            "files": {base: f"characters/{base}.png"},
            "web": {f"{base}_south": f"characters/{base}_south.png"},
            "sheet": {"frameWidth": SPRITE_SIZE, "frameHeight": SPRITE_SIZE, "directions": list(DIRECTIONS), "walkFrames": WALK_FRAMES},
            "draw": {base: lambda: draw_player_sheet(**look), f"{base}_south": lambda: draw_player("south", **look)},
            "pixellab": {
                "tool": "create_character",
                "arguments": {"description": prompts[base], "name": names[base], **CHARACTER_SETTINGS},
                "fetchTool": "get_character",
                "animate": WALK_ANIMATION,
            },
        }

    def tileset(asset_id, base, name, requested, floor, wall):
        return {
            "id": asset_id, "kind": "tileset", "name": name, "requested": requested, "size": [32, 32],
            "files": {f"{base}_floor": f"tiles/{base}_floor.png", f"{base}_wall": f"tiles/{base}_wall.png"},
            "draw": {f"{base}_floor": floor, f"{base}_wall": wall},
            "pixellab": {
                "tool": "create_topdown_tileset",
                "arguments": {
                    "lower_description": prompts[f"{base}_floor"],
                    "upper_description": prompts[f"{base}_wall"],
                    **TILESET_SETTINGS,
                },
                "fetchTool": "get_topdown_tileset",
            },
        }

    def image(asset_id, base, size, draw, kind, settings, folder, web=False, name=None):
        """ภาพเดี่ยวจาก create_image_pixflux (1 generation) web = ใช้ในหน้า HTML อย่างเดียว ฉากเกมไม่โหลด"""
        files = {base: f"{folder}/{base}.png"}
        return {
            "id": asset_id, "kind": kind, "name": name or names[base], "requested": True, "size": list(size),
            "files": {} if web else files, **({"web": files} if web else {}),
            "draw": {base: draw},
            "pixellab": {
                "tool": "create_image_pixflux",
                "arguments": {"description": prompts[base], "width": size[0], "height": size[1], **settings},
                "fetchTool": "get_image",
            },
        }

    def prop(asset_id, base, size, draw=None, name=None):
        return image(asset_id, base, size, draw or (lambda: draw_block(size[0], size[1], MIST, STEEL)), "prop", OBJECT_SETTINGS, "props", name=name)

    def room_tileset(room):
        dark, base, light = ROOM_COLORS[room]
        return tileset(f"TS-0{room}", f"ts_r{room}", f"ไทล์เซตห้อง {room} {ROOM_NAMES[room]}", True,
                       lambda: draw_floor(light, base), lambda: draw_wall(base, dark))

    def core(room):
        key = f"core_{room}"
        return {
            "id": f"CORE-{room}", "kind": "icon", "name": f"แกน AI ชิ้นที่ {room}", "requested": True, "size": [32, 32],
            "files": {key: f"cores/{key}.png"},
            "draw": {key: lambda: draw_core(room)},
            "pixellab": {
                "tool": "create_image_pixflux",
                "arguments": {"description": prompts[key], **ICON_SETTINGS},
                "fetchTool": "get_image",
            },
        }

    def kaiju(n):
        return image(f"BT-0{n}", f"bt_kaiju_{n}", (128, 128), lambda: draw_blob(128, KAIJU_COLORS[n], YELLOW), "battle",
                     {**BATTLE_SETTINGS, "direction": "west"}, "battle", web=True)

    def backdrop(n):
        dark, base, light = ROOM_COLORS[n]
        return image(f"BG-0{n}", f"bg_battle_{n}", (320, 180), lambda: draw_backdrop(light, dark), "backdrop", BACKDROP_SETTINGS, "battle", web=True)

    # พี่บิตเป็นหุ่นยนต์ทรงกลม เครื่องมือ create_character ใช้โครงร่างมนุษย์เสมอ (ได้หุ่นมีขายาว)
    # จึงเจนเป็นภาพเดี่ยวหันหน้าตรงด้วย create_image_pixflux เกมใช้พี่บิตทิศเดียว
    mentor = {
        "id": "CH-02", "kind": "sprite", "name": "พี่บิต พี่เลี้ยงหุ่นยนต์", "requested": True, "size": [64, 64],
        "files": {"ch_mentor_south": "characters/ch_mentor_south.png"},
        "draw": {"ch_mentor_south": lambda: draw_mentor("south")},
        "pixellab": {
            "tool": "create_image_pixflux",
            "arguments": {"description": prompts["ch_mentor"], **IMAGE_SETTINGS},
            "fetchTool": "get_image",
        },
    }

    assets = [
        *[player(*spec) for spec in PLAYER_CHARACTERS],
        mentor,
        *[room_tileset(room) for room in ROOM_COLORS],
        tileset("TS-00", "ts_common", "ไทล์เซตส่วนกลาง (โถงทางเดิน)", True,
                lambda: draw_floor("#C9D6E0", MIST), lambda: draw_wall(SLATE, INK, stripe=YELLOW)),
        tileset("TS-07", "ts_hangar", "ไทล์เซตโรงเก็บหุ่น", True,
                lambda: draw_floor(STEEL, SLATE), lambda: draw_wall(SLATE, INK, stripe=YELLOW)),
        prop("PR-C01", "pr_door_locked", (32, 64), lambda: draw_door(False)),
        prop("PR-C02", "pr_door_open", (32, 64), lambda: draw_door(True)),
        prop("PR-C03", "pr_core_pedestal", (32, 64), draw_pedestal),
        prop("PR-C04", "pr_station_terminal", (32, 64), draw_terminal),
        prop("PR-C05", "pr_notebook_desk", (64, 64), draw_notebook_desk),
        prop("PR-102", "pr_r1_learning_machine", (64, 64), draw_learning_machine),
        *[prop(asset_id, base, size) for asset_id, base, size in ROOM_PROPS],
        prop("PR-H01", "pr_shop", (64, 64), lambda: draw_block(64, 64, YELLOW, SLATE)),
        prop("PR-H02", "pr_hangar_gate", (64, 64), lambda: draw_block(64, 64, STEEL, YELLOW)),
        prop("PR-H03", "pr_hall_plant", (32, 64), lambda: draw_block(32, 64, GREEN, PAPER)),
        prop("PR-H04", "pr_hall_bench", (64, 32), lambda: draw_block(64, 32, TEAL, SLATE)),
        prop("PR-G01", "pr_robot_dock", (96, 96), lambda: draw_block(96, 96, PAPER, TEAL)),
        prop("PR-G02", "pr_mission_console", (64, 64), lambda: draw_block(64, 64, SLATE, SCREEN)),
        prop("PR-G03", "pr_wardrobe", (32, 64), lambda: draw_block(32, 64, MIST, SLATE)),
        prop("PR-G04", "pr_hologram", (32, 64), lambda: draw_block(32, 64, SCREEN, TEAL)),
        *[core(room) for room in ROOM_COLORS],
        image("BT-00", "bt_robot", (128, 128), lambda: draw_blob(128, PAPER, SCREEN), "battle", {**BATTLE_SETTINGS, "direction": "east"}, "battle", web=True),
        *[kaiju(n) for n in KAIJU_COLORS],
        image("BT-07", "bt_boss_2", (128, 128), lambda: draw_blob(128, RED, YELLOW), "battle", {**BATTLE_SETTINGS, "direction": "west"}, "battle", web=True),
        image("BT-08", "bt_boss_3", (128, 128), lambda: draw_blob(128, INK, YELLOW), "battle", {**BATTLE_SETTINGS, "direction": "west"}, "battle", web=True),
        *[image(asset_id, key, (320, 180), lambda: draw_backdrop(MIST, SLATE), "backdrop", BACKDROP_SETTINGS, "story", web=True) for asset_id, key in STORY_PANELS],
        *[backdrop(n) for n in ROOM_COLORS],
        image("PT-01", "pt_professor", (64, 64), lambda: draw_block(64, 64, SKIN, PAPER), "portrait",
              {"no_background": True, "outline": "single color outline", "shading": "basic shading", "detail": "medium detail"}, "portraits", web=True),
    ]

    out = []
    for asset in assets:
        draw = asset.pop("draw")
        outputs = {**asset["files"], **asset.get("web", {})}
        source_file = SOURCES / asset["id"] / "source.json"
        if source_file.exists():
            source = json.loads(source_file.read_text(encoding="utf-8"))
            images = import_generated(asset, source)
            outputs = {**asset["files"], **asset.get("web", {})}
            asset["status"] = "generated"
            # บันทึกเครื่องมือและ arguments ที่ใช้เจนจริง ไม่ใช่ค่าตั้งต้นของสคริปต์
            asset["pixellab"] = {k: source[k] for k in ("tool", "arguments", "fetchTool", "animate", "id", "generatedAt") if k in source}
            for extra in ("postprocess", "rejected", "note"):
                if source.get(extra):
                    asset[extra] = source[extra]
        else:
            images = {key: draw[key]() for key in outputs}
            asset["status"] = "placeholder"
            asset["pixellab"]["id"] = None
            asset["pixellab"]["generatedAt"] = None
        for key, path in outputs.items():
            target = ASSETS / path
            target.parent.mkdir(parents=True, exist_ok=True)
            images[key].save(target)
        out.append(asset)

    # ภาพประกอบเนื้อเรื่องของแต่ละด่าน: ฉากหลังของด่าน + ไคจูตัวนั้นยืนอยู่ทางขวา (ไม่ใช้เครดิตเจน)
    built = {key: ASSETS / path for a in out for key, path in {**a["files"], **a.get("web", {})}.items()}
    for key, (backdrop_key, kaiju_key) in STORY_COMPOSITES.items():
        scene = Image.open(built[backdrop_key]).convert("RGBA")
        monster = Image.open(built[kaiju_key]).convert("RGBA")
        scene.alpha_composite(monster, (scene.width - monster.width - 24, scene.height - monster.height - 4))
        target = ASSETS / "story" / f"{key}.png"
        target.parent.mkdir(parents=True, exist_ok=True)
        scene.convert("RGB").save(target)
        out.append({"id": key.upper().replace("_", "-"), "kind": "composite", "name": f"ภาพประกอบเนื้อเรื่อง ({backdrop_key} + {kaiju_key})", "requested": False, "size": list(scene.size),
                    "files": {}, "web": {key: f"story/{key}.png"}, "status": "composed", "composedFrom": [backdrop_key, kaiju_key]})

    key, corridor_key = STORY_CORES
    scene = Image.open(built[corridor_key]).convert("RGBA")
    for n in range(1, 7):
        core = Image.open(built[f"core_{n}"]).convert("RGBA")
        core = core.resize((core.width * 2, core.height * 2), Image.NEAREST)
        # สองแถว แถวละสามชิ้น ลอยอยู่กลางทางเดิน
        col, row = (n - 1) % 3, (n - 1) // 3
        x = scene.width // 2 + (col - 1) * 84 - core.width // 2
        y = 22 + row * 62 + (10 if col == 1 else 0)
        scene.alpha_composite(core, (x, y))
    scene.convert("RGB").save(ASSETS / "story" / f"{key}.png")
    out.append({"id": key.upper().replace("_", "-"), "kind": "composite", "name": f"ภาพประกอบเนื้อเรื่อง ({corridor_key} + แกน AI 6 ชิ้น)", "requested": False, "size": list(scene.size),
                "files": {}, "web": {key: f"story/{key}.png"}, "status": "composed", "composedFrom": [corridor_key, *[f"core_{n}" for n in range(1, 7)]]})

    key, backdrop_key, robot_key, kaiju_key = STORY_VICTORY
    scene = Image.open(built[backdrop_key]).convert("RGBA")
    fallen = Image.open(built[kaiju_key]).convert("RGBA").rotate(90, expand=True)
    alpha = fallen.getchannel("A")
    dimmed = ImageEnhance.Color(ImageEnhance.Brightness(fallen.convert("RGB")).enhance(0.6)).enhance(0.5)
    fallen = Image.merge("RGBA", (*dimmed.split(), alpha))
    fallen = fallen.crop(fallen.getbbox())
    scene.alpha_composite(fallen, (scene.width - fallen.width - 10, scene.height - fallen.height - 2))
    robot = Image.open(built[robot_key]).convert("RGBA")
    robot = robot.crop(robot.getbbox())
    scene.alpha_composite(robot, (40, scene.height - robot.height - 4))
    scene.convert("RGB").save(ASSETS / "story" / f"{key}.png")
    out.append({"id": key.upper().replace("_", "-"), "kind": "composite", "name": f"ภาพประกอบเนื้อเรื่อง ({backdrop_key} + {robot_key} + {kaiju_key})", "requested": False, "size": list(scene.size),
                "files": {}, "web": {key: f"story/{key}.png"}, "status": "composed", "composedFrom": [backdrop_key, robot_key, kaiju_key]})

    # ลบไฟล์ภาพที่ไม่มีแอสเซตใดใช้แล้ว
    wanted = {ASSETS / path for a in out for path in [*a["files"].values(), *a.get("web", {}).values()]}
    for stale in ASSETS.rglob("*.png"):
        if stale not in wanted:
            stale.unlink()

    style = re.search(r"```text\n(.+?)\n```", ART_GUIDE.read_text(encoding="utf-8"), re.S).group(1)
    MANIFEST.write_text(json.dumps({
        "generator": "Pixel Lab MCP (https://api.pixellab.ai/mcp)",
        "styleSuffix": style,
        "note": "สร้างโดย scripts/build-assets.py ห้ามแก้ด้วยมือ status placeholder = ภาพชั่วคราวที่สคริปต์วาด, generated = ภาพจริงจาก Pixel Lab (ต้นฉบับอยู่ใน assets-src/pixellab/<id>/ และ pixellab.id คือ id ที่ใช้ดึงซ้ำ) files = ภาพที่ฉากเกมโหลด, web = ภาพที่หน้า HTML ใช้อย่างเดียว",
        "assets": out,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    generated = [a["id"] for a in out if a["status"] == "generated"]
    print(f"ภาพที่ประกอบจากชิ้นอื่น: {sum(1 for a in out if a['status'] == 'composed')}")
    placeholders = [a["id"] for a in out if a["status"] == "placeholder"]
    print(f"เขียน {MANIFEST.relative_to(ROOT)}: {len(out)} แอสเซต, {sum(len(a['files']) + len(a.get('web', {})) for a in out)} ไฟล์ภาพ")
    print(f"ภาพจริงจาก Pixel Lab ({len(generated)}): {', '.join(generated) or '-'}")
    print(f"ภาพชั่วคราว ({len(placeholders)}): {', '.join(placeholders) or '-'}")


if __name__ == "__main__":
    main()
