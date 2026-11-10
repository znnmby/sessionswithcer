import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { captureSession, restoreSession, recaptureSession, createNewSession, getNewSessionStatus } from '../src/services/session.service.ts';
import { cookieIdentity } from '../src/services/cookie.service.ts';
import { migrateStorage } from '../src/storage/migrations.ts';
import { buildExportFile, validateExportFile } from '../src/services/export-import.service.ts';
let db, jar, reloads, failSet;
const origin='https://app.example.test';
const part={topLevelSite:'https://example.test',hasCrossSiteAncestor:false};
const clone=x=>structuredClone(x);
const cookie=(name,value,domain='.example.test',path='/')=>({name,value,domain,path,secure:true,httpOnly:true,sameSite:'lax',hostOnly:!domain.startsWith('.'),storeId:'0'});
beforeEach(()=>{
 db={};jar=[cookie('sid','A'),cookie('sid','A-path','.example.test','/account'),cookie('other','keep','.other.test')];reloads=0;failSet=false;
 globalThis.chrome={storage:{local:{
  get:async keys=>keys===null?clone(db):Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>Object.hasOwn(db,k)).map(k=>[k,clone(db[k])])),
  set:async value=>Object.assign(db,clone(value)),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete db[k];}}},
  tabs:{get:async id=>({id,url:origin+'/account'}),reload:async()=>{reloads++;}},
  cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[1]}],getPartitionKey:async()=>({partitionKey:part}),
   getAll:async q=>clone(jar.filter(c=>(!q.storeId||q.storeId===c.storeId)&&JSON.stringify(c.partitionKey)===JSON.stringify(q.partitionKey))),
   get:async q=>clone(jar.filter(c=>{const u=new URL(q.url),d=c.domain.replace(/^\./,'');return c.name===q.name&&c.storeId===q.storeId&&JSON.stringify(c.partitionKey)===JSON.stringify(q.partitionKey)&&(c.hostOnly?u.hostname===d:u.hostname===d||u.hostname.endsWith('.'+d))&&u.pathname.startsWith(c.path);}).sort((a,b)=>b.path.length-a.path.length)[0]),
   remove:async q=>{const c=await chrome.cookies.get(q);if(!c)return null;jar=jar.filter(x=>cookieIdentity(x)!==cookieIdentity(c));return {url:q.url,name:q.name};},
   set:async d=>{if(failSet){failSet=false;throw Error('Set failed');}const c={...cookie(d.name,d.value,d.domain??new URL(d.url).hostname,d.path),...d,hostOnly:!d.domain};delete c.url;jar=jar.filter(x=>cookieIdentity(x)!==cookieIdentity(c));jar.push(c);return clone(c);}
  }};
});
test('capture and restore cookies without creating extra session profiles',async()=>{
 const a=await captureSession('A',1);jar=jar.map(c=>c.name==='sid'?{...c,value:'B'}:c);const b=await captureSession('B',1);
 await restoreSession(a.id,1);assert.equal(jar.find(c=>c.name==='sid').value,'A');assert.equal(jar.filter(c=>c.name==='sid').length,2);
 assert.equal(jar.find(c=>c.name==='other').value,'keep');assert.equal(db.sessions.length,2);assert.ok(db.sessions.find(s=>s.id===b.id));assert.equal(reloads,1);
});
test('update affects only selected session and rejects a different website',async()=>{
 const a=await captureSession('A',1);jar.find(c=>c.name==='sid').value='new';await recaptureSession(a.id,1);assert.equal(db.sessions[0].cookies[0].value,'new');
 db.sessions[0].domain='other.test';await assert.rejects(recaptureSession(a.id,1),/matching/);
});
test('expired cookies rejected before mutation',async()=>{
 const a=await captureSession('A',1);db.sessions[0].cookies[0].expirationDate=1;const before=clone(jar);
 await assert.rejects(restoreSession(a.id,1),/expired/);assert.deepEqual(jar,before);assert.equal(reloads,0);
});
test('failed switch restores previous cookies without persisting backup profiles',async()=>{
 const a=await captureSession('A',1);jar.find(c=>c.name==='sid').value='current';failSet=true;
 await assert.rejects(restoreSession(a.id,1),/Previous cookies restored/);assert.equal(jar.find(c=>c.name==='sid').value,'current');assert.equal(db.sessions.length,1);
});
test('concurrent switch is rejected',async()=>{
 const a=await captureSession('A',1);const results=await Promise.allSettled([restoreSession(a.id,1),restoreSession(a.id,1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/Another session operation/);
});
test('saved cookie sessions still export and validate',async()=>{
 const a=await captureSession('A',1);assert.equal(validateExportFile(buildExportFile([a])).valid,true);
});
test('migration removes retired data and preserves manually saved accounts',async()=>{
 const a=await captureSession('Manual account',1);db.sessions.push({...clone(a),id:'old-auto',automatic:true});
 db.sessions[0].authStorage={origin,local:{token:'old'},session:{}};
 db['adapter:app.example.test']={};db['active:0:test']={};db.switchJournal={};db.preference='keep';
 await migrateStorage();assert.deepEqual(db.sessions,[a]);assert.equal(db.preference,'keep');
 assert.equal(db.switchJournal,undefined);assert.equal(db['adapter:app.example.test'],undefined);assert.equal(db['active:0:test'],undefined);
});

test('A → New → login B → Save → A preserves both accounts without logout requests', async()=>{
 globalThis.fetch=()=>{throw Error('No network request allowed');};
 const status=await createNewSession('Account A',1);
 assert.equal(status.ready,true);assert.equal(db.sessions.length,1);assert.equal(jar.some(c=>c.name==='sid'),false);
 assert.equal(jar.find(c=>c.name==='other').value,'keep');
 assert.equal((await getNewSessionStatus(1)).savedLabel,'Account A');
 jar.push(cookie('sid','B'));const b=await captureSession('Account B',1);
 assert.equal(await getNewSessionStatus(1),null);assert.equal(db.sessions.length,2);
 await restoreSession(status.sessionId,1);assert.equal(jar.find(c=>c.name==='sid').value,'A');
 await restoreSession(b.id,1);assert.equal(jar.find(c=>c.name==='sid').value,'B');
});
test('New with blank label reuses identical saved account, then Switch clears pending status',async()=>{
 const a=await captureSession('Existing A',1);const status=await createNewSession('',1);
 assert.equal(status.sessionId,a.id);assert.equal(db.sessions.length,1);
 await restoreSession(a.id,1);assert.equal(await getNewSessionStatus(1),null);
});
test('New never clears cookies when snapshot persistence fails',async()=>{
 const before=clone(jar);chrome.storage.local.set=async()=>{throw Error('Storage full');};
 await assert.rejects(createNewSession('A',1),/Storage full/);assert.deepEqual(jar,before);assert.equal(reloads,0);
});
test('New cookie removal failure preserves saved account and restores browser cookies',async()=>{
 const original=chrome.cookies.remove;let calls=0;
 chrome.cookies.remove=async q=>{if(++calls===2)throw Error('Delete failed');return original(q);};
 await assert.rejects(createNewSession('A',1),/Previous cookies restored/);
 assert.equal(db.sessions.length,1);assert.equal(jar.filter(c=>c.name==='sid').length,2);assert.equal(await getNewSessionStatus(1),null);
});
test('double New is blocked while running and until user saves or switches',async()=>{
 const results=await Promise.allSettled([createNewSession('A',1),createNewSession('A',1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(db.sessions.length,1);
 await assert.rejects(createNewSession('Again',1),/already started/);assert.equal(db.sessions.length,1);
});
test('New uses automatic label and leaves other cookie stores/partitions untouched',async()=>{
 jar.push({...cookie('sid','private'),storeId:'9'});
 jar.push({...cookie('sid','foreign'),partitionKey:{topLevelSite:'https://other.test'}});
 const status=await createNewSession('',1);assert.ok(status.savedLabel.startsWith('app.example.test'));
 assert.ok(jar.find(c=>c.value==='private'));assert.ok(jar.find(c=>c.value==='foreign'));
});

test('New does not save an empty site as an account',async()=>{
 jar=jar.filter(c=>c.name==='other');await assert.rejects(createNewSession('A',1),/No site cookies/);
 assert.equal(db.sessions,undefined);assert.equal(reloads,0);
});
