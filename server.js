require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const { v2: cloudinary } = require('cloudinary');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const EXPENSES_FILE = path.join(DATA_DIR, 'expenses.json');
const SERVICES_FILE = path.join(DATA_DIR, 'services.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const defaultServices = [
  'Online Form','Admit Card','Result','CSC Services','Printout','Xerox','Lamination','Spiral Binding',
  'Scholarship / DBT Check','Student Credit Card','PAN Card','Voter Card','APAAR / ABC ID','Passport',
  'Income Certificate','Caste Certificate','Residence Certificate','EWS / NCL / OBC Certificate',
  'Ayushman Card','Udyam Registration','EPFO / UAN','e-Shram Card','Ration Card','Bike Insurance',
  'LNMU Admission','LNMU Registration','LNMU Exam Form','LNMU Internship','Resume / Biodata','Other Online Work'
];
function ensureJson(file, fallback){ if(!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback,null,2)); }
ensureJson(REQUESTS_FILE, []); ensureJson(EXPENSES_FILE, []); ensureJson(SERVICES_FILE, defaultServices); ensureJson(SETTINGS_FILE, {});

const useMongo = Boolean(process.env.MONGODB_URI && /^mongodb(\+srv)?:\/\//.test(process.env.MONGODB_URI));
const useCloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
let db = null;
let mongoClient = null;
if(useCloudinary){
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const diskStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
    cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safe}`);
  }
});
const workUpload = multer({
  storage: useCloudinary ? multer.memoryStorage() : diskStorage,
  limits:{fileSize:10*1024*1024,files:10},
  fileFilter:(_,file,cb)=>cb(allowed.has(file.mimetype)?null:new Error('Only JPG, PNG, WEBP and PDF files are allowed.'),allowed.has(file.mimetype))
});
const fields = workUpload.fields([{ name:'documents', maxCount:8 }, { name:'paymentProof', maxCount:1 }]);
const backupUpload = multer({ storage: multer.memoryStorage(), limits:{fileSize:15*1024*1024} });

app.disable('x-powered-by');
app.use(express.json({ limit:'2mb' }));
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(ROOT, 'public')));
if(!useCloudinary) app.use('/uploads', express.static(UPLOAD_DIR, { fallthrough:false }));

function readJson(file,fallback=[]){ try{const x=JSON.parse(fs.readFileSync(file,'utf8')); return x ?? fallback;}catch{return fallback;} }
function writeJson(file,data){const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
function clean(v,max=500){return String(v||'').trim().slice(0,max);}
function money(v){return Math.max(0,Number(v)||0);}
function nextId(){const d=new Date(),day=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;return `MSD-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;}
function auth(req,res,next){const given=req.headers.authorization||'',expected='Basic '+Buffer.from(`${process.env.ADMIN_USER||'admin'}:${process.env.ADMIN_PASSWORD||'ChangeMe123'}`).toString('base64');try{const ok=given.length===expected.length&&crypto.timingSafeEqual(Buffer.from(given),Buffer.from(expected));if(!ok)throw Error();next();}catch{return res.status(401).json({error:'Invalid admin login'});}}
function normalizeWork(x){x.totalFee=money(x.totalFee ?? x.fee ?? 0);x.paidAmount=money(x.paidAmount ?? x.paymentAmount ?? 0);x.paymentAmount=x.paidAmount;x.dueAmount=Math.max(0,x.totalFee-x.paidAmount);return x;}
function customersFromRequests(rows){const m=new Map();rows.forEach(r=>{const k=r.mobile||r.name;if(!k)return;const cur=m.get(k)||{name:r.name,mobile:r.mobile,email:r.email||'',works:0,totalFee:0,paid:0,due:0,lastWorkAt:r.createdAt};const x=normalizeWork({...r});cur.works++;cur.totalFee+=x.totalFee;cur.paid+=x.paidAmount;cur.due+=x.dueAmount;if(new Date(r.createdAt)>new Date(cur.lastWorkAt)){cur.lastWorkAt=r.createdAt;cur.name=r.name;cur.email=r.email||cur.email;}m.set(k,cur);});return [...m.values()].sort((a,b)=>new Date(b.lastWorkAt)-new Date(a.lastWorkAt));}

async function connectDb(){
  if(!useMongo) return;
  mongoClient = new MongoClient(process.env.MONGODB_URI);
  await mongoClient.connect();
  db = mongoClient.db(process.env.MONGODB_DB || 'ms_manish_erp');
  await db.collection('requests').createIndex({id:1},{unique:true});
  await db.collection('requests').createIndex({mobile:1});
  if(await db.collection('services').countDocuments()===0){ await db.collection('services').insertOne({_id:'services',items:defaultServices}); }
  console.log('MongoDB connected');
}
async function getRequests(){ if(db) return db.collection('requests').find({},{projection:{_id:0}}).sort({createdAt:-1}).toArray(); const x=readJson(REQUESTS_FILE,[]);return Array.isArray(x)?x:[]; }
async function saveRequest(item){ if(db){await db.collection('requests').insertOne({...item});return;} const rows=await getRequests();rows.unshift(item);writeJson(REQUESTS_FILE,rows); }
async function updateRequest(id,mutator){
  if(db){const item=await db.collection('requests').findOne({id},{projection:{_id:0}});if(!item)return null;mutator(item);await db.collection('requests').replaceOne({id},item);return item;}
  const rows=await getRequests(),item=rows.find(x=>x.id===id);if(!item)return null;mutator(item);writeJson(REQUESTS_FILE,rows);return item;
}
async function deleteRequest(id){
  if(db){const item=await db.collection('requests').findOne({id},{projection:{_id:0}});if(!item)return null;await db.collection('requests').deleteOne({id});return item;}
  const rows=await getRequests(),idx=rows.findIndex(x=>x.id===id);if(idx<0)return null;const [item]=rows.splice(idx,1);writeJson(REQUESTS_FILE,rows);return item;
}
async function getExpenses(){ if(db)return db.collection('expenses').find({},{projection:{_id:0}}).sort({createdAt:-1}).toArray();return readJson(EXPENSES_FILE,[]); }
async function addExpense(item){if(db)await db.collection('expenses').insertOne({...item});else{const rows=await getExpenses();rows.unshift(item);writeJson(EXPENSES_FILE,rows);}}
async function removeExpense(id){if(db){const r=await db.collection('expenses').deleteOne({id});return r.deletedCount>0;}const rows=await getExpenses(),next=rows.filter(x=>x.id!==id);if(next.length===rows.length)return false;writeJson(EXPENSES_FILE,next);return true;}
async function getServices(){if(db){const x=await db.collection('services').findOne({_id:'services'});return Array.isArray(x?.items)&&x.items.length?x.items:defaultServices;}const x=readJson(SERVICES_FILE,defaultServices);return Array.isArray(x)&&x.length?x:defaultServices;}
async function setServices(items){if(db)await db.collection('services').replaceOne({_id:'services'},{_id:'services',items},{upsert:true});else writeJson(SERVICES_FILE,items);}
async function getSettings(){if(db){const x=await db.collection('settings').findOne({_id:'shop'});if(x)delete x._id;return x||{};}return readJson(SETTINGS_FILE,{});}
async function setSettings(settings){if(db)await db.collection('settings').replaceOne({_id:'shop'},{_id:'shop',...settings},{upsert:true});else writeJson(SETTINGS_FILE,settings);}
async function config(){const s=await getSettings();return {shopName:s.shopName||process.env.SHOP_NAME||'MS MANISH DIGITAL CYBER EXPERT',tagline:s.tagline||process.env.SHOP_TAGLINE||'Your Trusted Digital Service Partner',phone:s.phone||process.env.SHOP_PHONE||'9229288090',email:s.email||process.env.SHOP_EMAIL||'msmanishdcexpert@gmail.com',address:s.address||process.env.SHOP_ADDRESS||'Panchwati Chowk, Hospital Road, Rajnagar, Madhubani - 847235',upiId:s.upiId||process.env.UPI_ID||''};}

function cloudUpload(file, folder){
  return new Promise((resolve,reject)=>{
    const resourceType=file.mimetype==='application/pdf'?'raw':'image';
    const stream=cloudinary.uploader.upload_stream({folder,resource_type:resourceType,use_filename:true,unique_filename:true},(err,result)=>err?reject(err):resolve({name:file.originalname,url:result.secure_url,size:file.size,type:file.mimetype,publicId:result.public_id,resourceType}));
    stream.end(file.buffer);
  });
}
async function saveUploadedFiles(reqFiles){
  const docsIn=((reqFiles||{}).documents||[]), payIn=((reqFiles||{}).paymentProof||[])[0];
  if(useCloudinary){
    const docs=[];for(const f of docsIn)docs.push(await cloudUpload(f,'ms-manish-erp/documents'));
    const pay=payIn?await cloudUpload(payIn,'ms-manish-erp/payments'):null;
    return {docs,pay};
  }
  return {docs:docsIn.map(f=>({name:f.originalname,url:`/uploads/${f.filename}`,size:f.size,type:f.mimetype,localFile:f.filename})),pay:payIn?{name:payIn.originalname,url:`/uploads/${payIn.filename}`,size:payIn.size,type:payIn.mimetype,localFile:payIn.filename}:null};
}
async function removeStoredFile(f){try{if(f?.publicId&&useCloudinary)await cloudinary.uploader.destroy(f.publicId,{resource_type:f.resourceType||'image'});else if(f?.localFile)fs.unlinkSync(path.join(UPLOAD_DIR,f.localFile));else if(f?.url?.startsWith('/uploads/'))fs.unlinkSync(path.join(ROOT,f.url));}catch{}}

app.get('/api/health',(_,res)=>res.json({ok:true,storage:useCloudinary?'cloudinary':'local',database:useMongo?'mongodb':'local-json',time:new Date().toISOString()}));
app.get('/api/config',async(_,res)=>res.json(await config()));
app.get('/api/services',async(_,res)=>res.json(await getServices()));
app.post('/api/requests',fields,async(req,res,next)=>{try{const name=clean(req.body.name,100),mobile=clean(req.body.mobile,15),service=clean(req.body.service,120);if(!name||!/^\d{10}$/.test(mobile)||!service)return res.status(400).json({error:'Valid name, 10-digit mobile and service are required.'});const {docs,pay}=await saveUploadedFiles(req.files);const paid=money(req.body.paymentAmount),now=new Date().toISOString();const item={id:nextId(),name,mobile,service,email:clean(req.body.email,150),message:clean(req.body.message,1500),deliveryMode:clean(req.body.deliveryMode,30)||'WhatsApp',totalFee:0,paidAmount:paid,dueAmount:0,paymentAmount:paid,paymentStatus:pay?'Proof Submitted':(paid>0?'Pending Verification':'Not Submitted'),paymentProof:pay,files:docs,status:'Received',adminNote:'',createdAt:now,updatedAt:now,history:[{status:'Received',at:now}]};await saveRequest(item);res.status(201).json({success:true,id:item.id,status:item.status,createdAt:item.createdAt});}catch(e){next(e);}});
app.get('/api/status',async(req,res)=>{const id=clean(req.query.id,40).toUpperCase(),mobile=clean(req.query.mobile,15),item=(await getRequests()).find(x=>x.id===id&&x.mobile===mobile);if(!item)return res.status(404).json({error:'Work ID or mobile number did not match.'});const x=normalizeWork({...item});res.json({id:x.id,name:x.name,service:x.service,status:x.status,adminNote:x.adminNote,paymentStatus:x.paymentStatus,totalFee:x.totalFee,paidAmount:x.paidAmount,dueAmount:x.dueAmount,createdAt:x.createdAt,updatedAt:x.updatedAt,history:x.history||[]});});
app.get('/api/receipt/:id',async(req,res)=>{const mobile=clean(req.query.mobile,15),item=(await getRequests()).find(x=>x.id===req.params.id.toUpperCase()&&x.mobile===mobile);if(!item)return res.status(404).json({error:'Receipt not found'});const x=normalizeWork({...item});res.json({...x,files:(x.files||[]).map(f=>({name:f.name,size:f.size})),paymentProof:x.paymentProof?{name:x.paymentProof.name,size:x.paymentProof.size}:null,shop:await config()});});

app.get('/api/admin/requests',auth,async(req,res)=>{let data=(await getRequests()).map(x=>normalizeWork({...x}));const q=clean(req.query.q,100).toLowerCase(),status=clean(req.query.status,40);if(q)data=data.filter(x=>[x.id,x.name,x.mobile,x.service].some(v=>String(v).toLowerCase().includes(q)));if(status&&status!=='All')data=data.filter(x=>x.status===status);res.json(data);});
app.post('/api/admin/requests',auth,async(req,res)=>{const name=clean(req.body.name,100),mobile=clean(req.body.mobile,15),service=clean(req.body.service,120);if(!name||!/^\d{10}$/.test(mobile)||!service)return res.status(400).json({error:'Name, 10-digit mobile and service are required.'});const now=new Date().toISOString(),fee=money(req.body.totalFee),paid=money(req.body.paidAmount),status=clean(req.body.status,40)||'Received';const item={id:nextId(),name,mobile,email:clean(req.body.email,150),service,message:clean(req.body.message,1500),deliveryMode:clean(req.body.deliveryMode,30)||'Counter',totalFee:fee,paidAmount:paid,paymentAmount:paid,dueAmount:Math.max(0,fee-paid),paymentStatus:paid>=fee&&fee>0?'Paid':paid>0?'Partially Paid':'Pending',paymentProof:null,files:[],status,adminNote:clean(req.body.adminNote,1000),createdAt:now,updatedAt:now,history:[{status,at:now}]};await saveRequest(item);res.status(201).json(item);});
app.get('/api/admin/stats',auth,async(_,res)=>{const d=(await getRequests()).map(x=>normalizeWork({...x})),expenses=await getExpenses();const totalFee=d.reduce((a,x)=>a+x.totalFee,0),paid=d.reduce((a,x)=>a+x.paidAmount,0),due=d.reduce((a,x)=>a+x.dueAmount,0),expenseTotal=expenses.reduce((a,x)=>a+money(x.amount),0),today=new Date().toISOString().slice(0,10),todayPaid=d.filter(x=>String(x.updatedAt||x.createdAt).slice(0,10)===today).reduce((a,x)=>a+x.paidAmount,0);res.json({total:d.length,customers:customersFromRequests(d).length,received:d.filter(x=>x.status==='Received').length,processing:d.filter(x=>x.status==='Processing').length,completed:d.filter(x=>x.status==='Completed').length,totalFee,paid,due,expenses:expenseTotal,profit:paid-expenseTotal,todayPaid});});
app.patch('/api/admin/requests/:id',auth,async(req,res)=>{const item=await updateRequest(req.params.id.toUpperCase(),item=>{const statuses=['Received','Processing','Waiting for Customer','Completed','Cancelled'];if(req.body.status&&statuses.includes(req.body.status)&&req.body.status!==item.status){item.status=req.body.status;item.history=(item.history||[]).concat({status:item.status,at:new Date().toISOString()});}if(typeof req.body.adminNote==='string')item.adminNote=clean(req.body.adminNote,1000);if(typeof req.body.paymentStatus==='string')item.paymentStatus=clean(req.body.paymentStatus,40);if(req.body.totalFee!==undefined)item.totalFee=money(req.body.totalFee);if(req.body.paidAmount!==undefined||req.body.paymentAmount!==undefined){item.paidAmount=money(req.body.paidAmount??req.body.paymentAmount);item.paymentAmount=item.paidAmount;}normalizeWork(item);if(!req.body.paymentStatus&&item.totalFee>0)item.paymentStatus=item.paidAmount>=item.totalFee?'Paid':item.paidAmount>0?'Partially Paid':'Pending';item.updatedAt=new Date().toISOString();});if(!item)return res.status(404).json({error:'Request not found'});res.json(item);});
app.delete('/api/admin/requests/:id',auth,async(req,res)=>{const item=await deleteRequest(req.params.id.toUpperCase());if(!item)return res.status(404).json({error:'Request not found'});for(const f of [...(item.files||[]),...(item.paymentProof?[item.paymentProof]:[])])await removeStoredFile(f);res.json({success:true});});
app.get('/api/admin/customers',auth,async(_,res)=>res.json(customersFromRequests((await getRequests()).map(x=>normalizeWork({...x})))));
app.get('/api/admin/expenses',auth,async(_,res)=>res.json(await getExpenses()));
app.post('/api/admin/expenses',auth,async(req,res)=>{const title=clean(req.body.title,120),amount=money(req.body.amount);if(!title||!amount)return res.status(400).json({error:'Expense title and amount are required.'});const item={id:crypto.randomUUID(),title,amount,date:clean(req.body.date,10)||new Date().toISOString().slice(0,10),note:clean(req.body.note,500),createdAt:new Date().toISOString()};await addExpense(item);res.status(201).json(item);});
app.delete('/api/admin/expenses/:id',auth,async(req,res)=>{if(!await removeExpense(req.params.id))return res.status(404).json({error:'Expense not found'});res.json({success:true});});
app.get('/api/admin/services',auth,async(_,res)=>res.json(await getServices()));
app.put('/api/admin/services',auth,async(req,res)=>{const rows=Array.isArray(req.body.services)?req.body.services.map(x=>clean(x,120)).filter(Boolean):[];if(!rows.length)return res.status(400).json({error:'At least one service is required.'});const unique=[...new Set(rows)];await setServices(unique);res.json({success:true,services:unique});});
app.get('/api/admin/settings',auth,async(_,res)=>res.json(await config()));
app.put('/api/admin/settings',auth,async(req,res)=>{const cur=await getSettings();['shopName','tagline','phone','email','address','upiId'].forEach(k=>{if(req.body[k]!==undefined)cur[k]=clean(req.body[k],300)});await setSettings(cur);res.json(await config());});
app.get('/api/admin/export',auth,async(_,res)=>{const rows=(await getRequests()).map(x=>normalizeWork({...x})),esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"',head=['Work ID','Date','Name','Mobile','Service','Status','Total Fee','Paid','Due','Payment Status','Admin Note'],csv=[head,...rows.map(x=>[x.id,x.createdAt,x.name,x.mobile,x.service,x.status,x.totalFee,x.paidAmount,x.dueAmount,x.paymentStatus,x.adminNote])].map(r=>r.map(esc).join(',')).join('\n');res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="ms-manish-erp-report.csv"');res.send('\uFEFF'+csv);});
app.get('/api/admin/backup',auth,async(_,res)=>{const pack={version:4,createdAt:new Date().toISOString(),requests:await getRequests(),expenses:await getExpenses(),services:await getServices(),settings:await getSettings()};res.setHeader('Content-Type','application/json');res.setHeader('Content-Disposition','attachment; filename="ms-manish-erp-online-backup.json"');res.send(JSON.stringify(pack,null,2));});
app.post('/api/admin/restore',auth,backupUpload.single('backup'),async(req,res)=>{try{const data=JSON.parse(req.file.buffer.toString('utf8'));const requests=Array.isArray(data)?data:(Array.isArray(data.requests)?data.requests:null);if(!requests)throw Error();if(db){await db.collection('requests').deleteMany({});if(requests.length)await db.collection('requests').insertMany(requests.map(x=>({...x})));if(Array.isArray(data.expenses)){await db.collection('expenses').deleteMany({});if(data.expenses.length)await db.collection('expenses').insertMany(data.expenses.map(x=>({...x})));}if(Array.isArray(data.services))await setServices(data.services);if(data.settings&&typeof data.settings==='object')await setSettings(data.settings);}else{writeJson(REQUESTS_FILE,requests);if(Array.isArray(data.expenses))writeJson(EXPENSES_FILE,data.expenses);if(Array.isArray(data.services))writeJson(SERVICES_FILE,data.services);if(data.settings&&typeof data.settings==='object')writeJson(SETTINGS_FILE,data.settings);}res.json({success:true,count:requests.length});}catch{res.status(400).json({error:'Invalid backup file'});}});

app.get('/admin',(_,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('/receipt',(_,res)=>res.sendFile(path.join(ROOT,'public','receipt.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(400).json({error:err.message||'Request failed'});});

async function start(){
  try{await connectDb();}
  catch(e){console.error('MongoDB connection failed:',e.message);process.exit(1);}
  app.listen(PORT,'0.0.0.0',()=>{
    console.log(`MS MANISH DIGITAL ERP ONLINE: http://localhost:${PORT}`);
    console.log(`Database: ${useMongo?'MongoDB':'Local JSON'} | Uploads: ${useCloudinary?'Cloudinary':'Local disk'}`);
  });
}
start();
process.on('SIGTERM',async()=>{try{await mongoClient?.close();}finally{process.exit(0);}});
