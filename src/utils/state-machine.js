class StateMachine {
  constructor(provider, states) {
    this.provider = provider;
    this.states = states;
    this.currentIndex = 0;
    this.history = [];
    this.maxRetries = 3;
    this.retryCount = 0;
    this.actionsInCurrentState = 0;  // NEW: Track actions per state
    this.maxActionsPerState = 10;    // NEW: Prevent infinite loops
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
    if (this.currentIndex < this.states.length) {
      this.history.push({
        state: this.getCurrentState(),
        timestamp: new Date().toISOString(),
        success: true,
        actionsPerformed: this.actionsInCurrentState  // NEW
      });
      this.currentIndex++;
      this.retryCount = 0;
      this.actionsInCurrentState = 0;  // NEW: Reset counter
      return true;
    }
    return false;
  }

  /**
   * Attempts to retry the current state.
   * Note: maxRetries=3 means 4 total attempts (1 initial + 3 retries).
   * @returns {boolean} True if retry is allowed, false if max retries exceeded
   */
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

  /**
   * Checks if the state machine has completed all states.
   * The machine is considered complete when we've advanced past the last state.
   * @returns {boolean} True if all states have been executed, false otherwise
   */
  isComplete() {
    return this.currentIndex >= this.states.length;
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
