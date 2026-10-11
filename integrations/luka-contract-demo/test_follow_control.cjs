const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../packages/studio-base/src/panels/LukaConsole/followControl.ts'),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject});
const valid={output_mode:'dry_run',follow_status:'FollowStatus TRACKING:id=42',diagnostic:'CANDIDATE',production_ready:true,live_verified:false,camera_fresh:true,mot_fresh:true,targets:[{track_id:42,confidence:.9}],owned_preview:true,error:''};
function caller(){const calls=[];return {calls,call:async(name,request)=>{calls.push({name,request});return {success:true};}};}

test('dry observation uses guarded observation service, never chassis enable',async()=>{
 const s=caller();await exportsObject.enableAlgorithm(s.call,valid,true,false);
 assert.deepEqual(JSON.parse(JSON.stringify(s.calls)),[{name:'/person_follow/gui/enable_observation',request:{}}]);
});
test('expired and unknown modes refuse without writes',async()=>{
 for(const [state,fresh] of [[valid,false],[{...valid,output_mode:'unknown'},true]]){
  const s=caller();await assert.rejects(exportsObject.enableAlgorithm(s.call,state,fresh,false));assert.equal(s.calls.length,0);
 }
});
test('live algorithm requires human input confirmation and backend verification',async()=>{
 const state={...valid,output_mode:'nav2_action',live_verified:true};
 for(const [v,ack] of [[state,false],[{...state,live_verified:false},true],[{...state,production_ready:false},true]]){
  const s=caller();await assert.rejects(exportsObject.enableAlgorithm(s.call,v,true,ack));assert.equal(s.calls.length,0);
 }
 const s=caller();await exportsObject.enableAlgorithm(s.call,state,true,true);assert.equal(s.calls[0].name,'/person_follow/enable_follow');
});
test('chassis cannot be enabled from dry-run, stale, blocked or non-tracking',async()=>{
 const state={...valid,output_mode:'nav2_action',live_verified:true};
 for(const [v,fresh,ack] of [[valid,true,true],[state,false,true],[state,true,false],[{...state,diagnostic:'BLOCKED stale TF'},true,true],[{...state,follow_status:'LOST'},true,true]]){
  const s=caller();await assert.rejects(exportsObject.enableBase(s.call,v,fresh,ack));assert.equal(s.calls.length,0);
 }
 const s=caller();await exportsObject.enableBase(s.call,state,true,true);assert.equal(s.calls[0].name,'/nx/follow_enable');
});
test('service failure remains visible and does not chain a motion request',async()=>{
 await assert.rejects(exportsObject.checkedService(async()=>({success:false,message:'gate refused'}),'/person_follow/gui/start_preview'),/gate refused/);
});
test('malformed status cannot become a permissive snapshot',()=>{
 assert.equal(exportsObject.parseSnapshot(JSON.stringify(valid)).output_mode,'dry_run');
 for(const patch of [{live_verified:'false'},{output_mode:'remote_script'},{targets:[{track_id:'42',confidence:.9}]}]){
  assert.throws(()=>exportsObject.parseSnapshot(JSON.stringify({...valid,...patch})));
 }
});
