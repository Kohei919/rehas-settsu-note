/* リハスワーク摂津 キャリア伴走ノート ── 独立アプリ用の接続層（Firebase Authentication + Cloud Firestore） */
(function(){
"use strict";
const CFG=window.APP_CONFIG||{};
const DOMAIN=CFG.loginDomain||'rehas-settsu.app';
const toEmail=id=>{id=String(id||'').trim();return id.includes('@')?id:id.toLowerCase()+'@'+DOMAIN};
let resolveReady;const ready=new Promise(r=>resolveReady=r);
let app,auth,db;
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
/* ---- ログイン画面 ---- */
const css=`#cnLogin{position:fixed;inset:0;z-index:5000;background:#f6f4ef;display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Zen Kaku Gothic New","Hiragino Sans","Yu Gothic",sans-serif;color:#1d2730}
#cnLogin .box{width:min(420px,100%);background:#fff;border:1px solid #d9d5cc;border-radius:12px;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,.08)}
#cnLogin .hd{background:#1d2730;color:#fff;padding:22px 24px;display:flex;gap:14px;align-items:center;position:relative}
#cnLogin .hd:after{content:"";position:absolute;left:0;bottom:0;height:5px;width:160px;background:linear-gradient(90deg,#4a9a93 0 25%,#5e9455 25% 50%,#e2ae2c 50% 75%,#cd6466 75%)}
#cnLogin .hd img{width:48px;height:48px;background:#fff;border-radius:50%;padding:4px}
#cnLogin .hd small{display:block;font-size:.66rem;letter-spacing:.26em;color:#9fd0ca;font-family:Jost,sans-serif}
#cnLogin .hd b{font-size:1.15rem;letter-spacing:.06em}
#cnLogin form{padding:22px 24px;display:flex;flex-direction:column;gap:14px}
#cnLogin label{display:flex;flex-direction:column;gap:6px;font-size:.9rem;color:#55606a}
#cnLogin input,#cnLogin select{font:inherit;font-size:1.05rem;padding:12px;border:1px solid #d9d5cc;border-radius:8px;background:#f6f4ef;color:#1d2730}
#cnLogin button{font:inherit;font-size:1.05rem;font-weight:700;padding:13px;border-radius:8px;border:0;background:#2f7f78;color:#fff;cursor:pointer}
#cnLogin button.sub{background:transparent;color:#2f7f78;font-weight:500;padding:6px}
#cnLogin .err{color:#a3302b;font-size:.88rem;min-height:1.2em}
#cnLogin .note{font-size:.8rem;color:#55606a;line-height:1.6}`;
function shell(inner){let el=document.getElementById('cnLogin');if(!el){const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);el=document.createElement('div');el.id='cnLogin';document.body.appendChild(el)}
  el.innerHTML=`<div class="box"><div class="hd"><img src="icon-192.png" alt=""><div><small>REHAS WORK SETTSU</small><b>キャリア伴走ノート</b></div></div>${inner}</div>`;return el}
function hide(){const el=document.getElementById('cnLogin');if(el)el.remove()}
function showLogin(msg){const el=shell(`<form id="lf"><label>ログインID<input name="id" autocomplete="username" required autocapitalize="off" placeholder="れい：u005 / ito"></label><label>パスワード<input name="pw" type="password" autocomplete="current-password" required></label><div class="err">${esc(msg||'')}</div><button type="submit">ログイン</button><p class="note">ログインIDとパスワードは、事業所からお渡ししたものを入れてください。わからないときはスタッフに聞いてください。</p></form>`);
  el.querySelector('#lf').onsubmit=async e=>{e.preventDefault();const f=e.target;f.querySelector('button').disabled=true;
    try{await auth.signInWithEmailAndPassword(toEmail(f.id.value),f.pw.value)}catch(err){showLogin(err&&(err.code==='auth/invalid-credential'||err.code==='auth/wrong-password'||err.code==='auth/user-not-found'||err.code==='auth/invalid-login-credentials')?'IDかパスワードがちがいます':'ログインできませんでした（'+(err.code||err.message)+'）')}}}
function showBootstrap(msg){const el=shell(`<form id="bf"><p class="note"><b>はじめての設定</b><br>まだ管理者がいません。最初の管理者アカウントを作成します（この画面は最初の1回だけ表示されます）。</p><label>名前<input name="name" required placeholder="れい：松本"></label><label>ログインID（半角英数字）<input name="id" required pattern="[A-Za-z0-9._-]{2,40}" autocapitalize="off" placeholder="れい：matsumoto"></label><label>パスワード（8文字以上）<input name="pw" type="password" minlength="8" required autocomplete="new-password"></label><div class="err">${esc(msg||'')}</div><button type="submit">管理者を作成してはじめる</button></form>`);
  el.querySelector('#bf').onsubmit=async e=>{e.preventDefault();const f=e.target;f.querySelector('button').disabled=true;
    try{window.__bootstrapping=true;const c=await auth.createUserWithEmailAndPassword(toEmail(f.id.value),f.pw.value);const uid=c.user.uid,now=new Date().toISOString();const b=db.batch();
      b.set(db.doc('accounts/'+uid),{role:'admin',name:f.name.value.trim(),loginId:f.id.value.trim().toLowerCase(),active:true,createdAt:now});b.set(db.doc('meta/bootstrap'),{by:uid,at:now});await b.commit();window.__bootstrapping=false;await start(c.user)}
    catch(err){window.__bootstrapping=false;showBootstrap('作成できませんでした（'+(err.code||err.message)+'）')}}}
/* ---- 認証後 ---- */
async function start(user){let a;try{const s=await db.doc('accounts/'+user.uid).get();a=s.exists?s.data():null}catch(e){a=null}
  if(!a||a.active===false){await auth.signOut();showLogin(a?'このアカウントは利用停止中です。事業所に連絡してください':'アカウントが見つかりません。事業所に連絡してください');return}
  window.__AUTH={uid:user.uid,role:a.role,name:a.name||'',memberId:a.memberId||'',loginId:a.loginId||'',
    logout:async()=>{try{await auth.signOut()}finally{location.reload()}},
    createAccount:createAccount,changePassword:changePassword,toEmail};
  try{db.collection('accounts').doc(user.uid).set({lastLogin:new Date().toISOString()},{merge:true})}catch(e){}
  hide();resolveReady()}
async function createAccount({loginId,password,role,name,memberId}){if(!window.__AUTH||window.__AUTH.role!=='admin')throw {code:'not_admin'};
  const sec=firebase.apps.find(x=>x.name==='creator')||firebase.initializeApp(CFG.firebase,'creator');const sa=sec.auth();
  if(CFG.emulator)sa.useEmulator('http://'+CFG.emulator.auth);
  const c=await sa.createUserWithEmailAndPassword(toEmail(loginId),password);const uid=c.user.uid;await sa.signOut();
  await db.doc('accounts/'+uid).set({role,name:name||'',memberId:memberId||'',loginId:String(loginId).toLowerCase(),active:true,createdAt:new Date().toISOString(),createdBy:window.__AUTH.uid});return uid}
async function changePassword(cur,next){const u=auth.currentUser;const cred=firebase.auth.EmailAuthProvider.credential(u.email,cur);await u.reauthenticateWithCredential(cred);await u.updatePassword(next)}
/* ---- claude.use 互換 ---- */
function download(){return {save:async({filename,data})=>{const blob=data instanceof Blob?data:new Blob([data],{type:'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},2000)}}}
function userNs(){const A=window.__AUTH;return {id:async()=>A.uid,me:async()=>({id:A.uid,name:A.name}),isOwner:()=>A.role==='admin',canEdit:()=>A.role==='admin',can:()=>A.role!=='user',profiles:async ids=>Object.fromEntries((ids||[]).map(i=>[i,{id:i,name:''}]))}}
window.claude={use:async name=>{await ready;if(name==='db')return db;if(name==='downloads')return download();if(name==='user')return userNs();return null}};
/* ---- 起動 ---- */
function boot(){if(!window.firebase||!CFG.firebase||!CFG.firebase.apiKey){shell('<form><p class="note"><b>設定がまだです</b><br>config.js に Firebase の設定（firebaseConfig）を入れてください。導入手順書をご覧ください。</p></form>');return}
  app=firebase.initializeApp(CFG.firebase);auth=firebase.auth();db=firebase.firestore();
  db.settings({ignoreUndefinedProperties:true});
  if(CFG.emulator){auth.useEmulator('http://'+CFG.emulator.auth);const [h,p]=CFG.emulator.firestore.split(':');db.useEmulator(h,+p)}
  else{try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){}}
  firebase.firestore.DocumentReference.prototype.update=function(d){return this.set(d,{merge:true})};
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
  let starting=false;auth.onAuthStateChanged(async u=>{
    if(u){if(window.__bootstrapping||window.__AUTH||starting)return;starting=true;try{await start(u)}finally{starting=false}return}
    if(window.__AUTH){location.reload();return}
    try{const b=await db.doc('meta/bootstrap').get();if(!b.exists){showBootstrap();return}}catch(e){}
    showLogin()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
if('serviceWorker' in navigator&&!CFG.emulator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
