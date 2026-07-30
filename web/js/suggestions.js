// ─── Suggestions module (lazy-loaded) ───

var suggestionsFab = null;

async function checkSuggestionsBadge() {
  if (!currentUser || !hasSelections()) {
    if (suggestionsFab) suggestionsFab.classList.remove('visible', 'pulsing');
    return;
  }
  var token = getToken();
  if (!token) return;
  try {
    var res = await fetchWithTimeout(API + '/suggestions', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (!res.ok) return;
    var data = await res.json();
    var gaps = data.gaps || [];
    var portionGaps = data.portion_gaps || [];
    var totalCount = gaps.length + portionGaps.length;
    suggestionsFab = $('suggestions-fab');
    var countEl = $('fab-count');
    if (totalCount > 0) {
      suggestionsFab.classList.add('visible', 'pulsing');
      countEl.textContent = totalCount;
      countEl.style.display = 'flex';
    } else {
      suggestionsFab.classList.add('visible');
      suggestionsFab.classList.remove('pulsing');
      countEl.style.display = 'none';
    }
  } catch(e) { console.error('[NutriFood] Suggestions check error:', e); }
}

async function showSuggestions() {
  var content = $('suggestions-content');
  content.innerHTML = '<p class="loading">Chargement…</p>';
  $('suggestions-title').textContent = '💡 Suggestions nutritionnelles';
  $('suggestions-modal').classList.remove('hidden');
  var token = getToken();
  if (!token) { content.innerHTML = '<p style="color:var(--text-dim);">Connectez-vous pour voir les suggestions.</p>'; return; }
  try {
    var seasHtml = '';
    var res = await fetchWithTimeout(API + '/suggestions', {
      headers: { 'Authorization': 'Bearer ' + token }
    }, 10000);
    if (!res.ok) { content.innerHTML = '<p style="color:var(--accent-red);">Erreur de chargement.</p>'; return; }
    var data = await res.json();
    var gaps = data.gaps || [];
    var portionGaps = data.portion_gaps || [];
    var suggestions = data.suggestions || [];
    if (gaps.length === 0 && portionGaps.length === 0) {
      var allGoodHtml = '<p style="text-align:center;padding:20px;color:var(--accent);font-size:1.05rem;">🎉 Excellente semaine! Tous vos objectifs nutritionnels sont atteints.</p>';
      seasHtml = await buildSeasonalHtml();
      if (seasHtml) allGoodHtml += seasHtml;
      content.innerHTML = allGoodHtml;
      return;
    }
    var html = '';
    // Portion gaps section
    if (portionGaps.length > 0) {
      html += '<h3 style="margin:0 0 8px;font-size:0.9rem;color:var(--accent-amber);">🍽️ Portions par catégorie</h3>';
      portionGaps.forEach(function(pg) {
        var pct = pg.percentage || 0;
        var barClass = '';
        if (pct >= 75) barClass = 'good';
        else if (pct >= 50) barClass = 'ok';
        html += '<div class="suggestion-gap">';
        html += '<div class="sg-header"><span class="sg-name">' + esc(pg.icon || '') + ' ' + esc(pg.category || '') + '</span><span class="sg-pct">' + pg.current + '/' + pg.target + '</span></div>';
        html += '<div class="sg-bar"><div class="sg-bar-fill ' + barClass + '" style="width:' + Math.min(pct, 100) + '%"></div></div>';
        html += '</div>';
      });
    }
    // Nutrient gaps section
    if (gaps.length > 0) {
      html += '<h3 style="margin:12px 0 8px;font-size:0.9rem;color:var(--accent);">📊 Nutriments</h3>';
    }
    gaps.forEach(function(gap) {
      var pct = Math.round(gap.percentage || 0);
      var barClass = '';
      if (pct >= 75) barClass = 'good';
      else if (pct >= 50) barClass = 'ok';
      html += '<div class="suggestion-gap">';
      html += '<div class="sg-header"><span class="sg-name">' + esc(gap.nutrient || gap.name || '') + '</span><span class="sg-pct">' + pct + '%</span></div>';
      html += '<div class="sg-bar"><div class="sg-bar-fill ' + barClass + '" style="width:' + pct + '%"></div></div>';
      var foods = gap.foods || gap.suggestions || [];
      foods.forEach(function(f) {
        var fName = f.name || f.food || '';
        var fVal = f.value || f.amount || '';
        var fCat = f.category || f.cat || '';
        html += '<div class="sg-food">';
        html += '<div class="sg-food-info"><div class="sg-food-name">' + esc(fName) + '</div>';
        if (fVal) html += '<div class="sg-food-val">' + esc(String(fVal)) + (fCat ? ' · ' + esc(fCat) : '') + '</div>';
        html += '</div>';
        html += '<button class="sg-add-btn" data-suggest-add="' + esc(fName) + '" data-suggest-cat="' + esc(fCat) + '">+</button>';
        html += '</div>';
      });
      html += '</div>';
    });
    // Food suggestions
    if (suggestions.length > 0) {
      html += '<h3 style="margin:12px 0 8px;font-size:0.9rem;color:var(--accent);">💡 Aliments suggérés</h3>';
      suggestions.forEach(function(s) {
        html += '<div class="sg-food">';
        html += '<div class="sg-food-info"><div class="sg-food-name">' + esc(s.food || '') + '</div>';
        html += '<div class="sg-food-val">' + esc(s.reason || '') + (s.category ? ' · ' + esc(s.category) : '') + '</div></div>';
        html += '<button class="sg-add-btn" data-suggest-add="' + esc(s.food || '') + '" data-suggest-cat="' + esc(s.category || '') + '">+</button>';
        html += '</div>';
      });
    }
    // Add seasonal at the end of suggestions
    seasHtml = await buildSeasonalHtml();
    if (seasHtml) html += seasHtml;
    content.innerHTML = html;
    // Wire add buttons
    content.querySelectorAll('[data-suggest-add]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var name = btn.dataset.suggestAdd.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
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

function addSuggestedFood(name, catHint) {
  // Search in DATA for this food
  var found = false;
  for (var i = 0; i < DATA.categories.length; i++) {
    var cat = DATA.categories[i];
    var food = cat.foods.find(function(f) { return f.name === name; });
    if (food) {
      // If catHint provided, try to match it, otherwise use found cat
      var useCatId = cat.id;
      if (catHint) {
        var hintedCat = DATA.categories.find(function(c) { return c.id === catHint || c.name === catHint; });
        if (hintedCat) {
          var inHinted = hintedCat.foods.find(function(f) { return f.name === name; });
          if (inHinted) { useCatId = hintedCat.id; food = inHinted; }
        }
      }
      addItem(useCatId, { name: food.name, density: food.density, nutrients: food.nutrients || '' });
      found = true;
      break;
    }
  }
  if (!found) showToast('Aliment introuvable: ' + name, 'warning');
  else showToast(name + ' ajouté', 'success');
}

// ─── Seasonal (inside suggestions panel) ───
var _seasonalCache = null;
async function fetchSeasonalData() {
  if (_seasonalCache) return _seasonalCache;
  try {
    var res = await fetchWithTimeout(API + '/seasonal', {}, 10000);
    if (!res.ok) return null;
    var data = await res.json();
    var foods = data.foods || data.seasonal || [];
    var names = foods.map(function(f) { return typeof f === 'string' ? f : (f.name || f.food || ''); }).filter(function(n) { return n; });
    _seasonalCache = names;
    return names;
  } catch(e) { console.error('[NutriFood] Seasonal error:', e); return null; }
}

async function buildSeasonalHtml() {
  var names = await fetchSeasonalData();
  if (!names || names.length === 0) return '';
  var display = names.slice(0, 8);
  var extraCount = names.length - 8;
  var html = '<h3 style="margin:12px 0 8px;font-size:0.9rem;color:#4ade80;">\uD83C\uDF31 De saison ce mois-ci</h3>';
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
  var el = e.target.closest('[data-seasonal-food]');
  if (el) {
    var name = el.dataset.seasonalFood.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    addSuggestedFood(name);
    return;
  }
  if (e.target.id === 'seasonal-more-btn') {
    var extra = $('seasonal-extra-list');
    if (extra) {
      var shown = extra.style.display !== 'none';
      extra.style.display = shown ? 'none' : 'flex';
      var count = e.target.textContent.match(/\d+/);
      e.target.textContent = shown ? '+' + (count ? count[0] : '') : '\u2212';
    }
  }
});
