/**
 * WHEP (WebRTC-HTTP Egress Protocol) client for MediaMTX.
 *
 * MediaMTX serves each path at `http://host:8889/<path>/whep`. The handshake:
 *   1. create RTCPeerConnection, add recvonly video+audio transceivers
 *   2. createOffer → setLocalDescription, wait for ICE gathering
 *   3. POST the offer SDP (Content-Type: application/sdp)
 *   4. response body = answer SDP → setRemoteDescription
 *   5. ontrack → video.srcObject = MediaStream
 *
 * Sub-second latency vs HLS's 1-3s. We wait for ICE gathering to complete
 * (capped) rather than trickling — simplest path that works once the server
 * advertises reachable candidates (localhost in dev; webrtcAdditionalHosts +
 * a public address in cloud).
 */

export type WhepHandle = {
  /** Tear down the peer connection and notify the server (best-effort DELETE). */
  close: () => void;
};

export type WhepCallbacks = {
  onConnected?: () => void;
  onError?: (err: Error) => void;
};

const ICE_GATHER_TIMEOUT_MS = 2000;

async function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ICE_GATHER_TIMEOUT_MS);
    function check() {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * Attach a WHEP stream to a <video>. Returns a handle synchronously; the
 * async handshake reports success via `onConnected` and failure via `onError`.
 */
export function attachWhep(
  video: HTMLVideoElement,
  whepUrl: string,
  cbs: WhepCallbacks = {},
): WhepHandle {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  let resourceUrl: string | null = null;
  let closed = false;

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  const remote = new MediaStream();
  pc.ontrack = (ev) => {
    remote.addTrack(ev.track);
    video.srcObject = remote;
  };
  pc.onconnectionstatechange = () => {
    if (closed) return;
    if (pc.connectionState === "connected") cbs.onConnected?.();
    if (pc.connectionState === "failed") cbs.onError?.(new Error("WebRTC холболт амжилтгүй"));
  };

  (async () => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);

      const res = await fetch(whepUrl, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: pc.localDescription?.sdp ?? offer.sdp ?? "",
      });
      if (!res.ok) {
        throw new Error(`WHEP ${res.status}`);
      }
      resourceUrl = res.headers.get("Location");
      const answer = await res.text();
      if (closed) return;
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (e) {
      if (!closed) cbs.onError?.(e instanceof Error ? e : new Error("WHEP алдаа"));
    }
  })();

  return {
    close() {
      closed = true;
      if (resourceUrl) {
        // Best-effort session teardown; ignore failures.
        const url = new URL(resourceUrl, whepUrl).toString();
        fetch(url, { method: "DELETE" }).catch(() => {});
      }
      video.srcObject = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    },
  };
}
