// Browser-test fixture only. The build excludes this directory.
(() => {
  let callback;
  const store = 'fcc-supabase-auth-v1';
  const state = window.mockState = { calls: [], member: null, failLogin: false };
  const session = () => JSON.parse(localStorage.getItem(store) || 'null');
  const emit = (event, value) => callback?.(event,value);
  window.mockAuthEvent = emit;
  const query = table => {
    const q = { select(){return q;},eq(){return q;},limit(){return q;},single(){return q;},maybeSingle(){return q;},
      then(resolve,reject){
        const data = table === 'household_memberships' ? state.member : table === 'households' ? {id:'home-a',name:'Our household',currency:'EUR'} : [];
        return Promise.resolve({data,error:null}).then(resolve,reject);
      }
    }; return q;
  };
  const client = {
    auth: {
      onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){}}}};},
      async getSession(){return {data:{session:session()},error:null};},
      async getUser(){return {data:{user:session()?.user},error:null};},
      async signInWithPassword(args){
        state.calls.push(['login',args.email]);
        if(state.failLogin) return {error:{message:'Invalid login credentials'}};
        const next={user:{id:'user-a',email:args.email}};
        localStorage.setItem(store,JSON.stringify(next));emit('SIGNED_IN',next);return {data:{session:next}};
      },
      async signUp(args){state.calls.push(['signup',args.email]);return {data:{session:null}};},
      async resetPasswordForEmail(email,options){state.calls.push(['forgot',email,options.redirectTo]);return {};},
      async updateUser(){state.calls.push(['reset']);return {};},
      async signOut(){localStorage.removeItem(store);state.member=null;emit('SIGNED_OUT',null);return {};}
    },
    from:query,
    async rpc(name,args){
      state.calls.push([name,args]);
      if(name==='create_household') {state.member={household_id:'home-a',user_id:'user-a',role:'owner'};return {data:{id:'home-a'}};}
      if(name==='create_household_invitation') return {data:[{invitation_id:'invite-a',invitation_token:'a'.repeat(64),expires_at:'2030-01-01T00:00:00Z'}]};
      if(name==='accept_household_invitation') return {error:{message:'Invitation was issued to a different email address'}};
      if(name==='list_household_invitations') return {data:[{invitation_id:'invite-a',invited_email:'member@example.com',role:'member',status:'pending',expires_at:'2030-01-01T00:00:00Z'}]};
      return {data:true};
    }
  };
  window.supabase={createClient(_url,_key,options){state.options=options;return client;}};
})();
