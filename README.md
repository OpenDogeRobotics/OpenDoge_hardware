# OpenDoge_hardware

OpenDoge 四足机器人的机械结构设计文件，包含装配体、零件图与导出用的 STEP 文件。

## 目录结构

```
OpenDoge_hardware/
├── 全零件.STEP                  # 整机全部零件 STEP 装配体 (~80 MB)
├── 全子装配.STEP                # 整机子装配 STEP 文件 (~83 MB)
├── OpenDog/                     # SolidWorks 零件文件 (405 个 .SLDPRT)
│   ├── 实体42.SLDPRT
│   ├── 实体71.SLDPRT
│   ├── ...
│   └── 实体400.SLDPRT
```

## 设计说明

- 所有机械零件使用 SolidWorks 设计，零件文件位于 `OpenDog/` 目录下
- `全零件.STEP` 为完整的零件级装配体，可直接导入 Fusion 360、FreeCAD 等软件查看
- `全子装配.STEP` 为子装配层级结构，便于按模块查看
- 结构件适用于 3D 打印（PLA/PETG/尼龙）与 CNC 加工

## 制造建议

1. 使用 STEP 文件导出各零件为 STL 格式用于 3D 打印
2. 机身等大型结构件建议采用 CNC 铝合金加工以增加刚性
3. 足端建议使用橡胶或 TPU 材料以增加抓地力
4. 按 `全子装配.STEP` 的装配层级进行分模块组装

## 许可证

参见仓库 LICENSE 文件。
