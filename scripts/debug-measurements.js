#!/usr/bin/env node

import { CloudflareSpeedTestClient } from '../dist/clients/cloudflare.js';

function debugMeasurements() {
  console.log('🔍 Debugging measurements configuration\n');
  
  const client = new CloudflareSpeedTestClient();
  
  // Check what getTestMeasurements returns for 'latency'
  console.log('📋 Measurements for type "latency":');
  const latencyMeasurements = client.getTestMeasurements('latency');
  console.log(JSON.stringify(latencyMeasurements, null, 2));
  
  console.log('\n📋 Config speedTestConfig measurements:');
  console.log('Length:', client.config.speedTestConfig.measurements?.length || 0);
  if (client.config.speedTestConfig.measurements) {
    console.log('Types:', client.config.speedTestConfig.measurements.map(m => m.type));
  }
  
  console.log('\n🧪 Simulating runSpeedTest config creation...');
  const config = {
    ...client.config.speedTestConfig
  };
  console.log('Before override - measurements length:', config.measurements?.length || 0);
  
  const options = { type: 'latency' };
  if (options.type && options.type !== 'full') {
    config.measurements = client.getTestMeasurements(options.type);
  }
  console.log('After override - measurements length:', config.measurements?.length || 0);
  console.log('After override - measurements:', JSON.stringify(config.measurements, null, 2));
}

debugMeasurements();