import { selectors, Categories } from './dataAuthority.js';

const fmtDate = d => d.toISOString().slice(0,10);
const addDays = (dateStr,n)=>{ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return fmtDate(d); };
export const startOfMonth = (dateStr)=> `${dateStr.slice(0,7)}-01`;

function familyOfProduct(s, pid){
  const m = s.getMaterial(pid);
  if(!m) return 'OTHER';
  if(/CLINKER|\bCLK\b/i.test(m.name) || m.category===Categories.INT) return 'CLINKER';
  if(m.category===Categories.FIN) return 'CEMENT';
  if(m.category===Categories.FUEL) return 'FUEL';
  if(m.category===Categories.RAW) return 'RAW';
  return 'OTHER';
}

export function buildProductionPlanView(state, startDate, days=35){
  const s = selectors(state);
  const ds = s.dataset;
  const fac = state.ui.selectedFacilityId;
  const dates = Array.from({length:days},(_,i)=>addDays(startDate,i));
  const storages = s.storages;
  const kilns = s.equipment.filter(e=>e.type==='kiln');
  const fms = s.equipment.filter(e=>e.type==='finish_mill');

  const invEODByDateStorage = new Map();
  ds.actuals.inventoryEOD.filter(r=>r.facilityId===fac).forEach(r=>invEODByDateStorage.set(`${r.date}|${r.storageId}`, r));
  const actualProdByDateEqProd = new Map();
  ds.actuals.production.filter(r=>r.facilityId===fac).forEach(r=>actualProdByDateEqProd.set(`${r.date}|${r.equipmentId}|${r.productId}`, +r.qtyStn));

  const storageByProduct = new Map();
  storages.forEach(st=> (st.allowedProductIds||[]).forEach(pid=>{ if(!storageByProduct.has(pid)) storageByProduct.set(pid, st); }));
  const findStorageForProduct = pid => storageByProduct.get(pid);

  const getEqProd = (date, eqId, pid) => {
    let q = actualProdByDateEqProd.get(`${date}|${eqId}|${pid}`);
    if(q==null){
      const camp = ds.campaigns.find(c=>c.date===date && c.facilityId===fac && c.equipmentId===eqId && (c.status||'produce')==='produce' && c.productId===pid);
      q = camp?.rateStn ?? 0;
    }
    return +q||0;
  };

  const bodByStorageDate = new Map();
  const eodByStorageDate = new Map();
  const shipByProductDate = new Map();
  const derivedClkUseByDate = new Map();
  const kilnProdByDate = new Map();
  const fmProdByDate = new Map();
  const prodByEqDate = new Map();
  const eqCellMeta = new Map();
  const inventoryCellMeta = new Map();
  const alertsByDate = new Map();

  const yesterday = addDays(startDate,-1);
  storages.forEach(st=>{
    // Interim v1 rule for testing: inventory rows entered in Daily Actuals are treated as
    // the beginning inventory for the selected date (seed), not an override of calculated EOD.
    // This matches the user's validation workflow: BOD + production - outflows = EOD.
    const sameDaySeed = invEODByDateStorage.get(`${startDate}|${st.id}`);
    const prevDaySeed = invEODByDateStorage.get(`${yesterday}|${st.id}`);
    const seed = sameDaySeed ?? prevDaySeed;
    bodByStorageDate.set(`${startDate}|${st.id}`, seed ? +seed.qtyStn : 0);
  });


  const productColorFor = (pid)=> {
    const base = ['#dbeafe','#fef3c7','#dcfce7','#fce7f3','#ede9fe','#cffafe','#fee2e2','#e2e8f0'];
    let h=0; const s0=(pid||''); for(let i=0;i<s0.length;i++) h = (h*31 + s0.charCodeAt(i))>>>0;
    return base[h % base.length];
  };
  const setEqMeta = (date, eqId) => {
    const actualRows = ds.actuals.production.filter(r=>r.facilityId===fac && r.date===date && r.equipmentId===eqId && (+r.qtyStn||0)!==0);
    if(actualRows.length){
      const total = actualRows.reduce((a,b)=>a + (+b.qtyStn||0),0);
      const dom = [...actualRows].sort((a,b)=>(+b.qtyStn||0)-(+a.qtyStn||0))[0];
      eqCellMeta.set(`${date}|${eqId}`, { source:'actual', status:'produce', productId:dom?.productId||'', totalQty:total, multiProduct:actualRows.length>1, color:productColorFor(dom?.productId||'') });
      return;
    }
    const camp = ds.campaigns.find(c=>c.facilityId===fac && c.date===date && c.equipmentId===eqId);
    if(camp){
      const st = camp.status || ((camp.productId && (+camp.rateStn||0)>0)?'produce':'idle');
      eqCellMeta.set(`${date}|${eqId}`, { source:'plan', status:st, productId:camp.productId||'', totalQty:+camp.rateStn||0, color: st==='produce' ? productColorFor(camp.productId||'') : '' });
      return;
    }
    eqCellMeta.set(`${date}|${eqId}`, { source:'none', status:'idle', productId:'', totalQty:0, color:'' });
  };

  dates.forEach((date, idx)=>{
    if(idx>0){
      const prev = dates[idx-1];
      storages.forEach(st=> bodByStorageDate.set(`${date}|${st.id}`, eodByStorageDate.get(`${prev}|${st.id}`) ?? 0));
    }

    const delta = new Map();
    const addDelta = (storageId, q)=> delta.set(storageId, (delta.get(storageId)||0) + q);

    let kilnTotal = 0;
    let fmTotal = 0;
    let clkDerived = 0;

    // Kilns (visible production)
    kilns.forEach(eq=>{
      let eqTotal = 0;
      s.getCapsForEquipment(eq.id).forEach(cap=>{
        const qty = getEqProd(date, eq.id, cap.productId);
        if(!qty) return;
        eqTotal += qty; kilnTotal += qty;
        const outSt = findStorageForProduct(cap.productId); if(outSt) addDelta(outSt.id, qty);
      });
      prodByEqDate.set(`${date}|${eq.id}`, eqTotal);
    });

    // Finish mills (visible production + recipe consumption)
    fms.forEach(eq=>{
      let eqTotal = 0;
      s.getCapsForEquipment(eq.id).forEach(cap=>{
        const qty = getEqProd(date, eq.id, cap.productId);
        if(!qty) return;
        eqTotal += qty; fmTotal += qty;
        const outSt = findStorageForProduct(cap.productId); if(outSt) addDelta(outSt.id, qty);

        const recipe = s.getRecipeForProduct(cap.productId);
        if(recipe){
          recipe.components.forEach(c=>{
            const compQty = qty * (+c.pct||0) / 100;
            const compSt = findStorageForProduct(c.materialId);
            if(compSt) addDelta(compSt.id, -compQty);
            if(familyOfProduct(s, c.materialId)==='CLINKER') clkDerived += compQty;
          });
        }
      });
      prodByEqDate.set(`${date}|${eq.id}`, eqTotal);
    });

    [...kilns,...fms].forEach(eq=> setEqMeta(date, eq.id));

    // Shipments (finished only visible)
    s.finishedProducts.forEach(fp=>{
      const q = +s.demandForDateProduct(date, fp.id) || 0;
      shipByProductDate.set(`${date}|${fp.id}`, q);
      if(q){ const st = findStorageForProduct(fp.id); if(st) addDelta(st.id, -q); }
    });

    derivedClkUseByDate.set(date, clkDerived);
    kilnProdByDate.set(date, kilnTotal);
    fmProdByDate.set(date, fmTotal);

    storages.forEach(st=>{
      const bod = bodByStorageDate.get(`${date}|${st.id}`) ?? 0;
      const calc = bod + (delta.get(st.id)||0);
      // Do not override EOD with manual inventory rows in v1 testing mode.
      // Daily Actuals inventory is currently used as the day's starting inventory seed.
      eodByStorageDate.set(`${date}|${st.id}`, calc);
      const maxCap = Number(st.maxCapacityStn);
      let severity = '';
      let reason = '';
      if(Number.isFinite(maxCap) && maxCap>0 && calc > maxCap){
        severity = 'full';
        reason = `EOD ${calc.toFixed(1)} > max ${maxCap.toFixed(1)}`;
      } else if (calc < 0){
        severity = 'stockout';
        reason = `EOD ${calc.toFixed(1)} < 0`;
      }
      if(severity){
        inventoryCellMeta.set(`${date}|${st.id}`, { severity, eod: calc, maxCap: Number.isFinite(maxCap)?maxCap:null, storageId: st.id, storageName: st.name, reason });
        const arr = alertsByDate.get(date) || [];
        arr.push({ severity, storageId: st.id, storageName: st.name, reason });
        alertsByDate.set(date, arr);
      }
    });
  });

  const visibleStorages = storages.filter(st=>{
    const pid = (st.allowedProductIds||[])[0];
    const fam = familyOfProduct(s, pid);
    return fam==='CLINKER' || fam==='CEMENT';
  });
  const storageFamily = st => familyOfProduct(s, (st.allowedProductIds||[])[0]);

  const mkValues = (getter)=> Object.fromEntries(dates.map(d=>[d, getter(d)]));

  // Inventory rows split BOD / EOD with family subtotals
  const inventoryBODRows = [];
  const inventoryEODRows = [];
  ['CLINKER','CEMENT'].forEach(group=>{
    const rows = visibleStorages.filter(st=>storageFamily(st)===group);
    const label = `${group} INVENTORY`;
    inventoryBODRows.push({kind:'subtotal', label, values: mkValues(d=> rows.reduce((s0,st)=>s0 + (+bodByStorageDate.get(`${d}|${st.id}`)||0),0))});
    rows.forEach(st=> inventoryBODRows.push({kind:'row', storageId: st.id, label: st.name, productLabel: (st.allowedProductIds||[]).map(pid=>s.getMaterial(pid)?.name).filter(Boolean).join(' / '), values: mkValues(d=> +bodByStorageDate.get(`${d}|${st.id}`)||0)}));

    inventoryEODRows.push({kind:'subtotal', label, values: mkValues(d=> rows.reduce((s0,st)=>s0 + (+eodByStorageDate.get(`${d}|${st.id}`)||0),0))});
    rows.forEach(st=> inventoryEODRows.push({kind:'row', storageId: st.id, label: st.name, productLabel: (st.allowedProductIds||[]).map(pid=>s.getMaterial(pid)?.name).filter(Boolean).join(' / '), values: mkValues(d=> +eodByStorageDate.get(`${d}|${st.id}`)||0)}));
  });

  const productionRows = [];
  productionRows.push({kind:'subtotal', label:'CLINKER PRODUCTION', values: mkValues(d=>kilnProdByDate.get(d)||0)});
  kilns.forEach(k=> productionRows.push({kind:'row', rowType:'equipment', equipmentId:k.id, label:k.name, values: mkValues(d=>prodByEqDate.get(`${d}|${k.id}`)||0)}));
  productionRows.push({kind:'subtotal', label:'FINISH MILL PRODUCTION', values: mkValues(d=>fmProdByDate.get(d)||0)});
  fms.forEach(f=> productionRows.push({kind:'row', rowType:'equipment', equipmentId:f.id, label:f.name, values: mkValues(d=>prodByEqDate.get(`${d}|${f.id}`)||0)}));

  const outflowRows = [];
  outflowRows.push({kind:'group', label:'CUSTOMER SHIPMENTS'});
  s.finishedProducts.forEach(fp=> outflowRows.push({kind:'row', label:`MIA / SHIP / CEM / ${fp.name.replace(/^.*\/ /,'')}`.replace(/^MIA \/ SHIP \/ CEM \/ /,'').includes('MIA /')?fp.name:fp.name, productLabel: fp.name, values: mkValues(d=>shipByProductDate.get(`${d}|${fp.id}`)||0)}));
  outflowRows.push({kind:'group', label:'INTERNAL CONSUMPTION (DERIVED)'});
  outflowRows.push({kind:'subtotal', label:'CLK CONSUMED BY FINISH MILLS', values: mkValues(d=>derivedClkUseByDate.get(d)||0)});

  const alertSummary = Object.fromEntries(dates.map(d=>[d, (alertsByDate.get(d)||[])]));
  return { dates, productionRows, inventoryBODRows, outflowRows, inventoryEODRows, equipmentCellMeta: Object.fromEntries([...eqCellMeta.entries()]), inventoryCellMeta: Object.fromEntries([...inventoryCellMeta.entries()]), alertSummary, debug:{bodByStorageDate,eodByStorageDate} };
}

export function yesterdayLocal(){
  const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);
}
