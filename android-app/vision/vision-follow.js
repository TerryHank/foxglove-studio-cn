// MPL-2.0. Receiver-LAN adapter for the school's existing Foxglove tracking panel.
import { FoxgloveClient } from '@foxglove/ws-protocol';
import { parse } from '@foxglove/rosmsg';
import { MessageReader, MessageWriter } from '@foxglove/rosmsg2-serialization';

FoxgloveClient.SUPPORTED_SUBPROTOCOL = 'foxglove.sdk.v1';
const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
if (new URLSearchParams(location.search).has('standalone')) ui.back.textContent = '退出';
const CONTROL = '/vision/demo/control', STATUS = '/vision/demo/status';
const RGB = '/camera/color/image_raw/compressed';
const bodyService = '/body_tracking_104/horizon_tracking_RobotCmdVel/set_parameters';
const channels = new Map(), subscriptions = new Map(), publishers = new Map(), services = new Map(), calls = new Map();
let client, socket, context, dispose, mode = ui.mode.value, connected = false, callId = 0, motion = false, closed = false;
const report = error => { ui.feedback.textContent = error.message || String(error); };
let runningCase, runningPhase, preparation, distanceEdited = false;
let controlRevision = 0;
function parameter(name, value) {
  return { name, value: { type: typeof value === 'boolean' ? 1 : 3, bool_value: typeof value === 'boolean' ? value : false, integer_value: 0, double_value: typeof value === 'number' ? value : 0, string_value: '', byte_array_value: [], bool_array_value: [], integer_array_value: [], double_array_value: [], string_array_value: [] } };
}
async function prepareCase() {
  if (runningCase === mode && runningPhase === 'RUNNING') return;
  if (preparation) return preparation;
  const selected = mode;
  preparation = (async () => {
    publish(CONTROL, {data:JSON.stringify({id:crypto.randomUUID(),op:'start',case_id:selected,parameters:{enable_motion:'false'}})});
    ui.feedback.textContent = '正在准备识别…';
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (mode !== selected) throw Error('跟随对象已切换');
      if (runningCase === selected && runningPhase === 'RUNNING') return;
      if (runningPhase === 'ERROR') throw Error('识别启动失败，请重新选择对象');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw Error('识别准备超时，请重试');
  })();
  try { await preparation; } finally { preparation = undefined; }
}
async function updateFollow(name, value, prepare = true) {
  const revision = controlRevision, selected = mode;
  if (prepare) await prepareCase();
  if (revision !== controlRevision || selected !== mode) return;
  const service = mode === '04_09_body_tracking' ? bodyService : '/kcf_follower/set_parameters';
  const deadline = Date.now() + 15000;
  while (!services.has(service) && connected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 300));
  if (revision !== controlRevision || selected !== mode) return;
  const reply = await callService(service, {parameters:[parameter(name, value)]});
  if (!reply.results?.length || reply.results.some(item => !item.successful)) throw Error(reply.results?.map(item => item.reason).join('; ') || '参数未接受');
  ui.feedback.textContent = name === 'enable_motion' ? (value ? '底盘跟随已开启' : '底盘跟随已关闭') : `跟随距离已设为 ${value.toFixed(2)} m`;
}
const definitions = schema => parse(schema, { ros2: true });
function subscribe() {
  const wanted = new Set([RGB, STATUS, ...(context?.topics || [])]);
  for (const [id, item] of subscriptions) if (!wanted.has(item.topic)) { client.unsubscribe(id); subscriptions.delete(id); }
  for (const channel of channels.values()) {
    if (wanted.has(channel.topic) && ![...subscriptions.values()].some(item => item.topic === channel.topic)) {
      subscriptions.set(client.subscribe(channel.id), { ...channel, reader: new MessageReader(definitions(channel.schema)) });
    }
  }
}
function advertise(topic, schemaName, schema) {
  if (!connected || publishers.has(topic)) return;
  publishers.set(topic, { id: client.advertise({ topic, encoding: 'cdr', schemaName, schema, schemaEncoding: 'ros2msg' }), writer: new MessageWriter(definitions(schema)) });
}
function publish(topic, message) {
  if (!connected) throw Error('104 数据连接已断开');
  const publisher = publishers.get(topic);
  if (!publisher) throw Error('话题尚未就绪：' + topic);
  client.sendMessage(publisher.id, publisher.writer.writeMessage(message));
}
function callService(name, request) {
  return new Promise((resolve, reject) => {
    const service = services.get(name);
    if (!connected || !service) { reject(Error('服务尚未就绪：' + name)); return; }
    const id = ++callId;
    const bytes = new MessageWriter(definitions(service.request.schema)).writeMessage(request);
    const timer = setTimeout(() => { calls.delete(id); reject(Error('104 服务响应超时')); }, 10000);
    calls.set(id, { resolve, reject, timer, reader: new MessageReader(definitions(service.response.schema)) });
    client.sendServiceCallRequest({ serviceId: service.id, callId: id, encoding: 'cdr', data: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) });
  });
}
function start(op) {
  publish(CONTROL, { data: JSON.stringify({ id: crypto.randomUUID(), op, case_id: mode, parameters: { enable_motion: mode === '04_09_body_tracking' ? 'false' : 'true' } }) });
  ui.status.textContent = '已提交，等待 104 确认…';
}
function setParameter(name, value) {
  return callService(bodyService, { parameters: [{ name, value: { type: typeof value === 'boolean' ? 1 : 3, bool_value: typeof value === 'boolean' ? value : false, integer_value: 0, double_value: typeof value === 'number' ? value : 0, string_value: '', byte_array_value: [], bool_array_value: [], integer_array_value: [], double_array_value: [], string_array_value: [] } }] }).then(reply => {
    if (!reply.results?.length || reply.results.some(result => !result.successful)) throw Error(reply.results?.map(result => result.reason).join('; ') || '参数未接受');
    ui.bodyState.textContent = '参数已接受，等待控制器读回…';
  }).catch(report);
}
function mount() {
  dispose?.();
  mode = ui.mode.value;
  ui.body.hidden = mode !== '04_09_body_tracking';
  context = { initialState: { caseId: mode }, panelElement: ui.panel, topics: [], watch() {},
    subscribe(topics) { this.topics = topics.map(item => item.topic); if (connected) subscribe(); },
    advertise(topic, schemaName) { advertise(topic, schemaName, schemaName === 'std_msgs/msg/String' ? 'string data' : 'uint32 x_offset\nuint32 y_offset\nuint32 height\nuint32 width\nbool do_rectify'); },
    unadvertise() {}, publish, callService };
  dispose = window.FoxgloveVision.initKcfPanel(context);
  const picker = ui.panel.querySelector('[data-ui=kcfPicker]');
  ui.stage.replaceChildren(picker);
  const instructions = ui.panel.querySelector('[data-ui=kcfControls] > p');
  const note = ui.panel.querySelector('[data-ui=kcfControls] > small');
  const details = document.createElement('details');
  details.innerHTML = '<summary>框选与距离说明</summary>';
  if (instructions) details.append(instructions);
  if (note) details.append(note);
  ui.panel.querySelector('[data-ui=kcfControls]').append(details);
  const startButton = ui.panel.querySelector('[data-ui=start]');
  startButton.textContent = '开始跟踪';
  const resize = () => {
    const img = picker.querySelector('[data-ui=kcfPreview]');
    const ratio = (img?.naturalWidth || 640) / (img?.naturalHeight || 480);
    const width = Math.min(ui.stage.clientWidth, ui.stage.clientHeight * ratio);
    picker.style.width = width + 'px';
    picker.style.height = width / ratio + 'px';
  };
  const observer = new ResizeObserver(resize);
  observer.observe(ui.stage);
  const img = picker.querySelector('[data-ui=kcfPreview]');
  img?.addEventListener('load', resize);
  const cleanup = dispose;
  dispose = () => { observer.disconnect(); img?.removeEventListener('load', resize); cleanup(); ui.stage.replaceChildren(); };
  resize();
}
const RADIO_BRIDGE='ws://192.168.144.108:8765';
const WIFI_BRIDGE='ws://192.168.3.104:8765';
let selectedBridge, bridgeSelection;
function prepareBridge(requested) {
  if (bridgeSelection) return bridgeSelection;
  if (requested !== RADIO_BRIDGE) {
    selectedBridge=requested;
    return bridgeSelection=Promise.resolve();
  }
  bridgeSelection=new Promise(resolve=>{
    let settled=false;
    const probe=new WebSocket(WIFI_BRIDGE,'foxglove.sdk.v1');
    const timer=setTimeout(()=>finish(RADIO_BRIDGE),800);
    function finish(url) {
      if(settled)return;
      settled=true;clearTimeout(timer);
      probe.onopen=probe.onerror=probe.onclose=null;
      probe.close();selectedBridge=url;resolve();
    }
    probe.onopen=()=>finish(WIFI_BRIDGE);
    probe.onerror=probe.onclose=()=>finish(RADIO_BRIDGE);
  });
  return bridgeSelection;
}
function openFollowSocket(requested) {
  const endpoint=selectedBridge||requested;
  const ws=new WebSocket(endpoint,'foxglove.sdk.v1');
  ws.addEventListener('open',()=>{
    const link=endpoint===WIFI_BRIDGE?'Wi-Fi':endpoint===RADIO_BRIDGE?'图传':'自定义';
    window.__followLink=link;
    setTimeout(()=>{
      if(ws.readyState===WebSocket.OPEN)ui.connection.textContent='已连接 104 · '+link;
    },0);
  });
  ws.addEventListener('close',()=>{
    if(endpoint===WIFI_BRIDGE)selectedBridge=RADIO_BRIDGE;
  });
  return ws;
}

async function connect() {
  const requested=new URLSearchParams(location.search).get('bridge') || RADIO_BRIDGE;
  await prepareBridge(requested);
  if(closed)return;
  channels.clear(); subscriptions.clear(); publishers.clear(); services.clear();
  socket = openFollowSocket(requested);
  client = new FoxgloveClient({ ws: socket });
  client.on('open', () => {
    connected = true; ui.connection.textContent = '已连接 104';
    advertise(CONTROL, 'std_msgs/msg/String', 'string data');
    advertise('/omnifleet_vision/kcf/roi', 'sensor_msgs/msg/RegionOfInterest', 'uint32 x_offset\nuint32 y_offset\nuint32 height\nuint32 width\nbool do_rectify');
  });
  client.on('advertise', items => { items.forEach(item => channels.set(item.id, item)); subscribe(); });
  client.on('unadvertise', ids => { for (const id of ids) { channels.delete(id); for (const [sub, item] of subscriptions) if (item.id === id) subscriptions.delete(sub); } });
  client.on('advertiseServices', items => items.forEach(item => services.set(item.name, item)));
  client.on('unadvertiseServices', ids => { for (const [name, item] of services) if (ids.includes(item.id)) services.delete(name); });
  client.on('serviceCallResponse', reply => {
    const call = calls.get(reply.callId); if (!call) return;
    clearTimeout(call.timer); calls.delete(reply.callId);
    try { call.resolve(call.reader.readMessage(reply.data)); } catch (error) { call.reject(error); }
  });
  client.on('message', event => {
    try {
      const channel = subscriptions.get(event.subscriptionId); if (!channel) return;
      const message = channel.reader.readMessage(event.data);
      if (channel.topic === RGB) { window.FoxgloveVision.updateRgb(message); return; }
      if (channel.topic === STATUS) {
        const state = JSON.parse(message.data);
        runningCase = state.case_id; runningPhase = state.phase;
        ui.status.textContent = `${state.phase} · ${state.case_id || '未启动'} · ${state.message}`;
      }
      if (channel.topic === (mode === '04_09_body_tracking' ? '/vision/body_tracking/status' : '/omnifleet_vision/kcf/status')) {
        const state = JSON.parse(message.data);
        const distance = mode === '04_09_body_tracking' ? state.body_tracking?.target_distance_m ?? state.follow_distance_m : state.target_distance_m;
        if (!distanceEdited && Number.isFinite(distance)) ui.distanceSlider.value = ui.distanceValue.value = distance;
      }
      if (channel.topic === '/vision/body_tracking/status') {
        const state = JSON.parse(message.data), body = state.body_tracking || {};
        motion = body.motion_enabled === true;
        ui.motionBody.textContent = motion ? '关闭底盘跟随' : '开启底盘跟随';
        ui.bodyState.textContent = `${body.motion_state || state.state || '等待目标'} · 目标距离 ${Number(body.target_distance_m ?? state.follow_distance_m ?? 1).toFixed(2)} m · ${motion ? '底盘跟随已开启' : '底盘跟随已关闭'}`;
      }
      context.onRender?.({ currentFrame: [{ topic: channel.topic, message }] }, () => {});
    } catch (error) { report(error); }
  });
  client.on('status', status => { if (status.level > 0) report(status.message); });
  client.on('error', error => report(error || '连接错误'));
  client.on('close', () => {
    connected = false; ui.connection.textContent = '连接中断，正在重连…';
    for (const call of calls.values()) { clearTimeout(call.timer); call.reject(Error('104 数据连接已断开')); } calls.clear();
    if (!closed) setTimeout(connect, 2000);
  });
}
ui.mode.onchange = () => { controlRevision++; distanceEdited = false; mount(); prepareCase().then(() => { ui.feedback.textContent = mode === '04_09_body_tracking' ? '竖起大拇指选择人物' : '请在画面中框选物体'; }).catch(report); };
ui.enableFollow.onclick = () => updateFollow('enable_motion', true).catch(report);
ui.disableFollow.onclick = () => {
  controlRevision++;
  if (runningCase !== mode) {
    try { publish(CONTROL,{data:JSON.stringify({id:crypto.randomUUID(),op:'stop'})}); ui.feedback.textContent='已提交停止'; } catch(error) { report(error); }
  } else updateFollow('enable_motion',false,false).catch(report);
};
const applyDistance = () => {
  const value = Number(ui.distanceValue.value);
  if (!ui.distanceValue.value || !ui.distanceValue.validity.valid || !Number.isFinite(value)) { report('请输入 0.2–3.5 m 的距离'); return; }
  updateFollow(mode === '04_09_body_tracking' ? 'follow_distance' : 'target_distance', value).then(() => {distanceEdited=false;}).catch(report);
};
ui.distanceSlider.oninput = () => {distanceEdited=true;ui.distanceValue.value=ui.distanceSlider.value;};
ui.distanceSlider.onchange = applyDistance;
ui.distanceValue.oninput = () => {distanceEdited=true;ui.distanceSlider.value=ui.distanceValue.value;};
ui.distanceValue.onchange = applyDistance;
ui.distanceValue.onkeydown = event => {if(event.key==='Enter'){event.preventDefault();ui.distanceValue.blur();}};
ui.startBody.onclick = () => { try { start('start'); } catch (error) { report(error); } };
ui.stopBody.onclick = () => { try { start('stop'); } catch (error) { report(error); } };
ui.motionBody.onclick = () => setParameter('enable_motion', !motion);
ui.applyDistance.onclick = () => { const value = Number(ui.distance.value); if (ui.distance.validity.valid && value >= .2) setParameter('follow_distance', value); else report('请输入有效的跟随距离'); };
ui.back.onclick = () => { location.href = 'foxglove-android://back'; };
ui.navigation.onclick = () => { try { start('navigation'); } catch (error) { report(error); } };
window.addEventListener('pagehide', () => { closed = true; socket?.close(); });
mount(); connect();
