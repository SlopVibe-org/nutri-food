'use strict';

// ─── API Config ───
const API = '/nutri-food/api';
const TOKEN_KEY = 'nutrifood_token';
const USER_KEY = 'nutrifood_user';

// ─── Global state ───
let DATA = null;
let selections = {};
let savedSnapshot = '{}';
let activeTab = null;
let currentUser = null;
let authMode = 'login';
let autoSaveTimer = null;
let searchActiveIndex = -1;

// ─── Mode Suivi (tracking) state ───
let currentMode = localStorage.getItem('nf-mode') || 'tracking';
let planningSelections = {};
let trackingDate = null;
let trackingSelections = {};
let trackingSnapshot = '{}';
let trackingWeek = {};
let mobileSelectedDay = 0;

// ─── Deals data (epiceries.ca) ───
let DEALS = {};
let STORE_META = {};

// ─── Deal badges stub (overridden when deals.js loads) ───
function buildDealBadges(foodName) { return ''; }

// ─── Dynamic script loader (fixed: queue callbacks until truly loaded) ───
let _loadedScripts = {};
let _pendingCallbacks = {};
function loadScript(url, callback) {
  if (_loadedScripts[url]) { if (callback) { callback(); } return; }
  if (_pendingCallbacks[url]) {
    if (callback) { _pendingCallbacks[url].push(callback); }
    return;
  }
  _pendingCallbacks[url] = callback ? [callback] : [];
  let s = document.createElement('script');
  s.src = url;
  s.onload = function() {
    _loadedScripts[url] = true;
    let cbs = _pendingCallbacks[url] || [];
    delete _pendingCallbacks[url];
    cbs.forEach(function(cb) { try { cb(); } catch(e) { console.error('[NutriFood] Script callback error for ' + url + ':', e); } });
  };
  s.onerror = function() {
    console.error('[NutriFood] Failed to load script: ' + url);
    delete _pendingCallbacks[url];
  };
  document.head.appendChild(s);
}

// ─── DOM helpers ───
function $(id) { return document.getElementById(id); }

// ─── Escape HTML ───
function esc(s) { return String(s == null ? '' : s).replace(/'/g, '&#39;').replace(/"/g, '&quot;'); }

// ─── Date helpers (tracking mode) ───
function getTodayISO() { return new Date().toISOString().slice(0,10); }
function formatDayLabel(dateStr) {
  let today = getTodayISO();
  let d0 = new Date(); d0.setDate(d0.getDate()+1);
  let tomorrowStr = d0.toISOString().slice(0,10);
  let d1 = new Date(); d1.setDate(d1.getDate()-1);
  let yesterdayStr = d1.toISOString().slice(0,10);
  if (dateStr === today) return "Aujourd'hui";
  if (dateStr === tomorrowStr) return "Demain";
  if (dateStr === yesterdayStr) return "Hier";
  let d = new Date(dateStr + 'T12:00:00');
  let days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  let months = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
  return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}

// ─── Toast system ───
function showToast(message, type = 'info') {
  let container = $('toast-container');
  if (!container) return;
  let toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('fade-out');
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}

// ─── Fetch with timeout ───
function fetchWithTimeout(url, options, timeoutMs) {
  timeoutMs = timeoutMs || 10000;
  return Promise.race([
    fetch(url, options),
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('D\u00e9lai d\u00e9pass\u00e9')); }, timeoutMs);
    })
  ]);
}

// ─── Token helpers ───
function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch(e) { return null; } }

function setAuth(token, user) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch(e) { console.error('[NutriFood] localStorage error:', e); }
  currentUser = user;
  renderUserArea();
}

function clearAuth() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch(e) { console.error('[NutriFood] localStorage clear error:', e); }
  currentUser = null;
  selections = {};
  savedSnapshot = '{}';
  let fab = $('suggestions-fab');
  if (fab) fab.classList.remove('visible', 'pulsing');
  let banner = $('seasonal-banner');
  if (banner) banner.classList.add('hidden');
  renderUserArea();
  render();
  updateSaveBar();
}

// ─── Search normalization ───
function normalizeForSearch(str) {
  return (str || '').toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/Œ/g, 'oe')
    .replace(/Æ/g, 'ae')
    .replace(/[^a-z0-9\s]/g, ' ');
}
