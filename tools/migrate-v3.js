const fs=require('fs'),path=require('path');
const src=path.resolve(process.argv[2]||'');const dst=path.resolve(__dirname,'..');
if(!process.argv[2]||!fs.existsSync(src)){console.error('Usage: node tools/migrate-v3.js /path/to/old-v3-project');process.exit(1)}
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),pre=path.join(dst,'backups',`pre-migration-${stamp}`);fs.mkdirSync(pre,{recursive:true});
const copy=(a,b)=>{if(!fs.existsSync(a))return;fs.mkdirSync(path.dirname(b),{recursive:true});fs.cpSync(a,b,{recursive:true,force:true});console.log('Copied',a,'->',b)};
for(const n of ['requests.json','partners.json','expenses.json','services.json','settings.json']){const a=fs.existsSync(path.join(src,'data',n))?path.join(src,'data',n):path.join(src,n);if(fs.existsSync(a)){copy(a,path.join(pre,n));copy(a,path.join(dst,'data',n));}}
if(fs.existsSync(path.join(src,'uploads'))){copy(path.join(src,'uploads'),path.join(pre,'uploads'));copy(path.join(src,'uploads'),path.join(dst,'uploads'));}
console.log('V3 data copied. Pre-migration backup:',pre);console.log('Start v4 once to auto-normalize old works/services.');
