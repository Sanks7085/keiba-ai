// ====== State ======
const state = {
  index: null,         // {dates, latest}
  currentDate: null,
  payload: null,       // 当日のpayload
  view: "list",        // "list" | "detail"
  detailRaceId: null,
  venueFilter: "",
};

const $app = document.getElementById("app");
const $dateSelect = document.getElementById("date-select");
const $venueFilter = document.getElementById("venue-filter");
const $updatedAt = document.getElementById("updated-at");

// ====== Init ======
async function init() {
  try {
    const indexRes = await fetch("data/index.json?t=" + Date.now());
    if (!indexRes.ok) throw new Error("index.json not found");
    state.index = await indexRes.json();
  } catch (e) {
    $app.innerHTML = `<p class="empty">予測データがまだありません。<br><br>PCで以下を実行してください:<br><code>python -m src.notify.publish_predictions --push</code></p>`;
    return;
  }

  if (!state.index.dates || state.index.dates.length === 0) {
    $app.innerHTML = `<p class="empty">予測データがまだありません。</p>`;
    return;
  }

  // 日付セレクタを構築
  $dateSelect.innerHTML = "";
  for (const d of state.index.dates) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = formatDateJp(d);
    $dateSelect.appendChild(opt);
  }

  // URLハッシュから状態復元（#race=XXX 等）
  const hash = parseHash();
  state.currentDate = hash.date || state.index.latest;
  state.detailRaceId = hash.race || null;
  state.view = hash.race ? "detail" : "list";

  $dateSelect.value = state.currentDate;
  await loadDate(state.currentDate);

  $dateSelect.addEventListener("change", async () => {
    state.currentDate = $dateSelect.value;
    state.view = "list";
    state.detailRaceId = null;
    updateHash();
    await loadDate(state.currentDate);
  });

  $venueFilter.addEventListener("change", () => {
    state.venueFilter = $venueFilter.value;
    if (state.view === "list") render();
  });

  // ハッシュ変更（ブラウザバック等）に追従
  window.addEventListener("hashchange", () => {
    const h = parseHash();
    state.currentDate = h.date || state.currentDate;
    state.detailRaceId = h.race || null;
    state.view = h.race ? "detail" : "list";
    if ($dateSelect.value !== state.currentDate) $dateSelect.value = state.currentDate;
    render();
  });

  // 30秒ごとにバックグラウンド更新
  setInterval(async () => {
    try {
      const r = await fetch(`data/${state.currentDate}.json?t=` + Date.now());
      if (r.ok) {
        const newPayload = await r.json();
        if (JSON.stringify(newPayload) !== JSON.stringify(state.payload)) {
          state.payload = newPayload;
          render();
        }
      }
    } catch (_) { /* ignore */ }
  }, 30000);
}

async function loadDate(dateStr) {
  $app.innerHTML = `<p class="loading">読み込み中...</p>`;
  try {
    const res = await fetch(`data/${dateStr}.json?t=` + Date.now());
    if (!res.ok) throw new Error("not found");
    state.payload = await res.json();
  } catch (e) {
    $app.innerHTML = `<p class="empty">${dateStr} のデータが見つかりません。</p>`;
    return;
  }

  // 会場フィルタ選択肢を構築
  const venues = [...new Set(state.payload.races.map(r => r.venue_name))].sort();
  $venueFilter.innerHTML = `<option value="">全場 (${state.payload.races.length}R)</option>`;
  for (const v of venues) {
    const count = state.payload.races.filter(r => r.venue_name === v).length;
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = `${v} (${count}R)`;
    $venueFilter.appendChild(opt);
  }
  $venueFilter.value = state.venueFilter;

  $updatedAt.textContent = "最終更新: " + formatDateTime(state.payload.generated_at);
  render();
}

// ====== Render ======
function render() {
  if (state.view === "detail" && state.detailRaceId) {
    renderDetail(state.detailRaceId);
  } else {
    renderList();
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function renderList() {
  if (!state.payload || !state.payload.races.length) {
    $app.innerHTML = `<p class="empty">レースがありません。</p>`;
    return;
  }

  let races = state.payload.races;
  if (state.venueFilter) {
    races = races.filter(r => r.venue_name === state.venueFilter);
  }

  if (!races.length) {
    $app.innerHTML = `<p class="empty">該当レースがありません。</p>`;
    return;
  }

  const html = races.map(r => {
    const skipped = r.skipped;
    const f4out = (r.in_f4 === false);
    const cardCls = f4out ? "race-card f4-out"
                  : skipped ? "race-card skipped"
                  : "race-card";
    const start = escape(r.start_time || "--:--");
    const venue = escape(r.venue_name || "?");
    const rnum = r.race_number;
    const rname = escape(r.race_name || "");
    const surface = escape(r.surface || "");
    const dist = r.distance_m;
    const cls = escape(r.race_level || r.race_class || "");
    const axisHorseName = escape(r.axis_name || `${r.axis}番`);
    const tickets = r.n_tickets;
    const cost = r.total_stake;
    const thr = r.threshold ? r.threshold.toFixed(1) : "?";

    let summary;
    if (f4out) {
      summary = `<span class="f4-pill">対象外</span> ${surface}×${cls} は黒字組合せ外`;
    } else if (skipped) {
      summary = `<span class="skip-pill">不参加</span> 閾値${thr}% 相手不足`;
    } else {
      summary = `<span class="axis-pill">軸 ${r.axis}</span>${axisHorseName} ／ ${tickets}点 ${cost.toLocaleString()}円`;
    }

    return `
      <div class="${cardCls}" data-race-id="${escape(r.race_id)}">
        <div class="row1">
          <span>${venue} ${rnum}R ／ ${cls}</span>
          <span class="start-time">${start}</span>
        </div>
        <div class="row2">${rname}</div>
        <div class="row3">
          <span>${surface}${dist}m</span>
          <span>${r.num_runners}頭</span>
        </div>
        <div class="row3" style="margin-top:6px;">${summary}</div>
      </div>
    `;
  }).join("");

  $app.innerHTML = html;

  // クリックで詳細へ
  $app.querySelectorAll(".race-card").forEach(card => {
    card.addEventListener("click", () => {
      state.detailRaceId = card.dataset.raceId;
      state.view = "detail";
      updateHash();
      render();
    });
  });
}

function renderDetail(raceId) {
  if (!state.payload) {
    $app.innerHTML = `<p class="empty">データなし</p>`;
    return;
  }
  const r = state.payload.races.find(x => x.race_id === raceId);
  if (!r) {
    $app.innerHTML = `<button class="detail-back" onclick="goBack()">← 戻る</button><p class="empty">レースが見つかりません。</p>`;
    return;
  }

  const headerHtml = `
    <button class="detail-back" onclick="goBack()">← 戻る</button>
    <div class="detail-header">
      <h2>${escape(r.venue_name)} ${r.race_number}R ${escape(r.race_name)}</h2>
      <div class="info">
        ${escape(r.surface)}${r.distance_m}m ／ ${escape(r.race_level || r.race_class || "")} ／ ${r.num_runners}頭立て<br>
        馬場: ${escape(r.track_condition || "?")} ／ 天候: ${escape(r.weather || "?")} ／ ${escape(r.start_time || "--:--")}発走
      </div>
      <div class="threshold">
        📌 セグメント閾値: <strong>${r.threshold?.toFixed(1)}%</strong>
        <small>(${escape(r.threshold_reason || "")})</small>
      </div>
      <div class="axis-summary">
        ${r.skipped
          ? `<span class="skip-pill">不参加</span> 相手${r.partners.length}頭 → 6点未満のため見送り`
          : `<span class="axis-pill">軸 ${r.axis}</span>${escape(r.axis_name || "")} ／ 相手 ${r.partners.length}頭 ／ 計 ${r.n_tickets}点 ${r.total_stake.toLocaleString()}円`
        }
      </div>
    </div>
  `;

  // 馬テーブル
  const horsesHtml = `
    <div class="section-title">📊 各馬予想確率</div>
    <table class="horses-table">
      <thead>
        <tr>
          <th class="mark"></th>
          <th class="num">馬</th>
          <th>馬名</th>
          <th>騎手</th>
          <th class="pct">相対%</th>
          <th class="pct">3連複%</th>
        </tr>
      </thead>
      <tbody>
      ${r.horses.map(h => {
        const isAxis = h.horse_number === r.axis;
        const isPartner = r.partners.includes(h.horse_number);
        const cls = isAxis ? "axis-row" : (isPartner ? "partner-row" : "");
        const mark = isAxis ? "◎" : (isPartner ? "○" : "");
        return `
          <tr class="${cls}">
            <td class="mark">${mark}</td>
            <td class="num">${h.horse_number}</td>
            <td>${escape(h.horse_name || "")}</td>
            <td>${escape((h.jockey_name || "").slice(0, 6))}</td>
            <td class="pct">${h.rel_prob.toFixed(1)}%</td>
            <td class="pct">${h.combo_total.toFixed(2)}%</td>
          </tr>
        `;
      }).join("")}
      </tbody>
    </table>
  `;

  // 買い目テーブル
  let buysHtml = "";
  if (r.skipped || r.buys.length === 0) {
    buysHtml = `
      <div class="section-title">💰 買い目</div>
      <div class="buys-summary">
        閾値${r.threshold?.toFixed(1)}%を満たす相手が${r.partners.length}頭のみ。<br>
        6点未満のため不参加。
      </div>
    `;
  } else {
    buysHtml = `
      <div class="section-title">💰 買い目（3連複1頭軸流し）</div>
      <div class="buys-summary">
        ${r.n_tickets}点 ／ 各100円 ／ 合計 ${r.total_stake.toLocaleString()}円
      </div>
      <table class="buys-table">
        <thead>
          <tr>
            <th>組合せ</th>
            <th>確率</th>
            <th>払戻(円)</th>
          </tr>
        </thead>
        <tbody>
        ${r.buys.map(b => {
          const combo = b.combo.map(n => String(n).padStart(2, "0")).join("-");
          const payout = b.payout_yen != null
            ? b.payout_yen.toLocaleString()
            : "-";
          return `<tr><td>${combo}</td><td>${b.prob.toFixed(2)}%</td><td>${payout}</td></tr>`;
        }).join("")}
        </tbody>
      </table>
    `;
  }

  $app.innerHTML = headerHtml + horsesHtml + buysHtml;
}

// ====== Helpers ======
function goBack() {
  state.view = "list";
  state.detailRaceId = null;
  updateHash();
  render();
}
window.goBack = goBack;

function parseHash() {
  const h = window.location.hash.slice(1);
  const params = {};
  for (const part of h.split("&")) {
    const [k, v] = part.split("=");
    if (k) params[k] = decodeURIComponent(v || "");
  }
  return params;
}

function updateHash() {
  const parts = [];
  if (state.currentDate) parts.push(`date=${state.currentDate}`);
  if (state.view === "detail" && state.detailRaceId) {
    parts.push(`race=${state.detailRaceId}`);
  }
  const newHash = "#" + parts.join("&");
  if (window.location.hash !== newHash) {
    history.replaceState(null, "", newHash);
  }
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatDateJp(s) {
  // "2026-05-09" → "2026/5/9 (土)"
  const d = new Date(s + "T00:00:00");
  if (isNaN(d)) return s;
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} (${wd})`;
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ====== Service Worker (PWA) ======
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

init();
