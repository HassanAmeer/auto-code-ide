/**
 * LiveKit Real-Time WebRTC Voice Call Hook (useLiveKitCall.ts)
 *
 * Provides bidirectional WebRTC audio streaming to the VPS LiveKit Server (port 7880),
 * enabling continuous, echo-free, zero-flapping voice communication like a real WhatsApp / phone call.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from "livekit-client";

export interface LiveKitCallState {
  isConnected: boolean;
  isConnecting: boolean;
  isMuted: boolean;
  error: string | null;
  serverUrl: string | null;
  roomName: string | null;
}

export function useLiveKitCall(options?: {
  onAudioTrackSubscribed?: (track: RemoteTrack) => void;
  onAudioTrackUnsubscribed?: (track: RemoteTrack) => void;
  onError?: (err: Error) => void;
}) {
  const [state, setState] = useState<LiveKitCallState>({
    isConnected: false,
    isConnecting: false,
    isMuted: false,
    error: null,
    serverUrl: null,
    roomName: null,
  });

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // Connect to LiveKit Room on VPS
  const connect = useCallback(
    async (customRoomName = "autojobs-call-room") => {
      if (roomRef.current) {
        await roomRef.current.disconnect();
      }

      setState((s) => ({ ...s, isConnecting: true, error: null }));

      try {
        // 1. Fetch access token from server endpoint
        const tokenRes = await fetch(
          `/api/livekit/token?room=${encodeURIComponent(customRoomName)}&identity=user_${Date.now().toString(36)}`,
        );
        const tokenData = (await tokenRes.json()) as {
          ok: boolean;
          token?: string;
          serverUrl?: string;
          error?: string;
        };

        if (!tokenData.ok || !tokenData.token) {
          throw new Error(tokenData.error || "Failed to acquire LiveKit AccessToken from server");
        }

        const targetUrl = tokenData.serverUrl || "ws://201.18.218.29:7880";

        // 2. Initialize LiveKit WebRTC Room
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });

        // 3. Attach Event Listeners
        room.on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            _publication: RemoteTrackPublication,
            _participant: RemoteParticipant,
          ) => {
            if (track.kind === Track.Kind.Audio) {
              const el = track.attach();
              el.autoplay = true;
              audioElementsRef.current.set(track.sid, el);
              options?.onAudioTrackSubscribed?.(track);
            }
          },
        );

        room.on(
          RoomEvent.TrackUnsubscribed,
          (
            track: RemoteTrack,
            _publication: RemoteTrackPublication,
            _participant: RemoteParticipant,
          ) => {
            if (track.kind === Track.Kind.Audio) {
              track.detach();
              const el = audioElementsRef.current.get(track.sid);
              if (el) {
                el.remove();
                audioElementsRef.current.delete(track.sid);
              }
              options?.onAudioTrackUnsubscribed?.(track);
            }
          },
        );

        room.on(RoomEvent.Disconnected, () => {
          setState((s) => ({
            ...s,
            isConnected: false,
            isConnecting: false,
          }));
        });

        // 4. Connect to WebRTC Server & Publish Mic
        await room.connect(targetUrl, tokenData.token);
        await room.localParticipant.setMicrophoneEnabled(true);

        roomRef.current = room;

        setState({
          isConnected: true,
          isConnecting: false,
          isMuted: false,
          error: null,
          serverUrl: targetUrl,
          roomName: customRoomName,
        });
      } catch (err: any) {
        console.error("[LiveKit] Connection error:", err);
        const errMsg = err?.message || "Failed to connect to LiveKit WebRTC";
        setState((s) => ({
          ...s,
          isConnected: false,
          isConnecting: false,
          error: errMsg,
        }));
        options?.onError?.(err);
      }
    },
    [options],
  );

  // Disconnect from LiveKit
  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }

    // Clean up audio elements
    audioElementsRef.current.forEach((el) => el.remove());
    audioElementsRef.current.clear();

    setState((s) => ({
      ...s,
      isConnected: false,
      isConnecting: false,
      error: null,
    }));
  }, []);

  // Mute / Unmute Local Microphone
  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return;
    const currentMuted = !roomRef.current.localParticipant.isMicrophoneEnabled;
    await roomRef.current.localParticipant.setMicrophoneEnabled(currentMuted);
    setState((s) => ({ ...s, isMuted: !currentMuted }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        void roomRef.current.disconnect();
      }
      audioElementsRef.current.forEach((el) => el.remove());
      audioElementsRef.current.clear();
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    toggleMute,
    room: roomRef.current,
  };
}
