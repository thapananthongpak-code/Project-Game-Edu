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

from PIL import Image, ImageDraw

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
OBJECT_SETTINGS = {"view": "low top-down", "outline": "single color outline", "shading": "basic shading", "detail": "medium detail"}


def canvas(w, h, fill=(0, 0, 0, 0)):
    img = Image.new("RGBA", (w, h), fill)
    return img, ImageDraw.Draw(img)


def box(d, xy, fill, radius=0):
    d.rounded_rectangle(xy, radius=radius, fill=fill, outline=INK)


# ---------------------------------------------------------------- ตัวละคร

def draw_player(direction):
    img, d = canvas(64, 64)
    side = direction in ("east", "west")
    # ขาและรองเท้า
    for x in ((29, 34),) if side else ((25, 30), (33, 38)):
        box(d, (x[0], 49, x[1], 57), SLATE)
        box(d, (x[0] - (0 if side else 0), 56, x[1] + (2 if side else 0), 60), PAPER)
    # ลำตัว: เสื้อกาวน์
    body = (25, 33, 39, 51) if side else (21, 33, 43, 51)
    box(d, body, PAPER, 2)
    if direction == "south":
        d.rectangle((29, 34, 35, 44), fill=TEAL)          # เสื้อโปโล
        d.line((32, 45, 32, 50), fill=MIST)                # สาบเสื้อกาวน์
        d.rectangle((37, 40, 40, 43), fill=TEAL_D)         # บัตรพนักงาน
        box(d, (18, 35, 22, 47), PAPER, 1)
        box(d, (42, 35, 46, 47), PAPER, 1)
        d.rectangle((19, 46, 21, 48), fill=SKIN)
        d.rectangle((43, 46, 45, 48), fill=SKIN)
    elif direction == "north":
        d.line((32, 34, 32, 50), fill=MIST)
        box(d, (18, 35, 22, 47), PAPER, 1)
        box(d, (42, 35, 46, 47), PAPER, 1)
    else:
        box(d, (30, 36, 35, 47), PAPER, 1)                 # แขนด้านที่เห็น
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
    return img.transpose(Image.FLIP_LEFT_RIGHT) if direction == "west" else img


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
    elif asset["kind"] == "icon":
        # ไอคอนใช้ภาพตามที่เจนมา ต้องได้ขนาดตรงกับที่เกมใช้
        key = next(iter(asset["files"]))
        icon = Image.open(folder / "image.png").convert("RGBA")
        if list(icon.size) != asset["size"]:
            raise SystemExit(f"{asset['id']}: ไอคอนต้องมีขนาด {asset['size']} แต่ได้ {icon.size}")
        images[key] = icon
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


def main():
    prompts = art_guide_prompts()
    directions = ("south", "north", "east", "west")

    def character(asset_id, base, name, draw):
        return {
            "id": asset_id, "kind": "character", "name": name, "requested": True, "size": [64, 64],
            "files": {f"{base}_{d}": f"characters/{base}_{d}.png" for d in directions},
            "draw": {f"{base}_{d}": (lambda d=d: draw(d)) for d in directions},
            "pixellab": {
                "tool": "create_character",
                "arguments": {"description": prompts[base], "name": name, **CHARACTER_SETTINGS},
                "fetchTool": "get_character",
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

    def prop(asset_id, base, name, size, draw, folder="props"):
        return {
            "id": asset_id, "kind": "prop", "name": name, "requested": False, "size": list(size),
            "files": {base: f"{folder}/{base}.png"},
            "draw": {base: draw},
            "pixellab": {
                "tool": "create_map_object",
                "arguments": {"description": prompts[base], "width": size[0], "height": size[1], **OBJECT_SETTINGS},
                "fetchTool": "get_map_object",
            },
        }

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
        character("CH-01", "ch_player", "นักฝึกงาน (ผู้เล่น) 4 ทิศ", draw_player),
        mentor,
        *[room_tileset(room) for room in ROOM_COLORS],
        tileset("TS-00", "ts_common", "ไทล์เซตส่วนกลาง (โถงทางเดิน)", False,
                lambda: draw_floor("#C9D6E0", MIST), lambda: draw_wall(SLATE, INK, stripe=YELLOW)),
        prop("PR-C01", "pr_door_locked", "ประตูล็อก", (32, 64), lambda: draw_door(False)),
        prop("PR-C02", "pr_door_open", "ประตูเปิด", (32, 64), lambda: draw_door(True)),
        prop("PR-C03", "pr_core_pedestal", "แท่นวางแกน AI", (32, 64), draw_pedestal),
        prop("PR-C04", "pr_station_terminal", "เสาสถานี", (32, 64), draw_terminal),
        prop("PR-C05", "pr_notebook_desk", "โต๊ะสมุดบันทึก", (64, 64), draw_notebook_desk),
        prop("PR-102", "pr_r1_learning_machine", "เครื่อง Machine Learning (เครื่องฝึกของมินิเกม ใช้ทุกห้อง)", (64, 64), draw_learning_machine),
        *[core(room) for room in ROOM_COLORS],
    ]

    out = []
    for asset in assets:
        draw = asset.pop("draw")
        source_file = SOURCES / asset["id"] / "source.json"
        if source_file.exists():
            source = json.loads(source_file.read_text(encoding="utf-8"))
            images = import_generated(asset, source)
            asset["status"] = "generated"
            # บันทึกเครื่องมือและ arguments ที่ใช้เจนจริง ไม่ใช่ค่าตั้งต้นของสคริปต์
            asset["pixellab"] = {k: source[k] for k in ("tool", "arguments", "fetchTool", "id", "generatedAt")}
            for extra in ("postprocess", "rejected", "note"):
                if source.get(extra):
                    asset[extra] = source[extra]
        else:
            images = {key: draw[key]() for key in asset["files"]}
            asset["status"] = "placeholder"
            asset["pixellab"]["id"] = None
            asset["pixellab"]["generatedAt"] = None
        for key, path in asset["files"].items():
            target = ASSETS / path
            target.parent.mkdir(parents=True, exist_ok=True)
            images[key].save(target)
        out.append(asset)

    # ลบไฟล์ภาพที่ไม่มีแอสเซตใดใช้แล้ว
    wanted = {ASSETS / path for a in out for path in a["files"].values()}
    for stale in ASSETS.rglob("*.png"):
        if stale not in wanted:
            stale.unlink()

    style = re.search(r"```text\n(.+?)\n```", ART_GUIDE.read_text(encoding="utf-8"), re.S).group(1)
    MANIFEST.write_text(json.dumps({
        "generator": "Pixel Lab MCP (https://api.pixellab.ai/mcp)",
        "styleSuffix": style,
        "note": "สร้างโดย scripts/build-assets.py ห้ามแก้ด้วยมือ status placeholder = ภาพชั่วคราวที่สคริปต์วาด, generated = ภาพจริงจาก Pixel Lab (ต้นฉบับอยู่ใน assets-src/pixellab/<id>/ และ pixellab.id คือ id ที่ใช้ดึงซ้ำ)",
        "assets": out,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    generated = [a["id"] for a in out if a["status"] == "generated"]
    print(f"เขียน {MANIFEST.relative_to(ROOT)}: {len(out)} แอสเซต, {sum(len(a['files']) for a in out)} ไฟล์ภาพ, ภาพจริงจาก Pixel Lab: {', '.join(generated) or '-'}")


if __name__ == "__main__":
    main()
