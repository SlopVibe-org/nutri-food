// ─── Journal nutritionnel module ───

/* global API, getToken, DATA, currentUser, loadScript */

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
  await loadJournalDay(_journalDate);
  await loadJournalSummary(7);
  modal.classList.remove('hidden');
}

async function loadJournalDay(dateStr) {
  _journalDate = dateStr;
  let token = getToken();
  if (!token) { return; }
  try {
    let res = await fetchWithTimeout(API + '/journal?date=' + dateStr, {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (res.ok) {
      let data = await res.json();
      _journalEntries = data.entries || [];
      renderJournalEntries();
    }
  } catch(e) { console.error('[NutriFood] Journal load error:', e); }
}

async function loadJournalSummary(days) {
  let token = getToken();
  if (!token) { return; }
  try {
    let res = await fetchWithTimeout(API + '/journal/summary?days=' + days, {
      headers: { 'Authorization': 'Bearer ' + token }
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
    { key: 'protein',   label: 'Protéine',  unit: 'g' },
    { key: 'fiber',     label: 'Fibres',    unit: 'g' },
    { key: 'iron',      label: 'Fer',       unit: 'mg' },
    { key: 'vitamin_c', label: 'Vit C',     unit: 'mg' },
    { key: 'calcium',   label: 'Calcium',   unit: 'mg' },
    { key: 'omega3',    label: 'Oméga-3',   unit: 'g' }
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

  let token = getToken();
  if (!token) { return; }
  try {
    let res = await fetchWithTimeout(API + '/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
  let token = getToken();
  if (!token) { return; }
  let dateStr = _journalDate || getTodayISO();
  try {
    let res = await fetchWithTimeout(API + '/journal', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
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
