const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

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

const playerBase = { x: 60, y: 200, hp: 5000, maxHp: 5000, color: '#3498db' };
const enemyBase = { x: 780, y: 200, hp: 5000, maxHp: 5000, color: '#e74c3c' };

const unitTypes = [
    { id: 'sword', name: '검병', desc: '근접 기본', type: 'circle', cost: 50, baseHp: 120, baseDmg: 10, range: 35, speed: 1.5, color: '#ecf0f1', icon: '⚔️', cooldown: 30, level: 1, maxLevel: 10, upgradeCostBase: 100 },
    { id: 'archer', name: '궁수', desc: '원거리 지원', type: 'triangle', cost: 130, baseHp: 70, baseDmg: 15, range: 160, speed: 1.2, color: '#2ecc71', icon: '🏹', cooldown: 45, level: 1, maxLevel: 10, upgradeCostBase: 200 },
    { id: 'tank', name: '방패병', desc: '높은 체력', type: 'square', cost: 220, baseHp: 450, baseDmg: 8, range: 35, speed: 0.8, color: '#f1c40f', icon: '🛡️', cooldown: 60, level: 1, maxLevel: 10, upgradeCostBase: 300 },
    { id: 'wizard', name: '마법사', desc: '광역 폭딜', type: 'diamond', cost: 400, baseHp: 90, baseDmg: 45, range: 140, speed: 1.0, color: '#9b59b6', icon: '🔮', cooldown: 90, level: 1, maxLevel: 10, upgradeCostBase: 500 },
    { id: 'cannon', name: '대포', desc: '고정형 포탑', type: 'cannon', cost: 600, baseHp: 250, baseDmg: 120, range: 420, speed: 0, color: '#34495e', icon: '💣', cooldown: 150, level: 1, maxLevel: 10, upgradeCostBase: 600 }
];

const specialUnits = [
    { id: 'merchant', name: '거상', desc: '수입 증가', type: 'star', cost: 300, cooldown: 60, baseHp: 300, baseDmg: 0, range: 180, speed: 0.8, color: '#FFD700', effectRange: 50, icon: '💰', level: 1 },
    { id: 'healer', name: '사제', desc: '아군 치유', type: 'cross', cost: 350, cooldown: 45, baseHp: 150, baseDmg: -20, range: 160, speed: 1.0, color: '#fab1a0', effectRange: 200, icon: '🌿', level: 1 },
    { id: 'general', name: '장군', desc: '공격력 버프', type: 'pentagon', cost: 500, cooldown: 90, baseHp: 600, baseDmg: 20, range: 150, speed: 0.9, color: '#e67e22', effectRange: 200, icon: '🚩', level: 1 }
];

const midBossData = { 
    id: 'midboss', name: '오크 대장', type: 'hexagon', 
    baseHp: 3000, baseDmg: 60, range: 50, speed: 0.6, 
    color: '#8e44ad', icon: '👹', level: 1
};

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
        
        let stats = getUnitStats(typeData);
        
        if (team === 'enemy' && this.id !== 'midboss') {
            const stageMulti = 1 + (gameState.stage - 1) * 0.15;
            stats.hp *= stageMulti;
            stats.dmg *= stageMulti;
        }

        this.hp = stats.hp;
        this.maxHp = stats.hp;
        this.dmg = stats.dmg;
        this.range = typeData.range;
        this.speed = typeData.speed;
        this.color = typeData.color;
        this.effectRange = typeData.effectRange || 0; 
        this.radius = (this.id === 'midboss') ? 30 : 16; 
        
        this.maxAttackCooldown = (this.id === 'cannon') ? 100 : 50;
        this.attackCooldown = 0;
        this.attackAnim = 0; // 공격 모션 타이머

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
        if (this.attackAnim > 0) this.attackAnim--; // 모션 타이머 감소

        // 거상 모션 (돈 벌때)
        if (this.id === 'merchant' && gameState.frame % 60 === 0) {
            this.attackAnim = 10; 
        }

        let target = null;
        let minDist = Infinity;
        
        if (this.dmg < 0) {
            const allies = units.filter(u => u.team === this.team && u !== this && u.hp < u.maxHp);
            for (let a of allies) {
                let dist = Math.abs(a.x - this.x);
                if (dist < minDist) { minDist = dist; target = a; }
            }
        } else {
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
        this.attackAnim = 15; // 공격 모션 시작 (15프레임)

        let actualDmg = this.dmg;
        if (actualDmg > 0 && this.team === 'player') {
            const hasGeneral = units.some(u => u.team === 'player' && u.id === 'general' && Math.abs(u.x - this.x) < u.effectRange);
            if (hasGeneral) actualDmg *= 1.5; 
        }

        if (this.id === 'cannon') {
            createParticle(this.x + 20 * this.direction, this.y - 10, '#555', 8); 
            createDamageText(this.x, this.y - 40, "BOOM!", "#f39c12");
        }

        if (actualDmg < 0) {
            target.hp = Math.min(target.maxHp, target.hp - actualDmg);
            createDamageText(target.x, target.y - 30, "+" + Math.abs(Math.floor(actualDmg)), "green");
            for(let i=0; i<5; i++) createParticle(target.x, target.y, '#2ecc71');
        } else {
            target.hp -= actualDmg;
            createDamageText(target.x, target.y - 30, Math.floor(actualDmg), "white");
            for(let i=0; i<3; i++) createParticle(target.x, target.y, 'red');
        }
    }

    draw() {
        // 공격 모션 계산
        let drawX = this.x;
        let drawY = this.y;

        if (this.attackAnim > 0) {
            const p = this.attackAnim / 15; // 진행률 1.0 -> 0.0
            const lungeAmount = Math.sin(p * Math.PI) * 10;
            
            if (this.id === 'sword' || this.id === 'tank' || this.id === 'midboss' || this.id === 'general') {
                // 근접: 앞으로 찌르기
                drawX += lungeAmount * this.direction;
            } else if (this.id === 'merchant') {
                // 거상: 위로 점프
                drawY -= lungeAmount;
            } else {
                // 원거리: 뒤로 반동
                drawX -= lungeAmount * 0.5 * this.direction;
            }
        }

        // 오라 그리기 (위치 보정 X)
        if (this.team === 'player') {
            if (this.id === 'general') {
                ctx.beginPath(); ctx.fillStyle = 'rgba(230, 126, 34, 0.1)';
                ctx.arc(this.x, this.y, this.effectRange, 0, Math.PI * 2);
                ctx.fill(); ctx.strokeStyle = 'rgba(230, 126, 34, 0.4)'; ctx.stroke();
            } else if (this.id === 'healer') {
                ctx.beginPath(); ctx.fillStyle = 'rgba(46, 204, 113, 0.1)';
                ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2); 
                ctx.fill(); ctx.strokeStyle = 'rgba(46, 204, 113, 0.3)'; ctx.stroke();
            } 
        }
        if (this.id === 'midboss') {
            ctx.beginPath(); ctx.fillStyle = 'rgba(142, 68, 173, 0.2)';
            ctx.arc(this.x, this.y, 45, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = this.team === 'player' ? this.color : (this.id==='midboss' ? '#8e44ad' : '#c0392b');
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#fff';
        
        ctx.beginPath();
        if (this.type === 'cannon') {
            ctx.fillStyle = '#7f8c8d';
            ctx.arc(drawX, drawY + 8, 10, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            
            ctx.beginPath();
            ctx.fillStyle = '#2c3e50';
            const angle = this.team === 'player' ? -0.3 : 0.3;
            // 공격 시 포신 후퇴
            const recoil = (this.attackAnim > 0) ? -5 * Math.sin(this.attackAnim/15 * Math.PI) : 0;
            
            ctx.save();
            ctx.translate(drawX, drawY);
            ctx.rotate(angle);
