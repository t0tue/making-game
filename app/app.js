// Firebase SDK 라이브러리 가져오기 (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ 여기에 Firebase 콘솔에서 복사한 설정을 붙여넣으세요!
const firebaseConfig = {
  apiKey: "AIzaSyAsis2mWlla5CG-FSDXdbM7bu5D4NP6mno",
  authDomain: "board-online-3339f.firebaseapp.com",
  projectId: "board-online-3339f",
  storageBucket: "board-online-3339f.firebasestorage.app",
  messagingSenderId: "366987303822",
  appId: "1:366987303822:web:e737afb8d7e2ccc4e322df"
};


// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let currentUser = null;

// --- 1. 인증 로직 ---
const loginBtn = document.getElementById('google-login-btn');
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider)
        .catch((error) => console.error("Login Failed", error));
});

// 로그인 상태 변화 감지
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('user-name').innerText = `플레이어: ${user.displayName}`;
        loginScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        
        // 게임 데이터 초기화 및 로드
        await initializePlayerData(user.uid);
        subscribeToPlayerData(user.uid);
    }
});

// --- 2. 게임 데이터 관리 (Firestore) ---

// 플레이어 초기 데이터 설정 (없으면 생성)
async function initializePlayerData(uid) {
    const userRef = doc(db, "players", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        // 초기 상태: 돈 2원(테스트용), 승점 0, 카드 재고 설정
        await setDoc(userRef, {
            money: 2, // 사유지를 1개 사볼 수 있게 2원으로 시작
            vp: 0,
            stock: {
                estate: 3, // 사유지 재고
                copper: 3  // 동 재고
            },
            inventory: [] // 보유 카드 목록
        });
    }
}

// 실시간 데이터 동기화 (화면 업데이트)
function subscribeToPlayerData(uid) {
    onSnapshot(doc(db, "players", uid), (doc) => {
        const data = doc.data();
        if(!data) return;

        // 화면 갱신
        document.getElementById('money-display').innerText = data.money;
        document.getElementById('vp-display').innerText = data.vp;
        document.getElementById('estate-stock').innerText = data.stock.estate;
        document.getElementById('copper-stock').innerText = data.stock.copper;

        // 인벤토리 표시
        const invList = document.getElementById('inventory-list');
        invList.innerHTML = data.inventory.map(item => `<li>🃏 ${item}</li>`).join('');
    });
}

// --- 3. 게임 액션 (카드 구매) ---
window.buyCard = async (type) => {
    if (!currentUser) return;
    
    const userRef = doc(db, "players", currentUser.uid);
    const userSnap = await getDoc(userRef);
    const data = userSnap.data();

    let cost = 0;
    let cardName = "";

    // 카드 정보 설정
    if (type === 'estate') {
        cost = 2;
        cardName = "사유지";
    } else if (type === 'copper') {
        cost = 0;
        cardName = "동";
    }

    // 유효성 검사
    if (data.stock[type] <= 0) {
        alert("재고가 없습니다!");
        return;
    }
    if (data.money < cost) {
        alert("돈이 부족합니다!");
        return;
    }

    // 데이터 업데이트 (트랜잭션 없이 간단히 처리)
    const newStock = { ...data.stock };
    newStock[type]--;

    await updateDoc(userRef, {
        money: data.money - cost,
        stock: newStock,
        inventory: [...data.inventory, cardName]
    });
};
