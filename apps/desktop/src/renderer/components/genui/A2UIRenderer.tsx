/**
 * A2UIRenderer Component
 * Dynamically renders A2UI components from JSON configuration
 */
import React from 'react';
import { getComponentRenderer } from './A2UICatalog';

export interface A2UIComponentData {
  /** Component type string (e.g., "a2ui.StatCard") */
  type: string;

  /** Unique identifier for the component instance */
  id: string;

  /** Props to pass to the component */
  props: Record<string, any>;

  /** Child components */
  children?: A2UIComponentData[];

  /** Zone for layout grouping (optional) */
  zone?: string;

  /** Layout configuration (optional) */
  layout?: Record<string, string>;
}

export interface A2UIRendererProps {
  /** Component data to render */
  component: A2UIComponentData;
}

/**
 * A2UIRenderer Component
 * Recursively renders A2UI components from configuration
 */
export function A2UIRenderer({ component }: A2UIRendererProps): React.ReactElement {
  const Component = getComponentRenderer(component.type);

  if (!Component) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-400">
        Unknown component: {component.type}
      </div>
    );
  }

  // Recursively render child components
  const children = component.children?.map((child) => (
    <A2UIRenderer key={child.id} component={child} />
  ));

  return <Component {...component.props}>{children}</Component>;
}

export default A2UIRenderer;
