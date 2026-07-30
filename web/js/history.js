// ─── History module (lazy-loaded) ───

async function showHistory() {
  var content = $('history-content');
  content.innerHTML = '<p class="loading">Chargement…</p>';
  $('history-modal').classList.remove('hidden');
  var token = getToken();
  if (!token) { content.innerHTML = '<p style="color:var(--text-dim);">Connectez-vous pour voir l\'historique.</p>'; return; }
  try {
    var res = await fetchWithTimeout(API + '/history', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (!res.ok) { content.innerHTML = '<p style="color:var(--accent-red);">Erreur de chargement.</p>'; return; }
    var data = await res.json();
    var weeks = data.weeks || data.history || [];
    if (!weeks || weeks.length === 0) {
      content.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-dim);">Aucun historique encore. Vos semaines sauvegardées apparaîtront ici.</p>';
      return;
    }
    var html = '<table class="history-table"><thead><tr>';
    html += '<th>Semaine</th><th>Aliments</th><th>Prot.</th><th>Fib.</th><th>Fer</th><th>Vit C</th><th>Calcium</th>';
    html += '</tr></thead><tbody>';
    weeks.forEach(function(w) {
      var week = w.week || w.week_key || '';
      var total = w.total_foods || w.total || 0;
      var prot = w.protein || 0;
      var fib = w.fiber || 0;
      var iron = w.iron || 0;
      var vitC = w.vit_c || w.vitamin_c || 0;
      var calc = w.calcium || 0;
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
        var weekKey = row.dataset.historyWeek;
        showHistoryDetail(weekKey);
      });
    });
  } catch(e) {
    console.error('[NutriFood] History error:', e);
    content.innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>';
  }
}

async function showHistoryDetail(weekKey) {
  var content = $('history-content');
  content.innerHTML = '<p class="loading">Chargement de ' + esc(weekKey) + '…</p>';
  var token = getToken();
  if (!token) return;
  try {
    var res = await fetchWithTimeout(API + '/history/' + encodeURIComponent(weekKey), {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (!res.ok) { content.innerHTML = '<p style="color:var(--accent-red);">Erreur.</p>'; return; }
    var data = await res.json();
    var sels = data.selections || data.data || {};
    var html = '<span class="history-detail-back" id="history-back">← Retour à l\'historique</span>';
    html += '<h3 style="color:var(--accent);margin-bottom:12px;">Semaine ' + esc(weekKey) + '</h3>';
    var total = 0;
    html += '<ul class="history-detail-list">';
    Object.keys(sels).forEach(function(catId) {
      var cat = DATA.categories.find(function(c) { return c.id === catId; });
      var catName = cat ? cat.name : catId;
      var catIcon = cat ? cat.icon : '📦';
      sels[catId].forEach(function(item) {
        var qty = item.qty || 1;
        total += qty;
        html += '<li><span>' + catIcon + ' ' + esc(item.name) + ' <span style="color:var(--text-dim);font-size:0.78rem;">(' + esc(catName) + ')</span></span><span class="hd-qty">×' + qty + '</span></li>';
      });
    });
    html += '</ul>';
    if (total === 0) html += '<p style="color:var(--text-dim);text-align:center;padding:12px;">Aucune sélection cette semaine.</p>';
    html += '<p style="margin-top:8px;color:var(--text-dim);font-size:0.82rem;">Total: ' + total + ' aliment(s)</p>';
    content.innerHTML = html;
    $('history-back').addEventListener('click', showHistory);
  } catch(e) {
    content.innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>';
  }
}
