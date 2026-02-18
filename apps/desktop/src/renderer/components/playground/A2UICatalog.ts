/**
 * A2UI Component Catalog
 * Central registry of all A2UI components for dynamic rendering
 */
import React from 'react';

// Data
import { StatCard } from './a2ui/Data';
import { MetricRow } from './a2ui/Data';
import { ProgressRing } from './a2ui/Data';
import { ComparisonBar } from './a2ui/Data';
import { DataTable } from './a2ui/Data';
import { MiniChart } from './a2ui/Data';

// Summary
import { TLDR } from './a2ui/Summary';
import { KeyTakeaways } from './a2ui/Summary';
import { ExecutiveSummary } from './a2ui/Summary';
import { TableOfContents } from './a2ui/Summary';

// Instructional
import { StepCard } from './a2ui/Instructional';
import { CodeBlock } from './a2ui/Instructional';
import { CalloutCard } from './a2ui/Instructional';
import { CommandCard } from './a2ui/Instructional';

// Lists
import { RankedItem } from './a2ui/Lists';
import { ChecklistItem } from './a2ui/Lists';
import { ProConItem } from './a2ui/Lists';
import { BulletPoint } from './a2ui/Lists';

// Resources
import { LinkCard } from './a2ui/Resources';
import { ToolCard } from './a2ui/Resources';
import { BookCard } from './a2ui/Resources';
import { RepoCard } from './a2ui/Resources';

// People
import { ProfileCard } from './a2ui/People';
import { CompanyCard } from './a2ui/People';
import { QuoteCard } from './a2ui/People';
import { ExpertTip } from './a2ui/People';

// News
import { HeadlineCard } from './a2ui/News';
import { TrendIndicator } from './a2ui/News';
import { TimelineEvent } from './a2ui/News';
import { NewsTicker } from './a2ui/News';

// Media
import { VideoCard } from './a2ui/Media';
import { ImageCard } from './a2ui/Media';
import { PlaylistCard } from './a2ui/Media';
import { PodcastCard } from './a2ui/Media';

// Comparison
import { ComparisonTable } from './a2ui/Comparison';
import { VsCard } from './a2ui/Comparison';
import { FeatureMatrix } from './a2ui/Comparison';
import { PricingTable } from './a2ui/Comparison';

// Layout
import { Section } from './a2ui/Layout';
import { Grid } from './a2ui/Layout';
import { Columns } from './a2ui/Layout';
import { Tabs } from './a2ui/Layout';
import { Accordion } from './a2ui/Layout';

// Tags
import { TagCloud } from './a2ui/Tags';
import { CategoryBadge } from './a2ui/Tags';
import { DifficultyBadge } from './a2ui/Tags';
import { StatusIndicator } from './a2ui/Tags';
import { PriorityBadge } from './a2ui/Tags';

/**
 * Component catalog mapping component type strings to React components
 */
export const a2uiCatalog: Record<string, React.ComponentType<any>> = {
  // Data
  "a2ui.StatCard": StatCard,
  "a2ui.MetricRow": MetricRow,
  "a2ui.ProgressRing": ProgressRing,
  "a2ui.ComparisonBar": ComparisonBar,
  "a2ui.DataTable": DataTable,
  "a2ui.MiniChart": MiniChart,

  // Summary
  "a2ui.TLDR": TLDR,
  "a2ui.KeyTakeaways": KeyTakeaways,
  "a2ui.ExecutiveSummary": ExecutiveSummary,
  "a2ui.TableOfContents": TableOfContents,

  // Instructional
  "a2ui.StepCard": StepCard,
  "a2ui.CodeBlock": CodeBlock,
  "a2ui.CalloutCard": CalloutCard,
  "a2ui.CommandCard": CommandCard,

  // Lists
  "a2ui.RankedItem": RankedItem,
  "a2ui.ChecklistItem": ChecklistItem,
  "a2ui.ProConItem": ProConItem,
  "a2ui.BulletPoint": BulletPoint,

  // Resources
  "a2ui.LinkCard": LinkCard,
  "a2ui.ToolCard": ToolCard,
  "a2ui.BookCard": BookCard,
  "a2ui.RepoCard": RepoCard,

  // People
  "a2ui.ProfileCard": ProfileCard,
  "a2ui.CompanyCard": CompanyCard,
  "a2ui.QuoteCard": QuoteCard,
  "a2ui.ExpertTip": ExpertTip,

  // News
  "a2ui.HeadlineCard": HeadlineCard,
  "a2ui.TrendIndicator": TrendIndicator,
  "a2ui.TimelineEvent": TimelineEvent,
  "a2ui.NewsTicker": NewsTicker,

  // Media
  "a2ui.VideoCard": VideoCard,
  "a2ui.ImageCard": ImageCard,
  "a2ui.PlaylistCard": PlaylistCard,
  "a2ui.PodcastCard": PodcastCard,

  // Comparison
  "a2ui.ComparisonTable": ComparisonTable,
  "a2ui.VsCard": VsCard,
  "a2ui.FeatureMatrix": FeatureMatrix,
  "a2ui.PricingTable": PricingTable,

  // Layout
  "a2ui.Section": Section,
  "a2ui.Grid": Grid,
  "a2ui.Columns": Columns,
  "a2ui.Tabs": Tabs,
  "a2ui.Accordion": Accordion,

  // Tags
  "a2ui.TagCloud": TagCloud,
  "a2ui.CategoryBadge": CategoryBadge,
  "a2ui.DifficultyBadge": DifficultyBadge,
  "a2ui.StatusIndicator": StatusIndicator,
  "a2ui.PriorityBadge": PriorityBadge,
};

/**
 * Get a component renderer by type string
 */
export function getComponentRenderer(type: string): React.ComponentType<any> | undefined {
  return a2uiCatalog[type];
}

/**
 * Check if a component type is registered
 */
export function isComponentRegistered(type: string): boolean {
  return type in a2uiCatalog;
}

/**
 * Get all registered component types
 */
export function getRegisteredComponentTypes(): string[] {
  return Object.keys(a2uiCatalog);
}
