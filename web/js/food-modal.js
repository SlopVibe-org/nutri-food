// ─── Food modal module (lazy-loaded) ───

function getAutoAbsorptionTips(n, nutrientsStr, food) {
  let tips = [];
  if (n.iron > 2 && n.vit_c < 5) {
    tips.push({ icon: '💡', text: 'Ajouter vitamine C (citron, poivrons) pour absorber le fer' });
  }
  if (nutrientsStr.includes('lycopène') || food.name.toLowerCase().includes('tomate')) {
    tips.push({ icon: '💡', text: 'Cuire légèrement pour amplifier le lycopène' });
  }
  if (nutrientsStr.includes('β-carotène') || nutrientsStr.includes('beta-carotene') || food.name.toLowerCase().includes('carotte')) {
    tips.push({ icon: '💡', text: 'Cuire avec un corps gras pour absorber le β-carotène' });
  }
  if ((nutrientsStr.includes('vit c') || n.vit_c > 20) && food.name.toLowerCase().includes('poivron')) {
    tips.push({ icon: '💡', text: 'Manger cru pour préserver la vitamine C' });
  }
  return tips;
}

function getCombinationTips(n, nutrientsStr) {
  let tips = [];
  if (n.iron > 1) {
    tips.push({ icon: '🔗', text: 'Fer + Vitamine C (agrumes, poivrons) = meilleure absorption' });
  }
  if (nutrientsStr.includes('vit a') || nutrientsStr.includes('vit d') || nutrientsStr.includes('vit e') || nutrientsStr.includes('vit k')) {
    tips.push({ icon: '🔗', text: 'Vit. liposolubles + bons gras (huile d\'olive, avocat) = +absorption' });
  }
  if (n.omega3 > 0.5 || nutrientsStr.includes('oméga') || nutrientsStr.includes('omega')) {
    tips.push({ icon: '🔗', text: 'Oméga-3 + antioxydants (thé vert, baies) = effet synergique' });
  }
  if (n.calcium > 50) {
    tips.push({ icon: '🔗', text: 'Calcium + Vitamine D (soleil, poisson gras) = +absorption' });
  }
  return tips;
}

function getWarningTips(n) {
  let tips = [];
  if (n.iron > 1) {
    tips.push({ icon: '⚠️', text: 'Thé/café éloignés des repas = inhibe l\'absorption du fer' });
  }
  if (n.calcium > 50 && n.fiber > 5) {
    tips.push({ icon: '⚠️', text: 'Excès de fibres avec calcium = absorption réduite' });
  }
  if (n.vit_c > 20) {
    tips.push({ icon: '⚠️', text: 'Cuisson à très haute température détruit la vitamine C' });
  }
  return tips;
}

function getNutritionTips(food) {
  let n = food.nutrition || {};
  let nutrientsStr = (food.nutrients || '').toLowerCase();

  let tips = [];

  // ─── Absorption tips (from food.absorption or auto-generated) ───
  if (food.absorption) {
    tips.push({ icon: '💡', text: food.absorption });
  } else {
    tips = tips.concat(getAutoAbsorptionTips(n, nutrientsStr, food));
  }

  // ─── Combination suggestions ───
  tips = tips.concat(getCombinationTips(n, nutrientsStr));

  // ─── Warnings ───
  tips = tips.concat(getWarningTips(n));

  return tips;
}

function renderFoodNutritionHTML(n) {
  if (!n) { return ''; }
  let rows = [
    { val: n.protein, label: 'Protéines', unit: 'g' },
    { val: n.fiber, label: 'Fibres', unit: 'g' },
    { val: n.iron, label: 'Fer', unit: 'mg' },
    { val: n.vit_c, label: 'Vit C', unit: 'mg' },
    { val: n.calcium, label: 'Calcium', unit: 'mg' },
    { val: n.omega3, label: 'Oméga-3', unit: 'g' },
    { val: n.calories, label: 'Calories', unit: '' }
  ];
  let html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">';
  rows.forEach(function(r) {
    if (r.val) {
      let display = r.label === 'Calories' ? Math.round(r.val) : r.val + r.unit;
      html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">' + r.label + '</span><br><strong>' + display + '</strong></div>';
    }
  });
  html += '</div>';
  return html;
}

function renderFoodSeasonHTML(food, month) {
  if (!food.season || food.season.length === 0) { return ''; }
  if (food.season.includes(month)) {
    return '<div style="margin-bottom:8px;"><span class="season-badge in-season">🌱 De saison</span></div>';
  }
  if (food.import_season?.includes(month)) {
    return '<div style="margin-bottom:8px;"><span class="season-badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);">✈️ Importé</span></div>';
  }
  return '';
}

function renderFoodTipsHTML(food, cat) {
  let html = '';
  let tips = getNutritionTips(food);
  if (tips.length > 0) {
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">';
    tips.forEach(function(t) {
      html += '<div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;margin-top:4px;">' + t.icon + ' ' + esc(t.text) + '</div>';
    });
    html += '</div>';
  }
  if (cat.tips) {
    if (cat.tips.absorption) { html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><div style="color:var(--accent);font-weight:600;margin-bottom:2px;">💡 Absorption</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(cat.tips.absorption) + '</div></div>'; }
    if (cat.tips.warnings) { html += '<div style="margin-top:6px;"><div style="color:var(--accent-amber);font-weight:600;margin-bottom:2px;">⚠ Attention</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(cat.tips.warnings) + '</div></div>'; }
  }
  if (food.tips) {
    if (food.tips.absorption) { html += '<div style="margin-top:6px;"><div style="color:var(--accent);font-weight:600;margin-bottom:2px;">💡 Spécifique</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(food.tips.absorption) + '</div></div>'; }
    if (food.tips.warnings) { html += '<div style="margin-top:6px;"><div style="color:var(--accent-amber);font-weight:600;margin-bottom:2px;">⚠ Spécifique</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(food.tips.warnings) + '</div></div>'; }
  }
  return html;
}

function renderFoodDealsHTML(food) {
  let deals = (DEALS[food.name] || []).slice().sort(function(a,b) { return (a.price||0) - (b.price||0); });
  if (deals.length === 0) { return ''; }
  let html = '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);">';
  html += '<h3 id="deals-toggle" style="margin:0;cursor:pointer;user-select:none;display:flex;align-items:center;gap:4px;">🏷️ Voir les spéciaux (' + deals.length + ') <span id="deals-arrow" style="font-size:0.7rem;">▼</span></h3>';
  html += '<div id="deals-content" style="display:none;margin-top:8px;">';
  deals.forEach(function(d) {
    let si = STORE_META[d.store] || {};
    let color = si.color || '#666';
    let sn = si.name || d.store || '?';
    let letter = sn.charAt(0).toUpperCase();
    html += '<div style="border-left:3px solid ' + color + ';padding-left:10px;margin-left:4px;margin-bottom:8px;">';
    html += '<div style="font-weight:600;">' + esc(d.name || food.name) + '</div>';
    html += '<div style="font-size:1.05rem;color:var(--accent);font-weight:700;margin:2px 0;">' + (d.price || '') + '$</div>';
    if (d.size) { html += '<div style="font-size:0.78rem;color:var(--text-dim);">Format: ' + esc(d.size) + '</div>'; }
    html += '<div style="font-size:0.82rem;"><span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:' + color + ';color:#fff;font-size:0.65rem;font-weight:700;margin-right:4px;">' + letter + '</span>' + esc(sn) + '</div>';
    if (d.link) { html += '<a href="' + esc(d.link) + '" target="_blank" rel="noopener" style="font-size:0.82rem;color:var(--accent);">Voir sur le site →</a>'; }
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function openFoodModal(catId, name) {
  let cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) { return; }
  let food = cat.foods.find(function(f) { return f.name === name; });
  if (!food) { return; }
  $('suggestions-title').textContent = '📋 Informations nutritionnelles';
  let alsoIn = [];
  DATA.categories.forEach(function(c) {
    if (c.id !== catId && c.foods.some(function(f) { return f.name === name; })) { alsoIn.push(c.icon + ' ' + c.name); }
  });
  let month = new Date().getMonth() + 1;
  let html = '<h2 style="margin-bottom:4px;">' + esc(food.name) + '</h2>';
  html += '<div style="color:var(--accent);font-weight:700;margin-bottom:8px;">Densité nutritionnelle: ' + food.density + '%</div>';
  if (food.nutrients) { html += '<div style="margin-bottom:8px;color:var(--text);">' + food.nutrients + '</div>'; }
  html += renderFoodNutritionHTML(food.nutrition);
  html += renderFoodSeasonHTML(food, month);
  html += renderFoodTipsHTML(food, cat);
  html += renderFoodDealsHTML(food);
  if (alsoIn.length > 0) { html += '<div style="font-size:0.82rem;color:var(--text-dim);margin-top:8px;">Aussi dans: ' + alsoIn.join(', ') + '</div>'; }
  // Show in suggestions modal (reuse)
  let content = document.getElementById('suggestions-content');
  if (content) {
    content.innerHTML = html;
    document.getElementById('suggestions-modal').classList.remove('hidden');
  }
}
