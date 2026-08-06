// ─── Profile module (#31) — lazy-loaded ───

const DIET_OPTIONS = [
  { value: 'none', label: 'Aucun régime particulier' },
  { value: 'vegetarian', label: '🥬 Végétarien' },
  { value: 'vegan', label: '🌱 Végétalien' },
  { value: 'ketogenic', label: '🥑 Cétogène' },
  { value: 'mediterranean', label: '🫒 Méditerranéen' },
  { value: 'gluten_free', label: '🌾 Sans gluten' },
];

const ACTIVITY_OPTIONS = [
  { value: 'sedentary', label: 'Sédentaire (peu d\'activité)' },
  { value: 'light', label: 'Léger (marche légère 1-3j/sem)' },
  { value: 'moderate', label: 'Modéré (exercice 3-5j/sem)' },
  { value: 'active', label: 'Actif (exercice quotidien 6-7j/sem)' },
  { value: 'very_active', label: 'Très actif (athlete, travail physique)' },
];

const SEX_OPTIONS = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
  { value: 'other', label: 'Autre / Non précisé' },
];

const ALLERGY_OPTIONS = [
  { value: 'peanuts', label: '🍜 Arachides' },
  { value: 'tree_nuts', label: '🌰 Noix' },
  { value: 'milk', label: '🥛 Lait / Lactose' },
  { value: 'eggs', label: '🥚 Œufs' },
  { value: 'soy', label: '🫘 Soya' },
  { value: 'wheat', label: '🌾 Blé / Gluten' },
  { value: 'fish', label: '🐟 Poisson' },
  { value: 'shellfish', label: '🦐 Fruits de mer' },
  { value: 'sesame', label: '📌 Sésame' },
  { value: 'mustard', label: '🌭 Moutarde' },
];

async function showProfile() {

  let overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'profile-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;max-height:85vh;overflow-y:auto;">
      <h2>👤 Mon profil</h2>
      <p class="loading">Chargement…</p>
      <div style="text-align:center;margin-top:12px;">
        <button class="auth-btn outline" id="profile-close">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#profile-close').addEventListener('click', function() { overlay.remove(); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });

  try {
    let res = await fetchWithTimeout(API + '/profile', {
      headers: {  }
    }, 8000);
    if (!res.ok) { overlay.querySelector('.loading').textContent = 'Erreur de chargement'; return; }
    let data = await res.json();
    let p = data.profile || {};

    let html = buildProfileFormHTML(p);
    let loadingEl = overlay.querySelector('.loading');
    let wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    loadingEl.replaceWith(wrapper);

    wireProfileForm(overlay, p);
  } catch(e) {
    overlay.querySelector('.loading').textContent = 'Erreur: ' + e.message;
  }
}

function buildProfileFormHTML(p) {
  function selected(val, opt) { return val === opt ? 'selected' : ''; }

  let allergyCheckboxes = ALLERGY_OPTIONS.map(function(a) {
    let checked = (p.allergies || []).includes(a.value) ? 'checked' : '';
    return '<label style="display:inline-flex;align-items:center;gap:4px;font-size:0.82rem;margin:2px 6px;cursor:pointer;">' +
      '<input type="checkbox" data-allergy="' + a.value + '" ' + checked + '> ' + a.label + '</label>';
  }).join('');

  return `
    <div id="profile-form">
      <div style="margin-bottom:16px;">
        <div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:8px;">📐 Mesures</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div>
            <label style="font-size:0.75rem;color:var(--text-dim);">Poids (kg)</label>
            <input type="number" id="profile-weight" value="${p.weight || ''}" step="0.1" min="0" style="width:100%;padding:8px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;">
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--text-dim);">Taille (cm)</label>
            <input type="number" id="profile-height" value="${p.height || ''}" step="0.1" min="0" style="width:100%;padding:8px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;">
          </div>
          <div>
            <label style="font-size:0.75rem;color:var(--text-dim);">Âge</label>
            <input type="number" id="profile-age" value="${p.age || ''}" min="0" style="width:100%;padding:8px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;">
          </div>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:8px;">👤 Physiologie</div>
        <div style="margin-bottom:8px;">
          <label style="font-size:0.75rem;color:var(--text-dim);display:block;margin-bottom:4px;">Sexe</label>
          <select id="profile-sex" style="width:100%;padding:8px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;">
            ${SEX_OPTIONS.map(function(s) { return '<option value="' + s.value + '" ' + selected(p.sex, s.value) + '>' + s.label + '</option>'; }).join('')}
          </select>
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-dim);display:block;margin-bottom:4px;">Niveau d'activité</label>
          <select id="profile-activity" style="width:100%;padding:8px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;">
            ${ACTIVITY_OPTIONS.map(function(a) { return '<option value="' + a.value + '" ' + selected(p.activity_level, a.value) + '>' + a.label + '</option>'; }).join('')}
          </select>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:8px;">🥗 Régime alimentaire</div>
        <select id="profile-diet" style="width:100%;padding:8px;background:#12141c;color:var(--text);border:1px solid var(--border);border-radius:8px;font-size:0.9rem;margin-bottom:12px;">
          ${DIET_OPTIONS.map(function(d) { return '<option value="' + d.value + '" ' + selected(p.diet, d.value) + '>' + d.label + '</option>'; }).join('')}
        </select>
      </div>

      <div style="margin-bottom:16px;">
        <div style="font-size:0.85rem;font-weight:700;color:var(--accent-red);margin-bottom:8px;">⚠️ Allergies / Intolérances</div>
        <div style="display:flex;flex-wrap:wrap;gap:2px;background:#12141c;border:1px solid var(--border);border-radius:8px;padding:8px;">
          ${allergyCheckboxes}
        </div>
      </div>

      <div id="profile-recommend" style="display:none;margin-bottom:16px;padding:12px;background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:8px;">
        <div style="font-size:0.85rem;font-weight:700;color:var(--accent);margin-bottom:8px;">🎯 Objectifs recommandés</div>
        <div id="profile-recommend-content"></div>
        <button class="auth-btn" id="profile-apply-targets" style="margin-top:8px;font-size:0.8rem;padding:6px 12px;">Appliquer ces objectifs</button>
      </div>

      <div id="profile-error" style="color:var(--accent-red);font-size:0.85rem;min-height:1.2em;margin-bottom:8px;"></div>

      <div style="display:flex;gap:8px;">
        <button class="submit-btn" id="profile-save" style="flex:1;padding:12px;">💾 Sauvegarder</button>
        <button class="submit-btn" id="profile-recalc" style="flex:1;padding:12px;background:var(--accent-dim);">🎯 Recommander objectifs</button>
      </div>
    </div>`;
}

function wireProfileForm(overlay, currentProfile) {
  let errEl = overlay.querySelector('#profile-error');
  let saveBtn = overlay.querySelector('#profile-save');
  let recalcBtn = overlay.querySelector('#profile-recalc');

  saveBtn.addEventListener('click', async function() {
    errEl.textContent = '';
    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Sauvegarde…';

    let allergies = [];
    overlay.querySelectorAll('input[data-allergy]:checked').forEach(function(cb) {
      allergies.push(cb.dataset.allergy);
    });

    let profile = {
      weight: parseFloat(overlay.querySelector('#profile-weight').value) || null,
      height: parseFloat(overlay.querySelector('#profile-height').value) || null,
      age: parseInt(overlay.querySelector('#profile-age').value) || null,
      sex: overlay.querySelector('#profile-sex').value,
      activity_level: overlay.querySelector('#profile-activity').value,
      diet: overlay.querySelector('#profile-diet').value,
      allergies: allergies,
    };

    try {
      let res = await fetchWithTimeout(API + '/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: profile }),
      }, 8000);
      let data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Erreur'; saveBtn.disabled = false; saveBtn.textContent = '💾 Sauvegarder'; return; }
      saveBtn.textContent = '✅ Sauvegardé';
      showToast('Profil mis à jour', 'success');
      setTimeout(function() { saveBtn.disabled = false; saveBtn.textContent = '💾 Sauvegarder'; }, 2000);
    } catch(e) {
      errEl.textContent = 'Erreur: ' + e.message;
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Sauvegarder';
    }
  });

  recalcBtn.addEventListener('click', async function() {
    errEl.textContent = '';
    recalcBtn.disabled = true;
    recalcBtn.textContent = '⏳…';

    try {
      let res = await fetchWithTimeout(API + '/profile/recommend-targets', {
        headers: {  },
      }, 8000);
      let data = await res.json();
      if (!res.ok) { errEl.textContent = data.error || 'Erreur'; recalcBtn.disabled = false; recalcBtn.textContent = '🎯 Recommander objectifs'; return; }

      let rec = data.recommended;
      let labels = { protein: 'Protéines', fiber: 'Fibres', iron: 'Fer', vitamin_c: 'Vit. C', calcium: 'Calcium', omega3: 'Oméga-3' };
      let units = { protein: 'g', fiber: 'g', iron: 'mg', vitamin_c: 'mg', calcium: 'mg', omega3: 'g' };
      let html = '<div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:4px;">Basé sur votre profil — BMR: ' + (data.bmr || '?') + ' kcal/jour, TDEE: ' + (data.tdee || '?') + ' kcal/jour</div>';
      html += '<div style="display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:0.82rem;">';
      for (var key in rec) {
        html += '<div>' + (labels[key] || key) + '</div><div style="text-align:right;font-weight:600;">' + rec[key] + ' ' + (units[key] || '') + '/sem</div>';
      }
      html += '</div>';
      overlay.querySelector('#profile-recommend-content').innerHTML = html;
      overlay.querySelector('#profile-recommend').style.display = 'block';

      // Wire apply button
      let applyBtn = overlay.querySelector('#profile-apply-targets');
      applyBtn.onclick = async function() {
        try {
          await fetchWithTimeout(API + '/goals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goals: rec }),
          }, 8000);
          showToast('Objectifs appliqués!', 'success');
          applyBtn.textContent = '✅ Appliqués';
          applyBtn.disabled = true;
        } catch(e) {
          showToast('Erreur: ' + e.message, 'error');
        }
      };

      recalcBtn.disabled = false;
      recalcBtn.textContent = '🎯 Recommander objectifs';
    } catch(e) {
      errEl.textContent = 'Erreur: ' + e.message;
      recalcBtn.disabled = false;
      recalcBtn.textContent = '🎯 Recommander objectifs';
    }
  });
}
