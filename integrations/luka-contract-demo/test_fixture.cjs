/* Isolated visualization fixture. It never connects to ROS or a real robot. */
const {FoxgloveServer}=require("@foxglove/ws-protocol");
const {WebSocketServer}=require("ws");
const server=new FoxgloveServer({name:"SIMULATED Luka visualization fixture"});
const ws=new WebSocketServer({host:"127.0.0.1",port:18766,
 handleProtocols:protocols=>protocols.has("foxglove.sdk.v1") ? "foxglove.sdk.v1" : server.handleProtocols(protocols)});
ws.on("connection",(socket,request)=>server.handleConnection(socket,request.socket.remoteAddress));
server.on("error",console.error);
const vector={type:"object",properties:{x:{type:"number"},y:{type:"number"},z:{type:"number"}}};
const header={type:"object",properties:{stamp:{type:"object",properties:{sec:{type:"integer"},nanosec:{type:"integer"}}},frame_id:{type:"string"}}};
const imu=server.addChannel({topic:"/imu/data",encoding:"json",schemaName:"sensor_msgs/msg/Imu",
 schema:JSON.stringify({type:"object",properties:{header,linear_acceleration:vector,angular_velocity:vector}})});
const {MessageWriter}=require("@foxglove/rosmsg2-serialization");
const common=require("@foxglove/rosmsg-msgs-common").ros2humble;
const imageDefinitions=[{definitions:common["sensor_msgs/Image"].definitions},
 common["std_msgs/Header"],common["builtin_interfaces/Time"]];
const imageWriter=new MessageWriter(imageDefinitions);
const imageSchemaText=[
 "std_msgs/Header header","uint32 height","uint32 width","string encoding","uint8 is_bigendian","uint32 step","uint8[] data",
 "================================================================================",
 "MSG: std_msgs/Header","builtin_interfaces/Time stamp","string frame_id",
 "================================================================================",
 "MSG: builtin_interfaces/Time","int32 sec","uint32 nanosec"].join("\n");
const rgb=server.addChannel({topic:"/camera/color/image_raw",encoding:"cdr",schemaEncoding:"ros2msg",schemaName:"sensor_msgs/msg/Image",schema:imageSchemaText});
const depth=server.addChannel({topic:"/camera/depth/image_raw",encoding:"cdr",schemaEncoding:"ros2msg",schemaName:"sensor_msgs/msg/Image",schema:imageSchemaText});
function send(id,message){
 const bytes=id===imu ? Buffer.from(JSON.stringify(message)) : imageWriter.writeMessage({...message,data:Uint8Array.from(message.data)});
 server.sendMessage(id,BigInt(Date.now())*1000000n,bytes);
}
let phase=0;
const timer=setInterval(()=>{
 const t=Date.now(),h={stamp:{sec:Math.floor(t/1000),nanosec:(t%1000)*1000000},frame_id:"SIMULATED_ONLY"};
 phase+=.1;
 send(imu,{header:h,linear_acceleration:{x:.4+Math.sin(phase)*.1,y:.3,z:9.8},angular_velocity:{x:.01,y:.02,z:Math.sin(phase)*.2}});
 const data=[],d=[];
 for(let y=0;y<24;y++)for(let x=0;x<32;x++){data.push(x*8,y*10,80);d.push(0xe8,0x03);}
 send(rgb,{header:h,height:24,width:32,encoding:"rgb8",is_bigendian:0,step:96,data});
 send(depth,{header:h,height:24,width:32,encoding:"16UC1",is_bigendian:0,step:64,data:d});
},100);
function stop(){clearInterval(timer);for(const client of ws.clients)client.close();ws.close();}
process.on("SIGINT",stop);
process.on("SIGTERM",stop);
console.log("SIMULATED fixture ws://127.0.0.1:18766; no hardware, no ROS");