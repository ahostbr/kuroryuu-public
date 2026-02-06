import { useGenUIStore } from '../stores/genui-store';

export function useGenUI() {
  const status = useGenUIStore(s => s.status);
  const progress = useGenUIStore(s => s.progress);
  const currentStep = useGenUIStore(s => s.currentStep);
  const documentTitle = useGenUIStore(s => s.documentTitle);
  const documentType = useGenUIStore(s => s.documentType);
  const layoutType = useGenUIStore(s => s.layoutType);
  const components = useGenUIStore(s => s.components);
  const componentsByZone = useGenUIStore(s => s.componentsByZone);
  const activityLog = useGenUIStore(s => s.activityLog);
  const errorMessage = useGenUIStore(s => s.errorMessage);
  const contentAnalysis = useGenUIStore(s => s.contentAnalysis);

  const generateDashboard = useGenUIStore(s => s.generateDashboard);
  const reset = useGenUIStore(s => s.reset);

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
  };
}
