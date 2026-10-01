#!/usr/bin/env python3
"""แปลง source/course-content.docx -> src/content/course.json

ข้อความทุกส่วนคัดลอกจากไฟล์ Word โดยตรง ไม่มีการสรุปหรือแต่งเพิ่ม
ต้องใช้ python-docx (pip install python-docx)
"""
import json
import re
import sys
from pathlib import Path

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "course-content.docx"
OUT = ROOT / "src" / "content" / "course.json"

NUMBERED = re.compile(r"^(\d+)\.\s+(.*)$")
UNIT_LINE = re.compile(r"^หน่วยการเรียนรู้\s+(.+?)\s+หัวข้อที่\s+(\d+)\s+เวลา\s+(\d+)\s+นาที$")
COURSE_LINE = re.compile(r"^วิชา\s+(\S+)\s+(.+)$")
CRITERION = re.compile(r"(?:และ)?(\S.*?)\s+(\d+)%")
URL = re.compile(r"https?://\S+")

# ---- ข้อมูลที่มินิเกมต้องใช้ แยกจากประโยคในต้นฉบับ (ดู docs/GDD.md ข้อ 9.2) ----
# คำศัพท์รูปแบบ "คำ (English) คือนิยาม" เรียงต่อกันในย่อหน้าเดียว
TERM = re.compile(r"(?:^| )(\S+ \([A-Za-z][A-Za-z ]*\)) คือ")
# คำเชื่อมหน้าคำศัพท์ที่ไม่ใช่ส่วนของคำ เช่น "ส่วนโมเดล (Model) คือ..."
TERM_CONNECTORS = ("ส่วน",)
ACCURACY_EXAMPLE = re.compile(r"ทดสอบ (\d+) ครั้ง ถูก (\d+) ครั้ง ความแม่นยำ = \((\d+) ÷ (\d+)\) × 100 = (\d+)%")
ACCURACY_QUESTION = re.compile(r"ถูก (\d+) ครั้งจากการทดสอบ (\d+) ครั้ง")
ITEM_LIST = re.compile(r": (.+?) จากนั้น")
MIN_IMAGES = re.compile(r"อย่างน้อยคลาสละ (\d+) ภาพ")
# คำถามสองส่วน "... จากนั้น<ส่วนที่ให้เขียนตอบ>" และกิจกรรมแบบฟอร์ม "เลือก<สิ่งที่เลือก> N ตัวอย่าง แล้วระบุ<ประเด็น...>อย่างละหนึ่งข้อ"
FOLLOW_UP = re.compile(r" จากนั้น(.+)$")
FORM = re.compile(r"^เลือก(.+?) (\d+) ตัวอย่าง แล้วระบุ(.+?)อย่างละหนึ่งข้อ จากนั้น")
NOTES = re.compile(r"^(.+?): (.+)$")


def fail(msg):
    sys.exit(f"convert-content: {msg}")


def split_numbered(lines):
    """คืนรายการข้อความที่ตัดเลขข้อ "N. " ออก (ลำดับใน array แทนเลขข้อ) หรือ None ถ้าไม่ใช่รายการเลขข้อ"""
    items = []
    for i, line in enumerate(lines, start=1):
        m = NUMBERED.match(line)
        if not m or int(m.group(1)) != i:
            return None
        items.append(m.group(2).strip())
    return items


def parse_terms(paragraph):
    """แยกย่อหน้าคำศัพท์เป็นคู่ term/definition คืน None ถ้าย่อหน้าไม่ใช่รายการคำศัพท์ล้วน"""
    matches = list(TERM.finditer(paragraph))
    if len(matches) < 2 or matches[0].start() != 0:
        return None
    terms = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(paragraph)
        term = m.group(1)
        for connector in TERM_CONNECTORS:
            if i > 0 and term.startswith(connector):
                term = term[len(connector):]
        terms.append({"term": term, "definition": paragraph[m.end():end].strip()})
    return terms


def build_section(heading, paragraphs):
    section = {"heading": heading, "body": "\n\n".join(paragraphs)}
    for paragraph in paragraphs:
        terms = parse_terms(paragraph)
        if terms:
            section["terms"] = terms
        m = ACCURACY_EXAMPLE.search(paragraph)
        if m:
            total, correct, c2, t2, percent = map(int, m.groups())
            if (correct, total) != (c2, t2) or correct * 100 != percent * total:
                fail(f"ตัวอย่างคำนวณความแม่นยำไม่สอดคล้องกัน: {m.group(0)!r}")
            section["accuracyCase"] = {"correct": correct, "total": total, "percent": percent}
    return section


def build_question(question, kind):
    item = {"question": question, "type": kind}
    m = ITEM_LIST.search(question)
    if m:
        item["items"] = [w.removeprefix("และ") for w in m.group(1).split()]
    m = ACCURACY_QUESTION.search(question)
    if m:
        item["accuracyCase"] = {"correct": int(m.group(1)), "total": int(m.group(2))}
    m = FORM.search(question)
    if m:
        item["form"] = {
            "subject": m.group(1),
            "examples": int(m.group(2)),
            "aspects": [w.removeprefix("และ") for w in m.group(3).split()],
        }
    m = FOLLOW_UP.search(question)
    if m:
        item["followUp"] = m.group(1)
    return item


def parse_review(heading, paragraphs):
    kind = "activity" if "กิจกรรม" in heading else "open"
    instruction = None
    questions = []
    for text in paragraphs:
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        items = split_numbered(lines)
        if items is None and len(lines) > 1:
            items = split_numbered(lines[1:])
            if items is None:
                fail(f"รูปแบบคำถามทบทวนไม่รู้จัก: {text!r}")
            instruction = lines[0]
        elif items is None:
            items = lines
        questions += [build_question(q, kind) for q in items]
    return instruction, questions


def main():
    doc = docx.Document(str(SRC))
    course = {}
    topics = []
    topic = section = review = None

    for el in doc.element.body.iterchildren():
        tag = el.tag.rsplit("}", 1)[1]

        if tag == "tbl":
            table = Table(el, doc)
            cells = [[c.text.strip() for c in row.cells] for row in table.rows]
            if cells[0][0].startswith("เรื่อง"):
                # ตารางหัวกระดาษของใบเนื้อหา = เริ่มหัวข้อใหม่
                subject, course_line = [l.strip() for l in cells[0][0].split("\n")]
                m = COURSE_LINE.match(course_line)
                if not m:
                    fail(f"อ่านบรรทัดวิชาไม่ได้: {course_line!r}")
                course.update(code=m.group(1), title=m.group(2))
                topic = {
                    "id": None,
                    "title": subject[len("เรื่อง"):].strip(),
                    "minutes": None,
                    "objective": None,
                    "intro": [],
                    "sections": [],
                    "tables": [],
                    "reviewHeading": None,
                    "reviewParagraphs": [],
                }
                topics.append(topic)
                section = review = None
                continue
            if section is None:
                fail(f"พบตารางนอกหัวข้อย่อยในหัวข้อ {topic['id']}")
            topic["tables"].append({
                # ต้นฉบับไม่มีคำบรรยายตาราง จึงใช้ชื่อหัวข้อย่อยที่ตารางอยู่ (ตัดเลขนำหน้า)
                "caption": re.sub(r"^\d+\s+", "", section["heading"]),
                "sectionIndex": len(topic["sections"]) - 1,
                # ตารางอยู่ก่อนหรือหลังย่อหน้าของหัวข้อย่อยนั้นในต้นฉบับ
                "placement": "after-body" if section["paragraphs"] else "before-body",
                "headers": cells[0],
                "rows": cells[1:],
            })
            continue

        if tag != "p":
            continue
        para = Paragraph(el, doc)
        text = para.text.strip()
        if not text:
            continue
        style = para.style.name if para.style is not None else ""

        m = UNIT_LINE.match(text)
        if m:
            course["unit"] = m.group(1)
            topic["id"], topic["minutes"] = int(m.group(2)), int(m.group(3))
        elif text.startswith("วัตถุประสงค์") and topic["objective"] is None:
            topic["objective"] = text[len("วัตถุประสงค์"):].strip()
        elif style == "Title":
            if text != topic["title"]:
                fail(f"ชื่อเรื่องในเนื้อหาไม่ตรงกับหัวกระดาษ: {text!r}")
        elif style.startswith("Heading"):
            if "ทบทวน" in text:
                topic["reviewHeading"], review, section = text, True, None
            else:
                section = {"heading": text, "paragraphs": []}
                topic["sections"].append(section)
                review = None
        elif review:
            topic["reviewParagraphs"].append(text)
        elif section is not None:
            section["paragraphs"].append(text)
        else:
            topic["intro"].append(text)

    out_topics = []
    for t in topics:
        instruction, questions = parse_review(t["reviewHeading"] or "", t["reviewParagraphs"])
        item = {"id": t["id"], "title": t["title"], "minutes": t["minutes"], "objective": t["objective"]}
        if t["intro"]:
            item["intro"] = "\n\n".join(t["intro"])
        item["sections"] = [build_section(s["heading"], s["paragraphs"]) for s in t["sections"]]
        item["tables"] = t["tables"]
        if t["reviewHeading"]:
            item["reviewHeading"] = t["reviewHeading"]
        if instruction:
            item["reviewInstruction"] = instruction
        item["reviewQuestions"] = questions
        out_topics.append(item)

    # ---- finalQuest: จัดโครงสร้างจากหัวข้อ 6 (ข้อความเดียวกับใน topics[5]) ----
    last = topics[-1]
    if "Teachable Machine" not in last["title"]:
        fail("หัวข้อสุดท้ายไม่ใช่ Teachable Machine")

    steps_section = next(s for s in last["sections"] if "ขั้นตอนการปฏิบัติ" in s["heading"])
    steps = split_numbered(steps_section["paragraphs"][0].split("\n"))
    if not steps:
        fail("อ่านขั้นตอนปฏิบัติไม่ได้")
    url = URL.search(steps[0])
    if not url:
        fail("ไม่พบ URL ของ Teachable Machine ในขั้นตอนที่ 1")

    result = last["tables"][0]
    tests_col = result["headers"].index("ครั้งทดสอบ")
    class_rows = [r for r in result["rows"] if r[0] != "รวม"]
    tests = {int(r[tests_col]) for r in class_rows}
    if len(tests) != 1:
        fail("จำนวนครั้งทดสอบแต่ละคลาสไม่เท่ากัน")

    min_images = {int(n) for step in steps for n in MIN_IMAGES.findall(step)}
    if len(min_images) != 1:
        fail("อ่านจำนวนภาพขั้นต่ำต่อคลาสจากขั้นตอนปฏิบัติไม่ได้")

    # หัวข้อย่อยตารางบันทึกผล: บรรทัดแรกคือสูตร บรรทัดที่สองคือ "<ชื่อส่วนบันทึก>: <คำถามนำ...>"
    record_section = next(s for s in last["sections"] if s["paragraphs"] and "=" in s["paragraphs"][0].split("\n")[0])
    formula, notes_line = record_section["paragraphs"][0].split("\n")
    m = NOTES.match(notes_line)
    if not m:
        fail(f"อ่านบรรทัดบันทึกเพิ่มเติมไม่ได้: {notes_line!r}")
    notes = {"label": m.group(1), "prompts": [w.removeprefix("และ") for w in m.group(2).split()]}

    grading = next(
        p for s in last["sections"] for p in s["paragraphs"] if "เกณฑ์ประเมิน:" in p
    ).split("เกณฑ์ประเมิน:", 1)[1]
    criteria = [
        {"criterion": c.strip(), "weightPercent": int(w)} for c, w in CRITERION.findall(grading)
    ]

    data = {
        "course": course,
        "topics": out_topics,
        "finalQuest": {
            "tool": "Teachable Machine",
            "url": url.group(0),
            "steps": steps,
            "minImagesPerClass": min_images.pop(),
            "accuracyFormula": formula,
            "notes": notes,
            "resultTable": {"classes": [r[0] for r in class_rows], "testsPerClass": tests.pop()},
            "gradingCriteria": criteria,
        },
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"เขียน {OUT.relative_to(ROOT)}: {len(out_topics)} topics")


if __name__ == "__main__":
    main()
