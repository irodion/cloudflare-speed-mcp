#!/usr/bin/env node

/**
 * Direct test of @cloudflare/speedtest library
 * Tests the raw library without our CloudflareSpeedTestClient wrapper
 * This will isolate whether timeout issues are from the library itself or our code
 */

import SpeedTest from '@cloudflare/speedtest';

async function testDirectCloudflareLibrary() {
  console.log('🚀 Testing @cloudflare/speedtest Library DIRECTLY\n');
  console.log('🎯 Bypassing our CloudflareSpeedTestClient wrapper to isolate the issue\n');

  // Test 1: Basic latency test (same config as our getTestMeasurements for 'latency')
  console.log('⚡ Test 1: Basic latency test (20 packets)...');
  await runDirectSpeedTest('Basic Latency', {
    measurements: [
      { type: 'latency', numPackets: 20 }
    ]
  }, 20000); // 20 second timeout

  console.log('\n' + '='.repeat(60) + '\n');

  // Add delay to prevent rate limiting
  console.log('⏳ Waiting 3 seconds before next test to prevent rate limiting...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Simple latency test (fewer packets)
  console.log('⚡ Test 2: Simple latency test (5 packets)...');
  await runDirectSpeedTest('Simple Latency', {
    measurements: [
      { type: 'latency', numPackets: 5 }
    ]
  }, 15000); // 15 second timeout

  console.log('\n' + '='.repeat(60) + '\n');

  // Add delay to prevent rate limiting
  console.log('⏳ Waiting 3 seconds before next test to prevent rate limiting...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 3: Minimal latency test (1 packet)
  console.log('⚡ Test 3: Minimal latency test (1 packet)...');
  await runDirectSpeedTest('Minimal Latency', {
    measurements: [
      { type: 'latency', numPackets: 1 }
    ]
  }, 10000); // 10 second timeout
}

async function runDirectSpeedTest(testName, config, timeoutMs) {
  console.log(`📊 Configuration: ${JSON.stringify(config)}`);
  console.log(`⏱️  Timeout: ${timeoutMs / 1000} seconds\n`);
  
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      // Direct SpeedTest promise
      new Promise((resolve, reject) => {
        const speedTest = new SpeedTest(config);

        speedTest.onFinish = (results) => {
          resolve(results);
        };

        speedTest.onError = (error) => {
          reject(new Error(`SpeedTest library error: ${error}`));
        };

        // Log any progress if available
        if (speedTest.onProgress) {
          speedTest.onProgress = (progress) => {
            console.log(`   Progress: ${JSON.stringify(progress)}`);
          };
        }
      }),
      
      // Timeout promise
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Manual timeout after ${timeoutMs / 1000} seconds`));
        }, timeoutMs);
      })
    ]);

    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ ${testName}: SUCCESS (took ${duration}ms)`);
    
    // Try to get results
    try {
      const summary = result.getSummary();
      console.log(`   Latency: ${summary.latency || 'N/A'}ms`);
      console.log(`   Jitter: ${summary.jitter || 'N/A'}ms`);
      console.log(`   Download: ${summary.download || 'N/A'} Mbps`);
    } catch (summaryError) {
      console.log(`   Results summary error: ${summaryError.message}`);
      
      // Try alternative methods to get data
      if (result.getUnloadedLatency) {
        console.log(`   Unloaded Latency: ${result.getUnloadedLatency()}ms`);
      }
    }
    
    console.log(`\n💡 ${testName} CONCLUSION: Library works for this configuration`);

  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`❌ ${testName}: FAILED after ${duration}ms`);
    console.log(`   Error: ${error.message}`);
    
    if (error.message.includes('Manual timeout')) {
      console.log(`\n🔍 TIMEOUT ANALYSIS for ${testName}:`);
      console.log(`   - Test ran for ${duration}ms`);
      console.log(`   - Manual timeout was set to ${timeoutMs}ms`);
      console.log('   - This suggests the library itself is taking too long');
      console.log('   - This is likely a network/server issue, not a code issue');
    } else {
      console.log(`\n❌ ${testName} CONCLUSION: Library returned an error`);
      console.log('   - This suggests an issue with the library or network connectivity');
    }
  }
}

testDirectCloudflareLibrary().catch(error => {
  console.error('💥 Direct library test failed:', error);
  process.exit(1);
});