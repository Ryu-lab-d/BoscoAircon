import dgram from 'react-native-udp';
import type UdpSocket from 'react-native-udp/lib/types/UdpSocket';
import { RoomSchedule } from '../types/timetable';
import { buildRoomPacket } from './udpProtocol';

export const DEFAULT_BROADCAST_ADDRESS = '255.255.255.255';

export interface BroadcastOptions {
  port: number;
  address?: string;
  /** Delay between packets in ms, to avoid flooding the microbits' receive buffers. */
  interPacketDelayMs?: number;
}

export interface SendResult {
  room: string;
  ok: boolean;
  error?: string;
}

/**
 * Broadcasts one UDP packet per room over the local network. Every microbit
 * on the network receives every packet and discards ones not addressed to
 * its own room code (see src/udp/udpProtocol.ts).
 */
export class TimetableBroadcaster {
  private socket: UdpSocket;
  private bound: Promise<void>;

  constructor(private options: BroadcastOptions) {
    this.socket = dgram.createSocket({ type: 'udp4' });

    // react-native-udp's setBroadcast() is fire-and-forget: on failure it
    // emits 'error' on the socket instead of rejecting anything. Node's
    // EventEmitter throws if an 'error' event has no listener, which was
    // crashing the whole JS instance (visible as a RedBox + app restart)
    // whenever setBroadcast's native call lost its race against a later
    // close() — see the two setTimeout/close comments below. This listener
    // must live for the socket's entire lifetime, not just until 'listening'
    // fires, so a late error can never go unhandled.
    this.socket.on('error', () => {
      /* swallowed: surfaced instead via the per-room error results below */
    });

    this.bound = new Promise((resolve, reject) => {
      const onError = (err: Error) => {
        this.socket.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        this.socket.removeListener('error', onError);
        // react-native-udp's native receive loop blocks on socket.receive()
        // with no timeout, and the JVM synchronizes DatagramSocket methods on
        // the same object monitor — so setBroadcast() can sit queued behind
        // it for several seconds on a quiet network. It's fire-and-forget
        // (no callback/promise in this library's JS API), so give it a beat
        // to actually land natively before we start sending, rather than
        // resolving immediately and racing a later close() against it.
        this.socket.setBroadcast(true);
        setTimeout(resolve, 250);
      };
      this.socket.once('error', onError);
      this.socket.once('listening', onListening);
      this.socket.bind();
    });
  }

  private sendRaw(packet: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.send(packet, undefined, undefined, this.options.port, this.options.address ?? DEFAULT_BROADCAST_ADDRESS, err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async sendPacket(packet: string): Promise<void> {
    await this.bound;
    await this.sendRaw(packet);
  }

  async sendSchedule(schedule: RoomSchedule): Promise<void> {
    await this.sendPacket(buildRoomPacket(schedule));
  }

  /**
   * Sends every schedule's packet, continuing past individual failures so
   * one bad room/address doesn't stop the rest of the batch from being
   * broadcast. Returns a per-room result instead of throwing.
   */
  async sendAll(schedules: RoomSchedule[]): Promise<SendResult[]> {
    await this.bound;
    const delay = this.options.interPacketDelayMs ?? 0;
    const results: SendResult[] = [];

    for (const schedule of schedules) {
      try {
        await this.sendRaw(buildRoomPacket(schedule));
        results.push({ room: schedule.room.code, ok: true });
      } catch (err) {
        results.push({ room: schedule.room.code, ok: false, error: (err as Error).message });
      }
      if (delay > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, delay));
      }
    }

    return results;
  }

  close(): void {
    this.socket.close();
  }
}

export async function broadcastSchedules(
  schedules: RoomSchedule[],
  options: BroadcastOptions,
): Promise<SendResult[]> {
  const broadcaster = new TimetableBroadcaster(options);
  try {
    return await broadcaster.sendAll(schedules);
  } finally {
    broadcaster.close();
  }
}
