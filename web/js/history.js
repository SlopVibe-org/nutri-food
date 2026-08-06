// ─── History module (lazy-loaded) ───

async function showHistory() {
  let content = $('history-content');
  content.innerHTML = '<p class="loading">Chargement…</p>';
  $('history-modal').classList.remove('hidden');
  try {
    let res = await fetchWithTimeout(API + '/history', {
      headers: {  }
    }, 10000);
    if (!res.ok) { content.innerHTML = '<p style="color:var(--accent-red);">Erreur de chargement.</p>'; return; }
    let data = await res.json();
    let weeks = data.weeks || data.history || [];
    if (!weeks || weeks.length === 0) {
      content.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-dim);">Aucun historique encore. Vos semaines sauvegardées apparaîtront ici.</p>';
      return;
    }
    let html = '<table class="history-table"><thead><tr>';
    html += '<th>Semaine</th><th>Aliments</th><th>Prot.</th><th>Fib.</th><th>Fer</th><th>Vit C</th><th>Calcium</th>';
    html += '</tr></thead><tbody>';
    weeks.forEach(function(w) {
      let week = w.week || w.week_key || '';
      let total = w.total_foods || w.total || 0;
      let prot = w.protein || 0;
      let fib = w.fiber || 0;
      let iron = w.iron || 0;
      let vitC = w.vit_c || w.vitamin_c || 0;
      let calc = w.calcium || 0;
      html += '<tr data-history-week="' + esc(String(week)) + '">';
      html += '<td class="ht-week">' + esc(String(week)) + '</td>';
      html += '<td>' + total + '</td>';
      html += '<td>' + Math.round(prot) + '</td>';
      html += '<td>' + Math.round(fib) + '</td>';
      html += '<td>' + Math.round(iron) + '</td>';
      html += '<td>' + Math.round(vitC) + '</td>';
      html += '<td>' + Math.round(calc) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    content.innerHTML = html;
    // Wire row clicks
    content.querySelectorAll('[data-history-week]').forEach(function(row) {
      row.addEventListener('click', function() {
        let weekKey = row.dataset.historyWeek;
        showHistoryDetail(weekKey);
      });
    });
  } catch(e) {
    console.error('[NutriFood] History error:', e);
    content.innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>';
  }
}

async function showHistoryDetail(weekKey) {
  let content = $('history-content');
  content.innerHTML = '<p class="loading">Chargement de ' + esc(weekKey) + '…</p>';
  try {
    let res = await fetchWithTimeout(API + '/history/' + encodeURIComponent(weekKey), {
      headers: {  }
    }, 10000);
    if (!res.ok) { content.innerHTML = '<p style="color:var(--accent-red);">Erreur.</p>'; return; }
    let data = await res.json();
    let sels = data.selections || data.data || {};
    let html = '<span class="history-detail-back" id="history-back">← Retour à l\'historique</span>';
    html += '<h3 style="color:var(--accent);margin-bottom:12px;">Semaine ' + esc(weekKey) + '</h3>';
    let total = 0;
    html += '<ul class="history-detail-list">';
    Object.keys(sels).forEach(function(catId) {
      let cat = DATA.categories.find(function(c) { return c.id === catId; });
      let catName = cat ? cat.name : catId;
      let catIcon = cat ? cat.icon : '📦';
      sels[catId].forEach(function(item) {
        let qty = item.qty || 1;
        total += qty;
        html += '<li><span>' + catIcon + ' ' + esc(item.name) + ' <span style="color:var(--text-dim);font-size:0.78rem;">(' + esc(catName) + ')</span></span><span class="hd-qty">×' + qty + '</span></li>';
      });
    });
    html += '</ul>';
    if (total === 0) { html += '<p style="color:var(--text-dim);text-align:center;padding:12px;">Aucune sélection cette semaine.</p>'; }
    html += '<p style="margin-top:8px;color:var(--text-dim);font-size:0.82rem;">Total: ' + total + ' aliment(s)</p>';
    content.innerHTML = html;
    $('history-back').addEventListener('click', showHistory);
  } catch(e) {
    content.innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>';
  }
}
