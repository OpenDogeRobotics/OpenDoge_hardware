# OpenDoge_hardware

OpenDoge 四足机器人的硬件资料仓库：机械结构 CAD、器件规格书，以及一个可本地运行的装配指南网页。

## 目录结构

```
OpenDoge_hardware/
├── mechanical/                          # 机械结构
│   ├── V1.0 全子装配.STEP               # V1.0 子装配级装配体（网页模型的数据来源）
│   ├── V1.0 全零件.STEP                 # V1.0 零件级装配体
│   ├── V1.0 OpenDogn20260114_x_t.SLDPRT # V1.0 SolidWorks 零件
│   └── V1.1/                            # 当前版本结构（SolidWorks）
│       ├── OpenDog.SLDASM               # 整机装配体（需 SolidWorks 打开）
│       ├── base.STEP / base.3mf         # 机身底座模型与打印文件
│       ├── 3D_PCB1_2025-08-21.step      # 主控 PCB 模型
│       ├── OPi5_pcb_asm-0809.stp        # Orange Pi 5 板卡模型
│       └── 实体*.SLDPRT 等              # 各零件文件
├── OpenDog.SLDASM/                      # 由 V1.1 装配体导出的 ROS URDF 包
│   ├── urdf/                            # URDF 与质量属性
│   ├── meshes/                          # 各 link 的 STL 网格
│   └── launch/                          # RViz / Gazebo 启动文件
├── datasheets/                          # 器件规格书与配套资料
│   ├── dm-imu/                          # 达妙 DM-IMU-L1 六轴 IMU
│   │   ├── 达妙科技DM-IMU-L1六轴IMU模块使用说明书V1.2.pdf
│   │   ├── 01.模型及图纸/               # 2D 工程图、3D STEP
│   │   ├── 02.例程/                     # CAN / RS485 / ROS2 例程
│   │   ├── 03.上位机/                   # Windows 上位机（配置工具）
│   │   └── 04.固件/                     # IMU 固件（.bin）
│   ├── chiwu/                           # 尺物电机驱动板
│   │   ├── SCH_Schematic1_2024-10-10.pdf   # 电路原理图
│   │   └── mi_motor_demo_TB.py             # 电机控制例程
│   ├── OrangePI5/                       # Orange Pi 5 相关资料
│   └── EL05使用说明书2600428.pdf        # EL05 电机使用说明书
├── web/                                 # 装配指南网页（GitHub Pages 发布目录）
│   ├── index.html                       # 网页入口
│   ├── app.js / style.css
│   ├── data/parts.json                  # 零件清单、模块与整机尺寸
│   ├── data/steps.json                  # 装配步骤
│   ├── data/parts.csv                   # 零件命名核对表
│   ├── models/opendoge.glb              # 网页三维模型
│   └── vendor/three/                    # three.js 与 addons（已内置，离线可用）
├── tools/                               # 资源生成与本地预览脚本
│   ├── serve.py                         # 本地静态服务器（正确的 MIME 类型）
│   ├── step_to_assets.py                # STEP → GLB + parts.json
│   ├── build_steps.py                   # 由 parts.json 生成装配步骤
│   └── apply_names.py                   # 把 parts.csv 的命名回写到 parts.json
├── start.bat                            # Windows 一键启动本地预览
└── .github/workflows/pages.yml          # 推送到 main 自动发布 web/ 到 GitHub Pages
```

## 本地预览装配指南

网页入口是 `web/index.html`。**不要直接双击打开**：浏览器的 `file://` 限制会拦截 ES module 和 `fetch`，模型与数据都加载不出来。需要用一个静态服务器托管 `web/`：

最简单的方式：

- Windows：双击仓库根目录的 `start.bat`
- 或者任意系统：在仓库根目录执行 `python tools/serve.py --open`

然后访问 <http://localhost:8000/>。

其他用法：

```bash
python tools/serve.py            # 仅启动服务，手动打开 http://localhost:8000/
python tools/serve.py 8081       # 换端口
python tools/serve.py --open     # 启动后自动打开浏览器
```

环境要求只有 Python 3，不需要 Node.js，也不需要联网（three.js 已随仓库内置）。

### 页面功能

- **装配步骤**：按步骤回放装配过程，本步零件橙色高亮、已安装零件灰色显示，镜头会随零件位置自动换角度。
- **模块预览**：13 个子装配按颜色区分，可单独显隐、点击行聚焦；拖动「爆炸」滑块可查看整机爆炸图。
- **零件检索**：按名称、编号或尺寸搜索零件，点击结果定位并高亮。
- **重置视角**：回到整机全景（镜头被拖乱或聚焦太近时使用）。
- 页面标题右侧显示当前模型版本号（如「模型 V1.0」）。

## 重新生成网页模型（可选）

只有修改了机械模型或想更新零件数据时才需要。依赖：

```bash
pip install cascadio numpy
```

生成流程：

```bash
python tools/step_to_assets.py --force   # STEP → web/models/opendoge.glb + web/data/parts.json + parts.csv
python tools/build_steps.py              # 由 parts.json 生成 web/data/steps.json
```

- `step_to_assets.py` 默认读取 `mechanical/V1.0 全子装配.STEP`，也可以通过 `--step` 指定其它 STEP 文件。
- 零件命名：在 `web/data/parts.csv` 的「你的命名」列填写后执行 `python tools/apply_names.py`，会同步更新 `parts.json` 并重建 `steps.json`。
- 网页标题右侧的模型版本号来自 `parts.json` 的 `meta.version`，由 STEP 文件名自动推导（如 `V1.0`）。

## 发布到 GitHub Pages

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**。
2. 推送到 `main` 分支且改动包含 `web/**` 或 `.github/workflows/pages.yml` 时，工作流会自动部署 `web/` 目录。
3. 站点根目录就是 `web/`，页面内全部使用相对路径，部署后无需修改。

## 设计说明

- 机械零件使用 SolidWorks 设计；V1.1 整机装配体为 `mechanical/V1.1/OpenDog.SLDASM`（需 SolidWorks 打开）。
- `mechanical/V1.0 全子装配.STEP` 与 `V1.0 全零件.STEP` 可直接导入 Fusion 360、FreeCAD 等软件查看。
- `OpenDog.SLDASM/` 是从 V1.1 装配体导出的 URDF 包，便于在 ROS / RViz / Gazebo 中加载查看。

## 制造建议

1. 使用 STEP 文件导出各零件为 STL 格式用于 3D 打印。
2. 机身等大型结构件建议采用 CNC 铝合金加工以增加刚性。
3. 足端建议使用橡胶或 TPU 材料以增加抓地力。
4. 按子装配层级分模块组装。
