// src/auth.js
// ─── 會員登入、註冊、登出、開發者登入、SHA-256 ───────────────
import { db } from './firebase.js';
import { ref, get, set } from 'firebase/database';
import { updateUI } from './main.js';

// ── 瀏覽器原生 SHA-256 雜湊（Web Crypto API，零依賴）──────────
export async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── 使用規則彈窗控制 ────────────────────────────────────────
export function showRuleModal() {
  document.getElementById('ruleModal').classList.add('show');
  document.getElementById('ruleBtnContainer').style.display = 'none';
}

export function closeRuleModal() {
  document.getElementById('ruleModal').classList.remove('show');
  // 彈窗關閉後，按鈕動態插進去並「推開版面」（Block-Flow Layout）
  document.getElementById('ruleBtnContainer').style.display = 'block';

  // 核心防錯：關閉規則彈窗後若未登入，強制彈出登入窗
  if (!localStorage.getItem('locker_user')) {
    openLoginModal();
  }
}

// ── 登入彈窗 ─────────────────────────────────────────────────
export function openLoginModal() {
  document.getElementById('loginModal').classList.add('show');
  document.getElementById('authUsername').value = '';
  document.getElementById('authPassword').value = '';
}

export function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('show');
}

// ── 狀態列右端按鈕點擊 ─────────────────────────────────────
export function handleUserStatusClick() {
  const loggedInUser = localStorage.getItem('locker_user');
  if (loggedInUser) {
    if (confirm(`您確定要登出 ${loggedInUser} 嗎？`)) {
      logoutUser();
    }
  } else {
    openLoginModal();
  }
}

// ── 立即登入（async，SHA-256 比對）──────────────────────────
export async function submitLogin() {
  const user = document.getElementById('authUsername').value.trim();
  const pass = document.getElementById('authPassword').value.trim();

  if (!user || !pass) {
    alert('請填寫帳號與密碼！');
    return;
  }

  const userRegex = /^[a-zA-Z0-9]+$/;
  if (!userRegex.test(user)) {
    alert('帳號格式不符！僅限英文或英文與數字組合，不含空格與特殊字元。');
    return;
  }

  const hashedPassword = await sha256(pass);

  const snap = await get(ref(db, '/users/' + user));
  if (snap.exists() && snap.val().password === hashedPassword) {
    alert('登入成功！');
    loginUser(user);
  } else {
    alert('帳號或密碼輸入錯誤！');
  }
}

// ── 註冊新帳號（async，SHA-256 加密儲存）──────────────────
export async function submitRegister() {
  const user = document.getElementById('authUsername').value.trim();
  const pass = document.getElementById('authPassword').value.trim();

  if (!user || !pass) {
    alert('請填寫您要註冊的帳號與密碼！');
    return;
  }

  const userRegex = /^[a-zA-Z0-9]+$/;
  if (!userRegex.test(user)) {
    alert('帳號格式不符！僅限英文或英文與數字組合，不含空格與特殊字元。');
    return;
  }

  const passRegex = /^[a-zA-Z0-9]{8}$/;
  if (!passRegex.test(pass)) {
    alert('註冊密碼格式不符！密碼必須剛好為 8 碼，且只包含英文與數字組合。');
    return;
  }

  const hashedPassword = await sha256(pass);

  const snap = await get(ref(db, '/users/' + user));
  if (snap.exists()) {
    alert('此帳號已被註冊！請更換其他帳號。');
    return;
  }

  try {
    await set(ref(db, '/users/' + user), { password: hashedPassword });
    alert('註冊成功！系統已為您自動登入。');
    loginUser(user);
  } catch {
    alert('註冊發生錯誤！');
  }
}

// ── 以開發者身分登入 ─────────────────────────────────────
export function submitDevLogin() {
  const pw = prompt('請輸入開發者管理密碼：');
  if (pw === 'admin888') {
    alert('開發者驗證成功！已將您切換為管理員身分。');
    loginUser('開發者');
  } else if (pw !== null) {
    alert('密碼輸入錯誤，拒絕登入！');
  }
}

// ── loginUser：更新 localStorage 與狀態列按鈕外觀 ────────
export function loginUser(username) {
  localStorage.setItem('locker_user', username);
  closeLoginModal();
  _applyUserStatusBtn(username);
  updateUI();
}

// ── logoutUser：清除狀態並強制打開登入窗 ─────────────────
export function logoutUser() {
  localStorage.removeItem('locker_user');
  _applyUserStatusBtn(null);
  updateUI();
  openLoginModal();
}

// ── 私有：根據使用者名稱更新狀態列按鈕外觀 ──────────────
export function _applyUserStatusBtn(username) {
  const btn = document.getElementById('userStatusBtn');
  if (!username) {
    btn.textContent = '👤 未登入';
    btn.style.color = '#a0aec0';
    btn.style.borderColor = '#4a5568';
    btn.style.background = '#2d3748';
  } else if (username === '開發者') {
    btn.textContent = '👤 開發者';
    btn.style.color = '#FFBF00';
    btn.style.borderColor = '#FFBF00';
    btn.style.background = 'rgba(255, 191, 0, 0.1)';
  } else {
    btn.textContent = `👤 ${username} 同學`;
    btn.style.color = '#4299e1';
    btn.style.borderColor = '#3182ce';
    btn.style.background = 'rgba(49, 130, 206, 0.1)';
  }
}
