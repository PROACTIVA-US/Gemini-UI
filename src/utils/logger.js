class Logger {
  constructor(verbose = false) {
    this.verbose = verbose;
    this.logs = [];
  }

  info(message, data = null) {
    const log = { level: 'INFO', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    console.log(`ℹ️  ${message}`, data || '');
  }

  success(message, data = null) {
    const log = { level: 'SUCCESS', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    console.log(`✅ ${message}`, data || '');
  }

  error(message, data = null) {
    const log = { level: 'ERROR', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    console.error(`❌ ${message}`, data || '');
  }

  debug(message, data = null) {
    const log = { level: 'DEBUG', message, data, timestamp: new Date().toISOString() };
    this.logs.push(log);
    if (this.verbose) {
      console.log(`🔍 ${message}`, data || '');
    }
  }

  step(stepNumber, totalSteps, stateName) {
    const message = `[${stepNumber}/${totalSteps}] STATE: ${stateName}`;
    console.log(`\n${'='.repeat(50)}\n${message}\n${'='.repeat(50)}`);
    this.logs.push({ level: 'STEP', message, timestamp: new Date().toISOString() });
  }

  getLogs() {
    return this.logs;
  }

  saveLogs(filepath) {
    const fs = require('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.logs, null, 2));
  }
}

module.exports = Logger;
