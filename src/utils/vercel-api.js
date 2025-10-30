/**
 * VercelAPI client for interacting with Vercel deployments and logs
 * Note: Currently uses mock data for development purposes.
 * Production implementation should use @vercel/client SDK.
 */
class VercelAPI {
  /**
   * Create a new VercelAPI instance
   * @param {string} token - Vercel API authentication token
   * @param {string} projectId - Vercel project identifier
   */
  constructor(token, projectId) {
    this.token = token;
    this.projectId = projectId;
    this.baseUrl = 'https://api.vercel.com';
  }

  /**
   * Fetch logs for a specific deployment
   * WARNING: Currently returns mock data for development purposes.
   * @param {string} deploymentId - Vercel deployment ID
   * @param {number} timeRange - Time range in milliseconds to fetch logs (default: 1 hour)
   * @returns {Promise<Object>} Log data with array of log entries
   */
  async fetchLogs(deploymentId, timeRange = 3600000) {
    // WARNING: Mock data - in production would use @vercel/client
    console.warn('[VercelAPI] fetchLogs: Returning mock data. Implement real API call for production.');

    return {
      logs: [
        { timestamp: Date.now(), message: 'OAuth callback received' },
        { timestamp: Date.now(), message: 'Error: redirect_uri_mismatch' }
      ],
      _isMockData: true
    };
  }

  /**
   * Get the latest deployment for the configured project
   * WARNING: Currently returns mock data for development purposes.
   * @returns {Promise<Object>} Deployment object with id and url
   */
  async getLatestDeployment() {
    // WARNING: Mock data - in production would query Vercel API
    console.warn('[VercelAPI] getLatestDeployment: Returning mock data. Implement real API call for production.');

    return {
      id: 'dpl_mock123',
      url: 'veria.cc',
      _isMockData: true
    };
  }
}

module.exports = VercelAPI;
