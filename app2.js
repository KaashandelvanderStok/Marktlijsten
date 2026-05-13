
function buildCatFilters(parent, isPaklijst) {
  var cats = [...new Set(getDefaultProducts().map(function(p){return p.cat;}))];
  var row = mk('div','bcf'); parent.appendChild(row);
  function makeBtn(label, cat) {
    var b = mk('button','cfbtn'+(behCat===cat||(!behCat&&cat===null)?' on':'')); b.textContent = label;
    b.onclick = function() { behCat = cat; renderBeheer(); }; row.appendChild(b);
  }
  makeBtn('Alles', null);
  cats.forEach(function(c){ makeBtn(c, c); });
}

// ════ HELPERS ════
function mk(tag, cls) { var el = document.createElement(tag); if(cls) el.className = cls; return el; }
function toast(msg, type) {
  var t = document.getElementById('toast'); t.textContent = msg;
  t.className = 'toast '+(type||'ok')+' on';
  setTimeout(function(){ t.classList.remove('on'); }, 3000);
}

// ════ SLIDE BACK ════
document.getElementById('slide-back').onclick = function() {
  pakhuisReadOnly = false; // reset meekijk modus
  closeNumpad();
  if (slideMode === 'markt') {
  
    localStorage.setItem(('vds2_resume_'+huidigeWagen), JSON.stringify({ mode: 'markt', idx: slideIdx, data: slideData }));
    autoSaveMarktConcept(); // ook naar Supabase
    releaseLock(currentMarktId);
    loadData();
    renderMarktKies();
    go('markt-kies');
  } else {
  
    var _readonly = pakhuisReadOnly;
    pakhuisReadOnly = false; // tijdelijk uitzetten zodat save werkt
    savePakhuisVoortgang();
    pakhuisReadOnly = _readonly;
    renderPakhuisKies();
    go('pakhuis-kies');
  }
};

function savePakhuisVoortgang() {
  if (!currentMarktId) return;
  if (pakhuisReadOnly) return; // meekijk modus - nooit opslaan
  var all = loadAllBestellingen();
  var b = all[String(currentMarktId)];
  if (!b) return;

  var statusMap = {};
  slideData.filter(function(i){ return !i.isKlant; }).forEach(function(i){ statusMap[i.id] = i.status || null; });
  (slideData._afgehandeld || []).filter(function(i){ return !i.isKlant; }).forEach(function(i){ statusMap[i.id] = i.status || null; });

  var masterItems = (originalPakItems && originalPakItems.length) ? originalPakItems : (b.items || []);
  var alleRegulier = masterItems.map(function(i){
    return Object.assign({}, i, { status: statusMap.hasOwnProperty(i.id) ? statusMap[i.id] : (i.status || null) });
  });

  slideData.filter(function(i){ return !i.isKlant; }).forEach(function(i){
    if (!masterItems.find(function(x){ return x.id === i.id; })) {
      alleRegulier.push(Object.assign({}, i));
    }
  });
  (slideData._afgehandeld||[]).filter(function(i){ return !i.isKlant; }).forEach(function(i){
    if (!masterItems.find(function(x){ return x.id === i.id; })) {
      alleRegulier.push(Object.assign({}, i));
    }
  });
  b.voortgang = alleRegulier;

  var klantStatuses = {};
  slideData.filter(function(i){ return i.isKlant; }).forEach(function(i){ klantStatuses[i.klantId] = i.status; });
  (slideData._afgehandeld||[]).filter(function(i){ return i.isKlant; }).forEach(function(i){ klantStatuses[i.klantId] = i.status; });
  b.klantStatuses = klantStatuses;
  all[String(currentMarktId)] = b;
  localStorage.setItem(('vds2_bestellingen_'+huidigeWagen), JSON.stringify(all));

  var b2 = all[String(currentMarktId)];
  if (b2) sbUpsert('bestellingen', {id: String(currentMarktId)+'_'+huidigeWagen, wagen: huidigeWagen, markt_id: String(currentMarktId), data: b2, updated_at: new Date().toISOString()});
}

// ════ PAKHUIS KIES ════
function renderPakhuisKies() {
  var list = document.getElementById('pklist');
  list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--mid)">⏳ Synchroniseren...</div>';

  syncFromSupabase().then(function() {
    var all = loadAllBestellingen();
    _renderPakhuisKiesInner(all);
  });
}
function _renderPakhuisKiesInner(all) {
  var list = document.getElementById('pklist');
  list.innerHTML = '';
  var sorted = getSortedMarkten();
  var found = 0;

  sorted.forEach(function(m) {
    var b = all[String(m.id)];
    var el = document.createElement('div');
    el.className = 'mitem';

    var info = document.createElement('div');
    info.style.flex = '1';
    var name = document.createElement('div');
    name.className = 'mitem-name';
    name.textContent = m.dag + ' — ' + m.naam;
  
    var marktD = eerstvolgendeMarktDatum(m.dag);
    var pakD = pakhuisDatum(marktD);
    var dag = document.createElement('div');
    dag.className = 'mitem-dag';

    if (b && !b.isConcept) {
      found++;
      var totaal = b.items ? b.items.length : 0;
      var afgehandeld = b.voortgang ? b.voortgang.filter(function(i){return i.status==='gepakt'||i.status==='manco';}).length : 0;
      var inProgress = afgehandeld > 0 && afgehandeld < totaal;
      var extraNot = b.extraNotitie ? ' &nbsp;·&nbsp; 📝 ' + b.extraNotitie.substring(0,30) + (b.extraNotitie.length>30?'...':'') : '';
      var label = inProgress
        ? '<span style="color:var(--warn);font-weight:600">🔄 Bezig (' + afgehandeld + '/' + totaal + ' gedaan)</span>'
        : '<span style="color:var(--ok);font-weight:600">✅ Klaar om te pakken</span>';
      var pakDatumStr = datumNaar(pakD);
      var bestelMarktDatum = b.marktDatumStr || datumNaar(marktD);
      var klantAantal = loadKlantBestellingen().filter(function(k){ return k.marktDatumStr === bestelMarktDatum && !k.gepakt; }).length;
      var klantStr = klantAantal > 0 ? ' &nbsp;·&nbsp; 👤 ' + klantAantal + ' klant' + (klantAantal!==1?'en':'') : '';
      dag.innerHTML = label + ' &nbsp;·&nbsp; 📅 ' + datumNaar(marktD) + ' &nbsp;·&nbsp; 🏭 Pakken: ' + datumNaar(pakD) + ' &nbsp;·&nbsp; ' + totaal + ' prod.' + klantStr + extraNot;
      el.onclick = function() { startPakhuis(m.id, b); };
      el.style.cursor = 'pointer';
    } else {
      dag.innerHTML = '<span style="color:var(--mid)">Geen bestelling ingediend</span>';
      el.style.opacity = '0.5';
      el.style.cursor = 'default';
    }

    info.appendChild(name);
    info.appendChild(dag);
    el.appendChild(info);
    if (b) {
      var arr = document.createElement('div');
      arr.style.cssText = 'margin-left:auto;color:var(--gl)';
      arr.textContent = '→';
      el.appendChild(arr);
    }
    list.appendChild(el);
  });

  if (found === 0) {
    var empty = document.createElement('div');
    empty.style.cssText = 'text-align:center;padding:3rem 1rem;color:var(--mid)';
    empty.innerHTML = '<div style="font-size:2.5rem;margin-bottom:.75rem">📋</div><div style="font-weight:600">Geen bestellingen klaar</div><div style="font-size:.82rem;margin-top:.3rem">Laat de marktverkopers eerst een lijst aanmaken</div>';
    list.appendChild(empty);
  }
}

function startPakhuis(marktId, b) {
  currentMarktId = marktId;
  slideMode = 'pakhuis';

  if (b.voortgang) {
  
    var tePacken = b.voortgang.filter(function(i) { return !i.status || i.status === 'opmerking' || i.status === 'niet-gepakt'; });
    var gedaan = b.voortgang.filter(function(i) { return i.status === 'gepakt' || i.status === 'manco'; });
    if (tePacken.length === 0) {
    
      slideData = gedaan;
      slideData._afgehandeld = [];
    
      var m2 = markten.find(function(x){ return x.id === marktId; });
      if (m2) {
        var bestelMarktDatum2 = b.marktDatumStr || null;
        var klantList2 = loadKlantBestellingen();
        var klantItems2 = klantList2.filter(function(k){
        
          var matchStr = bestelMarktDatum2 && k.marktDatumStr === bestelMarktDatum2;
          var matchIso = b.marktDatumIso && k.marktDatumIso === b.marktDatumIso;
          return (matchStr || matchIso) && !k.gepakt;
        });
        klantItems2.forEach(function(k) {
          var ks = (b.klantStatuses && b.klantStatuses[k.id]) || null;
          slideData.push({ id:'klant_'+k.id, isKlant:true, klantId:k.id, naam:k.naam, name:'📦 '+k.naam, cat:'Klantbestelling', unit:'', aantal:0, notitie:k.notitie||'', producten:k.producten||[], marktDatumStr:k.marktDatumStr||'', status:ks });
        });
      }
      showOvPakhuis();
      return;
    }
  
    if (!originalPakItems || !originalPakItems.length) {
      originalPakItems = b.voortgang.filter(function(i){ return !i.isKlant; });
    }
    slideData = tePacken.map(function(i){ return Object.assign({}, i); });
    slideData._afgehandeld = gedaan;
    var resterend = slideData.length;
    toast(resterend + ' product' + (resterend === 1 ? '' : 'en') + ' nog te pakken', 'ok');
  } else {
    originalPakItems = b.items.slice(); // bewaar originele items
    slideData = b.items.map(function(i){ return Object.assign({}, i, {status: null}); });
    slideData._afgehandeld = [];
  }

  var m = markten.find(function(x){ return x.id === marktId; });
  if (m) {
  
    var bestelMarktDatum = b.marktDatumStr || null;
    var klantList = loadKlantBestellingen();
    var klantVandaag = klantList.filter(function(k) {
    
      var matchStr = bestelMarktDatum && k.marktDatumStr === bestelMarktDatum;
      var matchIso = b.marktDatumIso && k.marktDatumIso === b.marktDatumIso;
      return (matchStr || matchIso) && !k.gepakt;
    });
    klantVandaag.forEach(function(k) {
    
      var klantStatus = (b.klantStatuses && b.klantStatuses[k.id]) || null;
      slideData.push({
        id: 'klant_' + k.id,
        isKlant: true,
        klantId: k.id,
        naam: k.naam,
        name: '📦 ' + k.naam,
        cat: 'Klantbestelling',
        unit: '',
        aantal: 0,
        notitie: k.notitie || '',
        producten: k.producten || [],
        marktDatumStr: k.marktDatumStr || '',
        status: klantStatus
      });
    });
  }

  slideIdx = 0;
  localStorage.removeItem(('vds2_resume_'+huidigeWagen));
  go('slide');
  renderSlide();
}

// ════ AFRONDEN ════
document.getElementById('ov-doorgaan-btn').onclick = function() {
  var alle = getAllePakItems();

  var tePacken = alle.filter(function(i){
    return !i.isKlant && (i.status === 'niet-gepakt' || i.status === 'opmerking');
  }).map(function(i){
    var copy = Object.assign({}, i);
    copy.status = null; // reset voor nieuwe ronde
    return copy;
  });

  var afgehandeld = alle.filter(function(i){
    return !i.isKlant && (i.status === 'gepakt' || i.status === 'manco');
  });

  var klantItems = alle.filter(function(i){ return i.isKlant; });

  if (tePacken.length === 0) {
    toast('Geen producten meer te verwerken', 'ok');
    return;
  }

  slideData = tePacken.concat(klantItems);
  slideData._afgehandeld = afgehandeld;
  slideIdx = 0;
  go('slide');
  renderSlide();
  savePakhuisVoortgang();
};

document.getElementById('ov-afrond-btn').onclick = function() {
  if (pakhuisReadOnly) { toast('👁 Meekijk modus — je kunt niet afronden', 'err'); return; }
  var alleItems = getAllePakItems();
  var gepakt = alleItems.filter(function(i){return !i.isKlant && i.status==='gepakt';}).length;
  var manco = alleItems.filter(function(i){return !i.isKlant && i.status==='manco';}).length;
  var niet = alleItems.filter(function(i){return !i.isKlant && i.status==='niet-gepakt';}).length;
  var geenStatus = alleItems.filter(function(i){return !i.isKlant && !i.status;}).length;

  var alleItems2 = getAllePakItems();
  var opmerking2 = alleItems2.filter(function(i){return !i.isKlant && i.status==='opmerking';}).length;

  if (geenStatus > 0) {
    toast('Er zijn nog ' + geenStatus + ' producten zonder status — verwerk ze eerst', 'err');
    return;
  }

  if (niet > 0) {
    toast('Er staan nog ' + niet + ' producten op "Niet gepakt" — gebruik eerst ▶ Doorgaan', 'err');
    return;
  }

  if (opmerking2 > 0) {
    toast('Er staan nog ' + opmerking2 + ' producten met een opmerking — verwerk deze eerst', 'err');
    return;
  }

  var m = markten.find(function(x){return x.id === currentMarktId;});
  var marktNaam = m ? m.naam : 'deze markt';
  document.getElementById('bevestig-tekst').innerHTML =
    'Je rondt de bestelling af voor <strong>' + marktNaam + '</strong>.<br><br>' +
    '✅ ' + gepakt + ' gepakt &nbsp;·&nbsp; ' +
    (manco ? '⚠️ ' + manco + ' manco' : '') +
    '<br><br>Na bevestiging wordt de bestelling verwijderd.';
  var overlay = document.getElementById('bevestig-overlay');
  overlay.style.display = 'flex';
};

function sluitBevestig() {
  document.getElementById('bevestig-overlay').style.display = 'none';
}

function bevestigAfronden() {
  sluitBevestig();

  var _afgehandeld = slideData._afgehandeld || [];
  var alleRegulierGesch = slideData.filter(function(i){ return !i.isKlant; })
    .concat(_afgehandeld.filter(function(i){ return !i.isKlant; }));
  var alleKlantGesch = slideData.filter(function(i){ return i.isKlant; })
    .concat(_afgehandeld.filter(function(i){ return i.isKlant; }));
  var alleItems = alleRegulierGesch.concat(alleKlantGesch);
  if (currentMarktId) {
    var all = loadAllBestellingen();
    var b = all[String(currentMarktId)];
    slaOpInGeschiedenis(currentMarktId, alleItems, b);
    verwijderBestelling(currentMarktId);
    originalPakItems = []; // reset na afronden
  }
  document.getElementById('ov-afrond-btn').style.display = 'none';
  document.getElementById('ov-doorgaan-btn').style.display = 'none';

  var title = document.getElementById('ovtitle');
  title.textContent = '✅ Afgerond';
  toast('Bestelling afgerond', 'ok');
}

// ════ KLANTBESTELLINGEN ════
var klantFilterDag = null;
var klantEditId = null;
var klantGekozenProducten = [];
var klantFormCat = null;

function loadKlantBestellingen() {
  try { return JSON.parse(localStorage.getItem(('vds2_klant_'+huidigeWagen))) || []; } catch(e) { return []; }
}
function saveKlantBestellingen(list) {
  localStorage.setItem(('vds2_klant_'+huidigeWagen), JSON.stringify(list));
  sbUpsert('klantbestellingen', {id: huidigeWagen, wagen: huidigeWagen, data: list, updated_at: new Date().toISOString()});
}

// btn-klant replaced by btn-klant-home in new wagen structure
// klant nav handled above

function renderKlantOverzicht() {
  var body = document.getElementById('klant-body');
  body.innerHTML = '';
  var list = loadKlantBestellingen();

  var dagen = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];

  var aanwezigePakDatums = [...new Set(list.map(function(b){return b.pakhuisDatumStr||b.dag||'?';}))].sort(function(a,b){
    function parse(s){ var p=s.split('-'); if(p.length!==3)return 0; return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])).getTime(); }
    return parse(a)-parse(b);
  });

  if (aanwezigePakDatums.length > 1) {
    var filterRow = mk('div','dag-filter'); body.appendChild(filterRow);
    var alles = mk('button','dag-filter-btn'+(klantFilterDag===null?' on':'')); alles.textContent = 'Alles';
    alles.onclick = function(){ klantFilterDag = null; renderKlantOverzicht(); }; filterRow.appendChild(alles);
    aanwezigePakDatums.forEach(function(d) {
      var b = mk('button','dag-filter-btn'+(klantFilterDag===d?' on':'')); b.textContent = d;
      b.onclick = function(){ klantFilterDag = d; renderKlantOverzicht(); }; filterRow.appendChild(b);
    });
  }

  var gefilterd = klantFilterDag ? list.filter(function(b){return (b.pakhuisDatumStr||b.dag||'?')===klantFilterDag;}) : list;

  gefilterd = gefilterd.slice().sort(function(a,b){
    if (a.gepakt !== b.gepakt) return a.gepakt ? 1 : -1;
    var da = a.marktDatumIso || '9999';
    var db = b.marktDatumIso || '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  if (!gefilterd.length) {
    var leeg = mk('div','leeg'); body.appendChild(leeg);
    var icon = mk('div','leeg-icon'); icon.textContent = '📝'; leeg.appendChild(icon);
    var txt = mk('div',''); txt.style.fontWeight = '600'; txt.textContent = 'Geen klantbestellingen'; leeg.appendChild(txt);
    var sub = mk('div',''); sub.style.cssText='font-size:.82rem;margin-top:.3rem'; sub.textContent = 'Klik op + Nieuw om een bestelling toe te voegen'; leeg.appendChild(sub);
    return;
  }

  var perPak = {};
  gefilterd.forEach(function(b) {
    var key = b.pakhuisDatumStr || b.dag || '?';
    if (!perPak[key]) perPak[key] = [];
    perPak[key].push(b);
  });

  var sortedKeys = Object.keys(perPak).sort(function(a,b) {
  
    function parse(s) {
      var p = s.split('-'); if(p.length!==3) return 0;
      return new Date(parseInt(p[2]),parseInt(p[1])-1,parseInt(p[0])).getTime();
    }
    return parse(a) - parse(b);
  });

  sortedKeys.forEach(function(pakDatumStr) {
    var groep = perPak[pakDatumStr];
    var eersteB = groep[0];
    var dagHdr = mk('div',''); dagHdr.style.cssText='font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-bottom:.5rem;margin-top:.75rem;padding-bottom:.3rem;border-bottom:1px solid var(--bdr)';
    var pakLabel = eersteB.pakhuisDag ? eersteB.pakhuisDag + ' ' : '';
    dagHdr.innerHTML = '🏭 Pakken: ' + pakLabel + pakDatumStr + ' &nbsp;→&nbsp; 📅 Markt: ' + (eersteB.marktDatumStr||eersteB.dag||'') + ' &nbsp;·&nbsp; ' + groep.filter(function(b){return !b.gepakt;}).length + ' open · ' + groep.filter(function(b){return b.gepakt;}).length + ' besteld';
    body.appendChild(dagHdr);

    groep.forEach(function(b) {
      var card = mk('div','kb-item'); if(b.gepakt) card.style.opacity='.6'; body.appendChild(card);
      var top = mk('div',''); top.style.cssText='display:flex;align-items:center;gap:.5rem'; card.appendChild(top);
      var naam = mk('div','kb-naam'); naam.textContent = b.naam; top.appendChild(naam);
      if(b.gepakt){ var gpbdg = mk('span',''); gpbdg.style.cssText='font-size:.7rem;background:var(--okbg);color:var(--ok);border-radius:12px;padding:.15rem .5rem;font-weight:600'; gpbdg.textContent='✅ Besteld'; top.appendChild(gpbdg); }
    
      if (b.marktDatumStr) {
        var datumrow = mk('div',''); datumrow.style.cssText='font-size:.75rem;color:var(--mid);margin-top:.2rem;display:flex;gap:.75rem;flex-wrap:wrap';
        datumrow.innerHTML = '📅 Markt: <strong style="color:var(--text)">' + b.marktDatumStr + '</strong> &nbsp;·&nbsp; 🏭 Pakken: <strong style="color:var(--text)">' + (b.pakhuisDatumStr||'') + '</strong>';
        card.appendChild(datumrow);
      }

    
      if (b.productenTekst || (b.producten && b.producten.length)) {
        var pl = mk('div','kb-prod'); card.appendChild(pl);
        var tekst = b.productenTekst || b.producten.map(function(p){ return p.aantal+'x '+p.naam; }).join('\n');
        tekst.split('\n').filter(function(r){return r.trim();}).forEach(function(regel) {
          var prow = mk('div',''); prow.style.cssText='padding:.1rem 0;border-bottom:1px solid var(--bdr);font-size:.82rem';
          prow.textContent = regel.trim(); pl.appendChild(prow);
        });
      }

      if (b.notitie) {
        var nt = mk('div',''); nt.style.cssText='font-size:.78rem;color:#7a5a00;background:#fffbe6;border:1px solid #f0d060;border-radius:6px;padding:.3rem .6rem;margin-top:.4rem'; nt.textContent='📝 '+b.notitie; card.appendChild(nt);
      }

      var acts = mk('div','kb-actions'); card.appendChild(acts);
      var gpBtn = mk('button','kb-gepakt'+(b.gepakt?' done':'')); 
      gpBtn.textContent = b.gepakt ? '✅ Besteld bij groothandel' : '○ Markeer als besteld';
      gpBtn.onclick = (function(id){ return function(){
        var l = loadKlantBestellingen();
        var item = l.find(function(x){return x.id===id;});
        if(item) { item.gepakt = !item.gepakt; saveKlantBestellingen(l); renderKlantOverzicht(); }
      }; })(b.id); acts.appendChild(gpBtn);
      var editBtn = mk('button','kb-gepakt'); editBtn.style.cssText='background:var(--gbg);border-color:var(--bdr);color:var(--green);'; editBtn.textContent = '✏️ Bewerken';
      editBtn.onclick = (function(id){ return function(){ openKlantForm(id); }; })(b.id); acts.appendChild(editBtn);
      var delBtn = mk('button','kb-del'); delBtn.textContent = '🗑 Verwijderen';
      delBtn.onclick = (function(id){ return function(){
        var l = loadKlantBestellingen();
        saveKlantBestellingen(l.filter(function(x){return x.id!==id;}));
        renderKlantOverzicht();
        toast('Bestelling verwijderd','ok');
      }; })(b.id); acts.appendChild(delBtn);
    });
  });
}

function openKlantForm(id) {
  klantEditId = id;
  klantFormCat = null;
  var list = loadKlantBestellingen();
  var bestaand = id ? list.find(function(x){return x.id===id;}) : null;
  klantGekozenProducten = []; // not used in new simple form
  document.getElementById('klant-form-title').textContent = id ? 'Bestelling bewerken' : 'Nieuwe bestelling';
  renderKlantForm(bestaand);
  go('klant-form');
}

function renderKlantForm(bestaand) {
  var body = document.getElementById('klant-form-body');
  body.innerHTML = '';

  var g1 = mk('div',''); g1.style.marginBottom='1rem'; body.appendChild(g1);
  var l1 = mk('label','fl'); l1.textContent = 'Naam klant *'; g1.appendChild(l1);
  var inp1 = mk('input','fi'); inp1.id = 'kf-naam'; inp1.placeholder = 'bijv. Jan de Vries';
  if(bestaand) inp1.value = bestaand.naam || ''; g1.appendChild(inp1);

  var g2 = mk('div',''); g2.style.marginBottom='1rem'; body.appendChild(g2);
  var l2 = mk('label','fl'); l2.textContent = 'Marktdatum'; g2.appendChild(l2);
  var marktSel = mk('select','fi'); marktSel.id = 'kf-marktdatum';

  for (var weekOffset = 0; weekOffset < 3; weekOffset++) {
    marktWeekLijst().forEach(function(m) {
      var marktD = new Date(m.marktDatum.getFullYear(), m.marktDatum.getMonth(), m.marktDatum.getDate() + (weekOffset * 7));
      var marktDatumStr = datumNaar(marktD);
      var o = mk('option','');
      o.value = datumNaarIso(marktD) + '|' + m.dag + '|' + m.id;
      o.textContent = m.dag + ' ' + marktDatumStr + ' — ' + m.naam;
      marktSel.appendChild(o);
    });
  }
  var custom = mk('option',''); custom.value = 'custom'; custom.textContent = '📅 Andere datum kiezen'; marktSel.appendChild(custom);
  if (bestaand && bestaand.marktDatumIso) {
    for (var oi=0; oi<marktSel.options.length; oi++) {
      if (marktSel.options[oi].value.startsWith(bestaand.marktDatumIso)) { marktSel.selectedIndex = oi; break; }
    }
  }
  var customWrap = mk('div',''); customWrap.style.cssText='margin-top:.5rem;display:none'; g2.appendChild(customWrap);
  var custInp = mk('input','fi'); custInp.id='kf-custom-datum'; custInp.type='date';
  custInp.min = datumNaarIso(new Date());
  if(bestaand && bestaand.marktDatumIso) custInp.value = bestaand.marktDatumIso;
  customWrap.appendChild(custInp);
  marktSel.onchange = function() {
    customWrap.style.display = this.value === 'custom' ? '' : 'none';
    updatePakhuisDatumPreview();
  };
  custInp.onchange = updatePakhuisDatumPreview;
  g2.appendChild(marktSel);
  var pakPreview = mk('div',''); pakPreview.id='kf-pak-preview';
  pakPreview.style.cssText='font-size:.78rem;color:var(--mid);margin-top:.4rem;padding:.4rem .6rem;background:var(--gbg);border-radius:8px;display:none';
  g2.appendChild(pakPreview);
  function updatePakhuisDatumPreview() {
    var marktD = getKfMarktDatum();
    if (!marktD) { pakPreview.style.display='none'; return; }
    var pakD = pakhuisDatum(marktD);
    pakPreview.style.display = '';
    pakPreview.textContent = '🏭 Pakhuis pakt op: ' + dagNaamVanDatum(pakD) + ' ' + datumNaar(pakD);
  }
  updatePakhuisDatumPreview();

  var g3 = mk('div',''); g3.style.marginBottom='1rem'; body.appendChild(g3);
  var l3 = mk('label','fl'); l3.textContent = 'Producten *'; g3.appendChild(l3);
  var prodInfo = mk('div',''); prodInfo.style.cssText='font-size:.75rem;color:var(--mid);margin-bottom:.5rem';
  prodInfo.textContent = 'Typ elk product op een nieuwe regel. Bijv: 2x Gouda Belegen'; g3.appendChild(prodInfo);
  var prodTa = mk('textarea','fi notitie-inp'); prodTa.id='kf-producten';
  prodTa.placeholder='Bijv: 2x Gouda Belegen, 1x Brie';
  prodTa.rows = 5; prodTa.style.fontFamily = "'DM Sans', sans-serif";
  if(bestaand && bestaand.productenTekst) prodTa.value = bestaand.productenTekst;
  else if(bestaand && bestaand.producten && bestaand.producten.length) {
  
    prodTa.value = bestaand.producten.map(function(p){ return p.aantal + 'x ' + p.naam; }).join('\n');
  }
  g3.appendChild(prodTa);

  var g4 = mk('div',''); g4.style.marginBottom='1rem'; body.appendChild(g4);
  var l4 = mk('label','fl'); l4.textContent = 'Notitie (optioneel)'; g4.appendChild(l4);
  var ta = mk('textarea','fi notitie-inp'); ta.id='kf-notitie'; ta.placeholder='Bijv. glutenvrij, extra rijp...'; ta.rows=2;
  if(bestaand) ta.value = bestaand.notitie || ''; g4.appendChild(ta);

  function getKfMarktDatum() {
    var sel = document.getElementById('kf-marktdatum');
    if (!sel) return null;
    if (sel.value === 'custom') {
      var v = document.getElementById('kf-custom-datum').value;
      return v ? isoNaarDatum(v) : null;
    }
    var iso = sel.value.split('|')[0];
    return isoNaarDatum(iso);
  }
  function getKfMarktDag() {
    var sel = document.getElementById('kf-marktdatum');
    if (!sel || sel.value === 'custom') {
      var d = getKfMarktDatum();
      return d ? dagNaamVanDatum(d) : '';
    }
    return sel.value.split('|')[1];
  }

  var savebtn = mk('button','btn btn-p btn-full'); savebtn.style.marginTop='1.5rem'; savebtn.textContent='💾 Opslaan'; body.appendChild(savebtn);
  savebtn.onclick = function() {
    var naam = document.getElementById('kf-naam').value.trim();
    if(!naam) { toast('Vul een naam in','err'); return; }
    var marktD = getKfMarktDatum();
    if(!marktD) { toast('Kies een marktdatum','err'); return; }
    var dag = getKfMarktDag();
    var pakD = pakhuisDatum(marktD);
    var marktDatumIso = datumNaarIso(marktD);
    var notitie = document.getElementById('kf-notitie').value.trim();
    var productenTekst = document.getElementById('kf-producten').value.trim();
    if (!productenTekst) { toast('Vul minimaal één product in','err'); return; }
  
    var producten = productenTekst.split('\n').filter(function(r){ return r.trim(); }).map(function(r){
      return { naam: r.trim(), aantal: 1, unit: '' };
    });
    var list = loadKlantBestellingen();
    if(klantEditId) {
      var item = list.find(function(x){return x.id===klantEditId;});
      if(item){ item.naam=naam; item.dag=dag; item.marktDatumIso=marktDatumIso; item.marktDatumStr=datumNaar(marktD); item.pakhuisDatumStr=datumNaar(pakD); item.pakhuisDag=dagNaamVanDatum(pakD); item.notitie=notitie; item.productenTekst=productenTekst; item.producten=producten; }
    } else {
      list.push({ id: Date.now(), naam: naam, dag: dag, marktDatumIso: marktDatumIso, marktDatumStr: datumNaar(marktD), pakhuisDatumStr: datumNaar(pakD), pakhuisDag: dagNaamVanDatum(pakD), notitie: notitie, productenTekst: productenTekst, producten: producten, gepakt: false, datum: new Date().toLocaleDateString('nl-NL') });
    }
    saveKlantBestellingen(list);
    toast(naam + ' opgeslagen ✓','ok');
    klantFilterDag = null;
    renderKlantOverzicht();
    go('klant');
  };
}

// ════ GESCHIEDENIS ════
// uitleg handled above

// btn-geschiedenis handled above
document.getElementById('gesch-back').onclick = function() { go('home'); };
document.getElementById('gesch-detail-back').onclick = function() { renderGeschiedenis(); go('geschiedenis'); };
document.getElementById('ov-back2').onclick = function() { go('home'); };
document.getElementById('ov-home').onclick = function() { go('home'); };

// gesch-detail-back handled above

function loadGeschiedenis() {

  var all = [];
  try { all = JSON.parse(localStorage.getItem('vds2_geschiedenis_all')) || []; } catch(e) {}

  if (!all.length) {
    var g1 = []; var g2 = [];
    try { g1 = JSON.parse(localStorage.getItem('vds2_geschiedenis_w1')) || []; } catch(e) {}
    try { g2 = JSON.parse(localStorage.getItem('vds2_geschiedenis_w2')) || []; } catch(e) {}
    all = g1.concat(g2);
  }

  var seen = {};
  all.forEach(function(e) {
    var key = (e.wagen || 'w1') + '_' + String(e.marktId) + '_' + (e.marktDatumStr || '').replace(/-/g,'');
    seen[key] = e;
  });
  return Object.values(seen).sort(function(a, b) { return b.id - a.id; });
}
function saveGeschiedenisList(wagen, list) {

  localStorage.setItem('vds2_geschiedenis_' + wagen, JSON.stringify(list));
}
function saveGeschiedenis(list) {

  if (list.length > 200) list = list.slice(list.length - 200);
  localStorage.setItem('vds2_geschiedenis_all', JSON.stringify(list));

  var w1 = list.filter(function(e){ return e.wagen === 'w1' || !e.wagen; });
  var w2 = list.filter(function(e){ return e.wagen === 'w2'; });
  saveGeschiedenisList('w1', w1);
  saveGeschiedenisList('w2', w2);
}
function slaOpInGeschiedenis(marktId, slideDataSnap, bestelling) {
  var m = markten.find(function(x){ return x.id === marktId; });
  var gesch = loadGeschiedenis();

  var marktDatumStr = (bestelling && bestelling.marktDatumStr) 
    ? bestelling.marktDatumStr 
    : datumNaar(eerstvolgendeMarktDatum(m ? m.dag : 'Vrijdag'));

  var pakhuisDatumStr = (bestelling && bestelling.pakhuisDatumStr) 
    ? bestelling.pakhuisDatumStr : '';

  var statusMap = {};
  slideDataSnap.filter(function(i){ return !i.isKlant; })
    .forEach(function(i){ statusMap[i.id] = i.status || null; });

  var regulierItems = [];
  if (bestelling && bestelling.items) {
  
    regulierItems = bestelling.items.map(function(i) {
      return Object.assign({}, i, { status: statusMap.hasOwnProperty(i.id) ? statusMap[i.id] : i.status });
    });
  } else {
    regulierItems = slideDataSnap.filter(function(i){ return !i.isKlant; });
  }

  var entry = {
    id: Date.now(),
    wagen: huidigeWagen,
    marktId: marktId,
    marktNaam: m ? m.dag + ' — ' + m.naam : 'Onbekend',
    marktDatumStr: marktDatumStr,
    pakhuisDatumStr: pakhuisDatumStr,
    afgerondOp: new Date().toLocaleString('nl-NL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    items: regulierItems,
    klantItems: slideDataSnap.filter(function(i){ return i.isKlant; }),
    extraNotitie: (bestelling && bestelling.extraNotitie) || ''
  };

  var bestaandeIdx = gesch.findIndex(function(e) {
    return String(e.marktId) === String(marktId) && e.marktDatumStr === marktDatumStr && e.wagen === huidigeWagen;
  });
  if (bestaandeIdx >= 0) {
    entry.id = gesch[bestaandeIdx].id; // bewaar originele id
    gesch[bestaandeIdx] = entry; // handmatig afronden wint altijd
  } else {
    gesch.push(entry);
  }
  saveGeschiedenis(gesch);

  var geschId = huidigeWagen + '_' + String(marktId) + '_' + entry.marktDatumStr.replace(/-/g,'');
  entry.id = entry.id; // bewaar originele timestamp id
  sbUpsert('geschiedenis', {
    id: geschId,
    wagen: huidigeWagen,
    data: entry,
    created_at: new Date().toISOString()
  });
}

function renderGeschiedenis() {
  var body = document.getElementById('gesch-body');
  body.innerHTML = '';
  var gesch = loadGeschiedenis(); // al gesorteerd: nieuwste eerst

  if (!gesch.length) {
    var leeg = mk('div','leeg'); body.appendChild(leeg);
    var icon = mk('div','leeg-icon'); icon.textContent = '📖'; leeg.appendChild(icon);
    var txt = mk('div',''); txt.style.fontWeight='600'; txt.textContent = 'Nog geen geschiedenis'; leeg.appendChild(txt);
    var sub = mk('div',''); sub.style.cssText='font-size:.82rem;margin-top:.3rem'; sub.textContent = 'Afgeronde bestellingen verschijnen hier'; leeg.appendChild(sub);
    return;
  }

  var perWeek = {};
  gesch.forEach(function(e) {
  
    var parts = e.marktDatumStr ? e.marktDatumStr.split('-') : [];
    var weekKey = parts.length === 3 ? 'Week van ' + parts[0] + '-' + parts[1] + '-' + parts[2] : 'Onbekend';
  
    if (parts.length === 3) {
      var d = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
      var weekNr = getWeekNr(d);
      weekKey = 'Week ' + weekNr + ' (' + parts[1] + '-' + parts[2] + ')';
    }
    if (!perWeek[weekKey]) perWeek[weekKey] = [];
    perWeek[weekKey].push(e);
  });

  Object.keys(perWeek).forEach(function(week) {
    var weekHdr = mk('div',''); weekHdr.style.cssText='font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-bottom:.5rem;margin-top:.75rem;padding-bottom:.3rem;border-bottom:1px solid var(--bdr)';
    weekHdr.textContent = week;
    body.appendChild(weekHdr);

    perWeek[week].forEach(function(e) {
      var card = mk('div','kb-item'); card.style.cursor='pointer'; body.appendChild(card);
      card.onclick = function() { openGeschiedenisDetail(e); };

      var top = mk('div',''); top.style.cssText='display:flex;align-items:center;justify-content:space-between';
      var naam = mk('div','kb-naam'); naam.textContent = e.marktNaam; top.appendChild(naam);
      var wBadge = mk('span',''); wBadge.style.cssText='font-size:.65rem;font-weight:700;padding:.1rem .35rem;border-radius:5px;color:white;background:'+(e.wagen==='w2'?'#1A5C8B':'#1E6B3A');
      wBadge.textContent = e.wagen ? e.wagen.toUpperCase() : 'W1'; top.appendChild(wBadge);
      var arr = mk('div',''); arr.style.cssText='color:var(--gl);font-size:1rem;margin-left:.25rem'; arr.textContent='→'; top.appendChild(arr);
      card.appendChild(top);

      var meta = mk('div',''); meta.style.cssText='font-size:.78rem;color:var(--mid);margin-top:.25rem';
      var gepaktAantal = e.items.filter(function(i){return i.status==='gepakt';}).length;
      var mancoAantal = e.items.filter(function(i){return i.status==='manco';}).length;
      var nietAantal = e.items.filter(function(i){return i.status==='niet-gepakt';}).length;
      meta.innerHTML = '📅 ' + (e.marktDatumStr||'') + ' &nbsp;·&nbsp; Afgerond: ' + (e.afgerondOp||'') + '<br>✅ ' + gepaktAantal + ' gepakt &nbsp;·&nbsp; ⚠️ ' + mancoAantal + ' manco &nbsp;·&nbsp; ❌ ' + nietAantal + ' niet gepakt';
      if (e.klantItems && e.klantItems.length) {
        meta.innerHTML += ' &nbsp;·&nbsp; 👤 ' + e.klantItems.length + ' klant' + (e.klantItems.length!==1?'en':'');
      }
      card.appendChild(meta);
    });
  });
}

function getWeekNr(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  var dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(),0,1));
  return Math.ceil((((date - yearStart) / 86400000) + 1)/7);
}

function openGeschiedenisDetail(e) {
  document.getElementById('gesch-detail-title').textContent = e.marktNaam;
  document.getElementById('gesch-detail-sub').textContent = (e.marktDatumStr||'') + ' · Afgerond: ' + (e.afgerondOp||'');
  var body = document.getElementById('gesch-detail-body');
  body.innerHTML = '';

  var items = e.items || [];
  var klantItems = e.klantItems || [];

  if (e.extraNotitie) {
    var notSec = mk('div',''); notSec.style.cssText='background:#fffbe6;border:1px solid #f0d060;border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem';
    var notT = mk('div',''); notT.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7a5a00;margin-bottom:.3rem'; notT.textContent='📝 Notitie van marktverkoper'; notSec.appendChild(notT);
    var notV = mk('div',''); notV.style.cssText='font-size:.875rem;color:#5a4000;line-height:1.5'; notV.textContent=e.extraNotitie; notSec.appendChild(notV);
    body.appendChild(notSec);
  }

  var tabs = mk('div',''); tabs.style.cssText='display:flex;gap:.5rem;margin-bottom:1rem';
  var tabPak = mk('button','btn btn-p btn-sm'); tabPak.textContent = '📦 Volledige paklijst';
  var tabStatus = mk('button','btn btn-s btn-sm'); tabStatus.textContent = '✅ Statusoverzicht';
  tabs.appendChild(tabPak); tabs.appendChild(tabStatus); body.appendChild(tabs);

  var viewPak = mk('div',''); body.appendChild(viewPak);
  var viewStatus = mk('div',''); viewStatus.style.display='none'; body.appendChild(viewStatus);

  tabPak.onclick = function() {
    viewPak.style.display=''; viewStatus.style.display='none';
    tabPak.className='btn btn-p btn-sm'; tabStatus.className='btn btn-s btn-sm';
  };
  tabStatus.onclick = function() {
    viewPak.style.display='none'; viewStatus.style.display='';
    tabPak.className='btn btn-s btn-sm'; tabStatus.className='btn btn-p btn-sm';
  };

  if (!items.length) {
    var leeg = mk('div',''); leeg.style.cssText='text-align:center;padding:2rem;color:var(--mid)';
    leeg.textContent = 'Geen producten gevonden in deze bestelling.'; viewPak.appendChild(leeg);
  } else {
  
    var cats = {};
    items.forEach(function(i) {
      var cat = i.cat || 'Overig';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(i);
    });
    Object.keys(cats).forEach(function(cat) {
      var catHdr = mk('div',''); catHdr.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin:1rem 0 .4rem;padding-bottom:.3rem;border-bottom:1px solid var(--bdr)';
      catHdr.textContent = cat; viewPak.appendChild(catHdr);
      cats[cat].forEach(function(i) {
        var statusCls = i.status==='gepakt'?'ok':i.status==='manco'?'warn':i.status==='niet-gepakt'?'err':'';
        var statusIcon = i.status==='gepakt'?'✅':i.status==='manco'?'⚠️':i.status==='niet-gepakt'?'❌':'○';
        var row = mk('div','ovitem '+(statusCls||'')); 
        if (!statusCls) row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:.6rem .8rem;border-radius:8px;margin-bottom:.3rem;background:var(--bg)';
        var left = mk('div',''); left.style.flex='1';
        var n = mk('span','ovitem-name'); n.textContent = i.name || i.naam; left.appendChild(n);
        if (i.notitie) {
          var nt = mk('div',''); nt.style.cssText='font-size:.72rem;color:#7a5a00;margin-top:.15rem'; nt.textContent='📝 '+i.notitie; left.appendChild(nt);
        }
        var right = mk('div',''); right.style.cssText='display:flex;align-items:center;gap:.5rem;flex-shrink:0';
        var val = mk('span','ovitem-val'); val.textContent = i.aantal + ' ' + (i.unit||''); right.appendChild(val);
        var si = mk('span',''); si.style.fontSize='1rem'; si.textContent=statusIcon; right.appendChild(si);
        row.appendChild(left); row.appendChild(right); viewPak.appendChild(row);
      });
    });

  
    if (klantItems.length) {
      var kHdr = mk('div',''); kHdr.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#856404;margin:1rem 0 .4rem;padding-bottom:.3rem;border-bottom:1px solid #ffc107';
      kHdr.textContent = '👤 Klantbestellingen'; viewPak.appendChild(kHdr);
      klantItems.forEach(function(k) {
        var statusIcon = k.status==='gepakt'?'✅':k.status==='manco'?'⚠️':k.status==='niet-gepakt'?'❌':'○';
        var kcard = mk('div',''); kcard.style.cssText='background:#fffbe6;border:1px solid #f0d060;border-radius:10px;padding:.7rem 1rem;margin-bottom:.4rem';
        var ktop = mk('div',''); ktop.style.cssText='display:flex;justify-content:space-between;align-items:center';
        var kn = mk('span',''); kn.style.fontWeight='600'; kn.textContent=k.naam; ktop.appendChild(kn);
        var ks = mk('span',''); ks.textContent=statusIcon; ktop.appendChild(ks);
        kcard.appendChild(ktop);
        if (k.producten && k.producten.length) {
          k.producten.forEach(function(p) {
            var pr = mk('div',''); pr.style.cssText='font-size:.78rem;color:var(--mid);margin-top:.2rem';
            pr.textContent='• '+p.naam+': '+p.aantal+' '+p.unit; kcard.appendChild(pr);
          });
        }
        if (k.notitie) { var knt=mk('div',''); knt.style.cssText='font-size:.75rem;color:#856404;margin-top:.3rem'; knt.textContent='📝 '+k.notitie; kcard.appendChild(knt); }
        viewPak.appendChild(kcard);
      });
    }
  }

  function addSec(items, cls, label) {
    if (!items.length) return;
    var sec = mk('div','ovsec'); viewStatus.appendChild(sec);
    var t = mk('div','ovsec-title '+cls); t.textContent = label + ' (' + items.length + ')'; sec.appendChild(t);
    items.forEach(function(i) {
      var row = mk('div','ovitem '+cls);
      var n = mk('span','ovitem-name'); n.textContent = i.isKlant ? '👤 '+i.naam : (i.name||i.naam);
      var v = mk('span','ovitem-val'); v.textContent = i.isKlant ? '' : (i.aantal + ' ' + (i.unit||''));
      row.appendChild(n); row.appendChild(v); sec.appendChild(row);
    });
  }
  var gepakt = items.filter(function(i){return i.status==='gepakt';});
  var niet = items.filter(function(i){return i.status==='niet-gepakt';});
  var manco = items.filter(function(i){return i.status==='manco';});
  var klantGepakt = klantItems.filter(function(i){return i.status==='gepakt';});
  var klantNiet = klantItems.filter(function(i){return i.status!=='gepakt';});
  addSec(gepakt,'ok','✅ Gepakt');
  addSec(niet,'err','❌ Niet gepakt');
  addSec(manco,'warn','⚠️ Manco');
  if (klantGepakt.length||klantNiet.length) {
    addSec(klantGepakt,'ok','👤 Klanten gepakt');
    addSec(klantNiet,'err','👤 Klanten niet gepakt');
  }

  go('geschiedenis-detail');
}

// ════ WAGEN OVERZICHT ════

// ════ SLIDE OVERZICHT PANEL ════
document.getElementById('slide-ov-btn').onclick = function() {
  renderSlideOvPanel();
  document.getElementById('slide-ov-panel').style.display = 'flex';
  document.getElementById('slide-ov-panel').style.flexDirection = 'column';
};
document.getElementById('slide-ov-close').onclick = function() {
  document.getElementById('slide-ov-panel').style.display = 'none';
};

function renderSlideOvPanel() {
  var kleur = getWagenKleur();
  document.getElementById('slide-ov-panel-hdr').style.background = kleur;

  var body = document.getElementById('slide-ov-body');
  body.innerHTML = '';

  if (slideMode === 'markt') {
    document.getElementById('slide-ov-title').textContent = 'Lijst overzicht';
    document.getElementById('slide-ov-sub').textContent = 'Alle producten die je hebt ingevuld';

  
    var filled = slideData.filter(function(i){ return i.aantal > 0; });
    var cats = ['Hollandse kaas','Buitenlandse kaas','Overig','Non food'];

    if (!filled.length) {
      var leeg = mk('div',''); leeg.style.cssText='text-align:center;padding:2rem;color:var(--mid)';
      leeg.textContent = 'Nog niets ingevuld'; body.appendChild(leeg);
      return;
    }

    cats.forEach(function(cat) {
      var items = filled.filter(function(i){ return i.cat === cat; });
      if (!items.length) return;
      var hdr = mk('div',''); hdr.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin:.75rem 0 .4rem;padding-bottom:.3rem;border-bottom:1px solid var(--bdr)';
      hdr.textContent = cat; body.appendChild(hdr);
      items.forEach(function(i) {
        var row = mk('div',''); row.style.cssText='display:flex;justify-content:space-between;padding:.4rem .2rem;border-bottom:1px solid var(--bdr);font-size:.875rem;cursor:pointer';
        var n = mk('span',''); n.textContent = i.name; row.appendChild(n);
        var v = mk('span',''); v.style.cssText='font-weight:700;color:var(--green)'; v.textContent = i.aantal + ' ' + i.unit; row.appendChild(v);
      
        row.onclick = (function(item){ return function() {
          var idx2 = slideData.indexOf(item);
          if (idx2 >= 0) { slideIdx = idx2; renderSlide(); }
          document.getElementById('slide-ov-panel').style.display = 'none';
        }; })(i);
        body.appendChild(row);
      });
    });

  
    var totaal = filled.reduce(function(sum, i){ return sum + i.aantal; }, 0);
    var sumEl = mk('div',''); sumEl.style.cssText='margin-top:1rem;padding:.75rem;background:var(--gbg);border-radius:10px;font-size:.85rem;text-align:center;color:var(--green);font-weight:600';
    sumEl.textContent = filled.length + ' producten · ' + totaal + ' stuks totaal'; body.appendChild(sumEl);

  } else {
  
    document.getElementById('slide-ov-title').textContent = 'Pakhuis overzicht';
    document.getElementById('slide-ov-sub').textContent = 'Status van alle producten';

    var alleItems = getAllePakItems();
    var regulier = alleItems.filter(function(i){ return !i.isKlant; });

    var gepakt  = regulier.filter(function(i){ return i.status === 'gepakt'; });
    var manco   = regulier.filter(function(i){ return i.status === 'manco'; });
    var niet    = regulier.filter(function(i){ return i.status === 'niet-gepakt'; });
    var opmerking = regulier.filter(function(i){ return i.status === 'opmerking'; });
    var open    = regulier.filter(function(i){ return !i.status; });

  
    var stats = mk('div',''); stats.style.cssText='display:flex;gap:.4rem;margin-bottom:1rem;flex-wrap:wrap';
    [[gepakt.length,'✅','var(--okbg)','var(--ok)'],[niet.length,'❌','var(--errbg)','var(--err)'],[manco.length,'⚠️','var(--wbg)','var(--warn)'],[open.length,'○','var(--bg)','var(--mid)']].forEach(function(x) {
      if (!x[0]) return;
      var s = mk('div',''); s.style.cssText='padding:.3rem .7rem;border-radius:20px;font-size:.78rem;font-weight:600;background:'+x[2]+';color:'+x[3];
      s.textContent = x[1] + ' ' + x[0]; stats.appendChild(s);
    });
    body.appendChild(stats);

  
    function addSection(items, cls, label) {
      if (!items.length) return;
      var hdr = mk('div',''); hdr.style.cssText='font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin:.75rem 0 .4rem;padding-bottom:.3rem;border-bottom:2px solid';
      hdr.className = 'ovsec-title ' + cls; hdr.textContent = label + ' (' + items.length + ')'; body.appendChild(hdr);
      items.forEach(function(i) {
        var row = mk('div','ovitem ' + cls); row.style.cursor='pointer';
        var n = mk('span','ovitem-name'); n.textContent = i.name || i.naam;
        var v = mk('span','ovitem-val'); v.textContent = i.aantal ? i.aantal + ' ' + (i.unit||'') : '';
        row.appendChild(n); row.appendChild(v);
      
        row.onclick = (function(item){ return function() {
          var idx2 = slideData.indexOf(item);
          if (idx2 >= 0) { slideIdx = idx2; renderSlide(); document.getElementById('slide-ov-panel').style.display = 'none'; }
          else { document.getElementById('slide-ov-panel').style.display = 'none'; showOvPakhuis(); }
        }; })(i);
        body.appendChild(row);
        if (i.pakopmerking) {
          var nt = mk('div',''); nt.style.cssText='font-size:.75rem;color:#1a5c8b;background:#eaf2fb;padding:.2rem .75rem;border-radius:0 0 6px 6px;margin-top:-3px';
          nt.textContent = '📝 ' + i.pakopmerking; body.appendChild(nt);
        }
      });
    }

    addSection(open, '', '○ Nog te doen');
    addSection(gepakt, 'ok', '✅ Gepakt');
    addSection(niet, 'err', '❌ Niet gepakt');
    addSection(manco, 'warn', '⚠️ Manco');
    addSection(opmerking, 'opmerking', '📝 Opmerking');
  }
}

// ════ AUTO-AFRONDEN ══════════════════════════════════
function autoAfrondVerlopen() {

  var nu = new Date();
  var vandaag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());

  ['w1','w2'].forEach(function(wagen) {
    var key = 'vds2_bestellingen_' + wagen;
    var all = {};
    try { all = JSON.parse(localStorage.getItem(key)) || {}; } catch(e) {}

    Object.keys(all).forEach(function(marktId) {
      var b = all[marktId];
      if (!b || !b.pakhuisDatumStr) return;

    
      var parts = b.pakhuisDatumStr.split('-');
      if (parts.length !== 3) return;
    
      var marktParts = (b.marktDatumStr || b.pakhuisDatumStr || '').split('-');
      var sluitDag;
      if (marktParts.length === 3) {
        var marktDag = new Date(parseInt(marktParts[2]), parseInt(marktParts[1])-1, parseInt(marktParts[0]));
        sluitDag = new Date(marktDag);
        sluitDag.setDate(sluitDag.getDate() - 1); // dag voor marktdag
      
        while (isFeestdag(sluitDag) || sluitDag.getDay() === 0) {
          sluitDag.setDate(sluitDag.getDate() - 1);
        }
        sluitDag.setHours(23, 59, 0, 0);
      } else {
      
        sluitDag = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
        sluitDag.setHours(23, 59, 0, 0);
      }

    
      if (nu > sluitDag) {
        console.log('Auto-afronden:', wagen, marktId, b.pakhuisDatumStr);

      
        var items = b.voortgang || b.items || [];
        var klantItems = [];

      
        var origWagen = huidigeWagen;
        huidigeWagen = wagen;
        loadData(); // laad markten voor de juiste wagen

      
        var marktObj = markten ? markten.find(function(x){ return String(x.id) === String(marktId); }) : null;
        var marktNaamStr = marktObj ? marktObj.dag + ' — ' + marktObj.naam : (b.marktNaam || String(marktId));

        var entry = {
          id: Date.now() + Math.random(),
          wagen: wagen,
          marktId: parseInt(marktId),
          marktNaam: marktNaamStr,
          marktDatumStr: b.marktDatumStr || '',
          pakhuisDatumStr: b.pakhuisDatumStr || '',
          afgerondOp: new Date().toLocaleString('nl-NL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
          items: items,
          klantItems: klantItems,
          extraNotitie: b.extraNotitie || '',
        };

      
        var gKey = 'vds2_geschiedenis_' + wagen;
        var gesch = [];
        try { gesch = JSON.parse(localStorage.getItem(gKey)) || []; } catch(e) {}

      
      
        var bestaandeIdx = gesch.findIndex(function(e) {
          return String(e.marktId) === String(marktId) && e.marktDatumStr === entry.marktDatumStr && e.wagen === wagen;
        });
        if (bestaandeIdx >= 0) {
          var bestaande = gesch[bestaandeIdx];
        
          var bestaandeItems = bestaande.items || [];
          var alleAfgerond = bestaandeItems.length > 0 && bestaandeItems.every(function(i) {
            return i.status === 'gepakt' || i.status === 'manco' || i.status === 'niet-gepakt' || i.status === 'opmerking';
          });
          if (!alleAfgerond) {
          
            gesch[bestaandeIdx] = entry;
          }
        
        } else {
          gesch.push(entry);
        }
        localStorage.setItem(gKey, JSON.stringify(gesch));

      
        var geschId = wagen + '_' + String(marktId) + '_' + entry.marktDatumStr.replace(/-/g,'');
        sbUpsert('geschiedenis', {
          id: geschId,
          wagen: wagen,
          data: entry,
          created_at: new Date().toISOString()
        });

      
        delete all[marktId];
        localStorage.setItem(key, JSON.stringify(all));
        sbDelete('bestellingen', 'id=eq.' + wagen + '_' + String(marktId));

        huidigeWagen = origWagen;

        console.log('Auto-afgerond:', wagen, marktId);
      }
    });
  });
}

// ════ GLOBAL SYNC ════
function globalSync() {

  document.querySelectorAll('.hdr-sync-btn').forEach(function(btn) {
    btn.querySelector('.sync-icon').style.animation = 'spin 1s linear infinite';
    btn.querySelector('.sync-label').textContent = '...';
    btn.disabled = true;
  });

  syncFromSupabase().then(function() {
    document.querySelectorAll('.hdr-sync-btn').forEach(function(btn) {
      btn.querySelector('.sync-icon').style.animation = '';
      btn.querySelector('.sync-label').textContent = 'Sync';
      btn.disabled = false;
    });
  
    if (pakhuisReadOnly && slideMode === 'pakhuis') {
      var all = loadAllBestellingen();
      var b = all[String(currentMarktId)];
      if (b) startPakhuis(currentMarktId, b);
      toast('👁 Voortgang bijgewerkt', 'ok');
      return;
    }
    toast('✓ Gesynchroniseerd', 'ok');
    
  
    var huidigScherm = document.querySelector('.scr.active');
    if (huidigScherm) {
      var id = huidigScherm.id;
      if (id === 's-pakhuis-kies') renderPakhuisKies();
      else if (id === 's-markt-kies') renderMarktKies();
      else if (id === 's-klant') renderKlantOverzicht();
      else if (id === 's-geschiedenis') { reinigGeschiedenis(); renderGeschiedenis(); }
      else if (id === 's-wagen1-home' || id === 's-wagen2-home') loadData();
    }
  }).catch(function() {
    document.querySelectorAll('.hdr-sync-btn').forEach(function(btn) {
      btn.querySelector('.sync-icon').style.animation = '';
      btn.querySelector('.sync-label').textContent = 'Sync';
      btn.disabled = false;
    });
    toast('Sync mislukt — controleer verbinding', 'err');
  });
}

function maakSyncKnop() {
  var btn = document.createElement('button');
  btn.className = 'hdr-sync-btn';
  btn.onclick = globalSync;
  btn.innerHTML = '<span class="sync-icon">↻</span><span class="sync-label">Sync</span>';
  return btn;
}

// ════ AUTO-SAVE CONCEPT ════
var _autoSaveTimer = null;
function autoSaveMarktConcept() {

  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(function() {
    if (slideMode !== 'markt' || !currentMarktId) return;
    if (pakhuisReadOnly) return; // meekijk modus - nooit opslaan
  
    var m = markten.find(function(x){ return x.id === currentMarktId; });
    if (!m) return;
    var marktD = eerstvolgendeMarktDatum(m.dag);
    var pakD = pakhuisDatum(marktD);
    var ingevuldeItems = slideData.filter(function(i){ return !i.isKlant && i.aantal > 0; });
  
    if (!ingevuldeItems.length) {
    
      sbDelete('bestellingen', 'id=eq.' + String(currentMarktId) + '_' + huidigeWagen);
      return;
    }
    var concept = {
      marktId: currentMarktId,
      marktNaam: m.dag + ' — ' + m.naam,
      marktDatumStr: datumNaar(marktD),
      pakhuisDatumStr: datumNaar(pakD),
      datum: new Date().toLocaleDateString('nl-NL'),
      items: ingevuldeItems,
      isConcept: true,
      extraNotitie: marktExtraNotitie || ''
    };
  
    localStorage.setItem('vds2_resume_' + huidigeWagen, JSON.stringify({
      mode: 'markt', idx: slideIdx, data: slideData
    }));
  
    sbUpsert('bestellingen', {
      id: String(currentMarktId) + '_' + huidigeWagen,
      wagen: huidigeWagen,
      markt_id: String(currentMarktId),
      data: concept,
      updated_at: new Date().toISOString()
    });
  }, 1500);
}

// ════ SWIPE ════
var tx = 0;
document.getElementById('s-slide').addEventListener('touchstart', function(e){ tx = e.touches[0].clientX; }, {passive:true});
document.getElementById('s-slide').addEventListener('touchend', function(e){
  if (document.getElementById('npover').classList.contains('on')) return;
  var d = tx - e.changedTouches[0].clientX;
  if (Math.abs(d) > 55) { closeNumpad(); d>0 ? (slideIdx<slideData.length-1&&(slideIdx++,renderSlide())) : (slideIdx>0&&(slideIdx--,renderSlide())); }
}, {passive:true});

// ════ DATUM HELPERS ════
var DAGNAMEN = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
var DAGVOLGORDE_NL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];

function datumNaar(d) {

  var dd = String(d.getDate()).padStart(2,'0');
  var mm = String(d.getMonth()+1).padStart(2,'0');
  return dd + '-' + mm + '-' + d.getFullYear();
}

function dagNaarNr(dag) {

  var map = {Maandag:1,Dinsdag:2,Woensdag:3,Donderdag:4,Vrijdag:5,Zaterdag:6,Zondag:0};
  return map[dag] !== undefined ? map[dag] : -1;
}

function eerstvolgendeMarktDatum(dag) {

  var now = new Date();
  now.setHours(0,0,0,0);
  var target = dagNaarNr(dag);
  var cur = now.getDay();
  var diff = (target - cur + 7) % 7;
  var d = new Date(now);
  d.setDate(d.getDate() + diff);
  return d;
}

// Nederlandse feestdagen (berekend per jaar)
function getNLFeestdagen(jaar) {

  var a = jaar % 19;
  var b = Math.floor(jaar / 100);
  var c = jaar % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19*a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2*e + 2*i - h - k) % 7;
  var m = Math.floor((a + 11*h + 22*l) / 451);
  var maand = Math.floor((h + l - 7*m + 114) / 31) - 1;
  var dag = ((h + l - 7*m + 114) % 31) + 1;
  var pasen = new Date(jaar, maand, dag);

  var feestdagen = [];

  feestdagen.push(new Date(jaar, 0, 1));

  var gv = new Date(pasen); gv.setDate(gv.getDate() - 2); feestdagen.push(gv);

  feestdagen.push(new Date(pasen));

  var p2 = new Date(pasen); p2.setDate(p2.getDate() + 1); feestdagen.push(p2);

  feestdagen.push(new Date(jaar, 3, 27));

  var hv = new Date(pasen); hv.setDate(hv.getDate() + 39); feestdagen.push(hv);

  var pk = new Date(pasen); pk.setDate(pk.getDate() + 49); feestdagen.push(pk);

  var pk2 = new Date(pasen); pk2.setDate(pk2.getDate() + 50); feestdagen.push(pk2);

  feestdagen.push(new Date(jaar, 11, 25));
  feestdagen.push(new Date(jaar, 11, 26));

  return feestdagen;
}

// Extra vrije dagen (handmatig instelbaar)
function getExtraVrijeDagen() {
  try { return JSON.parse(localStorage.getItem('vds2_extra_vrij') || '[]'); } catch(e) { return []; }
}
function saveExtraVrijeDagen(lijst) {
  localStorage.setItem('vds2_extra_vrij', JSON.stringify(lijst));
  sbUpsert('markten_config', { id: 'extra_vrij', wagen: 'global', data: lijst, updated_at: new Date().toISOString() });
}

function isFeestdag(datum) {
  var d = new Date(datum);
  d.setHours(0,0,0,0);
  var feestdagen = getNLFeestdagen(d.getFullYear());
  for (var i = 0; i < feestdagen.length; i++) {
    var f = new Date(feestdagen[i]); f.setHours(0,0,0,0);
    if (d.getTime() === f.getTime()) return true;
  }

  var extra = getExtraVrijeDagen();
  for (var j = 0; j < extra.length; j++) {
    var ex = new Date(extra[j]); ex.setHours(0,0,0,0);
    if (d.getTime() === ex.getTime()) return true;
  }
  return false;
}

function pakhuisDatum(marktDatum) {
  var d = new Date(marktDatum);
  d.setDate(d.getDate() - 1);

  while (d.getDay() === 0 || isFeestdag(d)) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

function isoNaarDatum(iso) {

  var parts = iso.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
}

function datumNaarIso(d) {
  var dd = String(d.getDate()).padStart(2,'0');
  var mm = String(d.getMonth()+1).padStart(2,'0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

function dagNaamVanDatum(d) {
  return DAGNAMEN[d.getDay()];
}

function marktWeekLijst() {

  return getSortedMarkten().map(function(m) {
    var marktD = eerstvolgendeMarktDatum(m.dag);
    var pakD = pakhuisDatum(marktD);
    return Object.assign({}, m, {
      marktDatum: marktD,
      marktDatumStr: datumNaar(marktD),
      pakhuisDatum: pakD,
      pakhuisDatumStr: datumNaar(pakD)
    });
  });
}

// ════ INIT ════
// Wis eventuele oude localStorage keys van eerdere versies
['kp_markten','kp_bestellingen','bl_markten','bl_laatste_bestelling','vds_markten','vds_std','vds_bestelling'].forEach(function(k){
  localStorage.removeItem(k);
});
// Load data for default wagen (w1)
loadData();
// Auto-afronden verlopen pakdagen bij start
autoAfrondVerlopen();
// Voeg sync knop toe aan alle headers
document.querySelectorAll('.hbar').forEach(function(hdr) {
  var syncBtn = maakSyncKnop();
  syncBtn.style.marginLeft = 'auto';
  hdr.appendChild(syncBtn);
});

