import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const PALETTE = [
  0x5cc8ff, 0x6dd39a, 0xf2c46b, 0xef7d7d, 0xc58cff, 0xff9a3d, 0x4dd0c1,
  0xff7ac6, 0x9bd35c, 0x7d9bff, 0xd9a86b, 0x8fd3ff, 0xc9d36d,
];

const els = {
  stats: document.getElementById('stats'),
  rows: document.getElementById('rows'),
  moduleCount: document.getElementById('moduleCount'),
  modulePanel: document.getElementById('modulePanel'),
  stepPanel: document.getElementById('stepPanel'),
  tabSteps: document.getElementById('tab-steps'),
  tabModules: document.getElementById('tab-modules'),
  status: document.getElementById('status'),
  tooltip: document.getElementById('tooltip'),
  explode: document.getElementById('explode'),
  colorByModule: document.getElementById('colorByModule'),
  reset: document.getElementById('reset'),
  slider: document.getElementById('slider'),
  count: document.getElementById('count'),
  phase: document.getElementById('phase'),
  title: document.getElementById('title'),
  text: document.getElementById('text'),
  parts: document.getElementById('parts'),
  partCount: document.getElementById('partCount'),
  play: document.getElementById('play'),
  progressText: document.getElementById('progressText'),
  first: document.getElementById('first'),
  prev: document.getElementById('prev'),
  next: document.getElementById('next'),
  last: document.getElementById('last'),
  search: document.getElementById('search'),
  results: document.getElementById('results'),
  modelVersion: document.getElementById('modelVersion'),
};

const view = document.getElementById('view');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e141b);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 20);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
view.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.95;

scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2530, 1.15));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(0.8, 1.2, 1.0);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x9ec8ff, 0.8);
fillLight.position.set(-1.0, 0.4, -0.8);
scene.add(fillLight);

const grid = new THREE.GridHelper(1.2, 24, 0x2a3b4d, 0x1b2836);
scene.add(grid);

const root = new THREE.Group();
scene.add(root);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const hoverMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0x1d6d94, emissiveIntensity: 1, roughness: 0.35, metalness: 0.1,
});
const installedMaterial = new THREE.MeshStandardMaterial({
  color: 0x7f93a8, roughness: 0.68, metalness: 0.14,
});
const currentMaterial = new THREE.MeshStandardMaterial({
  color: 0xff9a3d, roughness: 0.42, metalness: 0.1, emissive: 0x7a3200, emissiveIntensity: 0.55,
});

const state = { mode: 'steps', step: 1, playing: false, timer: null };
const FLY_MS = 460;

/* ---- 取景 ----------------------------------------------------------------
   两个目标：① 镜头抬高、拉远，始终能看到整机而不是贴着一个零件；
            ② 跟随步骤时自动挑一个不被其他零件挡住的角度。 */
const FRAME_PADDING = 1.45;   // 包围球到镜头的距离放大系数
const STEP_MIN_SPAN = 0.5;    // 单步取景至少撑到整机半径的 50%，保留全局上下文
const HIGH_DIR = new THREE.Vector3(0.82, 1.0, 0.86).normalize(); // 默认高俯角
const MAX_OCCLUSION_TARGETS = 24; // 零件太多时不做遮挡计算（意义不大且更慢）
let viewDirs = null;
let lastViewDir = null;           // 上一个机位，用来避免连续步骤停在同一角度

let data = null;
let steps = [];
let moduleGroups = [];
let partMeshes = [];
let meshByPart = new Map();
let partById = new Map();
let modelCenter = new THREE.Vector3();
let modelSize = new THREE.Vector3();
let hovered = null;
let tween = null;
let searchIndex = [];
let flyQueue = [];

init();

async function init() {
  if (new URLSearchParams(location.search).get('bare')) {
    document.body.classList.add('bare');
    document.querySelector('aside')?.remove();
  }
  resize();
  window.addEventListener('resize', resize);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerleave', () => { setHover(null); els.tooltip.hidden = true; });
  els.explode.addEventListener('input', applyExplode);
  els.colorByModule.addEventListener('change', applyModuleColors);
  els.reset.addEventListener('click', resetView);
  els.first.addEventListener('click', () => setStep(1));
  els.prev.addEventListener('click', () => setStep(state.step - 1));
  els.next.addEventListener('click', () => setStep(state.step + 1));
  els.last.addEventListener('click', () => setStep(steps.length));
  els.slider.addEventListener('input', () => setStep(parseInt(els.slider.value, 10)));
  els.play.addEventListener('click', togglePlay);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') setStep(state.step - 1);
    if (e.key === 'ArrowRight') setStep(state.step + 1);
  });
  els.tabSteps.addEventListener('click', () => setMode('steps'));
  els.tabModules.addEventListener('click', () => setMode('modules'));
  els.search.addEventListener('input', onSearch);
  els.results.addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (row) focusPart(row.dataset.id);
  });

  try {
    const [partsRes, stepsRes] = await Promise.all([
      fetch('./data/parts.json'),
      fetch('./data/steps.json'),
    ]);
    data = await partsRes.json();
    const stepFile = await stepsRes.json();
    steps = stepFile.steps;
    partById = new Map(data.parts.map((p) => [p.id, p]));
    renderStats(data.meta);
    await loadModel(data);
    buildSearchIndex();
    buildStepsUI();
    els.status.hidden = true;
    resize();

    const wanted = parseInt(new URLSearchParams(location.search).get('step') || '1', 10);
    state.step = Math.min(Math.max(wanted, 1), steps.length);
    const tab = new URLSearchParams(location.search).get('tab');
    setMode(tab === 'modules' ? 'modules' : 'steps');
    animate();
  } catch (err) {
    els.status.textContent = `加载失败：${err.message}`;
    console.error(err);
  }
}

function renderStats(meta) {
  if (els.modelVersion) {
    els.modelVersion.textContent = meta.version ? `模型 ${meta.version}` : '';
    els.modelVersion.hidden = !meta.version;
  }
  const items = [
    [meta.partCount, '零件'],
    [meta.moduleCount, '子装配'],
    [meta.triangleCount.toLocaleString(), '三角面'],
    [meta.size.join(' × ') + ' mm', '整机尺寸'],
  ];
  els.stats.innerHTML = items
    .map(([v, k]) => `<div class="stat"><b>${v}</b><span>${k}</span></div>`)
    .join('');
}

function loadModel(data) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      `./models/${data.meta.model}`,
      (gltf) => {
        root.add(gltf.scene);
        // STEP axes: X is down, Y is fore-aft, Z is lateral. Turn it into Y-up.
        root.rotation.z = -Math.PI / 2;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        root.position.set(-center.x, -box.min.y, -center.z);
        root.updateMatrixWorld(true);

        buildModules(gltf, data);
        resolve();
      },
      (evt) => {
        if (evt.total) els.status.textContent = `加载模型 ${Math.round((evt.loaded / evt.total) * 100)}%`;
      },
      reject,
    );
  });
}

function buildModules(gltf, data) {
  const gltfScene = gltf.scene;
  // Object names come from the mesh (实体N), not the node, so map by mesh index.
  const partByMesh = new Map(data.parts.map((p) => [p.mesh, p]));
  modelCenter.set(0, 0, 0);
  data.parts.forEach((p) => modelCenter.add(new THREE.Vector3(...p.center)));
  modelCenter.divideScalar(data.parts.length);
  modelSize.set(...data.meta.size);

  moduleGroups = data.modules.map((mod, i) => {
    const group = gltfScene.getObjectByName(mod.node);
    const color = PALETTE[i % PALETTE.length];
    const solid = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.12 });
    const neutral = new THREE.MeshStandardMaterial({ color: 0xa8b6c4, roughness: 0.7, metalness: 0.1 });
    const meshes = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      const assoc = gltf.parser.associations.get(o);
      const part = assoc ? partByMesh.get(assoc.meshes) : undefined;
      o.userData.solid = solid;
      o.userData.neutral = neutral;
      o.userData.base = o.position.clone();
      o.userData.part = part;
      if (part) meshByPart.set(part.id, o);
      meshes.push(o);
    });
    partMeshes.push(...meshes);
    return { mod, group, color, solid, neutral, meshes };
  }).filter((m) => m.group);

  els.moduleCount.textContent = `(${moduleGroups.length})`;
  els.rows.innerHTML = '';
  moduleGroups.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <input type="checkbox" checked>
      <div class="sw" style="background:#${m.color.toString(16).padStart(6, '0')}"></div>
      <div class="name">${m.mod.label}<small>${m.mod.node} · ${m.mod.size.join(' × ')} mm</small></div>
      <div class="qty">${m.mod.partCount}</div>`;
    const box = row.querySelector('input');
    box.addEventListener('change', () => { m.group.visible = box.checked; });
    row.addEventListener('click', (e) => {
      if (e.target === box) return;
      setActive(m);
      fitBox(new THREE.Box3().setFromObject(m.group), true);
    });
    m.row = row;
    els.rows.appendChild(row);
  });
}

function buildStepsUI() {
  els.slider.max = String(steps.length);
  els.progressText.textContent = `共 ${steps.length} 步`;
}

function moduleLabel(key) {
  const m = data ? data.modules.find((x) => x.key === key) : null;
  return m ? m.label : key;
}

function buildSearchIndex() {
  searchIndex = data.parts.map((p) => ({
    part: p,
    hay: `${p.id} ${p.name} ${p.short} ${p.type} ${moduleLabel(p.module)} ${p.size.join(' ')}`.toLowerCase(),
  }));
}

function onSearch() {
  const q = els.search.value.trim().toLowerCase();
  if (!q) {
    els.results.hidden = true;
    els.results.innerHTML = '';
    return;
  }
  const terms = q.split(/\s+/).filter(Boolean);
  const hits = searchIndex.filter((e) => terms.every((t) => e.hay.includes(t))).slice(0, 40);
  els.results.hidden = false;
  els.results.innerHTML = hits.length
    ? hits.map(({ part: p }) => `
      <div class="result" data-id="${p.id}">
        <b>${p.id}</b>
        <div class="name">${p.name}<small>${moduleLabel(p.module)} · ×${p.qty} · ${p.size.join(' × ')} mm</small></div>
      </div>`).join('')
    : '<div class="result hint">没有匹配的零件</div>';
}

function focusPart(id) {
  const part = partById.get(id);
  const mesh = meshByPart.get(id);
  if (!part || !mesh) return;
  const mod = moduleGroups.find((m) => m.mod.key === part.module);
  if (mod) {
    mod.group.visible = true;
    const box = mod.row ? mod.row.querySelector('input') : null;
    if (box) box.checked = true;
    setActive(mod);
  }
  mesh.visible = true;
  setHover(mesh);
  const bounds = new THREE.Box3().setFromObject(mesh);
  if (!bounds.isEmpty()) {
    const diag = bounds.getSize(new THREE.Vector3()).length();
    bounds.expandByScalar(Math.max(diag * 0.35, 0.02));
    fitBox(bounds, true);
  }
  els.tooltip.hidden = false;
  els.tooltip.innerHTML = `<b>${part.id}</b> <small>${part.name} · ${part.size.join(' × ')} mm</small>`;
  els.tooltip.style.left = '14px';
  els.tooltip.style.top = '14px';
}

function clearFly() {
  flyQueue.forEach((f) => f.mesh.position.copy(f.to));
  flyQueue = [];
}

function flyInParts(ids) {
  clearFly();
  const parentQ = new THREE.Quaternion();
  const worldUp = new THREE.Vector3(0, 1, 0);
  ids.forEach((id, i) => {
    const mesh = meshByPart.get(id);
    if (!mesh || !mesh.userData.part) return;
    mesh.parent.getWorldQuaternion(parentQ);
    const localUp = worldUp.clone().applyQuaternion(parentQ.invert()).normalize();
    const reach = Math.min(0.26, Math.max(0.07, Math.max(...mesh.userData.part.size) / 1000 * 1.6));
    const to = mesh.userData.base.clone();
    const from = to.clone().addScaledVector(localUp, reach);
    mesh.position.copy(from);
    flyQueue.push({ mesh, from, to, start: performance.now() + i * 16, dur: FLY_MS });
  });
}

function updateFly(now) {
  if (!flyQueue.length) return;
  flyQueue = flyQueue.filter((f) => {
    const t = (now - f.start) / f.dur;
    if (t <= 0) return true;
    const e = 1 - Math.pow(1 - Math.min(t, 1), 3);
    f.mesh.position.lerpVectors(f.from, f.to, e);
    if (t >= 1) {
      f.mesh.position.copy(f.to);
      return false;
    }
    return true;
  });
}

function setMode(mode) {
  state.mode = mode;
  clearFly();
  els.tabSteps.classList.toggle('on', mode === 'steps');
  els.tabModules.classList.toggle('on', mode === 'modules');
  els.stepPanel.hidden = mode !== 'steps';
  els.modulePanel.hidden = mode !== 'modules';
  if (mode === 'steps') {
    pause();
    els.search.value = '';
    els.results.hidden = true;
    els.results.innerHTML = '';
    els.tooltip.hidden = true;
    moduleGroups.forEach((m) => { m.group.visible = true; });
    partMeshes.forEach((m) => { m.position.copy(m.userData.base); });
    renderStep(true);
  } else {
    pause();
    applyModuleColors();
    moduleGroups.forEach((m) => {
      m.group.visible = m.row ? m.row.querySelector('input').checked : true;
    });
    partMeshes.forEach((m) => { m.visible = true; });
    applyExplode();
    fitBox(new THREE.Box3().setFromObject(root), true);
  }
  requestAnimationFrame(resize);
}

function renderStep(focus = true) {
  const step = steps[state.step - 1];
  if (!step) return;

  els.count.textContent = `步骤 ${state.step} / ${steps.length}`;
  els.slider.value = String(state.step);
  els.phase.textContent = step.phase;
  els.title.textContent = step.title;
  els.text.textContent = step.text;
  els.partCount.textContent = step.parts.length ? `（${step.parts.length} 件）` : '（整机）';
  els.first.disabled = state.step === 1;
  els.prev.disabled = state.step === 1;
  els.next.disabled = state.step === steps.length;
  els.last.disabled = state.step === steps.length;

  const names = new Map();
  step.parts.forEach((id) => {
    const p = partById.get(id);
    if (!p) return;
    if (!names.has(p.name)) names.set(p.name, { count: 0, size: p.size });
    names.get(p.name).count += 1;
  });
  els.parts.innerHTML = [...names.entries()]
    .map(([name, { count, size }]) => `<li><span>${name}</span><small>×${count} · ${size.join(' × ')} mm</small></li>`)
    .join('') || '<li class="hint">无新增零件</li>';

  applyStep();
  if (state.mode === 'steps' && step.parts.length) flyInParts(step.parts);
  else clearFly();
  if (focus) focusStep(step);
  syncUrl();
}

function applyStep() {
  if (state.mode !== 'steps') return;
  const step = steps[state.step - 1];
  const current = new Set(step.parts);
  const installed = new Set();
  for (const s of steps) {
    if (s.id < state.step) s.parts.forEach((id) => installed.add(id));
  }
  const finalStep = step.parts.length === 0;

  moduleGroups.forEach((m) => { m.group.visible = true; });
  partMeshes.forEach((mesh) => {
    const part = mesh.userData.part;
    if (!part) return;
    if (finalStep) {
      mesh.visible = true;
      mesh.material = installedMaterial;
      return;
    }
    const isCurrent = current.has(part.id);
    mesh.visible = isCurrent || installed.has(part.id);
    mesh.material = isCurrent ? currentMaterial : installedMaterial;
  });
}

function focusStep(step) {
  if (!step.parts.length) {
    fitBox(new THREE.Box3().setFromObject(root), true);
    return;
  }
  const box = new THREE.Box3();
  const targets = [];
  step.parts.forEach((id) => {
    const mesh = meshByPart.get(id);
    if (!mesh || !mesh.visible) return;
    box.expandByObject(mesh);
    targets.push(mesh);
  });
  // 取景带上整机上下文，并让镜头自己找一个不被遮挡的角度
  if (!box.isEmpty()) fitBox(box, true, { targets, minSpan: STEP_MIN_SPAN, viewIndex: step.id });
}

function setStep(n) {
  const next = Math.min(Math.max(n, 1), steps.length);
  if (next === state.step) return;
  state.step = next;
  renderStep(true);
}

function togglePlay() {
  if (state.playing) {
    pause();
    return;
  }
  if (state.step >= steps.length) setStep(1);
  state.playing = true;
  els.play.textContent = '⏸ 暂停';
  state.timer = setInterval(() => {
    if (state.step >= steps.length) {
      pause();
      return;
    }
    setStep(state.step + 1);
  }, 2600);
}

function pause() {
  state.playing = false;
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
  if (els.play) els.play.textContent = '▶ 播放';
}

function syncUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.set('step', String(state.step));
    history.replaceState(null, '', url);
  } catch {}
}

function setActive(m) {
  moduleGroups.forEach((g) => g.row.classList.toggle('active', g === m));
}

function applyModuleColors() {
  const byModule = els.colorByModule.checked;
  partMeshes.forEach((mesh) => {
    mesh.material = byModule ? mesh.userData.solid : mesh.userData.neutral;
  });
}

function applyExplode() {
  const amount = parseFloat(els.explode.value);
  const maxDim = Math.max(...modelSize.toArray()) / 1000;
  partMeshes.forEach((mesh) => {
    const part = mesh.userData.part;
    if (!part) return;
    const dir = new THREE.Vector3(...part.center).sub(modelCenter);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
    dir.normalize().multiplyScalar(amount * maxDim * 0.55);
    mesh.position.copy(mesh.userData.base).add(dir);
  });
}

function resetView() {
  setActive(null);
  els.explode.value = '0';
  applyExplode();
  lastViewDir = null;
  fitBox(new THREE.Box3().setFromObject(root), true);
}

function onPointerMove(evt) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(partMeshes.filter((m) => m.visible), false);
  setHover(hits.length ? hits[0].object : null);
  if (hits.length) {
    els.tooltip.hidden = false;
    const p = hits[0].object.userData.part;
    els.tooltip.innerHTML = p
      ? `<b>${p.id}</b> <small>${p.name} · ${p.size.join(' × ')} mm</small>`
      : hits[0].object.name;
    els.tooltip.style.left = `${evt.clientX - rect.left + 14}px`;
    els.tooltip.style.top = `${evt.clientY - rect.top + 12}px`;
  } else {
    els.tooltip.hidden = true;
  }
}

function setHover(mesh) {
  if (hovered === mesh) return;
  if (hovered) hovered.material = hovered.userData.currentMaterial;
  hovered = mesh;
  if (hovered) {
    hovered.userData.currentMaterial = hovered.material;
    hovered.material = hoverMaterial;
  }
}

/* 候选机位：三档俯角、每档 12 个方位。 */
const ELEVATIONS = [52, 32, 16];

function buildViewDirs() {
  if (viewDirs) return viewDirs;
  viewDirs = [];
  for (const elev of ELEVATIONS) {
    const e = (elev * Math.PI) / 180;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      viewDirs.push(
        new THREE.Vector3(
          Math.cos(e) * Math.cos(a),
          Math.sin(e),
          Math.cos(e) * Math.sin(a),
        ).normalize(),
      );
    }
  }
  return viewDirs;
}

/* 目标零件相对整机中心的水位方向：相机优先从零件所在的一侧看过去。 */
function preferredAzimuth(center) {
  const h = new THREE.Vector3(center.x, 0, center.z);
  if (h.lengthSq() < 1e-4) {
    // 零件在整机中心附近，没有天然朝向，就转到上一个机位的侧面去
    if (lastViewDir) return new THREE.Vector3(-lastViewDir.z, 0, lastViewDir.x).normalize();
    return new THREE.Vector3(1, 0, 1).normalize();
  }
  return h.normalize();
}

/* 当前可见零件的世界包围盒。装配模式里未安装的零件是 hidden 的，自然不算遮挡物。 */
function visiblePartBoxes() {
  const out = [];
  const box = new THREE.Box3();
  for (const mesh of partMeshes) {
    if (!mesh.visible || !mesh.userData.part) continue;
    box.setFromObject(mesh);
    if (box.isEmpty()) continue;
    out.push({ id: mesh.userData.part.id, box: box.clone() });
  }
  return out;
}

/* 从机位往每个采样点打一条线，看看先撞到的是不是别的零件。返回被挡比例 0~1。 */
function occlusionRatio(camPos, samples, targetIds, boxes) {
  if (!samples.length || !boxes.length) return 0;
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  let blocked = 0;
  for (const p of samples) {
    ray.origin.copy(camPos);
    ray.direction.copy(p).sub(camPos);
    const dist = ray.direction.length();
    if (dist < 1e-4) continue;
    ray.direction.divideScalar(dist);
    for (const { id, box } of boxes) {
      if (targetIds.has(id)) continue;
      if (ray.intersectBox(box, hit) && hit.distanceTo(camPos) < dist - 1e-3) {
        blocked += 1;
        break;
      }
    }
  }
  return blocked / samples.length;
}

function pickViewDir(center, dist, targets, boxes, viewIndex = 0) {
  const targetElev = (ELEVATIONS[viewIndex % ELEVATIONS.length] * Math.PI) / 180;
  const targetIds = new Set(targets.map((m) => m.userData.part?.id).filter(Boolean));
  const samples = [];
  const union = new THREE.Box3();
  for (const mesh of targets) {
    const b = new THREE.Box3().setFromObject(mesh);
    if (b.isEmpty()) continue;
    union.union(b);
    if (samples.length < 6) samples.push(b.getCenter(new THREE.Vector3()));
  }
  if (!union.isEmpty()) {
    // 取景框 8 个角也当采样点，保证整组零件都不被挡住，而不只是中心
    const c = union.getCenter(new THREE.Vector3());
    const h = union.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          samples.push(new THREE.Vector3(c.x + sx * h.x, c.y + sy * h.y, c.z + sz * h.z));
        }
      }
    }
  }

  const preferred = preferredAzimuth(center);
  let best = null;
  for (const dir of buildViewDirs()) {
    const camPos = center.clone().addScaledVector(dir, dist);
    const blocked = occlusionRatio(camPos, samples, targetIds, boxes);
    const travel = camPos.distanceTo(camera.position) / Math.max(dist, 1e-3);
    const horiz = Math.hypot(dir.x, dir.z);
    const face = horiz > 1e-4 ? 1 - (dir.x * preferred.x + dir.z * preferred.z) / horiz : 0;
    // 与上一机位夹角小于约 30° 时才开始计罚，确保每一步都换方位
    const repeat = lastViewDir ? Math.max(0, dir.dot(lastViewDir) - 0.85) / 0.15 : 0;
    // 俯角也按步骤轮换，避免连续步骤停在同一个高度
    const elevDiff = Math.abs(Math.asin(Math.max(-1, Math.min(1, dir.y))) - targetElev);
    // 遮挡一票否决；其次从零件所在侧面、换方位、换俯角
    const score = blocked * 100 + face * 2.2 + repeat * 3.0 + elevDiff * 1.6 + travel * 0.4;
    if (!best || score < best.score) best = { dir, score };
  }
  if (!best) return HIGH_DIR.clone();
  lastViewDir = best.dir.clone();
  return best.dir.clone();
}

function fitBox(box, animated, opts = {}) {
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  let radius = Math.max(size.length() * 0.5, 0.05);
  if (opts.minSpan && data) {
    // 单步取景也要带上整机，否则镜头贴太近，看不出这个零件装在哪儿
    const whole = new THREE.Vector3(...data.meta.size).length() / 1000;
    radius = Math.max(radius, whole * opts.minSpan);
  }
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * FRAME_PADDING;
  const targets = opts.targets || [];
  const dir = targets.length && targets.length <= MAX_OCCLUSION_TARGETS
    ? pickViewDir(center, dist, targets, visiblePartBoxes(), opts.viewIndex)
    : HIGH_DIR.clone();
  const toPos = center.clone().addScaledVector(dir, dist);
  if (!animated) {
    camera.position.copy(toPos);
    controls.target.copy(center);
    controls.update();
    return;
  }
  const fromTarget = controls.target.clone();
  const fromDir = camera.position.clone().sub(fromTarget);
  const fromLen = fromDir.length();
  if (fromLen < 1e-4) {
    // 初次取景时相机与视点重合，没有可插值的起始方向，直接落到目标机位
    camera.position.copy(toPos);
    controls.target.copy(center);
    controls.update();
    return;
  }
  const toDir = toPos.clone().sub(center);
  tween = {
    start: performance.now(),
    dur: 550,
    fromTarget,
    toTarget: center,
    fromDir: fromDir.clone().normalize(),
    toDir: toDir.clone().normalize(),
    fromLen,
    toLen: toDir.length(),
    // 绕目标点走球面短弧，避免换到另一侧时镜头从模型中间穿过去
    arc: new THREE.Quaternion().setFromUnitVectors(fromDir.normalize(), toDir.normalize()),
  };
}

const tweenStep = new THREE.Quaternion();
const tweenDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (tween) {
    const t = Math.min(1, (now - tween.start) / tween.dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
    tweenStep.identity().slerp(tween.arc, e);
    tweenDir.copy(tween.fromDir).applyQuaternion(tweenStep);
    camera.position.copy(controls.target)
      .addScaledVector(tweenDir, tween.fromLen + (tween.toLen - tween.fromLen) * e);
    if (t >= 1) tween = null;
  }
  updateFly(now);
  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  const w = view.clientWidth;
  const h = view.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
