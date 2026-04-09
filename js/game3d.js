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

function _makeGrassTexture(size = 512) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    
    ctx.fillStyle = '#2d5a27'; // base green
    ctx.fillRect(0, 0, size, size);
    
    const id = ctx.getImageData(0, 0, size, size);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 40;
        d[i] = Math.max(0, Math.min(255, d[i] + n - 10));     // R
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));  // G
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n - 20)); // B
    }
    ctx.putImageData(id, 0, 0);
    return new THREE.CanvasTexture(c);
}

// ============================================================
// SCENE BUILDING
// ============================================================
function _buildLighting() {
    S.ambientLight = new THREE.AmbientLight(0xfff0e0, 2.8);  // day default — warm bright
    S.scene.add(S.ambientLight);

    S.hemiLight = new THREE.HemisphereLight(0x8090c0, 0x3a4810, 1.2); // slight green bounce
    S.scene.add(S.hemiLight);

    // Moon/sun directional — default DAY
    S.mainLight = new THREE.DirectionalLight(0xfff5cc, 2.5);
    S.mainLight.position.set(6, 18, 8);
    S.mainLight.castShadow = true;
    S.mainLight.shadow.mapSize.set(2048, 2048);
    S.mainLight.shadow.camera.near = 0.5;
    S.mainLight.shadow.camera.far = 55;
    S.mainLight.shadow.camera.left = -15;
    S.mainLight.shadow.camera.right = 15;
    S.mainLight.shadow.camera.top = 15;
    S.mainLight.shadow.camera.bottom = -15;
    S.mainLight.shadow.bias = -0.0008;
    S.mainLight.shadow.normalBias = 0.02;
    S.scene.add(S.mainLight);

    // 天窗阳光束（从顶部开口直射，保留作为中心高光点缀）
    S.sunBeam = new THREE.SpotLight(0xfff0cc, 4.0, 18, Math.PI / 5, 0.35, 1.5);
    S.sunBeam.position.set(0, 12, 0);
    S.sunBeam.target.position.set(0, 0, 0);
    S.sunBeam.castShadow = false;
    S.scene.add(S.sunBeam);
    S.scene.add(S.sunBeam.target);

    // No torches on grass field
    S.torchLights = [];
    S.torchFlames = [];
}

function _buildArena() {
    const grassTex = _makeGrassTexture(1024);
    grassTex.repeat.set(16, 16);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;

    // Grass Floor
    const floorMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0xcccccc, roughness: 1.0, metalness: 0.0 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    S.scene.add(floor);

    // Sky dome
    S.skyMesh = new THREE.Mesh(
        new THREE.SphereGeometry(55, 32, 16),
        new THREE.MeshBasicMaterial({ color: 0x0a1622, side: THREE.BackSide })
    );
    S.scene.add(S.skyMesh);

    // Moon
    S.moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xe8e4c0, emissive: 0xb8b490, emissiveIntensity: 0.6, roughness: 0.85 })
    );
    S.moonMesh.position.set(10, 38, -32);
    S.scene.add(S.moonMesh);

    // Sun
    S.sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(3.5, 32, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    S.sunMesh.position.set(-10, 38, 32); 
    S.scene.add(S.sunMesh);

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
    // Left completely empty because animals sit directly on the grass.
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

function _createAnimal(player, index) {
    const group = new THREE.Group();
    
    const add = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(px, py, pz);
        m.rotation.set(rx, ry, rz);
        m.scale.set(sx, sy, sz);
        m.castShadow = true;
        group.add(m);
        return m;
    };

    const getMat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0 });
    const whtMat = getMat(0xffffff);
    const blkMat = getMat(0x111111);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const animalType = index % 12;
    // 0:Cat, 1:Dog, 2:Rabbit, 3:Panda, 4:Fox, 5:Bear, 6:Pig, 7:Koala, 8:Frog, 9:Chicken, 10:Penguin, 11:Cow
    const colors = [
        0xff9900, 0x8b4513, 0xffffff, 0xffffff, 0xff4500, 0xa0522d, 
        0xffb6c1, 0x808080, 0x32cd32, 0xffff00, 0x222222, 0xffffff
    ];
    
    const mat = getMat(colors[animalType]);
    const bodyMat = (animalType === 3 || animalType === 10 || animalType === 11) ? whtMat : mat;

    // Head
    add(new THREE.SphereGeometry(0.3, 24, 16), mat, 0, 1.45, 0);
    // Body
    add(new THREE.CylinderGeometry(0.18, 0.22, 0.45, 16), bodyMat, 0, 1.05, 0);
    
    // Hands
    add(new THREE.SphereGeometry(0.08, 12, 12), mat, -0.22, 0.9, 0.2, 0, 0, 0, 1, 1, 1.2);
    add(new THREE.SphereGeometry(0.08, 12, 12), mat,  0.22, 0.9, 0.2, 0, 0, 0, 1, 1, 1.2);

    // Eyes
    add(new THREE.SphereGeometry(0.05, 12, 12), whtMat, -0.1, 1.5, 0.26);
    add(new THREE.SphereGeometry(0.05, 12, 12), whtMat,  0.1, 1.5, 0.26);
    add(new THREE.SphereGeometry(0.025, 12, 12), eyeMat, -0.1, 1.5, 0.30);
    add(new THREE.SphereGeometry(0.025, 12, 12), eyeMat,  0.1, 1.5, 0.30);

    // Specific features
    if (animalType === 0) { // Cat ears
        add(new THREE.ConeGeometry(0.08, 0.2, 8), mat, -0.15, 1.7, 0, 0, 0, 0.3);
        add(new THREE.ConeGeometry(0.08, 0.2, 8), mat,  0.15, 1.7, 0, 0, 0, -0.3);
    } else if (animalType === 1) { // Dog ears / snout
        add(new THREE.BoxGeometry(0.1, 0.25, 0.05), mat, -0.2, 1.55, 0.1, 0, 0, 0.2);
        add(new THREE.BoxGeometry(0.1, 0.25, 0.05), mat,  0.2, 1.55, 0.1, 0, 0, -0.2);
        add(new THREE.SphereGeometry(0.08, 12, 12), whtMat, 0, 1.4, 0.3);
        add(new THREE.SphereGeometry(0.03, 8, 8), blkMat, 0, 1.42, 0.38);
    } else if (animalType === 2) { // Rabbit
        add(new THREE.CapsuleGeometry(0.06, 0.25, 8, 8), mat, -0.1, 1.75, 0);
        add(new THREE.CapsuleGeometry(0.06, 0.25, 8, 8), mat,  0.1, 1.75, 0);
    } else if (animalType === 3) { // Panda
        add(new THREE.SphereGeometry(0.08, 12, 12), blkMat, -0.2, 1.65, 0);
        add(new THREE.SphereGeometry(0.08, 12, 12), blkMat,  0.2, 1.65, 0);
        add(new THREE.SphereGeometry(0.07, 12, 12), blkMat, -0.1, 1.5, 0.25); // eye patch
        add(new THREE.SphereGeometry(0.07, 12, 12), blkMat,  0.1, 1.5, 0.25);
    } else if (animalType === 4) { // Fox
        add(new THREE.ConeGeometry(0.1, 0.25, 8), mat, -0.18, 1.7, 0, 0, 0, 0.2);
        add(new THREE.ConeGeometry(0.1, 0.25, 8), mat,  0.18, 1.7, 0, 0, 0, -0.2);
        add(new THREE.ConeGeometry(0.08, 0.15, 8), whtMat, 0, 1.4, 0.33, Math.PI/2);
    } else if (animalType === 5 || animalType === 7) { // Bear / Koala
        add(new THREE.SphereGeometry(0.1, 12, 12), mat, -0.25, 1.65, 0);
        add(new THREE.SphereGeometry(0.1, 12, 12), mat,  0.25, 1.65, 0);
        add(new THREE.SphereGeometry(0.05, 8, 8), blkMat, 0, 1.42, 0.32);
    } else if (animalType === 6) { // Pig
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12), getMat(0xff69b4), 0, 1.4, 0.32, Math.PI/2);
        add(new THREE.ConeGeometry(0.08, 0.15, 8), mat, -0.15, 1.65, 0);
        add(new THREE.ConeGeometry(0.08, 0.15, 8), mat,  0.15, 1.65, 0);
    } else if (animalType === 8) { // Frog
        add(new THREE.SphereGeometry(0.08, 12, 12), mat, -0.12, 1.65, 0.15);
        add(new THREE.SphereGeometry(0.08, 12, 12), mat,  0.12, 1.65, 0.15);
    } else if (animalType === 9) { // Chicken
        add(new THREE.ConeGeometry(0.05, 0.15, 8), getMat(0xff8c00), 0, 1.4, 0.33, Math.PI/2);
        add(new THREE.BoxGeometry(0.05, 0.1, 0.05), getMat(0xff0000), 0, 1.7, 0);
    } else if (animalType === 10) { // Penguin
        add(new THREE.ConeGeometry(0.05, 0.15, 8), getMat(0xff8c00), 0, 1.4, 0.33, Math.PI/2);
    } else if (animalType === 11) { // Cow
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), getMat(0xdddddd), -0.15, 1.65, 0, 0, 0, 0.2);
        add(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 8), getMat(0xdddddd),  0.15, 1.65, 0, 0, 0, -0.2);
        add(new THREE.BoxGeometry(0.12, 0.12, 0.02), blkMat, 0.1, 1.3, 0.28); // spots
        add(new THREE.BoxGeometry(0.15, 0.15, 0.02), blkMat, -0.1, 1.1, 0.2);
    }

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

        const group = _createAnimal(player, index);
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
function _showSpeech(player, text, isThinking = false, emotion = 'normal') {
    _hideSpeech();

    const el = document.createElement('div');
    el.className = 'speech-bubble-3d' + (isThinking ? ' thinking-3d' : '');
    
    const emotionMap = {
        'normal': '',
        'angry': '💢 ',
        'doubt': '🤔 ',
        'fear': '😰 ',
        'happy': '😆 '
    };
    const emoIcon = emotionMap[emotion] || '';

    el.innerHTML = `
        <div class="sb-name">${emoIcon}${player.icon || '👤'} ${player.name}</div>
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
        addTween(S.ambientLight, { intensity: 2.2  }, 2.2); // raised from 0.3 to 2.2
        addTween(S.mainLight,    { intensity: 1.8  }, 2.2); // raised from 0.4 to 1.8
        addTween(S.scene.fog,    { density: 0.012 }, 2.2);  // cleared up matching day
        addTween(S.bloomPass,    { strength: 0.4 }, 2.2);
        S.mainLight.color.setHex(0xaaaaee);
        S.ambientLight.color.setHex(0xa0a0c0);
        if (S.sunBeam) addTween(S.sunBeam, { intensity: 0 }, 1.5);
        if (S.sunMesh) addTween(S.sunMesh.position, { y: -20 }, 2.0);
        if (S.moonMesh) addTween(S.moonMesh.position, { y: 38 }, 2.0);

        _showPhaseOverlay('🌙', '天黑请闭眼', '#4466ff');
        setTimeout(resolve, 3200);
    });
}

function _dayTransition() {
    return new Promise(resolve => {
        S.isNight = false;
        addTween(S.ambientLight, { intensity: 3.2 }, 2.2); // raised from 2.8 to 3.2 for extra brightness
        addTween(S.mainLight,    { intensity: 3.0 }, 2.2); // raised from 2.5 to 3.0
        addTween(S.scene.fog,    { density: 0.005 }, 2.2); // less dense fog
        addTween(S.bloomPass,    { strength: 0.28 }, 2.2);
        S.mainLight.color.setHex(0xffffff);
        S.ambientLight.color.setHex(0xffffff);
        if (S.sunBeam) addTween(S.sunBeam, { intensity: 5.0 }, 2.0);
        if (S.sunMesh) addTween(S.sunMesh.position, { y: 38 }, 2.0);
        if (S.moonMesh) addTween(S.moonMesh.position, { y: -20 }, 2.0);
        
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
