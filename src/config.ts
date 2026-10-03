import { z } from 'zod';

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SUPPLIER_A_URL: z.string().url().default('http://localhost:3000/supplierA/hotels'),
  SUPPLIER_B_URL: z.string().url().default('http://localhost:3000/supplierB/hotels'),
  SUPPLIER_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  SUPPLIER_A_FORCE_DOWN: booleanFlag.default('false'),
  SUPPLIER_B_FORCE_DOWN: booleanFlag.default('false'),

  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  TEMPORAL_ADDRESS: z.string().default('localhost:7233'),
  TEMPORAL_NAMESPACE: z.string().default('default'),
  TEMPORAL_TASK_QUEUE: z.string().default('hotel-offers'),
  WORKFLOW_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;
