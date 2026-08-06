// ─── Journal nutritionnel module ───

/* global API, DATA, currentUser, loadScript */

let _journalEntries = [];
let _journalDate = null;
let _journalSummary = null;

function getTodayISO() {
 return new Date().toISOString().slice(0, 10);
}

async function showJournal() {
 let modal = $('journal-modal');
 if (!modal) { return; }
 _journalDate = getTodayISO();
 $('journal-date').value = _journalDate;
 let addBtn = $('journal-add-btn');
 if (addBtn) { addBtn.onclick = addJournalEntry; }
 let dateInput = $('journal-date');
 if (dateInput) { dateInput.onchange = function() { loadJournalDay(dateInput.value); }; }
 initJournalAutocomplete();
 await loadJournalDay(_journalDate);
 await loadJournalTrends(7);
 modal.classList.remove('hidden');
}

async function loadJournalDay(dateStr) {
 _journalDate = dateStr;
 try {
 let res = await fetchWithTimeout(API + '/journal?date=' + dateStr, {
 headers: { }
 }, 10000);
 if (res.ok) {
 let data = await res.json();
 _journalEntries = data.entries || [];
 renderJournalEntries();
 }
 } catch(e) { console.error('[NutriFood] Journal load error:', e); }
}

async function loadJournalSummary(days) {
 try {
 let res = await fetchWithTimeout(API + '/journal/summary?days=' + days, {
 headers: { }
 }, 10000);
 if (res.ok) {
 _journalSummary = await res.json();
 renderJournalSummary();
 }
 } catch(e) { console.error('[NutriFood] Journal summary error:', e); }
}

function renderJournalEntries() {
 let container = $('journal-entries');
 if (!container) { return; }
 if (_journalEntries.length === 0) {
 container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px 0;">Aucune entrée pour cette date.</p>';
 return;
 }
 let html = '';
 _journalEntries.forEach(function(entry) {
 let cat = DATA.categories.find(function(c) { return c.id === entry.cat_id; });
 let catIcon = cat ? cat.icon + ' ' : '🍽️ ';
 let n = entry.nutrition || {};
 let nutriStr = '';
 if (n.calories) { nutriStr += Math.round(n.calories * entry.qty) + ' kcal'; }
 if (n.protein) { nutriStr += ' · ' + Math.round((n.protein * entry.qty) * 10) / 10 + 'g protéine'; }
 html += '<div class="journal-entry">';
 html += '<div class="je-info">';
 html += '<span class="je-icon">' + catIcon + '</span>';
 html += '<div>';
 html += '<div class="je-name">' + esc(entry.food_name) + ' <span class="je-qty">×' + entry.qty + '</span></div>';
 if (nutriStr) { html += '<div class="je-nutri">' + nutriStr + '</div>'; }
 html += '</div>';
 html += '</div>';
 html += '<button class="je-remove" data-name="' + esc(entry.food_name) + '" title="Supprimer">✕</button>';
 html += '</div>';
 });
 container.innerHTML = html;
 container.querySelectorAll('.je-remove').forEach(function(btn) {
 btn.addEventListener('click', function() {
 deleteJournalEntry(btn.dataset.name);
 });
 });
}

function renderJournalSummary() {
 let container = $('journal-summary');
 if (!container || !_journalSummary) { return; }
 let avg = _journalSummary.avg_totals || {};
 let daysWith = _journalSummary.days ? _journalSummary.days.filter(function(d) { return d.entries.length > 0; }).length : 0;

 let nutrients = [
 { key: 'protein', label: 'Protéine', unit: 'g' },
 { key: 'fiber', label: 'Fibres', unit: 'g' },
 { key: 'iron', label: 'Fer', unit: 'mg' },
 { key: 'vitamin_c', label: 'Vit C', unit: 'mg' },
 { key: 'calcium', label: 'Calcium', unit: 'mg' },
 { key: 'omega3', label: 'Oméga-3', unit: 'g' }
 ];

 let html = '<div class="journal-summary-header">📊 Moyennes sur ' + daysWith + ' jour' + (daysWith > 1 ? 's' : '') + '</div>';
 html += '<div class="journal-stats-row">';
 nutrients.forEach(function(n) {
 let val = avg[n.key] || 0;
 html += '<div class="journal-stat">';
 html += '<span class="js-value">' + (Math.round(val * 10) / 10) + '</span>';
 html += '<span class="js-label">' + n.label + '</span>';
 html += '<span class="js-unit">' + n.unit + '</span>';
 html += '</div>';
 });
 html += '</div>';
 container.innerHTML = html;
}

async function addJournalEntry() {
 let name = $('journal-food-name').value.trim();
 let catId = $('journal-food-cat').value;
 let qty = parseInt($('journal-food-qty').value, 10) || 1;
 let dateStr = $('journal-date').value || getTodayISO();

 if (!name) { return; }

 // Find food in DATA for nutrition info
 let nutrition = null;
 let resolvedCatId = catId || null;
 DATA.categories.forEach(function(cat) {
 cat.foods.forEach(function(f) {
 if (f.name.toLowerCase() === name.toLowerCase()) {
 if (!resolvedCatId) { resolvedCatId = cat.id; }
 if (f.nutrients && typeof f.nutrients === 'object') {
 nutrition = f.nutrients;
 }
 }
 });
 });

 try {
 let res = await fetchWithTimeout(API + '/journal', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 date: dateStr,
 food_name: name,
 cat_id: resolvedCatId,
 qty: qty,
 nutrition: nutrition
 })
 }, 10000);
 if (res.ok) {
 $('journal-food-name').value = '';
 $('journal-food-qty').value = '1';
 await loadJournalDay(dateStr);
 await loadJournalSummary(7);
 } else {
 let data = await res.json().catch(function() { return {}; });
 showToast(data.error || 'Erreur', 'error');
 }
 } catch(e) { console.error('[NutriFood] Journal add error:', e); }
}

async function deleteJournalEntry(foodName) {
 let dateStr = _journalDate || getTodayISO();
 try {
 let res = await fetchWithTimeout(API + '/journal', {
 method: 'DELETE',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ date: dateStr, food_name: foodName })
 }, 10000);
 if (res.ok) {
 await loadJournalDay(dateStr);
 await loadJournalSummary(7);
 }
 } catch(e) { console.error('[NutriFood] Journal delete error:', e); }
}

function initJournalAutocomplete() {
 let input = $('journal-food-name');
 if (!input) { return; }
 let timeout = null;
 input.addEventListener('input', function() {
 clearTimeout(timeout);
 timeout = setTimeout(function() {
 let query = input.value.trim().toLowerCase();
 let datalist = $('journal-food-list');
 if (!datalist) { return; }
 datalist.innerHTML = '';
 if (query.length < 1) { return; }
 let matches = [];
 DATA.categories.forEach(function(cat) {
 cat.foods.forEach(function(f) {
 if (f.name.toLowerCase().includes(query)) {
 matches.push({ name: f.name, cat: cat.id, catName: cat.name });
 }
 });
 });
 matches.slice(0, 15).forEach(function(m) {
 let opt = document.createElement('option');
 opt.value = m.name;
 opt.label = m.catName;
 datalist.appendChild(opt);
 });
 }, 100);
 });
}


// ─── Trends visualization (issue #45) ───
let _trendsChart = null;

async function loadJournalTrends(days) {
  days = days || 7;
  try {
    let res = await fetchWithTimeout(API + '/journal/summary?days=' + days, {}, 10000);
    if (res.ok) {
      _journalSummary = await res.json();
      renderTrendsChart(days);
    }
  } catch(e) { console.error('[NutriFood] Trends load error:', e); }
}

function renderTrendsChart(days) {
  let container = $('journal-trends');
  if (!container || !_journalSummary) { return; }
  let dayData = (_journalSummary.days || []).slice().reverse();
  if (dayData.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:16px 0;">Pas encore de donn\u00e9es.</p>';
    return;
  }
  let nutrients = [
    { key: 'protein', label: 'Prot\u00e9ines (g)', color: '#4ade80' },
    { key: 'fiber', label: 'Fibres (g)', color: '#38bdf8' },
    { key: 'iron', label: 'Fer (mg)', color: '#fbbf24' },
    { key: 'vitamin_c', label: 'Vit C (mg)', color: '#f87171' },
    { key: 'calcium', label: 'Calcium (mg)', color: '#a78bfa' },
    { key: 'omega3', label: 'Om\u00e9ga-3 (g)', color: '#fb923c' }
  ];
  let html = '<div class="trends-header"><div class="trends-toggle">';
  html += '<button class="trends-btn' + (days === 7 ? ' active' : '') + '" data-trends-days="7">7 jours</button>';
  html += '<button class="trends-btn' + (days === 30 ? ' active' : '') + '" data-trends-days="30">30 jours</button>';
  html += '</div></div>';
  html += '<div class="trends-chart-wrap"><canvas id="trends-canvas" width="600" height="280"></canvas></div>';
  html += '<div class="trends-nutrients">';
  nutrients.forEach(function(n) {
    html += '<label class="trends-nutrient-chip"><input type="checkbox" data-nutrient="' + n.key + '" checked style="accent-color:' + n.color + ';"><span style="color:' + n.color + ';">\u25cf</span> ' + n.label + '</label>';
  });
  html += '</div>';
  container.innerHTML = html;
  container.querySelectorAll('.trends-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { loadJournalTrends(parseInt(btn.dataset.trendsDays, 10)); });
  });
  container.querySelectorAll('.trends-nutrient-chip input').forEach(function(cb) {
    cb.addEventListener('change', function() { _updateChart(days); });
  });
  _updateChart(days);
}

function _updateChart(days) {
  let container = $('journal-trends');
  if (!container || !_journalSummary) { return; }
  let dayData = (_journalSummary.days || []).slice().reverse();
  let labels = dayData.map(function(d) { let dt = new Date(d.date + 'T12:00:00'); return (dt.getMonth()+1) + '/' + dt.getDate(); });
  let nutrients = [
    { key: 'protein', label: 'Prot\u00e9ines (g)', color: '#4ade80' },
    { key: 'fiber', label: 'Fibres (g)', color: '#38bdf8' },
    { key: 'iron', label: 'Fer (mg)', color: '#fbbf24' },
    { key: 'vitamin_c', label: 'Vit C (mg)', color: '#f87171' },
    { key: 'calcium', label: 'Calcium (mg)', color: '#a78bfa' },
    { key: 'omega3', label: 'Om\u00e9ga-3 (g)', color: '#fb923c' }
  ];
  let activeKeys = [];
  container.querySelectorAll('.trends-nutrient-chip input:checked').forEach(function(cb) { activeKeys.push(cb.dataset.nutrient); });
  let datasets = nutrients.filter(function(n) { return activeKeys.includes(n.key); }).map(function(n) {
    return {
      label: n.label,
      data: dayData.map(function(d) { return Math.round(((d.totals || {})[n.key] || 0) * 10) / 10; }),
      borderColor: n.color, backgroundColor: n.color + '20',
      borderWidth: 2, tension: 0.3, fill: days === 30,
      pointRadius: days === 30 ? 0 : 3, pointHoverRadius: 5
    };
  });
  let canvas = $('trends-canvas');
  if (!canvas) { return; }
  let ctx = canvas.getContext('2d');
  if (_trendsChart) { _trendsChart.destroy(); }
  if (typeof Chart !== 'undefined') {
    _trendsChart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 8 } },
          tooltip: { backgroundColor: '#1a1d27', borderColor: '#2a2d3a', borderWidth: 1 }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1a1d27' } },
          y: { beginAtZero: true, ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: '#1a1d27' } }
        }
      }
    });
  } else {
    _renderSvgChart(container, labels, datasets, days);
  }
}

function _renderSvgChart(container, labels, datasets, days) {
  let wrap = container.querySelector('.trends-chart-wrap');
  if (!wrap) { return; }
  let w = 600, h = 280, pad = 40;
  let maxVal = Math.max.apply(null, datasets.flatMap(function(ds) { return ds.data; }).concat([1]));
  let xStep = (w - pad * 2) / Math.max(labels.length - 1, 1);
  let yScale = (h - pad * 2) / maxVal;
  let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;">';
  for (let i = 0; i <= 4; i++) {
    let y = pad + (h - pad * 2) * i / 4;
    svg += '<line x1="' + pad + '" y1="' + y + '" x2="' + (w - pad) + '" y2="' + y + '" stroke="#1a1d27" stroke-width="1"/>';
    svg += '<text x="' + (pad - 4) + '" y="' + (y + 3) + '" fill="#94a3b8" font-size="10" text-anchor="end">' + Math.round(maxVal * (1 - i/4)) + '</text>';
  }
  for (let i = 0; i < labels.length; i++) {
    let x = pad + i * xStep;
    if (days === 30 && i % 5 !== 0) continue;
    svg += '<text x="' + x + '" y="' + (h - pad + 14) + '" fill="#94a3b8" font-size="10" text-anchor="middle">' + labels[i] + '</text>';
  }
  datasets.forEach(function(ds) {
    let pts = ds.data.map(function(v, i) { return (pad + i * xStep) + ',' + (h - pad - v * yScale); });
    svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + ds.borderColor + '" stroke-width="2"/>';
    if (days === 7) { ds.data.forEach(function(v, i) { let cx = pad + i * xStep, cy = h - pad - v * yScale; svg += '<circle cx="' + cx + '" cy="' + cy + '" r="3" fill="' + ds.borderColor + '"/>'; }); }
  });
  svg += '</svg>';
  wrap.innerHTML = svg;
}
