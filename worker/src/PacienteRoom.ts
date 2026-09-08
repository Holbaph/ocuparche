// PacienteRoom.ts — un Durable Object por paciente (idFromName(pacienteId)).
// Cada dispositivo con la app abierta en ese paciente mantiene un WebSocket
// acá; cuando alguien guarda/borra un registro, el Worker le avisa a este
// objeto (broadcast) y este reenvía el aviso a todos los conectados — así
// se enteran al instante los demás dispositivos, sin refrescar. No guarda
// los datos en sí (esos siguen en D1), solo coordina el "algo cambió, ve a
// buscarlo de nuevo".
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './types';

export class PacienteRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se espera una conexión WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Llamado por el Worker (RPC) apenas se guarda o borra un registro.
  async broadcast(message: string) {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // conexión ya muerta; la limpieza la maneja el propio runtime
      }
    }
  }

  // La app no manda mensajes propios por ahora — solo escucha. Igual hay
  // que definir el handler para que la API de hibernación funcione.
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer) {}

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    try {
      ws.close(code, reason);
    } catch {
      // ya cerrado
    }
  }

  async webSocketError(_ws: WebSocket, _error: unknown) {}
}
