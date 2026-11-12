"""Draft the assembly step sequence from parts.json.

The STEP file gives sub-assemblies but no assembly order, so this builds a first
skeleton: per module, structural parts first (largest first), fasteners last, in
small steps that can be edited later in data/steps.json.

Usage: python tools/build_steps.py
"""

import json
import os
from collections import OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")

# Sub-assemblies first, then the main body; legs before their links.
MODULE_ORDER = ["A", "B", "C", "D", "E", "J", "K", "L", "M", "F", "G", "H", "I"]

STRUCTURE_PER_STEP = 4
FASTENER_PER_STEP = 10

# 顶部外壳最后安装，否则会挡住机身内部。STEP 坐标 X 向下，顶部即 -X 方向。
# P019 是覆盖整机的大上盖，P023/P002 是叠在它最上面的两层盖板。
TOP_SHELL_IDS = ["P023", "P002", "P019"]


def chunk(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def main():
    data = json.load(open(os.path.join(DATA, "parts.json"), encoding="utf-8"))
    modules = {m["key"]: m for m in data["modules"]}
    by_module = OrderedDict()
    for p in data["parts"]:
        by_module.setdefault(p["module"], []).append(p)

    steps = []
    for key in MODULE_ORDER:
        label = modules[key]["label"]
        parts = [p for p in by_module.get(key, []) if p["id"] not in TOP_SHELL_IDS]
        structure = [p for p in parts if p["type"] not in ("紧固件", "垫片")]
        fasteners = [p for p in parts if p["type"] in ("紧固件", "垫片")]
        structure.sort(key=lambda p: max(p["size"]), reverse=True)

        groups = []
        for group in chunk(structure, STRUCTURE_PER_STEP):
            groups.append(("结构件装配", group))
        for group in chunk(fasteners, FASTENER_PER_STEP):
            groups.append(("紧固件安装", group))

        for i, (kind, group) in enumerate(groups, 1):
            short = []
            for p in group:
                name = p.get("short", p["name"])
                if name not in short:
                    short.append(name)
            preview = "、".join(short[:3]) + (" 等" if len(short) > 3 else "")
            count = len(group)
            steps.append({
                "id": len(steps) + 1,
                "phase": label,
                "module": key,
                "kind": kind,
                "title": f"{label} · {kind} {i}/{len(groups)}",
                "text": f"安装 {preview}（共 {count} 件）。",
                "parts": [p["id"] for p in group],
            })

    shell = [p for p in data["parts"] if p["id"] in TOP_SHELL_IDS]
    if shell:
        steps.append({
            "id": len(steps) + 1,
            "phase": "机身主体",
            "module": "A",
            "kind": "外壳安装",
            "title": "机身主体 · 顶部外壳安装",
            "text": "最后安装顶部外壳：确认线缆走向、舵机零位与内部紧固件都已完成，再合盖锁紧。",
            "parts": [p["id"] for p in shell],
        })

    steps.append({
        "id": len(steps) + 1,
        "phase": "整机检查",
        "module": "",
        "kind": "检查",
        "title": "整机检查",
        "text": "检查四条腿、电池仓与所有紧固件；通电前确认线缆走向与舵机零位。",
        "parts": [],
    })

    out = {
        "meta": {
            "version": "0.1",
            "draft": True,
            "stepCount": len(steps),
            "note": "由 tools/build_steps.py 生成的装配顺序草稿，可手工调整。",
        },
        "steps": steps,
    }
    path = os.path.join(DATA, "steps.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    covered = {pid for s in steps for pid in s["parts"]}
    print(f"{len(steps)} steps, {len(covered)}/{data['meta']['partCount']} parts covered")
    for s in steps[:4]:
        print(f"  {s['id']:2d} {s['title']} ({len(s['parts'])} 件)")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
