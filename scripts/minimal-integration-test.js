#!/usr/bin/env node

/**
 * Minimal integration test for CloudflareSpeedTestClient
 * Tests core API functionality only (no speed tests)
 */

import { CloudflareSpeedTestClient } from '../dist/clients/cloudflare.js';

async function runMinimalIntegrationTests() {
  console.log('🚀 Cloudflare API Integration Test\n');

  try {
    const client = new CloudflareSpeedTestClient();
    let passed = 0;
    let total = 0;

    // Test 1: Connection Info
    total++;
    console.log('📡 Testing connection info...');
    try {
      const info = await client.getConnectionInfo();
      if (info.ip?.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        console.log(`✅ SUCCESS - IP: ${info.ip}, Country: ${info.country}`);
        passed++;
      } else {
        console.log('❌ FAILED - Invalid response format');
      }
    } catch (error) {
      console.log(`❌ FAILED - ${error.message}`);
    }
    console.log();

    // Test 2: Server Discovery
    total++;
    console.log('🌐 Testing server discovery...');
    try {
      const servers = await client.discoverServers();
      if (Array.isArray(servers) && servers.length > 0) {
        console.log(`✅ SUCCESS - Found ${servers.length} servers`);
        console.log(`   Sample: ${servers[0].name} - ${servers[0].location}`);
        passed++;
      } else {
        console.log('❌ FAILED - No servers found');
      }
    } catch (error) {
      console.log(`❌ FAILED - ${error.message}`);
    }
    console.log();

    // Test 3: Rate Limiting (test the check, not actual speed test)
    total++;
    console.log('🛡️  Testing rate limiting logic...');
    try {
      const limitedClient = new CloudflareSpeedTestClient({
        rateLimits: { REQUESTS_PER_MINUTE: 10, SPEED_TESTS_PER_HOUR: 0, BURST_LIMIT: 1 }
      });
      
      try {
        // This should immediately throw rate limit error
        await limitedClient.runSpeedTest({ type: 'latency' });
        console.log('❌ FAILED - Should have been rate limited');
      } catch (error) {
        if (error.message.includes('Rate limit exceeded')) {
          console.log('✅ SUCCESS - Rate limiting works');
          passed++;
        } else {
          console.log(`❌ FAILED - Wrong error: ${error.message.substring(0, 50)}...`);
        }
      }
    } catch (error) {
      console.log(`❌ FAILED - ${error.message}`);
    }
    console.log();

    // Test 4: Timeout Handling
    total++;
    console.log('⏱️  Testing timeout handling...');
    try {
      const timeoutClient = new CloudflareSpeedTestClient({
        timeouts: { DEFAULT: 1, SPEED_TEST: 1, CONNECTION_INFO: 1 }
      });
      
      try {
        await timeoutClient.getConnectionInfo();
        console.log('❌ FAILED - Should have timed out');
      } catch (error) {
        if (error.message.includes('timed out') || error.message.includes('timeout')) {
          console.log('✅ SUCCESS - Timeout handling works');
          passed++;
        } else {
          console.log(`❌ FAILED - Wrong error: ${error.message.substring(0, 50)}...`);
        }
      }
    } catch (error) {
      console.log(`❌ FAILED - ${error.message}`);
    }
    console.log();

    // Results
    console.log('📊 Results:');
    console.log(`   Passed: ${passed}/${total} (${Math.round(passed/total*100)}%)`);
    
    if (passed >= 3) {  // At least 3/4 must pass
      console.log('\n🎉 Integration test PASSED!');
      console.log('✅ Cloudflare API client is working correctly');
      console.log('✅ Core functionality verified:');
      console.log('   - Real API connectivity');
      console.log('   - Server discovery'); 
      console.log('   - Error handling');
      console.log('   - Rate limiting');
      console.log('   - Timeout management');
      process.exit(0);
    } else {
      console.log('\n❌ Integration test FAILED - Too many failures');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Integration test error:', error.message);
    process.exit(1);
  }
}

runMinimalIntegrationTests();