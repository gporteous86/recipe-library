const {test} = require('node:test');
const assert = require('node:assert/strict');
const RecipeAPI = require('../cloudflare-client.js');
function setup(responses) {
 const values = new Map(); const calls=[];
 const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const api=new RecipeAPI('https://api.example',storage,async(url,options)=>{calls.push({url,...options});const [status,data]=responses.shift();return new Response(JSON.stringify(data),{status})});
 return {api,calls,values};
}
test('login then household scoped recipe and planner requests match Worker contracts',async()=>{
 const {api,calls}=setup([[200,{token:'test-session',user:{id:'test-user'}}],[200,{recipes:[]}],[200,{ok:true}]]);
 await api.login('/auth/login','test@example.com','test-password');api.householdId='test-household';
 await api.request('/recipes');await api.request('/meal-plan/2',{method:'PUT',body:{recipe_id:null,custom_meal:'Leftovers'}});
 assert.equal(calls[1].headers.Authorization,'Bearer test-session');assert.equal(calls[1].headers['X-Household-Id'],'test-household');
 assert.equal(calls[2].method,'PUT');assert.deepEqual(JSON.parse(calls[2].body),{recipe_id:null,custom_meal:'Leftovers'});
 assert.ok(calls.every(c=>!c.url.includes('test-session')));
});
test('expired session is removed and preserves server error',async()=>{
 const {api,values}=setup([[401,{error:'Sign in required'}]]);api.token='expired';
 await assert.rejects(api.request('/recipes'),{message:'Sign in required',status:401});assert.equal(api.hasSession(),false);assert.equal(values.size,0);
});
test('failed write reports failure instead of success',async()=>{
 const {api}=setup([[403,{error:'Recipe not in this household'}]]);
 await assert.rejects(api.request('/meal-plan/1',{method:'PUT',body:{recipe_id:'foreign'}}),{status:403});
});
