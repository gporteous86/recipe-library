const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
let worker,decodeImage,parseScan;
const load=async()=>{if(worker)return;const source=fs.readFileSync('cloudflare/worker.js','utf8')+'\nexport {decodeImage,parseScan};';const mod=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));worker=mod.default;decodeImage=mod.decodeImage;parseScan=mod.parseScan;};
const jpeg=Buffer.from([255,216,255,224,0,1]).toString('base64');
function env(household='house-a') {
 let writes=0,reads=0;
 return {
  get writes(){return writes},get reads(){return reads},
  DB:{prepare(sql){return {bind(...args){return {async first(){
   if(sql.includes('FROM sessions'))return {id:'user-a',email:'test@example.com'};
   if(sql.includes('household_members'))return args[1]===household?{ok:1}:null;
   if(sql.includes('SELECT id FROM recipes'))return args[0]==='recipe-a'?{id:'recipe-a'}:null;
   return null;
  }}}}}},
  RECIPE_IMAGES:{async put(){writes++},async get(){reads++;return {body:new Uint8Array([255,216,255])}}}
 };
}
function request(path,{method='GET',body,household='house-a',auth=true}={}){return new Request('https://api.example'+path,{method,headers:{...(auth?{Authorization:'Bearer test'}:{}),'X-Household-Id':household,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
test('media validation rejects non-JPEG and malformed scan output',async()=>{await load();assert.throws(()=>decodeImage('abcd','text/html'));assert.throws(()=>decodeImage('abcd','image/jpeg'));assert.ok(decodeImage(jpeg,'image/jpeg').length);assert.throws(()=>parseScan('{"title":"test","ingredients":"bad"}'));const recipe=parseScan(JSON.stringify({title:'Cake',tags:[],ingredients:['Flour'],method:['Mix'],serves:null}));assert.equal(recipe.title,'Cake');assert.equal(recipe.serves,null);});
test('photo upload requires authentication and household membership',async()=>{await load();const e=env();assert.equal((await worker.fetch(request('/images',{method:'POST',auth:false,body:{}}),e)).status,401);assert.equal((await worker.fetch(request('/images',{method:'POST',household:'foreign',body:{}}),e)).status,403);assert.equal(e.writes,0);});
test('photo uploads cannot target a foreign recipe',async()=>{await load();const e=env();const res=await worker.fetch(request('/images',{method:'POST',body:{recipe_id:'foreign',image:jpeg,mimeType:'image/jpeg'}}),e);assert.equal(res.status,404);assert.equal(e.writes,0);});
test('valid photo is stored under household and recipe; cross-household reads denied',async()=>{await load();const e=env();const res=await worker.fetch(request('/images',{method:'POST',body:{recipe_id:'recipe-a',image:jpeg,mimeType:'image/jpeg'}}),e);assert.equal(res.status,201);assert.match((await res.json()).path,/^house-a\/recipe-a\/.+\.jpg$/);assert.equal(e.writes,1);assert.equal((await worker.fetch(request('/images/house-b/recipe-b/image.jpg'),e)).status,403);assert.equal(e.reads,0);assert.equal((await worker.fetch(request('/images/house-a/recipe-a/image.jpg'),e)).status,200);});
test('scan without provider secret is an explicit unavailable response',async()=>{await load();const res=await worker.fetch(request('/scan-recipe',{method:'POST',body:{images:[{image:jpeg,mimeType:'image/jpeg'}]}}),env());assert.equal(res.status,503);});
