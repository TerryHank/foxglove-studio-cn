(() => {
  const query = new URLSearchParams(location.search);
  if (query.get("ds") !== "foxglove-websocket") return;

  const bridge = "ws://192.168.144.108:8765/";
  const retryDelays = [1000, 2000, 4000, 8000, 12000];
  let socket, timeout, retry;
  let attempt = 0;
  let requested = false;

  function connect() {
    if (document.hidden || socket || requested) return;
    const client = new WebSocket(bridge, ["foxglove.sdk.v1", "foxglove.websocket.v1"]);
    socket = client;
    client.binaryType = "arraybuffer";
    let serviceId;
    timeout = setTimeout(() => client.close(), 6000);

    client.onmessage = ({ data }) => {
      if (socket !== client) return;
      if (typeof data === "string") {
        const message = JSON.parse(data);
        if (message.op === "serviceCallFailure" && message.callId === 1) client.close();
        if (message.op !== "advertiseServices" || serviceId !== undefined) return;
        const service = message.services.find(({ name }) => name === "/navigation/ensure_ready");
        if (!service) return;
        serviceId = service.id;
        // Foxglove service request, followed by the CDR Trigger request.
        const request = new DataView(new ArrayBuffer(21));
        request.setUint8(0, 2);
        request.setUint32(1, serviceId, true);
        request.setUint32(5, 1, true);
        request.setUint32(9, 3, true);
        new Uint8Array(request.buffer).set([99, 100, 114, 0, 1, 0, 0, 0], 13);
        client.send(request.buffer);
        return;
      }
      const response = new DataView(data);
      if (response.byteLength < 13 || response.getUint8(0) !== 3 ||
          response.getUint32(1, true) !== serviceId || response.getUint32(5, true) !== 1) return;
      const successOffset = 13 + response.getUint32(9, true) + 4;
      requested = successOffset < response.byteLength && response.getUint8(successOffset) === 1;
      client.close();
    };
    client.onclose = () => {
      if (socket !== client) return;
      socket = undefined;
      clearTimeout(timeout);
      if (!requested && !document.hidden && attempt < retryDelays.length) {
        retry = setTimeout(connect, retryDelays[attempt++]);
      }
    };
  }

  function stop() {
    clearTimeout(timeout);
    clearTimeout(retry);
    const previous = socket;
    socket = undefined;
    previous?.close();
    attempt = 0;
    requested = false;
  }

  document.addEventListener("visibilitychange", () => document.hidden ? stop() : connect());
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", connect);
  window.addEventListener("online", () => {
    if (requested || socket) return;
    clearTimeout(retry);
    attempt = 0;
    connect();
  });
  connect();
})();
