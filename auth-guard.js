// Auth Guard — versão Editada (sem top-level await)
// Mantém sessão até clicar em "Sair" e protege rotas.
// IMPORTANTE: carregar com <script type="module" src="auth-guard.js"></script>

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8L8dTkuL_KxvW_-m7V3c0UmYwV-gbQfE",
  authDomain: "ordem-de-servicos---bm-medical.firebaseapp.com",
  projectId: "ordem-de-servicos---bm-medical",
  storageBucket: "ordem-de-servicos---bm-medical.firebasestorage.app",
  messagingSenderId: "92355637827",
  appId: "1:92355637827:web:850b89afa5054781475af6",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("[auth-guard] Falha ao definir persistência:", err);
});

// CRÍTICO: Adicionada a página de assinatura na lista de páginas públicas
const isPublicPage = () => {
    const path = location.pathname;
    return /(^|\/)(login\.html|assinatura-cliente\.html)($|\?|#)/i.test(path);
};

// Protege rotas
onAuthStateChanged(auth, (user) => {
  if (!user && !isPublicPage()) {
    console.info("[auth-guard] Usuário não autenticado. Redirecionando para login...");
    location.href = "login.html";
    return;
  }
  // Se o usuário já está logado e tenta ir pro login, manda pra home
  if (user && /(^|\/)login\.html($|\?|#)/i.test(location.pathname)) {
    console.info("[auth-guard] Sessão ativa. Redirecionando para a home...");
    location.href = "index.html";
  }
});

// Logout helper
async function logout() {
  try {
    await signOut(auth);
    console.info("[auth-guard] Logout realizado.");
    location.href = "login.html";
  } catch (err) {
    console.error("[auth-guard] Erro ao sair:", err);
  }
}

addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("logout-button");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  }
});