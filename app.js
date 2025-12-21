import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit, getDocs, addDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 1. Firebase 설정 (본인의 것으로 교체 필수)
const firebaseConfig = {
  apiKey: "AIzaSyAsis2mWlla5CG-FSDXdbM7bu5D4NP6mno",
  authDomain: "board-online-3339f.firebaseapp.com",
  projectId: "board-online-3339f",
  storageBucket: "board-online-3339f.firebasestorage.app",
  messagingSenderId: "366987303822",
  appId: "1:366987303822:web:e737afb8d7e2ccc4e322df"
};;

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// 전역 변수
let currentUser = null;
let currentRoomId = null;
let playerRole = null; // 'p1Data' 또는 'p2Data'

// --- [UI 요소] ---
const loginScreen = document.getElementById('login-screen');
const gameScreen = document.getElementById('game-screen');
const loginBtn = document.getElementById('google-login-btn');
const userNameDisplay = document.getElementById('user-name');

// --- [A. 인증 로직] ---

loginBtn.addEventListener('click', () => {
    signInWithPopup(auth, provider).catch(err => console.error("로그인 에러:", err));
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        loginScreen.classList.add('hidden');
        gameScreen.classList.remove('hidden');
        userNameDisplay.innerText = `접속됨: ${user.displayName}`;
        console.log("로그인 성공:", user.displayName);
        
        // 로그인 성공 시 바로 매칭 시작
        startMatchmaking();
    }
});

// --- [B. 매치메이킹 (방 만들기/들어가기)] ---

async function startMatchmaking() {
    userNameDisplay.innerText = "매칭 중...";
    const roomsRef = collection(db, "rooms");
    
    // 대기 중인 방 찾기
    const q = query(roomsRef, where("status", "==", "waiting"), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        // 1. 방이 있다면 참가 (Player 2)
        const roomDoc = querySnapshot.docs[0];
        currentRoomId = roomDoc.id;
        playerRole = 'p2Data';

        await updateDoc(doc(db, "rooms", currentRoomId), {
            players: [roomDoc.data().players[0], currentUser.uid],
            playerNames: [roomDoc.data().playerNames[0], currentUser.displayName],
            status: "playing"
        });
        initGameSync();
    } else {
        // 2. 방이 없다면 생성 (Player 1)
        playerRole = 'p1Data';
        const newRoom = await addDoc(roomsRef, {
            status: "waiting",
            players: [currentUser.uid],
            playerNames: [currentUser.displayName],
            turn: 'p1Data', // p1부터 시작
            gameState: {
                p1Data: { money: 2, vp: 0, estateStock: 3, copperStock: 3, inventory: [] },
                p2Data: { money: 2, vp: 0, estateStock: 3, copperStock: 3, inventory: [] }
            }
        });
        currentRoomId = newRoom.id;
        initGameSync();
    }
}

// --- [C. 게임 데이터 실시간 동기화] ---

function initGameSync() {
    onSnapshot(doc(db, "rooms", currentRoomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        // 상대방 대기 상태 표시
        if (data.status === "waiting") {
            userNameDisplay.innerText = "상대방을 기다리는 중...";
            return;
        }

        const myData = data.gameState[playerRole];
        const isMyTurn = data.turn === playerRole;

        // UI 업데이트
        userNameDisplay.innerText = `${currentUser.displayName} (${isMyTurn ? "🔴 내 턴" : "⏳ 상대 턴"})`;
        document.getElementById('money-display').innerText = myData.money;
        document.getElementById('vp-display').innerText = myData.vp;
        document.getElementById('estate-stock').innerText = myData.estateStock;
        document.getElementById('copper-stock').innerText = myData.copperStock;

        // 인벤토리 업데이트
        const invList = document.getElementById('inventory-list');
        invList.innerHTML = myData.inventory.map(item => `<li>🃏 ${item}</li>`).join('');

        // 버튼 활성화 제어
        document.querySelectorAll(".card button").forEach(btn => {
            btn.disabled = !isMyTurn;
        });
    });
}

// --- [D. 카드 구매 로직 (액션)] ---

window.buyCard = async (type) => {
    if (!currentRoomId) return;

    const roomRef = doc(db, "rooms", currentRoomId);

    try {
        await runTransaction(db, async (transaction) => {
            const roomSnap = await transaction.get(roomRef);
            const data = roomSnap.data();

            if (data.turn !== playerRole) {
                alert("내 턴이 아닙니다!");
                return;
            }

            const myData = data.gameState[playerRole];
            const cost = (type === 'estate') ? 2 : 0;
            const stockKey = (type === 'estate') ? 'estateStock' : 'copperStock';

            if (myData[stockKey] <= 0) throw "재고가 없습니다!";
            if (myData.money < cost) throw "돈이 부족합니다!";

            // 데이터 변경
            myData.money -= cost;
            myData[stockKey] -= 1;
            myData.inventory.push(type === 'estate' ? "사유지" : "동");
            if (type === 'estate') myData.vp += 1;

            // 업데이트 적용 및 턴 넘기기 (옵션: 구매하면 바로 턴 종료)
            transaction.update(roomRef, {
                [`gameState.${playerRole}`]: myData,
                turn: playerRole === 'p1Data' ? 'p2Data' : 'p1Data' // 구매 시 턴 교체
            });
        });
    } catch (e) {
        console.error("구매 트랜잭션 실패:", e);
    }
};
