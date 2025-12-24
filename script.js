const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- 게임 상태 변수 ---
let gameState = {
    gold: 350,      
    baseIncome: 10,
    currentIncome: 10,
    frame: 0,
    seconds: 0,
    stage: 1,
    midBossSpawned: false,
    gameOver: false,
    enemySpawnCooldown: 0,
    heroUnlocked: false,
    heroType: null
};

// --- 기지 데이터 ---
const playerBase = { x: 60, y: 200, hp: 5000, maxHp: 5000, color: '#3498db' };
const enemyBase = { x: 780, y: 200, hp: 5000, maxHp: 5000, color: '#e74c3c' };

// --- 유닛 데이터 정의 ---
const unitTypes = [
    { id: 'sword', name: '검병', desc: '근접 기본', type: 'icon', cost: 50, baseHp: 120, baseDmg: 10, range: 35, speed: 1.5, color: '#ecf0f1', icon: '⚔️', cooldown: 30, level: 1, maxLevel: 10, upgradeCostBase: 100 },
    { id: 'archer', name: '궁수', desc: '원거리 지원', type: 'icon', cost: 130, baseHp: 70, baseDmg: 15, range: 160, speed: 1.2, color: '#2ecc71', icon: '🏹', cooldown: 45, level: 1, maxLevel: 10, upgradeCostBase: 200 },
    { id: 'tank', name: '방패병', desc: '높은 체력', type: 'icon', cost: 220, baseHp: 450, baseDmg: 8, range: 35, speed: 0.8, color: '#f1c40f', icon: '🛡️', cooldown: 60, level: 1, maxLevel: 10, upgradeCostBase: 300 },
    { id: 'wizard', name: '마법사', desc: '광역 폭딜', type: 'icon', cost: 400, baseHp: 90, baseDmg: 45, range: 140, speed: 1.0, color: '#9b59b6', icon: '🔮', cooldown: 90, level: 1, maxLevel: 10, upgradeCostBase: 500 },
    { id: 'cannon', name: '대포', desc: '고정형 포탑', type: 'icon', cost: 600, baseHp: 250, baseDmg: 120, range: 420, speed: 0, color: '#34495e', icon: '💣', cooldown: 150, level: 1, maxLevel: 10, upgradeCostBase: 600 }
];

const specialUnits = [
    { id: 'merchant', name: '거상', desc: '수입 증가', type: 'icon', cost: 300, cooldown: 60, baseHp: 300, baseDmg: 0, range: 180, speed: 0.8, color: '#FFD700', effectRange: 50, icon: '💰', level: 1 },
    { id: 'healer', name: '사제', desc: '아군 치유', type: 'icon', cost: 350, cooldown: 45, baseHp: 150, baseDmg: -20, range: 160, speed: 1.0, color: '#fab1a0', effectRange: 200, icon: '🌿', level: 1 },
    { id: 'general', name: '장군', desc: '공격력 버프', type: 'icon', cost: 500, cooldown: 90, baseHp: 600, baseDmg: 20, range: 150, speed: 0.9, color: '#e67e22', effectRange: 200, icon: '🚩', level: 1 }
];

const midBossData = { 
    id: 'midboss', name: '오크 대장', type: 'icon', cost: 1000, // 보스는 현상금 높게 설정
    baseHp: 3000, baseDmg: 60, range: 50, speed: 0.6, 
    color: '#8e44ad', icon: '👹', level: 1
};

// --- 유틸리티 함수 ---
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

let units = [];
let playerCooldowns = {}; 
let particles = [];
let damageTexts = [];

// --- 유닛 클래스 ---
class Unit {
    constructor(typeData, team) {
        this.id = typeData.id;
        this.type = typeData.type;
        this.name = typeData.name;
        this.team = team;
        
        // 현상금 설정 (유닛 비용의 20% 정도)
        // 보스는 더 많이 줌
        this.bounty = Math.floor((typeData.cost || 100) * 0.2);
        if (this.id === 'midboss') this.bounty = 500;

        let stats = getUnitStats(typeData);
        
        // 적군은 스테이지에 따라 강해짐
        if (team === 'enemy' && this.id !== 'midboss') {
            const stageMulti = 1 + (gameState.stage - 1) * 0.15;
            stats.hp *= stageMulti;
            stats.dmg *= stageMulti;
            
            // 스테이지가 오르면 현상금도 약간 증가
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

        // 배치 위치 랜덤성 (겹침 방지)
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
        if (!typeData && gameState.heroType && gameState.heroType.id === this.id) typeData = gameState.heroType;
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

        // 거상 모션
        if (this.id === 'merchant' && gameState.frame % 60 === 0) {
            this.attackAnim = 10; 
        }

        let target = null;
        let minDist = Infinity;
        
        // 힐러 로직
        if (this.dmg < 0) {
            const allies = units.filter(u => u.team === this.team && u !== this && u.hp < u.maxHp);
            for (let a of allies) {
                let dist = Math.abs(a.x - this.x);
                if (dist < minDist) { minDist = dist; target = a; }
            }
        } 
        // 공격 로직
        else {
            const enemies = units.filter(u => u.team !== this.team && u.hp > 0);
            for (let e of enemies) {
                let dist = Math.abs(e.x - this.x);
                if (dist < minDist) { minDist = dist; target = e; }
            }
            
            // 기지 공격
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
            // 이동
            this.x += this.speed * this.direction;
            if (this.x < 15) this.x = 15;
            if (this.x > canvas.width - 15) this.x = canvas.width - 15;
        }
    }

    attack(target) {
        this.attackAnim = 15; 

        let actualDmg = this.dmg;
        // 장군 버프
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

        // 그림자
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
        life: 40, maxLife: 40, vy: -1.5
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
    if (gameState.heroUnlocked && gameState.heroType) {
        createUnitButton(gameState.heroType);
    }
}

function createUnitButton(unit) {
    const deckContainer = document.getElementById('deck-container');
    if(!playerCooldowns[unit.id]) playerCooldowns[unit.id] = 0;
    
    const stats = getUnitStats(unit);
    let atkDisplay = stats.dmg;
    let atkIcon = "⚔️";
    if (unit.id === 'healer') { atkDisplay = Math.abs(stats.dmg); atkIcon = "💚"; } 
    else if (unit.id === 'merchant') { atkDisplay = "-"; atkIcon = "❌"; }

    const card = document.createElement('div');
    card.className = `card ${unit.id === 'merchant' || unit.id === 'general' || unit.id === 'healer' ? 'hero-card' : ''}`;
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
    const stats = getUnitStats(unit);
    document.getElementById(`hp-${unit.id}`).innerText = stats.hp;
    let atkDisplay = stats.dmg;
    if (unit.id === 'healer') atkDisplay = Math.abs(stats.dmg);
    else if (unit.id === 'merchant') atkDisplay = "-";
    document.getElementById(`dmg-${unit.id}`).innerText = atkDisplay;

    if (unit.maxLevel) {
        document.getElementById(`badge-${unit.id}`).innerText = `Lv.${unit.level}`;
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
    if (!unitData && gameState.heroType && gameState.heroType.id === unitId) unitData = gameState.heroType;
    if (!unitData) return;
    if (playerCooldowns[unitData.id] > 0) return;

    if (gameState.gold >= unitData.cost) {
        gameState.gold -= unitData.cost;
        units.push(new Unit(unitData, 'player'));
        playerCooldowns[unitData.id] = unitData.cooldown;
        updateUI();
    }
}

function buyUpgrade(unitId) {
    if (gameState.gameOver) return;
    let unitData = unitTypes.find(u => u.id === unitId);
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

function unlockHero() {
    if (gameState.heroUnlocked) return;
    const cost = 500;
    if (gameState.gold >= cost) {
        gameState.gold -= cost;
        gameState.heroUnlocked = true;
        document.getElementById('unlock-btn-container').style.display = 'none';
        const pickedUnit = specialUnits[Math.floor(Math.random() * specialUnits.length)];
        gameState.heroType = pickedUnit;
        createUnitButton(pickedUnit);
        createDamageText(playerBase.x, playerBase.y - 100, `${pickedUnit.name} 계약!`, "#FFD700");
    } else {
        alert("골드가 부족합니다! (필요: 500)");
    }
}

// --- 스테이지 관리 ---
function updateStageProgress(currentStage) {
    const fillPercent = Math.min(100, ((currentStage - 1) / 6) * 100);
    document.getElementById('progress-fill').style.width = `${fillPercent}%`;
    for (let i = 1; i <= 7; i++) {
        const dot = document.getElementById(`dot-${i}`);
        dot.classList.remove('active', 'passed');
        if (i < currentStage) dot.classList.add('passed');
        else if (i === currentStage) dot.classList.add('active');
    }
}

function spawnEnemyAI() {
    if (gameState.enemySpawnCooldown > 0) {
        gameState.enemySpawnCooldown--;
        return;
    }

    const sec = gameState.seconds;
    let currentStage = Math.min(7, Math.floor(sec / 35) + 1);
    gameState.stage = currentStage;
    updateStageProgress(currentStage);

    if (currentStage >= 2 && !gameState.heroUnlocked) {
        document.getElementById('unlock-btn-container').style.display = 'block';
    }

    if (currentStage === 4 && !gameState.midBossSpawned) {
        gameState.midBossSpawned = true;
        spawnMidBoss();
        gameState.enemySpawnCooldown = 300;
        document.getElementById('enemy-status').innerText = `⚠️ 경고: 중간 보스 출현!`;
        return;
    }

    let availableUnits = [];
    let spawnTime = 120;
    let statusText = "";

    switch(currentStage) {
        case 1: availableUnits = [unitTypes[0]]; spawnTime = 200; statusText = "1단계: 정찰대"; break;
        case 2: availableUnits = [unitTypes[0], unitTypes[1]]; spawnTime = 160; statusText = "2단계: 공격 부대"; break;
        case 3: availableUnits = [unitTypes[0], unitTypes[1], unitTypes[2]]; spawnTime = 130; statusText = "3단계: 정규군 진격"; break;
        case 4: availableUnits = [unitTypes[0], unitTypes[1], unitTypes[2]]; spawnTime = 110; statusText = "4단계: 보스 지원 사격"; break;
        case 5: availableUnits = unitTypes; spawnTime = 90; statusText = "5단계: 마법 부대 합류"; break;
        case 6: availableUnits = unitTypes; spawnTime = 70; statusText = "6단계: 총공격 개시"; break;
        case 7: availableUnits = unitTypes; spawnTime = 50; statusText = "7단계: 최후의 결전"; break;
    }

    if(gameState.midBossSpawned && units.some(u=>u.id==='midboss')) statusText = "⚠️ 중간 보스 교전 중! ⚠️";

    document.getElementById('enemy-status').innerText = statusText;

    const randomUnit = availableUnits[Math.floor(Math.random() * availableUnits.length)];
    if (randomUnit.id !== 'cannon') {
        units.push(new Unit(randomUnit, 'enemy'));
    } else {
        units.push(new Unit(unitTypes[0], 'enemy'));
    }

    gameState.enemySpawnCooldown = spawnTime + Math.random() * 30;
}

function spawnMidBoss() {
    createDamageText(canvas.width/2, 200, "⚠️ WARNING ⚠️", "red");
    createDamageText(canvas.width/2, 230, "오크 대장 등장", "#8e44ad");
    units.push(new Unit(midBossData, 'enemy'));
}

// --- 메인 게임 루프 ---
function update() {
    if (gameState.gameOver) return;
    
    gameState.frame++;
    if (gameState.frame % 60 === 0) {
        gameState.seconds++;
        document.getElementById('game-timer').innerText = `시간: 00:${gameState.seconds.toString().padStart(2, '0')}`;
    }

    const merchantCount = units.filter(u => u.team === 'player' && u.id === 'merchant' && u.hp > 0).length;
    gameState.currentIncome = gameState.baseIncome + (merchantCount * 10);
    gameState.gold += gameState.currentIncome / 60;

    for (let key in playerCooldowns) {
        if (playerCooldowns[key] > 0) playerCooldowns[key]--;
    }

    units.forEach(u => u.update());

    // [수정됨] 유닛 사망 처리 및 골드 보상 로직
    units = units.filter(u => {
        if (u.hp <= 0) {
            // 적군 사망 시 보상 지급
            if (u.team === 'enemy') {
                gameState.gold += u.bounty;
                createDamageText(u.x, u.y - 20, `+${u.bounty}G`, "#f1c40f"); // 노란색 돈 텍스트
            }
            return false; // 배열에서 제거
        }
        return true; // 생존
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

    // 바닥(땅) 그리기
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

function drawBase(base, label) {
    ctx.fillStyle = base.color;
    ctx.fillRect(base.x - 40, base.y - 60, 80, 120);
    
    const hpPercent = Math.max(0, base.hp / base.maxHp);
    ctx.fillStyle = '#333';
    ctx.fillRect(base.x - 40, base.y - 90, 80, 10);
    ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(base.x - 40, base.y - 90, 80 * hpPercent, 10);
    
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(label, base.x, base.y - 100);
}

function updateUI() {
    document.getElementById('gold-display').innerText = Math.floor(gameState.gold);
    document.getElementById('income-display').innerText = gameState.currentIncome; 
    const enemyHpPercent = Math.floor((enemyBase.hp / enemyBase.maxHp) * 100);
    document.getElementById('enemy-hp').innerText = Math.max(0, enemyHpPercent);

    [...unitTypes, ...(gameState.heroType ? [gameState.heroType] : [])].forEach(u => {
        const btn = document.getElementById(`card-${u.id}`);
        if (!btn) return;
        
        const coolOverlay = document.getElementById(`cool-${u.id}`);
        const currentCool = playerCooldowns[u.id] || 0;
        const coolPercent = (currentCool / u.cooldown) * 100;
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
    
    const unlockBtn = document.getElementById('unlock-btn');
    if (gameState.gold < 500) {
        unlockBtn.style.opacity = '0.6';
    } else {
        unlockBtn.style.opacity = '1.0';
    }
}

function endGame(msg) {
    gameState.gameOver = true;
    document.getElementById('game-over').style.display = 'block';
    document.getElementById('result-message').innerText = msg;
}

// --- 유닛 아이콘 그리기 함수 (Canvas Drawing) ---
function drawUnitIcon(ctx, id, team, color) {
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#333';
    ctx.fillStyle = color;

    switch (id) {
        case 'sword': // ⚔️
            ctx.fillStyle = '#ecf0f1';
            ctx.beginPath();
            ctx.moveTo(-6, 4); ctx.lineTo(12, 0); ctx.lineTo(-6, -4);
            ctx.fill(); ctx.stroke();
            ctx.strokeStyle = '#e67e22';
            ctx.beginPath();
            ctx.moveTo(-6, 6); ctx.lineTo(-6, -6);
            ctx.moveTo(-6, 0); ctx.lineTo(-12, 0);
            ctx.stroke();
            break;

        case 'archer': // 🏹
            ctx.strokeStyle = '#8e44ad';
            ctx.beginPath();
            ctx.arc(-5, 0, 12, -Math.PI/2, Math.PI/2); 
            ctx.stroke();
            ctx.strokeStyle = '#ecf0f1';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-5, -12); ctx.lineTo(-5, 12);
            ctx.stroke();
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
            ctx.stroke();
            break;

        case 'tank': // 🛡️
            ctx.fillStyle = color;
            ctx.strokeStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(-8, -10); ctx.lineTo(8, -10);
            ctx.lineTo(8, 2);
            ctx.quadraticCurveTo(0, 12, -8, 2);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -6); ctx.lineTo(0, 6);
            ctx.moveTo(-4, 0); ctx.lineTo(4, 0);
            ctx.stroke();
            break;

        case 'wizard': // 🔮
            ctx.strokeStyle = '#8e44ad';
            ctx.beginPath();
            ctx.moveTo(4, 10); ctx.lineTo(-4, -10);
            ctx.stroke();
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.arc(-4, -12, 4, 0, Math.PI*2);
            ctx.fill(); ctx.stroke();
            break;

        case 'cannon': // 💣
            ctx.fillStyle = '#8e44ad'; 
            ctx.beginPath(); ctx.arc(0, 5, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#34495e';
            ctx.translate(0, -2);
            ctx.rotate(-0.2); 
            ctx.beginPath(); ctx.rect(-5, -4, 16, 8); ctx.fill(); ctx.stroke();
            break;

        case 'healer': // 🌿
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.rect(-2, -6, 4, 12);
            ctx.rect(-6, -2, 12, 4);
            ctx.fill();
            break;

        case 'merchant': // 💰
            ctx.fillStyle = '#f1c40f'; 
            ctx.beginPath();
            ctx.arc(0, 4, 8, 0, Math.PI*2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath(); 
            ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.lineTo(0, -9); ctx.closePath();
            ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#d35400';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('$', 0, 7);
            break;

        case 'general': // 🚩
            ctx.strokeStyle = '#7f8c8d';
            ctx.beginPath(); ctx.moveTo(-5, 12); ctx.lineTo(-5, -12); ctx.stroke();
            ctx.fillStyle = '#e67e22';
            ctx.beginPath();
            ctx.moveTo(-5, -12); ctx.lineTo(10, -5); ctx.lineTo(-5, 2);
            ctx.fill(); ctx.stroke();
            break;

        case 'midboss': // 👹
            ctx.fillStyle = '#8e44ad'; 
            ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(-18, -15); ctx.lineTo(-6, -10); ctx.fill();
            ctx.beginPath(); ctx.moveTo(10, -5); ctx.lineTo(18, -15); ctx.lineTo(6, -10); ctx.fill();
            ctx.fillStyle = 'red';
            ctx.beginPath(); ctx.arc(-5, 2, 2, 0, Math.PI*2); ctx.arc(5, 2, 2, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); 
            ctx.moveTo(-3, 8); ctx.lineTo(-3, 12); ctx.lineTo(-1, 8);
            ctx.moveTo(3, 8); ctx.lineTo(3, 12); ctx.lineTo(1, 8);
            ctx.fill();
            break;
            
        default:
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI*2);
            ctx.fill(); ctx.stroke();
            break;
    }
}

// 게임 시작
initDeck();
updateStageProgress(1);
requestAnimationFrame(update);
