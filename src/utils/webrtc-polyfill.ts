import wrtc from '@roamhq/wrtc';

/**
 * Minimal, safe polyfill for running @cloudflare/speedtest in Node.js.
 *
 * The speedtest library expects browser APIs:
 *   - WebRTC (RTCPeerConnection, etc.) — for packet loss measurement
 *   - Performance API (getEntriesByName) — for bandwidth timing
 *   - fetch — already available in Node 18+, also provided by isomorphic-fetch
 *
 * This polyfill sets globals on `globalThis` ONLY. It does NOT:
 *   - Modify Object.prototype
 *   - Patch Object.hasOwnProperty or Object.getOwnPropertyDescriptor
 *   - Generate fake/random measurement data
 *
 * For bandwidth, transferSize is set to 0 so the library uses its built-in
 * estimation fallback: numBytes * 1.005 (adds ~0.5% for HTTP headers).
 * Timing data (duration, TTFB) is tracked from real fetch calls.
 */

// Track fetch request timings for performance entries
const fetchTimings = new Map<
  string,
  { fetchStart: number; responseStart: number; responseEnd: number }
>();

let polyfillInstalled = false;

export function setupWebRTCPolyfill(): void {
  if (polyfillInstalled) return;
  polyfillInstalled = true;

  installWebRTCGlobals();
  installPerformancePolyfill();
  installFetchTimingWrapper();
}

/**
 * Set WebRTC globals from @roamhq/wrtc (native WebRTC for Node.js).
 * Only sets them if not already defined.
 */
function installWebRTCGlobals(): void {
  const globals: Record<string, unknown> = {
    RTCPeerConnection: wrtc.RTCPeerConnection,
    RTCSessionDescription: wrtc.RTCSessionDescription,
    RTCIceCandidate: wrtc.RTCIceCandidate,
    RTCDataChannel: wrtc.RTCDataChannel,
    MediaStream: wrtc.MediaStream,
    MediaStreamTrack: wrtc.MediaStreamTrack,
  };

  for (const [name, value] of Object.entries(globals)) {
    if (typeof (globalThis as Record<string, unknown>)[name] === 'undefined') {
      (globalThis as Record<string, unknown>)[name] = value;
    }
  }
}

/**
 * Patch performance.getEntriesByName to return timing entries for fetch calls.
 *
 * The speedtest library calls:
 *   performance.getEntriesByName(url).slice(-1)[0]
 *
 * and reads: transferSize, duration, responseStart, responseEnd, fetchStart
 *
 * In Node.js, performance.getEntriesByName won't have entries for fetch() calls
 * (no PerformanceResourceTiming). We return entries with real timing data
 * but transferSize=0 so the library's estimation fallback kicks in.
 */
function installPerformancePolyfill(): void {
  const perf = globalThis.performance;
  if (!perf) return;

  const originalGetEntriesByName = perf.getEntriesByName.bind(perf);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (perf as any).getEntriesByName = function (
    name: string,
    type?: string
  ): PerformanceEntry[] {
    // Try the real implementation first
    const entries = originalGetEntriesByName(name, type);
    if (entries && entries.length > 0) {
      return entries;
    }

    // If no entries found, check our fetch timing tracker
    const timing = fetchTimings.get(name);
    if (timing) {
      // Return a synthetic entry with real timing, transferSize=0
      // transferSize=0 triggers the library's estimation: numBytes * 1.005
      return [
        {
          name,
          entryType: 'resource',
          startTime: timing.fetchStart,
          duration: timing.responseEnd - timing.fetchStart,
          transferSize: 0,
          encodedBodySize: 0,
          decodedBodySize: 0,
          fetchStart: timing.fetchStart,
          responseStart: timing.responseStart,
          responseEnd: timing.responseEnd,
          requestStart: timing.fetchStart,
          connectStart: timing.fetchStart,
          connectEnd: timing.fetchStart,
          domainLookupStart: timing.fetchStart,
          domainLookupEnd: timing.fetchStart,
          secureConnectionStart: timing.fetchStart,
          redirectStart: 0,
          redirectEnd: 0,
          workerStart: 0,
          nextHopProtocol: 'h2',
          toJSON() {
            return this;
          },
        } as unknown as PerformanceEntry,
      ];
    }

    return [];
  };
}

/**
 * Wrap globalThis.fetch to record real timing data for each request URL.
 * This feeds into the performance polyfill above.
 *
 * Timing map is bounded — entries older than 60s are cleaned periodically.
 */
function installFetchTimingWrapper(): void {
  if (!globalThis.fetch) return;

  const originalFetch = globalThis.fetch;

  /* eslint-disable no-undef */
  globalThis.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    /* eslint-enable no-undef */
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    const fetchStart = performance.now();

    const response = await originalFetch.call(globalThis, input, init);

    const responseStart = performance.now();

    // Wrap the body consumption to capture responseEnd timing.
    // The speedtest library reads the body, then checks performance entries.
    // We use a proxy to detect when body methods are called.
    const originalClone = response.clone.bind(response);
    const timingRecord = {
      fetchStart,
      responseStart,
      responseEnd: responseStart, // Updated when body is consumed
    };
    fetchTimings.set(url, timingRecord);

    // Update responseEnd when body is consumed
    const wrapBodyMethod = <T>(
      method: () => Promise<T>
    ): (() => Promise<T>) => {
      return async function (this: Response): Promise<T> {
        const result = await method.call(response);
        timingRecord.responseEnd = performance.now();
        fetchTimings.set(url, timingRecord);
        return result;
      };
    };

    // Create a light wrapper that updates timing on body consumption
    const wrappedResponse = new Proxy(response, {
      get(target, prop, receiver): unknown {
        if (
          prop === 'text' ||
          prop === 'json' ||
          prop === 'arrayBuffer' ||
          prop === 'blob'
        ) {
          return wrapBodyMethod(
            target[prop as keyof Response] as () => Promise<unknown>
          );
        }
        if (prop === 'clone') {
          return originalClone;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    // Periodically clean old entries (keep map bounded)
    if (fetchTimings.size > 100) {
      const now = performance.now();
      for (const [key, value] of fetchTimings) {
        if (now - value.fetchStart > 60000) {
          fetchTimings.delete(key);
        }
      }
    }

    return wrappedResponse;
  };
}
