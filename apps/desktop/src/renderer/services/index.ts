/**
 * Service Clients Index
 * 
 * Re-exports MCP_CORE and Gateway clients for easy import
 */

export { mcpClient } from './mcp-client';
export { gatewayClient } from './gateway-client';

// Also export individual functions for tree-shaking
export {
  checkMcpHealth,
  listMcpTools,
  inboxSend,
  inboxList,
  inboxClaim,
  inboxComplete,
  checkpointSave,
  checkpointList,
  checkpointLoad,
  ragQuery,
  ragIndex,
  ragStatus,
} from './mcp-client';

export {
  checkGatewayHealth,
  listBackends,
  chat,
  invokeHarness,
  mcpViaGateway,
  generateRoadmap,
  generateIdeas,
  generateChangelog,
} from './gateway-client';

// Model registry for provider/model discovery
export {
  getClaudeModels,
  fetchLMStudioModels,
  fetchGatewayModels,
  fetchCLIProxyModels,
  fetchAllModels,
  fetchModelsForProvider,
  checkProviderHealth,
  checkAllProvidersHealth,
  getCurrentBackend,
} from './model-registry';
