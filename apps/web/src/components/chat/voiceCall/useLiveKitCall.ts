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
  participantCount: number;
}

export function useLiveKitCall(options?: {
  onAudioTrackSubscribed?: (track: RemoteTrack) => void;
  onAudioTrackUnsubscribed?: (track: RemoteTrack) => void;
  onDataReceived?: (data: any, participant?: RemoteParticipant) => void;
  onError?: (err: Error) => void;
}) {
  const [state, setState] = useState<LiveKitCallState>({
    isConnected: false,
    isConnecting: false,
    isMuted: false,
    error: null,
    serverUrl: null,
    roomName: null,
    participantCount: 0,
  });

  const roomRef = useRef<Room | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Connect to LiveKit Room on VPS
  const connect = useCallback(async (customRoomName = "autojobs-call-room") => {
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
        token?: string | { token: string };
        serverUrl?: string;
        error?: string;
      };

      const rawToken = tokenData.token;
      const jwtString = typeof rawToken === "string" ? rawToken : rawToken?.token || "";

      if (!tokenData.ok || !jwtString) {
        throw new Error(tokenData.error || "Failed to acquire LiveKit AccessToken from server");
      }

      // Determine secure wss:// endpoint to avoid Mixed Content error when loaded over HTTPS
      // Note: LiveKit SDK internally appends /rtc, so pass clean base host without /rtc
      let targetUrl = tokenData.serverUrl || "ws://201.18.218.29:7880";
      if (typeof window !== "undefined" && window.location.protocol === "https:") {
        targetUrl = `wss://${window.location.host}`;
      }

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
            if (track.sid) {
              audioElementsRef.current.set(track.sid, el);
            }
            optionsRef.current?.onAudioTrackSubscribed?.(track);
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
            if (track.sid) {
              const el = audioElementsRef.current.get(track.sid);
              if (el) {
                el.remove();
                audioElementsRef.current.delete(track.sid);
              }
            }
            optionsRef.current?.onAudioTrackUnsubscribed?.(track);
          }
        },
      );

      room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: RemoteParticipant) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);
          optionsRef.current?.onDataReceived?.(data, participant);
        } catch {
          optionsRef.current?.onDataReceived?.(payload, participant);
        }
      });

      const updateParticipantCount = () => {
        if (room) {
          setState((s) => ({
            ...s,
            participantCount: (room.remoteParticipants?.size || 0) + 1,
          }));
        }
      };

      room.on(RoomEvent.ParticipantConnected, updateParticipantCount);
      room.on(RoomEvent.ParticipantDisconnected, updateParticipantCount);

      room.on(RoomEvent.Disconnected, () => {
        setState((s) => ({
          ...s,
          isConnected: false,
          isConnecting: false,
          participantCount: 0,
        }));
      });

      // 4. Connect to WebRTC Server & Publish Mic
      await room.connect(targetUrl, jwtString, {
        autoSubscribe: true,
      });

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        console.warn("[LiveKit] Local mic publish notice:", micErr);
      }

      roomRef.current = room;

      setState({
        isConnected: true,
        isConnecting: false,
        isMuted: false,
        error: null,
        serverUrl: targetUrl,
        roomName: customRoomName,
        participantCount: (room.remoteParticipants?.size || 0) + 1,
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
      optionsRef.current?.onError?.(err);
    }
  }, []);

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
      participantCount: 0,
    }));
  }, []);

  // Send Data Channel message to Room
  const sendDataMessage = useCallback(async (data: any) => {
    if (!roomRef.current || !roomRef.current.localParticipant) return false;
    try {
      const jsonStr = typeof data === "string" ? data : JSON.stringify(data);
      const bytes = new TextEncoder().encode(jsonStr);
      await roomRef.current.localParticipant.publishData(bytes, { reliable: true });
      return true;
    } catch (e) {
      console.warn("[LiveKit] sendDataMessage error:", e);
      return false;
    }
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
    sendDataMessage,
    toggleMute,
    room: roomRef.current,
  };
}
