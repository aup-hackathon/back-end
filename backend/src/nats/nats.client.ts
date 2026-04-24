import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { JSONCodec, NatsConnection, connect } from 'nats';

import { CONSUMERS, STREAM_SUBJECTS } from './contracts';

type SubscriberMeta = {
  subject: string;
  deliveryCount: number;
  msgId: string | null;
};

type ExhaustedMeta<TPayload> = SubscriberMeta & {
  payload: TPayload;
  error: unknown;
};

type DurableSubscriberOptions<TPayload extends Record<string, unknown>> = {
  subject: string;
  durableName: string;
  payloadType?: new () => TPayload;
  handler: (payload: TPayload, meta: SubscriberMeta) => Promise<void>;
  onExhausted?: (meta: ExhaustedMeta<TPayload>) => Promise<void>;
};

@Injectable()
export class NatsClientService implements OnModuleDestroy {
  private readonly logger = new Logger(NatsClientService.name);
  private readonly codec = JSONCodec<Record<string, unknown>>();
  private connectionPromise: Promise<NatsConnection> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async publish<TPayload extends Record<string, unknown>>(
    subject: string,
    payload: TPayload,
    msgId: string,
  ): Promise<void> {
    const connection = await this.getConnection();
    const js = (connection as any).jetstream();
    await js.publish(subject, this.codec.encode(payload), {
      msgID: msgId,
    });
  }

  async ensureStreamAndConsumers(): Promise<void> {
    const connection = await this.getConnection();
    const jsm = await connection.jetstreamManager();
    const streamName = this.configService.get<string>('nats.streamName', 'FLOWFORGE');

    try {
      await jsm.streams.add({
        name: streamName,
        subjects: [...STREAM_SUBJECTS],
      });
    } catch (error) {
      this.logger.debug(`JetStream stream ensure skipped: ${(error as Error).message}`);
    }

    const consumers = [
      { subject: 'ai.tasks.result', durableName: CONSUMERS.AI_RESULT },
      { subject: 'ai.tasks.progress', durableName: CONSUMERS.AI_PROGRESS },
      { subject: 'ai.tasks.divergence.result', durableName: CONSUMERS.DIVERGENCE_RESULT },
      { subject: 'system.health.ping', durableName: CONSUMERS.HEALTH_PING },
    ];

    for (const consumer of consumers) {
      try {
        await jsm.consumers.add(streamName, {
          durable_name: consumer.durableName,
          filter_subject: consumer.subject,
          ack_policy: 'explicit',
          ack_wait: 30 * 1_000_000_000,
          max_deliver: 3,
          deliver_policy: 'new',
        } as any);
      } catch (error) {
        this.logger.debug(
          `JetStream consumer ensure skipped (${consumer.durableName}): ${(error as Error).message}`,
        );
      }
    }
  }

  async subscribeDurable<TPayload extends Record<string, unknown>>(
    options: DurableSubscriberOptions<TPayload>,
  ): Promise<void> {
    const connection = await this.getConnection();
    const js = (connection as any).jetstream();
    const streamName = this.configService.get<string>('nats.streamName', 'FLOWFORGE');

    const subscription = await js.subscribe(options.subject, {
      stream: streamName,
      config: {
        durable_name: options.durableName,
        ack_policy: 'explicit',
        ack_wait: 30 * 1_000_000_000,
        max_deliver: 3,
        deliver_policy: 'new',
      },
      manualAck: true,
    });

    void (async () => {
      for await (const rawMsg of subscription) {
        const msg = rawMsg as any;
        let payload = {} as TPayload;
        const deliveryCount = msg.info?.redeliveryCount ?? 1;
        const msgId = msg.headers?.get?.('Nats-Msg-Id') ?? null;

        try {
          payload = this.codec.decode(msg.data) as TPayload;
          if (options.payloadType) {
            const dto = plainToInstance(options.payloadType, payload);
            await validateOrReject(dto as object);
          }

          await options.handler(payload, {
            subject: options.subject,
            deliveryCount,
            msgId,
          });

          msg.ack();
        } catch (error) {
          if (deliveryCount >= 3) {
            if (options.onExhausted) {
              await options.onExhausted({
                subject: options.subject,
                deliveryCount,
                msgId,
                payload,
                error,
              });
            }
            msg.term?.();
            continue;
          }

          msg.nak?.(5_000);
        }
      }
    })();
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connectionPromise) return;
    const connection = await this.connectionPromise;
    await connection.drain();
  }

  private async getConnection(): Promise<NatsConnection> {
    if (!this.connectionPromise) {
      this.connectionPromise = this.connect();
    }
    return this.connectionPromise;
  }

  private async connect(): Promise<NatsConnection> {
    const servers = this.configService.getOrThrow<string>('nats.url');
    const user = this.configService.get<string>('nats.user');
    const pass = this.configService.get<string>('nats.password');

    return connect({
      servers,
      user,
      pass,
      timeout: 60_000,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2_000,
    });
  }
}
