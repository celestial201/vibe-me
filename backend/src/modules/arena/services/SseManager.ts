import { Response } from 'express';
import { injectable } from 'inversify';

export interface SseEvent {
  type: string;
  courseId?: string;
  infiniteArenaEnabled?: boolean;
  timestamp?: string;
  [key: string]: any;
}

@injectable()
export class SseManager {
  private static instance: SseManager;
  private clients: Set<Response> = new Set();

  constructor() {
    if (!SseManager.instance) {
      SseManager.instance = this;
    }
    return SseManager.instance;
  }

  public static getInstance(): SseManager {
    if (!SseManager.instance) {
      SseManager.instance = new SseManager();
    }
    return SseManager.instance;
  }

  public addClient(res: Response): void {
    this.clients.add(res);
  }

  public removeClient(res: Response): void {
    this.clients.delete(res);
  }

  public broadcast(event: SseEvent): void {
    const payload = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };
    const message = `data: ${JSON.stringify(payload)}\n\n`;

    for (const client of this.clients) {
      try {
        client.write(message);
      } catch (err) {
        console.error('Error writing to SSE client:', err);
        this.clients.delete(client);
      }
    }
  }

  public getClientCount(): number {
    return this.clients.size;
  }
}
