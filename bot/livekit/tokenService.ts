/**
 * LiveKit Token Service (bot/livekit/tokenService.ts)
 * Issues secure JWT tokens for client browser WebRTC voice calls
 */

import { AccessToken } from "livekit-server-sdk";
import { loadLiveKitConfig } from "./config.ts";

export interface CreateTokenParams {
  roomName: string;
  participantName?: string | undefined;
  participantIdentity?: string | undefined;
  metadata?: Record<string, any> | undefined;
  ttlSeconds?: number | undefined;
}

export interface LiveKitTokenResult {
  token: string;
  serverUrl: string;
  roomName: string;
  identity: string;
}

/**
 * Creates an Access Token for a user to join a LiveKit WebRTC Voice Call Room.
 */
export async function createVoiceCallToken(params: CreateTokenParams): Promise<LiveKitTokenResult> {
  const config = loadLiveKitConfig();

  const identity =
    params.participantIdentity ||
    `user_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
  const name = params.participantName || "User";

  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    ttl: params.ttlSeconds || 3600, // 1 hour token
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
  });

  // Grant permissions for bidirectional audio call
  at.addGrant({
    roomJoin: true,
    room: params.roomName,
    canPublish: true, // User can publish microphone audio
    canSubscribe: true, // User can hear assistant audio
    canPublishData: true, // User can send metadata/events
  });

  const jwt = await at.toJwt();

  return {
    token: jwt,
    serverUrl: config.url,
    roomName: params.roomName,
    identity,
  };
}
