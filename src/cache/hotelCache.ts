import { HotelOffer } from '../domain/types';
import { normaliseName } from '../domain/offers';
import { config } from '../config';
import { getRedis } from './redis';

const NEGATIVE_INFINITY = '-inf';
const POSITIVE_INFINITY = '+inf';

function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

function indexKey(city: string): string {
  return `hotels:${cityKey(city)}:byPrice`;
}

function offersKey(city: string): string {
  return `hotels:${cityKey(city)}:offers`;
}

function metaKey(city: string): string {
  return `hotels:${cityKey(city)}:meta`;
}

export async function saveOffers(city: string, offers: HotelOffer[]): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.multi();

  pipeline.del(indexKey(city), offersKey(city), metaKey(city));

  if (offers.length > 0) {
    const scoreMembers: (string | number)[] = [];
    const fieldValues: string[] = [];

    for (const offer of offers) {
      const member = normaliseName(offer.name);
      scoreMembers.push(offer.price, member);
      fieldValues.push(member, JSON.stringify(offer));
    }

    pipeline.zadd(indexKey(city), ...scoreMembers);
    pipeline.hset(offersKey(city), ...fieldValues);
    pipeline.expire(indexKey(city), config.REDIS_TTL_SECONDS);
    pipeline.expire(offersKey(city), config.REDIS_TTL_SECONDS);
  }

  pipeline.hset(metaKey(city), {
    count: String(offers.length),
    cachedAt: new Date().toISOString(),
  });
  pipeline.expire(metaKey(city), config.REDIS_TTL_SECONDS);

  await pipeline.exec();
}

export async function readOffers(
  city: string,
  minPrice?: number,
  maxPrice?: number,
): Promise<HotelOffer[]> {
  const redis = getRedis();
  const min = minPrice ?? NEGATIVE_INFINITY;
  const max = maxPrice ?? POSITIVE_INFINITY;

  const members = await redis.zrangebyscore(indexKey(city), min, max);
  if (members.length === 0) return [];

  const raw = await redis.hmget(offersKey(city), ...members);

  return raw
    .filter((entry): entry is string => entry !== null)
    .map((entry) => JSON.parse(entry) as HotelOffer);
}

export async function pingRedis(): Promise<number> {
  const startedAt = Date.now();
  await getRedis().ping();
  return Date.now() - startedAt;
}
