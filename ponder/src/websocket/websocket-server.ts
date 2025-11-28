import dotenv from "dotenv";
import { Hono } from "hono";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { URL } from "url";
import type { WebSocket as WSWebSocket } from "ws";
import { systemMonitor } from "../utils/systemMonitor.js";
import { registerBroadcastFns } from "./broadcaster";
import fs from "fs";
import path from "path";

dotenv.config();

import { WebSocketServer } from "ws";

const ENABLE_WEBSOCKET_LOG = process.env.ENABLE_WEBSOCKET_LOG === "true";

console.log("ENABLE_WEBSOCKET_LOG", ENABLE_WEBSOCKET_LOG);

const LOG_FILE_PATH = path.join(process.cwd(), 'websocket-connection-logs.txt');

const logToFile = (message: string) => {
	try {
		const timestamp = new Date().toISOString();
		const logEntry = `${timestamp} - ${message}\n`;
		fs.appendFileSync(LOG_FILE_PATH, logEntry);
	} catch (error) {
		console.error('Failed to write to log file:', error);
	}
};

try {
	fs.writeFileSync(LOG_FILE_PATH, `WebSocket Connection Logs - Started at ${new Date().toISOString()}\n${'='.repeat(80)}\n`);
	console.log(`WebSocket logs will be written to: ${LOG_FILE_PATH}`);
} catch (error) {
	console.error('Failed to initialize log file:', error);
}

interface BinanceControl {
	method?: "SUBSCRIBE" | "UNSUBSCRIBE" | "LIST_SUBSCRIPTIONS" | "PING" | "PONG";
	params?: string[];
	id?: number | string | null;
}

interface ClientState {
	streams: Set<string>;
	lastCtrl: number;
	isUser: boolean;
	userId?: string;
}

const clients = new Map<WSWebSocket, ClientState>();
const listenKeys = new Map<
	string,
	{
		userId: string;
		expireTs: number;
	}
>();
const ORDER_BOOKS: Record<
	string,
	{
		bids: [string, string][];
		asks: [string, string][];
		lastUpdateId: number;
	}
> = {};
const allowCtrl = (s: ClientState) => {
	const n = Date.now();
	if (n - s.lastCtrl < 200) return false;
	s.lastCtrl = n;
	return true;
};

setInterval(() => {
	const n = Date.now();
	for (const [k, r] of listenKeys) if (r.expireTs < n) listenKeys.delete(k);
}, 60_000);

export function bootstrapGateway(app: Hono) {
	const http = createServer();
	const wss = new WebSocketServer({
		server: http,
		verifyClient: (info: any) => {
			const origin = info.origin;
			const userAgent = info.req.headers['user-agent'];
			const host = info.req.headers.host;

			const connectionInfo = {
				origin: origin || 'NO_ORIGIN',
				userAgent: userAgent?.substring(0, 100) || 'NO_USER_AGENT',
				host: host || 'NO_HOST',
				url: info.req.url,
				secure: info.secure,
				ip: info.req.socket.remoteAddress
			};

			const logMessage = `[WS SERVER] Connection attempt: ${JSON.stringify(connectionInfo, null, 2)}`;
			console.log(logMessage);
			logToFile(logMessage);

			return true;
		}
	});

	// Register WebSocket stats callback with system monitor
	systemMonitor.registerWebSocketStatsCallback(() => {
		let userConnections = 0;
		let publicConnections = 0;
		let totalSubscriptions = 0;
		let marketSubscriptions = 0;
		let userSubscriptions = 0;
		let otherSubscriptions = 0;

		for (const [_, state] of clients) {
			if (state.isUser) {
				userConnections++;
				// For user connections, count each stream as a user subscription
				userSubscriptions += state.streams.size;
			} else {
				publicConnections++;

				// For public connections, categorize subscriptions by stream name
				for (const stream of state.streams) {
					if (stream.includes('@depth') || stream.includes('@trade') || stream.includes('@ticker') || stream.includes('@kline')) {
						marketSubscriptions++;
					} else {
						otherSubscriptions++;
					}
				}
			}

			// Count total subscriptions
			totalSubscriptions += state.streams.size;
		}

		return {
			activeConnections: clients.size,
			totalSubscriptions,
			userConnections,
			publicConnections,
			subscriptionTypes: {
				market: marketSubscriptions,
				user: userSubscriptions,
				other: otherSubscriptions
			}
		};
	});
	wss.on("connection", (ws: any, req: any) => {
		const url = req.url || "/";
		const listenKey = url.startsWith("/ws/") ? url.slice(4) : undefined;
		const state: ClientState = {
			streams: new Set(),
			lastCtrl: 0,
			isUser: !!listenKey,
			userId: listenKey ? listenKey.toLowerCase() : undefined,
		};

		clients.set(ws, state);

		ws.on("message", (raw: any) => {
			let m: BinanceControl;
			try {
				m = JSON.parse(raw.toString());
			} catch {
				return;
			}
			if (!m.method || !allowCtrl(state)) return;
			// Only track valid messages that pass validation
			systemMonitor.trackWebSocketMessageReceived();
			switch (m.method) {
				case "SUBSCRIBE":
					(m.params || []).forEach(s => state.streams.add(s));
					ws.send(
						JSON.stringify({
							id: m.id ?? null,
							result: null,
						})
					);
					break;
				case "UNSUBSCRIBE":
					(m.params || []).forEach(s => state.streams.delete(s));
					ws.send(
						JSON.stringify({
							id: m.id ?? null,
							result: null,
						})
					);
					break;
				case "LIST_SUBSCRIPTIONS":
					ws.send(
						JSON.stringify({
							id: m.id ?? null,
							result: [...state.streams],
						})
					);
					break;
				case "PING":
					ws.send(
						JSON.stringify({
							method: "PONG",
						})
					);
					break;
			}
		});

		ws.on("close", () => clients.delete(ws));
	});

	const router = app;

	router.get("/api/v3/depth", c => {
		const u = new URL(c.req.url);
		const sym = (u.searchParams.get("symbol") || "").toLowerCase();
		const lim = Number(u.searchParams.get("limit") || 100);
		const ob = ORDER_BOOKS[sym];
		if (!ob)
			return c.json(
				{
					code: -1121,
					msg: "Unknown symbol",
				},
				400
			);
		return c.json({
			lastUpdateId: ob.lastUpdateId,
			bids: ob.bids.slice(0, lim),
			asks: ob.asks.slice(0, lim),
		});
	});

	http.on("request", (req: IncomingMessage, res: ServerResponse) => app.fetch(req as any, res));
	http.listen(parseInt(process.env.PORT || "42080"));
	if (ENABLE_WEBSOCKET_LOG) console.log(`Gateway listening on :${process.env.PORT || 42080}`);

	const emit = (stream: string, data: any) => {
		if (ENABLE_WEBSOCKET_LOG) console.log("[WS EMIT]", stream, JSON.stringify(data));
		const j = JSON.stringify({
			stream,
			data,
		});
		for (const [ws, s] of clients) if (ws.readyState === 1 && s.streams.has(stream)) {
			ws.send(j);
			systemMonitor.trackWebSocketMessageSent();
		}
	};

	const emitUser = (userId: string, p: any) => {
		if (ENABLE_WEBSOCKET_LOG) console.log("[WS EMIT USER]", userId, JSON.stringify(p));
		const j = JSON.stringify(p);
		for (const [ws, s] of clients) if (s.isUser && s.userId === userId && ws.readyState === 1) {
			ws.send(j);
			systemMonitor.trackWebSocketMessageSent();
		}
	};

	const fns = {
		pushTrade: (sym: string, id: number, p: string, q: string, m: boolean, ts: number) => {
			if (ENABLE_WEBSOCKET_LOG) {
				console.log("pushTrade", `${sym}@trade`, id, p, q, m, ts);
			}
			emit(`${sym}@trade`, {
				e: "trade",
				E: Date.now(),
				s: sym.toUpperCase(),
				t: id,
				p,
				q,
				m,
				T: ts,
			});
		},
		pushDepth: (sym: string, b: [string, string][], a: [string, string][]) => {
			if (ENABLE_WEBSOCKET_LOG) {
				console.log("pushDepth", `${sym}@depth`);
			}
			const ob =
				ORDER_BOOKS[sym] ||
				(ORDER_BOOKS[sym] = {
					bids: [],
					asks: [],
					lastUpdateId: 1,
				});
			ob.lastUpdateId += 1;
			ob.bids = b;
			ob.asks = a;
			emit(`${sym}@depth`, {
				e: "depthUpdate",
				E: Date.now(),
				s: sym.toUpperCase(),
				U: ob.lastUpdateId,
				u: ob.lastUpdateId,
				b,
				a,
			});
		},
		pushKline: (sym: string, int: string, k: any) => {
			if (ENABLE_WEBSOCKET_LOG) {
				console.log("pushKline", `${sym}@kline_${int}`, k);
			}
			emit(`${sym}@kline_${int}`, {
				e: "kline",
				E: Date.now(),
				s: sym.toUpperCase(),
				k,
			});
		},
		pushMiniTicker: (sym: string, c: string, h: string, l: string, v: string) => {
			if (ENABLE_WEBSOCKET_LOG) {
				console.log("pushMiniTicker", `${sym}@miniTicker`, c, h, l, v);
			}
			emit(`${sym}@miniTicker`, {
				e: "24hrMiniTicker",
				E: Date.now(),
				s: sym.toUpperCase(),
				c,
				h,
				l,
				v,
			});
		},
		pushExecutionReport: (u: string, r: any) => {
			if (ENABLE_WEBSOCKET_LOG) {
				console.log("pushExecutionReport", u, r);
			}
			emitUser(u, r);
		},
		pushBalanceUpdate: (u: string, b: any) => {
			if (ENABLE_WEBSOCKET_LOG) {
				console.log("pushBalanceUpdate", u, b);
			}
			emitUser(u, b);
		},
	} as const;

	registerBroadcastFns(fns);
}
