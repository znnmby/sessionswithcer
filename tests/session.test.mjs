import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { captureSession, activateAnonymous, restoreSession, recaptureSession, getAnonymousStatus, recoverSwitch } from '../src/services/session.service.ts';
import { saveAdapter } from '../src/services/auth-adapter.service.ts';
import { getAllSessions } from '../src/storage/session.storage.ts';
import { cookieIdentity, getCookiesForDomain } from '../src/services/cookie.service.ts';
import { validateExportFile, buildExportFile } from '../src/services/export-import.service.ts';

let db, jar, local, session, listeners, failSet, revoked, reloads, injections;
const origin = 'https://app.example.test';
const adapter = { domain: 'app.example.test', cookies: [
  { name: 'sid', domain: '.example.test' }, { name: '__Host-auth', domain: 'app.example.test' }
], localKeys: ['access_token'], sessionKeys: ['auth_nonce'],
verification: { authenticated: '[data-account]', anonymous: '[data-anonymous]' } };
function cookie(name, value, domain='.example.test', path='/', extra={}) {
  return { name, value, domain, path, secure:true, httpOnly:true, sameSite:'lax', hostOnly:!domain.startsWith('.'), storeId:'0', ...extra };
}
const part = { topLevelSite:'https://example.test', hasCrossSiteAncestor:false };
const clone = x => structuredClone(x);
function storage(values) {
  return { getItem: k => Object.hasOwn(values,k) ? values[k] : null,
    setItem: (k,v) => { values[k]=v; }, removeItem: k => { delete values[k]; } };
}
function matching(c, url) {
  const u = new URL(url), d=c.domain.replace(/^\./,'');
  return (c.hostOnly ? u.hostname===d : u.hostname===d || u.hostname.endsWith('.'+d)) && u.pathname.startsWith(c.path);
}
beforeEach(async () => {
  db={};jar=[cookie('sid','A'),cookie('sid','A-path','.example.test','/account'),cookie('__Host-auth','A','app.example.test'),cookie('theme','dark'),cookie('other','keep','.other.test')];
  local={access_token:'A', theme:'dark', draft:'keep'};session={auth_nonce:'A',draft:'keep'};
  listeners=new Set(); failSet=false;revoked=false;reloads=0;injections=0;
  globalThis.chrome={
    storage:{local:{get:async keys => Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>Object.hasOwn(db,k)).map(k=>[k,clone(db[k])])),
      set:async value=>Object.assign(db,clone(value)),remove:async keys=>{for(const k of Array.isArray(keys)?keys:[keys])delete db[k];}}},
    cookies:{getAllCookieStores:async()=>[{id:'0',tabIds:[1,2]}],getPartitionKey:async()=>({partitionKey:part}),
      getAll:async q=>clone(jar.filter(c=>(!q.storeId||q.storeId===c.storeId)&&JSON.stringify(c.partitionKey)===JSON.stringify(q.partitionKey))),
      get:async q=>clone(jar.filter(c=>c.name===q.name&&c.storeId===q.storeId&&JSON.stringify(c.partitionKey)===JSON.stringify(q.partitionKey)&&matching(c,q.url)).sort((a,b)=>b.path.length-a.path.length)[0]),
      remove:async q=>{const c=await chrome.cookies.get(q);if(!c)return null;jar=jar.filter(x=>cookieIdentity(x)!==cookieIdentity(c));return {url:q.url,name:q.name};},
      set:async d=>{if(failSet){failSet=false;throw Error('Injected set failure');}const c=cookie(d.name,d.value,d.domain??new URL(d.url).hostname,d.path,{...d,hostOnly:!d.domain});delete c.url;jar=jar.filter(x=>cookieIdentity(x)!==cookieIdentity(c));jar.push(c);return clone(c);}},
    tabs:{get:async id=>({id,url:origin+'/account'}),onUpdated:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)},
      reload:async id=>{reloads++;if(revoked)jar=jar.filter(c=>!adapter.cookies.some(r=>r.name===c.name));queueMicrotask(()=>{for(const fn of listeners)fn(id,{status:'complete'});});}},
    scripting:{executeScript:async ({func,args})=>{
      injections++;globalThis.location={origin};globalThis.localStorage=storage(local);globalThis.sessionStorage=storage(session);
      globalThis.document={querySelector:selector=>{const logged=jar.some(c=>c.name==='sid')&&!!local.access_token;return selector==='[data-account]'?logged:selector==='[data-anonymous]'?!logged:false;}};
      return [{result:await func(...args)}];}},
  };
  await saveAdapter(adapter.domain,adapter);
});
async function accounts(){const a=await captureSession('A',1);jar=jar.map(c=>adapter.cookies.some(r=>r.name===c.name)?{...c,value:'B'}:c);local.access_token='B';session.auth_nonce='B';const b=await captureSession('B',1);await restoreSession(a.id,1);return {a,b};}
test('A → Anonymous → A preserves preferences, drafts, all auth cookies and original snapshot',async()=>{
  const a=await captureSession('A',1);const original=clone(a);
  const anon=await activateAnonymous(1);assert.equal(anon.mode,'anonymous');assert.match(anon.verification,/verified/);
  assert.equal(jar.some(c=>c.name==='sid'||c.name==='__Host-auth'),false);assert.equal(local.access_token,undefined);assert.equal(session.auth_nonce,undefined);
  assert.equal(local.draft,'keep');assert.equal(session.draft,'keep');assert.equal(jar.find(c=>c.name==='theme').value,'dark');assert.ok(jar.find(c=>c.name==='other'));
  assert.deepEqual((await getAllSessions()).find(s=>s.id===a.id),original);
  assert.ok((await getAllSessions()).find(s=>s.id===anon.recoveryId).automatic);
  await restoreSession(a.id,1);assert.equal(local.access_token,'A');assert.equal(jar.filter(c=>c.name==='sid').length,2);assert.equal(jar.find(c=>c.name==='__Host-auth').hostOnly,true);
});
test('A → Anonymous → B → Anonymous → A and A → B → Anonymous → A',async()=>{
 const {a,b}=await accounts();
 for(const action of [()=>activateAnonymous(1),()=>restoreSession(b.id,1),()=>activateAnonymous(1),()=>restoreSession(a.id,1),()=>restoreSession(b.id,1),()=>activateAnonymous(1),()=>restoreSession(a.id,1)]) await action();
 assert.equal(local.access_token,'A');assert.equal((await getAllSessions()).find(s=>s.id===b.id).cookies[0].value,'B');
});
test('rotated auth is captured into a new recovery snapshot, never overwrites saved A',async()=>{
 const a=await captureSession('A',1);jar.find(c=>c.name==='sid').value='rotated';await activateAnonymous(1);
 const sessions=await getAllSessions();assert.equal(sessions.find(s=>s.id===a.id).cookies[0].value,'A');
 const recovery=sessions.find(s=>s.automatic);assert.equal(recovery.cookies[0].value,'rotated');await restoreSession(recovery.id,1);assert.equal(jar.find(c=>c.name==='sid').value,'rotated');
 await assert.rejects(recaptureSession(recovery.id,1),/cannot be overwritten/);
});
test('partitioned auth preserved/restored only in matching partition and store',async()=>{
 jar.push(cookie('sid','partition','.example.test','/',{partitionKey:part}));jar.push(cookie('sid','other-store','.example.test','/',{storeId:'9'}));
 const a=await captureSession('A',1);await activateAnonymous(1);assert.equal(jar.filter(c=>c.storeId==='0'&&c.name==='sid').length,0);assert.ok(jar.find(c=>c.storeId==='9'));
 await restoreSession(a.id,1);assert.ok(jar.find(c=>c.partitionKey?.topLevelSite===part.topLevelSite));
});
test('expired snapshot rejected before mutation',async()=>{
 const a=await captureSession('A',1);db.sessions.find(s=>s.id===a.id).cookies[0].expirationDate=1;
 const before=clone(jar);await assert.rejects(restoreSession(a.id,1),/expired/);assert.deepEqual(jar,before);assert.equal(reloads,0);
});
test('mid-switch failure restores previous cookies and storage and retains recovery',async()=>{
 const {b}=await accounts();const before=clone(jar);failSet=true;
 await assert.rejects(restoreSession(b.id,1),/Previous local state restored/);assert.deepEqual(new Set(jar.map(JSON.stringify)),new Set(before.map(JSON.stringify)));assert.equal(local.access_token,'A');assert.equal(db.switchJournal,undefined);
});
test('double switching rejected while first operation owns transaction',async()=>{
 const results=await Promise.allSettled([activateAnonymous(1),activateAnonymous(1)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/Another session operation/);
});
test('unsupported website never mutates auth; no bootstrap or logout requests',async()=>{
 delete db['adapter:'+adapter.domain];const before=clone(jar);globalThis.fetch=()=>{throw Error('No network allowed');};
 await assert.rejects(activateAnonymous(1),/unsupported/);assert.deepEqual(jar,before);assert.equal(reloads,0);
 await saveAdapter(adapter.domain,adapter);await activateAnonymous(1);assert.equal((await getAnonymousStatus(1)).mode,'anonymous');
});
test('revocation detected by verifier instead of claiming successful authentication',async()=>{
 const a=await captureSession('A',1);await activateAnonymous(1);revoked=true;
 await assert.rejects(restoreSession(a.id,1),/verification failed/);
 assert.equal((await getAnonymousStatus(1)).mode,'unknown');
});
test('durable interrupted journal can be recovered explicitly',async()=>{
 const a=await captureSession('A',1);db.switchJournal={before:a,adapter,tabId:1,key:'active:0:'+origin+':1'};
 jar=jar.filter(c=>c.name!=='sid');delete local.access_token;
 await recoverSwitch(1);assert.equal(local.access_token,'A');assert.equal(db.switchJournal,undefined);
});
test('cross-domain cookie snapshots and mismatched tab updates fail before mutation',async()=>{
 const a=await captureSession('A',1);db.sessions.find(s=>s.id===a.id).cookies.push(cookie('sid','evil','.evil.test'));
 await assert.rejects(restoreSession(a.id,1),/outside/);
 db.sessions.find(s=>s.id===a.id).domain='evil.test';await assert.rejects(recaptureSession(a.id,1),/matching/);
});
test('legacy exports still validate; malformed auth storage or partition rejected',async()=>{
 const a=await captureSession('A',1);delete a.authStorage;delete a.storeId;assert.equal(validateExportFile(buildExportFile([a])).valid,true);
 a.authStorage={origin,local:[],session:{}};assert.equal(validateExportFile(buildExportFile([a])).valid,false);
});
test('no verifier means explicitly unverified, never authentication success',async()=>{
 delete adapter.verification;await saveAdapter(adapter.domain,adapter);const result=await activateAnonymous(1);assert.match(result.verification,/Unverified/);
});
test('adapter rejects unrelated domains and preserves all other cookies',async()=>{
 await assert.rejects(saveAdapter(adapter.domain,{...adapter,cookies:[{name:'sid',domain:'other.test'}]}),/Invalid adapter/);
 assert.ok((await getCookiesForDomain(adapter.domain,'0',part)).every(c=>c.name!=='other'));
});
test('Anonymous cannot overwrite existing account through Update or Save',async()=>{
 const a=await captureSession('A',1);await activateAnonymous(1);const before=clone(db.sessions.find(s=>s.id===a.id));
 await assert.rejects(recaptureSession(a.id,1),/Anonymous state/);await assert.rejects(captureSession('Accidental anonymous',1),/Anonymous state/);
 assert.deepEqual(db.sessions.find(s=>s.id===a.id),before);
});
test('failed rollback leaves journal and Recover retries successfully',async()=>{
 const a=await captureSession('A',1);const real=chrome.cookies.remove;
 chrome.cookies.remove=async()=>{throw Error('Permission failure');};
 await assert.rejects(activateAnonymous(1),/recovery is incomplete/);assert.ok(db.switchJournal);assert.ok(db.sessions.find(s=>s.id===a.id));
 chrome.cookies.remove=real;await recoverSwitch(1);assert.equal(db.switchJournal,undefined);assert.equal(local.access_token,'A');
});
test('unrelated partition and store are never removed',async()=>{
 const foreign={topLevelSite:'https://foreign.test',hasCrossSiteAncestor:true};jar.push(cookie('sid','foreign','.example.test','/',{partitionKey:foreign}));
 await activateAnonymous(1);assert.ok(jar.find(c=>c.value==='foreign'));
});
test('recovery may use replacement tab on exact same origin/store after tab closes',async()=>{
 const a=await captureSession('A',1);db.switchJournal={before:a,adapter,tabId:1,key:'active:0:'+origin+':1'};
 delete local.access_token;jar=jar.filter(c=>c.name!=='sid');await recoverSwitch(2);assert.equal(local.access_token,'A');assert.equal(db.switchJournal,undefined);
});
test('same name on parent and host domains remains distinct through switch',async()=>{
 jar.push(cookie('sid','host','app.example.test','/'));await saveAdapter(adapter.domain,{...adapter,cookies:[...adapter.cookies,{name:'sid',domain:'app.example.test'}]});
 const a=await captureSession('A',1);await activateAnonymous(1);assert.equal(jar.some(c=>c.name==='sid'),false);await restoreSession(a.id,1);
 assert.equal(jar.find(c=>c.name==='sid'&&c.hostOnly).value,'host');assert.ok(jar.find(c=>c.name==='sid'&&!c.hostOnly));
});
