// ─── Deals module (lazy-loaded) ───

var STORE_ICONS = {};

function showDealsPage() {
  $('deals-modal').classList.remove('hidden');
  renderDealsContent();
}

function flattenDeals() {
  var allDeals = [];
  Object.keys(DEALS).forEach(function(foodName) {
    var cat = null;
    DATA.categories.forEach(function(c) {
      if (c.foods.find(function(f) { return f.name === foodName; })) cat = c;
    });
    DEALS[foodName].forEach(function(deal) {
      allDeals.push({
        foodName: foodName,
        catName: cat ? cat.name : 'Autre',
        catIcon: cat ? cat.icon : '📦',
        dealName: deal.name,
        store: deal.store || '',
        price: deal.price || 0,
        size: deal.size || '',
        unitPrice: (deal.unit_price && deal.unit_price.value) ? deal.unit_price.value : null,
        unitLabel: (deal.unit_price && deal.unit_price.unit) ? deal.unit_price.unit : '',
        link: deal.link || '#'
      });
    });
  });
  allDeals.sort(function(a, b) {
    if (a.unitPrice && b.unitPrice) return a.unitPrice - b.unitPrice;
    if (a.unitPrice) return -1;
    if (b.unitPrice) return 1;
    return a.price - b.price;
  });
  return allDeals;
}

function groupDealsByCategory(allDeals) {
  var grouped = {};
  allDeals.forEach(function(d) {
    if (!grouped[d.catName]) grouped[d.catName] = { icon: d.catIcon, items: [] };
    grouped[d.catName].items.push(d);
  });
  return grouped;
}

function renderDealsContent() {
  var content = $('deals-content');
  if (!DATA) { content.innerHTML = '<p class="loading">Chargement…</p>'; return; }
  var allDeals = flattenDeals();
  if (allDeals.length === 0) {
    content.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-dim);">Aucun spécial disponible actuellement.</p>';
    return;
  }
  var grouped = groupDealsByCategory(allDeals);
  // Store icons
  STORE_ICONS = {
    'iga': '<img src="favicon-iga.png" alt="IGA" style="width:24px;height:24px;vertical-align:middle;" loading="lazy">',
    'metro': '<img src="favicon-metro.png" alt="Metro" style="width:24px;height:24px;vertical-align:middle;" loading="lazy">',
    'superc': '<img src="favicon-superc.png" alt="Super C" style="width:24px;height:24px;vertical-align:middle;" loading="lazy">',
    'maxi': '<img src="favicon-maxi.png" alt="Maxi" style="width:32px;height:32px;vertical-align:middle;" loading="lazy">',
    'provigo': '<img src="favicon-provigo.png" alt="Provigo" style="width:24px;height:24px;vertical-align:middle;" loading="lazy">',
    'walmart': '<img src="favicon-walmart.png" alt="Walmart" style="width:24px;height:24px;vertical-align:middle;" loading="lazy">'
  };
  // Render
  var html = '';
  // Refresh button (admin only)
  if (currentUser && currentUser.is_admin) {
    html += '<div style="text-align:right;margin-bottom:8px;"><button id="deals-refresh-btn" class="dt-add-btn">🔄 Rafraîchir</button></div>';
  }
  Object.keys(grouped).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(catName) {
    var g = grouped[catName];
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:0.85rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + g.icon + ' ' + esc(catName) + '</div>';
    html += '<table class="deals-table"><thead><tr>';
    html += '<th>Produit</th><th>Magasin</th><th>Prix</th><th>Rabais</th><th></th>';
    html += '</tr></thead><tbody>';
    g.items.forEach(function(d) {
      var storeIcon = STORE_ICONS[d.store.toLowerCase()] || '🏷️';
      var storeSites = { 'iga': 'iga.ca', 'metro': 'metro.ca', 'superc': 'superc.ca', 'maxi': 'maxi.ca', 'provigo': 'provigo.ca', 'walmart': 'walmart.ca' };
      var storeFull = storeSites[d.store.toLowerCase()] || d.store;
      var priceTooltip = esc(d.size) + ' — ' + (d.price ? d.price.toFixed(2) + '$' : '') + (d.unitPrice ? ' — ' + d.unitPrice.toFixed(2) + '$/' + esc(d.unitLabel) : '');
      html += '<tr style="cursor:pointer;" data-deal-link="' + esc(d.link) + '">';
      html += '<td class="dt-name" title="' + esc(d.dealName) + '">' + esc(d.foodName) + '</td>';
      html += '<td class="dt-store" style="cursor:help;"><a href="https://www.' + esc(storeFull) + '" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;" title="' + esc(d.store) + ' — ' + esc(storeFull) + '">' + storeIcon + '</a></td>';
      html += '<td class="dt-price" style="cursor:help;" title="' + priceTooltip + '">' + (d.price ? d.price.toFixed(2) + '$' : '-') + (d.size ? '<br><span class="dt-size">' + esc(d.size) + '</span>' : '') + '</td>';
      html += '<td class="dt-unit" style="cursor:help;" title="' + priceTooltip + '">' + (d.unitPrice ? d.unitPrice.toFixed(2) + '$/' + esc(d.unitLabel) : '-') + '</td>';
      html += '<td onclick="event.stopPropagation();"><button class="dt-add-btn" data-deal-add="' + esc(d.foodName) + '">+</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
  });
  content.innerHTML = html;
  // Wire refresh button
  var refreshBtn = $('deals-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async function() {
      refreshBtn.disabled = true; refreshBtn.textContent = '⏳ Patientez…';
      await refreshDeals();
      renderDealsContent();
    });
  }
  // Wire row clicks → open product page
  content.querySelectorAll('[data-deal-link]').forEach(function(row) {
    row.addEventListener('click', function() {
      var link = row.dataset.dealLink.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      if (link && link !== '#') window.open(link, '_blank', 'noopener');
    });
  });
  // Wire add buttons
  content.querySelectorAll('[data-deal-add]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var foodName = btn.dataset.dealAdd.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      var foundCat = null, foundFood = null;
      DATA.categories.forEach(function(c) {
        var f = c.foods.find(function(x) { return x.name === foodName; });
        if (f) { foundCat = c; foundFood = f; }
      });
      if (foundCat && foundFood) {
        addItem(foundCat.id, foundFood);
        btn.textContent = '✓';
        btn.disabled = true;
        setTimeout(function() { btn.textContent = '+'; btn.disabled = false; }, 2000);
      }
    });
  });
}

async function loadDeals() {
  try {
    var res = await fetchWithTimeout(API + '/deals', {}, 10000);
    if (!res.ok) return;
    var data = await res.json();
    DEALS = data.deals || {};
    STORE_META = data.stores || {};
    // Filter out pet food / non-human food
    var PET_KEYWORDS = ['chat', 'chien', 'animal', 'pâtée', 'patée', 'pet food', 'animal food', 'kitten', 'puppy', 'wet food', 'dry food', 'croquettes'];
    function isPetFood(name) {
      var lower = (name || '').toLowerCase();
      return PET_KEYWORDS.some(function(kw) { return lower.includes(kw); });
    }
    Object.keys(DEALS).forEach(function(food) {
      DEALS[food] = DEALS[food].filter(function(d) {
        return !isPetFood(d.name);
      });
      if (DEALS[food].length === 0) delete DEALS[food];
    });
  } catch(e) { console.error('[NutriFood] Deals load error:', e); }
}

async function refreshDeals() {
  var token = getToken();
  if (!token) return;
  var btn = document.getElementById('menu-refresh-deals');
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    var res = await fetchWithTimeout(API + '/deals/refresh', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    }, 30000);
    if (res.ok) {
      var data = await res.json();
      var count = data.count || 0;
      showToast(count + ' spéciaux mis à jour', 'success');
      await loadDeals();
      render();
    } else {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  } catch(e) {
    console.error('[NutriFood] Deals refresh error:', e);
    showToast('Erreur: ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Spéciaux'; }
}

// Helper: build deal badges HTML for a food name
function buildDealBadges(foodName) {
  var deals = DEALS[foodName];
  if (!deals || deals.length === 0) return '';
  var sorted = deals.slice().sort(function(a, b) { return (a.price || 0) - (b.price || 0); });
  var maxShow = 3;
  var shown = sorted.slice(0, maxShow);
  var extra = sorted.length > maxShow ? sorted.length - maxShow : 0;
  var html = '<span class="deal-badges" data-deal-food="' + esc(foodName) + '">';
  html += '\uD83C\uDFF7\uFE0F';
  shown.forEach(function(d) {
    var storeInfo = STORE_META[d.store] || {};
    var color = storeInfo.color || '#666';
    var letter = (storeInfo.name || d.store || '?').charAt(0).toUpperCase();
    html += '<span class="deal-badge" style="background:' + color + ';" title="' + esc(d.name || '') + ' — ' + (d.price || '') + '$">' + letter + '</span>';
  });
  if (extra > 0) html += '<span class="deal-badges-extra deal-show-all" data-deal-food="' + esc(foodName) + '" style="cursor:pointer;text-decoration:underline;" title="Voir tous les spéciaux">+' + extra + '</span>';
  html += '</span>';
  return html;
}

// Deal modal: click 'voir plus' opens full list in suggestions modal
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-deal-modal-food]');
  if (!el) return;
  var foodName = el.dataset.dealModalFood.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  var deals = (DEALS[foodName] || []).slice().sort(function(a,b) { return (a.price||0) - (b.price||0); });
  if (deals.length === 0) return;
  var mHtml = '<div class="ct-title">\uD83C\uDFF7\uFE0F ' + esc(foodName) + ' \u2014 ' + deals.length + ' sp\u00e9ciaux</div>';
  deals.forEach(function(d) {
    var si = STORE_META[d.store] || {};
    var color = si.color || '#666';
    var sn = si.name || d.store || '?';
    var letter = sn.charAt(0).toUpperCase();
    mHtml += '<div class="ct-deal-item" style="border-left:3px solid ' + color + ';padding-left:8px;margin-left:4px;margin-bottom:8px;">';
    mHtml += '<div class="ct-deal-name">' + esc(d.name || foodName) + '</div>';
    mHtml += '<div class="ct-deal-price">' + (d.price || '') + '$</div>';
    if (d.size) mHtml += '<div class="ct-deal-meta">Format: ' + esc(d.size) + '</div>';
    mHtml += '<div class="ct-deal-store"><span class="ct-deal-store-badge" style="background:' + color + ';">' + letter + '</span> ' + esc(sn) + '</div>';
    if (d.link) mHtml += '<a class="ct-deal-link" href="' + esc(d.link) + '" target="_blank" rel="noopener">Voir sur le site →</a>';
    mHtml += '</div>';
  });
  var content = document.getElementById('suggestions-content');
  if (content) {
    content.innerHTML = mHtml;
    document.getElementById('suggestions-modal').classList.remove('hidden');
  }
});
