/**
 * game3d.js — AI狼人杀 5.0 Three.js 3D场景引擎
 * 写实哥特圆桌场景，全屏沉浸式，日志面板悬浮
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ============================================================
// TWEEN — 轻量级属性动画
// ============================================================
const _tweens = [];

function addTween(obj, props, duration, ease = 'easeInOutQuad', onDone) {
    const start = {};
    for (const k in props) {
        start[k] = obj[k]; // numbers only
    }
    _tweens.push({ obj, start, end: props, duration, elapsed: 0, ease, onDone });
}

function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
const _easeFns = { easeInOutQuad, easeOutQuart, linear: t => t };

function _tickTweens(delta) {
    for (let i = _tweens.length - 1; i >= 0; i--) {
        const tw = _tweens[i];
        tw.elapsed += delta;
        const raw = Math.min(tw.elapsed / tw.duration, 1);
        const e = (_easeFns[tw.ease] || easeInOutQuad)(raw);
        for (const k in tw.end) {
            tw.obj[k] = tw.start[k] + (tw.end[k] - tw.start[k]) * e;
        }
        if (raw >= 1) {
            if (tw.onDone) tw.onDone();
            _tweens.splice(i, 1);
        }
    }
}

// ============================================================
// STATE
// ============================================================
const S = {
    initialized: false,
    renderer: null,
    scene: null,
    camera: null,
    composer: null,
    bloomPass: null,
    clock: new THREE.Clock(),

    // lighting
    ambientLight: null,
    mainLight: null,   // directional (moon/sun)
    hemiLight: null,
    torchLights: [],   // { light, baseIntensity, phase }
    torchFlames: [],   // meshes

    // scene objects
    skyMesh: null,
    moonMesh: null,
    starField: null,
    dustParticles: null,
    dustVel: null,

    // players
    players: {},       // id -> { group, data, isAlive, isSpeaking, speakLight, selectLight }
    nameplates: {},    // id -> DOM div
    nameplateLayer: null,

    // speech
    currentBubble: null, // { el, playerId }

    // camera
    camPos: new THREE.Vector3(0, 8, 13),
    camLook: new THREE.Vector3(0, 0.5, 0),
    _smoothLook: new THREE.Vector3(0, 0.5, 0),
    camOrbit: false,   // auto orbit (disabled when OrbitControls active)
    controls: null,    // OrbitControls

    // raycasting
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),

    isNight: false,
};

// ============================================================
// PROCEDURAL TEXTURES
// ============================================================
function _makeStoneTexture(size = 512, isFloor = false) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');

    ctx.fillStyle = isFloor ? '#242424' : '#202020';
    ctx.fillRect(0, 0, size, size);

    const bw = isFloor ? size / 5 : size / 4;
    const bh = size / 5;
    for (let row = 0; row <= size / bh; row++) {
        for (let col = 0; col <= size / bw + 1; col++) {
            const offset = (row % 2) * (bw / 2);
            const x = col * bw - offset;
            const y = row * bh;
            const g = 28 + Math.random() * 18;
            ctx.fillStyle = `rgb(${g},${g},${g})`;
            ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
    }
    // grout lines
    ctx.fillStyle = '#0e0e0e';
    for (let row = 0; row <= size / bh; row++) {
        ctx.fillRect(0, row * bh, size, 2);
    }
    for (let col = 0; col <= size / bw + 1; col++) {
        ctx.fillRect(col * bw, 0, 2, size);
    }

    // noise
    const id = ctx.getImageData(0, 0, size, size);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 22;
        d[i] = Math.max(0, Math.min(255, d[i] + n));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(id, 0, 0);
    return new THREE.CanvasTexture(c);
}

function _makeWoodTexture(size = 512) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const gr = ctx.createLinearGradient(0, 0, size, 0);
    gr.addColorStop(0, '#1e0e04');
    gr.addColorStop(0.3, '#2e1608');
    gr.addColorStop(0.6, '#1e0e04');
    gr.addColorStop(1, '#160b02');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let y = 0; y < size; y += 7 + Math.random() * 5) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x < size; x += 15) {
            ctx.lineTo(x + 15, y + (Math.random() - 0.5) * 3);
        }
        ctx.stroke();
    }
    return new THREE.CanvasTexture(c);
}

// ============================================================
// SCENE BUILDING
// ============================================================
function _buildLighting() {
    S.ambientLight = new THREE.AmbientLight(0xfff0e0, 2.8);  // day default — warm bright
    S.scene.add(S.ambientLight);

    S.hemiLight = new THREE.HemisphereLight(0x8090c0, 0x3a2810, 1.2);
    S.scene.add(S.hemiLight);

    // Moon/sun directional — default DAY
    S.mainLight = new THREE.DirectionalLight(0xfff5cc, 2.5);
    S.mainLight.position.set(6, 18, 8);
    S.mainLight.castShadow = true;
    S.mainLight.shadow.mapSize.set(2048, 2048);
    S.mainLight.shadow.camera.near = 0.5;
    S.mainLight.shadow.camera.far = 55;
    S.mainLight.shadow.camera.left = -13;
    S.mainLight.shadow.camera.right = 13;
    S.mainLight.shadow.camera.top = 13;
    S.mainLight.shadow.camera.bottom = -13;
    S.mainLight.shadow.bias = -0.0008;
    S.mainLight.shadow.normalBias = 0.02;
    S.scene.add(S.mainLight);

    // 天窗阳光束（从顶部开口直射圆桌）
    S.sunBeam = new THREE.SpotLight(0xfff0cc, 4.0, 18, Math.PI / 5, 0.35, 1.5);
    S.sunBeam.position.set(0, 12, 0);
    S.sunBeam.target.position.set(0, 0, 0);
    S.sunBeam.castShadow = false;
    S.scene.add(S.sunBeam);
    S.scene.add(S.sunBeam.target);

    // Torch point lights (6)
    const WALL_R = 9.2;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const light = new THREE.PointLight(0xff5010, 1.3, 13, 2);
        light.position.set(WALL_R * Math.cos(a), 2.6, WALL_R * Math.sin(a));
        S.scene.add(light);
        S.torchLights.push({ light, baseIntensity: 1.3, phase: i * 0.85 });
        _buildTorchMesh(light.position.clone());
    }

    // Candle point lights on table (3)
    const candlePos = [
        new THREE.Vector3(0, 1.2, 0),
        new THREE.Vector3(1.1, 1.2, 0.7),
        new THREE.Vector3(-0.9, 1.2, -1.0),
    ];
    candlePos.forEach((p, i) => {
        const cl = new THREE.PointLight(0xffaa30, 0.6, 5, 2);
        cl.position.copy(p);
        S.scene.add(cl);
        S.torchLights.push({ light: cl, baseIntensity: 0.6, phase: i * 1.4 });
    });
}

function _buildTorchMesh(pos) {
    const g = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.55, metalness: 0.85 });
    const woodMat  = new THREE.MeshStandardMaterial({ color: 0x3a1c08, roughness: 0.95 });
    const flameMat = new THREE.MeshStandardMaterial({
        color: 0xff7700, emissive: 0xff3300, emissiveIntensity: 2.5,
        transparent: true, opacity: 0.92,
    });

    // Wall bracket
    const brkt = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), metalMat);
    brkt.rotation.z = Math.PI / 3.5;
    brkt.position.set(-0.12, 0.0, 0);
    g.add(brkt);

    // Torch stick
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.32, 8), woodMat);
    stick.position.set(0, 0.18, 0);
    g.add(stick);

    // Flame
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), flameMat);
    flame.position.set(0, 0.38, 0);
    g.add(flame);
    S.torchFlames.push(flame);

    // Orient toward center
    g.position.copy(pos);
    const dir = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    g.position.copy(pos); // restore after quaternion
    S.scene.add(g);
}

function _buildArena() {
    const stoneTex = _makeStoneTexture(1024, false);
    stoneTex.repeat.set(10, 1.8);
    stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;

    const floorTex = _makeStoneTexture(1024, true);
    floorTex.repeat.set(7, 7);
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;

    // Floor
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x2a2a2a, roughness: 0.92 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    S.scene.add(floor);

    // Walls (inner face)
    const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x222222, roughness: 0.96, side: THREE.BackSide });
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 7, 40, 1, true), wallMat);
    walls.position.y = 3.5;
    walls.receiveShadow = true;
    S.scene.add(walls);

    // Ceiling ring (with central opening for sky/moon)
    const ceilMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x1a1a1a, roughness: 0.98, side: THREE.BackSide });
    const ceil = new THREE.Mesh(new THREE.RingGeometry(3.5, 11, 40), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 7.0;
    S.scene.add(ceil);

    // Pillars (6)
    const pillarTex = _makeStoneTexture(512, false);
    const pillarMat = new THREE.MeshStandardMaterial({ map: pillarTex, color: 0x2e2e2e, roughness: 0.92 });
    const capMat    = new THREE.MeshStandardMaterial({ color: 0x383838, roughness: 0.88 });
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const px = 9.2 * Math.cos(a), pz = 9.2 * Math.sin(a);

        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 7.2, 14), pillarMat);
        shaft.position.set(px, 3.6, pz);
        shaft.castShadow = shaft.receiveShadow = true;
        S.scene.add(shaft);

        // Capital
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 0.35, 14), capMat);
        cap.position.set(px, 7.25, pz);
        S.scene.add(cap);

        // Base
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.2, 14), capMat);
        base.position.set(px, 0.1, pz);
        S.scene.add(base);
    }

    // Sky dome
    S.skyMesh = new THREE.Mesh(
        new THREE.SphereGeometry(55, 32, 16),
        new THREE.MeshBasicMaterial({ color: 0x04010d, side: THREE.BackSide })
    );
    S.scene.add(S.skyMesh);

    // Moon
    S.moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xe8e4c0, emissive: 0xb8b490, emissiveIntensity: 0.6, roughness: 0.85 })
    );
    S.moonMesh.position.set(10, 38, -32);
    S.scene.add(S.moonMesh);

    // Stars
    const starCount = 600;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        const phi = Math.acos(2 * Math.random() - 1);
        const th  = 2 * Math.PI * Math.random();
        const r   = 52;
        starPos[i * 3]     = r * Math.sin(phi) * Math.cos(th);
        starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi));
        starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(th);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    S.starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85 }));
    S.scene.add(S.starField);
}

function _buildTable() {
    const woodTex = _makeWoodTexture(512);
    const tableMat = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x1e0d04, roughness: 0.72 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // Table top
    const top = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.9, 0.14, 56), tableMat);
    top.position.y = 0.8;
    top.receiveShadow = top.castShadow = true;
    S.scene.add(top);

    // Table edge trim
    const trim = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.05, 8, 56), stoneMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.8;
    S.scene.add(trim);

    // Table base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.9, 0.78, 14), stoneMat);
    base.position.y = 0.39;
    base.castShadow = base.receiveShadow = true;
    S.scene.add(base);

    // Candles
    const cPos = [
        { x: 0,    z: 0    },
        { x: 1.1,  z: 0.7  },
        { x: -0.9, z: -1.0 },
    ];
    const candleMat = new THREE.MeshStandardMaterial({ color: 0xf0e0c0, roughness: 0.9 });
    const flameMat  = new THREE.MeshStandardMaterial({
        color: 0xffcc00, emissive: 0xff8800, emissiveIntensity: 3.5,
        transparent: true, opacity: 0.95,
    });
    cPos.forEach((cp, i) => {
        const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.22, 8), candleMat);
        cd.position.set(cp.x, 0.97, cp.z);
        S.scene.add(cd);

        const fl = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), flameMat);
        fl.position.set(cp.x, 1.12, cp.z);
        S.scene.add(fl);
        S.torchFlames.push(fl);
    });
}

function _buildDustParticles() {
    const count = 250;
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = Math.random() * 9, a = Math.random() * Math.PI * 2;
        pos[i * 3]     = r * Math.cos(a);
        pos[i * 3 + 1] = Math.random() * 5.5;
        pos[i * 3 + 2] = r * Math.sin(a);
        vel[i * 3]     = (Math.random() - 0.5) * 0.006;
        vel[i * 3 + 1] = (Math.random() - 0.5) * 0.003;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.006;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    S.dustParticles = new THREE.Points(geo, new THREE.PointsMaterial({
        color: 0xffc070, size: 0.028, transparent: true, opacity: 0.3
    }));
    S.dustVel = vel;
    S.scene.add(S.dustParticles);
}

// ============================================================
// PLAYER AVATARS
// ============================================================
const SEAT_RADIUS = 3.85;
const OUTFIT_COLORS = [
    0x4a3a8a, 0x8a2a2a, 0x2a6a3a, 0x7a5a18,
    0x2a4a7a, 0x6a2a6a, 0x3a6020, 0x8a3a18,
    0x1a3a6a, 0x5a1a5a, 0x5a4a10, 0x1a5a5a,
];
const SKIN_COLORS  = [0xfcd5b0, 0xf0be8a, 0xdda06a, 0xcb8848];
const HAIR_COLORS  = [0x120600, 0x221000, 0x7a5c10, 0x301808, 0x080808, 0x505050];

function _createHuman(player) {
    const group = new THREE.Group();
    const sc = SKIN_COLORS[player.id % SKIN_COLORS.length];
    const oc = OUTFIT_COLORS[player.id % OUTFIT_COLORS.length];
    const hc = HAIR_COLORS[player.id % HAIR_COLORS.length];

    const skinM = new THREE.MeshStandardMaterial({ color: sc, roughness: 0.55, metalness: 0 });
    const outfM = new THREE.MeshStandardMaterial({ color: oc, roughness: 0.85, metalness: 0 });
    const hairM = new THREE.MeshStandardMaterial({ color: hc, roughness: 0.92, metalness: 0 });
    const eyeM  = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const whtM  = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.rotation.set(rx, ry, rz);
        m.scale.set(sx, sy, sz);
        m.castShadow = true;
        group.add(m);
        return m;
    };

    // Head
    add(new THREE.SphereGeometry(0.205, 22, 16), skinM, 0, 1.53, 0);
    // Hair cap
    add(new THREE.SphereGeometry(0.218, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hairM, 0, 1.565, -0.01);
    // Eye whites
    add(new THREE.SphereGeometry(0.040, 8, 8), whtM, -0.077, 1.535, 0.168);
    add(new THREE.SphereGeometry(0.040, 8, 8), whtM,  0.077, 1.535, 0.168);
    // Pupils
    add(new THREE.SphereGeometry(0.028, 8, 8), eyeM, -0.077, 1.534, 0.178);
    add(new THREE.SphereGeometry(0.028, 8, 8), eyeM,  0.077, 1.534, 0.178);
    // Nose
    const noseC = new THREE.Color(sc); noseC.offsetHSL(0, -0.1, -0.1);
    add(new THREE.SphereGeometry(0.022, 6, 6), new THREE.MeshStandardMaterial({ color: noseC, roughness: 0.6 }), 0, 1.505, 0.192);
    // Neck
    add(new THREE.CylinderGeometry(0.075, 0.09, 0.17, 10), skinM, 0, 1.34, 0);
    // Collar
    const colC = new THREE.Color(oc); colC.offsetHSL(0, 0, -0.12);
    add(new THREE.CylinderGeometry(0.13, 0.15, 0.09, 10), new THREE.MeshStandardMaterial({ color: colC, roughness: 0.9 }), 0, 1.235, 0);
    // Torso
    add(new THREE.BoxGeometry(0.40, 0.44, 0.24), outfM, 0, 0.99, 0);
    // Shoulders
    add(new THREE.SphereGeometry(0.125, 10, 8), outfM, -0.235, 1.18, 0, 0, 0, 0, 1, 0.8, 0.8);
    add(new THREE.SphereGeometry(0.125, 10, 8), outfM,  0.235, 1.18, 0, 0, 0, 0, 1, 0.8, 0.8);
    // Upper arms
    add(new THREE.CylinderGeometry(0.072, 0.065, 0.33, 10), outfM, -0.29, 1.02, 0.04, -0.28, 0,  Math.PI / 7.5);
    add(new THREE.CylinderGeometry(0.072, 0.065, 0.33, 10), outfM,  0.29, 1.02, 0.04, -0.28, 0, -Math.PI / 7.5);
    // Forearms (resting on table)
    add(new THREE.CylinderGeometry(0.065, 0.058, 0.34, 10), skinM, -0.22, 0.855, 0.28, -Math.PI / 2.2, 0, 0.14);
    add(new THREE.CylinderGeometry(0.065, 0.058, 0.34, 10), skinM,  0.22, 0.855, 0.28, -Math.PI / 2.2, 0, -0.14);
    // Hands
    add(new THREE.SphereGeometry(0.072, 8, 8), skinM, -0.20, 0.825, 0.49, 0, 0, 0, 1.1, 0.72, 1.35);
    add(new THREE.SphereGeometry(0.072, 8, 8), skinM,  0.20, 0.825, 0.49, 0, 0, 0, 1.1, 0.72, 1.35);
    // Lap
    add(new THREE.BoxGeometry(0.40, 0.15, 0.44), outfM, 0, 0.72, 0.13);

    group.rotation.x = 0.04;
    return group;
}

// ============================================================
// PLAYER MANAGEMENT
// ============================================================
function _clearPlayers() {
    Object.values(S.players).forEach(po => {
        S.scene.remove(po.group);
        po.group.traverse(c => {
            if (c.isMesh) { c.geometry.dispose(); c.material.dispose(); }
        });
    });
    S.players = {};

    Object.values(S.nameplates).forEach(el => el.remove());
    S.nameplates = {};
}

function _initPlayers(players) {
    _clearPlayers();
    const count = players.length;

    players.forEach((player, index) => {
        const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
        const x = SEAT_RADIUS * Math.cos(angle);
        const z = SEAT_RADIUS * Math.sin(angle);

        const group = _createHuman(player);
        group.position.set(x, 0, z);
        group.rotation.y = Math.PI / 2 - angle;
        group.traverse(c => { if (c.isMesh) c.userData.playerId = player.id; });
        S.scene.add(group);

        S.players[player.id] = {
            group, data: player, angle,
            isAlive: player.isAlive !== false,
            isSpeaking: false,
            speakLight: null, selectLight: null,
        };

        // Nameplate DOM
        const np = document.createElement('div');
        np.className = 'nameplate-3d';
        np.innerHTML = `<span class="np-number">${player.number}号</span><span class="np-name">${player.name}</span>`;
        S.nameplateLayer.appendChild(np);
        S.nameplates[player.id] = np;
    });
}

function _updateAllPlayers(players) {
    if (!players || !players.length) return;
    const needRebuild = Object.keys(S.players).length !== players.length;
    if (needRebuild) { _initPlayers(players); return; }

    players.forEach(player => {
        const po = S.players[player.id];
        if (!po) return;
        po.data = player;
        _applyAliveState(player.id, player.isAlive !== false);
        _updateNameplate(player.id, player);
    });
}

function _applyAliveState(id, alive) {
    const po = S.players[id];
    if (!po || po.isAlive === alive) return;
    po.isAlive = alive;

    if (!alive) {
        // Topple & grey
        _playDeathAnimation(id, null);
    } else {
        po.group.rotation.x = 0.04;
        po.group.position.y = 0;
        po.group.traverse(c => {
            if (c.isMesh) {
                c.material = c.material.clone();
                c.material.emissiveIntensity = 0;
            }
        });
    }
}

function _updateNameplate(id, player) {
    const np = S.nameplates[id];
    if (!np) return;
    // 读 window._g3dShowRoles（由 game-ui.js 在每次 renderPlayers 时同步过来）
    const canShow = !!window._g3dShowRoles || !player.isAlive;
    const roleHTML = (canShow && player.roleName && player.roleName !== '?')
        ? `<span class="np-role">${player.roleName}</span>` : '';
    np.innerHTML = `<span class="np-number">${player.number}号</span><span class="np-name">${player.name}</span>${roleHTML}`;
    if (!player.isAlive) np.classList.add('dead');
    else np.classList.remove('dead');
}

// ============================================================
// NAMEPLATE POSITIONING (each frame)
// ============================================================
const _tmpV = new THREE.Vector3();

function _updateNameplates() {
    Object.entries(S.nameplates).forEach(([id, el]) => {
        const po = S.players[id];
        if (!po) return;

        _tmpV.set(0, 1.95, 0);
        _tmpV.applyMatrix4(po.group.matrixWorld);
        _tmpV.project(S.camera);

        if (_tmpV.z > 1) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.style.left = `${(_tmpV.x * 0.5 + 0.5) * window.innerWidth}px`;
        el.style.top  = `${(-_tmpV.y * 0.5 + 0.5) * window.innerHeight}px`;
    });

    // Speech bubble
    if (S.currentBubble) {
        const po = S.players[S.currentBubble.playerId];
        if (po) {
            _tmpV.set(0, 2.15, 0);
            _tmpV.applyMatrix4(po.group.matrixWorld);
            _tmpV.project(S.camera);
            if (_tmpV.z < 1) {
                S.currentBubble.el.style.left = `${(_tmpV.x * 0.5 + 0.5) * window.innerWidth}px`;
                S.currentBubble.el.style.top  = `${(-_tmpV.y * 0.5 + 0.5) * window.innerHeight}px`;
            }
        }
    }
}

// ============================================================
// SPEECH BUBBLE
// ============================================================
function _showSpeech(player, text, isThinking = false) {
    _hideSpeech();

    const el = document.createElement('div');
    el.className = 'speech-bubble-3d' + (isThinking ? ' thinking-3d' : '');
    el.innerHTML = `
        <div class="sb-name">${player.icon || '👤'} ${player.name}</div>
        <div class="sb-text">${isThinking ? '正在思考' : `"${text}"`}</div>
    `;
    S.nameplateLayer.appendChild(el);
    S.currentBubble = { el, playerId: player.id };

    _setSpeakGlow(player.id, true);
}

function _hideSpeech() {
    if (S.currentBubble) {
        S.currentBubble.el.remove();
        _setSpeakGlow(S.currentBubble.playerId, false);
        S.currentBubble = null;
    }
}

function _setSpeakGlow(id, on) {
    const po = S.players[id];
    if (!po) return;

    if (on && !po.speakLight) {
        const l = new THREE.PointLight(0x00cec9, 1.8, 4, 2);
        l.position.set(0, 1.65, 0);
        po.group.add(l);
        po.speakLight = l;
        S.nameplates[id]?.classList.add('speaking');
    } else if (!on && po.speakLight) {
        po.group.remove(po.speakLight);
        po.speakLight.dispose();
        po.speakLight = null;
        S.nameplates[id]?.classList.remove('speaking');
    }
}

function _setSelectGlow(id, on) {
    const po = S.players[id];
    if (!po) return;

    if (on && !po.selectLight) {
        const l = new THREE.PointLight(0xff6b6b, 2.5, 4, 2);
        l.position.set(0, 1.0, 0);
        po.group.add(l);
        po.selectLight = l;
    } else if (!on && po.selectLight) {
        po.group.remove(po.selectLight);
        po.selectLight.dispose();
        po.selectLight = null;
    }
}

// ============================================================
// DAY / NIGHT TRANSITIONS
// ============================================================
function _nightTransition() {
    return new Promise(resolve => {
        S.isNight = true;
        addTween(S.ambientLight, { intensity: 0.3  }, 2.2);
        addTween(S.mainLight,    { intensity: 0.4  }, 2.2);
        addTween(S.scene.fog,    { density: 0.048 }, 2.2);
        addTween(S.bloomPass,    { strength: 0.75 }, 2.2);
        S.mainLight.color.setHex(0x2233bb);
        S.ambientLight.color.setHex(0x1a1030);
        if (S.sunBeam) addTween(S.sunBeam, { intensity: 0 }, 1.5);
        // 点亮火把/蜡烛
        S.torchLights.forEach(tl => {
            addTween(tl.light, { intensity: tl.baseIntensity * 2.1 }, 1.8);
        });
        _showPhaseOverlay('🌙', '天黑请闭眼', '#4466ff');
        setTimeout(resolve, 3200);
    });
}

function _dayTransition() {
    return new Promise(resolve => {
        S.isNight = false;
        addTween(S.ambientLight, { intensity: 2.8 }, 2.2);
        addTween(S.mainLight,    { intensity: 2.5 }, 2.2);
        addTween(S.scene.fog,    { density: 0.012 }, 2.2);
        addTween(S.bloomPass,    { strength: 0.28 }, 2.2);
        S.mainLight.color.setHex(0xfff5cc);
        S.ambientLight.color.setHex(0xfff0e0);
        if (S.sunBeam) addTween(S.sunBeam, { intensity: 4.0 }, 2.0);
        // 熄灭火把/蜡烛
        S.torchLights.forEach(tl => {
            addTween(tl.light, { intensity: 0 }, 2.0);
        });
        _showPhaseOverlay('☀️', '天亮了', '#ffcc00');
        setTimeout(resolve, 3200);
    });
}

function _showPhaseOverlay(icon, text, color) {
    document.getElementById('phase-overlay-3d')?.remove();
    const el = document.createElement('div');
    el.id = 'phase-overlay-3d';
    el.style.cssText = `
        position:fixed;top:0;left:0;right:0;bottom:0;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        pointer-events:none;z-index:350;
        background:radial-gradient(ellipse,rgba(0,0,0,0.65) 0%,transparent 68%);
        animation:fadeInOut 3.2s ease forwards;
    `;
    el.innerHTML = `
        <div style="font-size:90px;animation:float 2s ease-in-out infinite;">${icon}</div>
        <div style="font-family:'Orbitron',sans-serif;font-size:46px;color:${color};
            text-shadow:0 0 30px ${color},0 0 60px ${color};margin-top:18px;
            animation:slideUp 0.65s ease both;">${text}</div>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
}

// ============================================================
// EFFECTS
// ============================================================
function _playDeathAnimation(id, cb) {
    const po = S.players[id];
    if (!po) { cb && cb(); return; }
    const { group } = po;

    // Red flash
    group.traverse(c => {
        if (c.isMesh) {
            c.material = c.material.clone();
            c.material.emissive = new THREE.Color(0xff0000);
            c.material.emissiveIntensity = 2.5;
        }
    });

    // Camera shake
    const orig = S.camera.position.clone();
    let sc = 0;
    const shake = setInterval(() => {
        if (++sc > 7) { clearInterval(shake); S.camera.position.copy(orig); return; }
        S.camera.position.set(
            orig.x + (Math.random() - 0.5) * 0.35,
            orig.y + (Math.random() - 0.5) * 0.12,
            orig.z + (Math.random() - 0.5) * 0.35,
        );
    }, 45);

    // Fade emissive
    setTimeout(() => {
        group.traverse(c => { if (c.isMesh) c.material.emissiveIntensity = 0; });
    }, 280);

    // Topple forward
    let t = 0;
    const startRX = group.rotation.x;
    const startY  = group.position.y;
    const topple = setInterval(() => {
        t += 0.04;
        group.rotation.x = startRX + t * 1.3;
        group.position.y = startY  - t * 0.22;
        if (t >= 1) {
            clearInterval(topple);
            group.traverse(c => {
                if (c.isMesh) {
                    c.material = c.material.clone();
                    c.material.color.setHex(0x3a3a3a);
                    c.material.roughness = 1.0;
                    c.material.emissiveIntensity = 0;
                }
            });
            _spawnParticles(group.position.clone().add(new THREE.Vector3(0, 0.8, 0)),
                0x888888, 0x444444, 55, 2.0);
            cb && setTimeout(cb, 400);
        }
    }, 28);

    // Red point light flash
    const rl = new THREE.PointLight(0xff0000, 5.0, 6, 2);
    rl.position.copy(group.position).add(new THREE.Vector3(0, 1.5, 0));
    S.scene.add(rl);
    setTimeout(() => {
        let ri = 5.0;
        const fd = setInterval(() => {
            ri -= 0.25;
            rl.intensity = ri;
            if (ri <= 0) { clearInterval(fd); S.scene.remove(rl); }
        }, 25);
    }, 180);
}

function _showVoteEffect(fromId, toId) {
    const fp = _worldPos(fromId, 0, 1.55, 0);
    const tp = _worldPos(toId,   0, 1.55, 0);
    if (!fp || !tp) return;

    // Dashed line
    const geo = new THREE.BufferGeometry().setFromPoints([fp, tp]);
    const mat = new THREE.LineBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 1.0 });
    const line = new THREE.Line(geo, mat);
    S.scene.add(line);
    let op = 1.0;
    const fd = setInterval(() => {
        op -= 0.055;
        mat.opacity = op;
        if (op <= 0) { clearInterval(fd); S.scene.remove(line); geo.dispose(); mat.dispose(); }
    }, 40);

    // Ring at target
    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.035, 8, 32),
        new THREE.MeshStandardMaterial({ color: 0xff6b6b, emissive: 0xff2222, emissiveIntensity: 2.0, transparent: true, opacity: 1.0 })
    );
    ring.position.copy(tp).sub(new THREE.Vector3(0, 0.25, 0));
    ring.rotation.x = Math.PI / 2;
    S.scene.add(ring);
    setTimeout(() => {
        let ro = 1.0;
        const rfd = setInterval(() => {
            ro -= 0.04;
            ring.material.opacity = ro;
            ring.scale.multiplyScalar(1.025);
            if (ro <= 0) { clearInterval(rfd); S.scene.remove(ring); }
        }, 35);
    }, 350);
}

function _showSkillEffect(type, id) {
    const pos = _worldPos(id, 0, 1.0, 0);
    if (!pos) return;

    switch (type) {
        case 'seer': {
            // Gold scan cylinder
            const m = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.5, 3.2, 8, 1, true),
                new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 2.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
            );
            m.position.copy(pos).add(new THREE.Vector3(0, 1.6, 0));
            S.scene.add(m);
            const sl = new THREE.PointLight(0xffd700, 4.0, 6, 2);
            sl.position.copy(pos);
            S.scene.add(sl);
            let life = 1.0;
            const ani = () => {
                life -= 0.018;
                if (life <= 0) { S.scene.remove(m, sl); return; }
                m.material.opacity = life * 0.55;
                sl.intensity = life * 4.0;
                m.rotation.y += 0.07;
                requestAnimationFrame(ani);
            };
            requestAnimationFrame(ani);
            break;
        }
        case 'witch_poison':
            _spawnParticles(pos, 0x00ff44, 0x004422, 45, 2.2);
            break;
        case 'witch_heal':
            _spawnParticles(pos, 0xffffff, 0x88ddff, 38, 2.0);
            break;
        case 'guard': {
            const sm = new THREE.Mesh(
                new THREE.SphereGeometry(0.85, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
                new THREE.MeshStandardMaterial({ color: 0x0088ff, emissive: 0x002266, emissiveIntensity: 1.2, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
            );
            sm.position.copy(pos).sub(new THREE.Vector3(0, 0.2, 0));
            S.scene.add(sm);
            const sl = new THREE.PointLight(0x0088ff, 2.5, 5, 2);
            sl.position.copy(pos);
            S.scene.add(sl);
            let pt = 0;
            const pulse = () => {
                pt += 0.06;
                if (pt > Math.PI * 2.5) { S.scene.remove(sm, sl); return; }
                sm.material.opacity = 0.2 + Math.sin(pt * 3) * 0.14;
                sm.scale.setScalar(1 + Math.sin(pt * 2) * 0.06);
                sl.intensity = 2.0 + Math.sin(pt * 4) * 0.5;
                requestAnimationFrame(pulse);
            };
            requestAnimationFrame(pulse);
            break;
        }
        case 'wolf_kill': {
            const fl = new THREE.Mesh(
                new THREE.PlaneGeometry(1.6, 2.2),
                new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xaa0000, emissiveIntensity: 3.5, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
            );
            fl.position.copy(pos).add(new THREE.Vector3(0, 0.7, 0));
            fl.rotation.y = Math.random() * Math.PI;
            S.scene.add(fl);
            const wl = new THREE.PointLight(0xff0000, 6.0, 7, 2);
            wl.position.copy(pos);
            S.scene.add(wl);
            let fli = 1.0;
            const fld = () => {
                fli -= 0.065;
                if (fli <= 0) { S.scene.remove(fl, wl); return; }
                fl.material.opacity = fli * 0.85;
                wl.intensity = fli * 6;
                requestAnimationFrame(fld);
            };
            requestAnimationFrame(fld);
            _spawnParticles(pos, 0xff0000, 0x880000, 30, 1.4);
            break;
        }
    }
}

function _spawnParticles(pos, c1hex, c2hex, count, duration) {
    const geo = new THREE.BufferGeometry();
    const pArr = new Float32Array(count * 3);
    const vel  = [];
    const c1 = new THREE.Color(c1hex);
    const c2 = new THREE.Color(c2hex);
    const cArr = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
        pArr[i * 3]     = pos.x + (Math.random() - 0.5) * 0.4;
        pArr[i * 3 + 1] = pos.y + Math.random() * 0.5;
        pArr[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.4;
        vel.push(new THREE.Vector3(
            (Math.random() - 0.5) * 0.07,
            Math.random() * 0.11 + 0.02,
            (Math.random() - 0.5) * 0.07,
        ));
        const c = Math.random() > 0.5 ? c1 : c2;
        cArr[i * 3] = c.r; cArr[i * 3 + 1] = c.g; cArr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cArr, 3));

    const mat = new THREE.PointsMaterial({
        size: 0.11, vertexColors: true,
        transparent: true, opacity: 1.0,
        blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ps = new THREE.Points(geo, mat);
    S.scene.add(ps);

    let life = 1.0;
    const step = 1.0 / (duration * 60);
    const tick = () => {
        life -= step;
        if (life <= 0) { S.scene.remove(ps); geo.dispose(); mat.dispose(); return; }
        mat.opacity = life;
        const p = geo.attributes.position.array;
        for (let i = 0; i < count; i++) {
            p[i * 3]     += vel[i].x;
            p[i * 3 + 1] += vel[i].y;
            p[i * 3 + 2] += vel[i].z;
            vel[i].y -= 0.0018;
        }
        geo.attributes.position.needsUpdate = true;
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// ============================================================
// CAMERA
// ============================================================
function _focusPlayer(id, _dur = 1.8) {
    const po = S.players[id];
    if (!po || !S.controls) return;
    const wp = new THREE.Vector3().setFromMatrixPosition(po.group.matrixWorld);
    const dir = new THREE.Vector3(wp.x, 0, wp.z).normalize();
    // Smoothly move orbit target toward player
    S.controls.target.lerp(new THREE.Vector3(wp.x, wp.y + 0.8, wp.z), 0.5);
    S.controls.update();
}

function _resetCamera() {
    if (!S.controls) return;
    S.controls.target.set(0, 0.8, 0);
    S.camera.position.set(0, 8, 13);
    S.controls.update();
}

// ============================================================
// HELPERS
// ============================================================
function _worldPos(id, lx, ly, lz) {
    const po = S.players[id];
    if (!po) return null;
    const v = new THREE.Vector3(lx, ly, lz);
    v.applyMatrix4(po.group.matrixWorld);
    return v;
}

// ============================================================
// INTERACTION
// ============================================================
function _onCanvasClick(evt) {
    const canvas = document.getElementById('canvas3d');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    S.mouse.x =  ((evt.clientX - rect.left) / rect.width)  * 2 - 1;
    S.mouse.y = -((evt.clientY - rect.top)  / rect.height) * 2 + 1;

    S.raycaster.setFromCamera(S.mouse, S.camera);

    const meshes = [];
    Object.values(S.players).forEach(po => {
        po.group.traverse(c => { if (c.isMesh) meshes.push(c); });
    });

    const hits = S.raycaster.intersectObjects(meshes, false);
    if (hits.length) {
        const pid = hits[0].object.userData.playerId;
        if (pid !== undefined) {
            // Clear all select glows
            Object.keys(S.players).forEach(id => _setSelectGlow(Number(id), false));
            _setSelectGlow(pid, true);
            _focusPlayer(pid);

            const player = S.players[pid]?.data;
            if (player && typeof window.onPlayerClick === 'function') {
                window.onPlayerClick(player);
            }
        }
    }
}

// ============================================================
// RESIZE
// ============================================================
function _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(w, h);
    S.composer.setSize(w, h);
    S.bloomPass.resolution.set(w, h);
}

// ============================================================
// ANIMATE LOOP
// ============================================================
function _animate() {
    requestAnimationFrame(_animate);
    const delta   = S.clock.getDelta();
    const elapsed = S.clock.getElapsedTime();

    _tickTweens(delta);

    // Torch flicker
    S.torchLights.forEach(({ light, baseIntensity, phase }) => {
        light.intensity = baseIntensity * (0.84 + 0.14 * Math.sin(elapsed * 5.5 + phase) + 0.07 * Math.sin(elapsed * 14 + phase * 2.3));
    });

    // Flame jitter
    S.torchFlames.forEach((fl, i) => {
        fl.scale.y = 0.82 + 0.18 * Math.sin(elapsed * 9  + i * 0.75);
        fl.scale.x = 0.88 + 0.12 * Math.sin(elapsed * 6  + i * 1.3);
        fl.position.y += Math.sin(elapsed * 15 + i) * 0.0004;
    });

    // OrbitControls update (handles all camera interaction)
    if (S.controls) S.controls.update();

    // Dust
    if (S.dustParticles) {
        const p = S.dustParticles.geometry.attributes.position.array;
        const v = S.dustVel;
        for (let i = 0; i < p.length / 3; i++) {
            p[i*3]   += v[i*3];
            p[i*3+1] += v[i*3+1];
            p[i*3+2] += v[i*3+2];
            if (Math.abs(p[i*3])   > 10) v[i*3]   *= -1;
            if (p[i*3+1] > 5.5 || p[i*3+1] < 0.1) v[i*3+1] *= -1;
            if (Math.abs(p[i*3+2]) > 10) v[i*3+2] *= -1;
        }
        S.dustParticles.geometry.attributes.position.needsUpdate = true;
    }

    _updateNameplates();
    S.composer.render();
}

// ============================================================
// INIT
// ============================================================
function _init() {
    if (S.initialized) return;
    S.initialized = true;

    const canvas = document.getElementById('canvas3d');
    if (!canvas) { console.error('[3D] canvas3d not found'); return; }

    // Renderer
    S.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    S.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    S.renderer.setSize(window.innerWidth, window.innerHeight);
    S.renderer.shadowMap.enabled = true;
    S.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    S.renderer.toneMappingExposure = 1.15;
    S.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Scene
    S.scene = new THREE.Scene();
    S.scene.fog = new THREE.FogExp2(0x0a0818, 0.020);  // day default (lighter)

    // Camera
    S.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
    S.camera.position.copy(S.camPos);
    S.camera.lookAt(S.camLook);

    // Post-processing
    S.composer = new EffectComposer(S.renderer);
    S.composer.addPass(new RenderPass(S.scene, S.camera));
    S.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.42, 0.55, 0.82
    );
    S.composer.addPass(S.bloomPass);
    S.composer.addPass(new OutputPass());

    S.nameplateLayer = document.getElementById('nameplate-layer');

    _buildLighting();
    _buildArena();
    _buildTable();
    _buildDustParticles();

    // OrbitControls — 允许拖拽旋转/缩放/平移
    S.controls = new OrbitControls(S.camera, canvas);
    S.controls.enableDamping = true;
    S.controls.dampingFactor = 0.08;
    S.controls.minDistance = 4;
    S.controls.maxDistance = 22;
    S.controls.minPolarAngle = Math.PI / 8;   // 不能翻到底部
    S.controls.maxPolarAngle = Math.PI / 2.1; // 不能低于地面
    S.controls.target.set(0, 0.8, 0);
    S.controls.update();

    document.getElementById('canvas3d').addEventListener('click', _onCanvasClick);
    window.addEventListener('resize', _onResize);

    _animate();
    console.log('[3D] Scene initialized ✓');
}

// ============================================================
// PUBLIC API
// ============================================================
// 即时设置白天场景（无动画，用于 phase 状态同步）
function _setDayInstant() {
    if (!S.ambientLight) return;
    S.isNight = false;
    S.ambientLight.intensity = 2.8;
    S.ambientLight.color.setHex(0xfff0e0);
    S.hemiLight.intensity = 1.2;
    S.mainLight.intensity = 2.5;
    S.mainLight.color.setHex(0xfff5cc);
    if (S.sunBeam) S.sunBeam.intensity = 4.0;
    S.scene.fog.density = 0.012;
    S.bloomPass.strength = 0.28;
    // 白天熄灭火把/蜡烛
    S.torchLights.forEach(tl => { tl.light.intensity = 0; });
}

// 即时设置夜间场景（无动画，用于 phase 状态同步）
function _setNightInstant() {
    if (!S.ambientLight) return;
    S.isNight = true;
    S.ambientLight.intensity = 0.3;
    S.ambientLight.color.setHex(0x1a1030);
    S.hemiLight.intensity = 0.3;
    S.mainLight.intensity = 0.4;
    S.mainLight.color.setHex(0x2233bb);
    if (S.sunBeam) S.sunBeam.intensity = 0;
    S.scene.fog.density = 0.048;
    S.bloomPass.strength = 0.75;
    // 夜晚点亮火把/蜡烛
    S.torchLights.forEach(tl => { tl.light.intensity = tl.baseIntensity * 2.1; });
}

window.Scene3D = {
    get initialized() { return S.initialized; },
    init:                _init,
    initPlayers:         _initPlayers,
    updateAllPlayers:    _updateAllPlayers,
    showSpeechBubble:    _showSpeech,
    hideSpeechBubble:    _hideSpeech,
    setSpeakGlow:        _setSpeakGlow,
    setSelectGlow:       _setSelectGlow,
    playNightTransition: _nightTransition,
    playDayTransition:   _dayTransition,
    setDayInstant:       _setDayInstant,
    setNightInstant:     _setNightInstant,
    showDeathEffect:     _playDeathAnimation,
    showVoteEffect:      _showVoteEffect,
    showSkillEffect:     _showSkillEffect,
    focusPlayer:         _focusPlayer,
    resetCamera:         _resetCamera,
    isNight:             () => S.isNight,
};

// Auto-init when style is 3d
if (window.gameStyle === '3d') {
    _init();
}
