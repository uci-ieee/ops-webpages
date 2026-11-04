/**
 * `neon env pull` writes `sslmode=require`, and it will do so again every time
 * it runs -- so pinning the stronger value in .env.local does not survive.
 * Normalize here instead.
 *
 * Why it matters: node-postgres currently treats `require` as `verify-full`,
 * but warns that a future major will adopt libpq semantics, where `require`
 * encrypts without verifying the server certificate. Neon presents a valid
 * publicly-trusted certificate, so full verification works today and should
 * keep working; being explicit means a driver upgrade cannot silently
 * downgrade us to an unverified connection.
 */
export function withStrictTls(url: string): string {
  return url.replace(/([?&])sslmode=(require|prefer|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
