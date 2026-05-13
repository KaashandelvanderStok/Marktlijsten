
// ════ SUPABASE ════
var SB_URL = 'https://hfrrfqfsovpglerzzbgw.supabase.co';
var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmcnJmcWZzb3ZwZ2xlcnp6Ymd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MDc4MzEsImV4cCI6MjA5MjM4MzgzMX0.ZzlSwLtwUnhDfCIXHJKY2enMF8KWxi-JXDfUT9WHQPc';
// headers defined inline per request

function sbGet(table, filter) {
  var url = SB_URL + '/rest/v1/' + table + (filter ? '?' + filter : '');
  return fetch(url, {
    method: 'GET',
    mode: 'cors',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Accept': 'application/json'
    }
  })
  .then(function(r) {
    if (!r.ok) { console.warn('sbGet HTTP error', r.status); return null; }
    return r.json();
  })
  .catch(function(e) { console.warn('sbGet error', e); return null; });
}

function sbUpsert(table, obj) {
  return fetch(SB_URL + '/rest/v1/' + table, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(obj)
  }).catch(function(e) { console.warn('sbUpsert error', e); });
}

function sbDelete(table, filter) {
  return fetch(SB_URL + '/rest/v1/' + table + '?' + filter, {
    method: 'DELETE',
    mode: 'cors',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY
    }
  }).catch(function(e) { console.warn('sbDelete error', e); });
}

// Sync from Supabase into localStorage
function syncFromSupabase() {
  var wagen = huidigeWagen;
  showLoading('Synchroniseren...');
  return Promise.all([
    sbGet('bestellingen', 'wagen=eq.' + wagen),
    sbGet('klantbestellingen', 'id=eq.' + wagen),
    sbGet('markten_config', 'id=eq.' + wagen + '&order=updated_at.desc&limit=1'),
    sbGet('geschiedenis', 'order=created_at.asc')
  ]).then(function(results) {
    var bestellingen = results[0];
    var klant = results[1];
    var marktenCfg = results[2];
    var gesch = results[3];

  
    if (Array.isArray(bestellingen)) {
      var nieuwLocal = {};
      bestellingen.forEach(function(r) { nieuwLocal[r.markt_id] = r.data; });
    
      localStorage.setItem('vds2_bestellingen_' + wagen, JSON.stringify(nieuwLocal));
    
      if (slideMode === 'pakhuis' && currentMarktId) {
        if (!nieuwLocal[String(currentMarktId)]) {
        
          pakhuisReadOnly = false;
          toast('✓ Bestelling afgerond door collega', 'ok');
          go('pakhuis-kies');
          renderPakhuisKies();
        }
      }
    }

  
  
    if (Array.isArray(klant)) {
      if (klant.length > 0 && klant[0].data !== undefined) {
        localStorage.setItem('vds2_klant_' + wagen, JSON.stringify(klant[0].data));
      } else if (klant.length === 0) {
      
        localStorage.setItem('vds2_klant_' + wagen, JSON.stringify([]));
      }
    }

  
    if (Array.isArray(marktenCfg) && marktenCfg.length && marktenCfg[0].data) {
      markten = marktenCfg[0].data;
      localStorage.setItem('vds2_markten_' + wagen, JSON.stringify(markten));
    } else if (Array.isArray(marktenCfg) && marktenCfg.length === 0) {
    
      sbUpsert('markten_config', {id: wagen, wagen: wagen, data: markten, updated_at: new Date().toISOString()});
    }

  
  
  
  
    if (Array.isArray(gesch)) {
      var allGesch = gesch.map(function(r){ return r.data; });
      localStorage.setItem('vds2_geschiedenis_all', JSON.stringify(allGesch));
      var gw1_sync = gesch.filter(function(r){ return r.wagen === 'w1'; }).map(function(r){ return r.data; });
      var gw2_sync = gesch.filter(function(r){ return r.wagen === 'w2'; }).map(function(r){ return r.data; });
      localStorage.setItem('vds2_geschiedenis_w1', JSON.stringify(gw1_sync));
      localStorage.setItem('vds2_geschiedenis_w2', JSON.stringify(gw2_sync));
    }

  
    sbGet('markten_config', 'id=eq.extra_vrij').then(function(vrijRows) {
      if (Array.isArray(vrijRows) && vrijRows.length && vrijRows[0].data) {
        localStorage.setItem('vds2_extra_vrij', JSON.stringify(vrijRows[0].data));
      }
    });

  
    sbGet('markten_config', 'id=eq.' + wagen + '_std').then(function(stdCfg) {
      if (Array.isArray(stdCfg) && stdCfg.length && stdCfg[0].data) {
        customStd = stdCfg[0].data;
        localStorage.setItem('vds2_std_' + wagen, JSON.stringify(customStd));
      }
    });
  
    sbGet('markten_config', 'id=eq.' + wagen + '_custom_prods').then(function(cpCfg) {
      if (Array.isArray(cpCfg) && cpCfg.length && cpCfg[0].data) {
        localStorage.setItem('vds2_custom_prods_' + wagen, JSON.stringify(cpCfg[0].data));
      }
    });
  
    getSortedMarkten().forEach(function(m) {
      sbGet('markten_config', 'id=eq.' + wagen + '_std_' + String(m.id)).then(function(msCfg) {
        if (Array.isArray(msCfg) && msCfg.length && msCfg[0].data) {
          localStorage.setItem(getMarktStdKey(m.id), JSON.stringify(msCfg[0].data));
        }
      });
    });

    hideLoading();
  }).catch(function(e) {
    console.warn('Sync failed:', e);
    hideLoading();
  });
}

function syncManual() {
  try {
    syncFromSupabase().then(function() {
      var now = new Date();
      var tijd = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');
      toast('Bijgewerkt om ' + tijd, 'ok');
    }).catch(function(e) {
      toast('Synchronisatie mislukt — controleer internet', 'err');
      console.warn('syncManual error:', e);
    });
  } catch(e) {
    toast('Synchronisatie mislukt', 'err');
    console.warn('syncManual catch:', e);
  }
}

function showLoading(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg || 'Laden...';
  t.className = 'toast ok on';
}
function hideLoading() {
  setTimeout(function() {
    var t = document.getElementById('toast');
    t.classList.remove('on');
  }, 500);
}






// ════ CONFIG ════
const DAGVOLGORDE = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
var DAGNAMEN = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];

// ════ WAGEN STATE ════
var huidigeWagen = 'w1'; // 'w1' of 'w2'

function getWagenKleur() {
  return huidigeWagen === 'w1' ? '#2A5C3A' : '#1A5C8B';
}

function getDefaultMarkten() {
  if (huidigeWagen === 'w1') {
    return [
      { id: 1001, naam: 'Nijmegen', dag: 'Maandag', producten: DEFAULT_PRODUCTS.map(function(p){return p.id;}) },
      { id: 1002, naam: 'Lent', dag: 'Woensdag', producten: DEFAULT_PRODUCTS.map(function(p){return p.id;}) },
      { id: 1003, naam: 'Elst', dag: 'Donderdag', producten: DEFAULT_PRODUCTS.map(function(p){return p.id;}) },
      { id: 1004, naam: 'Arnhem', dag: 'Vrijdag', producten: DEFAULT_PRODUCTS.map(function(p){return p.id;}) },
      { id: 1005, naam: 'Arnhem', dag: 'Zaterdag', producten: DEFAULT_PRODUCTS.map(function(p){return p.id;}) },
    ];
  } else {
    return [
      { id: 2001, naam: 'Eerbeek', dag: 'Dinsdag', producten: DEFAULT_PRODUCTS_W2.map(function(p){return p.id;}) },
      { id: 2002, naam: 'Hatert', dag: 'Woensdag', producten: DEFAULT_PRODUCTS_W2.map(function(p){return p.id;}) },
      { id: 2003, naam: 'Amsterdam', dag: 'Donderdag', producten: DEFAULT_PRODUCTS_W2.map(function(p){return p.id;}) },
      { id: 2004, naam: 'Meijhorst', dag: 'Vrijdag', producten: DEFAULT_PRODUCTS_W2.map(function(p){return p.id;}) },
      { id: 2005, naam: 'Houten', dag: 'Zaterdag', producten: DEFAULT_PRODUCTS_W2.map(function(p){return p.id;}) },
    ];
  }
}

function getDefaultProducts() {
  return huidigeWagen === 'w1' ? DEFAULT_PRODUCTS : DEFAULT_PRODUCTS_W2;
}

function setWagen(wagen) {
  huidigeWagen = wagen;
  pakhuisReadOnly = false; // reset meekijk modus bij wagen wissel

  var slideHdr = document.getElementById('slide-hdr');
  var ovHdr = document.getElementById('ov-hdr');
  var klantHdr = document.getElementById('klant-hdr');
  var klantFormHdr = document.getElementById('klant-form-hdr');
  var kleur = getWagenKleur();
  if (slideHdr) slideHdr.style.background = kleur;
  if (ovHdr) ovHdr.style.background = kleur;
  if (klantHdr) klantHdr.style.background = kleur;
  if (klantFormHdr) klantFormHdr.style.background = kleur;
}

// ════ HOME NAVIGATIE ════
document.getElementById('btn-wagen1').onclick = function() {
  setWagen('w1');
  loadData();
  go('wagen1-home');
};
document.getElementById('btn-wagen2').onclick = function() {
  setWagen('w2');
  loadData();
  go('wagen2-home');
};
document.getElementById('w1-back').onclick = function() { go('home'); };
document.getElementById('w2-back').onclick = function() { go('home'); };

document.getElementById('btn-w1-aanmaken').onclick = function() {
  setWagen('w1'); loadData(); syncFromSupabase().then(function(){ renderMarktKies(); go('markt-kies'); });
};
document.getElementById('btn-w1-pakken').onclick = function() {
  setWagen('w1'); loadData(); syncFromSupabase().then(function(){ renderPakhuisKies(); go('pakhuis-kies'); });
};
document.getElementById('btn-w2-aanmaken').onclick = function() {
  setWagen('w2'); loadData(); syncFromSupabase().then(function(){ renderMarktKies(); go('markt-kies'); });
};
document.getElementById('btn-w2-pakken').onclick = function() {
  setWagen('w2'); loadData(); syncFromSupabase().then(function(){ renderPakhuisKies(); go('pakhuis-kies'); });
};

// mk-back and pk-back handled in MARKT KIEZEN and PAKHUIS KIES sections

// Klantbestellingen
document.getElementById('btn-klant-home').onclick = function() { go('klant-wagen-kies'); };
document.getElementById('klant-wagen-back').onclick = function() { go('home'); };
document.getElementById('btn-klant-w1').onclick = function() {
  setWagen('w1'); loadData(); syncFromSupabase().then(function(){
    document.getElementById('klant-title').textContent = 'Klantbestellingen W1';
    document.getElementById('klant-sub').textContent = 'Verkoopwagen 1';
    document.getElementById('klant-form-sub').textContent = 'Verkoopwagen 1';
    klantFilterDag = null; renderKlantOverzicht(); go('klant');
  });
};
document.getElementById('btn-klant-w2').onclick = function() {
  setWagen('w2'); loadData(); syncFromSupabase().then(function(){
    document.getElementById('klant-title').textContent = 'Klantbestellingen W2';
    document.getElementById('klant-sub').textContent = 'Verkoopwagen 2';
    document.getElementById('klant-form-sub').textContent = 'Verkoopwagen 2';
    klantFilterDag = null; renderKlantOverzicht(); go('klant');
  });
};
document.getElementById('klant-back').onclick = function() { go('klant-wagen-kies'); };
document.getElementById('klant-nieuw-btn').onclick = function() { openKlantForm(null); };
document.getElementById('klant-form-back').onclick = function() { go('klant'); renderKlantOverzicht(); };

// Beheer
document.getElementById('btn-beheer').onclick = function() {

  behMarktId = null; behCat = null;
  renderBeheerWagenKies();
  go('beheer');
};
document.getElementById('beh-back').onclick = function() {
  if (behMarktId !== null) { behMarktId = null; behCat = null; renderBeheer(); }
  else if (behWagenGekozen) { behWagenGekozen = false; renderBeheerWagenKies(); }
  else { go('home'); }
};

// Overige knoppen
document.getElementById('btn-geschiedenis').onclick = function() {
  go('geschiedenis');

  localStorage.removeItem('vds2_geschiedenis_w1');
  localStorage.removeItem('vds2_geschiedenis_w2');
  localStorage.removeItem('vds2_geschiedenis_all');
  document.getElementById('gesch-body').innerHTML = '<div style="text-align:center;padding:3rem;color:var(--mid)">⏳ Synchroniseren...</div>';

  sbGet('geschiedenis', 'order=created_at.asc').then(function(gesch) {
    if (Array.isArray(gesch)) {
      var gw1 = gesch.filter(function(r){ return r.wagen === 'w1'; }).map(function(r){ return r.data; });
      var gw2 = gesch.filter(function(r){ return r.wagen === 'w2'; }).map(function(r){ return r.data; });
      localStorage.setItem('vds2_geschiedenis_w1', JSON.stringify(gw1));
      localStorage.setItem('vds2_geschiedenis_w2', JSON.stringify(gw2));
    }
    autoAfrondVerlopen();
    reinigGeschiedenis();
    renderGeschiedenis();
  }).catch(function() {
  
    renderGeschiedenis();
  });
};

function reinigGeschiedenis() {

  var veertienDagen = 14 * 24 * 60 * 60 * 1000;
  var nu = Date.now();
  ['w1','w2'].forEach(function(wagen) {
    var key = 'vds2_geschiedenis_' + wagen;
    var gesch = [];
    try { gesch = JSON.parse(localStorage.getItem(key)) || []; } catch(e) {}
    if (!gesch.length) return;

    var behouden = [];
    var verwijderd = [];
    gesch.forEach(function(e) {
    
      var ts = typeof e.id === 'number' ? e.id : parseInt(e.id);
      var leeftijd = nu - ts;
      if (leeftijd < veertienDagen) {
        behouden.push(e);
      } else {
        verwijderd.push(e);
      }
    });

    if (verwijderd.length) {
      localStorage.setItem(key, JSON.stringify(behouden));
      verwijderd.forEach(function(e) {
        sbDelete('geschiedenis', 'id=eq.' + String(e.id));
      });
    }
  });
}
document.getElementById('uitleg-back').onclick = function() { go('home'); };
document.getElementById('btn-uitleg').onclick = function() { go('uitleg'); };
document.getElementById('pk-back').onclick = function() {
  go(huidigeWagen === 'w1' ? 'wagen1-home' : 'wagen2-home');
};
// uitleg handled above
// ov-home/back2 handled above
// gesch handled in wagen structure
// gesch-detail-back handled above

// ════ BEHEER WAGEN KIES ════
var behWagenGekozen = false;

function renderBeheerWagenKies() {
  behWagenGekozen = false;
  document.getElementById('beh-title').textContent = 'Beheer';
  document.getElementById('beh-sub').textContent = 'Kies een verkoopwagen';
  var body = document.getElementById('behbody');
  body.innerHTML = '';
  var c1 = mk('div','hcard'); c1.style.marginBottom='.85rem'; body.appendChild(c1);
  c1.innerHTML = '<div class="hcard-icon">🚐</div><div><div class="hcard-title">Verkoopwagen 1</div></div><div class="hcard-arr">→</div>';
  c1.onclick = function() { setWagen('w1'); loadData(); syncFromSupabase().then(function(){ behWagenGekozen=true; renderBeheer(); }); };
  var c2 = mk('div','hcard'); c2.style.cssText='border-color:rgba(26,92,139,0.25)'; body.appendChild(c2);
  c2.innerHTML = '<div class="hcard-icon">🚐</div><div><div class="hcard-title" style="color:#1A5C8B">Verkoopwagen 2</div></div><div class="hcard-arr" style="color:#1A5C8B">→</div>';
  c2.onclick = function() { setWagen('w2'); loadData(); syncFromSupabase().then(function(){ behWagenGekozen=true; renderBeheer(); }); };
}

// ════ VERGRENDELING ════
var DEVICE_ID = localStorage.getItem('vds2_device_id');
if (!DEVICE_ID) {
  DEVICE_ID = 'dev_' + Math.random().toString(36).substr(2,9) + '_' + Date.now();
  localStorage.setItem('vds2_device_id', DEVICE_ID);
}

function getLockId(marktId) {
  return 'lock_' + huidigeWagen + '_' + String(marktId);
}

function setLock(marktId) {
  var lockData = { device: DEVICE_ID, at: Date.now() };
  localStorage.setItem(getLockId(marktId), JSON.stringify(lockData));
  sbUpsert('markten_config', {
    id: getLockId(marktId),
    wagen: huidigeWagen,
    data: lockData,
    updated_at: new Date().toISOString()
  });
}

function releaseLock(marktId) {
  localStorage.removeItem(getLockId(marktId));
  sbDelete('markten_config', 'id=eq.' + getLockId(marktId));
}

function checkLock(marktId, callback) {

  sbGet('markten_config', 'id=eq.' + getLockId(marktId)).then(function(rows) {
    if (!rows || !rows.length) {
      callback(null); // geen vergrendeling
      return;
    }
    var lock = rows[0].data;
  
    var twoHours = 2 * 60 * 60 * 1000;
    if (Date.now() - lock.at > twoHours) {
    
      releaseLock(marktId);
      callback(null);
      return;
    }
  
    if (lock.device === DEVICE_ID) {
      callback(null); // eigen lock, mag door
      return;
    }
    callback(lock); // vergrendeld door iemand anders
  }).catch(function() {
    callback(null); // bij fout: gewoon door
  });
}

// ════ SCREEN ════
function go(name) {
  document.querySelectorAll('.scr').forEach(function(s){ s.classList.remove('on'); });
  document.getElementById('s-' + name).classList.add('on');
}

// ════ DATA ════
var markten, customStd, slideData, slideIdx, slideMode, npVal, behMarktId, behCat, currentMarktId;
var marktExtraNotitie = '';
var originalPakItems = []; // bewaar originele items bij starten pakhuis

function loadData() {

  try { markten = JSON.parse(localStorage.getItem(('vds2_markten_'+huidigeWagen))); } catch(e) { markten = null; }
  if (!markten || !Array.isArray(markten)) {
    markten = getDefaultMarkten();
  
    localStorage.setItem(('vds2_markten_'+huidigeWagen), JSON.stringify(markten));
  }
  try { customStd = JSON.parse(localStorage.getItem(('vds2_std_'+huidigeWagen))); } catch(e) { customStd = {}; }
  if (!customStd) customStd = {};
}

function saveMarkten() {
  localStorage.setItem(('vds2_markten_'+huidigeWagen), JSON.stringify(markten));

  sbUpsert('markten_config', {
    id: huidigeWagen,
    wagen: huidigeWagen,
    data: markten,
    updated_at: new Date().toISOString()
  });
}
function saveStd() {
  localStorage.setItem(('vds2_std_'+huidigeWagen), JSON.stringify(customStd));
  sbUpsert('markten_config', {id: huidigeWagen+'_std', wagen: huidigeWagen, data: customStd, updated_at: new Date().toISOString()});
}
function saveBestelling(b) {
  var all = loadAllBestellingen();
  all[String(b.marktId)] = b;
  localStorage.setItem(('vds2_bestellingen_'+huidigeWagen), JSON.stringify(all));
  sbUpsert('bestellingen', {id: String(b.marktId)+'_'+huidigeWagen, wagen: huidigeWagen, markt_id: String(b.marktId), data: b, updated_at: new Date().toISOString()}); // sync to Supabase
}
function loadAllBestellingen() {
  try { return JSON.parse(localStorage.getItem(('vds2_bestellingen_'+huidigeWagen))) || {}; } catch(e) { return {}; }
}
function verwijderBestelling(marktId) {
  var all = loadAllBestellingen();
  delete all[String(marktId)];
  localStorage.setItem(('vds2_bestellingen_'+huidigeWagen), JSON.stringify(all));
  sbDelete('bestellingen', 'id=eq.'+marktId+'_'+huidigeWagen); // sync to Supabase
}

function getSortedMarkten() {
  if (!markten || !Array.isArray(markten)) { loadData(); }
  return markten.slice().sort(function(a, b) {
    var DAGVOLGORDE2 = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
    var ai = DAGVOLGORDE2.indexOf(a.dag);
    var bi = DAGVOLGORDE2.indexOf(b.dag);
    if (ai === -1) ai = 99;
    if (bi === -1) bi = 99;
    return ai !== bi ? ai - bi : a.naam.localeCompare(b.naam);
  });
}

function getCustomProducts() {
  try { return JSON.parse(localStorage.getItem('vds2_custom_prods_'+huidigeWagen)) || []; } catch(e) { return []; }
}
function saveCustomProducts(list) {
  localStorage.setItem('vds2_custom_prods_'+huidigeWagen, JSON.stringify(list));

  sbUpsert('markten_config', {
    id: huidigeWagen + '_custom_prods',
    wagen: huidigeWagen,
    data: list,
    updated_at: new Date().toISOString()
  });
}
function getDefaultProducts() {
  var base = huidigeWagen === 'w1' ? DEFAULT_PRODUCTS : DEFAULT_PRODUCTS_W2;
  var custom = getCustomProducts();
  return base.concat(custom);
}

function getMarktStdKey(marktId) {
  return 'vds2_std_' + huidigeWagen + '_' + marktId;
}
function getMarktStd(marktId) {
  try { return JSON.parse(localStorage.getItem(getMarktStdKey(marktId))) || {}; } catch(e) { return {}; }
}
function saveMarktStd(marktId, obj) {
  localStorage.setItem(getMarktStdKey(marktId), JSON.stringify(obj));

  sbUpsert('markten_config', {
    id: huidigeWagen + '_std_' + String(marktId),
    wagen: huidigeWagen,
    data: obj,
    updated_at: new Date().toISOString()
  });
}
function getStdVoorMarkt(pid, marktId) {
  if (marktId) {
    var ms = getMarktStd(marktId);
    if (ms['s_' + pid] !== undefined) return ms['s_' + pid];
  }

  if (customStd['s_' + pid] !== undefined) return customStd['s_' + pid];
  var prods = getDefaultProducts();
  var found = prods.find(function(p){return p.id===pid;});
  return found ? found.std : 0;
}
function getStd(pid) {

  return getStdVoorMarkt(pid, currentMarktId);
}

// ════ MARKT KIEZEN ════
document.getElementById('mk-back').onclick = function() {
  go(huidigeWagen === 'w1' ? 'wagen1-home' : 'wagen2-home');
};

function renderMarktKies() {
  var list = document.getElementById('mlist');
  list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--mid)">⏳ Synchroniseren...</div>';
  syncFromSupabase().then(function() {
    list.innerHTML = '';
    var all = loadAllBestellingen();
    document.getElementById('mk-title').textContent = 'Kies je markt';
    document.getElementById('mk-sub').textContent = huidigeWagen === 'w1' ? 'Verkoopwagen 1' : 'Verkoopwagen 2';

  var weekLijst = marktWeekLijst();
  var nu = new Date();

  var vandaagEind = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate(), 23, 59, 59);
  var eersteVrije = null;
  var gesorteerd = weekLijst.slice().sort(function(a,b){ return a.marktDatum - b.marktDatum; });
  for (var mi2 = 0; mi2 < gesorteerd.length; mi2++) {
    var kandidaat = gesorteerd[mi2];
    if (kandidaat.marktDatum > vandaagEind && !isFeestdag(kandidaat.marktDatum)) {
      eersteVrije = kandidaat.id;
      break;
    }
  }

  weekLijst.forEach(function(m) {
    var bestaand = all[String(m.id)];
    var lockData = null;
    try { lockData = JSON.parse(localStorage.getItem(getLockId(m.id))); } catch(e) {}
    var lockedByOther = lockData && lockData.device !== DEVICE_ID;
  
    var geblokkeerd = !bestaand && m.id !== eersteVrije;
    var el = document.createElement('div');
    el.className = 'mitem';

    var inner = document.createElement('div');
    inner.style.flex = '1';
    var naam = document.createElement('div');
    naam.className = 'mitem-name';
    naam.textContent = m.dag + ' — ' + m.naam;
    var dag = document.createElement('div');
    dag.className = 'mitem-dag';
    dag.innerHTML = '📅 Markt: <strong>' + m.marktDatumStr + '</strong> &nbsp;·&nbsp; 🏭 Pakhuis: ' + m.pakhuisDatumStr;
    inner.appendChild(naam);
    inner.appendChild(dag);

    if (bestaand) {
      var statusEl = document.createElement('div');
      statusEl.style.cssText = 'font-size:.75rem;font-weight:600;color:var(--warn);margin-top:.3rem';
      statusEl.textContent = '⏳ Ingediend — wacht op pakhuis';
      inner.appendChild(statusEl);
      el.appendChild(inner);
      var aanpasBtn = document.createElement('button');
      aanpasBtn.className = 'btn btn-s btn-sm';
      aanpasBtn.style.cssText = 'flex-shrink:0;margin-left:.75rem';
      aanpasBtn.textContent = '✏️ Aanpassen';
      aanpasBtn.onclick = (function(mid){ return function(e) {
        e.stopPropagation();
        startMarktAanpassen(mid);
      }; })(m.id);
      el.appendChild(aanpasBtn);
      el.style.cursor = 'default';
    } else if (lockedByOther) {
      var lockEl = document.createElement('div');
      lockEl.style.cssText = 'font-size:.75rem;font-weight:600;color:var(--err);margin-top:.3rem';
      lockEl.textContent = '⛔ Wordt nu ingevuld door collega';
      inner.appendChild(lockEl);
      el.appendChild(inner);
      el.style.opacity = '0.6';
      el.style.cursor = 'default';
    } else if (geblokkeerd) {
    
      el.style.opacity = '0.35';
      el.style.cursor = 'default';
      el.appendChild(inner);
    } else {
      el.appendChild(inner);
      var arr = document.createElement('div');
      arr.style.cssText = 'margin-left:auto;color:var(--gl)';
      arr.textContent = '→';
      el.appendChild(arr);
      el.onclick = (function(mid){ return function() { startMarkt(mid); }; })(m.id);
    }
    list.appendChild(el);
  });
  }); // end syncFromSupabase
}

function startMarktAanpassen(marktId) {
  var all = loadAllBestellingen();
  var b = all[String(marktId)];
  if (!b) { startMarkt(marktId); return; }
  showLoading('Controleren...');
  checkLock(marktId, function(lock) {
    hideLoading();
    if (lock) {
      var minuten = Math.floor((Date.now() - lock.at) / 60000);
      toast('⛔ Deze markt wordt al ingevuld (' + minuten + ' min geleden gestart)', 'err');
      return;
    }
    setLock(marktId);
  var m = markten.find(function(x){ return x.id === marktId; });
  var ids = m.producten || getDefaultProducts().map(function(p){return p.id;});
  var bestaandeAantallen = {};
  (b.items||[]).forEach(function(i){ bestaandeAantallen[i.id] = i.aantal; });
  slideData = getDefaultProducts().filter(function(p){ return ids.indexOf(p.id) >= 0; }).map(function(p) {
    return { id: p.id, name: p.name, cat: p.cat, unit: p.unit, std: getStd(p.id), aantal: bestaandeAantallen[p.id] || 0, status: null };
  });
  slideMode = 'markt';
  slideIdx = 0;
  currentMarktId = marktId;
  localStorage.removeItem(('vds2_resume_'+huidigeWagen));
  go('slide');
  renderSlide();
  toast('Bestelling aanpassen — klik ✓ Klaar om op te slaan', 'ok');
  }); // end checkLock
}

function startMarkt(marktId) {
  var m = markten.find(function(x){ return x.id === marktId; });
  showLoading('Controleren...');
  checkLock(marktId, function(lock) {
    hideLoading();
    if (lock) {
    
      var minuten = Math.floor((Date.now() - lock.at) / 60000);
      toast('⛔ Deze markt wordt al ingevuld (' + minuten + ' min geleden gestart)', 'err');
      return;
    }
  
    setLock(marktId);
    var ids = m.producten || getDefaultProducts().map(function(p){return p.id;});
    slideData = getDefaultProducts().filter(function(p){ return ids.indexOf(p.id) >= 0; }).map(function(p) {
      return { id: p.id, name: p.name, cat: p.cat, unit: p.unit, std: getStd(p.id), aantal: 0, status: null };
    });
    slideMode = 'markt';
    slideIdx = 0;
    currentMarktId = marktId;
    localStorage.removeItem(('vds2_resume_'+huidigeWagen));
    go('slide');
    renderSlide();
  });
}

// ════ SLIDES ════
function renderSlide() {
  var item = slideData[slideIdx];
  var total = slideData.length;
  document.getElementById('pfill').style.width = ((slideIdx+1)/total*100) + '%';
  document.getElementById('scnt').textContent = (slideIdx+1) + ' / ' + total;
  var badge = document.getElementById('sbadge');
  badge.textContent = slideMode === 'markt' ? '🏪 Markt' : '🏭 Pakhuis';
  badge.className = 'sbadge ' + slideMode;

  var ovBtn = document.getElementById('slide-ov-btn');
  if (ovBtn) ovBtn.style.display = slideMode === 'pakhuis' ? '' : 'none';
  var c = document.getElementById('scontent');
  c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  c.innerHTML = '';
  if (slideMode === 'markt') buildMarktSlide(item, c);
  else buildPakSlide(item, c);
  buildNav();
  buildCatBar();
}

function buildMarktSlide(item, c) {
  var name = document.createElement('div'); name.className = 'sname'; name.textContent = item.name; c.appendChild(name);
  var unit = document.createElement('div'); unit.className = 'sunit'; unit.textContent = item.unit; c.appendChild(unit);

  var row = document.createElement('div'); row.className = 'arow';
  var min = document.createElement('button'); min.className = 'abtn'; min.textContent = '−';
  min.onclick = function() { item.aantal = Math.max(0, item.aantal - 1); disp.textContent = item.aantal; autoSaveMarktConcept(); };
  var disp = document.createElement('div'); disp.className = 'adisp'; disp.textContent = item.aantal;
  disp.onclick = function() { openNumpad(item); };
  var plus = document.createElement('button'); plus.className = 'abtn'; plus.textContent = '+';
  plus.onclick = function() { item.aantal = item.aantal + 1; disp.textContent = item.aantal; autoSaveMarktConcept(); };
  row.appendChild(min); row.appendChild(disp); row.appendChild(plus); c.appendChild(row);

  var badge = document.createElement('div'); badge.className = 'stdbadge';
  var pill = document.createElement('div'); pill.className = 'stdpill';
  var lbl = document.createElement('div'); lbl.className = 'stdlbl'; lbl.textContent = 'Standaard';
  var val = document.createElement('div'); val.className = 'stdval'; val.textContent = item.std + ' ' + item.unit;
  pill.appendChild(lbl); pill.appendChild(val);
  var rst = document.createElement('button'); rst.className = 'rstbtn'; rst.textContent = '↺ Standaard';
  rst.onclick = function() { item.aantal = item.std; disp.textContent = item.aantal; autoSaveMarktConcept(); };
  badge.appendChild(pill); badge.appendChild(rst); c.appendChild(badge);

  var nwrap = document.createElement('div'); nwrap.className = 'notitie-wrap';
  var ninp = document.createElement('textarea'); ninp.className = 'notitie-inp';
  ninp.placeholder = 'Notitie voor pakhuis (optioneel)...';
  ninp.value = item.notitie || '';
  ninp.rows = 2;
  ninp.oninput = function() { item.notitie = this.value; };
  nwrap.appendChild(ninp); c.appendChild(nwrap);
}

function buildPakSlide(item, c) {
  if (item.isKlant) {
    buildKlantPakSlide(item, c);
    return;
  }
  var name = document.createElement('div'); name.className = 'sname'; name.textContent = item.name; c.appendChild(name);
  var unit = document.createElement('div'); unit.className = 'sunit'; unit.textContent = item.unit; c.appendChild(unit);
  var gev = document.createElement('div'); gev.style.cssText = 'font-family:"Bebas Neue",sans-serif;font-size:2.8rem;color:var(--green)'; gev.textContent = item.aantal + ' ' + item.unit; c.appendChild(gev);
  var sub = document.createElement('div'); sub.style.cssText = 'font-size:.78rem;color:var(--mid);margin-bottom:' + (item.notitie ? '.75rem' : '1.5rem'); sub.textContent = 'gevraagd door de markt'; c.appendChild(sub);
  if (item.notitie) {
    var pnot = document.createElement('div'); pnot.className = 'pak-notitie';
    pnot.innerHTML = '📝 ' + item.notitie;
    c.appendChild(pnot);
  }

  if (item.status) {
    var curStatus = document.createElement('div');
    var statusMap = {'gepakt':'✅ Gepakt','niet-gepakt':'❌ Niet gepakt','manco':'⚠️ Manco'};
    var statusClsMap = {'gepakt':'ok','niet-gepakt':'err','manco':'warn'};
    curStatus.style.cssText = 'font-size:.8rem;font-weight:600;margin-bottom:.75rem;padding:.3rem .9rem;border-radius:20px;';
    curStatus.style.background = item.status==='gepakt'?'var(--okbg)':item.status==='manco'?'var(--wbg)':'var(--errbg)';
    curStatus.style.color = item.status==='gepakt'?'var(--ok)':item.status==='manco'?'var(--warn)':'var(--err)';
    curStatus.textContent = 'Huidig: ' + (statusMap[item.status]||item.status);
    c.appendChild(curStatus);
  }

  var acts = document.createElement('div'); acts.className = 'pakactions';
  [['✅ Gepakt','gp','gepakt'],['❌ Niet gepakt','np','niet-gepakt'],['⚠️ Manco / Niet op voorraad','mc','manco']].forEach(function(x) {
    var b = document.createElement('button');
    b.className = 'pakbtn ' + x[1] + (item.status === x[2] ? ' active-status' : '');
    if (item.status === x[2]) b.style.cssText = 'outline:3px solid currentColor;outline-offset:2px;';
    b.textContent = x[0];
    if (pakhuisReadOnly) {
      b.disabled = true;
      b.style.opacity = '.4';
      b.style.cursor = 'not-allowed';
    } else {
      b.onclick = (function(status){ return function() {
        item.status = status;
        setTimeout(function() { slideIdx < slideData.length-1 ? (slideIdx++, renderSlide()) : finishSlides(); }, 280);
      }; })(x[2]);
    }
    acts.appendChild(b);
  });
  c.appendChild(acts);

  var opmbtn = document.createElement('button');
  opmbtn.className = 'pakbtn' + (item.status === 'opmerking' ? ' mc' : '');
  opmbtn.style.cssText = 'background:var(--blue-bg,#eaf2fb);border-color:#b8d4ea;color:#1a5c8b;margin-top:.5rem;width:100%;max-width:320px;' + (item.status==='opmerking'?'outline:3px solid #1a5c8b;outline-offset:2px;':'');
  opmbtn.textContent = '📝 Opmerking toevoegen';
  opmbtn.onclick = function() {
  
    var existing = c.querySelector('.opmerking-wrap');
    if (existing) { existing.style.display = existing.style.display==='none'?'':'none'; return; }
    var ow = document.createElement('div'); ow.className='opmerking-wrap notitie-wrap'; ow.style.marginTop='.5rem';
    var ta = document.createElement('textarea'); ta.className='notitie-inp';
    ta.placeholder='Typ je opmerking hier...'; ta.rows=2; ta.value=item.pakopmerking||'';
    ta.oninput = function() { item.pakopmerking = this.value; item.status='opmerking'; savePakhuisVoortgang(); };
    var bevestig = document.createElement('button');
    bevestig.className='btn btn-p btn-sm'; bevestig.style.cssText='margin-top:.4rem;width:100%'; bevestig.textContent='✓ Opslaan & doorgaan';
    bevestig.onclick = function() {
      if (!ta.value.trim()) { toast('Typ eerst een opmerking','err'); return; }
      item.pakopmerking = ta.value.trim();
      item.status = 'opmerking';
    
      var idx2 = slideData.indexOf(item);
      if (idx2 >= 0) {
        slideData.splice(idx2, 1);
        if (!slideData._afgehandeld) slideData._afgehandeld = [];
        slideData._afgehandeld.push(item);
      
      
        if (slideIdx >= slideData.length) slideIdx = slideData.length - 1;
      }
      savePakhuisVoortgang();
      if (slideData.filter(function(i){return !i.isKlant;}).length === 0 && slideData.filter(function(i){return i.isKlant;}).length === 0) {
        finishSlides();
      } else if (slideData.length === 0) {
        finishSlides();
      } else {
        renderSlide();
      }
    };
    ow.appendChild(ta); ow.appendChild(bevestig); c.appendChild(ow);
    setTimeout(function(){ ta.focus(); }, 100);
  };
  c.appendChild(opmbtn);
}

function buildKlantPakSlide(item, c) {

  var badge = document.createElement('div');
  badge.style.cssText = 'font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.25rem .8rem;border-radius:20px;background:#FFF3CD;color:#856404;margin-bottom:.75rem;border:1px solid #ffc107';
  badge.textContent = '👤 Klantbestelling';
  c.appendChild(badge);

  var name = document.createElement('div'); name.className = 'sname';
  name.style.fontSize = 'clamp(2rem,8vw,3.5rem)';
  name.textContent = item.naam; c.appendChild(name);

  if (item.marktDatumStr) {
    var datumEl = document.createElement('div');
    datumEl.style.cssText = 'font-size:.8rem;color:var(--mid);margin-top:.3rem;margin-bottom:1rem';
    datumEl.innerHTML = '📅 Ophalen op markt: <strong>' + item.marktDatumStr + '</strong>';
    c.appendChild(datumEl);
  }

  var tekst = item.productenTekst || (item.producten && item.producten.map(function(p){ return p.aantal+'x '+p.naam; }).join('\n')) || '';
  if (tekst) {
    var prodWrap = document.createElement('div');
    prodWrap.style.cssText = 'width:100%;max-width:320px;background:var(--bg);border-radius:12px;padding:.75rem 1rem;margin-bottom:.75rem;text-align:left';
    var prodTitle = document.createElement('div');
    prodTitle.style.cssText = 'font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-bottom:.5rem';
    prodTitle.textContent = 'Te pakken producten';
    prodWrap.appendChild(prodTitle);
    tekst.split('\n').filter(function(r){return r.trim();}).forEach(function(regel) {
      var row = document.createElement('div');
      row.style.cssText = 'padding:.3rem 0;border-bottom:1px solid var(--bdr);font-size:.875rem';
      row.textContent = regel.trim(); prodWrap.appendChild(row);
    });
    c.appendChild(prodWrap);
  }

  if (item.notitie) {
    var pnot = document.createElement('div'); pnot.className = 'pak-notitie';
    pnot.innerHTML = '📝 ' + item.notitie; c.appendChild(pnot);
  }

  if (item.status) {
    var curStatus = document.createElement('div');
    var statusMap = {'gepakt':'✅ Gepakt','niet-gepakt':'❌ Niet gepakt','manco':'⚠️ Manco'};
    curStatus.style.cssText = 'font-size:.8rem;font-weight:600;margin-bottom:.75rem;padding:.3rem .9rem;border-radius:20px;';
    curStatus.style.background = item.status==='gepakt'?'var(--okbg)':item.status==='manco'?'var(--wbg)':'var(--errbg)';
    curStatus.style.color = item.status==='gepakt'?'var(--ok)':item.status==='manco'?'var(--warn)':'var(--err)';
    curStatus.textContent = 'Huidig: ' + (statusMap[item.status]||item.status);
    c.appendChild(curStatus);
  }

  var acts = document.createElement('div'); acts.className = 'pakactions';
  [['✅ Gepakt','gp','gepakt'],['❌ Niet gepakt','np','niet-gepakt'],['⚠️ Manco / Niet op voorraad','mc','manco']].forEach(function(x) {
    var b = document.createElement('button');
    b.className = 'pakbtn ' + x[1];
    if (item.status === x[2]) b.style.cssText = 'outline:3px solid currentColor;outline-offset:2px;';
    b.textContent = x[0];
    b.onclick = (function(status){ return function() {
      item.status = status;
      var kl = loadKlantBestellingen();
      var ki = kl.find(function(k){ return k.id === item.klantId; });
      if (ki) { ki.gepakt = (status === 'gepakt'); saveKlantBestellingen(kl); }
      setTimeout(function() { slideIdx < slideData.length-1 ? (slideIdx++, renderSlide()) : finishSlides(); }, 280);
    }; })(x[2]);
    acts.appendChild(b);
  });
  c.appendChild(acts);
}

function buildCatBar() {
  var bar = document.getElementById('catbar');
  if (slideMode !== 'markt') { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = '';
  var CATS = ['Hollandse kaas', 'Buitenlandse kaas', 'Overig', 'Non food'];
  var curCat = slideData[slideIdx].cat;
  CATS.forEach(function(cat) {
  
    var hasProds = slideData.some(function(p){ return p.cat === cat; });
    if (!hasProds) return;
    var btn = document.createElement('button');
    btn.className = 'cbbtn' + (cat === curCat ? ' cur' : '');
    btn.textContent = cat;
    btn.onclick = function() {
      closeNumpad();
    
      for (var i = 0; i < slideData.length; i++) {
        if (slideData[i].cat === cat) { slideIdx = i; renderSlide(); return; }
      }
    };
    bar.appendChild(btn);
  });

  var curBtn = bar.querySelector('.cur');
  if (curBtn) curBtn.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});
}

function buildNav() {
  var nav = document.getElementById('snav'); nav.innerHTML = '';
  var isLast = slideIdx === slideData.length - 1;

  var prev = document.createElement('button'); prev.className = 'btn btn-s'; prev.textContent = '←';
  prev.style.cssText = 'flex:0 0 auto;padding:.7rem 1rem;';
  if (slideIdx === 0) { prev.disabled = true; prev.style.opacity = '.35'; }
  prev.onclick = function() { if (slideIdx > 0) { closeNumpad(); slideIdx--; renderSlide(); } };
  nav.appendChild(prev);

  if (slideMode === 'markt' && !isLast) {
    var done = document.createElement('button'); done.className = 'btn btn-s'; done.textContent = '✓ Klaar';
    done.style.cssText = 'flex:1;border-color:var(--ok);color:var(--ok);';
    done.onclick = function() { closeNumpad(); finishSlides(); };
    nav.appendChild(done);
  }

  var next = document.createElement('button'); next.className = 'btn btn-p'; next.textContent = isLast ? '✓ Klaar' : 'Volgende →';
  next.style.flex = '2';
  next.onclick = function() { closeNumpad(); isLast ? finishSlides() : (slideIdx++, renderSlide()); };
  nav.appendChild(next);
}

function showExtraNotitieSlide() {

  var c = document.getElementById('scontent');
  c.style.animation = 'none'; void c.offsetWidth; c.style.animation = '';
  c.innerHTML = '';

  var icon = document.createElement('div'); icon.style.cssText='font-size:3rem;margin-bottom:.5rem'; icon.textContent='📝'; c.appendChild(icon);
  var title = document.createElement('div'); title.className='sname'; title.style.fontSize='clamp(1.8rem,6vw,2.8rem)'; title.textContent='Extra notitie'; c.appendChild(title);
  var sub = document.createElement('div'); sub.className='sunit'; sub.style.marginBottom='1.5rem'; sub.textContent='Optioneel — voor het pakhuis'; c.appendChild(sub);

  var wrap = document.createElement('div'); wrap.className='notitie-wrap'; wrap.style.width='100%'; wrap.style.maxWidth='340px';
  var ta = document.createElement('textarea'); ta.className='notitie-inp'; ta.rows=4;
  ta.placeholder='Bijv. extra dozen meesturen, koeling controleren...';
  ta.value = marktExtraNotitie || '';
  ta.oninput = function() { marktExtraNotitie = this.value; };
  wrap.appendChild(ta); c.appendChild(wrap);

  var nav = document.getElementById('snav'); nav.innerHTML = '';
  var skipBtn = document.createElement('button'); skipBtn.className='btn btn-s'; skipBtn.style.flex='1';
  skipBtn.textContent='Overslaan'; 
  skipBtn.onclick = function() { marktExtraNotitie = ''; slaMarktOpEnKlaar(); };
  var saveBtn = document.createElement('button'); saveBtn.className='btn btn-p'; saveBtn.style.flex='2';
  saveBtn.textContent='✓ Klaar';
  saveBtn.onclick = function() { slaMarktOpEnKlaar(); };
  nav.appendChild(skipBtn); nav.appendChild(saveBtn);

  document.getElementById('catbar').style.display = 'none';

  document.getElementById('scnt').textContent = 'Extra notitie';
  document.getElementById('pfill').style.width = '100%';
}

function slaMarktOpEnKlaar() {
  var items = slideData.filter(function(i){ return i.aantal > 0; });
  var _m = markten.find(function(x){ return x.id === currentMarktId; });
  var _marktD = _m ? eerstvolgendeMarktDatum(_m.dag) : new Date();
  var _pakD = pakhuisDatum(_marktD);
  var bestelling = {
    marktId: currentMarktId,
    datum: new Date().toLocaleDateString('nl-NL'),
    marktDatumStr: datumNaar(_marktD),
    pakhuisDatumStr: datumNaar(_pakD),
    marktNaam: _m ? _m.dag + ' — ' + _m.naam : '',
    items: items,
    extraNotitie: marktExtraNotitie || '',
    isConcept: false
  };
  saveBestelling(bestelling);
  releaseLock(currentMarktId);
  marktExtraNotitie = '';
  showOvMarkt(items, bestelling.extraNotitie);
}

function finishSlides() {
  pakhuisReadOnly = false; // reset meekijk modus na afronden
  if (slideMode === 'markt') {
    var items = slideData.filter(function(i){ return i.aantal > 0; });
    if (!items.length) { toast('Je hebt nog niets ingevuld', 'err'); return; }
  
    showExtraNotitieSlide();
  } else {
    savePakhuisVoortgang();
    showOvPakhuis();
  }
}

// ════ OVERZICHT ════
function showOvMarkt(items, extraNotitie) {
  document.getElementById('ov-afrond-btn').style.display = 'none';
  document.getElementById('ov-doorgaan-btn').style.display = 'none';
  document.getElementById('ovtitle').textContent = '✅ Bestelling ingediend';
  document.getElementById('ovsub').textContent = items.length + ' producten · opgeslagen voor pakhuis';
  var body = document.getElementById('ovbody'); body.innerHTML = '';

  if (extraNotitie) {
    var notSec = document.createElement('div'); notSec.style.cssText='background:#fffbe6;border:1px solid #f0d060;border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem';
    var notT = document.createElement('div'); notT.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7a5a00;margin-bottom:.3rem'; notT.textContent='📝 Extra notitie'; notSec.appendChild(notT);
    var notV = document.createElement('div'); notV.style.cssText='font-size:.875rem;color:#5a4000;line-height:1.5'; notV.textContent=extraNotitie; notSec.appendChild(notV);
    body.appendChild(notSec);
  }

  var sec = document.createElement('div'); sec.className = 'ovsec';
  var t = document.createElement('div'); t.className = 'ovsec-title ok'; t.textContent = '📦 Jouw bestelling';
  sec.appendChild(t);
  items.forEach(function(i) {
    var row = document.createElement('div'); row.className = 'ovitem ok';
    var n = document.createElement('span'); n.className = 'ovitem-name'; n.textContent = i.name;
    var v = document.createElement('span'); v.className = 'ovitem-val'; v.textContent = i.aantal + ' ' + i.unit;
    row.appendChild(n); row.appendChild(v); sec.appendChild(row);
  });
  body.appendChild(sec);
  go('overzicht');
}

function moveItem(item) {

  var inMain = slideData.indexOf(item);
  var inAfg = (slideData._afgehandeld||[]).indexOf(item);
  if (item.status === 'niet-gepakt') {
    if (inAfg >= 0) { slideData._afgehandeld.splice(inAfg,1); slideData.push(item); }
  } else {
    if (inMain >= 0) { slideData.splice(inMain,1); if(!slideData._afgehandeld) slideData._afgehandeld=[]; slideData._afgehandeld.push(item); }
  }
}

function getAllePakItems() {

  var afgehandeld = slideData._afgehandeld || [];
  return slideData.concat(afgehandeld);
}

function showOvPakhuis() {
  var alleItems = getAllePakItems();
  var regulier = alleItems.filter(function(i){ return !i.isKlant; });
  var klantItems = alleItems.filter(function(i){ return i.isKlant; });
  var gepakt = regulier.filter(function(i){return i.status==='gepakt';});
  var niet = regulier.filter(function(i){return i.status==='niet-gepakt';});
  var manco = regulier.filter(function(i){return i.status==='manco';});
  var opmerking = regulier.filter(function(i){return i.status==='opmerking';});
  var geenStatus = regulier.filter(function(i){return !i.status;});
  var klantGepakt = klantItems.filter(function(i){return i.status==='gepakt';});
  var klantNiet = klantItems.filter(function(i){return i.status==='niet-gepakt'||i.status==='manco';});
  document.getElementById('ov-afrond-btn').style.display = 'flex';
  var _actie = alleItems.filter(function(i){return i.status==='niet-gepakt'||i.status==='opmerking';});
  document.getElementById('ov-doorgaan-btn').style.display = _actie.length > 0 ? 'flex' : 'none';
  document.getElementById('ovtitle').textContent = '🏭 Pakhuis overzicht';
  var _opmerking = regulier.filter(function(i){return i.status==='opmerking';}).length;
  document.getElementById('ovsub').textContent = gepakt.length+' gepakt · '+niet.length+' niet gepakt · '+manco.length+' manco' + (_opmerking>0?' · '+_opmerking+' opmerking':'') + (klantItems.length > 0 ? ' · '+klantItems.length+' klant' : '');
  var body = document.getElementById('ovbody'); body.innerHTML = '';

  function addSec(items, cls, label) {
    if (!items.length) return;
    var sec = document.createElement('div'); sec.className = 'ovsec'; body.appendChild(sec);
    var t = document.createElement('div'); t.className = 'ovsec-title '+cls; t.textContent = label+' ('+items.length+')'; sec.appendChild(t);
    items.forEach(function(i) {
      if (i.isKlant) return;
      var wrap = document.createElement('div'); wrap.style.marginBottom='.4rem'; sec.appendChild(wrap);
      var row = document.createElement('div'); row.className = 'ovitem '+cls; row.style.cssText += ';cursor:pointer;margin-bottom:0';
      var n = document.createElement('span'); n.className = 'ovitem-name'; n.textContent = i.name;
      var right = document.createElement('div'); right.style.cssText='display:flex;align-items:center;gap:.4rem';
      var v = document.createElement('span'); v.className = 'ovitem-val'; v.textContent = i.aantal+' '+i.unit;
      var edit = document.createElement('span'); edit.style.cssText='font-size:.7rem;color:var(--mid);opacity:.7'; edit.textContent='✎';
      right.appendChild(v); right.appendChild(edit);
      row.appendChild(n); row.appendChild(right); wrap.appendChild(row);
      if (i.notitie) {
        var nt = document.createElement('div');
        nt.style.cssText = 'font-size:.75rem;color:#7a5a00;background:#fffbe6;border:1px solid #f0d060;border-radius:0 0 8px 8px;padding:.3rem .75rem;margin-top:-4px;';
        nt.textContent = '📝 ' + i.notitie; wrap.appendChild(nt);
      }
      if (i.pakopmerking) {
        var po = document.createElement('div');
        po.style.cssText = 'font-size:.75rem;color:#1a5c8b;background:#eaf2fb;border:1px solid #b8d4ea;border-radius:0 0 8px 8px;padding:.3rem .75rem;margin-top:-4px;';
        po.textContent = '📝 ' + i.pakopmerking; wrap.appendChild(po);
      }
    
      row.onclick = (function(item){ return function() {
        var existing = wrap.querySelector('.status-picker');
        if (existing) { existing.remove(); return; }
        var picker = document.createElement('div'); picker.className='status-picker';
        picker.style.cssText = 'padding:.5rem 0';

      
        var btnRow = document.createElement('div'); btnRow.style.cssText='display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.4rem';
        [['✅ Gepakt','gepakt','ok'],['❌ Niet gepakt','niet-gepakt','err'],['⚠️ Manco','manco','warn'],['📝 Opmerking','opmerking','blauw']].forEach(function(x) {
          var pb = document.createElement('button');
          var stijl = x[2]==='ok'?'background:var(--okbg);color:var(--ok);border-color:#90d4a8'
            :x[2]==='err'?'background:var(--errbg);color:var(--err);border-color:#f5a09a'
            :x[2]==='warn'?'background:var(--wbg);color:var(--warn);border-color:#f0c070'
            :'background:#eaf2fb;color:#1a5c8b;border-color:#b8d4ea';
          pb.style.cssText = 'padding:.3rem .75rem;border-radius:20px;border:1.5px solid;font-size:.75rem;font-weight:600;cursor:pointer;font-family:"DM Sans",sans-serif;'+stijl;
          if (item.status === x[1]) pb.style.outline = '2px solid currentColor';
          pb.textContent = x[0];
          pb.onclick = function(e) {
            e.stopPropagation();
            if (x[1] === 'opmerking') {
            
              var taWrap = picker.querySelector('.opmerking-ta-wrap');
              if (taWrap) { taWrap.style.display = taWrap.style.display==='none'?'':'none'; return; }
              var taWrap2 = document.createElement('div'); taWrap2.className='opmerking-ta-wrap';
              var ta = document.createElement('textarea'); ta.className='notitie-inp';
              ta.placeholder='Typ de opmerking hier...'; ta.rows=2; ta.value=item.pakopmerking||'';
              ta.onclick=function(e){e.stopPropagation();};
              var savebtn = document.createElement('button'); savebtn.className='btn btn-p btn-sm';
              savebtn.style.cssText='margin-top:.4rem;width:100%'; savebtn.textContent='✓ Opslaan';
              savebtn.onclick = function(e) {
                e.stopPropagation();
                if (!ta.value.trim()) { toast('Typ eerst een opmerking','err'); return; }
                item.pakopmerking = ta.value.trim();
                item.status = 'opmerking';
                moveItem(item);
                savePakhuisVoortgang();
                showOvPakhuis();
              };
              taWrap2.appendChild(ta); taWrap2.appendChild(savebtn); picker.appendChild(taWrap2);
              setTimeout(function(){ ta.focus(); }, 100);
              return;
            }
            item.status = x[1];
            if (x[1] !== 'opmerking') item.pakopmerking = '';
            moveItem(item);
            savePakhuisVoortgang();
            showOvPakhuis();
          };
          btnRow.appendChild(pb);
        });
        picker.appendChild(btnRow);
        wrap.appendChild(picker);
      }; })(i);
    });
  }

  addSec(gepakt, 'ok', '✅ Gepakt');
  addSec(niet, 'err', '❌ Niet gepakt');
  addSec(manco, 'warn', '⚠️ Manco');
  addSec(opmerking, 'opmerking', '📝 Opmerking');
  if (geenStatus.length) addSec(geenStatus, '', '○ Niet verwerkt');

  if (klantGepakt.length || klantNiet.length) {
    var klantSec = document.createElement('div'); klantSec.className = 'ovsec'; body.appendChild(klantSec);
    var klantT = document.createElement('div'); klantT.className = 'ovsec-title ok';
    klantT.style.cssText += ';border-color:#ffc107;color:#856404';
    klantT.textContent = '👤 Klantbestellingen'; klantSec.appendChild(klantT);
    klantGepakt.forEach(function(i) {
      var row = document.createElement('div'); row.className = 'ovitem ok'; klantSec.appendChild(row);
      var n = document.createElement('span'); n.className = 'ovitem-name'; n.textContent = i.naam; row.appendChild(n);
      var v = document.createElement('span'); v.className = 'ovitem-val'; v.style.color='var(--ok)'; v.textContent = '✅ Gepakt'; row.appendChild(v);
    });
    klantNiet.forEach(function(i) {
      var row = document.createElement('div'); row.className = 'ovitem err'; klantSec.appendChild(row);
      var n = document.createElement('span'); n.className = 'ovitem-name'; n.textContent = i.naam; row.appendChild(n);
      var v = document.createElement('span'); v.className = 'ovitem-val'; v.style.color='var(--err)'; v.textContent = i.status==='manco'?'⚠️ Manco':'❌ Niet gepakt'; row.appendChild(v);
    });
  }

  go('overzicht');
}

// ov-home/back2 handled above

// ════ NUMPAD ════
var npItem = null;
function openNumpad(item) {
  npItem = item; npVal = String(item.aantal || 0);
  document.getElementById('npdisp').textContent = npVal || '0';
  document.getElementById('npover').classList.add('on');
}
function closeNumpad() {
  if (npItem && document.getElementById('npover').classList.contains('on')) {
    npItem.aantal = parseInt(npVal) || 0;
  }
  document.getElementById('npover').classList.remove('on');
}
document.getElementById('npover').onclick = function(e) { if (e.target === this) closeNumpad(); };
document.querySelectorAll('.nk').forEach(function(btn) {
  btn.onclick = function() {
    var k = this.getAttribute('data-k');
    if (k === 'del') { npVal = npVal.slice(0,-1); }
    else if (k === 'ok') {
      if (npItem) { npItem.aantal = parseInt(npVal)||0; var d = document.querySelector('.adisp'); if(d) d.textContent = npItem.aantal; }
      document.getElementById('npover').classList.remove('on'); return;
    } else { if (npVal.length >= 3) return; npVal += k; }
    document.getElementById('npdisp').textContent = npVal || '0';
  };
});

// ════ BEHEER ════
// beh-back handled in new wagen structure above

function renderBeheer() {
  var body = document.getElementById('behbody'); body.innerHTML = '';
  if (behMarktId !== null) {
    renderPaklijst(body);
  } else {
    renderBeheerHome(body);
  }
}

function renderBeheerHome(body) {
  document.getElementById('beh-title').textContent = huidigeWagen === 'w1' ? 'Beheer Wagen 1' : 'Beheer Wagen 2';
  document.getElementById('beh-sub').textContent = 'Paklijsten per markt';

  var secM = mk('div','bsec'); body.appendChild(secM);
  var titleM = mk('div','bsec-title'); titleM.textContent = '🏪 Kies een markt om de paklijst aan te passen'; secM.appendChild(titleM);

  getSortedMarkten().forEach(function(m) {
    var row = mk('div','brow'); secM.appendChild(row);
    var info = mk('div',''); info.style.flex = '1';
    var n = mk('div','brow-name'); n.textContent = m.dag + ' — ' + m.naam; info.appendChild(n);
    var d = mk('div','brow-sub');
    d.textContent = m.producten.length + ' producten'; info.appendChild(d);
    row.appendChild(info);
    var pb = mk('button','btn btn-s btn-sm'); pb.textContent = '📋 Paklijst aanpassen';
    pb.onclick = openPaklijstFactory(m.id);
    row.appendChild(pb);
  });

  var secV = mk('div','bsec'); secV.style.marginTop='1.5rem'; body.appendChild(secV);
  var titleV = mk('div','bsec-title'); titleV.textContent = '📅 Extra vrije dagen'; secV.appendChild(titleV);
  var subV = mk('div',''); subV.style.cssText='font-size:.75rem;color:var(--mid);margin-bottom:.8rem';
  subV.textContent = 'NL feestdagen worden automatisch overgeslagen. Voeg hier extra vrije dagen toe.';
  secV.appendChild(subV);

  function renderVrijeDagen() {
    var lijstV = document.getElementById('vrije-dagen-lijst');
    if (!lijstV) return;
    lijstV.innerHTML = '';
    var extra = getExtraVrijeDagen();
    if (!extra.length) {
      var leeg = mk('div',''); leeg.style.cssText='font-size:.8rem;color:var(--mid);padding:.4rem 0';
      leeg.textContent='Geen extra vrije dagen ingesteld';
      lijstV.appendChild(leeg);
      return;
    }
    extra.forEach(function(d, i) {
      var rij = mk('div','brow'); rij.style.padding='.4rem .6rem';
      var datumEl = mk('div',''); datumEl.style.flex='1'; datumEl.style.fontSize='.88rem';
      datumEl.textContent = d;
      var delBtn = mk('button','btn btn-d btn-sm'); delBtn.textContent='🗑';
      delBtn.onclick = (function(idx){ return function() {
        var lijst = getExtraVrijeDagen();
        lijst.splice(idx, 1);
        saveExtraVrijeDagen(lijst);
        renderVrijeDagen();
        toast('Vrije dag verwijderd', 'ok');
      }; })(i);
      rij.appendChild(datumEl); rij.appendChild(delBtn);
      lijstV.appendChild(rij);
    });
  }

  var lijstV = mk('div',''); lijstV.id = 'vrije-dagen-lijst'; secV.appendChild(lijstV);
  renderVrijeDagen();

  var addRow = mk('div',''); addRow.style.cssText='display:flex;gap:.5rem;align-items:center;margin-top:.6rem';
  var datumInp = mk('input','fi'); datumInp.type='date'; datumInp.style.flex='1';
  var addVrijBtn = mk('button','btn btn-s btn-sm'); addVrijBtn.textContent='➕ Toevoegen';
  addVrijBtn.onclick = function() {
    var val = datumInp.value;
    if (!val) { toast('Kies een datum','err'); return; }
  
    var p = val.split('-');
    var formatted = p[2] + '-' + p[1] + '-' + p[0];
    var extra = getExtraVrijeDagen();
    if (extra.indexOf(formatted) >= 0) { toast('Datum staat er al in','err'); return; }
    extra.push(formatted);
    extra.sort();
    saveExtraVrijeDagen(extra);
    datumInp.value = '';
    renderVrijeDagen();
    toast('Vrije dag toegevoegd ✓', 'ok');
  };
  addRow.appendChild(datumInp); addRow.appendChild(addVrijBtn);
  secV.appendChild(addRow);
}

function stdChangeFactory(pid) {
  return function() { customStd['s_'+pid] = parseInt(this.value)||0; saveStd(); };
}
function openPaklijstFactory(mid) {
  return function() { behMarktId = mid; behCat = null; renderBeheer(); };
}
function verwijderMarktFactory(mid) {
  return function() {
    var idx = -1;
    for (var i = 0; i < markten.length; i++) {
      if (markten[i].id == mid) { idx = i; break; }
    }
    if (idx === -1) { toast('Markt niet gevonden (id:'+mid+')','err'); return; }
    var naam = markten[idx].naam;
    markten.splice(idx, 1);
    saveMarkten();
    toast(naam + ' verwijderd ✓','ok');
    renderBeheer();
  };
}

function renderPaklijst(body) {
  var m = markten.find(function(x){return x.id === behMarktId;});
  document.getElementById('beh-title').textContent = m.dag + ' — ' + m.naam;
  document.getElementById('beh-sub').textContent = 'Paklijst aanpassen';

  var countEl = mk('div',''); countEl.style.cssText = 'font-size:.8rem;color:var(--mid);margin-bottom:.8rem';
  function updateCount() { countEl.textContent = m.producten.length + ' producten op de lijst'; }
  body.appendChild(countEl);

  var addSec = mk('div','bsec'); addSec.style.marginBottom='1rem'; body.appendChild(addSec);
  var addTitle = mk('div','bsec-title'); addTitle.textContent = '➕ Product toevoegen'; addSec.appendChild(addTitle);
  var addCard = mk('div','fcard'); addSec.appendChild(addCard);
  var addBody2 = mk('div','fcard-body'); addCard.appendChild(addBody2);
  var frow = mk('div','frow'); addBody2.appendChild(frow);
  var g1 = mk('div',''); frow.appendChild(g1);
  var l1 = mk('label','fl'); l1.textContent='Naam *'; g1.appendChild(l1);
  var naamInp = mk('input','fi'); naamInp.placeholder='bijv. Seizoenskaas'; g1.appendChild(naamInp);
  var g2 = mk('div',''); frow.appendChild(g2);
  var l2 = mk('label','fl'); l2.textContent='Eenheid'; g2.appendChild(l2);
  var unitInp = mk('input','fi'); unitInp.placeholder='st, kg, ½'; g2.appendChild(unitInp);
  var frow2 = mk('div','frow'); frow2.style.marginTop='.5rem'; addBody2.appendChild(frow2);
  var g3 = mk('div',''); frow2.appendChild(g3);
  var l3 = mk('label','fl'); l3.textContent='Categorie'; g3.appendChild(l3);
  var catSel = mk('select','fi');
  ['Hollandse kaas','Buitenlandse kaas','Overig','Non food'].forEach(function(c) {
    var o = mk('option',''); o.value=c; o.textContent=c; catSel.appendChild(o);
  });
  g3.appendChild(catSel);
  var g4 = mk('div',''); frow2.appendChild(g4);
  var l4 = mk('label','fl'); l4.textContent='Standaard'; g4.appendChild(l4);
  var stdInp2 = mk('input','fi'); stdInp2.type='number'; stdInp2.min='0'; stdInp2.value='1'; g4.appendChild(stdInp2);
  var addBtn = mk('button','btn btn-p btn-full'); addBtn.style.marginTop='.5rem'; addBtn.textContent='➕ Toevoegen'; addBody2.appendChild(addBtn);
  addBtn.onclick = function() {
    var naam = naamInp.value.trim();
    if (!naam) { toast('Vul een naam in','err'); return; }
    var newId = 'custom_' + Date.now();
    var cp = getCustomProducts();
    var newProd = { id: newId, name: naam, cat: catSel.value, unit: unitInp.value.trim()||'st', std: parseInt(stdInp2.value)||1 };
    cp.push(newProd);
    saveCustomProducts(cp);
  
    var allProds = getDefaultProducts().concat(getCustomProducts());
    var lastIdxInCat = -1;
    for (var i = m.producten.length - 1; i >= 0; i--) {
      var pid = m.producten[i];
      var pp = allProds.find(function(x){ return x.id === pid; });
      if (pp && pp.cat === catSel.value) { lastIdxInCat = i; break; }
    }
    if (lastIdxInCat >= 0) {
      m.producten.splice(lastIdxInCat + 1, 0, newId);
    } else {
      m.producten.push(newId);
    }
    saveMarkten();
    naamInp.value=''; unitInp.value=''; stdInp2.value='1';
    toast(naam + ' toegevoegd ✓','ok');
    updateCount();
    renderBeheer();
  };

  buildCatFilters(body, true);
  updateCount();

  var prodList = mk('div',''); body.appendChild(prodList);
  var marktStdObj = getMarktStd(m.id);

  var allProds = getDefaultProducts().concat(getCustomProducts());
  var prods = behCat ? allProds.filter(function(p){return p.cat===behCat;}) : allProds;

  prods.forEach(function(p) {
    var isOn = m.producten.indexOf(p.id) >= 0;
    var row = mk('div','pitem' + (isOn ? ' on' : '')); prodList.appendChild(row);

  
    if (isOn) {
      var volg = mk('div',''); volg.style.cssText='display:flex;flex-direction:column;gap:1px;margin-right:.4rem;flex-shrink:0';
      var pUp = mk('button',''); pUp.style.cssText='background:none;border:1px solid #ccc;border-radius:4px;width:22px;height:20px;font-size:.65rem;cursor:pointer;line-height:1;padding:0';
      pUp.textContent='▲';
      var pDown = mk('button',''); pDown.style.cssText='background:none;border:1px solid #ccc;border-radius:4px;width:22px;height:20px;font-size:.65rem;cursor:pointer;line-height:1;padding:0';
      pDown.textContent='▼';
      var curIdx = m.producten.indexOf(p.id);
      if (curIdx === 0) pUp.disabled = true;
      if (curIdx === m.producten.length - 1) pDown.disabled = true;
      pUp.onclick = (function(pid){ return function(e) {
        e.stopPropagation();
        var i = m.producten.indexOf(pid);
        if (i > 0) { var tmp=m.producten[i]; m.producten[i]=m.producten[i-1]; m.producten[i-1]=tmp; }
        saveMarkten(); renderBeheer();
      }; })(p.id);
      pDown.onclick = (function(pid){ return function(e) {
        e.stopPropagation();
        var i = m.producten.indexOf(pid);
        if (i < m.producten.length-1) { var tmp=m.producten[i]; m.producten[i]=m.producten[i+1]; m.producten[i+1]=tmp; }
        saveMarkten(); renderBeheer();
      }; })(p.id);
      volg.appendChild(pUp); volg.appendChild(pDown);
      row.appendChild(volg);
    }

  
    var chk = mk('div','pcheck'); chk.textContent = isOn ? '✓' : ''; row.appendChild(chk);

  
    var name = mk('div','pname'); name.textContent = p.name; row.appendChild(name);

  
    if (isOn) {
      var stdVal = marktStdObj['s_' + p.id] !== undefined ? marktStdObj['s_' + p.id] :
        (customStd['s_' + p.id] !== undefined ? customStd['s_' + p.id] :
        (allProds.find(function(x){return x.id===p.id;}) || {std:0}).std);
      var sinp = mk('input','stdinp'); sinp.type='number'; sinp.min='0'; sinp.value=stdVal;
      sinp.onclick = function(e){e.stopPropagation();};
      sinp.onchange = (function(pid){ return function() {
        var ms = getMarktStd(behMarktId);
        ms['s_' + pid] = parseInt(this.value)||0;
        saveMarktStd(behMarktId, ms);
      }; })(p.id);
      row.appendChild(sinp);
    }

  
    var cat = mk('span','pcat'); cat.textContent = p.unit; row.appendChild(cat);

  
    if (String(p.id).indexOf('custom_') === 0) {
      var del = mk('button','btn btn-d btn-sm'); del.style.marginLeft='.3rem'; del.textContent='🗑';
      del.onclick = (function(pid, pnaam){ return function(e) {
        e.stopPropagation();
        var cp = getCustomProducts().filter(function(x){return x.id!==pid;});
        saveCustomProducts(cp);
        markten.forEach(function(mx){ var i=mx.producten.indexOf(pid); if(i>=0) mx.producten.splice(i,1); });
        saveMarkten();
        toast(pnaam + ' verwijderd', 'ok');
        renderBeheer();
      }; })(p.id, p.name);
      row.appendChild(del);
    }

  
    row.onclick = function(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      var idx2 = m.producten.indexOf(p.id);
      if (idx2 >= 0) { m.producten.splice(idx2,1); row.classList.remove('on'); chk.textContent=''; }
      else { m.producten.push(p.id); row.classList.add('on'); chk.textContent='✓'; }
      saveMarkten(); updateCount();
      renderBeheer();
    };
  });
}
