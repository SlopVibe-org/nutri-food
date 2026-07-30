// ─── Food modal module (lazy-loaded) ───

var tooltipEl = null;

function getNutritionTips(food) {
  var tips = [];
  var n = food.nutrition || {};
  var nutrientsStr = (food.nutrients || '').toLowerCase();

  // ─── Absorption tips (from food.absorption or auto-generated) ───
  if (food.absorption) {
    tips.push({ icon: '💡', text: food.absorption });
  } else {
    // Auto-generate based on nutrition profile
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
  }

  // ─── Combination suggestions ───
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

  // ─── Warnings ───
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

function renderFoodNutritionHTML(n) {
  if (!n) return '';
  var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">';
  if (n.protein) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Protéines</span><br><strong>' + n.protein + 'g</strong></div>';
  if (n.fiber) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Fibres</span><br><strong>' + n.fiber + 'g</strong></div>';
  if (n.iron) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Fer</span><br><strong>' + n.iron + 'mg</strong></div>';
  if (n.vit_c) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Vit C</span><br><strong>' + n.vit_c + 'mg</strong></div>';
  if (n.calcium) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Calcium</span><br><strong>' + n.calcium + 'mg</strong></div>';
  if (n.omega3) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Oméga-3</span><br><strong>' + n.omega3 + 'g</strong></div>';
  if (n.calories) html += '<div style="background:#12141c;padding:6px 10px;border-radius:6px;border:1px solid var(--border);"><span style="color:var(--text-dim);font-size:0.75rem;">Calories</span><br><strong>' + Math.round(n.calories) + '</strong></div>';
  html += '</div>';
  return html;
}

function renderFoodSeasonHTML(food, month) {
  if (!food.season || food.season.length === 0) return '';
  if (food.season.includes(month)) {
    return '<div style="margin-bottom:8px;"><span class="season-badge in-season">🌱 De saison</span></div>';
  }
  if (food.import_season && food.import_season.includes(month)) {
    return '<div style="margin-bottom:8px;"><span class="season-badge" style="background:rgba(56,189,248,0.15);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);">✈️ Importé</span></div>';
  }
  return '';
}

function renderFoodTipsHTML(food, cat) {
  var html = '';
  var tips = getNutritionTips(food);
  if (tips.length > 0) {
    html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">';
    tips.forEach(function(t) {
      html += '<div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;margin-top:4px;">' + t.icon + ' ' + esc(t.text) + '</div>';
    });
    html += '</div>';
  }
  if (cat.tips) {
    if (cat.tips.absorption) html += '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><div style="color:var(--accent);font-weight:600;margin-bottom:2px;">💡 Absorption</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(cat.tips.absorption) + '</div></div>';
    if (cat.tips.warnings) html += '<div style="margin-top:6px;"><div style="color:var(--accent-amber);font-weight:600;margin-bottom:2px;">⚠ Attention</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(cat.tips.warnings) + '</div></div>';
  }
  if (food.tips) {
    if (food.tips.absorption) html += '<div style="margin-top:6px;"><div style="color:var(--accent);font-weight:600;margin-bottom:2px;">💡 Spécifique</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(food.tips.absorption) + '</div></div>';
    if (food.tips.warnings) html += '<div style="margin-top:6px;"><div style="color:var(--accent-amber);font-weight:600;margin-bottom:2px;">⚠ Spécifique</div><div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">' + esc(food.tips.warnings) + '</div></div>';
  }
  return html;
}

function renderFoodDealsHTML(food) {
  var deals = (DEALS[food.name] || []).slice().sort(function(a,b) { return (a.price||0) - (b.price||0); });
  if (deals.length === 0) return '';
  var html = '<div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);">';
  html += '<h3 id="deals-toggle" style="margin:0;cursor:pointer;user-select:none;display:flex;align-items:center;gap:4px;">🏷️ Voir les spéciaux (' + deals.length + ') <span id="deals-arrow" style="font-size:0.7rem;">▼</span></h3>';
  html += '<div id="deals-content" style="display:none;margin-top:8px;">';
  deals.forEach(function(d) {
    var si = STORE_META[d.store] || {};
    var color = si.color || '#666';
    var sn = si.name || d.store || '?';
    var letter = sn.charAt(0).toUpperCase();
    html += '<div style="border-left:3px solid ' + color + ';padding-left:10px;margin-left:4px;margin-bottom:8px;">';
    html += '<div style="font-weight:600;">' + esc(d.name || food.name) + '</div>';
    html += '<div style="font-size:1.05rem;color:var(--accent);font-weight:700;margin:2px 0;">' + (d.price || '') + '$</div>';
    if (d.size) html += '<div style="font-size:0.78rem;color:var(--text-dim);">Format: ' + esc(d.size) + '</div>';
    html += '<div style="font-size:0.82rem;"><span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:' + color + ';color:#fff;font-size:0.65rem;font-weight:700;margin-right:4px;">' + letter + '</span>' + esc(sn) + '</div>';
    if (d.link) html += '<a href="' + esc(d.link) + '" target="_blank" rel="noopener" style="font-size:0.82rem;color:var(--accent);">Voir sur le site →</a>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function openFoodModal(catId, name) {
  var cat = DATA.categories.find(function(c) { return c.id === catId; });
  if (!cat) return;
  var food = cat.foods.find(function(f) { return f.name === name; });
  if (!food) return;
  $('suggestions-title').textContent = '📋 Informations nutritionnelles';
  var alsoIn = [];
  DATA.categories.forEach(function(c) {
    if (c.id !== catId && c.foods.some(function(f) { return f.name === name; })) alsoIn.push(c.icon + ' ' + c.name);
  });
  var month = new Date().getMonth() + 1;
  var html = '<h2 style="margin-bottom:4px;">' + esc(food.name) + '</h2>';
  html += '<div style="color:var(--accent);font-weight:700;margin-bottom:8px;">Densité nutritionnelle: ' + food.density + '%</div>';
  if (food.nutrients) html += '<div style="margin-bottom:8px;color:var(--text);">' + food.nutrients + '</div>';
  html += renderFoodNutritionHTML(food.nutrition);
  html += renderFoodSeasonHTML(food, month);
  html += renderFoodTipsHTML(food, cat);
  html += renderFoodDealsHTML(food);
  if (alsoIn.length > 0) html += '<div style="font-size:0.82rem;color:var(--text-dim);margin-top:8px;">Aussi dans: ' + alsoIn.join(', ') + '</div>';
  // Show in suggestions modal (reuse)
  var content = document.getElementById('suggestions-content');
  if (content) {
    content.innerHTML = html;
    document.getElementById('suggestions-modal').classList.remove('hidden');
  }
}
