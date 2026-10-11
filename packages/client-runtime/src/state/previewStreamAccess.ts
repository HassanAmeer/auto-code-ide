/**
 * Credentials for media requests that cannot set bearer or DPoP headers.
 *
 * `<img>`, `EventSource`, and `WebSocket` cannot set those headers, so bearer
 * and DPoP connections mint a short-lived WebSocket ticket and pass it as
 * `wsTicket`, the same way the app's own `/ws` upgrade authenticates. Cookie
 * sessions send the cookie.
 *
 * A ticket lives five minutes server-side and is bound to the session, not
 * to one request, so one ticket covers everything a viewer opens at once.
 * Callers fetch a fresh one each time they (re)connect a stream.
 */
import * as Effect from "effect/Effect";
import type { HttpClient } from "effect/http";

import * as RemoteEnvironmentAuthorization from "../authorization/service.ts";
import type { PreparedConnection } from "../connection/model.ts";
import { environmentEndpointUrl } from "../environment/endpoint.ts";
import * as ManagedRelay from "../relay/managedRelay.ts";
import type { RemoteEnvironmentRequestError } from "../rpc/http.ts";
import { executeAuthenticatedEnvironmentHttpRequest } from "./environmentHttpAuth.ts";

/** Credentials for media requests that cannot set bearer or DPoP headers. */
export interface PreviewStreamAccess {
  /** Absolute environment URL ending in the stream's base path. */
  readonly httpBase: string;
  /** Same base with the `ws(s)` scheme. */
  readonly wsBase: string;
  /** Empty for cookie sessions; includes a short-lived ticket for bearer and DPoP sessions. */
  readonly query: Readonly<Record<string, string>>;
  /** Whether requests must include session cookies. */
  readonly credentials: boolean;
}

export const withPreviewStreamQuery = (url: string, access: PreviewStreamAccess): string => {
  const entries = Object.entries(access.query);
  if (entries.length === 0) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${new URLSearchParams(entries).toString()}`;
};

const TICKET_TIMEOUT_MS = 8_000;

export const resolvePreviewStreamAccess = Effect.fn(
  "clientRuntime.state.resolvePreviewStreamAccess",
)(function* (input: {
  readonly prepared: PreparedConnection;
  readonly streamBasePath: string;
}): Effect.fn.Return<PreviewStreamAccess, RemoteEnvironmentRequestError, HttpClient.HttpClient> {
  const httpBase = environmentEndpointUrl(input.prepared.httpBaseUrl, input.streamBasePath);
  const wsBase = httpBase.replace(/^http/, "ws");
  if (input.prepared.httpAuthorization === null) {
    return { httpBase, wsBase, query: {}, credentials: true };
  }
  const signer = yield* Effect.serviceOption(ManagedRelay.ManagedRelayDpopSigner);
  const remoteAuthorization = yield* Effect.serviceOption(
    RemoteEnvironmentAuthorization.RemoteEnvironmentAuthorization,
  );
  const ticket = yield* executeAuthenticatedEnvironmentHttpRequest({
    prepared: input.prepared,
    signer,
    remoteAuthorization,
    group: "auth",
    method: "POST",
    url: (httpBaseUrl) => environmentEndpointUrl(httpBaseUrl, "/api/auth/websocket-ticket"),
    timeoutMs: TICKET_TIMEOUT_MS,
    request: ({ client, headers }) => client.webSocketTicket({ headers }),
  });
  return {
    httpBase,
    wsBase,
    query: { wsTicket: ticket.ticket },
    credentials: false,
  };
});
