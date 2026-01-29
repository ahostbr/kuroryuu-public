/**
 * Voice Input Module - Factory
 * 
 * Factory function to create VoiceInputModule instances.
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { VoiceInputModule } from './module';
import { getEventBus } from '../event-bus';
import { ConfigManager } from '../config-manager';

/**
 * Create a new VoiceInputModule instance
 * @param configPath - Optional path to configuration file
 */
export function createVoiceInputModule(configPath?: string): VoiceInputModule {
  const eventBus = getEventBus();
  const configManager = new ConfigManager(configPath);
  
  return new VoiceInputModule(eventBus, configManager);
}
