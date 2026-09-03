require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'requests.json');
const PARTNER_FILE = path.join(ROOT, 'data', 'partners.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
for (const f of [DATA_FILE, PARTNER_FILE]) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (!fs.existsSync(f)) fs.writeFileSync(f, '[]');
}
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_, file, cb) => cb(allowed.has(file.mimetype) ? null : new Error('Only JPG, PNG, WEBP and PDF files are allowed.'), allowed.has(file.mimetype))
});
const fields = upload.fields([{ name:'documents', maxCount:8 }, { name:'paymentProof', maxCount:1 }]);

app.disable('x-powered-by');
app.use(express.json({ limit:'1mb' }));
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough:false }));

function readJson(file){ try { const x=JSON.parse(fs.readFileSync(file,'utf8')); return Array.isArray(x)?x:[]; } catch { return []; } }
function writeJson(file,data){ const tmp=file+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(data,null,2)); fs.renameSync(tmp,file); }
const readRequests=()=>readJson(DATA_FILE), writeRequests=d=>writeJson(DATA_FILE,d);
const readPartners=()=>readJson(PARTNER_FILE), writePartners=d=>writeJson(PARTNER_FILE,d);
function clean(v,max=500){ return String(v || '').trim().slice(0,max); }
function nextId(){ const d=new Date(); const day=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; return `MSD-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function nextPartnerId(items){ let n=items.length+1; let id; do { id=`MSP-${String(n++).padStart(4,'0')}`; } while(items.some(x=>x.id===id)); return id; }
function hashPin(pin){ return crypto.createHash('sha256').update(String(pin)).digest('hex'); }
function config(){ return {shopName:process.env.SHOP_NAME||'MS MANISH DIGITAL CYBER EXPERT',tagline:process.env.SHOP_TAGLINE||'Your Trusted Digital Service Partner',phone:process.env.SHOP_PHONE||'9229288090',email:process.env.SHOP_EMAIL||'msmanishdcexpert@gmail.com',address:process.env.SHOP_ADDRESS||'Panchavati Chowk, Hospital Road, Rajnagar, Madhubani, Bihar - 847235',upiId:process.env.UPI_ID||''}; }
function adminAuth(req,res,next){
  const given=req.headers.authorization||'';
  const expected='Basic '+Buffer.from(`${process.env.ADMIN_USER||'admin'}:${process.env.ADMIN_PASSWORD||'ChangeMe123'}`).toString('base64');
  const a=Buffer.from(given), b=Buffer.from(expected);
  if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) return res.status(401).json({error:'Invalid admin login'});
  next();
}
function tokenSecret(){ return process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'CHANGE_ME'; }
function signPartnerToken(partnerId){
  const exp=Date.now()+12*60*60*1000;
  const body=`${partnerId}.${exp}`;
  const sig=crypto.createHmac('sha256',tokenSecret()).update(body).digest('hex');
  return Buffer.from(`${body}.${sig}`).toString('base64url');
}
function verifyPartnerToken(token){
  try{
    const raw=Buffer.from(String(token),'base64url').toString();
    const [partnerId,exp,sig]=raw.split('.');
    if(!partnerId||!exp||!sig||Date.now()>Number(exp)) return null;
    const body=`${partnerId}.${exp}`;
    const expected=crypto.createHmac('sha256',tokenSecret()).update(body).digest('hex');
    if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const p=readPartners().find(x=>x.id===partnerId && x.active!==false);
    return p||null;
  }catch{return null;}
}
function partnerAuth(req,res,next){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const partner=verifyPartnerToken(token);
  if(!partner) return res.status(401).json({error:'Partner login expired or invalid'});
  req.partner=partner; next();
}
function uploadedFiles(req){
  const docs=((req.files||{}).documents||[]).map(f=>({name:f.originalname,url:`/uploads/${f.filename}`,size:f.size,type:f.mimetype}));
  const pay=((req.files||{}).paymentProof||[])[0];
  return {docs,pay:pay?{name:pay.originalname,url:`/uploads/${pay.filename}`,size:pay.size,type:pay.mimetype}:null};
}
function makeRequest(body,req,source='Customer',partner=null){
  const name=clean(body.name,100), mobile=clean(body.mobile,15), service=clean(body.service,120);
  if(!name || !/^\d{10}$/.test(mobile) || !service) throw new Error('Valid name, 10-digit mobile and service are required.');
  const {docs,pay}=uploadedFiles(req); const now=new Date().toISOString();
  return {id:nextId(),name,mobile,service,email:clean(body.email,150),message:clean(body.message,1500),deliveryMode:clean(body.deliveryMode,30)||'WhatsApp',paymentAmount:Math.max(0,Number(body.paymentAmount||0))||0,paymentStatus:pay?'Proof Submitted':'Not Submitted',paymentProof:pay,files:docs,status:source==='Partner'?'New':'Received',adminNote:'',source,partnerId:partner?.id||'',partnerName:partner?.name||'',createdAt:now,updatedAt:now,history:[{status:source==='Partner'?'New':'Received',at:now}]};
}

app.get('/api/config',(_,res)=>res.json(config()));
app.post('/api/requests',fields,(req,res)=>{ try{const items=readRequests(); const item=makeRequest(req.body,req); items.unshift(item); writeRequests(items); res.status(201).json({success:true,id:item.id,status:item.status,createdAt:item.createdAt});}catch(e){res.status(400).json({error:e.message});} });
app.get('/api/status',(req,res)=>{const id=clean(req.query.id,40).toUpperCase(),mobile=clean(req.query.mobile,15);const item=readRequests().find(x=>x.id===id&&x.mobile===mobile);if(!item)return res.status(404).json({error:'Work ID or mobile number did not match.'});res.json({id:item.id,name:item.name,service:item.service,status:item.status,adminNote:item.adminNote,paymentStatus:item.paymentStatus,createdAt:item.createdAt,updatedAt:item.updatedAt,history:item.history||[]});});
app.get('/api/receipt/:id',(req,res)=>{const mobile=clean(req.query.mobile,15);const item=readRequests().find(x=>x.id===req.params.id.toUpperCase()&&x.mobile===mobile);if(!item)return res.status(404).json({error:'Receipt not found'});res.json({...item,files:(item.files||[]).map(f=>({name:f.name,size:f.size})),paymentProof:item.paymentProof?{name:item.paymentProof.name,size:item.paymentProof.size}:null,shop:config()});});

// Partner API
app.post('/api/partner/login',(req,res)=>{const id=clean(req.body.partnerId,30).toUpperCase(),pin=clean(req.body.pin,30);const p=readPartners().find(x=>x.id===id&&x.active!==false&&x.pinHash===hashPin(pin));if(!p)return res.status(401).json({error:'Invalid Partner ID or PIN'});res.json({success:true,token:signPartnerToken(p.id),partner:{id:p.id,name:p.name,mobile:p.mobile,area:p.area}});});
app.get('/api/partner/me',partnerAuth,(req,res)=>res.json({id:req.partner.id,name:req.partner.name,mobile:req.partner.mobile,area:req.partner.area}));
app.get('/api/partner/stats',partnerAuth,(req,res)=>{const d=readRequests().filter(x=>x.partnerId===req.partner.id);const completed=d.filter(x=>['Completed','Delivered'].includes(x.status)).length;const processing=d.filter(x=>['New','Assigned','Processing','Checking'].includes(x.status)).length;const received=d.reduce((a,x)=>a+(Number(x.paymentAmount)||0),0);res.json({total:d.length,processing,completed,received});});
app.get('/api/partner/works',partnerAuth,(req,res)=>{let d=readRequests().filter(x=>x.partnerId===req.partner.id);const q=clean(req.query.q,100).toLowerCase();if(q)d=d.filter(x=>[x.id,x.name,x.mobile,x.service,x.status].some(v=>String(v).toLowerCase().includes(q)));res.json(d.map(x=>({...x,paymentProof:x.paymentProof?{name:x.paymentProof.name,url:x.paymentProof.url}:null})));});
app.post('/api/partner/works',partnerAuth,fields,(req,res)=>{try{const d=readRequests();const item=makeRequest(req.body,req,'Partner',req.partner);d.unshift(item);writeRequests(d);res.status(201).json({success:true,id:item.id,status:item.status});}catch(e){res.status(400).json({error:e.message});}});

// Admin API
app.get('/api/admin/requests',adminAuth,(req,res)=>{let d=readRequests();const q=clean(req.query.q,100).toLowerCase(),status=clean(req.query.status,40);if(q)d=d.filter(x=>[x.id,x.name,x.mobile,x.service,x.partnerName,x.partnerId].some(v=>String(v||'').toLowerCase().includes(q)));if(status&&status!=='All')d=d.filter(x=>x.status===status);res.json(d);});
app.get('/api/admin/stats',adminAuth,(_,res)=>{const d=readRequests();const revenue=d.reduce((a,x)=>a+(Number(x.paymentAmount)||0),0);res.json({total:d.length,new:d.filter(x=>['New','Received'].includes(x.status)).length,processing:d.filter(x=>['Assigned','Processing','Checking','Waiting for Customer'].includes(x.status)).length,completed:d.filter(x=>['Completed','Delivered'].includes(x.status)).length,revenue,partners:readPartners().filter(x=>x.active!==false).length});});
app.patch('/api/admin/requests/:id',adminAuth,(req,res)=>{const d=readRequests(),item=d.find(x=>x.id===req.params.id.toUpperCase());if(!item)return res.status(404).json({error:'Request not found'});const allowed=['Received','New','Assigned','Processing','Checking','Waiting for Customer','Completed','Delivered','Cancelled'];if(req.body.status&&allowed.includes(req.body.status)&&req.body.status!==item.status){item.status=req.body.status;item.history=(item.history||[]).concat({status:item.status,at:new Date().toISOString()});}if(typeof req.body.adminNote==='string')item.adminNote=clean(req.body.adminNote,1000);if(typeof req.body.paymentStatus==='string')item.paymentStatus=clean(req.body.paymentStatus,40);if(req.body.paymentAmount!==undefined)item.paymentAmount=Math.max(0,Number(req.body.paymentAmount)||0);item.updatedAt=new Date().toISOString();writeRequests(d);res.json(item);});
app.delete('/api/admin/requests/:id',adminAuth,(req,res)=>{const d=readRequests(),idx=d.findIndex(x=>x.id===req.params.id.toUpperCase());if(idx<0)return res.status(404).json({error:'Request not found'});const [item]=d.splice(idx,1);[...(item.files||[]),...(item.paymentProof?[item.paymentProof]:[])].forEach(f=>{try{fs.unlinkSync(path.join(ROOT,f.url));}catch{}});writeRequests(d);res.json({success:true});});
app.get('/api/admin/export',adminAuth,(_,res)=>{const rows=readRequests();const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const head=['Work ID','Date','Partner ID','Partner','Name','Mobile','Service','Status','Payment Status','Amount','Admin Note'];const csv=[head,...rows.map(x=>[x.id,x.createdAt,x.partnerId,x.partnerName,x.name,x.mobile,x.service,x.status,x.paymentStatus,x.paymentAmount,x.adminNote])].map(r=>r.map(esc).join(',')).join('\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="ms-manish-work-report.csv"');res.send('\uFEFF'+csv);});
app.get('/api/admin/backup',adminAuth,(_,res)=>res.download(DATA_FILE,'ms-manish-portal-backup.json'));
app.post('/api/admin/restore',adminAuth,upload.single('backup'),(req,res)=>{try{const d=JSON.parse(fs.readFileSync(req.file.path,'utf8'));if(!Array.isArray(d))throw new Error();writeRequests(d);fs.unlinkSync(req.file.path);res.json({success:true,count:d.length});}catch{if(req.file)try{fs.unlinkSync(req.file.path)}catch{};res.status(400).json({error:'Invalid backup file'});}});

app.get('/api/admin/partners',adminAuth,(_,res)=>res.json(readPartners().map(({pinHash,...p})=>p)));
app.post('/api/admin/partners',adminAuth,(req,res)=>{const d=readPartners();const name=clean(req.body.name,100),mobile=clean(req.body.mobile,15),area=clean(req.body.area,120),pin=clean(req.body.pin,20);if(!name||!/^\d{10}$/.test(mobile)||pin.length<4)return res.status(400).json({error:'Name, 10-digit mobile and minimum 4-digit PIN required'});const p={id:nextPartnerId(d),name,mobile,area,pinHash:hashPin(pin),active:true,createdAt:new Date().toISOString()};d.push(p);writePartners(d);const {pinHash,...safe}=p;res.status(201).json(safe);});
app.patch('/api/admin/partners/:id',adminAuth,(req,res)=>{const d=readPartners(),p=d.find(x=>x.id===req.params.id.toUpperCase());if(!p)return res.status(404).json({error:'Partner not found'});if(typeof req.body.name==='string')p.name=clean(req.body.name,100);if(typeof req.body.mobile==='string'&&/^\d{10}$/.test(req.body.mobile))p.mobile=req.body.mobile;if(typeof req.body.area==='string')p.area=clean(req.body.area,120);if(typeof req.body.active==='boolean')p.active=req.body.active;if(typeof req.body.pin==='string'&&req.body.pin.length>=4)p.pinHash=hashPin(req.body.pin);writePartners(d);const {pinHash,...safe}=p;res.json(safe);});

app.get('/admin',(_,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('/partner',(_,res)=>res.sendFile(path.join(ROOT,'public','partner.html')));
app.get('/receipt',(_,res)=>res.sendFile(path.join(ROOT,'public','receipt.html')));
app.use((err,req,res,next)=>res.status(400).json({error:err.message||'Request failed'}));
app.listen(PORT,()=>console.log(`MS MANISH CYBER ERP v3 running: http://localhost:${PORT}`));
