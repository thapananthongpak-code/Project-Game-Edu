#!/usr/bin/env python3
"""ตรวจทาน src/content/course.json เทียบกับ source/course-content.docx ทีละหัวข้อ

อ่านข้อความจาก XML ของไฟล์ Word โดยตรง (ไม่ใช้ตัวแปลงใน convert-content.py)
แล้วเทียบเป็นรายบรรทัดสองทาง: ต้นฉบับ -> JSON (ตกหล่น) และ JSON -> ต้นฉบับ (แต่งเพิ่ม)
"""
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "course-content.docx"
OUT = ROOT / "src" / "content" / "course.json"
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

# บรรทัดในหัวกระดาษที่เป็นข้อมูลการจัดหน้า ไม่ได้นำเข้า course.json โดยเจตนา
LAYOUT_ONLY = re.compile(r"^(ใบเนื้อหา|แผ่นที่ \d+/\d+ หน้าที่ \d+/\d+)$")


def norm(line):
    """ยุบช่องว่าง และตัดเลขข้อ "N. " (ใน JSON ลำดับของ array แทนเลขข้อ)"""
    line = re.sub(r"\s+", " ", line).strip()
    return re.sub(r"^\d+\.\s+", "", line)


def para_lines(p):
    text = ""
    for node in p.iter():
        if node.tag == W + "t":
            text += node.text or ""
        elif node.tag in (W + "br", W + "cr"):
            text += "\n"
        elif node.tag == W + "tab":
            text += " "
    return [l for l in text.split("\n") if l.strip()]


def docx_topics():
    """คืนรายการบรรทัดของแต่ละใบเนื้อหา โดยแบ่งที่ตารางหัวกระดาษ (เซลล์แรกขึ้นต้นด้วย "เรื่อง")"""
    with zipfile.ZipFile(SRC) as z:
        body = ET.fromstring(z.read("word/document.xml")).find(W + "body")
    topics = []
    for el in body:
        if el.tag == W + "tbl":
            lines = [l for p in el.iter(W + "p") for l in para_lines(p)]
            if lines and lines[0].startswith("เรื่อง"):
                topics.append([])
        elif el.tag == W + "p":
            lines = para_lines(el)
        else:
            continue
        topics[-1].extend(lines)
    return topics


def json_lines(course, t):
    lines = [
        f"เรื่อง {t['title']}",
        f"วิชา {course['code']} {course['title']}",
        f"หน่วยการเรียนรู้ {course['unit']} หัวข้อที่ {t['id']} เวลา {t['minutes']} นาที",
        f"วัตถุประสงค์ {t['objective']}",
    ]
    lines += t.get("intro", "").split("\n")
    for s in t["sections"]:
        lines.append(s["heading"])
        lines += s["body"].split("\n")
    for tb in t["tables"]:
        lines += tb["headers"]
        lines += [cell for row in tb["rows"] for cell in row]
    lines.append(t.get("reviewHeading", ""))
    lines.append(t.get("reviewInstruction", ""))
    lines += [q["question"] for q in t["reviewQuestions"]]
    return [l for l in lines if l.strip()]


def main():
    data = json.loads(OUT.read_text(encoding="utf-8"))
    source = docx_topics()
    problems = 0

    if len(source) != len(data["topics"]):
        print(f"จำนวนหัวข้อไม่ตรงกัน: ต้นฉบับ {len(source)} / JSON {len(data['topics'])}")
        problems += 1

    for src_lines, t in zip(source, data["topics"]):
        src = Counter(norm(l) for l in src_lines)
        skipped = [l for l in src if LAYOUT_ONLY.match(l)]
        for l in skipped:
            del src[l]
        # หัวข้อ 1 พิมพ์ชื่อเรื่องซ้ำในเนื้อหา (สไตล์ Title) ซึ่งเก็บใน title แล้ว
        if src[t["title"]] > 0:
            src[t["title"]] -= 1
            skipped.append(t["title"] + " (ชื่อเรื่องซ้ำ)")

        out = Counter(norm(l) for l in json_lines(data["course"], t))
        missing = src - out
        extra = out - src
        chars = sum(len(l) * n for l, n in src.items())

        print(
            f"หัวข้อ {t['id']} {t['title']}: "
            f"{len(t['sections'])} หัวข้อย่อย, {len(t['tables'])} ตาราง, "
            f"{len(t['reviewQuestions'])} คำถาม/กิจกรรม, {sum(src.values())} บรรทัด {chars} อักขระ -> "
            + ("ตรงกันทุกบรรทัด" if not missing and not extra else "ไม่ตรง")
        )
        for l in missing.elements():
            print(f"    ตกหล่น (มีในต้นฉบับ ไม่มีใน JSON): {l}")
        for l in extra.elements():
            print(f"    เกินมา (มีใน JSON ไม่มีในต้นฉบับ): {l}")
        for l in skipped:
            print(f"    ไม่นำเข้าโดยเจตนา: {l}")
        problems += sum(missing.values()) + sum(extra.values())

    # ข้อมูลที่แยกจากประโยคให้มินิเกมใช้ ต้องประกอบกลับเป็นประโยคในต้นฉบับได้
    derived = {}
    for src_lines, t in zip(source, data["topics"]):
        lines = [norm(l) for l in src_lines]
        text = " ".join(lines)
        at = f"หัวข้อ {t['id']}"
        for j, s in enumerate(t["sections"]):
            if "terms" in s:
                pieces = [f"{x['term']} คือ{x['definition']}" for x in s["terms"]]
                line = next((l for l in lines if pieces[0] in l), "")
                for piece in pieces:
                    line = line.replace(piece, "", 1)
                # ส่วนที่เหลือหลังตัดทุกคู่ออกต้องเป็นคำเชื่อมเท่านั้น
                derived[f"{at} sections[{j}].terms {len(pieces)} คู่ ครอบคลุมทั้งย่อหน้า"] = line.split() in ([], ["ส่วน"])
            if "accuracyCase" in s:
                c = s["accuracyCase"]
                example = f"ทดสอบ {c['total']} ครั้ง ถูก {c['correct']} ครั้ง ความแม่นยำ = ({c['correct']} ÷ {c['total']}) × 100 = {c['percent']}%"
                derived[f"{at} sections[{j}].accuracyCase ตรงกับตัวอย่างคำนวณ"] = example in text
        for j, tb in enumerate(t["tables"]):
            body = t["sections"][tb["sectionIndex"]]["body"]
            if body:
                start = lines.index(norm(t["sections"][tb["sectionIndex"]]["heading"]))
                table_at = lines.index(tb["headers"][0], start)
                body_at = lines.index(norm(body.split("\n")[0]), start)
                derived[f"{at} tables[{j}].placement = {tb['placement']}"] = (
                    tb["placement"] == ("after-body" if body_at < table_at else "before-body")
                )
        for j, q in enumerate(t["reviewQuestions"]):
            if "items" in q:
                listed = " ".join(q["items"][:-1]) + " และ" + q["items"][-1]
                derived[f"{at} reviewQuestions[{j}].items {len(q['items'])} ชิ้น"] = f": {listed} จากนั้น" in text
            if "accuracyCase" in q:
                c = q["accuracyCase"]
                derived[f"{at} reviewQuestions[{j}].accuracyCase"] = (
                    f"ถูก {c['correct']} ครั้งจากการทดสอบ {c['total']} ครั้ง" in text
                )
            if "followUp" in q:
                derived[f"{at} reviewQuestions[{j}].followUp"] = f" จากนั้น{q['followUp']}" in text and norm(q["question"]).endswith(q["followUp"])
            if "form" in q:
                f = q["form"]
                aspects = " ".join(f["aspects"][:-1]) + " และ" + f["aspects"][-1]
                rebuilt = f"เลือก{f['subject']} {f['examples']} ตัวอย่าง แล้วระบุ{aspects}อย่างละหนึ่งข้อ จากนั้น{q['followUp']}"
                derived[f"{at} reviewQuestions[{j}].form ประกอบกลับเป็นคำถามเดิมได้"] = rebuilt == norm(q["question"])
    print("ข้อมูลที่แยกจากประโยค:")
    for label, ok in derived.items():
        print(f"    {'ผ่าน' if ok else 'ไม่ผ่าน'}: {label}")
        problems += 0 if ok else 1

    # finalQuest ต้องเป็นข้อความชุดเดียวกับหัวข้อสุดท้าย
    fq, last = data["finalQuest"], source[-1]
    last_norm = [norm(l) for l in last]
    last_text = " ".join(last_norm)
    numbered = [norm(l) for l in last if re.match(r"^\d+\.\s", l)]
    class_tests = {c: last_norm[last_norm.index(c) + 2] for c in fq["resultTable"]["classes"] if c in last_norm}
    checks = {
        f"steps {len(fq['steps'])} ขั้นตอนตรงกับต้นฉบับ": fq["steps"] == numbered,
        "url ปรากฏในต้นฉบับ": fq["url"] in last_text,
        "tool ปรากฏในต้นฉบับ": fq["tool"] in last_text,
        "resultTable.classes และ testsPerClass ตรงกับตารางบันทึกผล": class_tests
        == {c: str(fq["resultTable"]["testsPerClass"]) for c in fq["resultTable"]["classes"]},
        f"gradingCriteria {len(fq['gradingCriteria'])} ข้อปรากฏในต้นฉบับพร้อมน้ำหนัก": all(
            f"{c['criterion']} {c['weightPercent']}%" in last_text for c in fq["gradingCriteria"]
        ),
        "น้ำหนักเกณฑ์รวม 100%": sum(c["weightPercent"] for c in fq["gradingCriteria"]) == 100,
        f"minImagesPerClass {fq['minImagesPerClass']} ตรงกับขั้นตอนปฏิบัติ": f"อย่างน้อยคลาสละ {fq['minImagesPerClass']} ภาพ"
        in last_text,
        "accuracyFormula เป็นบรรทัดในต้นฉบับ": norm(fq["accuracyFormula"]) in last_norm,
        f"notes {len(fq['notes']['prompts'])} ข้อประกอบกลับเป็นบรรทัดเดิมได้": (
            f"{fq['notes']['label']}: " + " ".join(fq["notes"]["prompts"][:-1]) + " และ" + fq["notes"]["prompts"][-1]
        )
        in last_norm,
    }
    print("finalQuest:")
    for label, ok in checks.items():
        print(f"    {'ผ่าน' if ok else 'ไม่ผ่าน'}: {label}")
        problems += 0 if ok else 1

    print("สรุป: " + ("แปลงครบถ้วน ไม่มีส่วนตกหล่นหรือแต่งเพิ่ม" if problems == 0 else f"พบ {problems} จุดที่ไม่ตรง"))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
