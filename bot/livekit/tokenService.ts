/**
 * LiveKit Token Service (bot/livekit/tokenService.ts)
 *
 * Generates secure HS256-signed LiveKit WebRTC AccessTokens using Node's native crypto module.
 * Eliminates heavy protobuf/Twirp dependencies and works 100% reliably in any environment.
 */

import * as crypto from "node:crypto";
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
  const ttl = params.ttlSeconds || 3600; // 1 hour token
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, any> = {
    name,
    video: {
      roomJoin: true,
      room: params.roomName,
      canPublish: true, // publish microphone
      canSubscribe: true, // hear assistant audio
      canPublishData: true, // data channel events
    },
    iss: config.apiKey,
    exp: now + ttl,
    nbf: now - 5,
    sub: identity,
  };

  if (params.metadata) {
    payload.metadata = JSON.stringify(params.metadata);
  }

  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${b64Header}.${b64Payload}`;
  const signature = crypto.createHmac("sha256", config.apiSecret).update(data).digest("base64url");
  const jwt = `${data}.${signature}`;

  return {
    token: jwt,
    serverUrl: config.url,
    roomName: params.roomName,
    identity,
  };
}
