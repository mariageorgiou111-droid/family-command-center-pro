// Opt-in, read-only database checks using pre-created NON-PRODUCTION accounts.
// Auth requests issue/refresh test sessions; no household data is written.
import assert from 'node:assert/strict';
import { publicConfig } from '../scripts/build.mjs';
import { domains } from '../auth/domains.mjs';

if (process.env.FCC_TEST_NON_PRODUCTION !== 'yes') throw new Error('Set FCC_TEST_NON_PRODUCTION=yes only for an isolated test Supabase project. Never run against production.');
const {url,key}=publicConfig({SUPABASE_URL:process.env.FCC_TEST_SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY:process.env.FCC_TEST_SUPABASE_KEY});
const accounts=['OWNER','MEMBER','OUTSIDER'].map(role=>{
  const email=process.env[`FCC_TEST_${role}_EMAIL`],password=process.env[`FCC_TEST_${role}_PASSWORD`];
  if(!email||!password) throw new Error(`Set test credentials for ${role}.`);
  return {role,email,password};
});
const active=[];
async function request(path,token,options={}) {
  const response=await fetch(url+path,{...options,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`} : {}),'Content-Type':'application/json',...options.headers}});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=null;}
  return {response,data};
}
try {
  for(const account of accounts){
    const {response,data}=await request('/auth/v1/token?grant_type=password',null,{method:'POST',body:JSON.stringify({email:account.email,password:account.password})});
    assert.equal(response.status,200,`${account.role} login failed`);
    account.token=data.access_token;active.push(account);
    const verified=await request('/auth/v1/user',account.token);
    assert.equal(verified.response.status,200,`${account.role} session verification failed`);
    const member=await request('/rest/v1/household_memberships?select=household_id,user_id,role&user_id=eq.'+data.user.id,account.token);
    assert.equal(member.response.status,200);
    assert.equal(member.data.length,1,`${account.role} must already belong to a test household`);
    account.household=member.data[0].household_id;
    account.membership=member.data[0];
    const refreshed=await request('/auth/v1/token?grant_type=refresh_token',null,{method:'POST',body:JSON.stringify({refresh_token:data.refresh_token})});
    assert.equal(refreshed.response.status,200,'Refresh-token session persistence failed');
    account.token=refreshed.data.access_token;
  }
  const [owner,member,outsider]=accounts;
  assert.equal(owner.membership.role,'owner');
  assert.equal(member.membership.role,'member');
  assert.equal(owner.household,member.household);
  assert.notEqual(owner.household,outsider.household);
  const anonymous=await request('/rest/v1/households?select=id');
  assert.ok([401,403].includes(anonymous.response.status),'Anonymous table read should be denied');
  const anonymousRpc=await request('/rest/v1/rpc/create_household',null,{method:'POST',body:JSON.stringify({p_name:''})});
  assert.ok([401,403].includes(anonymousRpc.response.status),'Anonymous RPC should be denied');
  for(const account of accounts){
    const own=await request(`/rest/v1/households?select=id&id=eq.${account.household}`,account.token);
    assert.equal(own.response.status,200);assert.equal(own.data.length,1);
    const foreign=account===outsider?owner.household:outsider.household;
    for(const table of ['households','household_memberships',...domains.map(x=>x.table)]){
      const column=table==='households'?'id':'household_id';
      const cross=await request(`/rest/v1/${table}?select=*&${column}=eq.${foreign}`,account.token);
      assert.equal(cross.response.status,200,`${table} read failed`);
      assert.deepEqual(cross.data,[],`${table} leaked another household's records`);
    }
  }
  const forbidden=await request('/rest/v1/rpc/list_household_invitations',member.token,{method:'POST',body:JSON.stringify({p_household_id:owner.household})});
  assert.equal(forbidden.response.status,403,'Ordinary member must not list invitations');
  console.log('PASS: test account login, verified sessions, refresh, anonymous denial, membership roles, cross-household reads and invitation-list permissions. No household data written.');
} finally {
  for(const account of active) await request('/auth/v1/logout?scope=local',account.token,{method:'POST'}).catch(()=>{});
}
