// ─── Grocery module (lazy-loaded) ───

function findBestDeal(itemName) {
  let itemDeals = DEALS[itemName];
  if (!itemDeals?.length) { return null; }
  return itemDeals.slice().sort(function(a, b) { return (a.price || 0) - (b.price || 0); })[0];
}

function buildGroceryItem(item, cat, month) {
  let food = cat.foods.find(function(f) { return f.name === item.name; });
  let icon = cat.icon;
  let seasonIcon = getSeasonIcon(food, month);
  if (seasonIcon) { icon = seasonIcon + ' ' + icon; }
  let dealInfo = findBestDeal(item.name);
  return {
    name: item.name,
    qty: item.qty || 1,
    cat: cat.name,
    icon: icon,
    dealInfo: dealInfo
  };
}

function collectGroceryItems(grocerySelections, month) {
  let items = [];
  let dealTotal = 0;
  let dealCount = 0;
  Object.keys(grocerySelections).forEach(function(catId) {
    let cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) { return; }
    grocerySelections[catId].forEach(function(item) {
      let entry = buildGroceryItem(item, cat, month);
      if (entry.dealInfo) {
        dealTotal += (entry.dealInfo.price || 0) * entry.qty;
        dealCount++;
      }
      items.push(entry);
    });
  });
  items.sort(function(a, b) { return a.name.localeCompare(b.name); });
  return { items: items, dealTotal: dealTotal, dealCount: dealCount };
}

function renderGroceryItemsHTML(items, dealCount, dealTotal) {
  let container = $('grocery-items');
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px;">Aucun aliment sélectionné.</p>';
    return;
  }
  // Build items
  items.forEach(function(item) {
    let dealHtml = '';
    if (item.dealInfo) {
      let d = item.dealInfo;
      let storeInfo = STORE_META[d.store] || {};
      let color = storeInfo.color || '#666';
      let storeName = storeInfo.name || d.store || '?';
      let letter = storeName.charAt(0).toUpperCase();
      let link = d.link || '#';
      dealHtml = ' <a class="gi-deal" href="' + esc(link) + '" target="_blank" rel="noopener" title="' + esc(d.name || '') + '">🏷️ <span class="grocery-deal-store-badge" style="background:' + color + ';">' + letter + '</span>' + (d.price || '') + '$ ' + esc(storeName) + '</a>';
    }
    let div = document.createElement('div');
    div.className = 'grocery-item';
    div.dataset.name = item.name;
    div.dataset.qty = item.qty;
    div.innerHTML = '<input type="checkbox"><span class="gi-name">' + item.icon + ' ' + esc(item.name) + dealHtml + '</span><span class="gi-qty">' + (item.qty > 1 ? '×' + item.qty : '') + '</span>';
    container.appendChild(div);
  });
  // Deal total (appendChild, NOT innerHTML +=)
  if (dealCount > 0) {
    let totalDiv = document.createElement('div');
    totalDiv.className = 'grocery-total';
    totalDiv.innerHTML = '<div class="gt-amount">Total estimé: ' + dealTotal.toFixed(2) + '$</div><div class="gt-note">Prix indicatifs selon les circulaires actuelles</div>';
    container.appendChild(totalDiv);
  }
  // Wire checkboxes (after all DOM is built)
  container.querySelectorAll('.grocery-item input[type="checkbox"]').forEach(function(cb) {
    cb.addEventListener('change', function() {
      let item = this.closest('.grocery-item');
      item.classList.toggle('checked', this.checked);
      // Move checked items to bottom (but before grocery-total if it exists)
      let total = container.querySelector('.grocery-total');
      if (this.checked) {
        if (total) { container.insertBefore(item, total); }
        else { container.appendChild(item); }
      } else {
        // Move unchecked back up (before first checked item)
        let firstChecked = container.querySelector('.grocery-item.checked');
        if (firstChecked) {
          container.insertBefore(item, firstChecked);
        }
      }
    });
  });
}

function wireGroceryButtons() {
  let shareBtn = $('grocery-share-btn');
  if (shareBtn) {
    shareBtn.onclick = async function() {
      let token = getToken();
      if (!token) { return; }
      let origText = shareBtn.textContent;
      shareBtn.disabled = true; shareBtn.textContent = '⏳…';
      try {
        let res = await fetchWithTimeout(API + '/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }
        }, 10000);
        let data = await res.json();
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

  let clearBtn = $('grocery-clear-btn');
  if (clearBtn) {
    clearBtn.onclick = function() {
      let container = $('grocery-items');
      let checked = container.querySelectorAll('.grocery-item.checked');
      if (checked.length === 0) { showToast('Aucun item coché', 'info'); return; }
      checked.forEach(function(el) { el.remove(); });
      showToast(checked.length + ' item' + (checked.length > 1 ? 's' : '') + ' retiré' + (checked.length > 1 ? 's' : ''), 'success');
    };
  }

  let printBtn = $('grocery-print-btn');
  if (printBtn) {
    printBtn.onclick = function() {
      let container = $('grocery-items');
      let groceryItems = container.querySelectorAll('.grocery-item');
      let date = new Date().toLocaleDateString('fr-CA');
      let printHtml = '<h1>Liste d\'épicerie</h1>';
      printHtml += '<div class="print-date">' + date + '</div>';
      groceryItems.forEach(function(el) {
        // Use dataset.name (clean food name, no icons)
        let name = el.dataset.name || '';
        let qty = el.dataset.qty ? '×' + el.dataset.qty : '';
        let isChecked = el.classList.contains('checked');
        let cls = isChecked ? 'print-item checked' : 'print-item';
        let cbCls = 'print-checkbox' + (isChecked ? ' checked' : '');
        printHtml += '<div class="' + cls + '"><div class="' + cbCls + '"></div><span>' + esc(name) + '</span>' + (qty && el.dataset.qty !== '1' ? '<span class="print-qty">' + qty + '</span>' : '') + '</div>';
      });
      $('print-area-grocery').innerHTML = printHtml;
      // Clean up after print dialog closes
      window.onafterprint = function() {
        $('print-area-grocery').innerHTML = '';
        window.onafterprint = null;
      };
      window.print();
    };
  }
}

function showGroceryList() {
  // Always use planning selections — grocery list is for planning
  let grocerySelections = planningSelections || {};
  let month = new Date().getMonth() + 1;

  let result = collectGroceryItems(grocerySelections, month);
  renderGroceryItemsHTML(result.items, result.dealCount, result.dealTotal);
  wireGroceryButtons();

  $('grocery-overlay').classList.remove('hidden');
}

function copyGroceryList() {
  let lines = [];
  let grocerySelections = planningSelections || {};
  Object.keys(grocerySelections).forEach(function(catId) {
    let cat = DATA.categories.find(function(c) { return c.id === catId; });
    if (!cat) { return; }
    grocerySelections[catId].forEach(function(item) {
      let qty = item.qty > 1 ? ' x' + item.qty : '';
      lines.push(item.name + qty);
    });
  });
  lines.sort(function(a, b) { return a.localeCompare(b); });
  let text = lines.join('\n');
  navigator.clipboard.writeText(text).then(function() {
    let btn = $('grocery-copy-btn');
    btn.textContent = '✓ Copié!';
    setTimeout(function() { btn.textContent = '📋 Copier'; }, 2000);
  });
}
