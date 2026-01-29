export { HotspotImage } from './HotspotImage';
export { HotspotMarker } from './HotspotMarker';
export { HotspotPanel } from './HotspotPanel';
export type { Hotspot, Slide, HotspotData, ArchComponent, ArchData, SuggestedPath } from './types';

// Import hotspot data
import hotspotDataJson from './hotspot-data.json';
import type { HotspotData } from './types';

export const hotspotData: HotspotData = hotspotDataJson as HotspotData;
