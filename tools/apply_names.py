"""Apply the names you filled into parts.csv back to parts.json.

1. read 零件ID -> 你的命名 from web/data/parts.csv
2. overwrite part["name"] for every filled row
3. rewrite 建议名称 in the CSV so it reflects what was applied
4. regenerate web/data/steps.json so the step text uses the new names

Usage:
  python tools/apply_names.py
"""

import csv
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")
CSV_PATH = os.path.join(DATA, "parts.csv")
PARTS_PATH = os.path.join(DATA, "parts.json")
STEPS_SCRIPT = os.path.join(ROOT, "tools", "build_steps.py")


def main():
    if not os.path.exists(CSV_PATH):
        sys.exit(f"找不到 {CSV_PATH}，请先运行 tools/step_to_assets.py")

    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames or []
        rows = list(reader)

    if "你的命名" not in fields:
        sys.exit("parts.csv 缺少「你的命名」列")

    names = {}
    for row in rows:
        pid = (row.get("零件ID") or "").strip()
        name = (row.get("你的命名") or "").strip()
        if pid and name:
            names[pid] = name

    if not names:
        print("「你的命名」列还是空的，没有修改任何内容。")
        return

    data = json.load(open(PARTS_PATH, encoding="utf-8"))
    changed = 0
    for part in data["parts"]:
        name = names.get(part["id"])
        if name and part["name"] != name:
            part["name"] = name
            changed += 1

    with open(PARTS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    for row in rows:
        pid = (row.get("零件ID") or "").strip()
        if pid in names:
            row["建议名称"] = names[pid]
    with open(CSV_PATH, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    print(f"应用了 {len(names)} 条命名，其中 {changed} 个零件名发生变化")
    print(f"wrote {PARTS_PATH}")

    subprocess.run([sys.executable, STEPS_SCRIPT], check=True)


if __name__ == "__main__":
    main()
