import { selectors, Categories } from './dataAuthority.js';

const fmtDate = d => d.toISOString().slice(0,10);
const addDays = (dateStr,n)=>{ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return fmtDate(d); };

export function buildProductionPlanView(state, startDate, days=14){
  const s = selectors(state);
  const ds = s.dataset;
  const fac = state.ui.selectedFacilityId;

  const dates = Array.from({length:days},(_,i)=>addDays(startDate,i));
  const storages = s.storages;
  const kilns = s.equipment.filter(e=>e.type==='kiln');
  const fms = s.equipment.filter(e=>e.type==='finish_mill');
  const rms = s.equipment.filter(e=>e.type==='raw_mill');

  const storageProductMap = new Map();
  storages.forEach(st=>{
    if(st.allowedProductIds?.length===1) storageProductMap.set(st.id, st.allowedProductIds[0]);
  });

  const invEODByDateStorage = new Map();
  ds.actuals.inventoryEOD.filter(r=>r.facilityId===fac).forEach(r=>invEODByDateStorage.set(`${r.date}|${r.storageId}`, r));
  const actualProdByDateEqProd = new Map();
  ds.actuals.production.filter(r=>r.facilityId===fac).forEach(r=>actualProdByDateEqProd.set(`${r.date}|${r.equipmentId}|${r.productId}`, r.qtyStn));

  const productionRows = [];
  const invRows = [];

  // compute inventory evolution by storage, using simplified allocation by exact product storage
  const inventoryByStorageDate = new Map(); // BOD values per date
  const eodByStorageDate = new Map();

  // seed BOD(startDate) from actuals EOD(yesterday)
  const yesterday = addDays(startDate,-1);
  storages.forEach(st=>{
    const seed = invEODByDateStorage.get(`${yesterday}|${st.id}`);
    inventoryByStorageDate.set(`${startDate}|${st.id}`, seed ? +seed.qtyStn : 0);
  });

  dates.forEach((date, idx)=>{
    // carry BOD from prior day EOD
    if(idx>0){
      const prev = dates[idx-1];
      storages.forEach(st=> inventoryByStorageDate.set(`${date}|${st.id}`, eodByStorageDate.get(`${prev}|${st.id}`) ?? 0));
    }

    // Production records for display: actuals if present; else campaign rows
    const dayProd = [];
    [...kilns, ...fms].forEach(eq=>{
      const caps = s.getCapsForEquipment(eq.id);
      let totalEq = 0;
      caps.forEach(cap=>{
        let qty = actualProdByDateEqProd.get(`${date}|${eq.id}|${cap.productId}`);
        if(qty==null){
          const camp = ds.campaigns.find(c=>c.date===date && c.facilityId===fac && c.equipmentId===eq.id && c.productId===cap.productId);
          qty = camp?.rateStn ?? 0;
        }
        if(qty){ dayProd.push({equipmentId:eq.id, equipmentName:eq.name, equipmentType:eq.type, productId:cap.productId, qtyStn:+qty}); totalEq += +qty; }
      });
      productionRows.push({date, equipmentId:eq.id, equipmentName:eq.name, equipmentType:eq.type, totalQtyStn: totalEq, detail: dayProd.filter(x=>x.equipmentId===eq.id)});
    });

    // Inventory math (simplified): add outputs, consume recipe comps, consume raw meal for kiln, shipments
    // Start from BOD
    const delta = new Map();
    const addDelta = (storageId, q)=> delta.set(storageId, (delta.get(storageId)||0)+q);
    const findStorageForProduct = (pid)=> storages.find(st=> (st.allowedProductIds||[]).includes(pid));

    // Equipment production actuals/campaigns for all eq including raw mills for inventory impacts
    s.equipment.forEach(eq=>{
      const caps = s.getCapsForEquipment(eq.id);
      caps.forEach(cap=>{
        let qty = actualProdByDateEqProd.get(`${date}|${eq.id}|${cap.productId}`);
        if(qty==null){
          const camp = ds.campaigns.find(c=>c.date===date && c.facilityId===fac && c.equipmentId===eq.id && c.productId===cap.productId);
          qty = camp?.rateStn ?? 0;
        }
        qty = +qty||0;
        if(!qty) return;
        // Add output to storage of produced product
        const outSt = findStorageForProduct(cap.productId);
        if(outSt) addDelta(outSt.id, qty);

        if(eq.type==='finish_mill'){
          const recipe = s.getRecipeForProduct(cap.productId);
          if(recipe){
            recipe.components.forEach(c=>{
              const compQty = qty * (+c.pct||0)/100;
              const compSt = findStorageForProduct(c.materialId);
              if(compSt) addDelta(compSt.id, -compQty);
            });
          }
        }
        if(eq.type==='kiln'){
          // raw meal draw via capability or default factor on equipment not yet modeled -> 1.55
          const factor = 1.55;
          const rawMeal = s.intermediates.find(m=>/RAW\s*MEAL/i.test(m.name)) || s.intermediates[0] || s.raws[0];
          if(rawMeal){
            const rmSt = findStorageForProduct(rawMeal.id);
            if(rmSt) addDelta(rmSt.id, -(qty*factor));
          }
        }
      });
    });

    // Shipments reduce finished inventory
    s.finishedProducts.forEach(fp=>{
      const q = s.demandForDateProduct(date, fp.id) || 0;
      if(q){ const st = findStorageForProduct(fp.id); if(st) addDelta(st.id, -q); }
    });

    // manual actual EOD overrides for this date win (if entered)
    storages.forEach(st=>{
      const manual = invEODByDateStorage.get(`${date}|${st.id}`);
      const bod = inventoryByStorageDate.get(`${date}|${st.id}`) ?? 0;
      const calc = bod + (delta.get(st.id)||0);
      const eod = manual ? +manual.qtyStn : calc;
      eodByStorageDate.set(`${date}|${st.id}`, eod);
    });
  });

  // build inventory rows grouped
  const classifyStorage = (st)=>{
    const pids = st.allowedProductIds||[];
    const mats = pids.map(pid=>s.getMaterial(pid)).filter(Boolean);
    if(mats.some(m=>/CLINKER/i.test(m.name))) return 'CLINKER';
    if(mats.some(m=>m.category===Categories.FIN)) return 'CEMENT';
    if(mats.some(m=>m.category===Categories.FUEL)) return 'FUEL';
    return 'RAW';
  };

  const groups = ['CLINKER','CEMENT','RAW','FUEL'];
  groups.forEach(group=>{
    const rows = storages.filter(st=>classifyStorage(st)===group);
    const subtotal = {kind:'subtotal', group, label: `${group==='RAW'?'RAW MATERIAL':group} INVENTORY`};
    subtotal.values = Object.fromEntries(dates.map(d=>[d, rows.reduce((sum,st)=>sum + (eodByStorageDate.get(`${d}|${st.id}`) ?? 0),0)]));
    invRows.push(subtotal);
    rows.forEach(st=>{
      const pLabel = (st.allowedProductIds||[]).map(pid=>s.getMaterial(pid)?.name).filter(Boolean).join(' / ');
      invRows.push({kind:'row', group, storageId:st.id, label: st.name, productLabel:pLabel, values:Object.fromEntries(dates.map(d=>[d, eodByStorageDate.get(`${d}|${st.id}`) ?? 0]))});
    });
  });

  // production grouped rows
  const byEqDateTotal = (eqId,date)=> productionRows.find(r=>r.equipmentId===eqId&&r.date===date)?.totalQtyStn || 0;
  const prodTableRows = [];
  const kilnSubtotal = {kind:'subtotal', label:'CLINKER PRODUCTION', values:Object.fromEntries(dates.map(d=>[d, kilns.reduce((s0,e)=>s0+byEqDateTotal(e.id,d),0)]))};
  prodTableRows.push(kilnSubtotal);
  kilns.forEach(k=> prodTableRows.push({kind:'row', equipmentId:k.id, label:k.name, values:Object.fromEntries(dates.map(d=>[d, byEqDateTotal(k.id,d)]))}));
  const fmSubtotal = {kind:'subtotal', label:'FINISH MILL PRODUCTION', values:Object.fromEntries(dates.map(d=>[d, fms.reduce((s0,e)=>s0+byEqDateTotal(e.id,d),0)]))};
  prodTableRows.push(fmSubtotal);
  fms.forEach(f=> prodTableRows.push({kind:'row', equipmentId:f.id, label:f.name, values:Object.fromEntries(dates.map(d=>[d, byEqDateTotal(f.id,d)]))}));

  return { dates, productionRows: prodTableRows, inventoryRows: invRows, debug: {inventoryByStorageDate, eodByStorageDate} };
}

export function yesterdayLocal(){
  const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);
}
