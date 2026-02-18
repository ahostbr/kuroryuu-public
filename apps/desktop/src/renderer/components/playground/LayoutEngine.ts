/**
 * Layout Engine
 * Utilities for grid-based layout management and zone organization
 */

/**
 * Predefined zone order for content organization
 */
export const ZONE_ORDER = [
  'hero',
  'metrics',
  'insights',
  'content',
  'media',
  'resources',
  'tags',
] as const;

export type Zone = typeof ZONE_ORDER[number];

/**
 * Width configuration for grid layout
 */
export type LayoutWidth = 'full' | 'half' | 'third' | 'quarter' | 'two-thirds';

/**
 * Get Tailwind grid span class based on layout width
 */
export function getGridSpan(component: { layout?: Record<string, string> }): string {
  const width = component.layout?.width || 'half';

  const spanMap: Record<string, string> = {
    full: 'col-span-12',
    half: 'col-span-6',
    third: 'col-span-4',
    quarter: 'col-span-3',
    'two-thirds': 'col-span-8',
  };

  return spanMap[width] || 'col-span-6';
}

/**
 * Group components by zone for organized layout rendering
 */
export function groupByZone<T extends { zone?: string }>(
  components: T[]
): Record<string, T[]> {
  return components.reduce((acc, comp) => {
    const zone = comp.zone || 'content';
    if (!acc[zone]) {
      acc[zone] = [];
    }
    acc[zone].push(comp);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Sort zones according to predefined order
 */
export function sortZones(zones: string[]): string[] {
  const orderMap = new Map(ZONE_ORDER.map((zone, idx) => [zone, idx]));

  return zones.sort((a, b) => {
    const orderA = orderMap.get(a as Zone) ?? 999;
    const orderB = orderMap.get(b as Zone) ?? 999;
    return orderA - orderB;
  });
}

/**
 * Get responsive grid configuration
 */
export function getGridConfig(columns: number = 2): string {
  const configs: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4',
  };

  return configs[columns] || configs[2];
}
