/**
 * Capture Module - Factory
 * 
 * Factory function to create CaptureModule instances.
 * 
 * Requirements: 1.1, 1.2, 1.3
 */

import { CaptureModule } from './module';
import { getEventBus } from '../event-bus';
import { ConfigManager } from '../config-manager';

/**
 * Create a new CaptureModule instance
 * @param configPath - Optional path to configuration file
 */
export function createCaptureModule(configPath?: string): CaptureModule {
  const eventBus = getEventBus();
  const configManager = new ConfigManager(configPath);
  
  return new CaptureModule(eventBus, configManager);
}
