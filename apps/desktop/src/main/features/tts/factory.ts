/**
 * TTS Module Factory
 * 
 * Factory function for creating TTS module instances
 */

import { TTSModule } from './module';
import { FeatureEventBus, getEventBus } from '../event-bus';
import { ConfigManager, getConfigManager } from '../config-manager';

/**
 * Create a new TTS module instance
 * Uses global singletons by default for consistency
 */
export function createTTSModule(
  eventBus?: FeatureEventBus,
  configManager?: ConfigManager
): TTSModule {
  const bus = eventBus || getEventBus();
  const config = configManager || getConfigManager();
  
  return new TTSModule(bus, config);
}
