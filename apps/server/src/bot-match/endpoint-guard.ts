/**
 * SSRF guard for EXTERNAL bot-match endpoints.
 *
 * The arbiter makes outbound HTTP requests to a URL a third party gives us. A
 * malicious party could hand us an internal address (cloud metadata at
 * 169.254.169.254, localhost, an RFC1918 service) to make our process fetch
 * internal resources. Before we ever point the arbiter at an external endpoint
 * we require HTTPS and verify the host resolves ONLY to public unicast
 * addresses.
 *
 * Residual risk: DNS rebinding (host resolves public here, private at connect
 * time) is not fully closed by a resolve-and-check — the real defense-in-depth
 * is running the arbiter in an egress-restricted environment (a process/network
 * that simply cannot reach internal ranges). This guard closes the obvious
 * "just give them an internal URL" hole; it is not a substitute for egress
 * isolation.
 *
 * Trusted endpoints (our own engine-worker at 127.0.0.1, the in-process
 * self-test) do NOT go through this guard — only endpoints marked `external`.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class UnsafeEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeEndpointError';
  }
}

/** Resolve a hostname to its IP strings. Injectable for tests. */
export type ResolveHostFn = (host: string) => Promise<string[]>;

const defaultResolveHost: ResolveHostFn = async (host) => {
  const results = await dnsLookup(host, { all: true });
  return results.map((entry) => entry.address);
};

export async function assertSafeExternalEndpoint(
  baseUrl: string,
  opts: { resolveHost?: ResolveHostFn } = {},
): Promise<void> {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new UnsafeEndpointError(`invalid endpoint URL: ${baseUrl}`);
  }
  if (url.protocol !== 'https:') {
    throw new UnsafeEndpointError(
      `external endpoint must use https (got ${url.protocol}): ${baseUrl}`,
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  const addresses = isIP(host) ? [host] : await (opts.resolveHost ?? defaultResolveHost)(host);
  if (addresses.length === 0) {
    throw new UnsafeEndpointError(`external endpoint host did not resolve: ${host}`);
  }
  for (const address of addresses) {
    if (!isPublicUnicastIp(address)) {
      throw new UnsafeEndpointError(
        `external endpoint resolves to a non-public address (${address}); refusing to connect: ${baseUrl}`,
      );
    }
  }
}

/** True only for a globally-routable unicast IP (rejects loopback, private,
 *  link-local incl. cloud metadata, CGNAT, ULA, multicast, unspecified). */
export function isPublicUnicastIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPublicIpv4(ip);
  if (version === 6) return isPublicIpv6(ip);
  return false;
}

function isPublicIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255))
    return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT (RFC6598)
  if (a >= 224) return false; // multicast (224/4) + reserved (240/4) + broadcast
  return true;
}

function isPublicIpv6(ip: string): boolean {
  const norm = (ip.toLowerCase().split('%')[0] ?? '').trim(); // drop any zone id
  if (norm === '::1' || norm === '::') return false; // loopback / unspecified
  // IPv4-mapped/embedded (::ffff:a.b.c.d and friends): classify the v4 part.
  const embeddedV4 = norm.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embeddedV4) return isPublicIpv4(embeddedV4[1] as string);
  const firstHextet = Number.parseInt(norm.split(':')[0] || '0', 16);
  if (Number.isNaN(firstHextet)) return false;
  if ((firstHextet & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((firstHextet & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((firstHextet & 0xfe00) === 0xfc00) return false; // fc00::/7 unique-local (incl. metadata fd00:ec2::)
  if ((firstHextet & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  return true;
}
