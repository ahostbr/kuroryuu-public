import { usePlaygroundStore } from '../stores/playground-store';

export function usePlayground() {
  const status = usePlaygroundStore(s => s.status);
  const progress = usePlaygroundStore(s => s.progress);
  const currentStep = usePlaygroundStore(s => s.currentStep);
  const documentTitle = usePlaygroundStore(s => s.documentTitle);
  const documentType = usePlaygroundStore(s => s.documentType);
  const layoutType = usePlaygroundStore(s => s.layoutType);
  const components = usePlaygroundStore(s => s.components);
  const componentsByZone = usePlaygroundStore(s => s.componentsByZone);
  const activityLog = usePlaygroundStore(s => s.activityLog);
  const errorMessage = usePlaygroundStore(s => s.errorMessage);
  const contentAnalysis = usePlaygroundStore(s => s.contentAnalysis);

  // Playground mode state
  const renderMode = usePlaygroundStore(s => s.renderMode);
  const playgroundHTML = usePlaygroundStore(s => s.playgroundHTML);
  const playgroundFileName = usePlaygroundStore(s => s.playgroundFileName);
  const promptOutput = usePlaygroundStore(s => s.promptOutput);
  const feedbackHistory = usePlaygroundStore(s => s.feedbackHistory);
  const playgroundFiles = usePlaygroundStore(s => s.playgroundFiles);

  const generateDashboard = usePlaygroundStore(s => s.generateDashboard);
  const reset = usePlaygroundStore(s => s.reset);

  // Playground mode actions
  const setRenderMode = usePlaygroundStore(s => s.setRenderMode);
  const loadPlaygroundHTML = usePlaygroundStore(s => s.loadPlaygroundHTML);
  const capturePromptOutput = usePlaygroundStore(s => s.capturePromptOutput);
  const sendFeedback = usePlaygroundStore(s => s.sendFeedback);
  const refreshPlaygroundFiles = usePlaygroundStore(s => s.refreshPlaygroundFiles);
  const addFeedbackEntry = usePlaygroundStore(s => s.addFeedbackEntry);

  const isIdle = status === 'idle';
  const isLoading = status === 'analyzing' || status === 'generating';
  const isComplete = status === 'complete';
  const isError = status === 'error';

  return {
    status, progress, currentStep,
    documentTitle, documentType, layoutType,
    components, componentsByZone, contentAnalysis,
    activityLog, errorMessage,
    generateDashboard, reset,
    isIdle, isLoading, isComplete, isError,
    // Playground mode
    renderMode, playgroundHTML, playgroundFileName,
    promptOutput, feedbackHistory, playgroundFiles,
    setRenderMode, loadPlaygroundHTML, capturePromptOutput,
    sendFeedback, refreshPlaygroundFiles, addFeedbackEntry,
  };
}
