#!/usr/bin/env node

import { CloudflareSpeedTestClient } from '../dist/clients/cloudflare.js';

async function testTimeoutFix() {
  console.log('🧪 Testing timeout fix for CloudflareSpeedTestClient');
  
  const client = new CloudflareSpeedTestClient({
    timeouts: {
      DEFAULT: 30000,
      SPEED_TEST: 60000, // Set high default
      CONNECTION_INFO: 30000
    }
  });
  
  console.log('\n⏱️  Testing latency with 5-second timeout...');
  const startTime = Date.now();
  
  try {
    // This should complete quickly (< 1 second based on memory analysis)
    const results = await client.runSpeedTest({ 
      type: 'latency', 
      timeout: 5000  // 5 second timeout should be plenty
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ SUCCESS - Latency test completed in ${duration}ms`);
    console.log(`   Latency: ${results.getUnloadedLatency()}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ FAILED after ${duration}ms - ${error.message}`);
    console.log(`   Error code: ${error.code || 'unknown'}`);
  }
  
  console.log('\n⏱️  Testing with very short 100ms timeout...');
  const startTime2 = Date.now();
  
  try {
    // This should timeout quickly
    const results = await client.runSpeedTest({ 
      type: 'latency', 
      timeout: 100  // 100ms timeout - should definitely timeout
    });
    
    const duration = Date.now() - startTime2;
    console.log(`❌ FAILED - Should have timed out but completed in ${duration}ms`);
    
  } catch (error) {
    const duration = Date.now() - startTime2;
    if (error.message.includes('100ms')) {
      console.log(`✅ SUCCESS - Correctly timed out after ${duration}ms with 100ms timeout`);
    } else {
      console.log(`⚠️  PARTIAL - Timed out after ${duration}ms but wrong message: ${error.message}`);
    }
  }
}

testTimeoutFix().catch(console.error);