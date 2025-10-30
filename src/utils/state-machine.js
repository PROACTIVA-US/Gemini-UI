class StateMachine {
  constructor(provider, states) {
    this.provider = provider;
    this.states = states;
    this.currentIndex = 0;
    this.history = [];
    this.maxRetries = 3;
    this.retryCount = 0;
  }

  getCurrentState() {
    return this.states[this.currentIndex];
  }

  getNextState() {
    if (this.currentIndex < this.states.length - 1) {
      return this.states[this.currentIndex + 1];
    }
    return null;
  }

  advance() {
    if (this.currentIndex < this.states.length - 1) {
      this.history.push({
        state: this.getCurrentState(),
        timestamp: new Date().toISOString(),
        success: true
      });
      this.currentIndex++;
      this.retryCount = 0;
      return true;
    }
    return false;
  }

  retry() {
    this.retryCount++;
    if (this.retryCount >= this.maxRetries) {
      this.history.push({
        state: this.getCurrentState(),
        timestamp: new Date().toISOString(),
        success: false,
        reason: 'Max retries exceeded'
      });
      return false;
    }
    return true;
  }

  isComplete() {
    return this.currentIndex === this.states.length - 1;
  }

  reset() {
    this.currentIndex = 0;
    this.retryCount = 0;
    this.history = [];
  }

  getHistory() {
    return this.history;
  }
}

module.exports = StateMachine;
