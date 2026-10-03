import { randomUUID } from 'node:crypto';
import { Connection, Client, WorkflowFailedError } from '@temporalio/client';
import { config } from '../config';
import { logger } from '../lib/logger';
import { OrchestrationError } from '../lib/errors';
import { HotelSearchInput, HotelSearchResult } from '../domain/types';
import type { hotelSearchWorkflow } from './workflows';

let clientPromise: Promise<Client> | null = null;

async function createClient(): Promise<Client> {
  const connection = await Connection.connect({
    address: config.TEMPORAL_ADDRESS,
    connectTimeout: '5s',
  });

  logger.info({ address: config.TEMPORAL_ADDRESS }, 'temporal client connected');

  return new Client({ connection, namespace: config.TEMPORAL_NAMESPACE });
}

export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createClient().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

export async function runHotelSearch(input: HotelSearchInput): Promise<HotelSearchResult> {
  let client: Client;
  try {
    client = await getTemporalClient();
  } catch (error) {
    throw new OrchestrationError('Unable to reach the Temporal service', {
      cause: error instanceof Error ? error.message : String(error),
    });
  }

  const workflowId = `hotel-search:${input.city.trim().toLowerCase()}:${randomUUID()}`;

  try {
    return await client.workflow.execute<typeof hotelSearchWorkflow>('hotelSearchWorkflow', {
      taskQueue: config.TEMPORAL_TASK_QUEUE,
      workflowId,
      args: [input],
      workflowExecutionTimeout: config.WORKFLOW_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof WorkflowFailedError) {
      throw new OrchestrationError(error.cause?.message ?? 'Hotel search workflow failed', {
        workflowId,
      });
    }
    throw error;
  }
}

export async function pingTemporal(): Promise<number> {
  const startedAt = Date.now();
  const client = await getTemporalClient();
  await client.connection.workflowService.getSystemInfo({ namespace: config.TEMPORAL_NAMESPACE });
  return Date.now() - startedAt;
}

export async function closeTemporalClient(): Promise<void> {
  if (!clientPromise) return;
  const client = await clientPromise.catch(() => null);
  clientPromise = null;
  await client?.connection.close().catch(() => undefined);
}
