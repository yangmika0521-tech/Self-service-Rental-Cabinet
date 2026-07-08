// src/devZone.js
// ─── 開發者後台：帳密查詢、日誌、統計、刪除、清理 ───────────
import { db } from './firebase.js';
import { ref, get, remove, push, set } from 'firebase/database';
import { logoutUser } from './auth.js';

// 開發者密碼（Demo 原型用，未來應改為後端驗證）
const DEV_PASSWORD = 'admin888';

// 目前顯示中的子功能
let currentDevFunction = null;

// 從 main.js 注入的 getter（避免循環引用）
let _getSessA = () => 0;
let _getSessB = () => 0;
let _getTotA  = () => 0;
let _getTotB  = () => 0;
let _getResetAt = () => Date.now();
let _getResetMs = () => 300000;

export function injectStatsGetters(getSessA, getSessB, getTotA, getTotB, getResetAt, getResetMs) {
  _getSessA   = getSessA;
  _getSessB   = getSessB;
  _getTotA    = getTotA;
  _getTotB    = getTotB;
  _getResetAt = getResetAt;
  _getResetMs = getResetMs;
}

// ── 開啟開發者後台 ───────────────────────────────────────────
export function openDevZone() {
  const currentUser = localStorage.getItem('locker_user');
  if (currentUser === '開發者') {
    document.getElementById('devModal').classList.add('show');
    backToDevMenu();
    return;
  }

  const pw = prompt('請輸入開發者管理密碼：');
  if (pw === DEV_PASSWORD) {
    document.getElementById('devModal').classList.add('show');
    backToDevMenu();
  } else if (pw !== null) {
    alert('密碼錯誤，拒絕存取後台！');
  }
}

export function closeDevModal() {
  document.getElementById('devModal').classList.remove('show');
}

// ── 子功能路由跳轉 ──────────────────────────────────────────
export function openDevFunction(func) {
  currentDevFunction = func;
  document.getElementById('devMenu').style.display = 'none';
  document.getElementById('devBackBtn').style.display = 'block';
  refreshDevDisplay();
}

// ── 返回主選單 ───────────────────────────────────────────────
export function backToDevMenu() {
  currentDevFunction = null;
  document.getElementById('devMenu').style.display = 'flex';
  document.getElementById('devBackBtn').style.display = 'none';
  document.getElementById('devDisplayArea').innerHTML = '請選擇上方功能項目';
}

// ── 分發刷新 ─────────────────────────────────────────────────
export function refreshDevDisplay() {
  if (!currentDevFunction) return;
  const area = document.getElementById('devDisplayArea');

  if (currentDevFunction === 'accounts')      fetchDevData('accounts');
  else if (currentDevFunction === 'logs')     fetchDevData('logs');
  else if (currentDevFunction === 'session_stats')  renderSessionStats(area);
  else if (currentDevFunction === 'total_stats')    renderTotalStats(area);
  else if (currentDevFunction === 'replenish_rec')  renderReplenishRec(area);
}

// ── 動態渲染：本期區段統計 ──────────────────────────────────
function renderSessionStats(area) {
  const sessA   = _getSessA();
  const sessB   = _getSessB();
  const totSess = sessA + sessB || 1;
  const pctA    = Math.round(sessA / totSess * 100);
  const pctB    = Math.round(sessB / totSess * 100);

  area.innerHTML = `
    <div class="clabel" style="margin-bottom: 12px; color: #a0aec0;">本期區段統計 (自動歸零)</div>
    <div class="strow" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
      <div class="stn">A 本期</div>
      <div class="barbg" style="flex:1; height:8px; background:#2d2d2d; border-radius:4px; overflow:hidden;"><div class="barfill fa" id="barSessA" style="height:100%; background:#4299e1; border-radius:4px; width:${pctA}%"></div></div>
      <div class="stc" style="width:24px; text-align:right;">${sessA}</div>
    </div>
    <div class="strow" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
      <div class="stn">B 本期</div>
      <div class="barbg" style="flex:1; height:8px; background:#2d2d2d; border-radius:4px; overflow:hidden;"><div class="barfill fb" id="barSessB" style="height:100%; background:#48bb78; border-radius:4px; width:${pctB}%"></div></div>
      <div class="stc" style="width:24px; text-align:right;">${sessB}</div>
    </div>
    <div class="trow" style="display:flex; align-items:center; gap:8px; font-size:11px; color:#888;">
      <span>區段結算倒數</span>
      <div class="tbarbg" style="flex:1; height:4px; background:#2d2d2d; border-radius:2px; overflow:hidden;"><div class="tbarfill" id="tbar" style="height:100%; background:#f6ad55; border-radius:2px; width:0%"></div></div>
      <span class="tnum" id="tnum">--:--</span>
    </div>
  `;
}

// ── 動態渲染：歷史總計 ──────────────────────────────────────
function renderTotalStats(area) {
  const totA   = _getTotA();
  const totB   = _getTotB();
  const totAll = totA + totB || 1;
  const pctA   = Math.round(totA / totAll * 100);
  const pctB   = Math.round(totB / totAll * 100);

  area.innerHTML = `
    <div class="clabel" style="margin-bottom: 12px; color: #a0aec0;">歷史總計 (永久保存不歸零)</div>
    <div class="strow" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
      <div class="stn">A 總計</div>
      <div class="barbg" style="flex:1; height:8px; background:#2d2d2d; border-radius:4px; overflow:hidden;"><div class="barfill fa" id="barTotA" style="height:100%; background:#4299e1; border-radius:4px; width:${pctA}%"></div></div>
      <div class="stc" id="cntTotA" style="width:24px; text-align:right;">${totA}</div>
    </div>
    <div class="strow" style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
      <div class="stn">B 總計</div>
      <div class="barbg" style="flex:1; height:8px; background:#2d2d2d; border-radius:4px; overflow:hidden;"><div class="barfill fb" id="barTotB" style="height:100%; background:#48bb78; border-radius:4px; width:${pctB}%"></div></div>
      <div class="stc" id="cntTotB" style="width:24px; text-align:right;">${totB}</div>
    </div>
  `;
}

// ── 動態渲染：補貨分析建議（歷史存檔在上，本期在下）──────────
async function renderReplenishRec(area) {
  const sessA = _getSessA();
  const sessB = _getSessB();
  const tot   = sessA + sessB;
  let currentHtml = '';

  if (tot === 0) {
    currentHtml = `
      <div class="hot" style="border-radius:12px; padding:12px; border:0.5px solid #333; background:#2d2d2d; margin-top: 14px;">
        <div class="hot-lbl" style="font-size:10px; color:#888;">本期補貨建議 (區段動態)</div>
        <div class="hot-main" style="display:flex; align-items:center; gap:12px;">
          <div class="hbadge" style="width:40px; height:40px; background:#1e1e1e; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:18px;">📊</div>
          <div class="hbody"><h2 style="font-size:14px; margin-bottom: 2px;">等待本期數據...</h2><p style="font-size:11px; color:#b0b0b0;">本區段目前尚無任何租借數據</p></div>
        </div>
      </div>`;
  } else if (sessA > sessB) {
    currentHtml = `
      <div class="hot sa" style="border-radius:12px; padding:12px; border:1px solid #3182ce; background:rgba(49,130,206,0.15); margin-top: 14px;">
        <div class="hot-lbl" style="font-size:10px; color:#3182ce;">本期補貨建議 (區段動態)</div>
        <div class="hot-main" style="display:flex; align-items:center; gap:12px;">
          <div class="hbadge a" style="width:40px; height:40px; background:#2b6cb0; color:white; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:18px; font-weight:bold;">A</div>
          <div class="hbody"><h2 style="font-size:14px; color:white; margin-bottom: 2px;">本期 A 需求較高</h2><p style="font-size:11px; color:#cbd5e0;">A 借出 ${sessA} 次・B 借出 ${sessB} 次，建議優先增加 A 商品數量。</p></div>
        </div>
      </div>`;
  } else if (sessB > sessA) {
    currentHtml = `
      <div class="hot sb" style="border-radius:12px; padding:12px; border:1px solid #38a169; background:rgba(56,161,105,0.15); margin-top: 14px;">
        <div class="hot-lbl" style="font-size:10px; color:#38a169;">本期補貨建議 (區段動態)</div>
        <div class="hot-main" style="display:flex; align-items:center; gap:12px;">
          <div class="hbadge b" style="width:40px; height:40px; background:#276749; color:white; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:18px; font-weight:bold;">B</div>
          <div class="hbody"><h2 style="font-size:14px; color:white; margin-bottom: 2px;">本期 B 需求較高</h2><p style="font-size:11px; color:#cbd5e0;">B 借出 ${sessB} 次・A 借出 ${sessA} 次，建議優先增加 B 商品數量。</p></div>
        </div>
      </div>`;
  } else {
    currentHtml = `
      <div class="hot" style="border-radius:12px; padding:12px; border:0.5px solid #333; background:#2d2d2d; margin-top: 14px;">
        <div class="hot-lbl" style="font-size:10px; color:#888;">本期補貨建議 (區段動態)</div>
        <div class="hot-main" style="display:flex; align-items:center; gap:12px;">
          <div class="hbadge" style="width:40px; height:40px; background:#1e1e1e; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:18px;">=</div>
          <div class="hbody"><h2 style="font-size:14px; margin-bottom: 2px;">本期需求平衡</h2><p style="font-size:11px; color:#cbd5e0;">本期兩者各借出 ${sessA} 次，無明顯落差。</p></div>
        </div>
      </div>`;
  }

  const snap = await get(ref(db, '/session_history'));
  const history = snap.val();
  let historyHtml = "<div class='clabel' style='margin-bottom:8px; color: #a0aec0;'>歷史各期建議存檔</div>";

  if (!history) {
    historyHtml += "<div style='font-size:11px; color:#555; padding:8px 0;'>目前尚無任何歷史期數存檔紀錄。</div>";
  } else {
    historyHtml += "<div style='display:flex; flex-direction:column; gap:6px; max-height:130px; overflow-y:auto; padding-right:2px;'>";
    const keys = Object.keys(history).reverse();
    keys.forEach((key, index) => {
      const item = history[key];
      const badgeChar = (item.sessA > item.sessB) ? 'A' : (item.sessB > item.sessA ? 'B' : '=');
      const badgeBg   = (item.sessA > item.sessB) ? '#2b6cb0' : (item.sessB > item.sessA ? '#276749' : '#4a5568');
      historyHtml += `
        <div style="background:#141a24; border:0.5px solid #2d3748; padding:6px 8px; border-radius:6px; display:flex; align-items:center; justify-content:space-between;">
          <div style="text-align:left;">
            <div style="font-weight:bold; color:white; font-size:10px;">第 ${keys.length - index} 期 結算</div>
            <div style="font-size:8px; color:#888;">${item.time}</div>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size:9px; color:#cbd5e0;">A: ${item.sessA} | B: ${item.sessB}</span>
            <span style="width:18px; height:18px; background:${badgeBg}; color:white; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold;">${badgeChar}</span>
          </div>
        </div>`;
    });
    historyHtml += '</div>';
  }

  // 歷史存檔在上，本期動態在下
  area.innerHTML = historyHtml + currentHtml;
}

// ── fetchDevData：帳密查詢 & 租借日誌 ────────────────────────
export async function fetchDevData(type) {
  const area = document.getElementById('devDisplayArea');
  area.innerHTML = '正在向 Firebase 下載資料中...';

  if (type === 'accounts') {
    const snap = await get(ref(db, '/users'));
    const users = snap.val();
    if (!users) { area.innerHTML = '資料庫中目前無任何註冊用戶。'; return; }

    // 標頭明確標示「SHA-256」
    let html = "<table style='width:100%; border-collapse: collapse; font-size:11px;'>";
    html += "<tr><th style='border-bottom:1px solid #4a5568; padding:4px; text-align:left;'>用戶帳號</th><th style='border-bottom:1px solid #4a5568; padding:4px; text-align:left;'>密碼雜湊 (SHA-256)</th><th style='border-bottom:1px solid #4a5568; padding:4px; text-align:left;'>操作</th></tr>";
    for (const u in users) {
      // 只顯示 hash 前 16 碼 + ...
      let displayHash = users[u].password || '';
      if (displayHash.length > 16) displayHash = displayHash.substring(0, 16) + '...';

      html += `<tr style='border-bottom:1px solid #2d3748;'>`;
      html += `<td style='padding:6px 4px;'>${u}</td>`;
      html += `<td style='padding:6px 4px; color:#48bb78; font-family:monospace; font-weight:bold;'>${displayHash}</td>`;
      html += `<td style='padding:6px 4px;'><button data-username="${u}" class="delete-user-btn" style="background:#e53e3e; color:white; border:none; border-radius:4px; padding:2px 8px; font-size:10px; cursor:pointer; font-weight:bold;">刪除</button></td>`;
      html += `</tr>`;
    }
    html += '</table>';
    area.innerHTML = html;

    // 綁定刪除按鈕（事件委派，避免 innerHTML onclick 問題）
    area.querySelectorAll('.delete-user-btn').forEach((btn) => {
      btn.addEventListener('click', () => deleteUserPrompt(btn.dataset.username));
    });

  } else if (type === 'logs') {
    const snap = await get(ref(db, '/rental_logs'));
    const logs = snap.val();
    if (!logs) { area.innerHTML = '資料庫中目前尚無租借歷史日誌。'; return; }

    let html = "<table style='width:100%; border-collapse: collapse; font-size:10px;'>";
    html += "<tr><th style='border-bottom:1px solid #4a5568; padding:2px; text-align:left;'>用戶</th><th style='border-bottom:1px solid #4a5568; padding:2px; text-align:left;'>櫃位</th><th style='border-bottom:1px solid #4a5568; padding:2px; text-align:left;'>租借時間</th><th style='border-bottom:1px solid #4a5568; padding:2px; text-align:left;'>狀態</th></tr>";
    Object.keys(logs).reverse().forEach((key) => {
      const log = logs[key];
      const statusColor = log.status === '借用中' ? '#fc8181' : '#48bb78';
      html += `<tr style='border-bottom:1px solid #2d3748;'>`;
      html += `<td style='padding:4px 2px;'>${log.username}</td>`;
      html += `<td style='padding:4px 2px;'>${log.box}號柜 (${log.item})</td>`;
      html += `<td style='padding:4px 2px; color:#a0aec0; font-size:9px;'>${log.rentTime}</td>`;
      html += `<td style='padding:4px 2px; color:${statusColor}; font-weight:bold;'>${log.status}</td>`;
      html += `</tr>`;
    });
    html += '</table>';
    area.innerHTML = html;
  }
}

// ── 刪除帳號：密碼驗1 → 3次confirm → 密碼驗2 ───────────────
export function deleteUserPrompt(username) {
  const pw1 = prompt('【資安驗證 1/2】請輸入開發者密碼以啟動刪除程序：');
  if (pw1 !== DEV_PASSWORD) { if (pw1 !== null) alert('密碼輸入錯誤，安全終止！'); return; }

  if (!confirm(`⚠️【第 1/3 次確認】您確定要徹底刪除帳號【${username}】嗎？`))
    { alert('刪除已安全取消。'); return; }
  if (!confirm(`⚠️【第 2/3 次確認】此動作將清除該用戶所有資料，且日誌中對應名稱將不再具備關聯，再次確認？`))
    { alert('刪除已安全取消。'); return; }
  if (!confirm('🚨【第 3/3 次最終警告】此操作為不可逆，確定執行「永久刪除」嗎？'))
    { alert('刪除已安全取消。'); return; }

  const pw2 = prompt('【最終確認 2/2】請「再次輸入」開發者密碼以授權物理刪除：');
  if (pw2 !== DEV_PASSWORD) { if (pw2 !== null) alert('密碼輸入錯誤，刪除已被安全鎖定並攔截！'); return; }

  remove(ref(db, '/users/' + username))
    .then(() => {
      alert(`帳號【${username}】已從雲端伺服器永久刪除！`);
      fetchDevData('accounts');
      if (localStorage.getItem('locker_user') === username) logoutUser();
    })
    .catch(() => alert('刪除失敗，請檢查資料庫規則設定！'));
}

// ── 清理過期數據：密碼驗1 → 3次confirm → 密碼驗2（保留4個月）──
export async function clearOldDataPrompt() {
  const pw1 = prompt('【資安驗證 1/2】請輸入開發者密碼以啟動清理程序：');
  if (pw1 !== DEV_PASSWORD) { if (pw1 !== null) alert('密碼輸入錯誤，安全終止！'); return; }

  if (!confirm('⚠️【第 1/3 次確認】您確定要「清空過期數據」嗎？'))
    { alert('數據清理已安全取消。'); return; }
  if (!confirm('⚠️【第 2/3 次確認】此操作將清除【四個月以前】的所有租借日誌與期數建議歸檔，確認繼續？'))
    { alert('數據清理已安全取消。'); return; }
  if (!confirm('🚨【第 3/3 次最終核對】此操作不可逆！確定執行清理程序嗎？'))
    { alert('數據清理已安全取消。'); return; }

  const pw2 = prompt('【最終確認 2/2】請「再次輸入」開發者密碼以進行雲端數據裁剪：');
  if (pw2 !== DEV_PASSWORD) { if (pw2 !== null) alert('密碼輸入錯誤，清理程序已被安全終止！'); return; }

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 4);
  let deletedLogs = 0;
  let deletedHistory = 0;

  // 清理 rental_logs
  const logsSnap = await get(ref(db, '/rental_logs'));
  const logs = logsSnap.val();
  if (logs) {
    for (const key in logs) {
      const logTime = new Date(logs[key].rentTime);
      if (isNaN(logTime.getTime()) || logTime < cutoffDate) {
        await remove(ref(db, '/rental_logs/' + key));
        deletedLogs++;
      }
    }
  }

  // 清理 session_history
  const histSnap = await get(ref(db, '/session_history'));
  const history = histSnap.val();
  if (history) {
    for (const key in history) {
      const histTime = new Date(history[key].time);
      if (isNaN(histTime.getTime()) || histTime < cutoffDate) {
        await remove(ref(db, '/session_history/' + key));
        deletedHistory++;
      }
    }
  }

  alert(`🧹 數據清理圓滿完成！\n成功移除了 ${deletedLogs} 筆四個月前的舊日誌，與 ${deletedHistory} 筆舊期數建議，四個月內的重要數據皆已安全保留。`);
  refreshDevDisplay();
}
