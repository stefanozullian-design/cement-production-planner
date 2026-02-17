const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error('DB Error:', err);
    else console.log('DB connected at', res.rows[0].now);
});

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

app.get('/', (req, res) => res.json({ name: 'CEMEX Production Planning API', version: '2.0.0' }));
app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// LOCATIONS
app.get('/api/locations', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM locations WHERE active=true ORDER BY type DESC, name');
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PRODUCTS
app.get('/api/products', async (req, res) => {
    const { location } = req.query;
    if (!location) return res.status(400).json({ error: 'location required' });
    try {
        const r = await pool.query('SELECT * FROM products WHERE location_code=$1 ORDER BY family, name', [location]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    const { name, family, color, recipe, location_code } = req.body;
    if (!name || !family || !location_code) return res.status(400).json({ error: 'name, family, location_code required' });
    try {
        const r = await pool.query(
            'INSERT INTO products (name, family, color, recipe, location_code) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [name, family, color||'#3b82f6', JSON.stringify(recipe||{}), location_code]
        );
        res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', async (req, res) => {
    const { name, family, color, recipe } = req.body;
    try {
        const r = await pool.query(
            'UPDATE products SET name=$1,family=$2,color=$3,recipe=$4 WHERE id=$5 RETURNING *',
            [name, family, color, JSON.stringify(recipe), req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM products WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// EQUIPMENT
app.get('/api/equipment', async (req, res) => {
    const { location } = req.query;
    if (!location) return res.status(400).json({ error: 'location required' });
    try {
        const r = await pool.query('SELECT * FROM equipment WHERE location_code=$1 ORDER BY type,name', [location]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/equipment', async (req, res) => {
    const { name, type, params, position_x, position_y, location_code } = req.body;
    if (!name||!type||!location_code) return res.status(400).json({ error: 'name,type,location_code required' });
    try {
        const r = await pool.query(
            'INSERT INTO equipment (name,type,params,position_x,position_y,location_code) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
            [name, type, JSON.stringify(params||{}), position_x||0, position_y||0, location_code]
        );
        res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/equipment/:id', async (req, res) => {
    const { name, type, params, position_x, position_y } = req.body;
    try {
        const r = await pool.query(
            'UPDATE equipment SET name=$1,type=$2,params=$3,position_x=$4,position_y=$5 WHERE id=$6 RETURNING *',
            [name, type, JSON.stringify(params), position_x, position_y, req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/equipment/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM equipment WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// CONNECTIONS
app.get('/api/connections', async (req, res) => {
    const { location } = req.query;
    if (!location) return res.status(400).json({ error: 'location required' });
    try {
        const r = await pool.query('SELECT * FROM connections WHERE location_code=$1', [location]);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/connections', async (req, res) => {
    const { from_equipment_id, to_equipment_id, product_id, percentage, location_code } = req.body;
    try {
        const r = await pool.query(
            'INSERT INTO connections (from_equipment_id,to_equipment_id,product_id,percentage,location_code) VALUES ($1,$2,$3,$4,$5) RETURNING *',
            [from_equipment_id, to_equipment_id, product_id, percentage, location_code]
        );
        res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/connections/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM connections WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// CAMPAIGNS
app.get('/api/campaigns', async (req, res) => {
    const { location, start_date, end_date } = req.query;
    if (!location) return res.status(400).json({ error: 'location required' });
    try {
        let q = `SELECT c.*,p.name as product_name,e.name as equipment_name 
                 FROM campaigns c LEFT JOIN products p ON c.product_id=p.id LEFT JOIN equipment e ON c.equipment_id=e.id
                 WHERE c.location_code=$1`;
        const params = [location];
        if (start_date) { q += ` AND c.end_date>=$${params.length+1}`; params.push(start_date); }
        if (end_date) { q += ` AND c.start_date<=$${params.length+1}`; params.push(end_date); }
        q += ' ORDER BY c.start_date';
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/campaigns', async (req, res) => {
    const { equipment_id, product_id, start_date, end_date, status, planned_tpd, reason, location_code } = req.body;
    if (!equipment_id||!start_date||!end_date||!status||!location_code)
        return res.status(400).json({ error: 'Missing required fields' });
    try {
        const r = await pool.query(
            'INSERT INTO campaigns (equipment_id,product_id,start_date,end_date,status,planned_tpd,reason,location_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
            [equipment_id, product_id, start_date, end_date, status, planned_tpd||0, reason, location_code]
        );
        res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/campaigns/:id', async (req, res) => {
    const { equipment_id, product_id, start_date, end_date, status, planned_tpd, reason } = req.body;
    try {
        const r = await pool.query(
            'UPDATE campaigns SET equipment_id=$1,product_id=$2,start_date=$3,end_date=$4,status=$5,planned_tpd=$6,reason=$7 WHERE id=$8 RETURNING *',
            [equipment_id, product_id, start_date, end_date, status, planned_tpd, reason, req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/campaigns/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM campaigns WHERE id=$1', [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// DEMAND
app.get('/api/demand', async (req, res) => {
    const { location, start_date, end_date, product_id } = req.query;
    if (!location) return res.status(400).json({ error: 'location required' });
    try {
        let q = 'SELECT * FROM demand_forecast WHERE location_code=$1';
        const params = [location];
        if (start_date) { q += ` AND forecast_date>=$${params.length+1}`; params.push(start_date); }
        if (end_date) { q += ` AND forecast_date<=$${params.length+1}`; params.push(end_date); }
        if (product_id) { q += ` AND product_id=$${params.length+1}`; params.push(product_id); }
        q += ' ORDER BY forecast_date';
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/demand', async (req, res) => {
    const { product_id, forecast_date, forecast_tons, forecast_type, location_code } = req.body;
    if (!product_id||!forecast_date||forecast_tons===undefined||!location_code)
        return res.status(400).json({ error: 'Missing required fields' });
    try {
        const r = await pool.query(
            `INSERT INTO demand_forecast (product_id,forecast_date,forecast_tons,forecast_type,location_code)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (location_code,product_id,forecast_date)
             DO UPDATE SET forecast_tons=$3,forecast_type=$4 RETURNING *`,
            [product_id, forecast_date, forecast_tons, forecast_type||'forecast', location_code]
        );
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// PRODUCTION
app.get('/api/production', async (req, res) => {
    const { location, start_date, end_date } = req.query;
    if (!location) return res.status(400).json({ error: 'location required' });
    try {
        let q = 'SELECT * FROM production_daily WHERE location_code=$1';
        const params = [location];
        if (start_date) { q += ` AND production_date>=$${params.length+1}`; params.push(start_date); }
        if (end_date) { q += ` AND production_date<=$${params.length+1}`; params.push(end_date); }
        q += ' ORDER BY production_date';
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// TRANSFERS (inter-location)
app.get('/api/transfers', async (req, res) => {
    const { location, role } = req.query;
    try {
        let q = `SELECT t.*,p.name as product_name,
                 fl.name as from_location_name, tl.name as to_location_name
                 FROM inter_location_transfers t
                 LEFT JOIN products p ON t.product_id=p.id
                 LEFT JOIN locations fl ON t.from_location=fl.code
                 LEFT JOIN locations tl ON t.to_location=tl.code
                 WHERE 1=1`;
        const params = [];
        if (location && role === 'sender') { q += ` AND t.from_location=$${params.length+1}`; params.push(location); }
        else if (location && role === 'receiver') { q += ` AND t.to_location=$${params.length+1}`; params.push(location); }
        else if (location) { q += ` AND (t.from_location=$${params.length+1} OR t.to_location=$${params.length+1})`; params.push(location); }
        q += ' ORDER BY t.transfer_date DESC';
        const r = await pool.query(q, params);
        res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/transfers', async (req, res) => {
    const { from_location, to_location, product_id, transfer_date, arrival_date, quantity_tons, transport_mode, status, notes } = req.body;
    if (!from_location||!to_location||!product_id||!transfer_date||!quantity_tons)
        return res.status(400).json({ error: 'Missing required fields' });
    try {
        const r = await pool.query(
            `INSERT INTO inter_location_transfers (from_location,to_location,product_id,transfer_date,arrival_date,quantity_tons,transport_mode,status,notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [from_location, to_location, product_id, transfer_date, arrival_date, quantity_tons, transport_mode||'truck', status||'planned', notes]
        );
        res.status(201).json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/transfers/:id', async (req, res) => {
    const { status, arrival_date, quantity_tons, notes } = req.body;
    try {
        const r = await pool.query(
            'UPDATE inter_location_transfers SET status=$1,arrival_date=$2,quantity_tons=$3,notes=$4 WHERE id=$5 RETURNING *',
            [status, arrival_date, quantity_tons, notes, req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// REGION SUMMARY
app.get('/api/region/summary', async (req, res) => {
    try {
        const locs = await pool.query('SELECT * FROM locations WHERE active=true ORDER BY type DESC,name');
        const summary = await Promise.all(locs.rows.map(async loc => {
            const [prod, equip, camp] = await Promise.all([
                pool.query('SELECT COUNT(*) FROM products WHERE location_code=$1', [loc.code]),
                pool.query('SELECT COUNT(*) FROM equipment WHERE location_code=$1', [loc.code]),
                pool.query("SELECT COUNT(*) FROM campaigns WHERE location_code=$1 AND status='active' AND end_date>=CURRENT_DATE", [loc.code])
            ]);
            return { ...loc, product_count: +prod.rows[0].count, equipment_count: +equip.rows[0].count, active_campaigns: +camp.rows[0].count };
        }));
        res.json(summary);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.listen(port, () => console.log(`CEMEX API v2.0 on port ${port}`));
