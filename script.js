const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const GAME_CONFIG = {economy: {startGold: 350, baseIncome: 10, incomeTick: 60, merchantBonus: 10},
                     base: {player: { x: 60, y: 200, hp: 5000, color: '#3498db' },
                            enemy:  { x: 780, y: 200, hp: 10000, color: '#e74c3c' }},
                     gacha: {cost: 200, unlockStage: 2, 
                             probs: { hero: 15, resource: 50}},
                     units: [
                         { id: 'sword',  name: '검병',   desc: '근접 기본',   cost: 50,  hp: 120, dmg: 10,  range: 35,  speed: 1.5, cd: 30,  color: '#ecf0f1', icon: '⚔️', upgrade: 80 },
                         { id: 'archer', name: '궁수',   desc: '원거리 지원', cost: 100, hp: 70,  dmg: 15,  range: 160, speed: 1.2, cd: 45,  color: '#2ecc71', icon: '🏹', upgrade: 150 },
                         { id: 'tank',   name: '방패병', desc: '높은 체력',   cost: 150, hp: 450, dmg: 8,   range: 35,  speed: 0.8, cd: 60,  color: '#f1c40f', icon: '🛡️', upgrade: 200 },
                         { id: 'wizard', name: '마법사', desc: '광역 폭딜',   cost: 380, hp: 90,  dmg: 40,  range: 140, speed: 1.0, cd: 90,  color: '#9b59b6', icon: '🔮', upgrade: 400 },
                         { id: 'cannon', name: '대포',   desc: '고정형 포탑', cost: 400, hp: 250, dmg: 120, range: 420, speed: 0,   cd: 150, color: '#34495e', icon: '💣', upgrade: 500 }
                     ],
                     heroes: [
                         { id: 'merchant', name: '거상', desc: '수입 증가',   cost: 150, hp: 300, dmg: 0,   range: 180, speed: 0.8, cd: 60, color: '#FFD700', icon: '💰', effectRange: 50,  upgrade: 500 },
                         { id: 'healer',   name: '사제', desc: '아군 치유',   cost: 50, hp: 150, dmg: -20, range: 160, speed: 1.0, cd: 45, color: '#fab1a0', icon: '🌿', effectRange: 200, upgrade: 500 },
                         { id: 'general',  name: '장군', desc: '공격력 버프', cost: 50, hp: 600, dmg: 20,  range: 150, speed: 0.9, cd: 90, color: '#e67e22', icon: '🚩', effectRange: 200, upgrade: 500 }
                     ],
                     boss: { id: 'midboss', name: '오크 대장', cost: 1000, hp: 3000, dmg: 80, range: 50, speed: 0.6, color: '#8e44ad', icon: '👹'},
                     stages: [
                         { level: 1, duration: 35, spawnInterval: 200, unitIdxs: [0],       title: "1단계: 정찰대" },
                         { level: 2, duration: 35, spawnInterval: 160, unitIdxs: [0, 1],    title: "2단계: 공격 부대" },
                         { level: 3, duration: 35, spawnInterval: 130, unitIdxs: [0, 1, 2], title: "3단계: 정규군 진격" },
                         { level: 4, duration: 35, spawnInterval: 120, unitIdxs: [0, 1, 2], title: "4단계: 보스 지원 사격" }, 
                         { level: 5, duration: 35, spawnInterval: 100,  unitIdxs: [0, 1, 2, 3], title: "5단계: 마법 부대 합류" },
                         { level: 6, duration: 35, spawnInterval: 70,  unitIdxs: [0, 1, 2, 3, 4], title: "6단계: 총공격 개시" },
                         { level: 7, duration: 999, spawnInterval: 50, unitIdxs: [0, 1, 2, 3, 4], title: "7단계: 최후의 결전" }
]};

let unitTypes = GAME_CONFIG.units.map(u => ({
    ...u, type: 'icon', level: 1, maxLevel: 10, baseHp: u.hp, baseDmg: u.dmg, upgradeCostBase: u.upgrade
}));

let specialUnits = GAME_CONFIG.heroes.map(u => ({
    ...u, type: 'icon', level: 1, maxLevel: 5, baseHp: u.hp, baseDmg: u.dmg, upgradeCostBase: u.upgrade
}));

let midBossData = { 
    ...GAME_CONFIG.boss, type: 'icon', level: 1, baseHp: GAME_CONFIG.boss.hp, baseDmg: GAME_CONFIG.boss.dmg 
};

// 게임 상태
let gameState = {
    gold: GAME_CONFIG.economy.startGold,
    baseIncome: GAME_CONFIG.economy.baseIncome,
    currentIncome: GAME_CONFIG.economy.baseIncome,
    frame: 0,
    seconds: 0,
    stage: 1,
    midBossSpawned: false,
    gameOver: false,
    enemySpawnCooldown: 0,
    heroes: []
};
const playerBase = { ...GAME_CONFIG.base.player, maxHp: GAME_CONFIG.base.player.hp };
const enemyBase = { ...GAME_CONFIG.base.enemy, maxHp: GAME_CONFIG.base.enemy.hp };

let units = [];
let playerCooldowns = {};
let particles = [];
let damageTexts = [];

function getUnitStats(unitData) {
    if (unitData.level === 1) return { hp: unitData.baseHp, dmg: unitData.baseDmg };
    const multiplier = 1 + (unitData.level - 1) * 0.2; 
    return {
        hp: Math.floor(unitData.baseHp * multiplier),
        dmg: Math.floor(unitData.baseDmg * multiplier)
    };
}

function getUpgradeCost(unitData) {
    return unitData.upgradeCostBase * unitData.level;
}

class Unit {
    constructor(typeData, team) {
        this.id = typeData.id;
        this.type = typeData.type;
        this.name = typeData.name;
        this.team = team;
        this.bounty = Math.floor((typeData.cost || 100) * 0.2); 

        if (this.id === 'midboss') this.bounty = typeData.cost;

        const levelToUse = (team === 'player') ? typeData.level : 1;
        let stats = { hp: typeData.baseHp, dmg: typeData.baseDmg };
        if (levelToUse > 1) {
            const multiplier = 1 + (levelToUse - 1) * 0.2; 
            stats.hp = Math.floor(stats.hp * multiplier);
            stats.dmg = Math.floor(stats.dmg * multiplier);
        }
        
        if (team === 'enemy' && this.id !== 'midboss') {
            const stageMulti = 1 + (gameState.stage - 1) * 0.15;
            stats.hp *= stageMulti;
            stats.dmg *= stageMulti;
            this.bounty = Math.floor(this.bounty * (1 + (gameState.stage - 1) * 0.1));
        }

        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.dmg = stats.dmg;
        this.range = typeData.range;
        this.speed = typeData.speed;
        this.color = typeData.color;
        this.effectRange = typeData.effectRange || 0; 
        
        this.maxAttackCooldown = (this.id === 'cannon') ? 100 : 50;
        this.attackCooldown = 0;
        this.attackAnim = 0; 

        this.y = 300 + (Math.random() * 30 - 15); 
        if (team === 'player') {
            this.x = playerBase.x + 40;
            if(this.id === 'cannon') this.x = playerBase.x + 20 + (Math.random()*10); 
            this.direction = 1;
        } else {
            this.x = enemyBase.x - 40;
            this.direction = -1;
        }
    }
    
    refreshStats() {
        if (this.team !== 'player') return;
        let typeData = unitTypes.find(u => u.id === this.id);
        if (!typeData) typeData = gameState.heroes.find(h => h.id === this.id);
        if (!typeData) return;

        const newStats = getUnitStats(typeData);
        const hpRatio = this.hp / this.maxHp;
        this.maxHp = newStats.hp;
        this.hp = this.maxHp * hpRatio;
        this.dmg = newStats.dmg;
    }

    update() {
        if (this.hp <= 0) return;
        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.attackAnim > 0) this.attackAnim--;

        if (this.id === 'merchant' && gameState.frame % 60 === 0) {
            this.attackAnim = 10; 
        }

        let target = null;
        let minDist = Infinity;
        
        if (this.dmg < 0) { // 힐러
            const allies = units.filter(u => u.team === this.team && u !== this && u.hp < u.maxHp);
            for (let a of allies) {
                let dist = Math.abs(a.x - this.x);
                if (dist < minDist) { minDist = dist; target = a; }
            }
        } else { // 딜러
            const enemies = units.filter(u => u.team !== this.team && u.hp > 0);
            for (let e of enemies) {
                let dist = Math.abs(e.x - this.x);
                if (dist < minDist) { minDist = dist; target = e; }
            }
            
            if (this.id !== 'merchant') {
                let baseTarget = (this.team === 'player') ? enemyBase : playerBase;
                let distToBase = Math.abs(baseTarget.x - this.x);
                if (this.id !== 'cannon' || distToBase <= this.range) {
                    if (distToBase < minDist) { target = baseTarget; minDist = distToBase; }
                }
            }
        }

        let inRange = false;
        let checkRange = this.range + (this.id === 'midboss' ? 20 : 0);
        if (target && minDist <= checkRange) inRange = true;

        if (inRange) {
            if (this.attackCooldown <= 0) {
                if (this.dmg !== 0) {
                    this.attack(target);
                    this.attackCooldown = this.maxAttackCooldown;
                }
            }
        } else {
            this.x += this.speed * this.direction;
            if (this.x < 15) this.x = 15;
            if (this.x > canvas.width - 15) this.x = canvas.width - 15;
        }
    }

    attack(target) {
        this.attackAnim = 15; 

        let actualDmg = this.dmg;
        if (actualDmg > 0 && this.team === 'player') {
            const hasGeneral = units.some(u => u.team === 'player' && u.id === 'general' && Math.abs(u.x - this.x) < u.effectRange);
            if (hasGeneral) actualDmg *= 1.5; 
        }

        if (this.id === 'cannon') {
            createParticle(this.x + 20 * this.direction, this.y - 10, '#555', 8); 
            createDamageText(this.x, this.y - 40, "BOOM!", "#f39c12");
        }

        if (actualDmg < 0) { // 힐
            target.hp = Math.min(target.maxHp, target.hp - actualDmg);
            createDamageText(target.x, target.y - 30, "+" + Math.abs(Math.floor(actualDmg)), "green");
            for(let i=0; i<5; i++) createParticle(target.x, target.y, '#2ecc71');
        } else { // 공격
            target.hp -= actualDmg;
            createDamageText(target.x, target.y - 30, Math.floor(actualDmg), "white");
            for(let i=0; i<3; i++) createParticle(target.x, target.y, 'red');
        }
    }

    draw() {
        let animOffsetX = 0;
        let animOffsetY = 0;

        if (this.attackAnim > 0) {
            const p = this.attackAnim / 15; 
            const amount = 8; 
            if (['sword', 'tank', 'midboss', 'general'].includes(this.id)) {
                animOffsetX = Math.sin(p * Math.PI) * amount * this.direction;
            } else if (this.id === 'merchant') {
                animOffsetY = -Math.sin(p * Math.PI) * amount;
            } else {
                animOffsetX = -Math.sin(p * Math.PI) * (amount * 0.5) * this.direction;
            }
        }

        const drawX = this.x + animOffsetX;
        const drawY = this.y + animOffsetY;

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.scale(this.direction, 1); 

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 12, 8, 3, 0, 0, Math.PI*2);
        ctx.fill();

        drawUnitIcon(ctx, this.id, this.team, this.color);

        ctx.restore(); 

        if (this.team === 'player') {
            if (this.id === 'general') {
                ctx.beginPath(); ctx.strokeStyle = 'rgba(230, 126, 34, 0.5)';
                ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
                ctx.arc(this.x, this.y, this.effectRange, 0, Math.PI*2);
                ctx.stroke(); ctx.setLineDash([]);
            }
        }

        const hpPercent = Math.max(0, this.hp / this.maxHp);
        const barW = (this.id === 'midboss') ? 50 : 24;
        const barY = (this.id === 'midboss') ? 50 : 25;

        ctx.fillStyle = '#222'; 
        ctx.fillRect(this.x - barW/2, this.y - barY, barW, 4);
        ctx.fillStyle = this.team === 'player' ? '#2ecc71' : '#e74c3c';
        ctx.fillRect(this.x - barW/2, this.y - barY, barW * hpPercent, 4);
    }
}

// --- 그래픽 이펙트 ---
function createParticle(x, y, color, size=3) {
    particles.push({x, y, vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4, life: 15, color, size});
}

function createDamageText(x, y, text, color) {
    damageTexts.push({
        x: x, y: y, text: text, color: color || "white",
        life: 60, maxLife: 60, vy: -1.0
    });
}

function updateAndDrawEffects() {
    particles.forEach((p, i) => {
        ctx.fillStyle = p.color;
        p.x += p.vx; p.y += p.vy; p.life--;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        if(p.life <= 0) particles.splice(i, 1);
    });

    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    damageTexts.forEach((t, i) => {
        t.y += t.vy; t.life--;
        const alpha = t.life / t.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = t.color;
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 3;
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillText(t.text, t.x, t.y);
        ctx.globalAlpha = 1.0;
        if(t.life <= 0) damageTexts.splice(i, 1);
    });
}

// --- UI 관리 ---
function initDeck() {
    const deckContainer = document.getElementById('deck-container');
    deckContainer.innerHTML = '';
    unitTypes.forEach(unit => createUnitButton(unit));
    gameState.heroes.forEach(hero => createUnitButton(hero));
}

function createUnitButton(unit) {
    const deckContainer = document.getElementById('deck-container');
    if(document.getElementById(`card-${unit.id}`)) return;

    if(!playerCooldowns[unit.id]) playerCooldowns[unit.id] = 0;
    
    const stats = getUnitStats(unit);
    let atkDisplay = stats.dmg;
    let atkIcon = "⚔️";
    if (unit.id === 'healer') { atkDisplay = Math.abs(stats.dmg); atkIcon = "💚"; } 
    else if (unit.id === 'merchant') { atkDisplay = "-"; atkIcon = "❌"; }

    const card = document.createElement('div');
    card.className = `card ${['merchant','general','healer'].includes(unit.id) ? 'hero-card' : ''}`;
    card.id = `card-${unit.id}`;
    card.style.borderBottom = `4px solid ${unit.color}`;
    
    let badgeHtml = unit.maxLevel ? `<div class="lvl-badge" id="badge-${unit.id}">Lv.${unit.level}</div>` : '';
    let upgradeBtnHtml = '';
    if (unit.maxLevel) {
        const upCost = getUpgradeCost(unit);
        upgradeBtnHtml = `
            <button class="upgrade-btn" id="upbtn-${unit.id}" onclick="buyUpgrade('${unit.id}')">
                <span>⬆️ 강화</span>
                <span style="font-size:10px; color:#ffd700;">${upCost} G</span>
            </button>
        `;
    }

    card.innerHTML = `
        ${badgeHtml}
        <div class="spawn-zone" onclick="buyUnit('${unit.id}')">
            <div class="card-icon">${unit.icon}</div>
            <div class="card-name">${unit.name}</div>
            <div class="card-cost">💰 ${unit.cost}</div>
            <div class="card-stats">
                <div style="text-align:center; color:#fff; border-bottom:1px solid #555; padding-bottom:2px; margin-bottom:2px;">${unit.desc}</div>
                <div class="stat-row"><span class="stat-label">❤️ HP</span><span class="stat-val" id="hp-${unit.id}">${stats.hp}</span></div>
                <div class="stat-row"><span class="stat-label">${atkIcon} ATK</span><span class="stat-val" id="dmg-${unit.id}">${atkDisplay}</span></div>
            </div>
            <div class="cooldown-overlay" id="cool-${unit.id}"></div>
        </div>
        ${upgradeBtnHtml}
    `;
    deckContainer.appendChild(card);
}

function refreshCardUI(unit) {
    const card = document.getElementById(`card-${unit.id}`);
    if (!card) return;

    const stats = getUnitStats(unit);
    card.querySelector(`#hp-${unit.id}`).innerText = stats.hp;
    
    let atkDisplay = stats.dmg;
    if (unit.id === 'healer') atkDisplay = Math.abs(stats.dmg);
    else if (unit.id === 'merchant') atkDisplay = "-";
    card.querySelector(`#dmg-${unit.id}`).innerText = atkDisplay;

    if (unit.maxLevel) {
        card.querySelector(`#badge-${unit.id}`).innerText = `Lv.${unit.level}`;
        const btn = document.getElementById(`upbtn-${unit.id}`);
        if (unit.level >= unit.maxLevel) {
            btn.innerHTML = `<span>MAX</span>`;
            btn.classList.add('max-lvl');
        } else {
            const upCost = getUpgradeCost(unit);
            btn.innerHTML = `<span>⬆️ 강화</span><span style="font-size:10px; color:#ffd700;">${upCost} G</span>`;
        }
    }
}

function buyUnit(unitId) {
    if (gameState.gameOver) return;
    let unitData = unitTypes.find(u => u.id === unitId);
    if (!unitData) unitData = gameState.heroes.find(h => h.id === unitId);
    if (!unitData) return;
    if (playerCooldowns[unitData.id] > 0) return;

    if (gameState.gold >= unitData.cost) {
        gameState.gold -= unitData.cost;
        units.push(new Unit(unitData, 'player'));
        playerCooldowns[unitData.id] = unitData.cd; // Config의 cd 속성 사용
        updateUI();
    }
}

function buyUpgrade(unitId) {
    if (gameState.gameOver) return;
    let unitData = unitTypes.find(u => u.id === unitId);
    if (!unitData) unitData = gameState.heroes.find(h => h.id === unitId);
    if (!unitData) return;
    if (unitData.level >= unitData.maxLevel) return;

    const cost = getUpgradeCost(unitData);
    if (gameState.gold >= cost) {
        gameState.gold -= cost;
        unitData.level++;
        refreshCardUI(unitData);
        createDamageText(playerBase.x, playerBase.y - 150, `${unitData.name} Lv.${unitData.level} 강화!`, "#2ecc71");
        units.forEach(u => {
            if (u.id === unitId && u.team === 'player') u.refreshStats();
        });
        updateUI();
    }
}

// 확률형 랜덤 박스 (가챠)
function playGacha() {
    const { cost, probs } = GAME_CONFIG.gacha;
    
    if (gameState.gold < cost) {
        alert(`골드가 부족합니다! (필요: ${cost} G)`);
        return;
    }
    
    gameState.gold -= cost;
    createDamageText(playerBase.x, playerBase.y - 220, "랜덤 박스 개봉!", "white");

    const rand = Math.random() * 100; // 0 ~ 100
    
    // 1. 특수 영웅 획득 (설정된 확률)
    if (rand < probs.hero) {
        const heroPool = specialUnits;
        const picked = heroPool[Math.floor(Math.random() * heroPool.length)];
        
        const existing = gameState.heroes.find(h => h.id === picked.id);
        if (existing) {
            if (existing.level < existing.maxLevel) {
                existing.level++;
                refreshCardUI(existing);
                createDamageText(playerBase.x, playerBase.y - 100, `💎 대박! ${picked.name} 레벨업!`, "#FFD700");
            } else {
                gameState.gold += 500;
                createDamageText(playerBase.x, playerBase.y - 100, `💎 이미 만렙! +500G`, "#FFD700");
            }
        } else {
            const newHero = JSON.parse(JSON.stringify(picked));
            gameState.heroes.push(newHero);
            createUnitButton(newHero);
            createDamageText(playerBase.x, playerBase.y - 100, `💎 대박! ${newHero.name} 획득!`, "#FFD700");
        }
    } 
    // 2. 재화 당첨 (영웅 확률 이후, 설정된 확률 미만이면)
    else if (rand < (probs.hero + probs.resource)) {
        const goldRand = Math.random();
        let reward = 0;
        let msg = "";
        
        if (goldRand < 0.6) { 
            reward = 100; 
            msg = "아쉽네요.."; 
        } else { 
            reward = 300; 
            msg = "💰 용돈 획득!"; 
        }
        
        gameState.gold += reward;
        createDamageText(playerBase.x, playerBase.y - 100, `${msg} +${reward}G`, "#f1c40f");
    }
    // 3. 일반 유닛 강화 (나머지 확률)
    else {
        const targetUnit = unitTypes[Math.floor(Math.random() * unitTypes.length)];
        if (targetUnit.level < targetUnit.maxLevel) {
            targetUnit.level++;
            refreshCardUI(targetUnit);
            units.forEach(u => {
                if (u.id === targetUnit.id && u.team === 'player') u.refreshStats();
            });
            createDamageText(playerBase.x, playerBase.y - 100, `🆙 ${targetUnit.name} 무료 강화!`, "#2ecc71");
        } else {
            gameState.gold += 200;
            createDamageText(playerBase.x, playerBase.y - 100, `모두 만렙이라 환불`, "#aaa");
        }
    }
    
    updateUI();
}

// --- 스테이지 관리 ---
function updateStageProgress(currentStage) {
    const fillPercent = Math.min(100, ((currentStage - 1) / 6) * 100);
    document.getElementById('progress-fill').style.width = `${fillPercent}%`;
    for (let i = 1; i <= 7; i++) {
        const dot = document.getElementById(`dot-${i}`);
        if(dot) {
            dot.classList.remove('active', 'passed');
            if (i < currentStage) dot.classList.add('passed');
            else if (i === currentStage) dot.classList.add('active');
        }
    }
}

function spawnEnemyAI() {
    if (gameState.enemySpawnCooldown > 0) {
        gameState.enemySpawnCooldown--;
        return;
    }

    const sec = gameState.seconds;
    
    // Config에서 현재 시간에 맞는 스테이지 찾기
    let totalTime = 0;
    let currentStageObj = GAME_CONFIG.stages[0];
    
    for(let i=0; i < GAME_CONFIG.stages.length; i++) {
        totalTime += GAME_CONFIG.stages[i].duration;
        if (sec < totalTime) {
            currentStageObj = GAME_CONFIG.stages[i];
            break;
        }
        if (i === GAME_CONFIG.stages.length - 1) currentStageObj = GAME_CONFIG.stages[i];
    }
    
    const currentStageNum = currentStageObj.level;
    gameState.stage = currentStageNum;
    updateStageProgress(currentStageNum);

    // 뽑기 버튼 활성화 체크
    if (currentStageNum >= GAME_CONFIG.gacha.unlockStage) {
        document.getElementById('unlock-btn-container').style.display = 'block';
        const btn = document.querySelector('#unlock-btn-container button');
        btn.onclick = playGacha;
        btn.innerHTML = `<span>🎲 랜덤 보급품</span><span style="font-size:12px"> ${GAME_CONFIG.gacha.cost} G</span>`;
        btn.style.background = "linear-gradient(to bottom, #9b59b6, #8e44ad)";
    }

    // 보스 스폰 (4스테이지, Config에 의존)
    if (currentStageNum === 4 && !gameState.midBossSpawned) {
        gameState.midBossSpawned = true;
        spawnMidBoss();
        gameState.enemySpawnCooldown = 300;
        document.getElementById('enemy-status').innerText = `⚠️ 경고: 중간 보스 출현!`;
        return;
    }

    // 상태 텍스트
    let statusText = currentStageObj.title;
    if(gameState.midBossSpawned && units.some(u=>u.id==='midboss')) statusText = "⚠️ 중간 보스 교전 중! ⚠️";
    document.getElementById('enemy-status').innerText = statusText;

    // 유닛 스폰
    const availableIndices = currentStageObj.unitIdxs;
    const randomIdx = availableIndices[Math.floor(Math.random() * availableIndices.length)];
    const unitToSpawn = unitTypes[randomIdx];

    // 대포는 적군일 때 일반 검병으로 대체 (너무 강함 방지)
    if (unitToSpawn.id !== 'cannon') {
        units.push(new Unit(unitToSpawn, 'enemy'));
    } else {
        units.push(new Unit(unitTypes[0], 'enemy'));
    }

    gameState.enemySpawnCooldown = currentStageObj.spawnInterval + Math.random() * 30;
}

function spawnMidBoss() {
    createDamageText(canvas.width/2, 200, "⚠️ WARNING ⚠️", "red");
    createDamageText(canvas.width/2, 230, `${midBossData.name} 등장`, "#8e44ad");
    units.push(new Unit(midBossData, 'enemy'));
}

// --- 메인 게임 루프 ---
function update() {
    if (gameState.gameOver) return;
    
    gameState.frame++;
    if (gameState.frame % 60 === 0) {
        gameState.seconds++;
        const mins = Math.floor(gameState.seconds / 60);
        const secs = gameState.seconds % 60;
        const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        document.getElementById('game-timer').innerText = `시간: ${timeStr}`;
    }

    // 수입 계산 (Config 사용)
    const merchantCount = units.filter(u => u.team === 'player' && u.id === 'merchant' && u.hp > 0).length;
    gameState.currentIncome = gameState.baseIncome + (merchantCount * GAME_CONFIG.economy.merchantBonus);
    gameState.gold += gameState.currentIncome / GAME_CONFIG.economy.incomeTick;

    for (let key in playerCooldowns) {
        if (playerCooldowns[key] > 0) playerCooldowns[key]--;
    }

    units.forEach(u => u.update());

    // 유닛 사망 처리
    units = units.filter(u => {
        if (u.hp <= 0) {
            if (u.team === 'enemy') {
                gameState.gold += u.bounty;
                createDamageText(u.x, u.y - 20, `+${u.bounty}G`, "#f1c40f");
            }
            return false; 
        }
        return true; 
    });
    
    spawnEnemyAI();

    if (playerBase.hp <= 0) endGame("패배... 기지가 파괴되었습니다.");
    if (enemyBase.hp <= 0) endGame("승리! 적 기지를 파괴했습니다!");

    draw();
    updateUI();

    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 바닥
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 260, canvas.width, 80);
    ctx.strokeStyle = '#34495e';
    ctx.beginPath();
    ctx.moveTo(0, 260); ctx.lineTo(canvas.width, 260);
    ctx.moveTo(0, 340); ctx.lineTo(canvas.width, 340);
    ctx.stroke();

    drawBase(playerBase, '아군');
    drawBase(enemyBase, '적군');

    units.forEach(u => u.draw());
    updateAndDrawEffects();
}

// 기존 drawBase 함수를 이 코드로 완전히 교체하세요.
function drawBase(base, label) {
    const x = base.x;
    const y = base.y;

    if (label === '아군') {
        // --- 플레이어: 푸른 성채 ---
        
        // 메인 성벽 (회색)
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(x - 35, y - 100, 70, 100);
        
        // 성벽 질감 (벽돌)
        ctx.strokeStyle = '#95a5a6';
        ctx.beginPath();
        ctx.moveTo(x - 35, y - 70); ctx.lineTo(x + 35, y - 70);
        ctx.moveTo(x - 35, y - 40); ctx.lineTo(x + 35, y - 40);
        ctx.moveTo(x, y - 100); ctx.lineTo(x, y); // 중앙선
        ctx.stroke();

        // 성곽 (상단 요철)
        ctx.fillStyle = '#7f8c8d';
        ctx.fillRect(x - 40, y - 120, 20, 20); // 좌측 탑
        ctx.fillRect(x + 20, y - 120, 20, 20); // 우측 탑
        ctx.fillRect(x - 10, y - 110, 20, 10); // 중앙 연결부

        // 성문 (아치형)
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.moveTo(x - 15, y);
        ctx.lineTo(x - 15, y - 30);
        ctx.arc(x, y - 30, 15, Math.PI, 0); // 둥근 윗부분
        ctx.lineTo(x + 15, y);
        ctx.fill();

        // 깃발 (파란색)
        ctx.strokeStyle = '#bdc3c7';
        ctx.beginPath(); ctx.moveTo(x, y - 110); ctx.lineTo(x, y - 150); ctx.stroke(); // 깃대
        ctx.fillStyle = '#3498db';
        ctx.beginPath(); ctx.moveTo(x, y - 150); ctx.lineTo(x + 25, y - 140); ctx.lineTo(x, y - 130); ctx.fill(); // 깃발

    } else {
        // --- 적군: 붉은 요새 ---

        // 메인 몸체 (검은색)
        ctx.fillStyle = '#2c3e50';
        ctx.beginPath();
        ctx.moveTo(x - 40, y);
        ctx.lineTo(x - 30, y - 80); // 사다리꼴 형태
        ctx.lineTo(x + 30, y - 80);
        ctx.lineTo(x + 40, y);
        ctx.fill();

        // 가시 장식 (붉은색)
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.moveTo(x - 30, y - 80); ctx.lineTo(x - 35, y - 110); ctx.lineTo(x - 20, y - 80); // 좌측 가시
        ctx.moveTo(x + 30, y - 80); ctx.lineTo(x + 35, y - 110); ctx.lineTo(x + 20, y - 80); // 우측 가시
        ctx.moveTo(x - 10, y - 80); ctx.lineTo(x, y - 100); ctx.lineTo(x + 10, y - 80);     // 중앙 가시
        ctx.fill();

        // 사악한 눈 (노란색)
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(x, y - 40, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'red'; // 동공
        ctx.beginPath(); ctx.moveTo(x, y-45); ctx.lineTo(x, y-35); ctx.stroke();
    }

    // --- 공통: 체력바 표시 ---
    const hpPercent = Math.max(0, base.hp / base.maxHp);
    
    // 체력바 배경
    ctx.fillStyle = '#222';
    ctx.fillRect(x - 40, y - 160, 80, 10);
    
    // 체력바 게이지
    ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(x - 40, y - 160, 80 * hpPercent, 10);
    
    // 체력바 테두리
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 40, y - 160, 80, 10);

    // 라벨 (아군/적군)
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.shadowColor = "black"; ctx.shadowBlur = 4; // 글자 잘 보이게 그림자
    ctx.fillText(label, x, y - 170);
    ctx.shadowBlur = 0; // 그림자 초기화
}

function updateUI() {
    document.getElementById('gold-display').innerText = Math.floor(gameState.gold);
    document.getElementById('income-display').innerText = gameState.currentIncome; 
    const enemyHpPercent = Math.floor((enemyBase.hp / enemyBase.maxHp) * 100);
    document.getElementById('enemy-hp').innerText = Math.max(0, enemyHpPercent);

    [...unitTypes, ...gameState.heroes].forEach(u => {
        const btn = document.getElementById(`card-${u.id}`);
        if (!btn) return;
        
        const coolOverlay = document.getElementById(`cool-${u.id}`);
        const currentCool = playerCooldowns[u.id] || 0;
        const coolPercent = (currentCool / u.cd) * 100;
        coolOverlay.style.height = `${coolPercent}%`;

        if (gameState.gold < u.cost || currentCool > 0) {
            btn.querySelector('.spawn-zone').style.opacity = '0.5';
        } else {
            btn.querySelector('.spawn-zone').style.opacity = '1.0';
        }

        if (u.maxLevel) {
            const upBtn = document.getElementById(`upbtn-${u.id}`);
            const upCost = getUpgradeCost(u);
            if (u.level >= u.maxLevel) {
                upBtn.classList.add('max-lvl');
            } else if (gameState.gold < upCost) {
                upBtn.classList.add('cant-afford');
                upBtn.style.opacity = '0.5';
            } else {
                upBtn.classList.remove('cant-afford');
                upBtn.style.opacity = '1.0';
            }
        }
    });
    
    const unlockBtn = document.querySelector('#unlock-btn-container button');
    if (unlockBtn) {
        if (gameState.gold < GAME_CONFIG.gacha.cost) {
            unlockBtn.style.opacity = '0.6';
        } else {
            unlockBtn.style.opacity = '1.0';
        }
    }
}

function endGame(msg) {
    gameState.gameOver = true;
    document.getElementById('game-over').style.display = 'block';
    document.getElementById('result-message').innerText = msg;
}

function drawUnitIcon(ctx, id, team, color) {
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#333';
    ctx.fillStyle = color;

    switch (id) {
        case 'sword': 
            ctx.fillStyle = '#ecf0f1';
            ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(12, 0); ctx.lineTo(-6, -4); ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#e67e22';
            ctx.beginPath(); ctx.moveTo(-6, 6); ctx.lineTo(-6, -6); ctx.moveTo(-6, 0); ctx.lineTo(-12, 0); ctx.stroke();
            break;
        case 'archer': 
            ctx.strokeStyle = '#8e44ad'; ctx.beginPath(); ctx.arc(-5, 0, 12, -Math.PI/2, Math.PI/2); ctx.stroke();
            ctx.strokeStyle = '#ecf0f1'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(-5, 12); ctx.stroke();
            ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
            break;
        case 'tank': 
            ctx.fillStyle = color; ctx.strokeStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(8, -10); ctx.lineTo(8, 2); ctx.quadraticCurveTo(0, 12, -8, 2); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.moveTo(-4, 0); ctx.lineTo(4, 0); ctx.stroke();
            break;
        case 'wizard': 
            ctx.strokeStyle = '#8e44ad'; ctx.beginPath(); ctx.moveTo(4, 10); ctx.lineTo(-4, -10); ctx.stroke();
            ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(-4, -12, 4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            break;
        case 'cannon': 
            ctx.fillStyle = '#8e44ad'; ctx.beginPath(); ctx.arc(0, 5, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#34495e'; ctx.translate(0, -2); ctx.rotate(-0.2); ctx.beginPath(); ctx.rect(-5, -4, 16, 8); ctx.fill(); ctx.stroke();
            break;
        case 'healer': 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.rect(-2, -6, 4, 12); ctx.rect(-6, -2, 12, 4); ctx.fill();
            break;
        case 'merchant': 
            ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(0, 4, 8, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.lineTo(0, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#d35400'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center'; ctx.fillText('$', 0, 7);
            break;
        case 'general': 
            ctx.strokeStyle = '#7f8c8d'; ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(-5, -12); ctx.stroke();
            ctx.fillStyle = '#e67e22'; ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(10, -5); ctx.lineTo(-5, 2); ctx.fill(); ctx.stroke();
            break;
        case 'midboss': 
            ctx.fillStyle = '#8e44ad'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-18, -15); ctx.lineTo(-6, -10); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(18, -15); ctx.lineTo(6, -10); ctx.fill();
            ctx.fillStyle = 'red'; ctx.beginPath(); ctx.arc(-5, 2, 2, 0, Math.PI*2); ctx.arc(5, 2, 2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(-3, 12); ctx.lineTo(-1, 8); ctx.moveTo(3, 8); ctx.lineTo(3, 12); ctx.lineTo(1, 8); ctx.fill();
            break;
        default:
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            break;
    }
}

initDeck();
updateStageProgress(1);
requestAnimationFrame(update);
