# OpenDoge_hardware

OpenDoge 四足机器人的硬件资料仓库，包含机械结构 CAD、外购器件规格书与电路资料。

## 目录结构

```
OpenDoge_hardware/
├── mechanical/                          # 机械结构设计
│   └── V1.0/                            # 当前版本
│       ├── OpenDog/                     # SolidWorks 零件文件 (.SLDPRT)
│       ├── 全零件.STEP                  # 整机全部零件 STEP 装配体 (~80 MB)
│       └── 全子装配.STEP                # 整机子装配 STEP 文件 (~82 MB)
├── datasheets/                          # 器件规格书 & 配套资料
│   ├── dm-imu/                          # DM-IMU-L1 六轴 IMU
│   │   ├── 达妙科技DM-IMU-L1六轴IMU模块使用说明书V1.2.pdf
│   │   ├── 01.模型及图纸/               # 2D 工程图、3D STEP
│   │   ├── 02.例程/                     # CAN / RS485 / ROS2 例程
│   │   ├── 03.上位机/                   # Windows 上位机 (配置工具)
│   │   └── 04.固件/                     # IMU 固件 (.bin)
│   ├── chiwu/                           # 尺物电机驱动板
│   │   ├── SCH_Schematic1_2024-10-10.pdf  # 电路原理图
│   │   └── mi_motor_demo_TB.py            # 电机控制例程
│   └── EL05使用说明书2600428.pdf         # EL05 电机使用说明书
└── README.md
```

## 设计说明

- 所有机械零件使用 SolidWorks 设计，零件文件位于 `mechanical/V1.0/OpenDog/`
- `全零件.STEP` 为完整的零件级装配体，可直接导入 Fusion 360、FreeCAD 等软件查看
- `全子装配.STEP` 为子装配层级结构，便于按模块查看

## 制造建议

1. 使用 STEP 文件导出各零件为 STL 格式用于 3D 打印
2. 机身等大型结构件建议采用 CNC 铝合金加工以增加刚性
3. 足端建议使用橡胶或 TPU 材料以增加抓地力
4. 按 `全子装配.STEP` 的装配层级进行分模块组装

## 许可证

参见仓库 LICENSE 文件。
