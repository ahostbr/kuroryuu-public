// Hotspot data types for the guided tour system

export interface Hotspot {
  id: string;
  x: number;      // 0-1 normalized position
  y: number;      // 0-1 normalized position
  w: number;      // 0-1 normalized width
  h: number;      // 0-1 normalized height
  title: string;
  bodyMd: string; // Markdown content
  jumpRoute?: string; // Route to navigate to (e.g., "/kanban")
}

export interface Slide {
  id: string;
  imageSrc: string;
  title: string;
  hotspots: Hotspot[];
}

export interface HotspotData {
  slides: Slide[];
}

// Architecture diagram types
export interface ArchComponent {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  bodyMd: string;
  jumpRoute?: string;
  // For React graph rendering
  color?: string;
  icon?: string;
}

export interface SuggestedPath {
  id: string;
  label: string;
  components: string[]; // Component IDs in order
}

export interface ArchData {
  components: ArchComponent[];
  suggestedPaths: SuggestedPath[];
  edges: Array<{ from: string; to: string; label?: string }>;
}
