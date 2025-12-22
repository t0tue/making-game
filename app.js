// --- [Firebase SDK Import] ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {  getFirestore, doc, updateDoc, onSnapshot, collection, query, where, limit, getDocs, addDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// 리다이렉트 처리 결과 확인용
import { getRedirectResult } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- [Firebase 설정] ---
const firebaseConfig = {
    apiKey: "AIzaSyAsis2mWlla5CG-FSDXdbM7bu5D4NP6mno",
    authDomain: "board-online-3339f.firebaseapp.com",
    projectId: "board-online-3339f",
    storageBucket: "board-online-3339f.firebasestorage.app",
    messagingSenderId: "366987303822",
    appId: "1:366987303822:web:e737afb8d7e2ccc4e322df"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// 전역 변수
let currentUser = null;
let currentRoomId = null;
let playerRole = null; 

// --- [인증 로직] ---

// --- [인증 및 화면 전환] ---
onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');

    if (user) {
        // 1. 로그인 성공 상태
        currentUser = user;
        console.log("로그인 사용자:", user.displayName);
        
        // 2. 화면 전환 (로그인창 숨기고 게임창 보이기)
        if (loginScreen) loginScreen.classList.add('hidden');
        if (gameScreen) gameScreen.classList.remove('hidden');
        
        document.getElementById('user-name').innerText = `${user.displayName}님 환영합니다!`;
        
        // 3. 게임 매칭 시작
        startMatchmaking();
    } else {
        // 4. 로그아웃 상태 또는 로그인 전
        currentUser = null;
        if (loginScreen) loginScreen.classList.remove('hidden');
        if (gameScreen) gameScreen.classList.add('hidden');
    }
});

// 2. 로그인 버튼 클릭 핸들러 (COOP 에러 방지를 위해 Redirect 방식 사용)
const initLogin = () => {
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            console.log("로그인 시도 중...");
            signInWithRedirect(auth, provider);
        };
    }
};

// 추가해줄 로직
getRedirectResult(auth)
  .then((result) => {
    if (result?.user) {
      console.log("리다이렉트 로그인 성공:", result.user.displayName);
      // 여기서 화면 전환 로직이 onAuthStateChanged와 중복되어도 상관없습니다.
    }
  })
  .catch((error) => {
    console.error("리다이렉트 에러 상세:", error.code, error.message);
    alert("로그인 에러: " + error.message);
  });

// --- [매칭 로직] ---
async function startMatchmaking() {
    if (!currentUser) return;

    document.getElementById('user-name').innerText = "상대방 찾는 중...";
    const roomsRef = collection(db, "rooms");
    
    // 대기 중인 방 찾기
    const q = query(roomsRef, where("status", "==", "waiting"), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        // 1. 기존에 대기 중인 방이 있다면 입장 (P2)
        const roomDoc = querySnapshot.docs[0];
        currentRoomId = roomDoc.id;
        playerRole = 'p2Data';
        
        await updateDoc(doc(db, "rooms", currentRoomId), {
            players: [roomDoc.data().players[0], currentUser.uid],
            playerNames: [roomDoc.data().playerNames[0], currentUser.displayName],
            status: "playing"
        });
        console.log("기존 방 입장:", currentRoomId);
    } else {
        // 2. 대기 중인 방이 없다면 새로 생성 (P1)
        playerRole = 'p1Data';
        const newDoc = await addDoc(roomsRef, {
            status: "waiting",
            players: [currentUser.uid],
            playerNames: [currentUser.displayName],
            turn: 'p1Data',
            gameState: {
                p1Data: { money: 2, vp: 0, estateStock: 3, copperStock: 3, inventory: [] },
                p2Data: { money: 2, vp: 0, estateStock: 3, copperStock: 3, inventory: [] }
            }
        });
        currentRoomId = newDoc.id;
        console.log("새 방 생성됨:", currentRoomId);
    }
    
    // 게임 동기화 시작
    syncGame();
}

// --- [게임 동기화] ---
function syncGame() {
    if (!currentRoomId) return;

    onSnapshot(doc(db, "rooms", currentRoomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // 상대방 기다리는 중일 때
        if (data.status === "waiting") {
            document.getElementById('user-name').innerText = "⏳ 상대방 대기 중...";
            return;
        }

        const myData = data.gameState[playerRole];
        const isMyTurn = data.turn === playerRole;

        // UI 업데이트
        document.getElementById('user-name').innerText = isMyTurn ? "🔴 내 턴입니다!" : "⏳ 상대방의 턴...";
        document.getElementById('money-display').innerText = myData.money;
        document.getElementById('vp-display').innerText = myData.vp;
        document.getElementById('estate-stock').innerText = myData.estateStock;
        document.getElementById('copper-stock').innerText = myData.copperStock;

        const invList = document.getElementById('inventory-list');
        invList.innerHTML = myData.inventory.map(item => `<li>🃏 ${item}</li>`).join('');

        // 버튼 활성/비활성
        document.getElementById('btn-estate').disabled = !isMyTurn;
        document.getElementById('btn-copper').disabled = !isMyTurn;
    });
}

// --- [카드 구매 액션] ---
window.buyCard = async (type) => {
    if (!currentRoomId || !playerRole) return;

    const roomRef = doc(db, "rooms", currentRoomId);
    try {
        await runTransaction(db, async (transaction) => {
            const roomSnap = await transaction.get(roomRef);
            const data = roomSnap.data();
            
            // 턴 확인 한 번 더 (보안)
            if (data.turn !== playerRole) throw "내 턴이 아닙니다!";

            const myData = data.gameState[playerRole];
            const cost = (type === 'estate') ? 2 : 0;
            const stockKey = (type === 'estate') ? 'estateStock' : 'copperStock';

            if (myData[stockKey] <= 0 || myData.money < cost) {
                alert("구매 조건이 부족합니다.");
                return;
            }

            // 데이터 변경
            myData.money -= cost;
            myData[stockKey] -= 1;
            myData.inventory.push(type === 'estate' ? "사유지" : "동");
            if (type === 'estate') myData.vp += 1;

            // 트랜잭션 업데이트
            transaction.update(roomRef, {
                [`gameState.${playerRole}`]: myData,
                turn: playerRole === 'p1Data' ? 'p2Data' : 'p1Data'
            });
        });
    } catch (e) { 
        console.error("구매 실패:", e); 
    }
};

// 초기 실행
window.addEventListener('DOMContentLoaded', initLogin);
