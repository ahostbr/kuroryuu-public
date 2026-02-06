/**
 * GenUI - Generative UI System
 * Barrel export for A2UI component system
 */

// Renderer
export { A2UIRenderer } from './A2UIRenderer';
export type { A2UIRendererProps, A2UIComponentData } from './A2UIRenderer';

// Catalog
export {
  a2uiCatalog,
  getComponentRenderer,
  isComponentRegistered,
  getRegisteredComponentTypes,
} from './A2UICatalog';

// Layout Engine
export {
  ZONE_ORDER,
  getGridSpan,
  groupByZone,
  sortZones,
  getGridConfig,
} from './LayoutEngine';
export type { Zone, LayoutWidth } from './LayoutEngine';

// Panel components
export { GenUIPanel } from './GenUIPanel';
export { GenUIInput } from './GenUIInput';
export { GenUILoading } from './GenUILoading';
export { GenUIDashboard } from './GenUIDashboard';
export { GenUISourceView } from './GenUISourceView';

// Re-export all component categories
export * from './a2ui/Data';
export * from './a2ui/Summary';
export * from './a2ui/Instructional';
export * from './a2ui/Lists';
export * from './a2ui/Resources';
export * from './a2ui/People';
export * from './a2ui/News';
export * from './a2ui/Media';
export * from './a2ui/Comparison';
export * from './a2ui/Layout';
export * from './a2ui/Tags';
