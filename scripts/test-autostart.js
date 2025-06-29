#!/usr/bin/env node

import SpeedTest from '@cloudflare/speedtest';

async function testAutoStart() {
  console.log('🧪 Testing autoStart behavior\n');
  
  const config1 = {
    measurements: [{ type: 'latency', numPackets: 20 }],
    autoStart: false
  };
  
  const config2 = {
    measurements: [{ type: 'latency', numPackets: 20 }],
    // autoStart not specified (defaults to true?)
  };
  
  console.log('Test 1: autoStart: false');
  await testConfig(config1, 'autoStart false');
  
  console.log('\nTest 2: autoStart not specified');
  await testConfig(config2, 'autoStart default');
}

async function testConfig(config, name) {
  console.log(`📊 Config: ${JSON.stringify(config)}`);
  const startTime = Date.now();
  
  try {
    const result = await Promise.race([
      new Promise((resolve, reject) => {
        const speedTest = new SpeedTest(config);

        speedTest.onFinish = (results) => {
          resolve(results);
        };

        speedTest.onError = (error) => {
          reject(new Error(`SpeedTest error: ${error}`));
        };
        
        // If autoStart is false, we might need to manually start
        if (config.autoStart === false) {
          console.log('   🔄 Manually starting speedtest (autoStart is false)...');
          speedTest.play();
        }
      }),
      
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Timeout after 8 seconds`));
        }, 8000);
      })
    ]);

    const duration = Date.now() - startTime;
    console.log(`✅ ${name}: SUCCESS in ${duration}ms`);
    
    if (result.getUnloadedLatency) {
      console.log(`   Latency: ${result.getUnloadedLatency()}ms`);
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ ${name}: FAILED after ${duration}ms - ${error.message}`);
  }
}

testAutoStart().catch(console.error);