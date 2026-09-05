require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const resolveFromRoot = (p, fallback) => path.resolve(ROOT, process.env[p] || fallback);
const DATA_DIR = resolveFromRoot('DATA_DIR', './data');
const UPLOAD_DIR = resolveFromRoot('UPLOAD_DIR', './uploads');
const BACKUP_DIR = resolveFromRoot('BACKUP_DIR', './backups');
for (const d of [DATA_DIR, UPLOAD_DIR, BACKUP_DIR]) fs.mkdirSync(d, { recursive: true });

const FILES = {
  requests: path.join(DATA_DIR, 'requests.json'),
  partners: path.join(DATA_DIR, 'partners.json'),
  staff: path.join(DATA_DIR, 'staff.json'),
  payments: path.join(DATA_DIR, 'payments.json'),
  expenses: path.join(DATA_DIR, 'expenses.json'),
  services: path.join(DATA_DIR, 'services.json'),
  settings: path.join(DATA_DIR, 'settings.json'),
  tickets: path.join(DATA_DIR, 'tickets.json'),
  wallet: path.join(DATA_DIR, 'partner-wallet.json'),
  notifications: path.join(DATA_DIR, 'notifications.json'),
  otp: path.join(DATA_DIR, 'otp.json')
};

const defaultServices = [
  ['Online Form', 100, 15, ['Aadhaar/ID proof', 'Mobile number', 'Required certificates']],
  ['Admit Card', 20, 5, ['Registration/Application details']],
  ['Result', 20, 5, ['Roll number / Registration number']],
  ['Scholarship / DBT Check', 100, 20, ['Aadhaar', 'Bank passbook', 'Latest marksheet', 'Income/Caste/Residence certificate if applicable']],
  ['LNMU Admission', 150, 25, ['Photo', 'Signature', '10th/12th marksheet', 'Aadhaar', 'Caste certificate if applicable']],
  ['LNMU Registration', 100, 20, ['Admission receipt', 'Aadhaar', 'Photo', 'Previous academic details']],
  ['LNMU Exam Form', 100, 20, ['Registration number', 'Previous admit card/marksheet', 'Photo']],
  ['LNMU Internship Work', 200, 30, ['Student details', 'College details', 'Topic/instructions']],
  ['Student Credit Card', 200, 30, ['Aadhaar', 'PAN', 'Admission proof', 'Fee structure', 'Bank details']],
  ['PAN Card', 150, 25, ['Aadhaar', 'Photo', 'Signature', 'Mobile number']],
  ['Passport - New / Renewal', 300, 40, ['Aadhaar', 'DOB proof', 'Address proof', 'Photo']],
  ['Voter Card', 100, 20, ['Aadhaar', 'Photo', 'Address proof', 'Age proof']],
  ['APAAR / ABC ID', 50, 10, ['Aadhaar', 'Student/College details']],
  ['Income Certificate', 80, 15, ['Aadhaar', 'Photo', 'Self declaration / income details']],
  ['Caste Certificate', 80, 15, ['Aadhaar', 'Photo', 'Family/caste supporting document']],
  ['Residence Certificate', 80, 15, ['Aadhaar', 'Photo', 'Address proof', 'Self declaration']],
  ['EWS Certificate', 120, 20, ['Aadhaar', 'Income certificate', 'Residence proof', 'Land/property details']],
  ['NCL / OBC Certificate', 120, 20, ['Aadhaar', 'Caste certificate', 'Income certificate', 'Residence proof']],
  ['Udyam Registration', 150, 25, ['Aadhaar', 'PAN', 'Business details', 'Bank details']],
  ['Ayushman Card', 80, 15, ['Aadhaar', 'Family ID/Ration card if applicable', 'Mobile number']],
  ['EPFO / UAN', 100, 20, ['Aadhaar', 'PAN', 'Bank details', 'Employment details']],
  ['e-Shram Card', 80, 15, ['Aadhaar', 'Bank details', 'Mobile number']],
  ['Ration Card', 150, 25, ['Aadhaar of family members', 'Photo', 'Residence proof']],
  ['Bike Insurance', 200, 30, ['RC', 'Previous policy if any', 'Aadhaar/PAN']],
  ['Resume / Biodata', 100, 20, ['Personal details', 'Education', 'Experience/skills', 'Photo optional']],
  ['Printout - B/W / Color', 5, 1, ['Printable document/file']],
  ['Xerox', 2, 0, ['Original document']],
  ['Lamination', 30, 5, ['Document/card to laminate']],
  ['Spiral Binding', 50, 10, ['Documents/pages to bind']],
  ['Other Online Work', 0, 0, ['Required documents as advised']]
].map((x, i) => ({ id:`SVC-${String(i+1).padStart(3,'0')}`, name:x[0], fee:x[1], partnerCommission:x[2], documents:x[3], active:true }));

function ensureJson(file, value = []) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
for (const [key, file] of Object.entries(FILES)) ensureJson(file, key === 'settings' ? {} : key === 'services' ? defaultServices : []);

function readJson(file, fallback = []) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}
const db = {
  requests: () => readJson(FILES.requests, []),
  partners: () => readJson(FILES.partners, []),
  staff: () => readJson(FILES.staff, []),
  payments: () => readJson(FILES.payments, []),
  expenses: () => readJson(FILES.expenses, []),
  services: () => readJson(FILES.services, defaultServices),
  settings: () => readJson(FILES.settings, {}),
  tickets: () => readJson(FILES.tickets, []),
  wallet: () => readJson(FILES.wallet, []),
  notifications: () => readJson(FILES.notifications, []),
  otp: () => readJson(FILES.otp, [])
};

const clean = (v, max=1000) => String(v ?? '').trim().slice(0, max);
const num = v => Math.max(0, Number(v || 0) || 0);
const nowIso = () => new Date().toISOString();
const uid = (prefix, bytes=4) => `${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(bytes).toString('hex').toUpperCase()}`;
const dayKey = d => new Date(d).toISOString().slice(0,10);
const moneyRound = n => Math.round((Number(n)||0) * 100) / 100;
function nextSequence(prefix, items, field='id') {
  let max = 0;
  for (const x of items) {
    const m = String(x[field]||'').match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max+1).padStart(4,'0')}`;
}
function nextWorkId(){ const d=new Date(); const day=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; return `MSD-${day}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function nextDocNo(kind, items){ const d=new Date(); const day=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`; const count=items.filter(x=>String(x[kind]||'').startsWith(`${kind==='invoiceNo'?'INV':'RCP'}-${day}`)).length+1; return `${kind==='invoiceNo'?'INV':'RCP'}-${day}-${String(count).padStart(4,'0')}`; }

function shopConfig() {
  const s = db.settings();
  return {
    shopName: s.shopName || process.env.SHOP_NAME || 'MS MANISH DIGITAL CYBER EXPERT',
    tagline: s.tagline || process.env.SHOP_TAGLINE || 'Your Trusted Digital Service Partner',
    phone: s.phone || process.env.SHOP_PHONE || '9229288090',
    email: s.email || process.env.SHOP_EMAIL || 'msmanishdcexpert@gmail.com',
    address: s.address || process.env.SHOP_ADDRESS || 'Panchavati Chowk, Hospital Road, Rajnagar, Madhubani, Bihar - 847235',
    upiId: s.upiId || process.env.UPI_ID || '',
    baseUrl: clean(process.env.PUBLIC_BASE_URL || s.baseUrl || `http://localhost:${PORT}`, 300).replace(/\/$/, '')
  };
}

function serviceRows() {
  const raw=db.services();
  if(Array.isArray(raw)&&raw.length&&typeof raw[0]==='string'){
    const mapped=raw.map((name,i)=>{const d=defaultServices.find(x=>x.name===name);return d?{...d,id:`SVC-${String(i+1).padStart(3,'0')}`}:{id:`SVC-${String(i+1).padStart(3,'0')}`,name,fee:0,partnerCommission:0,documents:['Required documents as advised'],active:true};});
    writeJson(FILES.services,mapped); return mapped;
  }
  return Array.isArray(raw)?raw:defaultServices;
}
function serviceByName(name) { return serviceRows().find(s => s.active !== false && s.name === name) || null; }
function paymentState(total, paid) {
  total=num(total); paid=num(paid);
  const due=Math.max(0, moneyRound(total-paid));
  return { totalFee:total, paidAmount:paid, dueAmount:due, paymentStatus: paid<=0?'Due': due<=0?'Paid':'Partial' };
}
function normalizeWork(w) {
  const paid = w.paidAmount !== undefined ? num(w.paidAmount) : num(w.paymentAmount);
  const total = w.totalFee !== undefined ? num(w.totalFee) : Math.max(paid, num(w.paymentAmount));
  const p = paymentState(total, paid);
  return {
    priority:'Normal', dueDate:'', deadline:'', expiryDate:'', documentChecklist:[], commissionAmount:0, commissionStatus:'Pending', legacyPaidAmount:0,
    assignedStaffId:'', assignedStaffName:'', receiptNo:'', invoiceNo:'', paymentHistoryIds:[], source:'Customer', partnerId:'', partnerName:'',
    ...w, legacyPaidAmount:w.legacyPaidAmount!==undefined?num(w.legacyPaidAmount):((!Array.isArray(w.paymentHistoryIds)||w.paymentHistoryIds.length===0)?paid:0), ...p,
    files:Array.isArray(w.files)?w.files:[], history:Array.isArray(w.history)?w.history:[], notificationHistory:Array.isArray(w.notificationHistory)?w.notificationHistory:[]
  };
}
function getWorks() { return db.requests().map(normalizeWork); }
function saveWorks(works) { writeJson(FILES.requests, works.map(normalizeWork)); }

function hashSecret(value, salt=crypto.randomBytes(16).toString('hex')) {
  const hash=crypto.scryptSync(String(value), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifySecret(value, stored) {
  if (!stored) return false;
  if (!String(stored).includes(':')) return crypto.createHash('sha256').update(String(value)).digest('hex') === stored;
  const [salt, expected]=String(stored).split(':');
  const actual=crypto.scryptSync(String(value), salt, 32).toString('hex');
  return expected.length===actual.length && crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual));
}
function tokenSecret(){ return process.env.TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'CHANGE_ME_NOW'; }
function signToken(payload, hours=12) {
  const bodyObj={...payload,exp:Date.now()+hours*3600*1000};
  const body=Buffer.from(JSON.stringify(bodyObj)).toString('base64url');
  const sig=crypto.createHmac('sha256',tokenSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  try {
    const [body,sig]=String(token||'').split('.'); if(!body||!sig)return null;
    const expected=crypto.createHmac('sha256',tokenSecret()).update(body).digest('base64url');
    if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const obj=JSON.parse(Buffer.from(body,'base64url').toString()); if(Date.now()>Number(obj.exp))return null; return obj;
  } catch { return null; }
}
function bearer(req){ return (req.headers.authorization||'').replace(/^Bearer\s+/i,''); }
function legacyAdmin(req) {
  const given=req.headers.authorization||'';
  const expected='Basic '+Buffer.from(`${process.env.ADMIN_USER||'admin'}:${process.env.ADMIN_PASSWORD||'ChangeMe123'}`).toString('base64');
  try { const a=Buffer.from(given), b=Buffer.from(expected); return a.length===b.length && crypto.timingSafeEqual(a,b); } catch { return false; }
}
function staffAuth(roles=['admin','operator']) {
  return (req,res,next)=>{
    if (legacyAdmin(req)) { req.actor={type:'staff',id:'ENV-ADMIN',name:'Admin',role:'admin'}; return next(); }
    const t=verifyToken(bearer(req));
    if(!t||t.type!=='staff'||!roles.includes(t.role))return res.status(401).json({error:'Staff login required'});
    const st=db.staff().find(x=>x.id===t.id&&x.active!==false);
    if(!st && t.id!=='ENV-ADMIN')return res.status(401).json({error:'Staff account disabled'});
    req.actor={type:'staff',id:t.id,name:t.name||st?.name||'Staff',role:t.role}; next();
  };
}
function partnerAuth(req,res,next) {
  const t=verifyToken(bearer(req)); if(!t||t.type!=='partner')return res.status(401).json({error:'Partner login required'});
  const p=db.partners().find(x=>x.id===t.id&&x.active!==false); if(!p)return res.status(401).json({error:'Partner account disabled'});
  req.partner=p; next();
}
function customerAuth(req,res,next) {
  const t=verifyToken(bearer(req)); if(!t||t.type!=='customer'||!/^[0-9]{10}$/.test(t.mobile||''))return res.status(401).json({error:'Customer login required'});
  req.customer={mobile:t.mobile}; next();
}

const allowedMime = new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const storage=multer.diskStorage({ destination:(_,__,cb)=>cb(null,UPLOAD_DIR), filename:(_,file,cb)=>{ const safe=file.originalname.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120); cb(null,`${Date.now()}-${crypto.randomBytes(5).toString('hex')}-${safe}`); }});
const upload=multer({storage,limits:{fileSize:10*1024*1024,files:12},fileFilter:(_,file,cb)=>cb(allowedMime.has(file.mimetype)?null:new Error('Only JPG, PNG, WEBP and PDF files are allowed.'),allowedMime.has(file.mimetype))});
const workFields=upload.fields([{name:'documents',maxCount:10},{name:'paymentProof',maxCount:1}]);
function uploaded(req){
  const docs=((req.files||{}).documents||[]).map(f=>({name:f.originalname,url:`/uploads/${f.filename}`,localFile:f.filename,size:f.size,type:f.mimetype,driveFileId:''}));
  const p=((req.files||{}).paymentProof||[])[0];
  const pay=p?{name:p.originalname,url:`/uploads/${p.filename}`,localFile:p.filename,size:p.size,type:p.mimetype,driveFileId:''}:null;
  return {docs,pay};
}

app.disable('x-powered-by');
app.use(express.json({limit:'2mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(ROOT,'public')));
app.use('/uploads',express.static(UPLOAD_DIR,{fallthrough:false}));

function logNotification(entry){ const rows=db.notifications(); rows.unshift({id:uid('NTF'),at:nowIso(),...entry}); writeJson(FILES.notifications,rows.slice(0,5000)); }
async function sendWhatsApp(mobile, message) {
  if(String(process.env.WHATSAPP_ENABLED).toLowerCase()!=='true')return {ok:false,reason:'disabled'};
  const phoneId=clean(process.env.WHATSAPP_PHONE_NUMBER_ID,100), token=clean(process.env.WHATSAPP_ACCESS_TOKEN,1000), version=clean(process.env.WHATSAPP_API_VERSION||'v23.0',20);
  if(!phoneId||!token)return {ok:false,reason:'missing_credentials'};
  try {
    const r=await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:`91${mobile}`,type:'text',text:{body:message}})});
    const data=await r.json().catch(()=>({})); return {ok:r.ok,data};
  } catch(e){return {ok:false,reason:e.message};}
}
async function sendSMS(mobile, message) {
  if(String(process.env.SMS_ENABLED).toLowerCase()!=='true')return {ok:false,reason:'disabled'};
  const sid=clean(process.env.TWILIO_ACCOUNT_SID,200), token=clean(process.env.TWILIO_AUTH_TOKEN,500), from=clean(process.env.TWILIO_FROM_NUMBER,50);
  if(!sid||!token||!from)return {ok:false,reason:'missing_credentials'};
  try {
    const body=new URLSearchParams({To:`+91${mobile}`,From:from,Body:message});
    const r=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(`${sid}:${token}`).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body});
    const data=await r.json().catch(()=>({})); return {ok:r.ok,data};
  } catch(e){return {ok:false,reason:e.message};}
}
async function notifyMobile(mobile, message, context={}) {
  const wa=await sendWhatsApp(mobile,message);
  let sms={ok:false,reason:'not_needed'};
  if(!wa.ok) sms=await sendSMS(mobile,message);
  logNotification({mobile,message,whatsapp:wa.ok?'sent':wa.reason||'failed',sms:sms.ok?'sent':sms.reason||'failed',context});
  return {whatsapp:wa,sms};
}
function workMessage(work,event) {
  const shop=shopConfig();
  if(event==='created')return `Namaste ${work.name}, aapka work ${work.id} receive ho gaya hai. Service: ${work.service}. Status: ${work.status}. Track: ${shop.baseUrl}/?track=${encodeURIComponent(work.id)} - ${shop.shopName}`;
  if(event==='completed')return `Namaste ${work.name}, aapka work ${work.id} COMPLETED ho gaya hai. Due: ₹${work.dueAmount}. Receipt: ${shop.baseUrl}/receipt?id=${encodeURIComponent(work.id)}&mobile=${work.mobile} - ${shop.shopName}`;
  return `Namaste ${work.name}, work ${work.id} ka status ab ${work.status} hai. Due: ₹${work.dueAmount}. Track: ${shop.baseUrl}/?track=${encodeURIComponent(work.id)} - ${shop.shopName}`;
}

let googleTokenCache={token:'',expiresAt:0};
function b64urlJson(obj){return Buffer.from(JSON.stringify(obj)).toString('base64url');}
async function googleAccessToken(){
  if(String(process.env.GOOGLE_DRIVE_ENABLED).toLowerCase()!=='true')return null;
  if(googleTokenCache.token && Date.now()<googleTokenCache.expiresAt-60000)return googleTokenCache.token;
  try{
    const creds=JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'{}');
    if(!creds.client_email||!creds.private_key)throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
    const tokenUri=creds.token_uri||'https://oauth2.googleapis.com/token',iat=Math.floor(Date.now()/1000),header=b64urlJson({alg:'RS256',typ:'JWT'}),payload=b64urlJson({iss:creds.client_email,scope:'https://www.googleapis.com/auth/drive.file',aud:tokenUri,iat,exp:iat+3600});
    const signer=crypto.createSign('RSA-SHA256');signer.update(`${header}.${payload}`);signer.end();const sig=signer.sign(creds.private_key).toString('base64url'),assertion=`${header}.${payload}.${sig}`;
    const r=await fetch(tokenUri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
    const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||'Google token failed');
    googleTokenCache={token:d.access_token,expiresAt:Date.now()+Number(d.expires_in||3600)*1000};return d.access_token;
  }catch(e){logNotification({mobile:'',message:`Google Drive auth failed: ${e.message}`,context:{type:'drive'}});return null;}
}
async function uploadToDrive(localPath,name,mime='application/octet-stream'){
  const token=await googleAccessToken();if(!token)return {ok:false,reason:'disabled_or_auth_failed'};
  try{
    const boundary='msmanish'+crypto.randomBytes(8).toString('hex'),meta={name};if(process.env.GOOGLE_DRIVE_FOLDER_ID)meta.parents=[process.env.GOOGLE_DRIVE_FOLDER_ID];
    const head=Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),file=fs.readFileSync(localPath),tail=Buffer.from(`\r\n--${boundary}--`),body=Buffer.concat([head,file,tail]);
    const r=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':`multipart/related; boundary=${boundary}`},body});
    const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error?.message||'Drive upload failed');return {ok:true,id:d.id,name:d.name};
  }catch(e){logNotification({mobile:'',message:`Drive upload failed: ${e.message}`,context:{type:'drive',name}});return {ok:false,reason:e.message};}
}
async function cloudBackupWorkFiles(work){
  if(String(process.env.GOOGLE_DRIVE_ENABLED).toLowerCase()!=='true')return;
  const works=getWorks(), live=works.find(x=>x.id===work.id); if(!live)return;
  let changed=false;
  for(const f of [...(live.files||[]),...(live.paymentProof?[live.paymentProof]:[])]){
    if(f.driveFileId||!f.localFile)continue; const p=path.join(UPLOAD_DIR,path.basename(f.localFile)); if(!fs.existsSync(p))continue;
    const r=await uploadToDrive(p,`${live.id}-${f.name}`,f.type); if(r.ok){f.driveFileId=r.id;changed=true;}
  }
  if(changed)saveWorks(works);
}

function createWork(body, req, source='Customer', partner=null, actor=null) {
  const name=clean(body.name,100), mobile=clean(body.mobile,15), serviceName=clean(body.service,120);
  if(!name||!/^\d{10}$/.test(mobile)||!serviceName)throw new Error('Valid name, 10-digit mobile and service are required.');
  const service=serviceByName(serviceName), files=uploaded(req), works=getWorks(), now=nowIso();
  const defaultFee=service?num(service.fee):0, total=body.totalFee!==undefined?num(body.totalFee):defaultFee;
  const initialPaid=num(body.paidAmount!==undefined?body.paidAmount:body.paymentAmount), payState=paymentState(total,initialPaid);
  const priority=['Normal','Urgent','Very Urgent'].includes(body.priority)?body.priority:'Normal';
  const status=source==='Partner'?'New':source==='Staff'?'Received':'Received';
  const item={
    id:nextWorkId(), receiptNo:nextDocNo('receiptNo',works), invoiceNo:nextDocNo('invoiceNo',works), name,mobile,service:serviceName,
    email:clean(body.email,150),message:clean(body.message,1500),deliveryMode:clean(body.deliveryMode,30)||'WhatsApp',...payState,
    paymentProof:files.pay, files:files.docs, status,adminNote:'',source,partnerId:partner?.id||'',partnerName:partner?.name||'',
    assignedStaffId:actor?.id||'',assignedStaffName:actor?.name||'',priority,dueDate:clean(body.dueDate,20),deadline:clean(body.deadline,30),expiryDate:clean(body.expiryDate,20),
    documentChecklist:service?.documents||[],commissionAmount:partner?num(body.commissionAmount!==undefined?body.commissionAmount:service?.partnerCommission):0,commissionStatus:'Pending',
    createdAt:now,updatedAt:now,history:[{status,at:now,by:source}],notificationHistory:[],paymentHistoryIds:[]
  };
  works.unshift(item); saveWorks(works);
  if(initialPaid>0){const payments=db.payments();const p={id:uid('PAY'),workId:item.id,mobile,amount:initialPaid,mode:clean(body.paymentMode,40)||'Online/Proof',reference:clean(body.paymentReference,120),note:'Initial payment',createdAt:now,by:source};payments.unshift(p);writeJson(FILES.payments,payments);item.paymentHistoryIds.push(p.id);saveWorks(works);}
  setImmediate(()=>{notifyMobile(item.mobile,workMessage(item,'created'),{type:'work_created',workId:item.id}).catch(()=>{});cloudBackupWorkFiles(item).catch(()=>{});});
  return item;
}

function updateWorkFinancials(work){ const payments=db.payments().filter(p=>p.workId===work.id && p.type!=='refund'); const paid=num(work.legacyPaidAmount)+payments.reduce((a,p)=>a+num(p.amount),0); Object.assign(work,paymentState(work.totalFee,paid)); return work; }
function commissionLedger(partnerId){
  const works=getWorks().filter(w=>w.partnerId===partnerId);
  const earned=works.filter(w=>['Completed','Delivered'].includes(w.status)).reduce((a,w)=>a+num(w.commissionAmount),0);
  const wallet=db.wallet().filter(x=>x.partnerId===partnerId);
  const commissionPaid=wallet.filter(x=>x.type==='commission_settlement').reduce((a,x)=>a+num(x.amount),0);
  const advanceCredits=wallet.filter(x=>x.type==='advance_credit').reduce((a,x)=>a+num(x.amount),0);
  const advanceDebits=wallet.filter(x=>x.type==='advance_debit').reduce((a,x)=>a+num(x.amount),0);
  return {earned,commissionPaid,commissionPending:Math.max(0,earned-commissionPaid),advanceBalance:moneyRound(advanceCredits-advanceDebits),transactions:wallet};
}

app.get('/api/health',(_,res)=>res.json({ok:true,version:'4.0.0',time:nowIso()}));
app.get('/api/config',(_,res)=>res.json({...shopConfig(),whatsappConfigured:String(process.env.WHATSAPP_ENABLED).toLowerCase()==='true',smsConfigured:String(process.env.SMS_ENABLED).toLowerCase()==='true',driveConfigured:String(process.env.GOOGLE_DRIVE_ENABLED).toLowerCase()==='true'}));
app.get('/api/services',(_,res)=>res.json(serviceRows().filter(x=>x.active!==false)));
app.get('/api/qr',async(req,res)=>{try{const text=clean(req.query.text,1000);if(!text)return res.status(400).send('Missing text');const svg=await QRCode.toString(text,{type:'svg',margin:1,width:220});res.type('image/svg+xml').send(svg);}catch(e){res.status(400).send('QR failed');}});

app.post('/api/requests',workFields,(req,res)=>{try{const item=createWork(req.body,req,'Customer');res.status(201).json({success:true,id:item.id,status:item.status,receiptNo:item.receiptNo,invoiceNo:item.invoiceNo,totalFee:item.totalFee,paidAmount:item.paidAmount,dueAmount:item.dueAmount,createdAt:item.createdAt});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/status',(req,res)=>{const id=clean(req.query.id,50).toUpperCase(),mobile=clean(req.query.mobile,15);const item=getWorks().find(x=>x.id===id&&x.mobile===mobile);if(!item)return res.status(404).json({error:'Work ID or mobile number did not match.'});res.json(publicWork(item));});
function publicWork(item){return {id:item.id,receiptNo:item.receiptNo,invoiceNo:item.invoiceNo,name:item.name,service:item.service,status:item.status,priority:item.priority,dueDate:item.dueDate,deadline:item.deadline,expiryDate:item.expiryDate,adminNote:item.adminNote,totalFee:item.totalFee,paidAmount:item.paidAmount,dueAmount:item.dueAmount,paymentStatus:item.paymentStatus,documentChecklist:item.documentChecklist,createdAt:item.createdAt,updatedAt:item.updatedAt,history:item.history||[]};}
app.get('/api/receipt/:id',(req,res)=>{const mobile=clean(req.query.mobile,15),item=getWorks().find(x=>x.id===req.params.id.toUpperCase()&&x.mobile===mobile);if(!item)return res.status(404).json({error:'Receipt not found'});const payments=db.payments().filter(p=>p.workId===item.id);res.json({...publicWork(item),mobile:item.mobile,email:item.email,partnerId:item.partnerId,partnerName:item.partnerName,payments,shop:shopConfig()});});

// Customer OTP login + customer portal
app.post('/api/customer/request-otp',async(req,res)=>{
  const mobile=clean(req.body.mobile,15);if(!/^\d{10}$/.test(mobile))return res.status(400).json({error:'Enter valid 10-digit mobile number'});
  const otp=String(crypto.randomInt(100000,999999)), ttl=Number(process.env.OTP_TTL_MINUTES||5), rows=db.otp().filter(x=>x.mobile!==mobile&&new Date(x.expiresAt)>new Date());
  rows.push({mobile,hash:hashSecret(otp),expiresAt:new Date(Date.now()+ttl*60000).toISOString(),attempts:0,createdAt:nowIso()});writeJson(FILES.otp,rows);
  const result=await notifyMobile(mobile,`MS MANISH ERP login OTP: ${otp}. Valid for ${ttl} minutes. Do not share this OTP.`,{type:'customer_otp'});
  const response={success:true,message:'OTP sent/queued to your registered mobile.'};
  if(String(process.env.OTP_DEV_MODE).toLowerCase()==='true')response.devOtp=otp;
  if(!result.whatsapp.ok&&!result.sms.ok&&String(process.env.OTP_DEV_MODE).toLowerCase()!=='true')response.warning='WhatsApp/SMS provider is not configured. Admin must configure notification credentials.';
  res.json(response);
});
app.post('/api/customer/verify-otp',(req,res)=>{
  const mobile=clean(req.body.mobile,15),otp=clean(req.body.otp,10),rows=db.otp(),idx=rows.findIndex(x=>x.mobile===mobile);
  if(idx<0)return res.status(400).json({error:'Request OTP first'});const r=rows[idx];if(new Date(r.expiresAt)<new Date()){rows.splice(idx,1);writeJson(FILES.otp,rows);return res.status(400).json({error:'OTP expired'});}if(!verifySecret(otp,r.hash)){r.attempts=(r.attempts||0)+1;writeJson(FILES.otp,rows);return res.status(400).json({error:'Invalid OTP'});}rows.splice(idx,1);writeJson(FILES.otp,rows);res.json({success:true,token:signToken({type:'customer',mobile},24*7)});
});
app.get('/api/customer/me',customerAuth,(req,res)=>{const works=getWorks().filter(x=>x.mobile===req.customer.mobile);res.json({mobile:req.customer.mobile,name:works[0]?.name||'',email:works[0]?.email||'',works:works.length});});
app.get('/api/customer/works',customerAuth,(req,res)=>res.json(getWorks().filter(x=>x.mobile===req.customer.mobile).map(publicWork)));
app.get('/api/customer/payments',customerAuth,(req,res)=>{const ids=new Set(getWorks().filter(x=>x.mobile===req.customer.mobile).map(x=>x.id));res.json(db.payments().filter(p=>ids.has(p.workId)));});
app.get('/api/customer/tickets',customerAuth,(req,res)=>res.json(db.tickets().filter(t=>t.mobile===req.customer.mobile)));
app.post('/api/customer/tickets',customerAuth,(req,res)=>{const rows=db.tickets(),t={id:uid('TKT'),mobile:req.customer.mobile,subject:clean(req.body.subject,150),message:clean(req.body.message,2000),status:'Open',priority:['Normal','Urgent'].includes(req.body.priority)?req.body.priority:'Normal',reply:'',createdAt:nowIso(),updatedAt:nowIso()};if(!t.subject||!t.message)return res.status(400).json({error:'Subject and message required'});rows.unshift(t);writeJson(FILES.tickets,rows);res.status(201).json(t);});

// Staff login
app.post('/api/staff/login',(req,res)=>{
  const username=clean(req.body.username,80),password=clean(req.body.password,200);
  if(username===(process.env.ADMIN_USER||'admin')&&password===(process.env.ADMIN_PASSWORD||'ChangeMe123'))return res.json({success:true,token:signToken({type:'staff',id:'ENV-ADMIN',name:'Admin',role:'admin'}),staff:{id:'ENV-ADMIN',name:'Admin',role:'admin'}});
  const s=db.staff().find(x=>x.username===username&&x.active!==false&&verifySecret(password,x.passwordHash));if(!s)return res.status(401).json({error:'Invalid staff login'});res.json({success:true,token:signToken({type:'staff',id:s.id,name:s.name,role:s.role}),staff:{id:s.id,name:s.name,role:s.role}});
});

// Partner APIs
app.post('/api/partner/login',(req,res)=>{const id=clean(req.body.partnerId,30).toUpperCase(),pin=clean(req.body.pin,50),p=db.partners().find(x=>x.id===id&&x.active!==false&&(verifySecret(pin,x.pinHash)||verifySecret(pin,x.pinSecret)));if(!p)return res.status(401).json({error:'Invalid Partner ID or PIN'});res.json({success:true,token:signToken({type:'partner',id:p.id,name:p.name},24),partner:{id:p.id,name:p.name,mobile:p.mobile,area:p.area}});});
app.get('/api/partner/me',partnerAuth,(req,res)=>res.json({...safePartner(req.partner),wallet:commissionLedger(req.partner.id)}));
function safePartner(p){const {pinHash,pinSecret,...x}=p;return x;}
app.get('/api/partner/stats',partnerAuth,(req,res)=>{const w=getWorks().filter(x=>x.partnerId===req.partner.id),ledger=commissionLedger(req.partner.id);res.json({total:w.length,processing:w.filter(x=>['New','Received','Assigned','Processing','Checking','Waiting for Customer'].includes(x.status)).length,completed:w.filter(x=>['Completed','Delivered'].includes(x.status)).length,totalFee:w.reduce((a,x)=>a+x.totalFee,0),paid:w.reduce((a,x)=>a+x.paidAmount,0),due:w.reduce((a,x)=>a+x.dueAmount,0),...ledger});});
app.get('/api/partner/works',partnerAuth,(req,res)=>{let w=getWorks().filter(x=>x.partnerId===req.partner.id);const q=clean(req.query.q,100).toLowerCase(),status=clean(req.query.status,40);if(q)w=w.filter(x=>[x.id,x.name,x.mobile,x.service,x.status].some(v=>String(v||'').toLowerCase().includes(q)));if(status&&status!=='All')w=w.filter(x=>x.status===status);res.json(w);});
app.get('/api/partner/track',partnerAuth,(req,res)=>{const id=clean(req.query.id,50).toUpperCase(),w=getWorks().find(x=>x.id===id&&x.partnerId===req.partner.id);if(!w)return res.status(404).json({error:'Work not found'});res.json(w);});
app.post('/api/partner/works',partnerAuth,workFields,(req,res)=>{try{const item=createWork(req.body,req,'Partner',req.partner);res.status(201).json({success:true,id:item.id,status:item.status,totalFee:item.totalFee,commissionAmount:item.commissionAmount});}catch(e){res.status(400).json({error:e.message});}});
app.get('/api/partner/card',partnerAuth,async(req,res)=>{const p=safePartner(req.partner),shop=shopConfig(),qrText=`${shop.baseUrl}/partner`;const qr=await QRCode.toDataURL(qrText,{margin:1,width:180});res.json({partner:p,shop,qr});});

// Admin/staff work management
app.get('/api/admin/requests',staffAuth(),(req,res)=>{
  let w=getWorks(); const q=clean(req.query.q,150).toLowerCase();
  const filters=['status','paymentStatus','service','partnerId','priority'];
  if(q)w=w.filter(x=>[x.id,x.name,x.mobile,x.service,x.partnerName,x.partnerId,x.status,x.invoiceNo,x.receiptNo].some(v=>String(v||'').toLowerCase().includes(q)));
  for(const f of filters){const v=clean(req.query[f],120);if(v&&v!=='All')w=w.filter(x=>String(x[f]||'')===v);}
  const from=clean(req.query.from,20),to=clean(req.query.to,20);if(from)w=w.filter(x=>dayKey(x.createdAt)>=from);if(to)w=w.filter(x=>dayKey(x.createdAt)<=to);
  res.json(w);
});
app.post('/api/admin/requests',staffAuth(),upload.none(),(req,res)=>{try{req.files={};const item=createWork(req.body,req,'Staff',null,req.actor);res.status(201).json(item);}catch(e){res.status(400).json({error:e.message});}});
app.patch('/api/admin/requests/:id',staffAuth(),async(req,res)=>{
  const works=getWorks(),item=works.find(x=>x.id===req.params.id.toUpperCase());if(!item)return res.status(404).json({error:'Request not found'});
  const oldStatus=item.status, allowed=['Received','New','Assigned','Processing','Checking','Waiting for Customer','Completed','Delivered','Cancelled'];
  if(req.body.status&&allowed.includes(req.body.status)&&req.body.status!==item.status){item.status=req.body.status;item.history.push({status:item.status,at:nowIso(),by:req.actor.name});if(['Completed','Delivered'].includes(item.status)&&item.partnerId)item.commissionStatus='Earned';}
  for(const k of ['adminNote','dueDate','deadline','expiryDate'])if(req.body[k]!==undefined)item[k]=clean(req.body[k],k==='adminNote'?1000:50);
  if(['Normal','Urgent','Very Urgent'].includes(req.body.priority))item.priority=req.body.priority;
  if(req.body.totalFee!==undefined)item.totalFee=num(req.body.totalFee);
  if(req.body.assignedStaffId!==undefined){const s=db.staff().find(x=>x.id===req.body.assignedStaffId);item.assignedStaffId=s?.id||'';item.assignedStaffName=s?.name||'';}
  if(req.body.commissionAmount!==undefined&&item.partnerId)item.commissionAmount=num(req.body.commissionAmount);
  updateWorkFinancials(item);item.updatedAt=nowIso();saveWorks(works);
  if(item.status!==oldStatus)setImmediate(()=>notifyMobile(item.mobile,workMessage(item,['Completed','Delivered'].includes(item.status)?'completed':'status'),{type:'status_change',workId:item.id,status:item.status}).catch(()=>{}));
  res.json(item);
});
app.delete('/api/admin/requests/:id',staffAuth(['admin']),(req,res)=>{const works=getWorks(),idx=works.findIndex(x=>x.id===req.params.id.toUpperCase());if(idx<0)return res.status(404).json({error:'Request not found'});const [item]=works.splice(idx,1);for(const f of [...(item.files||[]),...(item.paymentProof?[item.paymentProof]:[])]){if(f.localFile)try{fs.unlinkSync(path.join(UPLOAD_DIR,path.basename(f.localFile)))}catch{}}saveWorks(works);const payments=db.payments().filter(p=>p.workId!==item.id);writeJson(FILES.payments,payments);res.json({success:true});});

// Payments
app.get('/api/admin/payments',staffAuth(),(req,res)=>{let p=db.payments();const workId=clean(req.query.workId,50);if(workId)p=p.filter(x=>x.workId===workId);res.json(p);});
app.post('/api/admin/payments',staffAuth(),(req,res)=>{const workId=clean(req.body.workId,50).toUpperCase(),amount=num(req.body.amount);if(!workId||amount<=0)return res.status(400).json({error:'Work ID and amount required'});const works=getWorks(),w=works.find(x=>x.id===workId);if(!w)return res.status(404).json({error:'Work not found'});const rows=db.payments(),p={id:uid('PAY'),workId:w.id,mobile:w.mobile,amount,mode:clean(req.body.mode,50)||'Cash',reference:clean(req.body.reference,120),note:clean(req.body.note,300),type:'payment',createdAt:nowIso(),by:req.actor.name};rows.unshift(p);writeJson(FILES.payments,rows);w.paymentHistoryIds=[...(w.paymentHistoryIds||[]),p.id];updateWorkFinancials(w);w.updatedAt=nowIso();saveWorks(works);setImmediate(()=>notifyMobile(w.mobile,`Payment received ₹${amount} for work ${w.id}. Paid: ₹${w.paidAmount}, Due: ₹${w.dueAmount}. - ${shopConfig().shopName}`,{type:'payment',workId:w.id}).catch(()=>{}));res.status(201).json({payment:p,work:w});});

// Customers
app.get('/api/admin/customers',staffAuth(),(req,res)=>{
  const works=getWorks(),map=new Map();
  for(const w of works){const c=map.get(w.mobile)||{mobile:w.mobile,name:w.name,email:w.email,works:0,totalFee:0,paid:0,due:0,lastWorkAt:w.createdAt,documents:0};c.works++;c.totalFee+=w.totalFee;c.paid+=w.paidAmount;c.due+=w.dueAmount;c.documents+=(w.files||[]).length;if(new Date(w.createdAt)>new Date(c.lastWorkAt)){c.lastWorkAt=w.createdAt;c.name=w.name;c.email=w.email;}map.set(w.mobile,c);}
  res.json([...map.values()].sort((a,b)=>new Date(b.lastWorkAt)-new Date(a.lastWorkAt)));
});
app.get('/api/admin/customers/:mobile',staffAuth(),(req,res)=>{const mobile=clean(req.params.mobile,15),works=getWorks().filter(x=>x.mobile===mobile),payments=db.payments().filter(p=>p.mobile===mobile),tickets=db.tickets().filter(t=>t.mobile===mobile);if(!works.length)return res.status(404).json({error:'Customer not found'});res.json({profile:{mobile,name:works[0].name,email:works[0].email},works,payments,tickets});});

// Expenses + accounts
app.get('/api/admin/expenses',staffAuth(),(_,res)=>res.json(db.expenses()));
app.post('/api/admin/expenses',staffAuth(),(req,res)=>{const rows=db.expenses(),e={id:uid('EXP'),date:clean(req.body.date,20)||dayKey(nowIso()),title:clean(req.body.title,120),note:clean(req.body.note,500),amount:num(req.body.amount),category:clean(req.body.category,80)||'General',createdAt:nowIso(),by:req.actor.name};if(!e.title||e.amount<=0)return res.status(400).json({error:'Title and amount required'});rows.unshift(e);writeJson(FILES.expenses,rows);res.status(201).json(e);});
app.delete('/api/admin/expenses/:id',staffAuth(['admin']),(req,res)=>{const rows=db.expenses(),n=rows.filter(x=>x.id!==req.params.id);if(n.length===rows.length)return res.status(404).json({error:'Expense not found'});writeJson(FILES.expenses,n);res.json({success:true});});
function accountStats(){const works=getWorks(),payments=db.payments(),expenses=db.expenses();const totalFee=works.reduce((a,x)=>a+x.totalFee,0),paid=works.reduce((a,x)=>a+x.paidAmount,0),due=works.reduce((a,x)=>a+x.dueAmount,0),exp=expenses.reduce((a,x)=>a+num(x.amount),0),today=dayKey(nowIso());return {total:works.length,customers:new Set(works.map(x=>x.mobile)).size,totalFee,paid,due,expenses:exp,profit:paid-exp,todayPaid:payments.filter(x=>dayKey(x.createdAt)===today).reduce((a,x)=>a+num(x.amount),0),new:works.filter(x=>['New','Received'].includes(x.status)).length,processing:works.filter(x=>['Assigned','Processing','Checking','Waiting for Customer'].includes(x.status)).length,completed:works.filter(x=>['Completed','Delivered'].includes(x.status)).length,partners:db.partners().filter(x=>x.active!==false).length};}
app.get('/api/admin/stats',staffAuth(),(_,res)=>res.json(accountStats()));
app.get('/api/admin/accounts',staffAuth(),(req,res)=>{const from=clean(req.query.from,20),to=clean(req.query.to,20);let pays=db.payments(),exps=db.expenses();if(from){pays=pays.filter(x=>dayKey(x.createdAt)>=from);exps=exps.filter(x=>x.date>=from);}if(to){pays=pays.filter(x=>dayKey(x.createdAt)<=to);exps=exps.filter(x=>x.date<=to);}const income=pays.reduce((a,x)=>a+num(x.amount),0),expense=exps.reduce((a,x)=>a+num(x.amount),0);res.json({income,expense,profit:income-expense,payments:pays,expenses:exps});});
app.get('/api/admin/charts',staffAuth(),(req,res)=>{const days=Math.min(90,Math.max(7,Number(req.query.days||30))),works=getWorks(),payments=db.payments();const daily=[];for(let i=days-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=dayKey(d);daily.push({date:k,works:works.filter(x=>dayKey(x.createdAt)===k).length,earning:payments.filter(x=>dayKey(x.createdAt)===k).reduce((a,x)=>a+num(x.amount),0)});}const countBy=(rows,key)=>Object.entries(rows.reduce((m,x)=>{const k=x[key]||'Direct';m[k]=(m[k]||0)+1;return m;},{})).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>({name,value}));res.json({daily,topServices:countBy(works,'service'),topPartners:countBy(works.filter(x=>x.partnerId),'partnerName')});});

// Services / document checklist / price list
app.get('/api/admin/services',staffAuth(),(_,res)=>res.json(serviceRows()));
app.post('/api/admin/services',staffAuth(['admin']),(req,res)=>{const rows=serviceRows(),s={id:nextSequence('SVC',rows),name:clean(req.body.name,120),fee:num(req.body.fee),partnerCommission:num(req.body.partnerCommission),documents:Array.isArray(req.body.documents)?req.body.documents.map(x=>clean(x,150)).filter(Boolean):clean(req.body.documents,1000).split('\n').map(x=>x.trim()).filter(Boolean),active:true};if(!s.name)return res.status(400).json({error:'Service name required'});rows.push(s);writeJson(FILES.services,rows);res.status(201).json(s);});
app.patch('/api/admin/services/:id',staffAuth(['admin']),(req,res)=>{const rows=serviceRows(),s=rows.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:'Service not found'});if(req.body.name!==undefined)s.name=clean(req.body.name,120);if(req.body.fee!==undefined)s.fee=num(req.body.fee);if(req.body.partnerCommission!==undefined)s.partnerCommission=num(req.body.partnerCommission);if(req.body.active!==undefined)s.active=!!req.body.active;if(req.body.documents!==undefined)s.documents=Array.isArray(req.body.documents)?req.body.documents.map(x=>clean(x,150)).filter(Boolean):clean(req.body.documents,2000).split('\n').map(x=>x.trim()).filter(Boolean);writeJson(FILES.services,rows);res.json(s);});

// Partners + commission + wallet
app.get('/api/admin/partners',staffAuth(),(_,res)=>res.json(db.partners().map(p=>({...safePartner(p),ledger:commissionLedger(p.id)}))));
app.post('/api/admin/partners',staffAuth(['admin']),(req,res)=>{const rows=db.partners(),name=clean(req.body.name,100),mobile=clean(req.body.mobile,15),area=clean(req.body.area,120),pin=clean(req.body.pin,50);if(!name||!/^\d{10}$/.test(mobile)||pin.length<4)return res.status(400).json({error:'Name, 10-digit mobile and minimum 4-digit PIN required'});const p={id:nextSequence('MSP',rows),name,mobile,area,pinHash:hashSecret(pin),active:true,createdAt:nowIso()};rows.push(p);writeJson(FILES.partners,rows);res.status(201).json(safePartner(p));});
app.patch('/api/admin/partners/:id',staffAuth(['admin']),(req,res)=>{const rows=db.partners(),p=rows.find(x=>x.id===req.params.id.toUpperCase());if(!p)return res.status(404).json({error:'Partner not found'});for(const k of ['name','area'])if(req.body[k]!==undefined)p[k]=clean(req.body[k],120);if(req.body.mobile!==undefined&&/^\d{10}$/.test(req.body.mobile))p.mobile=req.body.mobile;if(req.body.active!==undefined)p.active=!!req.body.active;if(req.body.pin&&String(req.body.pin).length>=4)p.pinHash=hashSecret(req.body.pin);writeJson(FILES.partners,rows);res.json(safePartner(p));});
app.post('/api/admin/partner-wallet',staffAuth(['admin']),(req,res)=>{const partnerId=clean(req.body.partnerId,30).toUpperCase(),p=db.partners().find(x=>x.id===partnerId);if(!p)return res.status(404).json({error:'Partner not found'});const type=['advance_credit','advance_debit','commission_settlement'].includes(req.body.type)?req.body.type:'';const amount=num(req.body.amount);if(!type||amount<=0)return res.status(400).json({error:'Valid type and amount required'});const rows=db.wallet(),t={id:uid('PWT'),partnerId,type,amount,note:clean(req.body.note,300),createdAt:nowIso(),by:req.actor.name};rows.unshift(t);writeJson(FILES.wallet,rows);res.status(201).json({transaction:t,ledger:commissionLedger(partnerId)});});

// Staff management
app.get('/api/admin/staff',staffAuth(['admin']),(_,res)=>res.json(db.staff().map(({passwordHash,...s})=>s)));
app.post('/api/admin/staff',staffAuth(['admin']),(req,res)=>{const rows=db.staff(),username=clean(req.body.username,80).toLowerCase(),password=clean(req.body.password,100),role=['admin','operator'].includes(req.body.role)?req.body.role:'operator';if(!clean(req.body.name,100)||!username||password.length<6)return res.status(400).json({error:'Name, username and minimum 6-character password required'});if(rows.some(x=>x.username===username))return res.status(400).json({error:'Username already exists'});const s={id:nextSequence('STF',rows),name:clean(req.body.name,100),username,role,passwordHash:hashSecret(password),active:true,createdAt:nowIso()};rows.push(s);writeJson(FILES.staff,rows);const {passwordHash,...safe}=s;res.status(201).json(safe);});
app.patch('/api/admin/staff/:id',staffAuth(['admin']),(req,res)=>{const rows=db.staff(),s=rows.find(x=>x.id===req.params.id);if(!s)return res.status(404).json({error:'Staff not found'});if(req.body.name!==undefined)s.name=clean(req.body.name,100);if(req.body.role&&['admin','operator'].includes(req.body.role))s.role=req.body.role;if(req.body.active!==undefined)s.active=!!req.body.active;if(req.body.password&&String(req.body.password).length>=6)s.passwordHash=hashSecret(req.body.password);writeJson(FILES.staff,rows);const {passwordHash,...safe}=s;res.json(safe);});

// Support tickets
app.get('/api/admin/tickets',staffAuth(),(_,res)=>res.json(db.tickets()));
app.patch('/api/admin/tickets/:id',staffAuth(),(req,res)=>{const rows=db.tickets(),t=rows.find(x=>x.id===req.params.id);if(!t)return res.status(404).json({error:'Ticket not found'});if(req.body.status&&['Open','In Progress','Resolved','Closed'].includes(req.body.status))t.status=req.body.status;if(req.body.reply!==undefined)t.reply=clean(req.body.reply,2000);t.updatedAt=nowIso();writeJson(FILES.tickets,rows);if(t.reply)setImmediate(()=>notifyMobile(t.mobile,`Support Ticket ${t.id}: ${t.reply} - ${shopConfig().shopName}`,{type:'ticket_reply',ticketId:t.id}).catch(()=>{}));res.json(t);});

// Expiry reminders
app.get('/api/admin/reminders',staffAuth(),(req,res)=>{const days=Math.min(365,Math.max(1,Number(req.query.days||30))),limit=new Date(Date.now()+days*86400000),today=new Date();const rows=getWorks().filter(w=>w.expiryDate&&new Date(w.expiryDate)>=today&&new Date(w.expiryDate)<=limit).sort((a,b)=>new Date(a.expiryDate)-new Date(b.expiryDate));res.json(rows);});
app.post('/api/admin/reminders/:id/send',staffAuth(),async(req,res)=>{const w=getWorks().find(x=>x.id===req.params.id.toUpperCase());if(!w||!w.expiryDate)return res.status(404).json({error:'Reminder work not found'});const r=await notifyMobile(w.mobile,`Reminder: ${w.service} related record/work ${w.id} ka expiry date ${w.expiryDate} hai. Renewal/help ke liye ${shopConfig().shopName} se sampark karein.`,{type:'expiry_reminder',workId:w.id});res.json({success:true,result:r});});

// Settings
app.get('/api/admin/settings',staffAuth(['admin']),(_,res)=>res.json(shopConfig()));
app.put('/api/admin/settings',staffAuth(['admin']),(req,res)=>{const current=db.settings();for(const k of ['shopName','tagline','phone','email','address','upiId','baseUrl'])if(req.body[k]!==undefined)current[k]=clean(req.body[k],500);writeJson(FILES.settings,current);res.json(shopConfig());});

// Export + backup + restore
function csvEscape(v){return '"'+String(v??'').replace(/"/g,'""')+'"';}
function workCsv(){const rows=getWorks(),head=['Work ID','Date','Receipt','Invoice','Partner ID','Partner','Customer','Mobile','Service','Priority','Due Date','Status','Payment Status','Total Fee','Paid','Due','Commission'];return '\uFEFF'+[head,...rows.map(w=>[w.id,w.createdAt,w.receiptNo,w.invoiceNo,w.partnerId,w.partnerName,w.name,w.mobile,w.service,w.priority,w.dueDate,w.status,w.paymentStatus,w.totalFee,w.paidAmount,w.dueAmount,w.commissionAmount])].map(r=>r.map(csvEscape).join(',')).join('\n');}
app.get('/api/admin/export',staffAuth(),(_,res)=>{res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition','attachment; filename="ms-manish-erp-report.csv"');res.send(workCsv());});
function backupSnapshot(){return {version:'4.0.0',createdAt:nowIso(),data:{requests:getWorks(),partners:db.partners(),staff:db.staff(),payments:db.payments(),expenses:db.expenses(),services:serviceRows(),settings:db.settings(),tickets:db.tickets(),wallet:db.wallet(),notifications:db.notifications()}};}
async function performBackup(reason='scheduled'){
  const stamp=nowIso().replace(/[:.]/g,'-'),jsonPath=path.join(BACKUP_DIR,`ms-manish-erp-${stamp}.json`),csvPath=path.join(BACKUP_DIR,`ms-manish-erp-${stamp}.csv`);fs.writeFileSync(jsonPath,JSON.stringify(backupSnapshot(),null,2));fs.writeFileSync(csvPath,workCsv());
  const retention=Math.max(1,Number(process.env.BACKUP_RETENTION_DAYS||14))*86400000;for(const f of fs.readdirSync(BACKUP_DIR)){const p=path.join(BACKUP_DIR,f);try{if(fs.statSync(p).isFile()&&Date.now()-fs.statSync(p).mtimeMs>retention)fs.unlinkSync(p);}catch{}}
  if(String(process.env.GOOGLE_DRIVE_ENABLED).toLowerCase()==='true'){await uploadToDrive(jsonPath,path.basename(jsonPath),'application/json');await uploadToDrive(csvPath,path.basename(csvPath),'text/csv');}
  logNotification({mobile:'',message:`Backup completed (${reason})`,context:{type:'backup',json:path.basename(jsonPath),csv:path.basename(csvPath)}});return {jsonPath,csvPath};
}
app.get('/api/admin/backup',staffAuth(),(_,res)=>{const snap=backupSnapshot();res.setHeader('Content-Disposition','attachment; filename="ms-manish-erp-backup-v4.json"');res.json(snap);});
app.post('/api/admin/backup/run',staffAuth(['admin']),async(_,res)=>{try{const r=await performBackup('manual');res.json({success:true,files:[path.basename(r.jsonPath),path.basename(r.csvPath)]});}catch(e){res.status(500).json({error:e.message});}});
app.post('/api/admin/restore',staffAuth(['admin']),upload.single('backup'),(req,res)=>{try{const raw=JSON.parse(fs.readFileSync(req.file.path,'utf8')),data=raw.data||raw;if(!Array.isArray(data.requests)&&!Array.isArray(raw))throw new Error('Invalid backup');if(Array.isArray(raw)){writeJson(FILES.requests,raw);}else{for(const [k,file] of Object.entries(FILES)){if(k==='otp')continue;if(data[k]!==undefined)writeJson(file,data[k]);}}fs.unlinkSync(req.file.path);res.json({success:true,count:getWorks().length});}catch(e){if(req.file)try{fs.unlinkSync(req.file.path)}catch{};res.status(400).json({error:'Invalid backup file: '+e.message});}});

// Notification log for diagnostics
app.get('/api/admin/notifications',staffAuth(['admin']),(_,res)=>res.json(db.notifications().slice(0,500)));

// Routes
app.get('/admin',(_,res)=>res.sendFile(path.join(ROOT,'public','admin.html')));
app.get('/partner',(_,res)=>res.sendFile(path.join(ROOT,'public','partner.html')));
app.get('/customer',(_,res)=>res.sendFile(path.join(ROOT,'public','customer.html')));
app.get('/receipt',(_,res)=>res.sendFile(path.join(ROOT,'public','receipt.html')));

app.use((err,req,res,next)=>{console.error(err);res.status(400).json({error:err.message||'Request failed'});});

// Daily backup + light expiry reminder scan
setTimeout(()=>performBackup('startup').catch(()=>{}),15000);
setInterval(()=>performBackup('daily').catch(()=>{}),24*60*60*1000).unref();
setInterval(()=>{
  const soon=new Date(Date.now()+7*86400000),today=new Date(),works=getWorks();
  for(const w of works.filter(x=>x.expiryDate&&new Date(x.expiryDate)>=today&&new Date(x.expiryDate)<=soon)){
    const key=`expiry:${w.id}:${dayKey(nowIso())}`;if(db.notifications().some(n=>n.context?.key===key))continue;
    notifyMobile(w.mobile,`Reminder: ${w.service} related expiry ${w.expiryDate} ko hai. Renewal/help: ${shopConfig().shopName}`,{type:'expiry_auto',workId:w.id,key}).catch(()=>{});
  }
},12*60*60*1000).unref();

app.listen(PORT,()=>console.log(`MS MANISH CYBER ERP v4 running on http://localhost:${PORT}`));
