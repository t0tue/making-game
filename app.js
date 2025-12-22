
// ⚠️ Firebase 설정값 입력
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit, getDocs, addDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ Firebase 설정값 입력
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

let currentUser = null;
let currentRoomId = null;
let playerRole = null; 

// --- [인증] ---
// app.js 내부의 로그인 버튼 부분 수정
const initLogin = () => {
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            // Popup 대신 Redirect 사용
            signInWithRedirect(auth, provider);
        };
    }
};

// 페이지 로드 시 리다이렉트 결과 처리
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log("로그인 성공:", user.displayName);
        startMatchmaking(); // 로그인 성공 시 매칭 시작
    }
});

// 페이지 로드 완료 후 실행
window.onload = initLogin;
// --- [매칭] ---
async function startMatchmaking() {
    document.getElementById('user-name').innerText = "상대방 찾는 중...";
    const roomsRef = collection(db, "rooms");
    const q = query(roomsRef, where("status", "==", "waiting"), limit(1));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
        const roomDoc = querySnapshot.docs[0];
        currentRoomId = roomDoc.id;
        playerRole = 'p2Data';
        await updateDoc(doc(db, "rooms", currentRoomId), {
            players: [roomDoc.data().players[0], currentUser.uid],
            playerNames: [roomDoc.data().playerNames[0], currentUser.displayName],
            status: "playing"
        });
    } else {
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
    }
    syncGame();
}

// --- [동기화] ---
function syncGame() {
    onSnapshot(doc(db, "rooms", currentRoomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (data.status === "waiting") return;

        const myData = data.gameState[playerRole];
        const isMyTurn = data.turn === playerRole;

        document.getElementById('user-name').innerText = isMyTurn ? "🔴 내 턴입니다!" : "⏳ 상대방의 턴...";
        document.getElementById('money-display').innerText = myData.money;
        document.getElementById('vp-display').innerText = myData.vp;
        document.getElementById('estate-stock').innerText = myData.estateStock;
        document.getElementById('copper-stock').innerText = myData.copperStock;

        const invList = document.getElementById('inventory-list');
        invList.innerHTML = myData.inventory.map(item => `<li>🃏 ${item}</li>`).join('');

        document.getElementById('btn-estate').disabled = !isMyTurn;
        document.getElementById('btn-copper').disabled = !isMyTurn;
    });
}

// --- [액션] ---
window.buyCard = async (type) => {
    const roomRef = doc(db, "rooms", currentRoomId);
    try {
        await runTransaction(db, async (transaction) => {
            const roomSnap = await transaction.get(roomRef);
            const data = roomSnap.data();
            const myData = data.gameState[playerRole];
            
            const cost = (type === 'estate') ? 2 : 0;
            const stockKey = (type === 'estate') ? 'estateStock' : 'copperStock';

            if (myData[stockKey] <= 0 || myData.money < cost) return;

            myData.money -= cost;
            myData[stockKey] -= 1;
            myData.inventory.push(type === 'estate' ? "사유지" : "동");
            if (type === 'estate') myData.vp += 1;

            transaction.update(roomRef, {
                [`gameState.${playerRole}`]: myData,
                turn: playerRole === 'p1Data' ? 'p2Data' : 'p1Data'
            });
        });
    } catch (e) { console.error(e); }
};
;


