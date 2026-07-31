// ─── Suggestions module (lazy-loaded) ───

let suggestionsFab = null;

async function checkSuggestionsBadge() {
  if (!currentUser || !hasSelections()) {
    if (suggestionsFab) { suggestionsFab.classList.remove('visible', 'pulsing'); }
    return;
  }
  let token = getToken();
  if (!token) { return; }
  try {
    let res = await fetchWithTimeout(API + '/suggestions', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (!res.ok) { return; }
    let data = await res.json();
    let gaps = data.gaps || [];
    let portionGaps = data.portion_gaps || [];
    let totalCount = gaps.length + portionGaps.length;
    suggestionsFab = $('suggestions-fab');
    let countEl = $('fab-count');
    if (totalCount > 0) {
      suggestionsFab.classList.add('visible', 'pulsing');
      countEl.textContent = totalCount;
      countEl.style.display = 'flex';
    } else {
      suggestionsFab.classList.add('visible');
      suggestionsFab.classList.remove('pulsing');
      countEl.style.display = 'none';
    }
  } catch(e) { /* Suggestions feature is non-critical */ console.error('[NutriFood] Suggestions check error:', e); }
}

function getSuggestionBarClass(pct) {
  if (pct >= 75) { return 'good'; }
  if (pct >= 50) { return 'ok'; }
  return '';
}

function renderPortionGapsHTML(portionGaps) {
  if (portionGaps.length === 0) { return ''; }
  let html = '<h3 style="margin:0 0 8px;font-size:0.9rem;color:var(--accent-amber);">🍽️ Portions par catégorie</h3>';
  portionGaps.forEach(function(pg) {
    let pct = pg.percentage || 0;
    let barClass = getSuggestionBarClass(pct);
    html += '<div class="suggestion-gap">';
    html += '<div class="sg-header"><span class="sg-name">' + esc(pg.icon || '') + ' ' + esc(pg.category || '') + '</span><span class="sg-pct">' + pg.current + '/' + pg.target + '</span></div>';
    html += '<div class="sg-bar"><div class="sg-bar-fill ' + barClass + '" style="width:' + Math.min(pct, 100) + '%"></div></div>';
    html += '</div>';
  });
  return html;
}

function renderNutrientGapsHTML(gaps) {
  if (gaps.length === 0) { return ''; }
  let html = '<h3 style="margin:12px 0 8px;font-size:0.9rem;color:var(--accent);">📊 Nutriments</h3>';
  gaps.forEach(function(gap) {
    let pct = Math.round(gap.percentage || 0);
    let barClass = getSuggestionBarClass(pct);
    html += '<div class="suggestion-gap">';
    html += '<div class="sg-header"><span class="sg-name">' + esc(gap.nutrient || gap.name || '') + '</span><span class="sg-pct">' + pct + '%</span></div>';
    html += '<div class="sg-bar"><div class="sg-bar-fill ' + barClass + '" style="width:' + pct + '%"></div></div>';
    let foods = gap.foods || gap.suggestions || [];
    foods.forEach(function(f) {
      let fName = f.name || f.food || '';
      let fVal = f.value || f.amount || '';
      let fCat = f.category || f.cat || '';
      html += '<div class="sg-food">';
      html += '<div class="sg-food-info"><div class="sg-food-name">' + esc(fName) + '</div>';
      if (fVal) { html += '<div class="sg-food-val">' + esc(String(fVal)) + (fCat ? ' · ' + esc(fCat) : '') + '</div>'; }
      html += '</div>';
      html += '<button class="sg-add-btn" data-suggest-add="' + esc(fName) + '" data-suggest-cat="' + esc(fCat) + '">+</button>';
      html += '</div>';
    });
    html += '</div>';
  });
  return html;
}

function renderFoodSuggestionsHTML(suggestions) {
  if (suggestions.length === 0) { return ''; }
  let html = '<h3 style="margin:12px 0 8px;font-size:0.9rem;color:var(--accent);">💡 Aliments suggérés</h3>';
  suggestions.forEach(function(s) {
    html += '<div class="sg-food">';
    html += '<div class="sg-food-info"><div class="sg-food-name">' + esc(s.food || '') + '</div>';
    html += '<div class="sg-food-val">' + esc(s.reason || '') + (s.category ? ' · ' + esc(s.category) : '') + '</div></div>';
    html += '<button class="sg-add-btn" data-suggest-add="' + esc(s.food || '') + '" data-suggest-cat="' + esc(s.category || '') + '">+</button>';
    html += '</div>';
  });
  return html;
}

async function showSuggestions() {
  let content = $('suggestions-content');
  content.innerHTML = '<p class="loading">Chargement…</p>';
  $('suggestions-title').textContent = '💡 Suggestions nutritionnelles';
  $('suggestions-modal').classList.remove('hidden');
  let token = getToken();
  if (!token) { content.innerHTML = '<p style="color:var(--text-dim);">Connectez-vous pour voir les suggestions.</p>'; return; }
  try {
    let res = await fetchWithTimeout(API + '/suggestions', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (!res.ok) { content.innerHTML = '<p style="color:var(--accent-red);">Erreur de chargement.</p>'; return; }
    let data = await res.json();
    let gaps = data.gaps || [];
    let portionGaps = data.portion_gaps || [];
    let suggestions = data.suggestions || [];
    if (gaps.length === 0 && portionGaps.length === 0) {
      let allGoodHtml = '<p style="text-align:center;padding:20px;color:var(--accent);font-size:1.05rem;">🎉 Excellente semaine! Tous vos objectifs nutritionnels sont atteints.</p>';
      let seasHtml = await buildSeasonalHtml();
      if (seasHtml) { allGoodHtml += seasHtml; }
      content.innerHTML = allGoodHtml;
      return;
    }
    let html = '';
    html += renderPortionGapsHTML(portionGaps);
    html += renderNutrientGapsHTML(gaps);
    html += renderFoodSuggestionsHTML(suggestions);
    // Add seasonal at the end of suggestions
    let seasHtml = await buildSeasonalHtml();
    if (seasHtml) { html += seasHtml; }
    content.innerHTML = html;
    // Wire add buttons
    content.querySelectorAll('[data-suggest-add]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        let name = btn.dataset.suggestAdd.decodeEntities();
        addSuggestedFood(name, btn.dataset.suggestCat);
        btn.textContent = '✓';
        btn.style.background = 'var(--accent)';
        setTimeout(function() { btn.textContent = '+'; btn.style.background = ''; }, 1500);
      });
    });
  } catch(e) {
    console.error('[NutriFood] Suggestions error:', e);
    content.innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>';
  }
}

function findFoodWithHint(name, catHint) {
  for (let cat of DATA.categories) {
    let food = cat.foods.find(function(f) { return f.name === name; });
    if (food) {
      if (!catHint) { return { catId: cat.id, food: food }; }
      let hintedCat = DATA.categories.find(function(c) { return c.id === catHint || c.name === catHint; });
      if (hintedCat) {
        let inHinted = hintedCat.foods.find(function(f) { return f.name === name; });
        if (inHinted) { return { catId: hintedCat.id, food: inHinted }; }
      }
      return { catId: cat.id, food: food };
    }
  }
  return null;
}

function addSuggestedFood(name, catHint) {
  let result = findFoodWithHint(name, catHint);
  if (result) {
    addItem(result.catId, { name: result.food.name, density: result.food.density, nutrients: result.food.nutrients || '' });
    showToast(name + ' ajouté', 'success');
  } else {
    showToast('Aliment introuvable: ' + name, 'warning');
  }
}

// ─── Seasonal (inside suggestions panel) ───
let _seasonalCache = null;
async function fetchSeasonalData() {
  if (_seasonalCache) { return _seasonalCache; }
  try {
    let res = await fetchWithTimeout(API + '/seasonal', {}, 10000);
    if (!res.ok) { return null; }
    let data = await res.json();
    let foods = data.foods || data.seasonal || [];
    let names = foods.map(function(f) { return typeof f === 'string' ? f : (f.name || f.food || ''); }).filter(Boolean);
    _seasonalCache = names;
    return names;
  } catch(e) { /* Seasonal data is non-critical */ console.error('[NutriFood] Seasonal error:', e); return null; }
}

async function buildSeasonalHtml() {
  let names = await fetchSeasonalData();
  if (!names || names.length === 0) { return ''; }
  let display = names.slice(0, 8);
  let extraCount = names.length - 8;
  let html = '<h3 style="margin:12px 0 8px;font-size:0.9rem;color:#4ade80;">\uD83C\uDF31 De saison ce mois-ci</h3>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
  display.forEach(function(n) {
    html += '<span class="sb-item" data-seasonal-food="' + esc(n) + '" style="display:inline-block;padding:2px 10px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.3);border-radius:12px;font-size:0.8rem;color:#4ade80;cursor:pointer;margin:2px;">' + esc(n) + '</span>';
  });
  if (extraCount > 0) {
    html += '<span id="seasonal-more-btn" style="display:inline-block;padding:2px 10px;background:rgba(74,222,128,0.06);border:1px dashed rgba(74,222,128,0.3);border-radius:12px;font-size:0.8rem;color:#4ade80;cursor:pointer;margin:2px;">+' + extraCount + '</span>';
    html += '<div id="seasonal-extra-list" style="display:none;margin-top:4px;flex-wrap:wrap;gap:4px;">';
    names.slice(8).forEach(function(n) {
      html += '<span class="sb-item" data-seasonal-food="' + esc(n) + '" style="display:inline-block;padding:2px 10px;background:rgba(74,222,128,0.12);border:1px solid rgba(74,222,128,0.3);border-radius:12px;font-size:0.8rem;color:#4ade80;cursor:pointer;margin:2px;">' + esc(n) + '</span>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// Delegated clicks for seasonal items and expand/collapse
document.addEventListener('click', function(e) {
  let el = e.target.closest('[data-seasonal-food]');
  if (el) {
    let name = el.dataset.seasonalFood.decodeEntities();
    addSuggestedFood(name);
    return;
  }
  if (e.target.id === 'seasonal-more-btn') {
    let extra = $('seasonal-extra-list');
    if (extra) {
      let shown = extra.style.display !== 'none';
      extra.style.display = shown ? 'none' : 'flex';
      let count = /\d+/.exec(e.target.textContent);
      let countStr = count ? count[0] : '';
      e.target.textContent = shown ? '+' + countStr : '\u2212';
    }
  }
});
