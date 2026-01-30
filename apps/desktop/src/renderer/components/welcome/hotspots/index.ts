export { HotspotImage } from './HotspotImage';
export { HotspotMarker } from './HotspotMarker';
export { HotspotPanel } from './HotspotPanel';
export type { Hotspot, Slide, HotspotData, ArchComponent, ArchData, SuggestedPath } from './types';

// Import hotspot data
import hotspotDataJson from './hotspot-data.json';
import type { HotspotData } from './types';

// Import screenshot images for tour
import screenshotKanban from '../../../../../../../assets/screens/kanban_1.jpg';
import screenshotTerminals from '../../../../../../../assets/screens/TERMINALS_1.jpg';
import screenshotTraffic from '../../../../../../../assets/screens/http_1.jpg';
import screenshotCommandCenter from '../../../../../../../assets/screens/command_center_1.jpg';
import screenshotTray from '../../../../../../../assets/screens/tray_1.jpg';

// Map slide IDs to their screenshot images
const slideImageMap: Record<string, string> = {
  kanban: screenshotKanban,
  terminals: screenshotTerminals,
  monitor: screenshotTraffic,
  tray: screenshotTray,
  architecture: screenshotCommandCenter, // Use command center as architecture overview
};

// Build hotspotData with resolved image paths
const resolvedSlides = hotspotDataJson.slides.map((slide) => ({
  ...slide,
  imageSrc: slideImageMap[slide.id] || slide.imageSrc,
}));

export const hotspotData: HotspotData = {
  slides: resolvedSlides,
} as HotspotData;
