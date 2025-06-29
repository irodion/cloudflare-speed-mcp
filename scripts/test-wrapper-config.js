#!/usr/bin/env node

import SpeedTest from '@cloudflare/speedtest';
import { CloudflareSpeedTestClient } from '../dist/clients/cloudflare.js';

async function testWithWrapperConfig() {
  console.log('🧪 Testing with exact wrapper configuration\n');
  
  // Get the config from our wrapper
  const client = new CloudflareSpeedTestClient();
  
  // Simulate what runSpeedTest does
  const config = {
    ...client.config.speedTestConfig
  };
  
  const options = { type: 'latency' };
  if (options.type && options.type !== 'full') {
    config.measurements = client.getTestMeasurements(options.type);
  }
  
  console.log('📊 Using config from wrapper:');
  console.log(JSON.stringify(config, null, 2));
  console.log();
  
  console.log('⚡ Running direct library test with wrapper config...');
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      // Direct SpeedTest promise with our wrapper's config
      new Promise((resolve, reject) => {
        const speedTest = new SpeedTest(config);

        speedTest.onFinish = (results) => {
          resolve(results);
        };

        speedTest.onError = (error) => {
          reject(new Error(`SpeedTest library error: ${error}`));
        };
      }),
      
      // 10 second timeout for this test
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Manual timeout after 10 seconds`));
        }, 10000);
      })
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ SUCCESS: Direct library with wrapper config completed in ${duration}ms`);
    
    try {
      const summary = result.getSummary();
      console.log(`   Latency: ${summary.latency || 'N/A'}ms`);
      console.log(`   Jitter: ${summary.jitter || 'N/A'}ms`);
    } catch (summaryError) {
      if (result.getUnloadedLatency) {
        console.log(`   Unloaded Latency: ${result.getUnloadedLatency()}ms`);
      }
    }

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`❌ FAILED after ${duration}ms: ${error.message}`);
  }
}

testWithWrapperConfig().catch(console.error);