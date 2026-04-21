import * as crypto from "crypto";
import { KeystrokeEvent } from "./types";

/**
 * Thu thập và batch event log để gửi về server.
 */
export class EventCollector {
  private queue: KeystrokeEvent[] = [];
  private prevHash: string | null = null;
  private sessionId: string;
  private serverUrl: string;
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;

  constructor(sessionId: string, serverUrl: string, intervalMs = 30000) {
    this.sessionId = sessionId;
    this.serverUrl = serverUrl;
    this.intervalMs = intervalMs;
  }

  push(
    eventType: KeystrokeEvent["event_type"],
    payload: Record<string, unknown>,
  ): void {
    const client_ts = new Date().toISOString();
    const hash = this.computeHash(this.prevHash, eventType, payload, client_ts);

    this.queue.push({
      session_id: this.sessionId,
      event_type: eventType,
      payload,
      client_ts,
      prev_hash: this.prevHash,
    });

    this.prevHash = hash;
  }

  startBatching(token: string): void {
    this.timer = setInterval(() => this.flush(token), this.intervalMs);
  }

  stopBatching(token: string): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flush(token);
  }

  private async flush(token: string): Promise<void> {
    if (!this.queue.length) {
      return;
    }
    const batch = this.queue.splice(0, this.queue.length);

    try {
      await fetch(`${this.serverUrl}/api/events/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ events: batch }),
      });
    } catch {
      // Đưa lại vào queue nếu gửi thất bại
      this.queue.unshift(...batch);
    }
  }

  private computeHash(
    prevHash: string | null,
    eventType: string,
    payload: Record<string, unknown>,
    timestamp: string,
  ): string {
    const data = [
      prevHash || "GENESIS",
      eventType,
      JSON.stringify(payload),
      timestamp,
    ].join("|");
    return crypto.createHash("sha256").update(data).digest("hex");
  }
}
