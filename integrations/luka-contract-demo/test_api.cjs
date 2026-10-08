const {test}=require("node:test");
const assert=require("node:assert/strict");
const {EventEmitter,once}=require("node:events");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {validateLayout,startDemoControl}=require("../../desktop-cn/demo-control.cjs");
const layouts=fs.readdirSync(path.join(__dirname,"layouts")).filter(n=>n.endsWith(".json"));
test("all 18 layouts use supported read-only panels",()=>{
 assert.equal(layouts.length,18);
 for(const name of layouts){
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,"layouts",name)));
  validateLayout({name,data});
 }
});
test("user scripts, command panels and duplicate IDs are rejected",()=>{
 const valid=JSON.parse(fs.readFileSync(path.join(__dirname,"layouts","imu_axes.json")));
 assert.throws(()=>validateLayout({name:"x",data:{...valid,userNodes:{x:{source:"bad"}}}}));
 assert.throws(()=>validateLayout({name:"x",data:{...valid,configById:{"Publish!x":{}},layout:"Publish!x"}}));
 const id=Object.keys(valid.configById)[0];
 assert.throws(()=>validateLayout({name:"x",data:{...valid,layout:{direction:"row",first:id,second:id}}}));
});
test("HTTP API enforces authentication, origins and fixed visualization routes",async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"foxglove-cn-api-test-"));
 const app=new EventEmitter();
 app.getPath=()=>tmp;
 const window={isDestroyed:()=>false,show:()=>{},webContents:{setBackgroundThrottling:()=>{},
  executeJavaScript:async()=>({data:{layout:"RawMessages!test",configById:{"RawMessages!test":{}}}}),
  capturePage:async()=>({toPNG:()=>Buffer.from("test-png")})}};
 const server=startDemoControl({app,getWindow:()=>window,port:0});
 try{
  await once(server,"listening");
  assert.equal(server.address().address,"127.0.0.1");
  const config=JSON.parse(fs.readFileSync(path.join(tmp,"demo-control.json")));
  const url="http://127.0.0.1:"+server.address().port;
  const headers={Authorization:"Bearer "+config.token,"Content-Type":"application/json"};
  assert.equal((await fetch(url+"/status")).status,401);
  assert.equal((await fetch(url+"/status",{headers:{...headers,Origin:"http://evil.invalid"}})).status,401);
  assert.equal((await fetch(url+"/status",{headers})).status,200);
  assert.equal((await fetch(url+"/publish",{method:"POST",headers,body:"{}"})).status,404);
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,"layouts","camera.json")));
  assert.equal((await fetch(url+"/layout",{method:"POST",headers,body:JSON.stringify({name:"camera",data})})).status,200);
  assert.equal(fs.readdirSync(path.join(tmp,"demo-layout-backups")).length,1);
  assert.equal((await fetch(url+"/connect",{method:"POST",headers,body:JSON.stringify({url:"file:///x"})})).status,400);
  assert.equal((await fetch(url+"/screenshot",{headers})).headers.get("content-type"),"image/png");
 }finally{
  app.emit("before-quit");
  await once(server,"close");
  // Only this test's newly created directory within the OS temporary root.
  assert.equal(path.dirname(path.resolve(tmp)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(tmp).startsWith("foxglove-cn-api-test-"));
  fs.rmSync(tmp,{recursive:true});
 }
});