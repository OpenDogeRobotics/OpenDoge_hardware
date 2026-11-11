"""Build web assets from the OpenDoge sub-assembly STEP file.

Pipeline:
  1. copy the STEP to an ASCII temp path (cascadio cannot open non-ASCII paths)
  2. STEP -> GLB with cascadio (one mesh per part, hierarchy kept)
  3. read the GLB JSON chunk and compute each part's world bounding box / size
  4. write data/parts.json (modules + parts) next to the GLB

Usage:
  python tools/step_to_assets.py
  python tools/step_to_assets.py --tol 0.06 --force
"""

import argparse
import json
import os
import shutil
import struct
import tempfile

import cascadio
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP_FILE = os.path.join(ROOT, "mechanical", "V1.0 全子装配.STEP")
OUT_DIR = os.path.join(ROOT, "web")
MODEL_NAME = "opendoge.glb"
MODULES = "ABCDEFGHIJKLM"

# Module meaning, read off isolated renders of each sub-assembly (see web/?only=A).
# 前 = -Y, 后 = +Y, Z+ / Z- are the two lateral sides.
MODULE_LABELS = {
    "A": "机身主体",
    "B": "髋部舵机座-前-Z+",
    "C": "髋部舵机座-前-Z-",
    "D": "髋部舵机座-后-Z+",
    "E": "髋部舵机座-后-Z-",
    "F": "腿部连杆-前-Z+",
    "G": "腿部连杆-前-Z-",
    "H": "腿部连杆-后-Z+",
    "I": "腿部连杆-后-Z-",
    "J": "腿部总成-前-Z+",
    "K": "腿部总成-前-Z-",
    "L": "腿部总成-后-Z+",
    "M": "腿部总成-后-Z-",
}


def to_ascii_copy(path):
    """cascadio fails on non-ASCII paths, so stage a temporary copy."""
    if all(ord(c) < 128 for c in path):
        return path, None
    fd, tmp = tempfile.mkstemp(suffix=".step")
    os.close(fd)
    shutil.copyfile(path, tmp)
    return tmp, tmp


def convert(step_path, glb_path, tol, force):
    if os.path.exists(glb_path) and not force:
        print(f"reuse {glb_path}")
        return
    tmp = None
    try:
        src, tmp = to_ascii_copy(step_path)
        print(f"converting {step_path} -> {glb_path} (tol={tol}) ...")
        cascadio.step_to_glb(
            src,
            glb_path,
            tol_linear=tol,
            tol_angular=0.5,
            merge_primitives=True,
            use_parallel=True,
        )
        print(f"wrote {glb_path} ({os.path.getsize(glb_path) / 1e6:.1f} MB)")
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)


def load_glb_json(path):
    with open(path, "rb") as f:
        f.read(12)  # magic, version, length
        chunk_len, _ = struct.unpack("<II", f.read(8))
        return json.loads(f.read(chunk_len))


def local_matrix(node):
    if "matrix" in node:
        return np.array(node["matrix"], dtype=float).reshape(4, 4).T
    m = np.eye(4)
    m[:3, 3] = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    m[:3, :3] = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    ) @ np.diag(node.get("scale", [1, 1, 1]))
    return m


def mesh_bounds(gltf, mesh_index):
    lo = np.array([np.inf] * 3)
    hi = np.array([-np.inf] * 3)
    tris = 0
    for prim in gltf["meshes"][mesh_index]["primitives"]:
        acc = gltf["accessors"][prim["attributes"]["POSITION"]]
        lo = np.minimum(lo, acc["min"])
        hi = np.maximum(hi, acc["max"])
        if "indices" in prim:
            tris += gltf["accessors"][prim["indices"]]["count"] // 3
        else:
            tris += acc["count"] // 3
    return lo, hi, tris


def walk(gltf, node_index, matrix, out):
    node = gltf["nodes"][node_index]
    matrix = matrix @ local_matrix(node)
    if "mesh" in node:
        lo, hi, tris = mesh_bounds(gltf, node["mesh"])
        corners = np.array(
            [[x, y, z, 1.0] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])]
        )
        world = (matrix @ corners.T).T[:, :3]
        out.append(
            {
                "node": node["name"],
                "mesh": node["mesh"],
                "bbox": {"min": world.min(0), "max": world.max(0)},
                "tris": tris,
            }
        )
    for child in node.get("children", []):
        walk(gltf, child, matrix, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--step", default=STEP_FILE)
    ap.add_argument("--tol", type=float, default=0.06)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    models_dir = os.path.join(OUT_DIR, "models")
    data_dir = os.path.join(OUT_DIR, "data")
    os.makedirs(models_dir, exist_ok=True)
    os.makedirs(data_dir, exist_ok=True)

    glb_path = os.path.join(models_dir, MODEL_NAME)
    convert(args.step, glb_path, args.tol, args.force)

    gltf = load_glb_json(glb_path)
    scene = gltf["scenes"][gltf.get("scene", 0)]
    root = gltf["nodes"][scene["nodes"][0]]

    modules = []
    parts = []
    part_no = 0
    for i, child_index in enumerate(root.get("children", [])):
        child = gltf["nodes"][child_index]
        leaves = []
        walk(gltf, child_index, np.eye(4), leaves)
        lo = np.min([p["bbox"]["min"] for p in leaves], axis=0)
        hi = np.max([p["bbox"]["max"] for p in leaves], axis=0)
        key = MODULES[i] if i < len(MODULES) else f"M{i + 1}"
        modules.append(
            {
                "key": key,
                "index": i + 1,
                "label": MODULE_LABELS.get(key, f"子装配 {i + 1:02d}"),
                "node": child["name"],
                "partCount": len(leaves),
                "bbox": {"min": (lo * 1000).round(1).tolist(), "max": (hi * 1000).round(1).tolist()},
                "size": ((hi - lo) * 1000).round(1).tolist(),
            }
        )
        for leaf in leaves:
            part_no += 1
            size = (leaf["bbox"]["max"] - leaf["bbox"]["min"]) * 1000
            center = (leaf["bbox"]["max"] + leaf["bbox"]["min"]) * 500
            parts.append(
                {
                    "id": f"P{part_no:03d}",
                    "node": leaf["node"],
                    "mesh": leaf["mesh"],
                    "module": key,
                    "size": size.round(1).tolist(),
                    "center": center.round(1).tolist(),
                    "tris": leaf["tris"],
                }
            )

    all_lo = np.min([m["bbox"]["min"] for m in modules], axis=0)
    all_hi = np.max([m["bbox"]["max"] for m in modules], axis=0)
    annotate_parts(parts)
    data = {
        "meta": {
            "source": os.path.basename(args.step),
            "version": os.path.basename(args.step).split(" ")[0],
            "model": MODEL_NAME,
            "units": "mm",
            "up": "X",
            "tolerance": args.tol,
            "partCount": len(parts),
            "moduleCount": len(modules),
            "triangleCount": int(sum(p["tris"] for p in parts)),
            "bbox": {"min": all_lo.tolist(), "max": all_hi.tolist()},
            "size": (all_hi - all_lo).round(1).tolist(),
        },
        "modules": modules,
        "parts": parts,
    }
    out = os.path.join(data_dir, "parts.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    print(f"{len(modules)} modules, {len(parts)} parts, "
          f"{data['meta']['triangleCount']} tris, size {data['meta']['size']} mm")
    for m in modules:
        print(f"  {m['key']} {m['node']:7s} parts={m['partCount']:3d} size={m['size']}")
    print(f"wrote {out}")
    csv_path = write_csv(data, data_dir)
    print(f"wrote {csv_path}")


def part_type(part):
    biggest = max(part["size"])
    if biggest <= 14:
        return "紧固件"
    if biggest <= 30 and min(part["size"]) <= 3.5:
        return "垫片"
    return {
        "A": "机身零件",
        "F": "连杆零件", "G": "连杆零件", "H": "连杆零件", "I": "连杆零件",
        "J": "腿部零件", "K": "腿部零件", "L": "腿部零件", "M": "腿部零件",
    }.get(part["module"], "髋部零件")


def annotate_parts(parts):
    """Add type, same-shape quantity and a draft name the user can edit in CSV.

    Parts with the same shape share a name (numbered per module), so the CSV and the
    later step list can talk about one part instead of 24 copies.
    """
    from collections import Counter, defaultdict

    def signature(p):
        return (tuple(round(v, 1) for v in p["size"]), p["tris"])

    counts = Counter(signature(p) for p in parts)
    index = defaultdict(dict)
    for p in parts:
        p["type"] = part_type(p)
        p["qty"] = counts[signature(p)]
        shapes = index[(p["module"], p["type"])]
        sig = signature(p)
        if sig not in shapes:
            shapes[sig] = len(shapes) + 1
        p["short"] = f"{p['type']}{shapes[sig]:02d}"
        p["name"] = f"{MODULE_LABELS.get(p['module'], p['module'])}-{p['short']}"


def write_csv(data, data_dir):
    import csv

    labels = {m["key"]: m["label"] for m in data["modules"]}
    path = os.path.join(data_dir, "parts.csv")
    header = [
        "零件ID", "模块", "模块名称", "节点", "类型", "同形数量",
        "尺寸X", "尺寸Y", "尺寸Z", "中心X", "中心Y", "中心Z", "三角面",
        "建议名称", "你的命名", "备注",
    ]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        for p in data["parts"]:
            w.writerow([
                p["id"], p["module"], labels.get(p["module"], ""), p["node"], p["type"], p["qty"],
                *p["size"], *p["center"], p["tris"], p["name"], "", "",
            ])
    return path


if __name__ == "__main__":
    main()
