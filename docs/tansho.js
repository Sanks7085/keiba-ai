// ====== State ======
const state = {
  index:       null,
  currentDate: null,
  payload:     null,
  venueFilter: "",
};

const $app         = document.getElementById("app");
const $dateSelect  = document.getElementById("date-select");
const $venueFilter = document.getElementById("venue-filter");
const $updatedAt   = document.getElementById("updated-at");

// ====== Init ======
async function init() {
  try {
    const res = await fetch("data/tansho_index.json?t=" + Date.now());
    if (!res.ok) throw new Error("tansho_index.json not found");
    state.index = await res.json();
  } catch (e) {
    $app.innerHTML = `<p class="empty">予測データがまだありません。<br><br>PCで以下を実行してください:<br><code>単勝更新&amp;公開.bat</code></p>`;
    return;
  }

  if (!state.index.dates || state.index.dates.length === 0) {
    $app.innerHTML = `<p class="empty">予測データがまだありません。</p>`;
    return;
  }

  $dateSelect.innerHTML = "";
  for (const d of state.index.dates) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = formatDateJp(d);
    $dateSelect.appendChild(opt);
  }

  state.currentDate = state.index.latest;
  $dateSelect.value = state.currentDate;
  await loadDate(state.currentDate);

  $dateSelect.addEventListener("change", async () => {
    state.currentDate = $dateSelect.value;
    await loadDate(state.currentDate);
  });

  $venueFilter.addEventListener("change", () => {
    state.venueFilter = $venueFilter.value;
    render();
  });

  // 30秒ごとに自動更新
  setInterval(async () => {
    try {
      const r = await fetch(`data/tansho/${state.currentDate}.json?t=` + Date.now());
      if (r.ok) {
        const newPayload = await r.json();
        if (JSON.stringify(newPayload) !== JSON.stringify(state.payload)) {
          state.payload = newPayload;
          render();
        }
      }
    } catch (_) {}
  }, 30000);
}

async function loadDate(dateStr) {
  $app.innerHTML = `<p class="loading">読み込み中...</p>`;
  try {
    const res = await fetch(`data/tansho/${dateStr}.json?t=` + Date.now());
    if (!res.ok) throw new Error("not found");
    state.payload = await res.json();
  } catch (e) {
    $app.innerHTML = `<p class="empty">${dateStr} のデータが見つかりません。</p>`;
    return;
  }

  // 会場フィルタ構築
  const venues = [...new Set(state.payload.races.map(r => r.venue))].sort();
  $venueFilter.innerHTML = `<option value="">全場 (${state.payload.races.length}R)</option>`;
  for (const v of venues) {
    const count = state.payload.races.filter(r => r.venue === v).length;
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
  if (!state.payload) return;
  const html = [];

  // 推奨ベット
  html.push(renderSummary());

  // 全レース詳細
  const races = state.payload.races.filter(
    r => !state.venueFilter || r.venue === state.venueFilter
  );
  if (races.length) {
    html.push(renderRaceDetails(races));
  }

  $app.innerHTML = html.join("");
  bindToggle();
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ── 推奨ベットテーブル ──
function renderSummary() {
  const bets = (state.payload.bets || []).filter(
    b => !state.venueFilter || b.venue === state.venueFilter
  );

  let rows = "";
  for (const b of bets) {
    const evClass = b.ev >= 1.5 ? "ev-high" : "ev-mid";
    const badgeClass = b.ev >= 1.5 ? "high" : "mid";
    rows += `
      <tr class="${evClass}">
        <td>${b.venue}</td>
        <td>${b.race_number}R</td>
        <td>${b.race_class}</td>
        <td>${b.distance_m ? b.distance_m + "m" : "-"} ${b.surface || ""}</td>
        <td><span class="hnum-badge" style="background:#28a745">${b.horse_number}</span></td>
        <td>${b.popularity != null ? b.popularity + "人気" : "-"}</td>
        <td>${(b.p_win * 100).toFixed(1)}%</td>
        <td>${b.fair_odds}倍</td>
        <td>${b.odds_win}倍</td>
        <td><span class="ev-badge ${badgeClass}">${b.ev.toFixed(2)}</span></td>
      </tr>`;
  }

  return `
    <div class="summary-section">
      <div class="summary-header">
        推奨ベット
        <span class="badge">${bets.length}頭</span>
        <span style="font-size:12px;color:var(--text-mute);font-weight:400">
          EV &gt; ${state.payload.ev_thr} かつ オッズ ≤ ${state.payload.odds_cap}
        </span>
      </div>
      ${bets.length === 0
        ? `<p class="no-bets">条件を満たす馬はありません。</p>`
        : `<div style="overflow-x:auto">
            <table class="bet-table">
              <thead><tr>
                <th>会場</th><th>R</th><th>クラス</th><th>距離/馬場</th>
                <th>馬番</th><th>人気</th><th>勝率</th><th>フェアオッズ</th>
                <th>単勝オッズ</th><th>EV</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>
           </div>
           <p style="font-size:11px;color:var(--text-mute);margin-top:6px;text-align:right">
             🟢 EV≥1.5 &nbsp; 🟡 EV&lt;1.5
           </p>`
      }
    </div>`;
}

// ── 全レース詳細 ──
function renderRaceDetails(races) {
  // 会場ごとにグループ化
  const byVenue = {};
  for (const r of races) {
    if (!byVenue[r.venue]) byVenue[r.venue] = [];
    byVenue[r.venue].push(r);
  }

  let html = `<div class="divider"><div class="section-title">全レース詳細</div>`;

  for (const [venue, vraces] of Object.entries(byVenue).sort()) {
    html += `<div class="venue-group"><span class="venue-label">${venue}</span>`;
    for (const race of vraces) {
      html += renderRaceCard(race);
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderRaceCard(race) {
  const buyHorses = (race.horses || []).filter(h => h.is_buy);
  const hasBuy = buyHorses.length > 0;
  const evThr = state.payload.ev_thr;

  // 馬テーブル行
  const horseRows = (race.horses || []).map(h => {
    const ev = h.ev;
    const rowClass = h.is_buy ? "buy-row" : (ev != null && ev > 1.0 ? "mid-row" : "");
    const evColor = ev != null
      ? (ev >= 1.5 ? "#28a745" : ev >= evThr ? "#e6a817" : ev > 1.0 ? "#888" : "#bbb")
      : "#bbb";
    const barPct = ev != null ? Math.min(ev / 2.0 * 100, 100) : 0;
    return `
      <tr class="${rowClass}">
        <td><span class="hnum-badge ${h.is_buy ? "" : ""}"
              style="${h.is_buy ? "" : "background:var(--primary)"}">${h.horse_number}</span></td>
        <td>${h.popularity != null ? h.popularity : "-"}</td>
        <td>${(h.p_win * 100).toFixed(1)}%</td>
        <td>${h.fair_odds != null ? h.fair_odds + "倍" : "-"}</td>
        <td>${h.odds_win != null ? h.odds_win + "倍" : "-"}</td>
        <td>
          <div class="ev-bar-wrap">
            <div class="ev-bar">
              <div class="ev-bar-fill" style="width:${barPct}%;background:${evColor}"></div>
            </div>
            <span class="ev-val" style="color:${evColor}">
              ${ev != null ? ev.toFixed(2) : "-"}
            </span>
          </div>
        </td>
      </tr>`;
  }).join("");

  const cardClass = `race-card${hasBuy ? " has-buy" : ""}`;
  const infoText  = `${race.race_class} | ${race.distance_m ? race.distance_m + "m" : "-"} ${race.surface || ""} | ${race.start_time || ""}`;
  const buyBadge  = hasBuy
    ? `<span class="race-buy-count">★ ${buyHorses.length}頭</span>`
    : "";

  return `
    <div class="${cardClass}" data-race-id="${race.race_id}">
      <div class="race-card-header" onclick="toggleRace(this)">
        <span class="race-num">${race.race_number}R</span>
        <span class="race-info"><strong>${race.race_class}</strong><br>${infoText}</span>
        ${buyBadge}
        <span class="race-expand-icon">▼</span>
      </div>
      <div class="race-card-body">
        <div style="overflow-x:auto">
          <table class="horse-table">
            <thead><tr>
              <th>馬番</th><th>人気</th><th>勝率</th>
              <th>フェアオッズ</th><th>単勝オッズ</th><th>EV</th>
            </tr></thead>
            <tbody>${horseRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

// ── インタラクション ──
function toggleRace(header) {
  const card = header.closest(".race-card");
  card.classList.toggle("expanded");
}

function bindToggle() {
  // 推奨馬のあるレースは最初から展開
  document.querySelectorAll(".race-card.has-buy").forEach(card => {
    card.classList.add("expanded");
  });
}

// ====== Utils ======
function formatDateJp(d) {
  const [y, m, day] = d.split("-");
  return `${y}年${parseInt(m)}月${parseInt(day)}日`;
}
function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

init();
