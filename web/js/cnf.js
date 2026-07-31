// ─── CNF module (lazy-loaded) ───

/* global DATA */
let cnfSelectedId = null;
let cnfSearchQuery = '';
let cnfSelectedFood = null;
let cnfSelectedNutrients = null;

// CNF group code → NutriFood category mapping
let CNF_GROUP_MAP = {
  1: 'lait',           // Dairy and Egg Products
  2: 'habitudes-herbes-epices', // Spices and Herbs
  4: 'habitudes-bons-gras',     // Fats and Oils
  5: 'poulet',          // Poultry Products
  8: 'feculents-tres-bons',     // Breakfast cereals
  9: 'fruits-autres',   // Fruits and fruit juices
  10: 'viande-rouge',   // Pork Products
  11: 'legumes-verts-fonces', // Vegetables
  12: 'noix-graines',   // Nuts and Seeds
  13: 'viande-rouge',   // Beef Products
  14: 'habitudes-boissons',    // Beverages
  15: 'poissons-gras',  // Finfish and Shellfish
  16: 'legumineuses',   // Legumes
  17: 'viande-rouge',   // Lamb, Veal and Game
  20: 'feculents-tres-bons',   // Cereals, Grains and Pasta
};

function guessCategory(groupCode, nutrients) {
  // Refine based on omega-3 content for fish
  if (groupCode === 15) {
    let omega3 = 0;
    // Sum EPA + DHA + ALA
    nutrients.forEach(function(n) {
      if (n.code === 629 || n.code === 621 || n.code === 851 || n.code === 631) omega3 += n.amount ?? 0;
    });
    return omega3 > 1.0 ? 'poissons-gras' : 'poissons-blancs';
  }
  return CNF_GROUP_MAP[groupCode] || null;
}

function showManageProducts() {
  // Default to add tab
  switchProductTab('add');
  $('manage-products-modal').classList.remove('hidden');
  $('manage-products-close').onclick = function() { $('manage-products-modal').classList.add('hidden'); };
  // Tab handlers
  $('tab-add').onclick = function() { switchProductTab('add'); };
  $('tab-remove').onclick = function() { switchProductTab('remove'); };
}

function switchProductTab(tab) {
  if (tab === 'add') {
    $('tab-add').classList.add('active');
    $('tab-add').style.color = 'var(--accent)';
    $('tab-add').style.borderBottom = '2px solid var(--accent)';
    $('tab-add').style.marginBottom = '-2px';
    $('tab-remove').classList.remove('active');
    $('tab-remove').style.color = 'var(--text-dim)';
    $('tab-remove').style.borderBottom = 'none';
    $('tab-remove').style.marginBottom = '0';
    $('tab-add-content').style.display = 'block';
    $('tab-remove-content').style.display = 'none';
    // Init add tab
    cnfSelectedId = null;
    cnfSelectedFood = null;
    cnfSelectedNutrients = null;
    $('cnf-search-input').value = '';
    $('cnf-results').innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px;">Entrez un terme de recherche et cliquez sur Rechercher.</p>';
    $('cnf-details').innerHTML = '';
    $('cnf-search-input').focus();
    $('cnf-search-btn').onclick = cnfDoSearch;
    $('cnf-search-input').onkeydown = function(e) { if (e.key === 'Enter') { e.preventDefault(); cnfDoSearch(); } };
  } else {
    $('tab-remove').classList.add('active');
    $('tab-remove').style.color = 'var(--accent)';
    $('tab-remove').style.borderBottom = '2px solid var(--accent)';
    $('tab-remove').style.marginBottom = '-2px';
    $('tab-add').classList.remove('active');
    $('tab-add').style.color = 'var(--text-dim)';
    $('tab-add').style.borderBottom = 'none';
    $('tab-add').style.marginBottom = '0';
    $('tab-add-content').style.display = 'none';
    $('tab-remove-content').style.display = 'block';
    loadRemoveProductList();
  }
}

function loadRemoveProductList() {
  let html = '';
  (DATA.sections ?? []).forEach(function(sec) {
    let cats = (DATA.categories ?? []).filter(function(c) { return c.section === sec.id; });
    if (cats.length === 0) { return; }
    cats.forEach(function(cat) {
      let count = (cat.foods ?? []).length;
      if (count === 0) { return; }
      html += '<div class="remove-cat-header" data-remove-cat="' + cat.id + '" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:8px;margin-bottom:4px;cursor:pointer;user-select:none;">';
      html += '<span style="font-size:0.9rem;font-weight:600;">' + cat.icon + ' ' + esc(cat.name) + '</span>';
      html += '<span style="font-size:0.78rem;color:var(--text-dim);">' + count + ' <span class="remove-cat-arrow">\u25BC</span></span>';
      html += '</div>';
      html += '<div class="remove-cat-items" data-remove-cat-items="' + cat.id + '" style="display:none;margin-bottom:8px;">';
      (cat.foods ?? []).forEach(function(food) {
        html += '<div class="remove-product-item" data-hide-cat="' + cat.id + '" data-hide-name="' + esc(food.name) + '" style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;transition:background 0.15s;">';
        html += '<span style="font-size:0.85rem;">' + esc(food.name) + '</span>';
        html += '<span style="font-size:0.75rem;color:var(--accent-red);">Masquer</span>';
        html += '</div>';
      });
      html += '</div>';
    });
  });
  $('remove-product-list').innerHTML = html;
}

function cnfMatchAlias(a, ql, food, cat, existingMatches) {
  let al = a.toLowerCase();
  if (al.includes(ql) || ql.includes(al)) {
    // Avoid duplicate if already matched by name
    if (!existingMatches.some(function(m) { return m.name === food.name; })) {
      existingMatches.push({ name: food.name, category: cat.name, catId: cat.id, density: food.density, nutrients: food.nutrients, allAliases: food.aliases, alias: a });
    }
  }
}

function cnfCheckFoodMatch(food, cat, ql, existingMatches) {
  let fn = food.name.toLowerCase();
  if (fn.includes(ql) || ql.includes(fn) || fn.replace(/[èéêë]/g,'e').includes(ql.replace(/[èéêë]/g,'e'))) {
    existingMatches.push({ name: food.name, category: cat.name, catId: cat.id, density: food.density, nutrients: food.nutrients, allAliases: food.aliases ?? [], alias: null });
  }
  // Check aliases too
  if (Array.isArray(food.aliases)) {
    food.aliases.forEach(function(a) { cnfMatchAlias(a, ql, food, cat, existingMatches); });
  }
}

async function cnfDoSearch() {
  let q = $('cnf-search-input').value.trim();
  if (q.length < 2) return;
  cnfSearchQuery = q;
  $('cnf-results').innerHTML = '<p class="loading">Recherche…</p>';
  $('cnf-details').innerHTML = '';
  cnfSelectedId = null;
  
  // Step 1: Check for existing items in foods.json (fuzzy match)
  let existingMatches = [];
  let ql = q.toLowerCase();
  (DATA.categories ?? []).forEach(function(cat) {
    (cat.foods ?? []).forEach(function(food) { cnfCheckFoodMatch(food, cat, ql, existingMatches); });
  });
  
  if (existingMatches.length > 0) {
    let html = '<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.4);border-radius:10px;padding:14px;margin-bottom:16px;">';
    html += '<div style="font-size:0.9rem;font-weight:700;color:var(--accent-amber);margin-bottom:8px;">⚠ Ces items existent déjà!</div>';
    existingMatches.forEach(function(m) {
      html += '<div class="cnf-existing-item" data-exist-name="' + esc(m.name) + '" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#12141c;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;">';
      let displayName = esc(m.name);
      if (m.allAliases?.length > 0) displayName += ' <span style="color:var(--text-dim);font-size:0.8rem;">(' + esc(m.allAliases.join(', ')) + ')</span>';
      html += '<span style="flex:1;font-size:0.88rem;color:var(--text);">' + displayName + '</span>';
      html += '<span style="font-size:0.75rem;color:var(--text-dim);">' + esc(m.category) + '</span>';
      html += '</div>';
    });
    html += '<div id="exist-details" style="margin-top:8px;"></div>';
    html += '<div style="display:flex;gap:8px;margin-top:12px;">';
    html += '<button id="exist-cancel-btn" style="flex:1;padding:10px;background:rgba(248,113,113,0.15);color:var(--accent-red);border:1px solid rgba(248,113,113,0.3);border-radius:8px;font-size:0.88rem;font-weight:600;cursor:pointer;">L\'item existe déjà</button>';
    html += '<button id="exist-continue-btn" style="flex:1;padding:10px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.88rem;cursor:pointer;">L\'item que je cherche n\'est pas dans cette liste</button>';
    html += '</div></div>';
    $('cnf-results').innerHTML = html;
    
    // Wire existing item clicks (toggle details)
    document.querySelectorAll('.cnf-existing-item').forEach(function(el) {
      el.addEventListener('click', function() {
        let name = el.dataset.existName;
        document.querySelectorAll('.cnf-existing-item').forEach(function(e) { e.style.borderColor = 'var(--border)'; });
        let details = $('exist-details');
        if (details.dataset.shown === name) { details.innerHTML = ''; details.dataset.shown = ''; return; }
        el.style.borderColor = 'var(--accent-amber)';
        let match = existingMatches.find(function(m) { return m.name === name; });
        let aliasNote = match.alias ? ' · Trouvé via: « ' + esc(match.alias) + ' »' : '';
        details.innerHTML = '<div style="background:#12141c;border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:4px;"><div style="font-size:0.85rem;color:var(--text);margin-bottom:4px;"><strong>' + esc(match.name) + '</strong></div><div style="font-size:0.78rem;color:var(--text-dim);">Catégorie: ' + esc(match.category) + ' · Densité: ' + match.density + aliasNote + '</div><div style="font-size:0.78rem;color:var(--text-dim);">Points forts: ' + esc(match.nutrients) + '</div></div>';
        details.dataset.shown = name;
      });
    });
    
    $('exist-cancel-btn').onclick = function() { $('manage-products-modal').classList.add('hidden'); };
    $('exist-continue-btn').onclick = function() { cnfCnfSearch(q); };
    return;
  }
  
  // No existing matches → go straight to CNF search
  cnfCnfSearch(q);
}

async function cnfCnfSearch(q) {
  $('cnf-results').innerHTML = '<p class="loading">Recherche dans la base de données…</p>';
  $('cnf-details').innerHTML = '';
  cnfSelectedId = null;
  try {
    let res = await fetchWithTimeout(API + '/cnf/search?q=' + encodeURIComponent(q), {}, 10000);
    let data = await res.json();
    if (!res.ok) { $('cnf-results').innerHTML = '<p style="color:var(--accent-red);">' + esc(data.error || 'Erreur') + '</p>'; return; }
    let results = data.results ?? [];
    if (results.length === 0) { $('cnf-results').innerHTML = '<p style="color:var(--text-dim);text-align:center;">Aucun résultat pour « ' + esc(q) + ' ».</p>'; return; }
    let html = '';
    results.forEach(function(r) {
      html += '<div class="cnf-result" data-cnf-id="' + r.food_id + '">' +
        '<span class="cnf-name">' + esc(r.name_fr ?? r.name_en ?? '') + '</span>' +
        '<span class="cnf-group">' + esc(r.group_fr ?? '') + '</span>' +
        '<span class="cnf-check">✓</span></div>';
    });
    $('cnf-results').innerHTML = html;
    document.querySelectorAll('.cnf-result').forEach(function(el) {
      el.addEventListener('click', function() { cnfSelectProduct(Number.parseInt(el.dataset.cnfId)); });
    });
  } catch(e) { $('cnf-results').innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>'; }
}

async function cnfSelectProduct(foodId) {
  if (cnfSelectedId === foodId) {
    cnfSelectedId = null;
    $('cnf-details').innerHTML = '';
    document.querySelectorAll('.cnf-result').forEach(function(el) { el.classList.remove('selected'); });
    return;
  }
  cnfSelectedId = foodId;
  document.querySelectorAll('.cnf-result').forEach(function(el) { el.classList.remove('selected'); });
  document.querySelector('.cnf-result[data-cnf-id="' + foodId + '"]').classList.add('selected');
  $('cnf-details').innerHTML = '<p class="loading">Chargement des détails…</p>';
  try {
    let res = await fetchWithTimeout(API + '/cnf/product/' + foodId, {}, 10000);
    let data = await res.json();
    if (!res.ok) { $('cnf-details').innerHTML = '<p style="color:var(--accent-red);">Erreur</p>'; return; }
    let food = data.food;
    let group = data.group;
    let nutrients = data.nutrients ?? [];
    let html = '<div style="background:#12141c;border:1px solid var(--accent-dim);border-radius:10px;padding:14px;margin-bottom:12px;">';
    html += '<div style="font-size:1rem;font-weight:700;color:var(--text);margin-bottom:4px;">' + esc(food.name_fr || food.name_en) + '</div>';
    if (group) html += '<div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:12px;">' + esc(group.name_fr) + '</div>';
    html += '<div class="cnf-nutrients">';
    nutrients.forEach(function(n) {
      html += '<div class="cnf-nutri-item"><div class="cnf-nutri-name">' + esc(n.name_fr) + '</div><div class="cnf-nutri-val">' + n.amount + ' ' + esc(n.unit) + '</div></div>';
    });
    html += '</div></div>';
    html += '<button class="login-cta" id="cnf-add-btn" style="width:100%;padding:12px;">✓ Ajouter cet aliment</button>';
    $('cnf-details').innerHTML = html;
    $('cnf-add-btn').addEventListener('click', function() { cnfConfirmAdd(food, nutrients, group); });
  } catch(e) { $('cnf-details').innerHTML = '<p style="color:var(--accent-red);">Erreur: ' + esc(e.message) + '</p>'; }
}

// ─── Portion sizes per category (grams per 1 portion) ───
// Based on Canada's Food Guide practical portions
const PORTION_GRAMS = {
  'poissons-gras':       100,  // paume de la main
  'poissons-blancs':     100,
  'fruits-mer':          100,
  'poulet':              100,
  'viande-rouge':        100,
  'oeufs':               120,  // ~2 œufs
  'legumineuses':        100,  // ¾ tasse cuite
  'noix-graines':         30,  // petite poignée
  'lait':                250,  // 1 tasse
  'legumes-verts-fonces': 80,  // 1 tasse crue / ½ cuite
  'legumes-jaune-orange': 80,
  'legumes-rouges':       80,
  'legumes-blancs':       80,
  'legumes-mauves':       80,
  'fruits-petits':       150,  // 1 tasse
  'fruits-protecteurs':  150,
  'fruits-autres':       150,  // 1 fruit moyen
  'feculents-tres-bons': 150,  // ½ tasse cuite / 1 tranche
  'feculents-bons':      150,
  'feculents-tubercules': 150, // 1 pomme de terre moyenne
  'habitudes-bons-gras':  15,  // 1 c. à soupe
  'habitudes-boissons':  250,  // 1 tasse
  'habitudes-fermentes': 100,  // ½ tasse
  'habitudes-herbes-epices': 2 // 1 pincée
};

const PORTION_LABELS = {
  2:   '1 pincée (~2g)',
  15:  '1 c. à soupe (~15g)',
  30:  '1 poignée (~30g)',
  80:  '1 tasse crue (~80g)',
  100: '1 portion (~100g)',
  120: '2 œufs (~120g)',
  150: '1 fruit moyen (~150g)',
  250: '1 tasse (~250g)'
};

function portionLabel(g) {
  return PORTION_LABELS[g] || '~' + g + 'g';
}

// ─── Canadian Daily Values (per day, adults) ───
const DV = {
  protein:    { dv: 50,   unit: 'g',  label: 'Protéine' },
  fiber:      { dv: 25,   unit: 'g',  label: 'Fibres' },
  iron:       { dv: 14,   unit: 'mg', label: 'Fer' },
  vit_c:      { dv: 60,   unit: 'mg', label: 'Vit C' },
  calcium:    { dv: 1100, unit: 'mg', label: 'Calcium' },
  omega3:     { dv: 1.1,  unit: 'g',  label: 'Ω-3' },
  b12:        { dv: 2.4,  unit: 'µg', label: 'B12' },
  vit_d:      { dv: 15,   unit: 'µg', label: 'Vit D' },
  selenium:   { dv: 55,   unit: 'µg', label: 'Sélénium' },
  vit_k:      { dv: 120,  unit: 'µg', label: 'Vit K' },
  manganese:  { dv: 2.3,  unit: 'mg', label: 'Manganèse' },
  zinc:       { dv: 11,   unit: 'mg', label: 'Zinc' },
  potassium:  { dv: 4700, unit: 'mg', label: 'Potassium' },
  magnesium:  { dv: 200,  unit: 'mg', label: 'Magnésium' },
  phosphorus: { dv: 700,  unit: 'mg', label: 'Phosphore' },
  folate:     { dv: 400,  unit: 'µg', label: 'Folate' },
  vit_e:      { dv: 15,   unit: 'mg', label: 'Vit E' },
  niacin:     { dv: 14,   unit: 'mg', label: 'Niacine' },
  b6:         { dv: 1.3,  unit: 'mg', label: 'B6' },
  thiamine:   { dv: 1.2,  unit: 'mg', label: 'Thiamine' },
  riboflavin: { dv: 1.1,  unit: 'mg', label: 'Riboflavine' },
  copper:     { dv: 0.9,  unit: 'mg', label: 'Cuivre' },
  pantothenic:{ dv: 5,    unit: 'mg', label: 'Acide pantothénique' }
};

// Canadian regulatory thresholds for nutrient content claims
// "Source" ≥5% DV, "Bonne source" ≥15% DV, "Excellente source" ≥30% DV
function dvTier(pct) {
  if (pct >= 30) return { tier: 'excellent', label: 'Excellente source', color: 'var(--accent)', weight: 3 };
  if (pct >= 15) return { tier: 'good',      label: 'Bonne source',     color: 'rgba(74,222,128,0.85)', weight: 2 };
  if (pct >= 5)  return { tier: 'source',    label: 'Source',           color: 'rgba(74,222,128,0.6)',  weight: 1 };
  return                { tier: 'low',       label: '',                 color: 'var(--text-dim)',       weight: 0 };
}

function cnfBuildNutriPer100g(nutrients) {
  let m = {};
  nutrients.forEach(function(n) { m[n.code] = n.amount; });
  return {
    protein:    m[203] ?? 0,
    fiber:      m[291] ?? 0,
    iron:       m[303] ?? 0,
    vit_c:      m[401] ?? 0,
    calcium:    m[301] ?? 0,
    omega3:     (m[629] ?? 0) + (m[621] ?? 0) + (m[631] ?? 0) + (m[851] ?? 0),
    b12:        m[418] ?? 0,
    vit_d:      m[328] ?? 0,
    selenium:   m[317] ?? 0,
    vit_k:      m[430] ?? 0,
    manganese:  m[315] ?? 0,
    zinc:       m[309] ?? 0,
    potassium:  m[306] ?? 0,
    magnesium:  m[304] ?? 0,
    phosphorus: m[305] ?? 0,
    folate:     m[435] ?? 0,
    vit_e:      m[323] ?? 0,
    niacin:     m[406] ?? 0,
    b6:         m[415] ?? 0,
    thiamine:   m[404] ?? 0,
    riboflavin: m[405] ?? 0,
    copper:     m[312] ?? 0,
    pantothenic:m[410] ?? 0
  };
}

function cnfRenderNutriGrid(N, portionG) {
  let items = [];
  Object.keys(DV).forEach(function(key) {
    let val100 = N[key];
    if (val100 <= 0) return;
    let valPortion = Math.round((val100 * portionG / 100) * 100) / 100;
    let info = DV[key];
    // B12, Vit D, Vit K, Selenium, Folate are in µg in CNF
    let displayVal = valPortion;
    let displayUnit = info.unit;
    if (info.unit === 'µg') displayVal = Math.round(valPortion * 10) / 10;
    let pctDV = Math.round((valPortion / info.dv) * 100);
    let tier = dvTier(pctDV);
    if (tier.weight > 0 || val100 > 0) {
      items.push({ key: key, label: info.label, val: displayVal, unit: displayUnit, pct: pctDV, tier: tier });
    }
  });
  items.sort(function(a, b) { return b.tier.weight - a.tier.weight || b.pct - a.pct; });

  let html = '<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Profil nutritionnel · par portion de ' + portionG + 'g · % Valeur Quotidienne</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:4px;">';
  items.forEach(function(n) {
    let barWidth = Math.min(n.pct, 100);
    html += '<div style="background:#0f1117;border:1px solid var(--border);border-radius:6px;padding:6px;text-align:center;position:relative;overflow:hidden;' + (n.tier.weight >= 2 ? 'border-color:rgba(74,222,128,0.3);' : '') + '">';
    html += '<div style="font-size:0.7rem;color:var(--text-dim);">' + esc(n.label) + '</div>';
    html += '<div style="font-size:0.85rem;font-weight:700;color:' + n.tier.color + ';">' + n.val + ' ' + esc(n.unit) + '</div>';
    html += '<div style="font-size:0.65rem;color:' + n.tier.color + ';">' + n.pct + '% VQ' + (n.tier.label ? ' · ' + n.tier.label : '') + '</div>';
    if (n.tier.weight > 0) {
      html += '<div style="position:absolute;bottom:0;left:0;height:2px;background:' + n.tier.color + ';width:' + barWidth + '%;opacity:0.6;"></div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return { html: html, items: items };
}

function cnfSuggestHighlights(nutriItems) {
  // Suggest nutrients that are at least "Source" (≥5% DV) per portion
  return nutriItems.filter(function(n) { return n.tier.weight >= 1; }).map(function(n) { return n.label; });
}

function cnfConfirmAdd(food, nutrients, group) {
  function handleAlias(a) { a = a.trim(); if (a && !autoAliases.includes(a)) { autoAliases.push(a); } }

  let N = cnfBuildNutriPer100g(nutrients);
  let guessedCat = guessCategory(food.group_code, nutrients);
  let allCats = (DATA.categories || []).map(function(c) { return '<option value="' + c.id + '"' + (c.id === guessedCat ? ' selected' : '') + '>' + c.name + '</option>'; }).join('');
  let foodName = (food.name_fr ?? food.name_en ?? '').split(',')[0].trim();

  // ─── Auto-populate aliases ───
  let autoAliases = [];
  if (cnfSearchQuery && cnfSearchQuery.toLowerCase() !== foodName.toLowerCase()) { autoAliases.push(cnfSearchQuery); }
  if (food.name_fr && food.name_fr !== foodName) { autoAliases.push(food.name_fr); }
  if (food.name_en && food.name_en.toLowerCase() !== foodName.toLowerCase()) { autoAliases.push(food.name_en); }
  if (food.alt_name_fr) { food.alt_name_fr.split(',').forEach(handleAlias); }
  if (food.alt_name_en) { food.alt_name_en.split(',').forEach(handleAlias); }
  if (food.scientific_name) { autoAliases.push(food.scientific_name); }
  let seen = {};
  autoAliases = autoAliases.filter(function(a) { a = a.toLowerCase(); if (seen[a]) { return false; } seen[a] = true; return true; });

  function renderForm() {
    let catId = $('cnf-add-cat')?.value || guessedCat;
    let portionG = parseInt($('cnf-portion')?.value) || PORTION_GRAMS[catId] || 100;
    let grid = cnfRenderNutriGrid(N, portionG);
    let suggestedHL = cnfSuggestHighlights(grid.items);

    let html = '<div style="background:#12141c;border:1px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:12px;">';
    html += '<label for="cnf-add-name" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Nom</label>';
    html += '<input type="text" id="cnf-add-name" value="' + esc(foodName) + '" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;" aria-label="cnf add name">';

    html += '<div style="display:flex;gap:8px;margin-bottom:12px;">';
    html += '<div style="flex:1;"><label for="cnf-add-cat" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Catégorie</label>';
    html += '<select id="cnf-add-cat" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;">' + allCats + '</select></div>';
    html += '<div style="width:110px;"><label for="cnf-portion" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Portion</label>';
    html += '<div style="display:flex;align-items:center;gap:4px;"><input type="number" id="cnf-portion" value="' + portionG + '" min="1" max="500" style="width:60px;padding:8px 6px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;text-align:center;"><span style="font-size:0.8rem;color:var(--text-dim);">g</span></div></div>';
    html += '</div>';

    html += '<div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:10px;font-style:italic;">📏 1 portion = ' + portionLabel(portionG) + '</div>';

    // Nutrient grid
    html += grid.html;

    // Highlights
    let currentHL = $('cnf-add-highlights')?.value || suggestedHL.join(', ');
    html += '<label for="cnf-add-highlights" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-top:12px;margin-bottom:4px;">Points forts <span style="opacity:0.6;">(≥5% VQ/portion — auto-suggéré)</span></label>';
    html += '<input type="text" id="cnf-add-highlights" value="' + esc(currentHL) + '" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;" aria-label="cnf add highlights">';

    // Aliases
    html += '<label for="cnf-add-aliases" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Noms alternatifs (s\u00e9par\u00e9s par des virgules)</label>';
    html += '<input type="text" id="cnf-add-aliases" value="' + esc(autoAliases.join(', ')) + '" placeholder="ex: cheval, viande de cheval" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;" aria-label="ex: cheval, viande de cheval">';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;">';
    html += '<button class="login-cta" id="cnf-save-btn" style="flex:1;padding:12px;">✓ Ajouter</button>';
    html += '<button id="cnf-back-btn" style="padding:12px 20px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;cursor:pointer;">← Retour</button>';
    html += '</div>';

    $('cnf-details').innerHTML = html;

    // Re-render on category or portion change
    $('cnf-add-cat').addEventListener('change', function() {
      let newCat = this.value;
      let newPortion = PORTION_GRAMS[newCat] || 100;
      let portionInput = $('cnf-portion');
      if (portionInput) portionInput.value = newPortion;
      renderForm.call(this); // re-render with new values
      // Restore focus
      $('cnf-add-cat').focus();
    });
    $('cnf-portion').addEventListener('change', renderForm);
    $('cnf-portion').addEventListener('input', renderForm);

    $('cnf-save-btn').addEventListener('click', function() { cnfSaveToDatabase(food, N); });
    $('cnf-back-btn').addEventListener('click', function() { cnfSelectProduct(cnfSelectedId); });
  }

  renderForm();
}

async function cnfSaveToDatabase(food, nutrition) {
  let name = $('cnf-add-name').value.trim();
  let catId = $('cnf-add-cat').value;
  let highlights = $('cnf-add-highlights').value.trim();
  let aliasesRaw = $('cnf-add-aliases').value.trim();
  let aliases = aliasesRaw ? aliasesRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  if (!name) { showToast('Le nom est requis', 'error'); return; }
  let cat = (DATA.categories || []).find(function(c) { return c.id === catId; });
  if (!cat) { showToast('Catégorie invalide', 'error'); return; }
  if (cat.foods?.some(function(f) { return f.name.toLowerCase() === name.toLowerCase(); })) {
    showToast('Cet aliment existe déjà', 'error'); return;
  }
  let densityScore = Math.round((nutrition.protein * 2 + nutrition.fiber * 3 + nutrition.iron * 2 + nutrition.vit_c + nutrition.calcium * 0.1 + nutrition.omega3 * 10) / 3);
  densityScore = Math.max(10, Math.min(100, densityScore));
  let token = getToken();
  if (!token) { showToast('Session expirée', 'error'); return; }
  $('cnf-save-btn').textContent = 'Sauvegarde…';
  $('cnf-save-btn').disabled = true;
  try {
    let res = await fetchWithTimeout(API + '/admin/food/show', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({
        source_type: 1,
        source_id: food.food_id,
        nf_category: catId,
        name: name,
        density: densityScore,
        highlights: highlights || 'À compléter',
        aliases: aliases
      })
    }, 10000);
    let data = await res.json();
    if (!res.ok) { showToast(data.error || 'Erreur', 'error'); $('cnf-save-btn').textContent = '✓ Ajouter'; $('cnf-save-btn').disabled = false; return; }
    // Reload DATA from server to get the updated list
    let foodsRes = await fetchWithTimeout(API + '/foods', {}, 10000);
    if (foodsRes.ok) { DATA = await foodsRes.json(); }
    $('manage-products-modal').classList.add('hidden');
    showToast(name + ' ajouté!', 'success');
    render();
    updateSaveBar();
  } catch(e) {
    showToast('Erreur: ' + e.message, 'error');
    $('cnf-save-btn').textContent = '✓ Ajouter';
    $('cnf-save-btn').disabled = false;
  }
}

function removeFoodFromCategory(catId, name) {
  adminRemoveFood(catId, name);
}
