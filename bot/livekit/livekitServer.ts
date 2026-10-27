/**
 * LiveKit Voice Server & API Controller (bot/livekit/livekitServer.ts)
 */

import { createVoiceCallToken, type LiveKitTokenResult } from "./tokenService.ts";
import { processLiveKitVoiceTurn, type AgentContext } from "./agent.ts";
import { loadLiveKitConfig } from "./config.ts";

export interface LiveKitRoomSession {
  roomName: string;
  userName: string;
  projectName: string;
  tokenResult: LiveKitTokenResult;
  createdAt: number;
}

const activeSessions = new Map<string, LiveKitRoomSession>();

/**
 * Initializes a new Voice Call session and generates the WebRTC connection token.
 */
export async function initializeVoiceCallSession(
  roomName: string,
  userName = "User",
  projectName = "Workspace",
): Promise<LiveKitRoomSession> {
  const tokenResult = await createVoiceCallToken({
    roomName,
    participantName: userName,
    metadata: { projectName },
  });

  const session: LiveKitRoomSession = {
    roomName,
    userName,
    projectName,
    tokenResult,
    createdAt: Date.now(),
  };

  activeSessions.set(roomName, session);
  return session;
}

/**
 * Dispatches a voice turn in an active LiveKit room.
 */
export async function handleVoiceTurnInRoom(
  roomName: string,
  userSpeech: string,
  projectRoot = process.cwd(),
): Promise<{ reply: string; spokenReply: string; toolCalled?: string }> {
  const session = activeSessions.get(roomName);
  const context: AgentContext = {
    projectName: session?.projectName || "Workspace",
    projectRoot,
    language: "bilingual",
  };

  return processLiveKitVoiceTurn(userSpeech, context);
}

/**
 * Health & Status check for LiveKit service
 */
export function getLiveKitServiceStatus(): {
  configured: boolean;
  serverUrl: string;
  activeRoomsCount: number;
} {
  const config = loadLiveKitConfig();
  return {
    configured: Boolean(config.url && config.apiKey && config.apiSecret),
    serverUrl: config.url,
    activeRoomsCount: activeSessions.size,
  };
}
