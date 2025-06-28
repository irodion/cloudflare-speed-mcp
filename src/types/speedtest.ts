export type SpeedTestMeasurement = {
  type: 'latency',
  numPackets: number
} | {
  type: 'download' | 'upload',
  bytes: number,
  count: number,
  bypassMinDuration?: boolean
} | {
  type: 'packetLoss',
  numPackets?: number,
  batchSize?: number,
  batchWaitTime?: number,
  responsesWaitTime?: number,
  connectionTimeout?: number,
};

export interface SpeedTestResults {
  getSummary(): {
    download?: number,
    upload?: number,
    latency?: number,
    jitter?: number,
    downLoadedLatency?: number,
    downLoadedJitter?: number,
    upLoadedLatency?: number,
    upLoadedJitter?: number,
    packetLoss?: number,
  };
  getDownloadBandwidth(): number | undefined;
  getUploadBandwidth(): number | undefined;
  getUnloadedLatency(): number | undefined;
  getPacketLoss(): number | undefined;
}

export interface SpeedTestSummary {
  meta: {
    startTime: string;
    endTime: string;
    duration: number;
    engine: string;
    version: string;
  };
  download: {
    bandwidth: number;
    bytes: number;
    duration: number;
  };
  upload: {
    bandwidth: number;
    bytes: number;
    duration: number;
  };
  latency: {
    jitter: number;
    high: number;
    low: number;
    mean: number;
  };
  packetLoss: number;
  server: ServerLocation;
}

export interface ServerLocation {
  name: string;
  location: string;
  country: string;
  city: string;
  region: string;
  latitude?: number;
  longitude?: number;
  distance?: number;
}

export interface SpeedTestConfig {
  autoStart?: boolean;
  downloadApiUrl?: string;
  uploadApiUrl?: string;
  turnServerUri?: string;
  turnServerUser?: string;
  turnServerPass?: string;
  includeCredentials?: boolean;
  measurements?: SpeedTestMeasurement[];
  measureDownloadLoadedLatency?: boolean;
  measureUploadLoadedLatency?: boolean;
  loadedLatencyThrottle?: number;
  bandwidthFinishRequestDuration?: number;
  estimatedServerTime?: number;
  latencyPercentile?: number;
  bandwidthPercentile?: number;
  bandwidthMinRequestDuration?: number;
  loadedRequestMinDuration?: number;
  loadedLatencyMaxPoints?: number;
}

export interface SpeedTestError extends Error {
  code: string;
  details?: unknown;
  retryable?: boolean;
}

export interface ConnectionInfo {
  ip: string;
  isp: string;
  country: string;
  region: string;
  city: string;
  timezone: string;
}

export type SpeedTestType = 'latency' | 'download' | 'upload' | 'packetLoss' | 'full';

export interface SpeedTestOptions {
  type?: SpeedTestType;
  timeout?: number;
  maxRetries?: number;
  serverLocation?: string;
}