/**
 * LiveKit Agent Worker (bot/livekit/agentWorker.ts)
 *
 * Implements Point 2: Active AI Agent Worker Participant in LiveKit Room.
 * 1. Native zero-dependency WebSocket & Twirp integration (no protobuf / livekit-server-sdk version issues).
 * 2. Joins the LiveKit room as "agent_autojobs" (AutoJobs AI Agent).
 * 3. Remains connected as an active participant in "autojobs-call-room".
 * 4. Broadcasts instant spoken fillers and background tool status updates to room participants via WebRTC DataChannel.
 * 5. Auto-reconnects if disconnected.
 */

import * as crypto from "node:crypto";
import { createVoiceCallToken } from "./tokenService.ts";
import { loadLiveKitConfig } from "./config.ts";
import { processLiveKitVoiceTurn, type AgentContext } from "./agent.ts";

let agentWs: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let isRunning = false;
let currentRoomName = "autojobs-call-room";

export function getAgentWorkerStatus() {
  return {
    isRunning,
    isConnected: agentWs !== null && agentWs.readyState === WebSocket.OPEN,
    roomName: currentRoomName,
    identity: "agent_autojobs",
  };
}

/**
 * Creates an internal admin JWT for RoomService Twirp calls
 */
function createAdminToken(roomName: string): string {
  const config = loadLiveKitConfig();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    name: "RoomServiceAdmin",
    video: {
      roomAdmin: true,
      roomCreate: true,
      roomList: true,
      room: roomName,
    },
    iss: config.apiKey,
    exp: now + 3600,
    nbf: now - 5,
    sub: "admin_room_service",
  };
  const header = { alg: "HS256", typ: "JWT" };
  const b64Header = Buffer.from(JSON.stringify(header)).toString("base64url");
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${b64Header}.${b64Payload}`;
  const sig = crypto.createHmac("sha256", config.apiSecret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

/**
 * Broadcasts a structured event to all participants in the room via LiveKit Twirp SendData
 */
export async function broadcastToRoom(
  roomName: string,
  payload: Record<string, any>,
): Promise<boolean> {
  try {
    const config = loadLiveKitConfig();
    const serverUrl = config.url.replace(/^ws/, "http").replace(/\/rtc$/, "");
    const adminToken = createAdminToken(roomName);

    const jsonStr = JSON.stringify({
      ...payload,
      sender: "agent_autojobs",
      timestamp: Date.now(),
    });
    const packetData = Buffer.from(jsonStr).toString("base64");

    const res = await fetch(`${serverUrl}/twirp/livekit.RoomService/SendData`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room: roomName,
        data: packetData,
        kind: 0, // 0 = RELIABLE
      }),
    });

    return res.ok;
  } catch (err) {
    return false;
  }
}

/**
 * Ensures room exists on LiveKit SFU via Twirp CreateRoom
 */
async function ensureRoomExists(roomName: string): Promise<void> {
  try {
    const config = loadLiveKitConfig();
    const serverUrl = config.url.replace(/^ws/, "http").replace(/\/rtc$/, "");
    const adminToken = createAdminToken(roomName);

    await fetch(`${serverUrl}/twirp/livekit.RoomService/CreateRoom`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        empty_timeout: 3600,
      }),
    });
  } catch {}
}

/**
 * Connects the AI Agent Worker participant into the room
 */
async function connectAgentParticipant(roomName = "autojobs-call-room") {
  if (
    agentWs &&
    (agentWs.readyState === WebSocket.OPEN || agentWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  try {
    const config = loadLiveKitConfig();

    // 1. Ensure Room exists
    await ensureRoomExists(roomName);

    // 2. Generate Agent Worker token
    const tokenRes = await createVoiceCallToken({
      roomName,
      participantIdentity: "agent_autojobs",
      participantName: "AutoJobs AI Agent",
      metadata: { role: "ai_voice_assistant", isAgent: true },
    });

    const wsUrl = `${config.url.replace(/^http/, "ws")}/rtc?access_token=${tokenRes.token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`[LiveKit Agent Worker] Connected as participant in room "${roomName}"`);
      // Broadcast welcome presence
      void broadcastToRoom(roomName, {
        type: "agent_ready",
        agentName: "AutoJobs AI Agent",
        status: "online",
      });
    };

    ws.onclose = () => {
      console.log("[LiveKit Agent Worker] WebSocket disconnected. Scheduling reconnect...");
      agentWs = null;
      if (isRunning) {
        scheduleReconnect(roomName);
      }
    };

    ws.onerror = (err) => {
      console.warn("[LiveKit Agent Worker] WebSocket error:", err);
    };

    agentWs = ws;
  } catch (err) {
    console.error("[LiveKit Agent Worker] Connection failure:", err);
    if (isRunning) {
      scheduleReconnect(roomName);
    }
  }
}

function scheduleReconnect(roomName: string) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    if (isRunning) {
      void connectAgentParticipant(roomName);
    }
  }, 5000);
}

/**
 * Starts the LiveKit Agent Worker background service
 */
export function startLiveKitAgentWorker(roomName = "autojobs-call-room") {
  if (isRunning) return;
  isRunning = true;
  currentRoomName = roomName;
  console.log(`[LiveKit Agent Worker] Starting for room: ${roomName}`);
  void connectAgentParticipant(roomName);
}

/**
 * Stops the LiveKit Agent Worker service
 */
export function stopLiveKitAgentWorker() {
  isRunning = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (agentWs) {
    try {
      agentWs.close();
    } catch {}
    agentWs = null;
  }
}

/**
 * Processes a voice turn with real-time filler broadcasting and tool execution
 */
export async function handleAgentWorkerVoiceTurn(opts: {
  roomName: string;
  transcript: string;
  projectRoot?: string;
  language?: "urdu" | "english" | "bilingual";
}) {
  const { roomName, transcript, projectRoot = process.cwd(), language = "bilingual" } = opts;

  const context: AgentContext = {
    projectName: "AutoJobs",
    projectRoot,
    language,
  };

  // Broadcast turn processing start
  void broadcastToRoom(roomName, {
    type: "user_turn_received",
    transcript,
  });

  const result = await processLiveKitVoiceTurn(transcript, context, (fillerText) => {
    // Instant filler broadcast over WebRTC DataChannel
    void broadcastToRoom(roomName, {
      type: "filler",
      text: fillerText,
    });
  });

  // Broadcast completion
  void broadcastToRoom(roomName, {
    type: "agent_reply",
    reply: result.reply,
    spokenReply: result.spokenReply,
    toolCalled: result.toolCalled,
  });

  return result;
}
