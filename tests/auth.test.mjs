import test from 'node:test';
import assert from 'node:assert/strict';
import { HouseholdService, routeFor, takeInvitation } from '../auth/service.mjs';
import { domains } from '../auth/domains.mjs';
import { publicConfig } from '../scripts/build.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function fixture() {
  const calls = [];
  let result = { data: [], error: null };
  const query = new Proxy({}, { get(_, method) {
    if (method === 'then') return (resolve,reject) => Promise.resolve(result).then(resolve,reject);
    return (...args) => { calls.push([method,...args]); return query; };
  } });
  const client = {
    auth: { getUser: async()=>({data:{user:{id:'user-a'}}}) },
    from: table => {calls.push(['from',table]); return query;},
    rpc: async(name,args)=>{calls.push(['rpc',name,args]);return result;}
  };
  const service = new HouseholdService(client);
  return {service,calls,client,setResult:value=>{result=value;}};
}
test('routes deny protected views to signed-out users and require household membership',()=>{
  for(const route of ['household','onboarding','reset','garbage']) assert.equal(routeFor(route,null,null),'login');
  assert.equal(routeFor('signup',null,null),'signup');
  assert.equal(routeFor('household',{},null),'onboarding');
  assert.equal(routeFor('login',{},{}),'household');
  assert.equal(routeFor('reset',{},{}),'reset');
});
test('invitation token is stripped from the URL and kept only in memory',()=>{
  const calls=[]; const token='a'.repeat(64);
  assert.equal(takeInvitation({hash:`#invite=${token}`,pathname:'/shared.html',search:''},{replaceState:(...args)=>calls.push(args)}),token);
  assert.equal(calls[0][2],'/shared.html#onboarding');
  assert.equal(takeInvitation({hash:'#invite=bad',pathname:'/shared.html',search:''},{replaceState(){}}),'');
});
test('membership is verified against the authenticated user and query result, never client metadata',async()=>{
  const f=fixture();
  f.setResult({data:{user_id:'user-a',household_id:'home-a',role:'member'}});
  await f.service.loadMembership('user-a');
  assert.equal(f.service.membership.household_id,'home-a');
  assert.ok(f.calls.some(x=>x[0]==='eq'&&x[1]==='user_id'&&x[2]==='user-a'));
  await assert.rejects(()=>f.service.loadMembership('user-b'),/sign in/);
  assert.equal(f.service.membership,null);
});
test('in-flight membership responses cannot restore access after logout',async()=>{
  const f=fixture(); let resolve;
  f.client.auth.getUser=()=>new Promise(r=>{resolve=r;});
  const pending=f.service.loadMembership('user-a');
  f.service.clear();
  f.setResult({data:{user_id:'user-a',household_id:'home-a',role:'owner'}});
  resolve({data:{user:{id:'user-a'}}}); await pending;
  assert.equal(f.service.membership,null);
});
test('signed-out users cannot read or mutate shared records',async()=>{
  const {service,calls}=fixture();
  await assert.rejects(()=>service.read(domains[0]),/membership/);
  await assert.rejects(()=>service.write(domains[0],{}),/membership/);
  await assert.rejects(()=>service.remove(domains[0],{id:'record'}),/membership/);
  assert.equal(calls.filter(x=>['select','update','insert','delete'].includes(x[0])).length,0);
});
test('reads and deletes are scoped to verified membership, ignoring record household IDs',async()=>{
  const f=fixture(); f.service.membership={household_id:'home-a',role:'member'};
  f.setResult({data:[{id:'one'}]});
  await f.service.read(domains[0]);
  await f.service.remove(domains[0],{id:'one',household_id:'home-b'});
  assert.equal(f.calls.filter(x=>x[0]==='eq'&&x[1]==='household_id'&&x[2]==='home-a').length,2);
  assert.ok(!f.calls.flat().includes('home-b'));
});
test('updates allowlist fields and cannot change tenant or audit columns',async()=>{
  const f=fixture(); f.service.membership={household_id:'home-a',role:'member'};
  f.setResult({data:[{id:'one'}]});
  await f.service.write(domains[0],{title:'Dinner',household_id:'home-b',created_by:'other',id:'other'},{id:'one'});
  const payload=f.calls.find(x=>x[0]==='update')[1];
  assert.equal(payload.title,'Dinner');
  for(const key of ['household_id','created_by','id']) assert.ok(!(key in payload));
  await f.service.write(domains[8],{category:'Changed',amount:10},{category:'Original'});
  assert.deepEqual(f.calls.filter(x=>x[0]==='update').at(-1)[1],{amount:10});
});
test('invitation roles are checked and acceptance uses the secure RPC',async()=>{
  const f=fixture(); f.service.membership={household_id:'home-a',role:'member'};
  assert.throws(()=>f.service.invite('a@example.com'),/admin/);
  assert.throws(()=>f.service.invitations(),/admin/);
  assert.throws(()=>f.service.revoke('invitation'),/admin/);
  assert.throws(()=>f.service.accept('bad'),/complete/);
  f.service.membership.role='owner';
  assert.throws(()=>f.service.invite('a@example.com','owner'),/Invalid/);
  await f.service.invite(' a@example.com ');
  await f.service.accept('a'.repeat(64));
  assert.equal(f.calls.at(-1)[1],'accept_household_invitation');
  assert.equal(f.calls[0][2].p_household_id,'home-a');
});
test('RLS errors and zero-row writes surface as failures',async()=>{
  const f=fixture();f.service.membership={household_id:'home-a'};
  f.setResult({error:new Error('RLS denied')});
  await assert.rejects(()=>f.service.read(domains[0]),/RLS denied/);
  f.setResult({data:[]});
  await assert.rejects(()=>f.service.write(domains[0],{},{id:'one'}),/No record saved/);
});
test('public configuration rejects missing config and secret/service-role keys',()=>{
  assert.throws(()=>publicConfig({}),/Set SUPABASE/);
  assert.throws(()=>publicConfig({SUPABASE_URL:'http://example.com',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}),/HTTPS/);
  for(const role of ['service_role','authenticated']){
    const key=`e30.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
    assert.throws(()=>publicConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:key}),/Only a publishable/);
  }
  assert.throws(()=>publicConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'}),/Only a publishable/);
  assert.equal(publicConfig({SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}).url,'https://test.supabase.co');
});
test('Phase 2A migration remains byte-for-byte identical to the reviewed schema',()=>{
  const bytes=readFileSync('supabase/migrations/202610090001_phase_2a_shared_households.sql');
  // Git normalizes CRLF to LF for this text file; Windows checkouts may use CRLF.\n  const normalized = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));\n  const hash=createHash('sha1').update(`blob ${normalized.length}\0`).update(normalized).digest('hex');
  assert.equal(hash,'f0af754ecddd7a27b30a58e4605766c5fd1bea6a');
});
test('new auth code never touches local application storage or uses HTML injection',()=>{
  const source=['app.mjs','service.mjs','domains.mjs'].map(p=>readFileSync(`auth/${p}`,'utf8')).join('\n');
  assert.doesNotMatch(source,/localStorage|sessionStorage|innerHTML|fccProData|\.clear\(\s*\)\s*;\s*localStorage/);
});
