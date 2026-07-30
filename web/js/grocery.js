// ─── Grocery module (lazy-loaded) ───

function collectGroceryItems(grocerySelections, month) {
  var items = [];
  var dealTotal = 0;
  var dealCount = 0;
  Object.keys(grocerySelections).forEach(function(catId) {
    var cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    grocerySelections[catId].forEach(function(item) {
      var food = cat.foods.find(function(f) { return f.name === item.name; });
      var icon = cat.icon;
      var seasonIcon = getSeasonIcon(food, month);
      if (seasonIcon) icon = seasonIcon + ' ' + icon;
      var dealInfo = null;
      var itemDeals = DEALS[item.name];
      if (itemDeals && itemDeals.length > 0) {
        var bestDeal = itemDeals.slice().sort(function(a, b) { return (a.price || 0) - (b.price || 0); })[0];
        dealInfo = bestDeal;
        dealTotal += (bestDeal.price || 0) * (item.qty || 1);
        dealCount++;
      }
      items.push({ name: item.name, qty: item.qty || 1, cat: cat.name, icon: icon, dealInfo: dealInfo });
    });
  });
  items.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { items: items, dealTotal: dealTotal, dealCount: dealCount };
}

function renderGroceryItemsHTML(items, dealCount, dealTotal) {
  var container = $('grocery-items');
  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px;">Aucun aliment sélectionné.</p>';
    return;
  }
  container.innerHTML = items.map(function(item) {
    var dealHtml = '';
    if (item.dealInfo) {
      var d = item.dealInfo;
      var storeInfo = STORE_META[d.store] || {};
      var color = storeInfo.color || '#666';
      var storeName = storeInfo.name || d.store || '?';
      var letter = storeName.charAt(0).toUpperCase();
      var link = d.link || '#';
      dealHtml = ' <a class="gi-deal" href="' + esc(link) + '" target="_blank" rel="noopener" title="' + esc(d.name || '') + '">\uD83C\uDFF7\uFE0F <span class="grocery-deal-store-badge" style="background:' + color + ';">' + letter + '</span>' + (d.price || '') + '$ ' + esc(storeName) + '</a>';
    }
    return '<div class="grocery-item"><input type="checkbox"><span class="gi-name">' + item.icon + ' ' + item.name + dealHtml + '</span><span class="gi-qty">' + (item.qty > 1 ? '×' + item.qty : '') + '</span></div>';
  }).join('');
  container.querySelectorAll('.grocery-item input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      this.closest('.grocery-item').classList.toggle('checked', this.checked);
    });
  });
  if (dealCount > 0) {
    var totalHtml = '<div class="grocery-total">';
    totalHtml += '<div class="gt-amount">Total estimé: ' + dealTotal.toFixed(2) + '$</div>';
    totalHtml += '<div class="gt-note">Prix indicatifs selon les circulaires actuelles</div>';
    totalHtml += '</div>';
    container.innerHTML += totalHtml;
  }
}

function wireGroceryButtons() {
  var shareBtn = $('grocery-share-btn');
  if (shareBtn) {
    shareBtn.onclick = async function() {
      var token = getToken();
      if (!token) return;
      var origText = shareBtn.textContent;
      shareBtn.disabled = true; shareBtn.textContent = '⏳…';
      try {
        var res = await fetchWithTimeout(API + '/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        }, 10000);
        var data = await res.json();
        if (res.ok && data.share_url) {
          shareBtn.textContent = '✓ Lien copié!';
          navigator.clipboard.writeText(data.share_url);
          showToast('Lien copié!', 'success');
          setTimeout(function() { shareBtn.textContent = origText; }, 2000);
        } else {
          showToast('Erreur de partage', 'error');
          shareBtn.textContent = origText;
        }
      } catch(e) { console.error('[NutriFood] Grocery share error:', e); showToast('Erreur: ' + e.message, 'error'); shareBtn.textContent = origText; }
      shareBtn.disabled = false;
    };
  }

  var printBtn = $('grocery-print-btn');
  if (printBtn) {
    printBtn.onclick = function() {
      var printItems = [];
      Object.keys(selections).forEach(function(catId) {
        var cat = DATA.categories.find(function(c) { return c.id === catId; });
        if (!cat) return;
        selections[catId].forEach(function(item) {
          printItems.push({ name: item.name, qty: item.qty || 1 });
        });
      });
      printItems.sort(function(a, b) { return a.name.localeCompare(b.name); });
      var date = new Date().toLocaleDateString('fr-CA');
      var printHtml = '<h1>Liste \u00e9picerie</h1>';
      printHtml += '<div class="print-date">' + date + '</div>';
      printItems.forEach(function(item) {
        printHtml += '<div class="print-item"><div class="print-checkbox"></div><span>' + item.name + '</span>' + (item.qty > 1 ? '<span class="print-qty">x' + item.qty + '</span>' : '') + '</div>';
      });
      $('print-area-grocery').innerHTML = printHtml;
      window.print();
    };
  }
}

function showGroceryList() {
  var grocerySelections = (currentMode === 'tracking') ? planningSelections : selections;
  var month = new Date().getMonth() + 1;

  var result = collectGroceryItems(grocerySelections, month);
  renderGroceryItemsHTML(result.items, result.dealCount, result.dealTotal);
  wireGroceryButtons();

  $('grocery-overlay').classList.remove('hidden');
}

function copyGroceryList() {
  var lines = [];
  Object.keys(selections).forEach(function(catId) {
    var cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    selections[catId].forEach(function(item) {
      var qty = item.qty > 1 ? ' x' + item.qty : '';
      lines.push(item.name + qty);
    });
  });
  lines.sort();
  var text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    var btn = $('grocery-copy-btn');
    btn.textContent = '✓ Copié!';
    setTimeout(function() { btn.textContent = '📋 Copier'; }, 2000);
  });
}
