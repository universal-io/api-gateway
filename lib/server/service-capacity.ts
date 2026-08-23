// The rule behind the service-wide ceiling, with none of its I/O.
//
// A leaf module for the same reason quota-state-cache.ts is one: the test
// runner strips types with plain node and cannot resolve `next/server`, so
// anything reachable from gateway.ts is unreachable from a test. The two
// decisions here are the ones worth testing — one of them decides whether a
// paying customer gets interrupted, the other whether the ceiling exists at
// all — so they live where a test can reach them.
//
// The counting, the caching and the throwing stay in gateway.ts, next to the
// per-tenant quota they are a sibling of.

export type ServiceCapacity = {
  /** null = the count was not taken. Not a count of zero. */
  used: number | null;
  /** null = no service-wide ceiling is configured. */
  limit: number | null;
};

/**
 * Which plans the service ceiling may refuse. Only the free one: a paid month
 * is not interruptible by a budget the payer is not spending from.
 *
 * A named predicate rather than an inline `=== "free"`, because this is the
 * line between "we stopped a runaway trial" and "we cut off a customer", and
 * it should be findable by that name.
 */
export function serviceCeilingApplies(plan: string): boolean {
  return plan === "free";
}

/**
 * Whether the service has spent its month.
 *
 * An absent ceiling is not an exhausted one, and neither is an absent count:
 * both read as "keep going", so a missing config row or a count that failed
 * cannot lock every free user out of the product (master-plan §3.3). The
 * failure mode of this function is deliberately availability, not safety —
 * the money it protects is bounded by a number an operator sets, while the
 * users it could lock out are not.
 */
export function serviceCapacityExhausted(capacity: ServiceCapacity): boolean {
  if (capacity.limit === null) return false;
  return (capacity.used ?? 0) >= capacity.limit;
}
