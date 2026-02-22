import { loadState, saveState, pushSandboxToOfficial } from './modules/store.js';
import { actions, selectors, Categories } from './modules/dataAuthority.js';
import { buildProductionPlanView, yesterdayLocal, startOfMonth } from './modules/simEngine.js';

let state = loadState();
const tabs = [
  ['products','1. Products & Recipes'],
  ['flow','2. Process Flow'],
  ['demand','3. Demand Planning'],
  ['plan','4. Production Plan'],
  ['data','5. Data & Scenarios'],
];

const el = id => document.getElementById(id);
const esc = s => (s??'').toString().replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const fmt = n => Number(n||0).toLocaleString(undefined,{maximumFractionDigits:1});
const dateRange = (start,days)=>{ const a=[]; let d=new Date(start+'T00:00:00'); for(let i=0;i<days;i++){a.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return a; };

function persist(){ saveState(state); }

function initShell(){
  el('tabs').innerHTML = tabs.map(([k,l])=>`<button class="tab-btn px-3 py-1.5 rounded border border-slate-300 text-sm ${state.ui.activeTab===k?'active':''}" data-tab="${k}">${l}</button>`).join('');
  el('tabs').onclick = e => {
    const btn = e.target.closest('[data-tab]'); if(!btn) return;
    state.ui.activeTab = btn.dataset.tab; persist(); render();
  };
  const fs = el('facilitySelector');
  const ds = selectors(state);
  fs.innerHTML = ds.facilities.map(f=>`<option value="${f.id}">${f.id} - ${esc(f.name)}</option>`).join('');
  fs.value = state.ui.selectedFacilityId;
  fs.onchange = ()=>{ state.ui.selectedFacilityId = fs.value; persist(); render(); };
  el('modeBadge').textContent = state.ui.mode.toUpperCase();
  el('modeBadge').className = 'pill ' + (state.ui.mode==='sandbox' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800');
  el('modeBadge').onclick = ()=>{ state.ui.mode = state.ui.mode==='sandbox'?'official':'sandbox'; persist(); render(); };
  el('pushOfficialBtn').onclick = ()=>{ pushSandboxToOfficial(state); persist(); alert('Sandbox pushed to Official'); render(); };
}

function render(){
  initShell();
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));
  el(`tab-${state.ui.activeTab}`).classList.remove('hidden');
  renderProducts(); renderFlow(); renderDemand(); renderPlan(); renderData();
}

function renderProducts(){
  const root = el('tab-products'); const s = selectors(state); const a = actions(state);
  root.innerHTML = `
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div class="card p-4">
      <h2 class="font-semibold mb-3">Products & Materials</h2>
      <form id="materialForm" class="grid grid-cols-2 gap-2 text-sm">
        <input class="border rounded px-2 py-1 col-span-2" name="name" placeholder="Name (e.g., MIA - IL (11%))" required>
        <input class="border rounded px-2 py-1" name="code" placeholder="Code (optional)">
        <select class="border rounded px-2 py-1" name="category">
          <option value="${Categories.RAW}">Raw Material</option>
          <option value="${Categories.FUEL}">Fuel</option>
          <option value="${Categories.INT}">Intermediate Product</option>
          <option value="${Categories.FIN}" selected>Finished Product</option>
        </select>
        <input class="border rounded px-2 py-1" type="number" step="0.01" name="landedCostUsdPerStn" placeholder="Cost USD/STn">
        <input class="border rounded px-2 py-1" type="number" step="0.01" name="calorificPowerMMBTUPerStn" placeholder="MMBTU/STn (fuel)">
        <input class="border rounded px-2 py-1" type="number" step="0.01" name="co2FactorKgPerMMBTU" placeholder="kgCO2/MMBTU (fuel)">
        <button class="col-span-2 bg-blue-600 text-white rounded px-3 py-2">Add Material/Product</button>
      </form>
      <div class="mt-4 max-h-[420px] overflow-auto">
        <table class="gridish w-full"><thead><tr><th>Name</th><th>Category</th><th>Code</th><th>ID</th></tr></thead><tbody>
          ${s.materials.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${esc(m.code)}</td><td class="text-[10px]">${esc(m.id)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No materials/products yet</td></tr>'}
        </tbody></table>
      </div>
    </div>
    <div class="card p-4">
      <h2 class="font-semibold mb-3">Recipe Editor (facility-scoped)</h2>
      <form id="recipeForm" class="space-y-2 text-sm">
        <div class="grid grid-cols-2 gap-2">
          <select name="productId" class="border rounded px-2 py-1" required>
            <option value="">Select intermediate or finished product</option>
            ${s.materials.filter(m=>[Categories.INT,Categories.FIN].includes(m.category)).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}
          </select>
          <input name="version" type="number" min="1" value="1" class="border rounded px-2 py-1" placeholder="Version">
        </div>
        <div id="recipeComponents" class="space-y-2"></div>
        <div class="flex gap-2">
          <button type="button" id="addRecipeLine" class="px-3 py-1.5 rounded border">+ Add Component</button>
          <button class="px-3 py-1.5 rounded bg-blue-600 text-white">Save Recipe</button>
        </div>
      </form>
      <div class="mt-4 max-h-[320px] overflow-auto text-xs">
        ${s.dataset.recipes.filter(r=>r.facilityId===state.ui.selectedFacilityId).map(r=>{
          const p = s.getMaterial(r.productId);
          return `<div class="border rounded p-2 mb-2"><div class="font-semibold">${esc(p?.name||r.productId)} <span class="muted">v${r.version}</span></div>${r.components.map(c=>`<div>${esc(s.getMaterial(c.materialId)?.name||c.materialId)}: ${c.pct}%</div>`).join('')}</div>`;
        }).join('') || '<div class="muted">No recipes saved yet</div>'}
      </div>
    </div>
  </div>`;

  const comps = root.querySelector('#recipeComponents');
  const addRecipeLine = ()=>{
    const div = document.createElement('div');
    div.className='grid grid-cols-[1fr_120px_40px] gap-2';
    div.innerHTML = `<select class="border rounded px-2 py-1" name="componentMaterialId"><option value="">Component material</option>${s.materials.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><input class="border rounded px-2 py-1" type="number" step="0.01" name="componentPct" placeholder="%"><button type="button" class="border rounded" data-remove>✕</button>`;
    div.querySelector('[data-remove]').onclick = ()=>div.remove();
    comps.appendChild(div);
  };
  root.querySelector('#addRecipeLine').onclick = addRecipeLine;
  addRecipeLine();
  addRecipeLine();

  root.querySelector('#materialForm').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    a.upsertMaterial(Object.fromEntries(fd.entries()));
    persist(); renderProducts(); renderDemand(); renderFlow(); renderPlan(); renderData();
    e.target.reset();
  };
  root.querySelector('#recipeForm').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rows = [...root.querySelectorAll('#recipeComponents > div')].map(div=>({
      materialId: div.querySelector('[name=componentMaterialId]').value,
      pct: +div.querySelector('[name=componentPct]').value || 0
    }));
    a.saveRecipe({ productId: fd.get('productId'), version:+fd.get('version')||1, components: rows });
    persist(); renderProducts(); renderPlan(); renderData();
  };
}

function renderFlow(){
  const root = el('tab-flow'); const s = selectors(state); const a = actions(state);
  const equipmentRows = s.equipment.map(eq=>{
    const caps = s.getCapsForEquipment(eq.id);
    return `<tr><td>${esc(eq.id)}</td><td>${esc(eq.name)}</td><td>${esc(eq.type)}</td><td>${caps.map(c=>`${esc(s.getMaterial(c.productId)?.name||c.productId)} @ ${fmt(c.maxRateStpd)} STn/d`).join('<br>')}</td></tr>`;
  }).join('');
  root.innerHTML = `
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
    <div class="card p-4 space-y-4">
      <div>
        <h2 class="font-semibold mb-2">Add Equipment</h2>
        <form id="eqForm" class="grid grid-cols-2 gap-2 text-sm">
          <select name="type" class="border rounded px-2 py-1"><option value="kiln">Kiln</option><option value="finish_mill">Finish Mill</option><option value="raw_mill">Raw Mill</option></select>
          <input name="name" class="border rounded px-2 py-1" placeholder="Name (e.g., FM1)">
          <button class="col-span-2 bg-blue-600 text-white rounded px-3 py-2">Add Equipment</button>
        </form>
      </div>
      <div>
        <h2 class="font-semibold mb-2">Add Storage</h2>
        <form id="stForm" class="grid grid-cols-2 gap-2 text-sm">
          <input name="name" class="border rounded px-2 py-1 col-span-2" placeholder="Storage name (e.g., MIA / INV / CLK / K1)" required>
          <select name="categoryHint" class="border rounded px-2 py-1"><option>CLINKER</option><option>CEMENT</option><option>RAW</option><option>FUEL</option></select>
          <select name="allowedProductId" class="border rounded px-2 py-1"><option value="">Allowed product</option>${s.materials.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
          <button class="col-span-2 bg-blue-600 text-white rounded px-3 py-2">Add Storage</button>
        </form>
      </div>
      <div>
        <h2 class="font-semibold mb-2">Equipment Capability</h2>
        <form id="capForm" class="grid grid-cols-2 gap-2 text-sm">
          <select name="equipmentId" class="border rounded px-2 py-1">${s.equipment.map(e=>`<option value="${e.id}">${esc(e.name)} (${e.type})</option>`).join('')}</select>
          <select name="productId" class="border rounded px-2 py-1">${s.materials.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
          <input type="number" step="0.1" name="maxRateStpd" class="border rounded px-2 py-1" placeholder="Max STn/day">
          <input type="number" step="0.01" name="electricKwhPerStn" class="border rounded px-2 py-1" placeholder="kWh/STn (mills)">
          <input type="number" step="0.01" name="thermalMMBTUPerStn" class="border rounded px-2 py-1 col-span-2" placeholder="MMBTU/STn (kiln)">
          <button class="col-span-2 bg-blue-600 text-white rounded px-3 py-2">Save Capability</button>
        </form>
      </div>
    </div>
    <div class="card p-4 xl:col-span-2">
      <h2 class="font-semibold mb-2">Process Setup Summary (source of truth)</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div class="font-semibold text-sm mb-1">Equipment</div>
          <div class="max-h-72 overflow-auto"><table class="gridish w-full"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Capabilities</th></tr></thead><tbody>${equipmentRows || '<tr><td colspan="4" class="muted">No equipment</td></tr>'}</tbody></table></div>
        </div>
        <div>
          <div class="font-semibold text-sm mb-1">Storages</div>
          <div class="max-h-72 overflow-auto"><table class="gridish w-full"><thead><tr><th>ID</th><th>Name</th><th>Family</th><th>Allowed Product</th></tr></thead><tbody>${s.storages.map(st=>`<tr><td>${esc(st.id)}</td><td>${esc(st.name)}</td><td>${esc(st.categoryHint||'')}</td><td>${(st.allowedProductIds||[]).map(pid=>esc(s.getMaterial(pid)?.name||pid)).join(', ')}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No storages</td></tr>'}</tbody></table></div>
        </div>
      </div>
    </div>
  </div>`;
  root.querySelector('#eqForm').onsubmit = e => { e.preventDefault(); a.addEquipment(Object.fromEntries(new FormData(e.target).entries())); persist(); renderFlow(); renderPlan(); };
  root.querySelector('#stForm').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); a.addStorage({ name:fd.get('name'), categoryHint:fd.get('categoryHint'), allowedProductIds: fd.get('allowedProductId')?[fd.get('allowedProductId')]:[] }); persist(); renderFlow(); renderPlan(); };
  root.querySelector('#capForm').onsubmit = e => { e.preventDefault(); a.upsertCapability(Object.fromEntries(new FormData(e.target).entries())); persist(); renderFlow(); renderPlan(); };
}

function renderDemand(){
  const root = el('tab-demand'); const s = selectors(state); const a = actions(state);
  const start = startOfMonth(yesterdayLocal());
  const dates = dateRange(start,38);
  root.innerHTML = `
    <div class="card p-4">
      <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h2 class="font-semibold">Demand Planning (Forecast + Actuals)</h2>
        <div class="flex gap-2">
          <button id="openForecastTool" class="px-3 py-1.5 border rounded text-sm">⚙️ Forecast Tool</button>
          <button id="saveDemandBtn" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Save Forecast Grid</button>
        </div>
      </div>
      ${s.finishedProducts.length ? '' : '<div class="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-2">No finished products defined. Add products in Tab 1 under Finished Product.</div>'}
      <div class="overflow-auto max-h-[60vh]"><table class="gridish w-full text-xs"><thead><tr><th>Product</th>${dates.map(d=>`<th>${d.slice(5)}</th>`).join('')}</tr></thead><tbody>
      ${s.finishedProducts.map(fp=>`<tr><td class="font-semibold whitespace-nowrap">${esc(fp.name)}</td>${dates.map(d=>{
        const actual = s.dataset.actuals.shipments.find(r=>r.date===d && r.facilityId===state.ui.selectedFacilityId && r.productId===fp.id);
        const fc = s.dataset.demandForecast.find(r=>r.date===d && r.facilityId===state.ui.selectedFacilityId && r.productId===fp.id);
        return actual ? `<td class="bg-emerald-50 text-center" title="Actual shipment">${fmt(actual.qtyStn)}</td>` : `<td><input data-date="${d}" data-product="${fp.id}" class="small-input demand-input" value="${fc?fc.qtyStn:''}"></td>`;
      }).join('')}</tr>`).join('') || '<tr><td colspan="99" class="muted">No finished products defined</td></tr>'}
      </tbody></table></div>
      <p class="text-xs muted mt-2">Green cells = actual shipments captured in Daily Actuals (read-only). Forecast tool uses actuals only in rolling windows, no Sundays, and does not overwrite actuals.</p>
    </div>`;

  root.querySelector('#saveDemandBtn')?.addEventListener('click', ()=>{
    const rows = [...root.querySelectorAll('.demand-input')].map(inp=>({date:inp.dataset.date, productId:inp.dataset.product, qtyStn:+inp.value||0})).filter(r=>r.qtyStn>0);
    a.saveDemandForecastRows(rows); persist(); renderDemand(); renderPlan();
  });
  root.querySelector('#openForecastTool')?.addEventListener('click', ()=> openForecastToolDialog());
}

function openForecastToolDialog(){
  const s = selectors(state); const a = actions(state);
  let host = document.getElementById('forecastToolDialog');
  if(!host){
    host = document.createElement('div');
    host.id = 'forecastToolDialog';
    host.className = 'fixed inset-0 z-50 hidden items-start justify-center p-4 bg-black/30 overflow-auto';
    document.body.appendChild(host);
  }
  const startDefault = yesterdayLocal();
  host.classList.remove('hidden'); host.classList.add('flex');
  host.innerHTML = `
    <div class="bg-white rounded-xl border border-slate-200 w-full max-w-2xl">
      <div class="px-4 py-3 border-b flex items-center justify-between"><div><div class="font-semibold">Forecast Tool (Sandbox)</div><div class="text-xs muted">Uses actual shipments only as baseline</div></div><button id="fcClose" class="px-2 py-1 border rounded">Close</button></div>
      <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div><label class="block mb-1">Product</label><select id="fcProduct" class="border rounded px-2 py-1 w-full">${s.finishedProducts.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div><label class="block mb-1">Start date</label><input id="fcStart" type="date" class="border rounded px-2 py-1 w-full" value="${startDefault}"></div>
        <div><label class="block mb-1">Method</label><select id="fcMethod" class="border rounded px-2 py-1 w-full"><option value="rolling">Rolling weekdays</option><option value="fixed">Fixed daily value</option><option value="monthTotal">Monthly total distribute</option></select></div>
        <div id="fcRollingWrap"><label class="block mb-1">Rolling window</label><select id="fcRollingN" class="border rounded px-2 py-1 w-full"><option value="5">5 weekdays</option><option value="10">10 weekdays</option><option value="30">30 weekdays</option></select></div>
        <div id="fcFixedWrap" class="hidden"><label class="block mb-1">Fixed daily value (STn)</label><input id="fcFixedVal" type="number" step="0.1" class="border rounded px-2 py-1 w-full" value="0"></div>
        <div id="fcMonthWrap" class="hidden"><label class="block mb-1">Month total target (STn)</label><input id="fcMonthTotal" type="number" step="0.1" class="border rounded px-2 py-1 w-full" value="0"></div>
        <div id="fcHorizonWrap" class="hidden md:col-span-2">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div><label class="block mb-1">Horizon</label><select id="fcHorizon" class="border rounded px-2 py-1 w-full"><option value="eom">End of month</option><option value="eoy">End of year</option><option value="date">Specific date</option></select></div>
            <div><label class="block mb-1">End date (if specific)</label><input id="fcEndDate" type="date" class="border rounded px-2 py-1 w-full"></div>
            <div class="flex items-end"><label class="inline-flex items-center gap-2"><input id="fcAllowSat" type="checkbox" checked> Product ships Saturdays</label></div>
          </div>
        </div>
        <div class="md:col-span-2"><label class="inline-flex items-center gap-2"><input id="fcAllowSatGlobal" type="checkbox" checked> Product ships Saturdays (used for all methods)</label></div>
        <div class="md:col-span-2 text-xs muted" id="fcMsg"></div>
      </div>
      <div class="px-4 py-3 border-t flex justify-end gap-2"><button id="fcPreview" class="px-3 py-1.5 border rounded">Preview</button><button id="fcApply" class="px-3 py-1.5 bg-blue-600 text-white rounded">Apply Forecast</button></div>
    </div>`;

  const q=id=>host.querySelector('#'+id);
  const syncMethodUi = ()=>{
    const m=q('fcMethod').value;
    q('fcRollingWrap').classList.toggle('hidden', m!=='rolling');
    q('fcFixedWrap').classList.toggle('hidden', m!=='fixed');
    q('fcMonthWrap').classList.toggle('hidden', m!=='monthTotal');
    q('fcHorizonWrap').classList.toggle('hidden', m==='monthTotal');
  };
  q('fcMethod').onchange = syncMethodUi; syncMethodUi();
  q('fcClose').onclick = ()=>{ host.classList.add('hidden'); host.classList.remove('flex'); };
  host.onclick = (e)=>{ if(e.target===host){ host.classList.add('hidden'); host.classList.remove('flex'); } };

  function isSunday(dateStr){ return new Date(dateStr+'T00:00:00').getDay()===0; }
  function isSaturday(dateStr){ return new Date(dateStr+'T00:00:00').getDay()===6; }
  function endOfMonth(dateStr){ const d=new Date(dateStr+'T00:00:00'); d.setMonth(d.getMonth()+1,0); return d.toISOString().slice(0,10); }
  function endOfYear(dateStr){ return dateStr.slice(0,4)+'-12-31'; }
  function enumerateDates(a,b){ const out=[]; let d=new Date(a+'T00:00:00'); const end=new Date(b+'T00:00:00'); while(d<=end){ out.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1);} return out; }
  function previousDate(dateStr,n=1){ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()-n); return d.toISOString().slice(0,10); }
  function actualQty(dateStr,pid){
    const r = s.dataset.actuals.shipments.find(x=>x.facilityId===state.ui.selectedFacilityId && x.date===dateStr && x.productId===pid);
    return r ? +r.qtyStn : null;
  }
  function weekdayActualSample(pid, startDate, n){
    const vals=[]; let cursor = previousDate(startDate,1); let guard=0;
    while(vals.length<n && guard<500){
      guard++;
      const dow = new Date(cursor+'T00:00:00').getDay();
      if(dow>=1 && dow<=5){ const q=actualQty(cursor,pid); if(q!=null) vals.push(q); }
      cursor = previousDate(cursor,1);
    }
    return vals;
  }
  function saturdayCoefficient(pid, startDate){
    const sat=[]; const wk=[]; let cursor = previousDate(startDate,1); let guard=0; let satCount=0; let wkCount=0;
    while((satCount<4 || wkCount<20) && guard<400){
      guard++;
      const dow = new Date(cursor+'T00:00:00').getDay();
      const q=actualQty(cursor,pid);
      if(q!=null){
        if(dow===6 && satCount<4){ sat.push(q); satCount++; }
        if(dow>=1 && dow<=5 && wkCount<20){ wk.push(q); wkCount++; }
      }
      cursor = previousDate(cursor,1);
    }
    const avgW = wk.length ? wk.reduce((a,b)=>a+b,0)/wk.length : 0;
    const avgS = sat.length ? sat.reduce((a,b)=>a+b,0)/sat.length : 0;
    return avgW>0 ? (avgS/avgW) : 0;
  }
  function hasActual(dateStr,pid){ return actualQty(dateStr,pid)!=null; }
  function writeForecastRows(rows){
    // replace forecast rows for same date/product/facility; skip actual dates; remove <=0 rows
    const fac = state.ui.selectedFacilityId;
    const keys = new Set(rows.map(r=>`${r.date}|${fac}|${r.productId}`));
    s.dataset.demandForecast = s.dataset.demandForecast.filter(x=>!keys.has(`${x.date}|${x.facilityId}|${x.productId}`));
    rows.filter(r=>(+r.qtyStn||0)>0 && !hasActual(r.date,r.productId)).forEach(r=>s.dataset.demandForecast.push({date:r.date, facilityId:fac, productId:r.productId, qtyStn:+r.qtyStn, source:'forecast'}));
  }
  function buildForecastRows(){
    const pid=q('fcProduct').value; const start=q('fcStart').value; const method=q('fcMethod').value; const shipsSat=q('fcAllowSatGlobal').checked;
    const msg=[]; let rows=[];
    if(!pid || !start) return {rows, msg:['Select product and start date.']};

    if(method==='rolling'){
      const n = +q('fcRollingN').value;
      const sample = weekdayActualSample(pid,start,n);
      const avgW = sample.length ? sample.reduce((a,b)=>a+b,0)/sample.length : 0;
      const satCoef = shipsSat ? saturdayCoefficient(pid,start) : 0;
      msg.push(`Weekday sample used: ${sample.length}/${n}; weekday avg: ${avgW.toFixed(1)} STn; Saturday coef: ${satCoef.toFixed(2)}`);
      const end = endOfMonth(start);
      rows = enumerateDates(start,end).map(d=>{
        let qty=0; if(isSunday(d)) qty=0; else if(isSaturday(d)) qty = shipsSat ? avgW*satCoef : 0; else qty=avgW;
        return {date:d, productId:pid, qtyStn:Math.round(qty)};
      });
    } else if(method==='fixed'){
      const v = +q('fcFixedVal').value || 0; const hz=q('fcHorizon').value;
      const end = hz==='eom' ? endOfMonth(start) : hz==='eoy' ? endOfYear(start) : (q('fcEndDate').value || start);
      rows = enumerateDates(start,end).map(d=>({date:d, productId:pid, qtyStn:isSunday(d)?0:(isSaturday(d)&&!shipsSat?0:v)}));
      msg.push(`Fixed daily ${v} STn from ${start} to ${end} (Sundays zero${shipsSat?'':' , Saturdays zero'}).`);
    } else if(method==='monthTotal'){
      const total = +q('fcMonthTotal').value || 0;
      const end = endOfMonth(start);
      const monthDates = enumerateDates(start,end);
      const eligible = monthDates.filter(d=>!hasActual(d,pid) && !isSunday(d) && (shipsSat || !isSaturday(d)));
      if(!eligible.length){ msg.push('No eligible future days in month (after excluding actuals/Sundays/Saturdays).'); return {rows:[], msg}; }
      const per = total/eligible.length;
      let remainder = total;
      rows = monthDates.map(d=>({date:d, productId:pid, qtyStn:0}));
      eligible.forEach((d,i)=>{
        let qv = i===eligible.length-1 ? remainder : Math.round(per);
        remainder -= qv;
        const row = rows.find(r=>r.date===d); row.qtyStn = qv;
      });
      msg.push(`Distributed ${total} STn across ${eligible.length} eligible remaining days in month; actual dates untouched.`);
    }
    // Remove rows for actual dates (do not overwrite actuals)
    const before = rows.length;
    rows = rows.map(r=> hasActual(r.date,r.productId) ? {...r, qtyStn:0} : r);
    const blocked = rows.filter(r=>r.qtyStn===0 && hasActual(r.date,r.productId)).length;
    if(blocked) msg.push(`${blocked} actual date(s) skipped (not overwritten).`);
    return {rows, msg};
  }

  q('fcPreview').onclick = ()=>{
    const {rows, msg} = buildForecastRows();
    const applied = rows.filter(r=>(+r.qtyStn||0)>0);
    q('fcMsg').textContent = [...msg, `Preview rows >0: ${applied.length}.`].join(' | ');
  };
  q('fcApply').onclick = ()=>{
    const {rows, msg} = buildForecastRows();
    writeForecastRows(rows); persist(); renderDemand(); renderPlan();
    q('fcMsg').textContent = [...msg, 'Forecast applied to sandbox demand forecast.'].join(' | ');
  };
}

function renderPlan(){
  const root = el('tab-plan'); const s = selectors(state);
  const y = yesterdayLocal();
  const start = startOfMonth(y);
  const plan = buildProductionPlanView(state, start, 38);
  const fmtN = n => (+n||0).toLocaleString(undefined,{maximumFractionDigits:0});
  const dLabel = d => d.slice(5);
  const renderRows = (rows, withProduct=false)=> rows.map(r=>{
    if(r.kind==='group') return `<tr class="subtotal"><td colspan="${withProduct?3:2+plan.dates.length}">${esc(r.label)}</td></tr>`;
    const cls = r.kind==='subtotal' ? 'subtotal' : '';
    const c1 = `<td class="whitespace-nowrap ${r.kind==='subtotal'?'font-bold':''}">${esc(r.label)}</td>`;
    const c2 = withProduct ? `<td class="muted">${esc(r.productLabel||'')}</td>` : '';
    const nums = plan.dates.map(d=>`<td class="text-right ${r.kind==='subtotal'?'font-semibold':''}">${fmtN(r.values?.[d]||0)}</td>`).join('');
    return `<tr class="${cls}">${c1}${c2}${nums}</tr>`;
  }).join('');

  root.innerHTML = `
  <div class="flex items-center justify-between mb-3"><div><h2 class="font-semibold">Production Plan</h2><div class="text-xs muted">Merged operational view (production + shipments + inventory). Source: Tab 1 + Process Flow + Daily Actuals</div></div><div class="flex gap-2"><button id="openActuals" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">📝 Daily Actuals</button></div></div>
  <div class="card p-3 overflow-auto">
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Inventory BOD</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.inventoryBODRows,false)}</tbody>
    </table>
    <div class="h-4"></div>
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Equipment Production</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.productionRows,false)}</tbody>
    </table>
    <div class="h-4"></div>
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Shipments / Derived</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.outflowRows,false)}</tbody>
    </table>
    <div class="h-4"></div>
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Inventory EOD</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.inventoryEODRows,false)}</tbody>
    </table>
  </div>`;
  root.querySelector('#openActuals').onclick = ()=> {
    let host = el('dailyActualsDialog');
    if (!host) {
      host = document.createElement('div');
      host.id = 'dailyActualsDialog';
      host.className = 'fixed inset-0 z-50 hidden items-start justify-center p-4 bg-black/30 overflow-auto';
      document.body.appendChild(host);
    }
    openDailyActualsDialog(host);
  };
}

function openDailyActualsDialog(dialog){
  const s = selectors(state); const a = actions(state);
  const y = yesterdayLocal();
  const prods = s.materials;
  const kf = s.equipment.filter(e=>e.type==='kiln');
  const ff = s.equipment.filter(e=>e.type==='finish_mill');
  const rf = s.equipment.filter(e=>e.type==='raw_mill');
  const prodCols = [...prods];
  const canEqProd = (eqId,pid)=> s.capabilities.some(c=>c.equipmentId===eqId && c.productId===pid);
  const existing = s.actualsForDate(y);
  const invMap = new Map(existing.inv.map(r=>[`${r.storageId}|${r.productId}`, r.qtyStn]));
  const prodMap = new Map(existing.prod.map(r=>[`${r.equipmentId}|${r.productId}`, r.qtyStn]));
  const shipMap = new Map(existing.ship.map(r=>[r.productId, r.qtyStn]));

  if (!dialog) return;
  dialog.classList.remove('hidden');
  dialog.classList.add('flex');
  dialog.innerHTML = `
  <form method="dialog" class="bg-white rounded-xl border border-slate-200">
    <div class="px-4 py-3 border-b flex justify-between items-center"><div><div class="font-semibold">Daily Actuals</div><div class="text-xs muted">Selected facility: ${esc(s.facility?.id||'')}</div></div><button class="px-2 py-1 border rounded">Close</button></div>
    <div class="p-4 space-y-4 max-h-[80vh] overflow-auto">
      <div class="grid grid-cols-3 gap-3 text-sm">
        <div><label class="block mb-1">Date (yesterday default)</label><input id="actualsDate" type="date" class="border rounded px-2 py-1 w-full" value="${y}"></div>
        <div><label class="block mb-1">Facility</label><input class="border rounded px-2 py-1 w-full bg-slate-50" value="${esc(s.facility?.id||'')}" readonly></div>
      </div>

      <div class="card p-3">
        <div class="font-semibold mb-2">Ending Inventory Yesterday (STn)</div>
        <div class="overflow-auto"><table class="gridish w-full text-xs"><thead><tr><th>Storage</th><th>Product</th><th>EOD Qty</th></tr></thead><tbody>
          ${s.storages.map(st=>{
            const pid=(st.allowedProductIds||[])[0]||''; const key=`${st.id}|${pid}`;
            return `<tr><td>${esc(st.name)}</td><td>${esc(s.getMaterial(pid)?.name||'')}</td><td><input class="small-input inv-input" data-storage="${st.id}" data-product="${pid}" value="${invMap.get(key)??''}"></td></tr>`;
          }).join('')}
        </tbody></table></div>
      </div>

      <div class="card p-3">
        <div class="font-semibold mb-2">Production Actuals Yesterday (STn) — Matrix</div>
        <div class="overflow-auto max-h-[38vh]"><table class="gridish w-full text-xs"><thead><tr><th>Equipment</th>${prodCols.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>
          ${[...rf,...kf,...ff].map(eq=>`<tr><td class="whitespace-nowrap font-semibold">${esc(eq.name)} <span class="muted">(${eq.type})</span></td>${prodCols.map(p=>{
            if(!canEqProd(eq.id,p.id)) return `<td class="gray-cell">—</td>`;
            return `<td><input class="small-input prod-input" data-equipment="${eq.id}" data-product="${p.id}" value="${prodMap.get(`${eq.id}|${p.id}`)??''}"></td>`;
          }).join('')}</tr>`).join('')}
        </tbody></table></div>
      </div>

      <div class="card p-3">
        <div class="font-semibold mb-2">Shipments to Customers Yesterday (STn)</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          ${s.finishedProducts.map(fp=>`<label class="flex items-center justify-between gap-2 border rounded px-2 py-1"><span>${esc(fp.name)}</span><input class="small-input ship-input max-w-[140px]" data-product="${fp.id}" value="${shipMap.get(fp.id)??''}"></label>`).join('') || '<div class="muted">No finished products defined.</div>'}
        </div>
      </div>
    </div>
    <div class="px-4 py-3 border-t flex justify-end gap-2"><button id="saveActualsBtn" value="default" class="px-3 py-2 bg-blue-600 text-white rounded">Save to ${state.ui.mode==='sandbox'?'Sandbox':'Official'}</button></div>
  </form>`;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  dialog.querySelector('#saveActualsBtn').onclick = (e)=>{
    e.preventDefault();
    const date = dialog.querySelector('#actualsDate').value;
    const inventoryRows = [...dialog.querySelectorAll('.inv-input')].map(i=>({storageId:i.dataset.storage, productId:i.dataset.product, qtyStn:+i.value||0})).filter(r=>r.productId);
    const productionRows = [...dialog.querySelectorAll('.prod-input')].map(i=>({equipmentId:i.dataset.equipment, productId:i.dataset.product, qtyStn:+i.value||0}));
    const shipmentRows = [...dialog.querySelectorAll('.ship-input')].map(i=>({productId:i.dataset.product, qtyStn:+i.value||0}));
    a.saveDailyActuals({date, inventoryRows, productionRows, shipmentRows});
    persist(); dialog.classList.add('hidden'); dialog.classList.remove('flex'); renderDemand(); renderPlan(); renderData();
  };
}

function renderData(){
  const root = el('tab-data'); const s = selectors(state);
  const ds = s.dataset;
  const tables = {
    Material: ds.materials,
    RecipeHeader: ds.recipes.map(r=>({id:r.id, facilityId:r.facilityId, productId:r.productId, version:r.version, componentCount:r.components.length})),
    RecipeComponent: ds.recipes.flatMap(r=>r.components.map(c=>({recipeId:r.id, facilityId:r.facilityId, productId:r.productId, materialId:c.materialId, pct:c.pct}))),
    Equipment: ds.equipment,
    StorageUnit: ds.storages,
    EquipmentProductCapability: ds.capabilities,
    ActualsInventoryEOD: ds.actuals.inventoryEOD,
    ActualsProduction: ds.actuals.production,
    ActualsShipments: ds.actuals.shipments,
    DemandForecast: ds.demandForecast,
    CampaignPlan: ds.campaigns,
  };
  root.innerHTML = `
  <div class="card p-4 space-y-3">
    <div class="flex items-center justify-between"><h2 class="font-semibold">Data & Scenarios (debug/admin)</h2>
      <div class="flex gap-2"><button id="exportJson" class="px-3 py-1.5 border rounded text-sm">Export Current Scenario JSON</button><button id="importJson" class="px-3 py-1.5 border rounded text-sm">Import JSON</button><input id="jsonFile" type="file" accept="application/json" class="hidden"></div></div>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
      ${Object.entries(tables).map(([name, rows])=>`<div class="border rounded p-2"><div class="font-semibold text-sm mb-1">${name} <span class="muted">(${rows.length})</span></div><pre class="text-[11px] bg-slate-50 p-2 rounded max-h-64 overflow-auto">${esc(JSON.stringify(rows.slice(0,50), null, 2))}</pre></div>`).join('')}
    </div>
  </div>`;
  root.querySelector('#exportJson').onclick = ()=>{
    const data = JSON.stringify(state[state.ui.mode], null, 2);
    const blob = new Blob([data], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `cement_planner_${state.ui.mode}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  root.querySelector('#importJson').onclick = ()=> root.querySelector('#jsonFile').click();
  root.querySelector('#jsonFile').onchange = async e => {
    const file=e.target.files[0]; if(!file) return; const txt=await file.text();
    try { state[state.ui.mode] = JSON.parse(txt); persist(); render(); } catch(err){ alert('Invalid JSON'); }
  };
}

render();
