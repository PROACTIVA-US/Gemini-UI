class VercelAPI {
  constructor(token, projectId) {
    this.token = token;
    this.projectId = projectId;
    this.baseUrl = 'https://api.vercel.com';
  }

  async fetchLogs(deploymentId, timeRange = 3600000) {
    // Simplified - in production would use @vercel/client
    // For now, return mock structure
    return {
      logs: [
        { timestamp: Date.now(), message: 'OAuth callback received' },
        { timestamp: Date.now(), message: 'Error: redirect_uri_mismatch' }
      ]
    };
  }

  async getLatestDeployment() {
    // Mock - returns latest deployment ID
    return { id: 'dpl_mock123', url: 'veria.cc' };
  }
}

module.exports = VercelAPI;
