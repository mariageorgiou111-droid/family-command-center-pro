// Real Chromium + a fake SDK: verifies UI, guards and browser persistence.
// This never contacts Supabase. Real RLS checks are separate and opt-in.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const server=createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://localhost').pathname;
    if(path==='/blank'){res.end('<!doctype html><title>Test</title>');return;}
    let content=await readFile(`.${path}`);
    if(path==='/shared.html') content=Buffer.from(content.toString().replace(/<script src="https:\/\/cdn[^>]+><\/script>/,'<script src="tests/mock-sdk.js"></script>'));
    if(path==='/auth/config.js') content=Buffer.from('window.FCC_AUTH_CONFIG={url:"https://test.supabase.co",key:"sb_publishable_test"};');
    res.setHeader('Content-Type',path.endsWith('.mjs')||path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
    res.end(content);
  }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp('/tmp/fcc-phase2b-browser-test-');
const chrome=spawn(process.env.CHROMIUM_PATH||'/usr/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
let socket;
try {
  const endpoint=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Chromium startup timed out')),15000);
    chrome.on('error',reject);
    chrome.stderr.on('data',chunk=>{const match=chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
    chrome.on('exit',code=>reject(new Error(`Chromium exited ${code}`)));
  });
  socket=new WebSocket(endpoint);await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
  let id=0;const pending=new Map();
  socket.addEventListener('message',({data})=>{const item=JSON.parse(data);if(item.id){const p=pending.get(item.id);pending.delete(item.id);item.error?p.reject(new Error(item.error.message)):p.resolve(item.result);}});
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const requestId=++id;pending.set(requestId,{resolve,reject});socket.send(JSON.stringify({id:requestId,method,params,...(sessionId?{sessionId}:{})}));});
  const {targetInfos}=await send('Target.getTargets');
  const {sessionId}=await send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  await command('Page.enable');await command('Runtime.enable');
  const evaluate=async(expression)=>{
    const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw new Error(result.exceptionDetails.text+JSON.stringify(result.exceptionDetails.exception));
    return result.result.value;
  };
  const wait=async(expression)=>{
    const until=Date.now()+10000;
    while(Date.now()<until){if(await evaluate(expression)) return;await new Promise(r=>setTimeout(r,50));}
    throw new Error(`Timed out: ${expression}\n${await evaluate('document.body.innerText')}`);
  };
  const navigate=async(path)=>{await command('Page.navigate',{url:origin+path});await wait('document.readyState === "complete"');};
  const click=label=>evaluate(`Array.from(document.querySelectorAll('button')).find(x=>x.textContent===${JSON.stringify(label)}).click()`);
  const submit=values=>evaluate(`(()=>{const form=document.querySelector('form');for(const [key,value] of Object.entries(${JSON.stringify(values)}))form.elements.namedItem(key).value=value;form.requestSubmit();})()`);
  await navigate('/blank');
  const sentinel=JSON.stringify({tasks:[{id:'local-one',t:'Keep my data'}],unknownFutureField:'preserve'});
  await evaluate(`localStorage.setItem('fccProDataV7_6_QA',${JSON.stringify(sentinel)});localStorage.setItem('fccFamilyName','Local family');`);
  await navigate('/shared.html#household');
  await wait('document.querySelector("h1")?.textContent === "Sign in"');
  assert.equal(await evaluate('document.querySelector("#app").textContent.includes("Add record")'),false);
  await evaluate('mockState.failLogin=true');
  await submit({email:'owner@example.com',password:'password123'});
  await wait('document.querySelector("#status").textContent.includes("Invalid login")');
  await evaluate('mockState.failLogin=false');
  await submit({email:'owner@example.com',password:'password123'});
  await wait('document.querySelector("h1")?.textContent.includes("Set up")');
  // A protected route cannot bypass missing membership.
  await evaluate('location.hash="household"');
  await wait('document.querySelector("h1")?.textContent.includes("Set up")');
  await submit({household:'Our household',currency:'EUR',date:'eu'});
  await wait('document.querySelector("#app").textContent.includes("Our household · owner")');
  await submit({'invite-email':'member@example.com',role:'member'});
  await wait('document.querySelector("output")?.textContent.includes("#invite=")');
  assert.equal(await evaluate('Object.values(localStorage).some(x=>x.includes("a".repeat(64)))'),false);
  await click('Hide invitation link');
  assert.equal(await evaluate('document.querySelector("output").textContent'),'');
  await click('List invitations');await wait('document.querySelector("#app").textContent.includes("member@example.com")');
  await click('Revoke');await wait('document.querySelector("#status").textContent.includes("revoked")');
  await click('Sign out');await wait('document.querySelector("h1")?.textContent === "Sign in"');
  assert.equal(await evaluate('localStorage.getItem("fcc-supabase-auth-v1")'),null);
  assert.equal(await evaluate('document.querySelector("#app").textContent.includes("Our household")'),false);
  // Confirmed signup, forgot-password and recovery UI paths.
  await evaluate('location.hash="signup"');await wait('document.querySelector("h1")?.textContent === "Create your account"');
  await submit({email:'new@example.com',password:'password123',confirm:'password123',name:'New member'});
  await wait('document.querySelector("#status").textContent.includes("Check your email")');
  await evaluate('location.hash="forgot"');await wait('document.querySelector("h1")?.textContent === "Reset your password"');
  await submit({email:'new@example.com'});await wait('document.querySelector("#status").textContent.includes("email will arrive")');
  await evaluate('location.hash="login"');await wait('document.querySelector("h1")?.textContent === "Sign in"');
  await submit({email:'owner@example.com',password:'password123'});await wait('document.querySelector("h1")?.textContent.includes("Set up")');
  await navigate('/shared.html#household');
  await wait('document.querySelector("h1")?.textContent.includes("Set up")');
  assert.equal(await evaluate('document.querySelector("#app").textContent.includes("owner@example.com")'),true);
  await evaluate('mockAuthEvent("PASSWORD_RECOVERY",JSON.parse(localStorage.getItem("fcc-supabase-auth-v1")))');
  await wait('document.querySelector("h1")?.textContent === "Choose a new password"');
  await submit({password:'newpassword123',confirm:'newpassword123'});
  await wait('document.querySelector("#status").textContent === "Password updated."');
  await click('Sign out');await wait('document.querySelector("h1")?.textContent === "Sign in"');
  await navigate('/shared.html#invite='+'b'.repeat(64));
  await wait('location.hash === "#onboarding"');
  await wait('document.querySelector("h1")?.textContent === "Sign in"');
  assert.equal(await evaluate('location.hash'),'#onboarding');
  await submit({email:'wrong@example.com',password:'password123'});
  await wait('document.querySelector("form input[name=invitation]")?.value.length === 64');
  await evaluate('document.querySelector("input[name=invitation]").form.requestSubmit()');
  await wait('document.querySelector("#status").textContent.includes("different email")');
  assert.equal(await evaluate('document.querySelector("#app").textContent.includes("Add record")'),false);
  await evaluate('mockAuthEvent("SIGNED_OUT",null)');
  await wait('document.querySelector("h1")?.textContent === "Sign in"');
  assert.equal(await evaluate('localStorage.getItem("fccProDataV7_6_QA")'),sentinel);
  assert.equal(await evaluate('localStorage.getItem("fccFamilyName")'),'Local family');
  console.log('PASS: Chromium auth forms, protected routes, onboarding, invite display/revocation, recovery, logout, reload persistence, auth-event clearing and local data preservation. SDK mocked; no live RLS claim.');
} finally {
  socket?.close();chrome.kill('SIGTERM');server.close();
  await new Promise(resolve=>chrome.exitCode !== null ? resolve() : chrome.once('exit',resolve));
  await rm(profile,{recursive:true,force:true});
}
