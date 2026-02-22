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
        <input type="hidden" name="id">
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
        <div class="col-span-2 flex gap-2"><button id="saveMaterialBtn" class="bg-blue-600 text-white rounded px-3 py-2">Save Material/Product</button><button type="button" id="cancelMaterialEdit" class="border rounded px-3 py-2 hidden">Cancel Edit</button></div>
      </form>
      <div class="mt-4 max-h-[420px] overflow-auto">
        <table class="gridish w-full"><thead><tr><th>Name</th><th>Category</th><th>Code</th><th>ID</th><th>Actions</th></tr></thead><tbody>
          ${s.materials.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(m.category)}</td><td>${esc(m.code)}</td><td class="text-[10px]">${esc(m.id)}</td><td><div class="flex gap-1"><button type="button" class="px-2 py-0.5 border rounded text-[11px]" data-edit-material="${m.id}">Edit</button><button type="button" class="px-2 py-0.5 border rounded text-[11px] text-red-700" data-del-material="${m.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No materials/products yet</td></tr>'}
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
        <input type="hidden" name="editingRecipeId" value="">
        <div class="flex gap-2">
          <button type="button" id="addRecipeLine" class="px-3 py-1.5 rounded border">+ Add Component</button>
          <button type="button" id="cancelRecipeEdit" class="px-3 py-1.5 rounded border hidden">Cancel Edit</button>
          <button id="saveRecipeBtn" class="px-3 py-1.5 rounded bg-blue-600 text-white">Save Recipe</button>
        </div>
      </form>
      <div class="mt-4 max-h-[320px] overflow-auto text-xs">
        ${s.dataset.recipes.filter(r=>r.facilityId===state.ui.selectedFacilityId).map(r=>{
          const p = s.getMaterial(r.productId);
          return `<div class="border rounded p-2 mb-2" data-recipe-id="${r.id}">
            <div class="flex items-center justify-between gap-2">
              <div class="font-semibold">${esc(p?.name||r.productId)} <span class="muted">v${r.version}</span></div>
              <div class="flex gap-1">
                <button type="button" class="px-2 py-0.5 border rounded text-[11px]" data-edit-recipe="${r.id}">Edit</button>
                <button type="button" class="px-2 py-0.5 border rounded text-[11px] text-red-700" data-del-recipe="${r.id}">Delete</button>
              </div>
            </div>
            ${r.components.map(c=>`<div>${esc(s.getMaterial(c.materialId)?.name||c.materialId)}: ${c.pct}%</div>`).join('')}
          </div>`;
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

  const clearRecipeForm = ()=>{
    const form = root.querySelector('#recipeForm');
    form.reset();
    form.querySelector('[name=version]').value = 1;
    form.querySelector('[name=editingRecipeId]').value = '';
    root.querySelector('#saveRecipeBtn').textContent = 'Save Recipe';
    root.querySelector('#cancelRecipeEdit').classList.add('hidden');
    comps.innerHTML = '';
    addRecipeLine();
    addRecipeLine();
  };

  const loadRecipeToForm = (recipeId)=>{
    const rec = s.dataset.recipes.find(r=>r.id===recipeId && r.facilityId===state.ui.selectedFacilityId);
    if(!rec) return;
    const form = root.querySelector('#recipeForm');
    form.querySelector('[name=productId]').value = rec.productId;
    form.querySelector('[name=version]').value = rec.version || 1;
    form.querySelector('[name=editingRecipeId]').value = rec.id;
    root.querySelector('#saveRecipeBtn').textContent = 'Update Recipe';
    root.querySelector('#cancelRecipeEdit').classList.remove('hidden');
    comps.innerHTML = '';
    (rec.components?.length ? rec.components : [{materialId:'',pct:''}]).forEach(c=>{
      addRecipeLine();
      const row = comps.lastElementChild;
      row.querySelector('[name=componentMaterialId]').value = c.materialId || '';
      row.querySelector('[name=componentPct]').value = c.pct ?? '';
    });
  };

  root.querySelector('#cancelRecipeEdit').onclick = clearRecipeForm;
  addRecipeLine();
  addRecipeLine();

  root.querySelectorAll('[data-edit-recipe]').forEach(btn=>{
    btn.onclick = ()=> loadRecipeToForm(btn.dataset.editRecipe);
  });
  root.querySelectorAll('[data-del-recipe]').forEach(btn=>{
    btn.onclick = ()=>{
      const recId = btn.dataset.delRecipe;
      const rec = s.dataset.recipes.find(r=>r.id===recId);
      const pName = s.getMaterial(rec?.productId)?.name || rec?.productId || recId;
      if(!confirm(`Delete recipe ${pName} v${rec?.version||''}?`)) return;
      a.deleteRecipe(recId);
      persist(); renderProducts(); renderPlan(); renderData();
    };
  });

  const clearMaterialForm = ()=>{
    const f=root.querySelector('#materialForm'); f.reset(); f.querySelector('[name=id]').value='';
    root.querySelector('#saveMaterialBtn').textContent='Save Material/Product';
    root.querySelector('#cancelMaterialEdit').classList.add('hidden');
  };
  root.querySelector('#cancelMaterialEdit').onclick = clearMaterialForm;
  root.querySelectorAll('[data-edit-material]').forEach(btn=>btn.onclick=()=>{
    const m = s.materials.find(x=>x.id===btn.dataset.editMaterial); if(!m) return;
    const f=root.querySelector('#materialForm');
    f.querySelector('[name=id]').value=m.id; f.querySelector('[name=name]').value=m.name||''; f.querySelector('[name=code]').value=m.code||''; f.querySelector('[name=category]').value=m.category||Categories.FIN;
    f.querySelector('[name=landedCostUsdPerStn]').value=m.landedCostUsdPerStn||''; f.querySelector('[name=calorificPowerMMBTUPerStn]').value=m.calorificPowerMMBTUPerStn||''; f.querySelector('[name=co2FactorKgPerMMBTU]').value=m.co2FactorKgPerMMBTU||'';
    root.querySelector('#saveMaterialBtn').textContent='Update Material/Product'; root.querySelector('#cancelMaterialEdit').classList.remove('hidden');
  });
  root.querySelectorAll('[data-del-material]').forEach(btn=>btn.onclick=()=>{
    const m = s.materials.find(x=>x.id===btn.dataset.delMaterial);
    if(!confirm(`Delete ${m?.name||btn.dataset.delMaterial}? This also removes related recipes/capabilities/actuals for this product.`)) return;
    a.deleteMaterial(btn.dataset.delMaterial); persist(); renderProducts(); renderFlow(); renderDemand(); renderPlan(); renderData();
  });

  root.querySelector('#materialForm').onsubmit = e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    a.upsertMaterial(Object.fromEntries(fd.entries()));
    persist(); renderProducts(); renderDemand(); renderFlow(); renderPlan(); renderData();
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
    const capHtml = caps.map(c=>`<div class="flex items-center justify-between gap-1"><span>${esc(s.getMaterial(c.productId)?.name||c.productId)} @ ${fmt(c.maxRateStpd)} STn/d</span><span class="flex gap-1"><button type="button" class="px-1 border rounded text-[10px]" data-edit-cap="${c.id}">Edit</button><button type="button" class="px-1 border rounded text-[10px] text-red-700" data-del-cap="${c.id}">Del</button></span></div>`).join('');
    return `<tr><td>${esc(eq.id)}</td><td>${esc(eq.name)}</td><td>${esc(eq.type)}</td><td>${capHtml}</td><td><div class="flex gap-1"><button type="button" class="px-2 py-0.5 border rounded text-[11px]" data-edit-eq="${eq.id}">Edit</button><button type="button" class="px-2 py-0.5 border rounded text-[11px] text-red-700" data-del-eq="${eq.id}">Delete</button></div></td></tr>`;
  }).join('');
  root.innerHTML = `
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
    <div class="card p-4 space-y-4">
      <div>
        <h2 class="font-semibold mb-2">Add / Edit Equipment</h2>
        <form id="eqForm" class="grid grid-cols-2 gap-2 text-sm">
          <input type="hidden" name="id">
          <select name="type" class="border rounded px-2 py-1"><option value="kiln">Kiln</option><option value="finish_mill">Finish Mill</option><option value="raw_mill">Raw Mill</option></select>
          <input name="name" class="border rounded px-2 py-1" placeholder="Name (e.g., FM1)">
          <div class="col-span-2 flex gap-2"><button id="saveEqBtn" class="bg-blue-600 text-white rounded px-3 py-2">Save Equipment</button><button type="button" id="cancelEqEdit" class="border rounded px-3 py-2 hidden">Cancel</button></div>
        </form>
      </div>
      <div>
        <h2 class="font-semibold mb-2">Add / Edit Storage</h2>
        <form id="stForm" class="grid grid-cols-2 gap-2 text-sm">
          <input type="hidden" name="id">
          <input name="name" class="border rounded px-2 py-1 col-span-2" placeholder="Storage name (e.g., MIA / INV / CLK / K1)" required>
          <select name="categoryHint" class="border rounded px-2 py-1"><option>CLINKER</option><option>CEMENT</option><option>RAW</option><option>FUEL</option></select>
          <select name="allowedProductId" class="border rounded px-2 py-1"><option value="">Allowed product</option>${s.materials.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
          <input name="maxCapacityStn" type="number" step="0.1" class="border rounded px-2 py-1 col-span-2" placeholder="Max capacity (STn)">
          <div class="col-span-2 flex gap-2"><button id="saveStBtn" class="bg-blue-600 text-white rounded px-3 py-2">Save Storage</button><button type="button" id="cancelStEdit" class="border rounded px-3 py-2 hidden">Cancel</button></div>
        </form>
      </div>
      <div>
        <h2 class="font-semibold mb-2">Equipment Capability</h2>
        <form id="capForm" class="grid grid-cols-2 gap-2 text-sm">
          <input type="hidden" name="editingCapId">
          <select name="equipmentId" class="border rounded px-2 py-1">${s.equipment.map(e=>`<option value="${e.id}">${esc(e.name)} (${e.type})</option>`).join('')}</select>
          <select name="productId" class="border rounded px-2 py-1">${s.materials.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
          <input type="number" step="0.1" name="maxRateStpd" class="border rounded px-2 py-1" placeholder="Max STn/day">
          <input type="number" step="0.01" name="electricKwhPerStn" class="border rounded px-2 py-1" placeholder="kWh/STn (mills)">
          <input type="number" step="0.01" name="thermalMMBTUPerStn" class="border rounded px-2 py-1 col-span-2" placeholder="MMBTU/STn (kiln)">
          <div class="col-span-2 flex gap-2"><button id="saveCapBtn" class="bg-blue-600 text-white rounded px-3 py-2">Save Capability</button><button type="button" id="cancelCapEdit" class="border rounded px-3 py-2 hidden">Cancel</button></div>
        </form>
      </div>
    </div>
    <div class="card p-4 xl:col-span-2">
      <h2 class="font-semibold mb-2">Process Setup Summary (source of truth)</h2>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div class="font-semibold text-sm mb-1">Equipment</div>
          <div class="max-h-72 overflow-auto"><table class="gridish w-full"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Capabilities</th><th>Actions</th></tr></thead><tbody>${equipmentRows || '<tr><td colspan="5" class="muted">No equipment</td></tr>'}</tbody></table></div>
        </div>
        <div>
          <div class="font-semibold text-sm mb-1">Storages</div>
          <div class="max-h-72 overflow-auto"><table class="gridish w-full"><thead><tr><th>ID</th><th>Name</th><th>Family</th><th>Allowed Product</th><th>Max Cap</th><th>Actions</th></tr></thead><tbody>${s.storages.map(st=>`<tr><td>${esc(st.id)}</td><td>${esc(st.name)}</td><td>${esc(st.categoryHint||'')}</td><td>${(st.allowedProductIds||[]).map(pid=>esc(s.getMaterial(pid)?.name||pid)).join(', ')}</td><td>${st.maxCapacityStn!=null && st.maxCapacityStn!=='' ? fmt(st.maxCapacityStn) : ''}</td><td><div class="flex gap-1"><button type="button" class="px-2 py-0.5 border rounded text-[11px]" data-edit-st="${st.id}">Edit</button><button type="button" class="px-2 py-0.5 border rounded text-[11px] text-red-700" data-del-st="${st.id}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No storages</td></tr>'}</tbody></table></div>
        </div>
      </div>
    </div>
  </div>`;
  const rer = ()=>{ persist(); renderFlow(); renderPlan(); renderDemand(); renderData(); };
  const clearEq = ()=>{ const f=root.querySelector('#eqForm'); f.reset(); f.querySelector('[name=id]').value=''; root.querySelector('#saveEqBtn').textContent='Save Equipment'; root.querySelector('#cancelEqEdit').classList.add('hidden'); };
  const clearSt = ()=>{ const f=root.querySelector('#stForm'); f.reset(); f.querySelector('[name=id]').value=''; root.querySelector('#saveStBtn').textContent='Save Storage'; root.querySelector('#cancelStEdit').classList.add('hidden'); };
  const clearCap = ()=>{ const f=root.querySelector('#capForm'); f.reset(); f.querySelector('[name=editingCapId]').value=''; root.querySelector('#saveCapBtn').textContent='Save Capability'; root.querySelector('#cancelCapEdit').classList.add('hidden'); };
  root.querySelector('#cancelEqEdit').onclick=clearEq; root.querySelector('#cancelStEdit').onclick=clearSt; root.querySelector('#cancelCapEdit').onclick=clearCap;
  root.querySelectorAll('[data-edit-eq]').forEach(btn=>btn.onclick=()=>{ const row=s.equipment.find(x=>x.id===btn.dataset.editEq); if(!row) return; const f=root.querySelector('#eqForm'); f.querySelector('[name=id]').value=row.id; f.querySelector('[name=name]').value=row.name; f.querySelector('[name=type]').value=row.type; root.querySelector('#saveEqBtn').textContent='Update Equipment'; root.querySelector('#cancelEqEdit').classList.remove('hidden');});
  root.querySelectorAll('[data-del-eq]').forEach(btn=>btn.onclick=()=>{ if(!confirm('Delete equipment and all capabilities/actuals for it?')) return; a.deleteEquipment(btn.dataset.delEq); rer(); });
  root.querySelectorAll('[data-edit-st]').forEach(btn=>btn.onclick=()=>{ const row=s.storages.find(x=>x.id===btn.dataset.editSt); if(!row) return; const f=root.querySelector('#stForm'); f.querySelector('[name=id]').value=row.id; f.querySelector('[name=name]').value=row.name; f.querySelector('[name=categoryHint]').value=row.categoryHint||''; f.querySelector('[name=allowedProductId]').value=(row.allowedProductIds||[])[0]||''; f.querySelector('[name=maxCapacityStn]').value=row.maxCapacityStn||''; root.querySelector('#saveStBtn').textContent='Update Storage'; root.querySelector('#cancelStEdit').classList.remove('hidden');});
  root.querySelectorAll('[data-del-st]').forEach(btn=>btn.onclick=()=>{ if(!confirm('Delete storage and related inventory actuals?')) return; a.deleteStorage(btn.dataset.delSt); rer(); });
  root.querySelectorAll('[data-edit-cap]').forEach(btn=>btn.onclick=()=>{ const c=s.capabilities.find(x=>x.id===btn.dataset.editCap); if(!c) return; const f=root.querySelector('#capForm'); f.querySelector('[name=editingCapId]').value=c.id; f.querySelector('[name=equipmentId]').value=c.equipmentId; f.querySelector('[name=productId]').value=c.productId; f.querySelector('[name=maxRateStpd]').value=c.maxRateStpd||''; f.querySelector('[name=electricKwhPerStn]').value=c.electricKwhPerStn||''; f.querySelector('[name=thermalMMBTUPerStn]').value=c.thermalMMBTUPerStn||''; root.querySelector('#saveCapBtn').textContent='Update Capability'; root.querySelector('#cancelCapEdit').classList.remove('hidden');});
  root.querySelectorAll('[data-del-cap]').forEach(btn=>btn.onclick=()=>{ if(!confirm('Delete capability?')) return; a.deleteCapability(btn.dataset.delCap); rer(); });
  root.querySelector('#eqForm').onsubmit = e => { e.preventDefault(); a.upsertEquipment(Object.fromEntries(new FormData(e.target).entries())); rer(); };
  root.querySelector('#stForm').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); a.upsertStorage({ id:fd.get('id')||'', name:fd.get('name'), categoryHint:fd.get('categoryHint'), allowedProductIds: fd.get('allowedProductId')?[fd.get('allowedProductId')]:[], maxCapacityStn: fd.get('maxCapacityStn') }); rer(); };
  root.querySelector('#capForm').onsubmit = e => { e.preventDefault(); const fd = new FormData(e.target); a.upsertCapability({ equipmentId:fd.get('equipmentId'), productId:fd.get('productId'), maxRateStpd:fd.get('maxRateStpd'), electricKwhPerStn:fd.get('electricKwhPerStn'), thermalMMBTUPerStn:fd.get('thermalMMBTUPerStn') }); rer(); };
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
  const productChip = (pid)=> {
    const m = s.getMaterial(pid); return m ? (m.code || m.name) : '';
  };
  const renderRows = (rows)=> rows.map(r=>{
    if(r.kind==='group') return `<tr class="subtotal"><td colspan="${1+plan.dates.length}">${esc(r.label)}</td></tr>`;
    const cls = r.kind==='subtotal' ? 'subtotal' : '';
    const c1 = `<td class="whitespace-nowrap ${r.kind==='subtotal'?'font-bold':''}">${esc(r.label)}</td>`;
    const nums = plan.dates.map(d=>{
      const baseVal = r.values?.[d]||0;
      if(r.rowType==='equipment' && r.equipmentId){
        const meta = plan.equipmentCellMeta?.[`${d}|${r.equipmentId}`];
        if(meta && (meta.status==='produce' || meta.status==='maintenance' || meta.status==='idle')){
          let style = '';
          let title = '';
          let txt = fmtN(baseVal);
          if(meta.status==='produce'){
            style = `background:${meta.color||'#eef2ff'};`;
            const badge = productChip(meta.productId);
            title = `${meta.source==='actual'?'Actual':'Campaign'} ${badge} ${fmtN(meta.totalQty||baseVal)} STn`;
            txt = `${fmtN(baseVal)}${badge ? ' · '+esc(badge) : ''}${meta.source==='actual'?' ✓':''}`;
          } else if(meta.status==='maintenance'){
            style = 'background:#e5e7eb;color:#374151;';
            txt = 'MNT'; title = 'Planned maintenance';
          } else {
            style = 'background:#f8fafc;color:#64748b;';
            txt = ''; title = 'Idle';
          }
          return `<td class="text-right" style="${style}" title="${esc(title)}">${txt}</td>`;
        }
      }
      if(r.storageId){
        const imeta = plan.inventoryCellMeta?.[`${d}|${r.storageId}`];
        if(imeta){
          let style='';
          if(imeta.severity==='stockout') style='background:#fee2e2;color:#991b1b;font-weight:600;';
          if(imeta.severity==='full') style='background:#fef3c7;color:#92400e;font-weight:600;';
          const tt = imeta.reason || '';
          return `<td class="text-right ${r.kind==='subtotal'?'font-semibold':''}" style="${style}" title="${esc(tt)}">${fmtN(baseVal)}</td>`;
        }
      }
      return `<td class="text-right ${r.kind==='subtotal'?'font-semibold':''}">${fmtN(baseVal)}</td>`;
    }).join('');
    return `<tr class="${cls}">${c1}${nums}</tr>`;
  }).join('');

  const allAlerts = Object.entries(plan.alertSummary||{}).flatMap(([date,arr])=>(arr||[]).map(a=>({...a,date})));
  const topAlerts = allAlerts.slice(0,12);
  root.innerHTML = `
  <div class="flex items-center justify-between mb-3"><div><h2 class="font-semibold">Production Plan</h2><div class="text-xs muted">Merged operational view (production + shipments + inventory). Campaign colors on kiln/FM rows (actuals override planned).</div></div><div class="flex gap-2"><button id="openCampaigns" class="px-3 py-1.5 border rounded text-sm">🎯 Campaigns</button><button id="openActuals" class="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">📝 Daily Actuals</button></div></div>
  <div class="text-xs muted mb-2">Legend: colored cells = producing product campaign; gray = maintenance; actuals take precedence and show ✓. Inventory EOD alerts: red = stockout, amber = above max capacity.</div>
  ${topAlerts.length ? `<div class="mb-3 grid grid-cols-1 md:grid-cols-2 gap-2">${topAlerts.map(a=>`<div class="text-xs rounded border px-2 py-1 ${a.severity==='stockout'?'bg-red-50 border-red-200 text-red-800':'bg-amber-50 border-amber-200 text-amber-800'}"><span class="font-semibold">${a.date.slice(5)} · ${a.severity.toUpperCase()}</span> — ${esc(a.storageName)} (${esc(a.reason)})</div>`).join('')}${allAlerts.length>topAlerts.length?`<div class="text-xs muted">...and ${allAlerts.length-topAlerts.length} more alert(s) in the visible horizon.</div>`:''}</div>`:''}
  <div class="card p-3 overflow-auto">
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Inventory BOD</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.inventoryBODRows)}</tbody>
    </table>
    <div class="h-4"></div>
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Equipment Production</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.productionRows)}</tbody>
    </table>
    <div class="h-4"></div>
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Shipments / Derived</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.outflowRows)}</tbody>
    </table>
    <div class="h-4"></div>
    <table class="gridish w-full text-xs">
      <thead><tr><th class="sticky left-0 bg-white z-10">Inventory EOD</th>${plan.dates.map(d=>`<th>${dLabel(d)}</th>`).join('')}</tr></thead>
      <tbody>${renderRows(plan.inventoryEODRows)}</tbody>
    </table>
  </div>`;

  root.querySelector('#openCampaigns').onclick = ()=> openCampaignDialog();
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

function openCampaignDialog(){
  const s = selectors(state); const a = actions(state);
  let host = document.getElementById('campaignDialog');
  if(!host){
    host = document.createElement('div');
    host.id = 'campaignDialog';
    host.className = 'fixed inset-0 z-50 hidden items-start justify-center p-4 bg-black/30 overflow-auto';
    document.body.appendChild(host);
  }
  const eqs = s.equipment.filter(e=>['kiln','finish_mill'].includes(e.type));
  const eqOptions = eqs.map(e=>`<option value="${e.id}">${esc(e.name)} (${e.type})</option>`).join('');
  const today = yesterdayLocal();
  const existing = s.dataset.campaigns.filter(c=>c.facilityId===state.ui.selectedFacilityId).sort((a,b)=> (a.date+a.equipmentId).localeCompare(b.date+b.equipmentId));

  const avgTrimmed = (vals)=>{
    let arr = (vals||[]).filter(v=>Number.isFinite(v) && v>0);
    if(!arr.length) return null;
    arr = [...arr];
    if(arr.length >= 5){
      const min = Math.min(...arr), max = Math.max(...arr);
      let removedMin=false, removedMax=false;
      arr = arr.filter(v=>{
        if(!removedMin && v===min){ removedMin=true; return false; }
        if(!removedMax && v===max){ removedMax=true; return false; }
        return true;
      });
    }
    if(!arr.length) return null;
    return arr.reduce((a,b)=>a+b,0)/arr.length;
  };
  const computeRollingActualRate = (equipmentId, productId, startDate, n)=>{
    if(!equipmentId || !productId || !startDate || !n) return { value:null, source:'none', points:0 };
    const ds = s.dataset;
    const d = new Date(startDate + 'T00:00:00');
    d.setDate(d.getDate()-1);
    const targetFacility = state.ui.selectedFacilityId;
    const collect = (mode)=>{
      const vals = [];
      let cursor = new Date(d.getTime());
      let guard = 0;
      while(vals.length < n && guard < 400){
        const date = cursor.toISOString().slice(0,10);
        const rows = ds.actuals.production.filter(r=>r.date===date && r.facilityId===targetFacility && r.productId===productId);
        let qty = 0;
        if(mode==='eq'){
          qty = rows.filter(r=>r.equipmentId===equipmentId).reduce((s0,r)=>s0 + (+r.qtyStn||0), 0);
        } else {
          qty = rows.reduce((s0,r)=>s0 + (+r.qtyStn||0), 0);
        }
        if(qty > 0) vals.push(qty);
        cursor.setDate(cursor.getDate()-1);
        guard++;
      }
      return vals;
    };
    let vals = collect('eq');
    let source = 'equipment+product';
    if(vals.length===0){
      vals = collect('facility');
      source = 'facility+product';
    }
    if(vals.length===0) return { value:null, source:'none', points:0 };
    return { value: avgTrimmed(vals), source, points: vals.length };
  };

  host.classList.remove('hidden'); host.classList.add('flex');
  host.innerHTML = `
  <div class="bg-white rounded-xl border border-slate-200 w-full max-w-5xl">
    <div class="px-4 py-3 border-b flex items-center justify-between"><div><div class="font-semibold">Equipment Campaign Planner</div><div class="text-xs muted">Create date blocks for kiln / finish mill. Actuals later override the display. Rate defaults to capability and shows trimmed rolling actual helpers (7/15/30).</div></div><button id="campClose" class="px-2 py-1 border rounded">Close</button></div>
    <div class="p-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
      <div class="card p-3 space-y-3">
        <div class="font-semibold">Add / Replace campaign block</div>
        <div><label class="block mb-1">Equipment</label><select id="campEq" class="border rounded px-2 py-1 w-full">${eqOptions}</select></div>
        <div id="campProductWrap"><label class="block mb-1">Product</label><select id="campProduct" class="border rounded px-2 py-1 w-full"></select></div>
        <div class="grid grid-cols-3 gap-2">
          <div><label class="block mb-1">Status</label><select id="campStatus" class="border rounded px-2 py-1 w-full"><option value="produce">Produce</option><option value="maintenance">Maintenance</option><option value="idle">Idle</option></select></div>
          <div><label class="block mb-1">Start</label><input id="campStart" type="date" class="border rounded px-2 py-1 w-full" value="${today}"></div>
          <div><label class="block mb-1">End</label><input id="campEnd" type="date" class="border rounded px-2 py-1 w-full" value="${today}"></div>
        </div>

        <div class="border rounded-lg p-3 bg-slate-50 space-y-2" id="campRateAssist">
          <div class="text-xs font-semibold text-slate-700">Rate helper (actuals only • excludes 0 • trimmed min/max when enough points)</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="border rounded p-2 bg-white"><div class="muted">Capability</div><div id="campCapRate" class="font-semibold">—</div></div>
            <div class="border rounded p-2 bg-white"><div class="muted">Source</div><div id="campRollSource" class="font-semibold">—</div></div>
            <div class="border rounded p-2 bg-white"><div class="muted">Rolling 7d</div><div id="campRoll7" class="font-semibold">—</div></div>
            <div class="border rounded p-2 bg-white"><div class="muted">Rolling 15d</div><div id="campRoll15" class="font-semibold">—</div></div>
            <div class="border rounded p-2 bg-white"><div class="muted">Rolling 30d</div><div id="campRoll30" class="font-semibold">—</div></div>
            <div class="border rounded p-2 bg-white"><div class="muted">Rate to apply</div><div id="campRateEcho" class="font-semibold">—</div></div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" id="campUseCap" class="px-2 py-1 border rounded text-xs">Use Cap</button>
            <button type="button" id="campUse7" class="px-2 py-1 border rounded text-xs">Use 7d</button>
            <button type="button" id="campUse15" class="px-2 py-1 border rounded text-xs">Use 15d</button>
            <button type="button" id="campUse30" class="px-2 py-1 border rounded text-xs">Use 30d</button>
          </div>
        </div>

        <div><label class="block mb-1">Rate (STn/day)</label><input id="campRate" type="number" step="0.1" class="border rounded px-2 py-1 w-full" value="0"></div>
        <div class="flex gap-2"><button id="campApply" class="px-3 py-2 bg-blue-600 text-white rounded">Apply block</button><button id="campClearRange" class="px-3 py-2 border rounded">Clear range</button></div>
        <div class="text-xs muted" id="campMsg"></div>
      </div>
      <div class="card p-3">
        <div class="font-semibold mb-2">Saved daily campaign rows (facility)</div>
        <div class="overflow-auto max-h-[48vh]"><table class="gridish w-full text-xs"><thead><tr><th>Date</th><th>Equipment</th><th>Status</th><th>Product</th><th>Rate</th></tr></thead><tbody>
        ${existing.map(c=>`<tr><td>${c.date}</td><td>${esc(s.getEquipment(c.equipmentId)?.name||c.equipmentId)}</td><td>${esc(c.status||'produce')}</td><td>${esc(s.getMaterial(c.productId)?.code || s.getMaterial(c.productId)?.name || '')}</td><td class="text-right">${fmt(c.rateStn||0)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No campaign rows yet</td></tr>'}
        </tbody></table></div>
      </div>
    </div>
  </div>`;
  const q = sel=>host.querySelector(sel);
  const rateCache = { cap:null, r7:null, r15:null, r30:null };
  const writeRateIfFinite = (v)=>{
    if(Number.isFinite(v)){
      q('#campRate').value = String(Math.round(v*10)/10);
      q('#campRateEcho').textContent = `${fmt(v)} STn/d`;
    }
  };
  const renderRateHelpers = ()=>{
    const eqId = q('#campEq').value;
    const status = q('#campStatus').value;
    const productId = q('#campProduct').value;
    const startDate = q('#campStart').value;
    const cap = s.getCapsForEquipment(eqId).find(c=>c.productId===productId);
    rateCache.cap = cap?.maxRateStpd ?? null;
    q('#campCapRate').textContent = Number.isFinite(rateCache.cap) ? `${fmt(rateCache.cap)} STn/d` : '—';

    if(status!=='produce' || !productId){
      q('#campRateAssist').style.opacity = '0.6';
      q('#campRollSource').textContent = '—';
      ['7','15','30'].forEach(k=> q('#campRoll'+k).textContent='—');
      q('#campRateEcho').textContent = `${fmt(+q('#campRate').value||0)} STn/d`;
      return;
    }
    q('#campRateAssist').style.opacity = '1';

    const r7 = computeRollingActualRate(eqId, productId, startDate, 7);
    const r15 = computeRollingActualRate(eqId, productId, startDate, 15);
    const r30 = computeRollingActualRate(eqId, productId, startDate, 30);
    rateCache.r7 = r7.value; rateCache.r15 = r15.value; rateCache.r30 = r30.value;
    q('#campRoll7').textContent = Number.isFinite(r7.value) ? `${fmt(r7.value)} (${r7.points})` : 'N/A';
    q('#campRoll15').textContent = Number.isFinite(r15.value) ? `${fmt(r15.value)} (${r15.points})` : 'N/A';
    q('#campRoll30').textContent = Number.isFinite(r30.value) ? `${fmt(r30.value)} (${r30.points})` : 'N/A';
    const src = [r7,r15,r30].find(x=>x.source && x.source!=='none')?.source || 'none';
    q('#campRollSource').textContent = src;
    q('#campRateEcho').textContent = `${fmt(+q('#campRate').value||0)} STn/d`;
  };
  const refreshProducts = ()=>{
    const eqId = q('#campEq').value; const status = q('#campStatus').value;
    const caps = s.getCapsForEquipment(eqId);
    q('#campProduct').innerHTML = caps.map(c=>`<option value="${c.productId}">${esc(s.getMaterial(c.productId)?.name||c.productId)} @ ${fmt(c.maxRateStpd)} STn/d</option>`).join('');
    q('#campProductWrap').style.display = status==='produce' ? '' : 'none';
    q('#campRate').disabled = status!=='produce';
    if(status==='produce'){
      const firstCap = caps.find(c=>c.productId===q('#campProduct').value) || caps[0];
      if(firstCap && Number.isFinite(+firstCap.maxRateStpd)) q('#campRate').value = String(+firstCap.maxRateStpd || 0);
    }else{
      q('#campRate').value = '0';
    }
    renderRateHelpers();
  };

  q('#campEq').onchange = refreshProducts;
  q('#campStatus').onchange = refreshProducts;
  q('#campProduct').onchange = ()=> {
    const eqId = q('#campEq').value;
    const cap = s.getCapsForEquipment(eqId).find(c=>c.productId===q('#campProduct').value);
    if(cap && Number.isFinite(+cap.maxRateStpd)) q('#campRate').value = String(+cap.maxRateStpd||0);
    renderRateHelpers();
  };
  q('#campStart').onchange = renderRateHelpers;
  q('#campRate').oninput = ()=> q('#campRateEcho').textContent = `${fmt(+q('#campRate').value||0)} STn/d`;

  q('#campUseCap').onclick = ()=> writeRateIfFinite(rateCache.cap);
  q('#campUse7').onclick = ()=> writeRateIfFinite(rateCache.r7);
  q('#campUse15').onclick = ()=> writeRateIfFinite(rateCache.r15);
  q('#campUse30').onclick = ()=> writeRateIfFinite(rateCache.r30);

  refreshProducts();
  q('#campClose').onclick = ()=> { host.classList.add('hidden'); host.classList.remove('flex'); };
  q('#campApply').onclick = (e)=>{
    e.preventDefault();
    const payload = { equipmentId:q('#campEq').value, status:q('#campStatus').value, productId:q('#campProduct').value, startDate:q('#campStart').value, endDate:q('#campEnd').value, rateStn:+q('#campRate').value||0 };
    if(payload.status==='produce' && !payload.productId){ q('#campMsg').textContent='Select a product for produce status.'; return; }
    a.saveCampaignBlock(payload); persist(); q('#campMsg').textContent='Campaign block applied.'; renderPlan(); renderData(); openCampaignDialog();
  };
  q('#campClearRange').onclick = (e)=>{
    e.preventDefault();
    a.deleteCampaignRange({ equipmentId:q('#campEq').value, startDate:q('#campStart').value, endDate:q('#campEnd').value });
    persist(); q('#campMsg').textContent='Campaign rows cleared for selected range.'; renderPlan(); renderData(); openCampaignDialog();
  };
  host.onclick = (e)=>{ if(e.target===host){ host.classList.add('hidden'); host.classList.remove('flex'); } };
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
