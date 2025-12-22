// --- [Firebase SDK Import] ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithRedirect, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    getRedirectResult,
    setPersistence,
    browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, doc, updateDoc, onSnapshot, collection, 
    query, where, limit, getDocs, addDoc, runTransaction 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// --- [인증 및 화면 전환 로직] ---

// 인증 상태 변화 감시 (로그인 성공 시 UI 전환)
onAuthStateChanged(auth, (user) => {
    const loginScreen = document.getElementById('login-screen');
    const gameScreen = document.getElementById('game-screen');

    if (user) {
        console.log("인증 상태 확인됨:", user.displayName);
        currentUser = user;
        
        // UI 전환: 클래스가 안 먹을 경우를 대비해 style 직접 조작 포함
        if (loginScreen) {
            loginScreen.classList.add('hidden');
            loginScreen.style.display = 'none';
        }
        if (gameScreen) {
            gameScreen.classList.remove('hidden');
            gameScreen.style.display = 'block';
        }
        
        document.getElementById('user-name').innerText = `${user.displayName}님 환영합니다!`;
        
        // 게임 매칭 시작 (한 번만 실행되도록 체크)
        if (!currentRoomId) {
            startMatchmaking();
        }
    } else {
        console.log("로그인되지 않은 상태");
        currentUser = null;
        if (loginScreen) {
            loginScreen.classList.remove('hidden');
            loginScreen.style.display = 'block';
        }
        if (gameScreen) {
            gameScreen.classList.add('hidden');
            gameScreen.style.display = 'none';
        }
    }
});

// 로그인 버튼 이벤트
const initLogin = () => {
    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.onclick = async () => {
            console.log("로그인 시도 중...");
            try {
                // 로그인 상태가 로컬 브라우저에 저장되도록 설정 후 리다이렉트
                await setPersistence(auth, browserLocalPersistence);
                await signInWithRedirect(auth, provider);
            } catch (error) {
                console.error("로그인 설정 오류:", error);
            }
        };
    }

    // 리다이렉트해서 돌아왔을 때 결과를 처리 (중요)
    getRedirectResult(auth)
        .then((result) => {
            if (result?.user) {
                console.log("리다이렉트 로그인 결과 수신 완료");
            }
        })
        .catch((error) => {
            console.error("리다이렉트 에러:", error.code, error.message);
            if (error.code === 'auth/unauthorized-domain') {
                alert("현재 도메인이 Firebase에 등록되지 않았습니다.");
            }
        });
};

// --- [매칭 로직] ---
async function startMatchmaking() {
    if (!currentUser) return;

    document.getElementById('user-name').innerText = "상대방 찾는 중...";
    const roomsRef = collection(db, "rooms");
    
    try {
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
            console.log("기존 방 입장:", currentRoomId);
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
            console.log("새 방 생성됨:", currentRoomId);
        }
        syncGame();
    } catch (e) {
        console.error("매칭 중 오류:", e);
    }
}

// --- [게임 동기화] ---
function syncGame() {
    if (!currentRoomId) return;

    onSnapshot(doc(db, "rooms", currentRoomId), (snapshot) => {
        const data = snapshot.data();
        if (!data) return;

        if (data.status === "waiting") {
            document.getElementById('user-name').innerText = "⏳ 상대방 대기 중...";
            return;
        }

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

// --- [카드 구매 액션] ---
window.buyCard = async (type) => {
    if (!currentRoomId || !playerRole) return;

    const roomRef = doc(db, "rooms", currentRoomId);
    try {
        await runTransaction(db, async (transaction) => {
            const roomSnap = await transaction.get(roomRef);
            const data = roomSnap.data();
            
            if (data.turn !== playerRole) throw "내 턴이 아닙니다!";

            const myData = data.gameState[playerRole];
            const cost = (type === 'estate') ? 2 : 0;
            const stockKey = (type === 'estate') ? 'estateStock' : 'copperStock';

            if (myData[stockKey] <= 0 || myData.money < cost) {
                alert("구매 조건이 부족합니다.");
                return;
            }

            myData.money -= cost;
            myData[stockKey] -= 1;
            myData.inventory.push(type === 'estate' ? "사유지" : "동");
            if (type === 'estate') myData.vp += 1;

            transaction.update(roomRef, {
                [`gameState.${playerRole}`]: myData,
                turn: playerRole === 'p1Data' ? 'p2Data' : 'p1Data'
            });
        });
    } catch (e) { 
        console.error("구매 실패:", e); 
    }
};

// 시작
window.addEventListener('DOMContentLoaded', initLogin);
