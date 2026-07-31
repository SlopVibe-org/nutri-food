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

function cnfConfirmAdd(food, nutrients, group) {
  function handleAlias(a) { a = a.trim(); if (a && !autoAliases.includes(a)) { autoAliases.push(a); } }
  let nutriMap = {};
  nutrients.forEach(function(n) { nutriMap[n.code] = n; });

  // ─── Build full nutrition profile (per 100g, CNF standard) ───
  let N = {};
  function amt(code) { let v = nutriMap[code]?.amount ?? 0; return Math.round(v * 100) / 100; }
  N.protein    = amt(203);
  N.fiber      = amt(291);
  N.iron       = amt(303);
  N.vit_c      = amt(401);
  N.calcium    = amt(301);
  N.omega3     = Math.round(((nutriMap[629]?.amount ?? 0) + (nutriMap[621]?.amount ?? 0) + (nutriMap[631]?.amount ?? 0) + (nutriMap[851]?.amount ?? 0)) * 1000) / 1000;
  N.b12        = amt(418);
  N.vit_d      = amt(328);
  N.selenium   = amt(317);
  N.vit_k      = amt(430);
  N.manganese  = amt(315);
  N.zinc       = amt(309);
  N.potassium  = amt(306);
  N.magnesium  = amt(304);
  N.phosphorus = amt(305);
  N.folate     = amt(435);
  N.vit_e      = amt(323);
  N.niacin     = amt(406);
  N.b6         = amt(415);
  N.thiamine   = amt(404);
  N.riboflavin = amt(405);
  N.copper     = amt(312);
  N.pantothenic = amt(410);

  // ─── Auto-detect highlights (≥10% Daily Value per 100g) ───
  // DV thresholds based on Canadian Daily Values
  let HL = [
    { key: 'protein',    label: 'Protéine',  dv: 50,   unit: 'g' },
    { key: 'fiber',      label: 'Fibres',    dv: 25,   unit: 'g' },
    { key: 'iron',       label: 'Fer',       dv: 14,   unit: 'mg' },
    { key: 'vit_c',      label: 'Vit C',     dv: 60,   unit: 'mg' },
    { key: 'calcium',    label: 'Calcium',   dv: 1100, unit: 'mg' },
    { key: 'omega3',     label: 'Ω-3',       dv: 1.1,  unit: 'g' },
    { key: 'b12',        label: 'B12',       dv: 0.0024, unit: 'mg' },
    { key: 'vit_d',      label: 'Vit D',     dv: 0.015,  unit: 'mg' },
    { key: 'selenium',   label: 'Sélénium',  dv: 0.055,  unit: 'mg' },
    { key: 'vit_k',      label: 'Vit K',     dv: 0.12,   unit: 'mg' },
    { key: 'manganese',  label: 'Manganèse', dv: 2.3,  unit: 'mg' },
    { key: 'zinc',       label: 'Zinc',      dv: 11,   unit: 'mg' },
    { key: 'potassium',  label: 'Potassium', dv: 4700, unit: 'mg' },
    { key: 'magnesium',  label: 'Magnésium', dv: 200,  unit: 'mg' },
    { key: 'phosphorus', label: 'Phosphore', dv: 700,  unit: 'mg' },
    { key: 'folate',     label: 'Folate',    dv: 0.4,  unit: 'mg' },
    { key: 'vit_e',      label: 'Vit E',     dv: 15,   unit: 'mg' },
    { key: 'niacin',     label: 'Niacine',   dv: 14,   unit: 'mg' },
    { key: 'b6',         label: 'B6',        dv: 1.3,  unit: 'mg' },
    { key: 'thiamine',   label: 'Thiamine',  dv: 1.2,  unit: 'mg' },
    { key: 'riboflavin', label: 'Riboflavine', dv: 1.1, unit: 'mg' },
    { key: 'copper',     label: 'Cuivre',    dv: 0.9,  unit: 'mg' },
    { key: 'pantothenic',label: 'Acide pantothénique', dv: 5, unit: 'mg' }
  ];

  let highlights = [];
  let allNutriItems = [];
  HL.forEach(function(h) {
    let val = N[h.key];
    if (val > 0) {
      let pctDV = Math.round((val / h.dv) * 100);
      allNutriItems.push({ label: h.label, val: val, unit: h.unit, pct: pctDV });
      if (pctDV >= 10) { highlights.push(h.label); }
    }
  });
  // Sort by %DV descending
  allNutriItems.sort(function(a, b) { return b.pct - a.pct; });

  let guessedCat = guessCategory(food.group_code, nutrients);
  let allCats = (DATA.categories || []).map(function(c) { return '<option value="' + c.id + '"' + (c.id === guessedCat ? ' selected' : '') + '>' + c.name + '</option>'; }).join('');
  let foodName = (food.name_fr ?? food.name_en ?? '').split(',')[0].trim();

  let html = '<div style="background:#12141c;border:1px solid var(--accent);border-radius:10px;padding:14px;margin-bottom:12px;">';
  html += '<label for="cnf-add-name" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Nom</label>';
  html += '<input type="text" id="cnf-add-name" value="' + esc(foodName) + '" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;" aria-label="cnf add name">';
  html += '<label for="cnf-add-cat" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Catégorie</label>';
  html += '<select id="cnf-add-cat" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;">' + allCats + '</select>';

  // ─── Nutrient profile grid (sorted by %DV) ───
  html += '<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:6px;">Profil nutritionnel (per 100g · % VQ)</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px;">';
  allNutriItems.forEach(function(n) {
    let barColor = n.pct >= 20 ? 'var(--accent)' : (n.pct >= 10 ? 'rgba(74,222,128,0.7)' : 'var(--text-dim)');
    let barWidth = Math.min(n.pct, 100);
    html += '<div style="background:#0f1117;border:1px solid var(--border);border-radius:6px;padding:6px;text-align:center;position:relative;overflow:hidden;">';
    html += '<div style="font-size:0.7rem;color:var(--text-dim);">' + esc(n.label) + '</div>';
    html += '<div style="font-size:0.85rem;font-weight:700;color:' + barColor + ';">' + n.val + ' ' + esc(n.unit) + '</div>';
    html += '<div style="font-size:0.65rem;color:' + barColor + ';">' + n.pct + '% VQ</div>';
    if (n.pct >= 10) {
      html += '<div style="position:absolute;bottom:0;left:0;height:2px;background:' + barColor + ';width:' + barWidth + '%;"></div>';
    }
    html += '</div>';
  });
  html += '</div>';

  // ─── Highlights field (auto-suggested) ───
  html += '<label for="cnf-add-highlights" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Points forts <span style="opacity:0.6;">(≥10% VQ — auto-suggéré)</span></label>';
  html += '<input type="text" id="cnf-add-highlights" value="' + esc(highlights.join(', ')) + '" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;" aria-label="cnf add highlights">';

  // ─── Aliases ───
  html += '<label for="cnf-add-aliases" style="font-size:0.78rem;color:var(--text-dim);display:block;margin-bottom:4px;">Noms alternatifs (s\u00e9par\u00e9s par des virgules)</label>';
  let autoAliases = [];
  if (cnfSearchQuery && cnfSearchQuery.toLowerCase() !== foodName.toLowerCase()) { autoAliases.push(cnfSearchQuery); }
  if (food.name_fr && food.name_fr !== foodName) { autoAliases.push(food.name_fr); }
  if (food.name_en && food.name_en.toLowerCase() !== foodName.toLowerCase()) { autoAliases.push(food.name_en); }
  if (food.alt_name_fr) { food.alt_name_fr.split(',').forEach(handleAlias); }
  if (food.alt_name_en) { food.alt_name_en.split(',').forEach(handleAlias); }
  if (food.scientific_name) { autoAliases.push(food.scientific_name); }
  let seen = {};
  autoAliases = autoAliases.filter(function(a) { a = a.toLowerCase(); if (seen[a]) { return false; } seen[a] = true; return true; });
  html += '<input type="text" id="cnf-add-aliases" value="' + esc(autoAliases.join(', ')) + '" placeholder="ex: cheval, viande de cheval" style="width:100%;padding:8px 10px;background:#0f1117;color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:0.9rem;margin-bottom:12px;" aria-label="ex: cheval, viande de cheval">';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;">';
  html += '<button class="login-cta" id="cnf-save-btn" style="flex:1;padding:12px;">✓ Ajouter</button>';
  html += '<button id="cnf-back-btn" style="padding:12px 20px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;cursor:pointer;">← Retour</button>';
  html += '</div>';
  $('cnf-details').innerHTML = html;
  $('cnf-save-btn').addEventListener('click', function() { cnfSaveToDatabase(food, N); });
  $('cnf-back-btn').addEventListener('click', function() { cnfSelectProduct(cnfSelectedId); });
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
