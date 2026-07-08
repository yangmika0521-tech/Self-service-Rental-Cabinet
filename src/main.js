// src/main.js
// ─── 專案進入點：UI 渲染、Firebase 監聽、心跳、結算定時器 ────
import './style.css';
import { db } from './firebase.js';
import { ref, onValue, get, set, push, update, remove } from 'firebase/database';
import {
  showRuleModal,
  closeRuleModal,
  openLoginModal,
  handleUserStatusClick,
  submitLogin,
  submitRegister,
  submitDevLogin,
  logoutUser,
  _applyUserStatusBtn,
} from './auth.js';
import {
  openDevZone,
  closeDevModal,
  openDevFunction,
  backToDevMenu,
  refreshDevDisplay,
  clearOldDataPrompt,
  injectStatsGetters,
} from './devZone.js';

// ── 應用狀態 ────────────────────────────────────────────────
const boxes = {
  1: { state: false, item: 'A', hasObj: true },
  2: { state: false, item: 'A', hasObj: true },
  3: { state: false, item: 'B', hasObj: true },
  4: { state: false, item: 'B', hasObj: true },
};
let totA = 0, totB = 0, sessA = 0, sessB = 0;
const RESET_MS = 5 * 60 * 1000;
let resetAt = Date.now() + RESET_MS;

// ── ESP32 離線偵測 ───────────────────────────────────────────
let esp32Online    = null;   // null=未確定, true=在線, false=確認離線
let modalDismissed = false;
let lastHeartbeat  = Date.now();
const HEARTBEAT_TIMEOUT = 15000;

// ── 注入 stats getter 給 devZone（避免循環 import）────────────
injectStatsGetters(
  () => sessA,
  () => sessB,
  () => totA,
  () => totB,
  () => resetAt,
  () => RESET_MS,
);

// ── DOM 就緒後綁定所有事件 ──────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // ① 初始化狀態列按鈕外觀
  _applyUserStatusBtn(localStorage.getItem('locker_user'));

  // ② 一進網頁立即彈出使用規則
  showRuleModal();

  // ─ 使用規則彈窗
  document.getElementById('ruleConfirmBtn').addEventListener('click', closeRuleModal);
  document.getElementById('showRuleBtn').addEventListener('click', showRuleModal);

  // ─ 登入彈窗按鈕
  document.getElementById('loginBtn').addEventListener('click', submitLogin);
  document.getElementById('registerBtn').addEventListener('click', submitRegister);
  document.getElementById('devLoginBtn').addEventListener('click', submitDevLogin);

  // ─ 狀態列用戶按鈕
  document.getElementById('userStatusBtn').addEventListener('click', handleUserStatusClick);

  // ─ 租借按鈕
  document.getElementById('btnA').addEventListener('click', () => rent('A'));
  document.getElementById('btnB').addEventListener('click', () => rent('B'));

  // ─ 離線彈窗關閉
  document.getElementById('closeOfflineBtn').addEventListener('click', closeModal);

  // ─ 開發者專區底端按鈕
  document.getElementById('devZoneBtn').addEventListener('click', openDevZone);

  // ─ 開發者後台控制
  document.getElementById('closeDevBtn').addEventListener('click', closeDevModal);
  document.getElementById('devBackBtn').addEventListener('click', backToDevMenu);
  document.getElementById('clearDataBtn').addEventListener('click', clearOldDataPrompt);

  // ─ 開發者功能按鈕（事件委派）
  document.querySelectorAll('.dev-fn-btn').forEach((btn) => {
    btn.addEventListener('click', () => openDevFunction(btn.dataset.fn));
  });
});

// ── Firebase：監聽 /esp32/ping 心跳 ─────────────────────────
onValue(ref(db, '/esp32/ping'), (snap) => {
  if (snap.val() !== null) {
    lastHeartbeat = Date.now();
    setESP32Online(true);
  }
});

// ── 每 2 秒驗證心跳是否逾時 ─────────────────────────────────
setInterval(() => {
  if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
    if (esp32Online !== false) setESP32Online(false);
  }
}, 2000);

// ── Firebase：監聽根節點（機櫃狀態 + 統計數據）──────────────
const prevBoxesState = { 1: false, 2: false, 3: false, 4: false };

onValue(ref(db, '/'), (snapshot) => {
  const data = snapshot.val();
  if (!data) return;

  for (let n = 1; n <= 4; n++) {
    const currentState = data['box' + n] || false;

    // 偵測 true→false 觸發歸還日誌回寫
    if (prevBoxesState[n] === true && currentState === false) {
      updateReturnLog(n);
    }
    prevBoxesState[n] = currentState;

    boxes[n].state = currentState;
    const rawItem = data['box' + n + '_item'];
    boxes[n].hasObj = !(rawItem === false || rawItem === 'false');
  }

  if (data.stats) {
    totA  = data.stats.A_total   || 0;
    totB  = data.stats.B_total   || 0;
    sessA = data.stats.A_session || 0;
    sessB = data.stats.B_session || 0;
  }

  // 若開發者彈窗開啟，同步刷新
  if (document.getElementById('devModal').classList.contains('show')) {
    refreshDevDisplay();
  }

  updateUI();
});

// ── 切換在線/離線狀態 ────────────────────────────────────────
function setESP32Online(online) {
  esp32Online = online;
  const dot = document.getElementById('connDot');
  const txt = document.getElementById('connText');

  if (online) {
    dot.className = 'dot online';
    txt.textContent = '雲端連線中・雙軌數據同步模式';
    document.getElementById('offlineModal').classList.remove('show');
    modalDismissed = false;
  } else {
    dot.className = 'dot offline';
    txt.textContent = '機櫃離線中・租借功能暫停';
    if (!modalDismissed) document.getElementById('offlineModal').classList.add('show');
  }
  updateUI();
}

// ── 關閉離線警告 ─────────────────────────────────────────────
function closeModal() {
  document.getElementById('offlineModal').classList.remove('show');
  modalDismissed = true;
}

// ── 租借歸還：自動回寫 /rental_logs 歸還時間 ────────────────
async function updateReturnLog(boxNum) {
  const snap = await get(ref(db, '/box_active_log/box' + boxNum));
  const logKey = snap.val();
  if (logKey) {
    const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
    await update(ref(db, '/rental_logs/' + logKey), {
      returnTime: timestamp,
      status: '已歸還',
    });
    await remove(ref(db, '/box_active_log/box' + boxNum));
  }
}

// ── 租借按鈕點擊 ─────────────────────────────────────────────
function rent(item) {
  const loggedInUser = localStorage.getItem('locker_user');
  if (!loggedInUser) {
    alert('請先登入會員以進行租借操作！');
    openLoginModal();
    return;
  }

  if (esp32Online !== true) {
    if (esp32Online === false) {
      modalDismissed = false;
      document.getElementById('offlineModal').classList.add('show');
    }
    return;
  }

  for (let n = 1; n <= 4; n++) {
    if (boxes[n].item === item && !boxes[n].state && boxes[n].hasObj) {
      const logRef  = push(ref(db, '/rental_logs'));
      const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });

      set(logRef, {
        username:   loggedInUser,
        box:        n,
        item:       item,
        rentTime:   timestamp,
        returnTime: '-',
        status:     '借用中',
      });

      set(ref(db, '/box_active_log/box' + n), logRef.key);
      set(ref(db, '/box' + n), true);

      const sessVal = item === 'A' ? sessA : sessB;
      set(ref(db, '/stats/' + item + '_session'), sessVal + 1);

      toast(n + ' 號櫃已開鎖，請取走商品！');
      return;
    }
  }
  toast(item + ' 商品已被借光，或實體櫃內暫無商品！');
}

// ── 5 分鐘自動結算歸檔定時器（無數據則過濾不寫）────────────
setInterval(() => {
  const rem = Math.max(0, resetAt - Date.now());

  if (rem === 0) {
    if (sessA > 0 || sessB > 0) {
      const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
      let recText = '需求平衡';
      if (sessA > sessB) recText = 'A 需求較高 (建議補 A)';
      else if (sessB > sessA) recText = 'B 需求較高 (建議補 B)';

      push(ref(db, '/session_history'), {
        time:           timestamp,
        sessA:          sessA,
        sessB:          sessB,
        recommendation: recText,
      });
    }

    set(ref(db, '/stats/A_session'), 0);
    set(ref(db, '/stats/B_session'), 0);
    resetAt = Date.now() + RESET_MS;
    toast('本期補貨建議已重新結算，歷史數據已同步存檔！');
    return;
  }

  // 更新倒數 UI（tbar / tnum 由 devZone 渲染後才存在 DOM）
  const tbar = document.getElementById('tbar');
  const tnum = document.getElementById('tnum');
  if (tbar && tnum) {
    const pct = rem / RESET_MS * 100;
    const s   = Math.ceil(rem / 1000);
    const m   = Math.floor(s / 60);
    const ss  = s % 60;
    tbar.style.width  = pct + '%';
    tnum.textContent  = m + ':' + (ss < 10 ? '0' : '') + ss;
  }
}, 1000);

// ── 更新網頁 UI ──────────────────────────────────────────────
export function updateUI() {
  let aFreeCount = 0;
  let bFreeCount = 0;

  for (let n = 1; n <= 4; n++) {
    const led       = document.getElementById('led'  + n);
    const st        = document.getElementById('st'   + n);
    const itemBadge = document.getElementById('item' + n);

    if (esp32Online !== true) {
      itemBadge.className   = 'item-badge item-unknown';
      itemBadge.textContent = '未連線';
    } else {
      if (boxes[n].hasObj) {
        itemBadge.className   = 'item-badge item-present';
        itemBadge.textContent = '櫃內有物';
      } else {
        itemBadge.className   = 'item-badge item-absent';
        itemBadge.textContent = '物品取走';
      }
    }

    if (esp32Online !== true) {
      led.className  = 'sled offline';
      st.textContent = esp32Online === null ? '連線中...' : '離線中';
    } else if (boxes[n].state) {
      led.className  = 'sled busy';
      st.textContent = '使用中・已借出';
    } else {
      led.className  = 'sled free';
      st.textContent = '閒置中・可租借';
      if (boxes[n].item === 'A' && boxes[n].hasObj) aFreeCount++;
      if (boxes[n].item === 'B' && boxes[n].hasObj) bFreeCount++;
    }
  }

  const loggedInUser   = localStorage.getItem('locker_user');
  const isUserLoggedIn = loggedInUser !== null;
  const hardwareCanA   = esp32Online === true && aFreeCount > 0;
  const hardwareCanB   = esp32Online === true && bFreeCount > 0;
  const btnA = document.getElementById('btnA');
  const btnB = document.getElementById('btnB');

  if (isUserLoggedIn) {
    btnA.disabled = !hardwareCanA;
    btnB.disabled = !hardwareCanB;
  } else {
    btnA.disabled = esp32Online !== true;
    btnB.disabled = esp32Online !== true;
  }

  if (!isUserLoggedIn) {
    btnA.textContent        = '未登入';
    btnB.textContent        = '未登入';
    btnA.style.background   = '#2d3748';
    btnB.style.background   = '#2d3748';
    btnA.style.color        = '#a0aec0';
    btnB.style.color        = '#a0aec0';
    btnA.style.border       = '1px solid #4a5568';
    btnB.style.border       = '1px solid #4a5568';
  } else {
    btnA.style.background = '#3182ce';
    btnB.style.background = '#38a169';
    btnA.style.color      = '#ffffff';
    btnB.style.color      = '#ffffff';
    btnA.style.border     = 'none';
    btnB.style.border     = 'none';

    btnA.textContent =
      esp32Online === false ? '機櫃離線中' :
      esp32Online === null  ? '連線中...'  :
      aFreeCount > 0 ? '租借 A 商品' : 'A 商品 已借光/無貨';

    btnB.textContent =
      esp32Online === false ? '機櫃離線中' :
      esp32Online === null  ? '連線中...'  :
      bFreeCount > 0 ? '租借 B 商品' : 'B 商品 已借光/無貨';
  }
}

// ── Toast 通知 ───────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}
