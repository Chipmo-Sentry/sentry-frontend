/**
 * LiveKit SFU playback — the true-ABR transport. The node publishes each
 * camera into a LiveKit room with simulcast layers; the server picks the layer
 * per viewer from TWCC congestion feedback, so a lossy viewer link degrades
 * quality instead of stuttering. `adaptiveStream` additionally sizes the
 * requested layer to the actual <video> element.
 */

import { Room, RoomEvent, Track } from "livekit-client";

export type LiveKitCallbacks = {
  onConnected?: () => void;
  onError?: (err: Error) => void;
};

export function attachLiveKit(
  video: HTMLVideoElement,
  url: string,
  token: string,
  cbs: LiveKitCallbacks = {},
  iceServers?: RTCIceServer[] | null,
): { close: () => void } {
  let closed = false;
  // With Cloudflare TURN servers present, force media to RELAY through them:
  // the direct host candidate (the node's public IP) is the long lossy MN→KR
  // hop, so we skip it in favour of Cloudflare's nearby PoP + backbone. Without
  // TURN, default ICE (host/srflx) as before.
  const room = new Room({
    adaptiveStream: true,
    ...(iceServers && iceServers.length
      ? { rtcConfig: { iceServers, iceTransportPolicy: "relay" as RTCIceTransportPolicy } }
      : {}),
  });

  const attachTrack = (track: Track) => {
    if (closed || track.kind !== Track.Kind.Video) return;
    track.attach(video);
    cbs.onConnected?.();
  };

  room.on(RoomEvent.TrackSubscribed, (track) => attachTrack(track));
  room.on(RoomEvent.Disconnected, () => {
    if (!closed) cbs.onError?.(new Error("LiveKit холболт тасарлаа."));
  });

  room
    .connect(url, token)
    .then(() => {
      if (closed) return;
      // The publisher may have joined first — attach any already-subscribed track.
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.videoTrackPublications.values()) {
          if (pub.track) attachTrack(pub.track);
        }
      }
    })
    .catch((e: unknown) => {
      if (!closed) cbs.onError?.(e instanceof Error ? e : new Error(String(e)));
    });

  return {
    close: () => {
      closed = true;
      void room.disconnect();
    },
  };
}
