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
            } catch (error
