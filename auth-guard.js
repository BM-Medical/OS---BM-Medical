import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

// A sua configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC8L8dTkuL_KxvW_-m7V3c0UmYwV-gbQfE",
    authDomain: "ordem-de-servicos---bm-medical.firebaseapp.com",
    projectId: "ordem-de-servicos---bm-medical",
    storageBucket: "ordem-de-servicos---bm-medical.firebasestorage.app",
    messagingSenderId: "92355637827",
    appId: "1:92355637827:web:850b89afa5054781475af6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

/**
 * Esta função verifica o estado de autenticação do utilizador.
 * Se o utilizador não estiver autenticado, ele é redirecionado para a página de login.
 */
onAuthStateChanged(auth, (user) => {
    if (!user && !window.location.pathname.endsWith('login.html')) {
        console.log("Utilizador não autenticado. A redirecionar para o login...");
        window.location.href = 'login.html';
    }
});

/**
 * Função de logout que será chamada pelo botão.
 */
async function logout() {
    try {
        await signOut(auth);
        console.log("Logout bem-sucedido.");
        window.location.href = 'login.html';
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
    }
}

// Procura por um botão com id="logout-button" e anexa o evento de clique.
// Isto é mais robusto do que usar onclick="" no HTML.
document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
});
