// MPL-2.0. Android target recognition and existing 104 following controllers.
import { FoxgloveClient } from '@foxglove/ws-protocol';
import { parse } from '@foxglove/rosmsg';
import { MessageReader, MessageWriter } from '@foxglove/rosmsg2-serialization';
FoxgloveClient.SUPPORTED_SUBPROTOCOL='foxglove.sdk.v1';
const ui=Object.fromEntries([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
const CONTROL='/vision/demo/control',STATUS='/vision/demo/status',MOBILE='/vision/mobile/control',DETECTIONS='/vision/mobile/detections',PERSON='/vision/person_follow/control',BODY='/vision/body_tracking/status',KCF='/omnifleet_vision/kcf/status',RGB='/camera/color/image_raw/compressed';
const titles={color:'颜色识别与跟随',shape:'形状识别与跟随',codes:'二维码识别与跟随',human:'人体识别与跟随'};
const labels={red:'红色',green:'绿色',blue:'蓝色',yellow:'黄色',rectangle:'矩形',circle:'圆形',triangle:'三角形'};
const channels=new Map(),subscriptions=new Map(),publishers=new Map(),services=new Map(),calls=new Map();
let client,socket,connected=false,closed=false,callId=0,revision=0,mode='color',runningCase,runningPhase,runningRequest,preparation,editingDistance=false;
let context,cleanup,picker,canvas,preview,detections=[],detectedFrame,detectedAt=0,frameSize=[640,480],selectedLabel='',motion=false,lockedTrack;
const report=error=>{ui.feedback.textContent=error.message||String(error);};
const caseId=()=>mode==='human'?'04_09_body_tracking':'02_07_kcf';
const serviceName=()=>mode==='human'?'/body_tracking_104/horizon_tracking_RobotCmdVel/set_parameters':'/kcf_follower/set_parameters';
const definitions=schema=>parse(schema,{ros2:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function subscribe(){
 const wanted=new Set([RGB,STATUS,DETECTIONS,...(mode==='human'?[BODY]:[KCF])]);
 for(const[id,item]of subscriptions)if(!wanted.has(item.topic)){client.unsubscribe(id);subscriptions.delete(id);}
 for(const channel of channels.values())if(wanted.has(channel.topic)&&![...subscriptions.values()].some(item=>item.topic===channel.topic))subscriptions.set(client.subscribe(channel.id),{...channel,reader:new MessageReader(definitions(channel.schema))});
}
function advertise(topic){publishers.set(topic,{id:client.advertise({topic,encoding:'cdr',schemaName:'std_msgs/msg/String',schema:'string data',schemaEncoding:'ros2msg'}),writer:new MessageWriter(definitions('string data'))});}
function publish(topic,request){if(!connected||!publishers.has(topic))throw Error('机器人尚未连接');const channel=publishers.get(topic);client.sendMessage(channel.id,channel.writer.writeMessage({data:JSON.stringify(request)}));}
function callService(name,request){return new Promise((resolve,reject)=>{
 const service=services.get(name);if(!connected||!service){reject(Error('控制器尚未就绪，请稍后重试'));return;}
 const id=++callId,data=new MessageWriter(definitions(service.request.schema)).writeMessage(request);
 const timer=setTimeout(()=>{calls.delete(id);reject(Error('机器人响应超时'));},15000);
 calls.set(id,{resolve,reject,timer,reader:new MessageReader(definitions(service.response.schema))});
 client.sendServiceCallRequest({serviceId:service.id,callId:id,encoding:'cdr',data:new DataView(data.buffer,data.byteOffset,data.byteLength)});
});}
async function prepareCase(force=false){
 const expectedRevision=revision;
 if(!force&&runningCase===caseId()&&runningPhase==='RUNNING')return;
 if(preparation){try{await preparation;}catch{}if(expectedRevision!==revision)throw Error('已切换跟随对象');return prepareCase(force);}
 const selected=mode,requestId=crypto.randomUUID();
 preparation=(async()=>{
  publish(CONTROL,{id:requestId,op:'start',case_id:caseId(),parameters:{enable_motion:'false'}});ui.feedback.textContent='正在准备识别…';
  const until=Date.now()+60000;
  while(Date.now()<until){if(mode!==selected||expectedRevision!==revision)throw Error('已切换跟随对象');if(runningRequest===requestId&&runningCase===caseId()&&runningPhase==='RUNNING')return;await delay(400);}
  throw Error('识别启动超时，请重新选择');
 })();try{await preparation;}finally{preparation=undefined;}
}
async function parameter(name,value,prepare=true){
 const current=revision,selected=mode;if(prepare)await prepareCase();if(current!==revision||selected!==mode)return;
 const service=serviceName(),until=Date.now()+15000;
 while(!services.has(service)&&connected&&Date.now()<until)await delay(300);
 if(current!==revision||selected!==mode)return;
 const entry={type:typeof value==='boolean'?1:3,bool_value:typeof value==='boolean'?value:false,integer_value:0,double_value:typeof value==='number'?value:0,string_value:'',byte_array_value:[],bool_array_value:[],integer_array_value:[],double_array_value:[],string_array_value:[]};
 const reply=await callService(service,{parameters:[{name,value:entry}]});
 if(!reply.results?.length||reply.results.some(item=>!item.successful))throw Error(reply.results?.map(item=>item.reason).join('; ')||'控制器未接受参数');
 ui.feedback.textContent=name==='enable_motion'?(value?'底盘跟随已开启':'底盘跟随已关闭'):`跟随距离已设为 ${value.toFixed(2)} m`;
}
function draw(){
 if(!canvas)return;const pen=canvas.getContext('2d');pen.clearRect(0,0,canvas.width,canvas.height);if(Date.now()-detectedAt>1500)return;
 const sx=canvas.width/frameSize[0],sy=canvas.height/frameSize[1];pen.font='15px sans-serif';pen.lineWidth=2;
 for(const item of [...detections,...(lockedTrack?[lockedTrack]:[])]){const[x,y,w,h]=item.bbox,text=labels[item.label]||item.label;pen.strokeStyle=item.selected?'#79d6aa':'#b19aef';pen.strokeRect(x*sx,y*sy,w*sx,h*sy);
 const caption=text+(item.text?' '+item.text:''),ty=Math.max(18,y*sy-5),width=pen.measureText(caption).width;pen.fillStyle='#15151add';pen.fillRect(x*sx,ty-17,width+8,22);pen.fillStyle=pen.strokeStyle;pen.fillText(caption,x*sx+4,ty);}
}
function mount(){
 cleanup?.();detections=[];detectedAt=0;selectedLabel='';lockedTrack=undefined;
 context={initialState:{caseId:caseId()},panelElement:ui.panel,watch(){},subscribe(){},advertise(){},unadvertise(){},publish(){},callService};
 const dispose=window.FoxgloveVision.initKcfPanel(context);picker=ui.panel.querySelector('[data-ui=kcfPicker]');ui.stage.replaceChildren(picker);canvas=picker.querySelector('[data-ui=kcfCanvas]');preview=picker.querySelector('[data-ui=kcfPreview]');canvas.style.pointerEvents='auto';
 const resize=()=>{const ratio=(preview.naturalWidth||640)/(preview.naturalHeight||480),width=Math.min(ui.stage.clientWidth,ui.stage.clientHeight*ratio);picker.style.width=width+'px';picker.style.height=width/ratio+'px';};
 const observer=new ResizeObserver(resize);observer.observe(ui.stage);const frame=()=>{resize();draw();};preview.addEventListener('rgb-frame',frame);
 let down;canvas.onpointerdown=event=>{down=[event.clientX,event.clientY];canvas.setPointerCapture(event.pointerId);};canvas.onpointermove=()=>{};canvas.onpointercancel=()=>{down=undefined;};
 canvas.onpointerup=event=>{
  if(!down)return;const start=down;down=undefined;if(Math.hypot(start[0]-event.clientX,start[1]-event.clientY)>8||Date.now()-detectedAt>1500)return;
  const box=canvas.getBoundingClientRect(),x=(event.clientX-box.x)*frameSize[0]/box.width,y=(event.clientY-box.y)*frameSize[1]/box.height;
  const hits=detections.filter(item=>x>=item.bbox[0]&&y>=item.bbox[1]&&x<=item.bbox[0]+item.bbox[2]&&y<=item.bbox[1]+item.bbox[3]).sort((a,b)=>a.bbox[2]*a.bbox[3]-b.bbox[2]*b.bbox[3]);
  if(!hits.length){report('请点击画面中的识别框');return;}const target=hits[0];
  try{if(mode==='human')publish(PERSON,{op:'lock',track_id:target.track_id});else publish(MOBILE,{id:crypto.randomUUID(),op:'select',frame_id:detectedFrame,index:target.index});ui.feedback.textContent='已提交目标绑定，等待机器人确认…';}catch(error){report(error);}
 };
 cleanup=()=>{observer.disconnect();preview.removeEventListener('rgb-frame',frame);dispose();ui.stage.replaceChildren();};resize();if(connected)subscribe();
}
async function selectMode(value){
 const previous=mode,current=++revision;
 if(motion&&previous!==value){try{await parameter('enable_motion',false,false);}catch(error){report(error);return;}}
 if(current!==revision)return;mode=value;editingDistance=false;mount();ui.targetName.textContent=titles[mode];
 document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.mode===mode)));ui.targetOptions.hidden=true;ui.targetToggle.setAttribute('aria-expanded','false');
 try{publish(MOBILE,{op:'mode',mode:mode==='human'?'off':mode});await prepareCase(true);if(current!==revision)return;ui.feedback.textContent=mode==='human'?'点击人物框或竖起大拇指绑定':'点击识别框绑定跟随目标';}catch(error){if(current===revision)report(error);}
}
const RADIO_BRIDGE='ws://192.168.144.108:8765',WIFI_BRIDGE='ws://192.168.3.104:8765';let selectedBridge;
async function connect(){
 const requested=new URLSearchParams(location.search).get('bridge')||RADIO_BRIDGE;
 if(!selectedBridge&&requested===RADIO_BRIDGE)await new Promise(resolve=>{const probe=new WebSocket(WIFI_BRIDGE,'foxglove.sdk.v1');let settled=false;const finish=url=>{if(settled)return;settled=true;clearTimeout(timer);probe.onopen=probe.onerror=probe.onclose=null;probe.close();selectedBridge=url;resolve();};const timer=setTimeout(()=>finish(RADIO_BRIDGE),800);probe.onopen=()=>finish(WIFI_BRIDGE);probe.onerror=probe.onclose=()=>finish(RADIO_BRIDGE);});
 if(closed)return;channels.clear();subscriptions.clear();publishers.clear();services.clear();socket=new WebSocket(selectedBridge||requested,'foxglove.sdk.v1');client=new FoxgloveClient({ws:socket});
 client.on('open',()=>{connected=true;[CONTROL,MOBILE,PERSON].forEach(advertise);ui.feedback.textContent='已连接，正在准备识别…';selectMode(mode);});
 client.on('advertise',items=>{items.forEach(item=>channels.set(item.id,item));subscribe();});
 client.on('unadvertise',ids=>{for(const id of ids){channels.delete(id);for(const[sub,item]of subscriptions)if(item.id===id)subscriptions.delete(sub);}});
 client.on('advertiseServices',items=>items.forEach(item=>services.set(item.name,item)));
 client.on('unadvertiseServices',ids=>{for(const[name,item]of services)if(ids.includes(item.id))services.delete(name);});
 client.on('serviceCallResponse',reply=>{const call=calls.get(reply.callId);if(!call)return;clearTimeout(call.timer);calls.delete(reply.callId);try{call.resolve(call.reader.readMessage(reply.data));}catch(error){call.reject(error);}});
 client.on('message',event=>{try{
  const channel=subscriptions.get(event.subscriptionId);if(!channel)return;const message=channel.reader.readMessage(event.data);
  if(channel.topic===RGB){window.FoxgloveVision.updateRgb(message);return;}const state=JSON.parse(message.data);
  if(channel.topic===STATUS){runningCase=state.case_id;runningPhase=state.phase;runningRequest=state.request_id;if(state.phase==='ERROR')report(state.message);return;}
  if(channel.topic===DETECTIONS){if(state.error){report(state.error);return;}if(state.selection){selectedLabel=(labels[state.selection.label]||state.selection.label)+(state.selection.text?' '+state.selection.text:'');ui.feedback.textContent='已交给跟踪器：'+selectedLabel;return;}if(state.mode!==mode)return;detections=state.detections.map((item,index)=>({...item,index}));detectedFrame=state.frame_id;detectedAt=Date.now();frameSize=[state.width,state.height];draw();return;}
  const distance=mode==='human'?state.body_tracking?.target_distance_m??state.follow_distance_m:state.target_distance_m;motion=mode==='human'?state.body_tracking?.motion_enabled===true:state.enable_motion===true;
  if(!editingDistance&&Number.isFinite(distance))ui.distanceSlider.value=ui.distanceValue.value=distance;
  if(channel.topic===BODY&&mode==='human'){frameSize=state.rgb_resolution||[640,480];detectedAt=Date.now();detections=(state.tracks||[]).map(item=>({...item,track_id:item.id??item.track_id,label:'人体 ID '+(item.id??item.track_id),bbox:[item.bbox[0],item.bbox[1],item.bbox[2]-item.bbox[0],item.bbox[3]-item.bbox[1]],selected:(item.id??item.track_id)===state.track_id}));if(state.track_id!=null)ui.feedback.textContent=`已绑定人物 ID ${state.track_id} · ${motion?'底盘已开启':'底盘已关闭'}`;}
  if(channel.topic===KCF&&mode!=='human'){
   lockedTrack=state.tracks?.length&&selectedLabel?{bbox:state.tracks[0].bbox,label:selectedLabel,selected:true}:undefined;
   if(lockedTrack)ui.feedback.textContent=`已锁定 ${selectedLabel} · ${state.depth_m==null?'等待读取距离':Number(state.depth_m).toFixed(2)+' m'} · ${motion?'底盘已开启':'底盘已关闭'}`;
  }
  context.onRender?.({currentFrame:[{topic:channel.topic,message}]},()=>{});draw();
 }catch(error){report(error);}});
 client.on('status',status=>{if(status.level>0)report(status.message);});client.on('error',()=>report('连接机器人失败'));
 client.on('close',()=>{connected=false;report('连接中断，正在重连…');if(selectedBridge===WIFI_BRIDGE)selectedBridge=RADIO_BRIDGE;for(const call of calls.values()){clearTimeout(call.timer);call.reject(Error('连接已断开'));}calls.clear();if(!closed)setTimeout(connect,2000);});
}
ui.targetToggle.onclick=()=>{ui.targetOptions.hidden=!ui.targetOptions.hidden;ui.targetToggle.setAttribute('aria-expanded',String(!ui.targetOptions.hidden));};document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>selectMode(button.dataset.mode));
ui.enableFollow.onclick=()=>parameter('enable_motion',true).catch(report);ui.disableFollow.onclick=()=>{revision++;parameter('enable_motion',false,false).catch(report);};
const applyDistance=()=>{const value=Number(ui.distanceValue.value);if(!ui.distanceValue.value||!ui.distanceValue.validity.valid){report('请输入 0.2–3.5 m 的距离');return;}parameter(mode==='human'?'follow_distance':'target_distance',value).then(()=>editingDistance=false).catch(report);};
ui.distanceSlider.oninput=()=>{editingDistance=true;ui.distanceValue.value=ui.distanceSlider.value;};ui.distanceSlider.onchange=applyDistance;ui.distanceValue.oninput=()=>{editingDistance=true;ui.distanceSlider.value=ui.distanceValue.value;};ui.distanceValue.onchange=applyDistance;ui.distanceValue.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();ui.distanceValue.blur();}};
window.addEventListener('pagehide',()=>{closed=true;socket?.close();});mount();connect();
