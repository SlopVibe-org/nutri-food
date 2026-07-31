// ─── Deals module (lazy-loaded) ───

/* global DEALS, STORE_META */
let STORE_ICONS = {};
const PET_KEYWORDS = ['chat', 'chien', 'animal', 'pâtée', 'patée', 'pet food', 'animal food', 'kitten', 'puppy', 'wet food', 'dry food', 'croquettes'];

function isPetFood(name) {
  let lower = (name || '').toLowerCase();
  return PET_KEYWORDS.some(function(kw) { return lower.includes(kw); });
}

function showDealsPage() {
  $('deals-modal').classList.remove('hidden');
  renderDealsContent();
}

function findCategoryForFood(foodName) {
  return DATA.categories.find(function(c) {
    return c.foods.some(function(f) { return f.name === foodName; });
  });
}

function flattenDeals() {
  let allDeals = [];
  Object.keys(DEALS).forEach(function(foodName) {
    let cat = findCategoryForFood(foodName);
    DEALS[foodName].forEach(function(deal) {
      allDeals.push({
        foodName: foodName,
        catName: cat ? cat.name : 'Autre',
        catIcon: cat ? cat.icon : '📦',
        dealName: deal.name,
        store: deal.store || '',
        price: deal.price || 0,
        size: deal.size || '',
        unitPrice: deal.unit_price?.value || null,
        unitLabel: deal.unit_price?.unit || '',
        link: deal.link || '#'
      });
    });
  });
  allDeals.sort(function(a, b) {
    if (a.unitPrice && b.unitPrice) { return a.unitPrice - b.unitPrice; }
    if (a.unitPrice) { return -1; }
    if (b.unitPrice) { return 1; }
    return a.price - b.price;
  });
  return allDeals;
}

function groupDealsByCategory(allDeals) {
  let grouped = {};
  allDeals.forEach(function(d) {
    if (!grouped[d.catName]) { grouped[d.catName] = { icon: d.catIcon, items: [] }; }
    grouped[d.catName].items.push(d);
  });
  return grouped;
}

function renderDealsContent() {
  let content = $('deals-content');
  if (!DATA) { content.innerHTML = '<p class="loading">Chargement…</p>'; return; }
  let allDeals = flattenDeals();
  if (allDeals.length === 0) {
    content.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-dim);">Aucun spécial disponible actuellement.</p>';
    return;
  }
  let grouped = groupDealsByCategory(allDeals);
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
  let html = '';
  // Refresh button (admin only)
  if (currentUser?.is_admin) {
    html += '<div style="text-align:right;margin-bottom:8px;"><button id="deals-refresh-btn" class="dt-add-btn">🔄 Rafraîchir</button></div>';
  }
  Object.keys(grouped).sort(function(a, b) { return a.localeCompare(b); }).forEach(function(catName) {
    let g = grouped[catName];
    html += '<div style="margin-bottom:16px;">';
    html += '<div style="font-size:0.85rem;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">' + g.icon + ' ' + esc(catName) + '</div>';
    html += '<table class="deals-table"><thead><tr>';
    html += '<th>Produit</th><th>Magasin</th><th>Prix</th><th>Rabais</th><th></th>';
    html += '</tr></thead><tbody>';
    g.items.forEach(function(d) {
      let storeIcon = STORE_ICONS[d.store.toLowerCase()] || '🏷️';
      let storeSites = { 'iga': 'iga.ca', 'metro': 'metro.ca', 'superc': 'superc.ca', 'maxi': 'maxi.ca', 'provigo': 'provigo.ca', 'walmart': 'walmart.ca' };
      let storeFull = storeSites[d.store.toLowerCase()] || d.store;
      let priceTooltip = esc(d.size) + ' — ' + (d.price ? d.price.toFixed(2) + '$' : '') + (d.unitPrice ? ' — ' + d.unitPrice.toFixed(2) + '$/' + esc(d.unitLabel) : '');
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
  let refreshBtn = $('deals-refresh-btn');
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
      let link = row.dataset.dealLink.decodeEntities();
      if (link && link !== '#') { window.open(link, '_blank', 'noopener'); }
    });
  });
  // Wire add buttons
  content.querySelectorAll('[data-deal-add]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      let foodName = btn.dataset.dealAdd.decodeEntities();
      let foundCat = null, foundFood = null;
      DATA.categories.forEach(function(c) {
        let f = c.foods.find(function(x) { return x.name === foodName; });
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
    let res = await fetchWithTimeout(API + '/deals', {}, 10000);
    if (!res.ok) { return; }
    let data = await res.json();
    DEALS = data.deals || {};
    STORE_META = data.stores || {};
    // Filter out pet food / non-human food
    Object.keys(DEALS).forEach(function(food) {
      DEALS[food] = DEALS[food].filter(function(d) {
        return !isPetFood(d.name);
      });
      if (DEALS[food].length === 0) { delete DEALS[food]; }
    });
  } catch(e) { /* Deals are non-critical */ console.error('[NutriFood] Deals load error:', e); }
}

async function refreshDeals() {
  let token = getToken();
  if (!token) { return; }
  let btn = document.getElementById('menu-refresh-deals');
  if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
  try {
    let res = await fetchWithTimeout(API + '/deals/refresh', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    }, 30000);
    if (res.ok) {
      let data = await res.json();
      let count = data.count || 0;
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
  let deals = DEALS[foodName];
  if (!deals || deals.length === 0) { return ''; }
  let sorted = deals.slice().sort(function(a, b) { return (a.price || 0) - (b.price || 0); });
  let maxShow = 3;
  let shown = sorted.slice(0, maxShow);
  let extra = sorted.length > maxShow ? sorted.length - maxShow : 0;
  let html = '<span class="deal-badges" data-deal-food="' + esc(foodName) + '">';
  html += '\uD83C\uDFF7\uFE0F';
  shown.forEach(function(d) {
    let storeInfo = STORE_META[d.store] || {};
    let color = storeInfo.color || '#666';
    let letter = (storeInfo.name || d.store || '?').charAt(0).toUpperCase();
    html += '<span class="deal-badge" style="background:' + color + ';" title="' + esc(d.name || '') + ' — ' + (d.price || '') + '$">' + letter + '</span>';
  });
  if (extra > 0) { html += '<span class="deal-badges-extra deal-show-all" data-deal-food="' + esc(foodName) + '" style="cursor:pointer;text-decoration:underline;" title="Voir tous les spéciaux">+' + extra + '</span>'; }
  html += '</span>';
  return html;
}

// Deal modal: click 'voir plus' opens full list in suggestions modal
document.addEventListener('click', function(e) {
  let el = e.target.closest('[data-deal-modal-food]');
  if (!el) { return; }
  let foodName = el.dataset.dealModalFood.decodeEntities();
  let deals = (DEALS[foodName] || []).slice().sort(function(a,b) { return (a.price||0) - (b.price||0); });
  if (deals.length === 0) { return; }
  let mHtml = '<div class="ct-title">\uD83C\uDFF7\uFE0F ' + esc(foodName) + ' \u2014 ' + deals.length + ' sp\u00e9ciaux</div>';
  deals.forEach(function(d) {
    let si = STORE_META[d.store] || {};
    let color = si.color || '#666';
    let sn = si.name || d.store || '?';
    let letter = sn.charAt(0).toUpperCase();
    mHtml += '<div class="ct-deal-item" style="border-left:3px solid ' + color + ';padding-left:8px;margin-left:4px;margin-bottom:8px;">';
    mHtml += '<div class="ct-deal-name">' + esc(d.name || foodName) + '</div>';
    mHtml += '<div class="ct-deal-price">' + (d.price || '') + '$</div>';
    if (d.size) { mHtml += '<div class="ct-deal-meta">Format: ' + esc(d.size) + '</div>'; }
    mHtml += '<div class="ct-deal-store"><span class="ct-deal-store-badge" style="background:' + color + ';">' + letter + '</span> ' + esc(sn) + '</div>';
    if (d.link) { mHtml += '<a class="ct-deal-link" href="' + esc(d.link) + '" target="_blank" rel="noopener">Voir sur le site →</a>'; }
    mHtml += '</div>';
  });
  let content = document.getElementById('suggestions-content');
  if (content) {
    content.innerHTML = mHtml;
    document.getElementById('suggestions-modal').classList.remove('hidden');
  }
});
