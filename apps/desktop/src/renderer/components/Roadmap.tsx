/**
 * Roadmap Screen
 * 
 * Feature roadmap with:
 * - Kanban view (Backlog/Planned/In Progress/Shipped)
 * - Feature cards with priority/complexity/impact
 * - Feature detail panel
 * - AI roadmap generation
 * - Add feature dialog
 * - Drag-drop reordering
 */
import { useState, useRef, useEffect } from 'react';
import {
  Map,
  Plus,
  Trash2,
  BookOpen,
  TrendingUp,
  Loader2,
  X,
  ChevronRight,
  Settings,
  RefreshCw,
  Calendar,
  Tag,
  Target,
  Zap,
  Flag,
  ArrowRight,
  Edit,
  GripVertical,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { DRAGON_ASCII } from '../constants/dragon-ascii';
import { useRoadmapStore } from '../stores/roadmap-store';
import { useTaskStore } from '../stores/task-store';
import type { RoadmapFeature, FeatureStatus, FeaturePriority, FeatureComplexity, FeatureImpact } from '../types/roadmap';
import type { Task } from '../types/task';
import { FEATURE_STATUS_CONFIG, PRIORITY_COLORS, COMPLEXITY_VALUES } from '../types/roadmap';
import { toast } from './ui/toast';

// ============================================================================
// RoadmapEmptyState - Config panel + Generate button
// ============================================================================
function RoadmapEmptyState({ onGenerate }: { onGenerate: () => void }) {
  const { config, setConfig } = useRoadmapStore();
  const [showConfig, setShowConfig] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 600);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-full min-h-0 flex flex-col items-center relative overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at center, rgba(50,20,8,0.4) 0%, transparent 70%)' }}
    >
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)',
        }}
      />

      {/* Scrollable content column */}
      <div className="relative z-[3] h-full min-h-0 flex flex-col items-center gap-2 px-4 pt-8 pb-12 overflow-y-auto max-w-2xl w-full">
        {/* Kanji */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="font-serif leading-none"
          style={{
            fontSize: isCompact ? '2rem' : 'clamp(2rem, 4vw, 3rem)',
            color: '#c9a962',
            textShadow: '0 0 30px rgba(201,162,39,0.4), 0 0 60px rgba(201,162,39,0.15)',
            letterSpacing: '0.15em',
          }}
        >
          黒龍幻霧
        </motion.div>

        {/* Subtitle */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="font-mono uppercase tracking-[0.25em]"
          style={{ fontSize: '10px', color: 'rgba(201,162,39,0.5)' }}
        >
          KURORYUU GENMU
        </motion.div>

        {/* Dragon ASCII */}
        {!isCompact && (
          <motion.pre
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            aria-hidden="true"
            className="leading-[1.15] overflow-hidden text-center mt-2 cursor-default transition-all duration-300"
            style={{
              fontSize: 'clamp(0.3rem, 0.85vw, 0.6rem)',
              color: '#8b2635',
              animation: 'dragonBreathe 6s ease-in-out infinite',
              fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
              fontVariantLigatures: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#a82d3f';
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.textShadow = '0 0 12px rgba(139,38,53,0.6), 0 0 24px rgba(139,38,53,0.6), 0 0 48px rgba(139,38,53,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#8b2635';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.textShadow = '';
            }}
          >
            {DRAGON_ASCII}
          </motion.pre>
        )}

        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isCompact ? 0.3 : 0.6, duration: 0.4 }}
          className="font-mono tracking-[0.5em] text-xs mt-1"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          K U R O R Y U U
        </motion.div>

        {/* Separator */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: isCompact ? 0.4 : 0.7, duration: 0.5 }}
          className="w-48 h-px mt-3 mb-3"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.5), transparent)' }}
        />

        {/* Title + Description */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isCompact ? 0.5 : 0.8, duration: 0.4 }}
          className="text-center space-y-2"
        >
          <h2
            className="text-2xl font-semibold"
            style={{ color: '#c9a962', textShadow: '0 0 20px rgba(201,162,39,0.3)' }}
          >
            Chart Your Course
          </h2>
          <p className="text-muted-foreground max-w-md text-sm">
            Let AI analyze your project and generate a strategic roadmap with features,
            priorities, and timeline suggestions.
          </p>
        </motion.div>

        {/* Terminal-style buttons */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isCompact ? 0.6 : 0.9, duration: 0.4 }}
          className="flex items-center gap-4 mt-4"
        >
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="font-mono text-sm uppercase px-6 py-3 transition-all duration-[400ms] hover:translate-y-[-2px]"
            style={{
              border: '1px solid rgba(122,117,109,0.3)',
              color: 'rgba(122,117,109,0.8)',
              letterSpacing: '0.1em',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#c9a962';
              e.currentTarget.style.borderColor = 'rgba(201,169,98,0.5)';
              e.currentTarget.style.textShadow = '0 0 10px rgba(201,169,98,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(122,117,109,0.8)';
              e.currentTarget.style.borderColor = 'rgba(122,117,109,0.3)';
              e.currentTarget.style.textShadow = 'none';
            }}
          >
            <Settings className="w-4 h-4 inline mr-2 -mt-0.5" />
            &gt; Configure
          </button>
          <button
            onClick={onGenerate}
            className="font-mono text-sm uppercase px-6 py-3 transition-all duration-[400ms] hover:translate-y-[-2px]"
            style={{
              border: '1px solid rgba(201,169,98,0.4)',
              color: '#c9a962',
              letterSpacing: '0.1em',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(201,169,98,0.7)';
              e.currentTarget.style.textShadow = '0 0 15px rgba(201,169,98,0.6)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(201,169,98,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(201,169,98,0.4)';
              e.currentTarget.style.textShadow = 'none';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Map className="w-4 h-4 inline mr-2 -mt-0.5" />
            &gt; Generate Roadmap
          </button>
        </motion.div>

        {/* Config Panel */}
        <AnimatePresence>
          {showConfig && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md mt-4 p-4 rounded-xl text-left overflow-y-auto"
              style={{
                background: 'rgba(18,16,14,0.95)',
                border: '1px solid rgba(201,162,39,0.2)',
                backdropFilter: 'blur(10px)',
                maxHeight: 'min(28rem, calc(100vh - 16rem))',
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-foreground text-sm">Configuration</h3>
                <button
                  onClick={() => setShowConfig(false)}
                  className="p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Product Vision */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Product Vision</label>
                  <textarea
                    value={config.productVision || ''}
                    onChange={(e) => setConfig({ productVision: e.target.value })}
                    placeholder="Describe your product vision..."
                    rows={2}
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Target Audience */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Target Audience</label>
                  <input
                    type="text"
                    value={config.targetAudience || ''}
                    onChange={(e) => setConfig({ targetAudience: e.target.value })}
                    placeholder="e.g., Developers, Startups, Enterprise"
                    className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                </div>

                {/* Timeframe */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Timeframe</label>
                  <div className="flex gap-2">
                    {(['quarter', 'half-year', 'year'] as const).map(tf => (
                      <button
                        key={tf}
                        onClick={() => setConfig({ timeframe: tf })}
                        className={`flex-1 px-3 py-2 rounded-lg text-sm transition-colors ${
                          config.timeframe === tf
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : 'bg-secondary text-muted-foreground border border-border hover:border-muted-foreground'
                        }`}
                      >
                        {tf === 'quarter' ? 'Quarter' : tf === 'half-year' ? '6 Months' : 'Year'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// GenerationProgressScreen
// ============================================================================
function GenerationProgressScreen({ onCancel }: { onCancel: () => void }) {
  const { generationProgress, features } = useRoadmapStore();

  // Show "Thinking..." when waiting for LLM response (no features yet and progress < 50)
  const isThinking = features.length === 0 && generationProgress < 50;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400/20 to-purple-500/20 flex items-center justify-center mb-6 animate-pulse">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2">
        Building Roadmap...
      </h2>

      {isThinking ? (
        <p className="text-muted-foreground mb-6">
          Thinking
          <span className="inline-flex ml-0.5">
            <span className="animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1s' }}>.</span>
            <span className="animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1s' }}>.</span>
          </span>
        </p>
      ) : (
        <>
          <p className="text-muted-foreground mb-6">
            Identified {features.length} features so far
          </p>

          {/* Progress Bar */}
          <div className="w-full max-w-sm mb-6">
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {Math.round(generationProgress)}% complete
            </div>
          </div>
        </>
      )}

      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <X className="w-4 h-4" />
        Cancel
      </button>
    </div>
  );
}

// ============================================================================
// FeatureCard - Individual feature card in Kanban column
// ============================================================================
interface FeatureCardProps {
  feature: RoadmapFeature;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

function FeatureCard({ feature, isSelected, onClick, onDelete }: FeatureCardProps) {
  return (
    <div
      onClick={onClick}
      className={`relative p-3.5 rounded-xl border cursor-pointer group
                 transition-all duration-300 ease-out
                 ${
                   isSelected
                     ? 'bg-secondary/90 border-primary/60 ring-2 ring-primary/30 shadow-[0_0_20px_rgba(201,162,39,0.25)] scale-[1.02]'
                     : 'bg-card/80 backdrop-blur-sm border-border/60 hover:border-primary/40 hover:bg-card hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3),0_0_15px_rgba(201,162,39,0.1)]'
                 }
                 before:absolute before:inset-0 before:rounded-xl before:opacity-0
                 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent
                 before:transition-opacity before:duration-300
                 hover:before:opacity-100`}
    >
      {/* Header with drag handle and actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
          <span className={`text-xs px-1.5 py-0.5 rounded ${PRIORITY_COLORS[feature.priority]}`}>
            {feature.priority}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">
        {feature.title}
      </h3>

      {/* Metrics */}
      <div className="flex items-center gap-2 text-xs">
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-secondary text-muted-foreground" title="Complexity">
          <Zap className="w-3 h-3" />
          {feature.complexity.toUpperCase()}
        </span>
        <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${
          feature.impact === 'high' ? 'bg-green-500/10 text-green-400' :
          feature.impact === 'medium' ? 'bg-primary/10 text-primary' :
          'bg-secondary text-muted-foreground'
        }`} title="Impact">
          <TrendingUp className="w-3 h-3" />
          {feature.impact}
        </span>
      </div>

      {/* Tags */}
      {Array.isArray(feature.tags) && feature.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {feature.tags.slice(0, 2).map(tag => (
            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
              {tag}
            </span>
          ))}
          {feature.tags.length > 2 && (
            <span className="text-xs text-muted-foreground">+{feature.tags.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RoadmapColumn - Kanban column for a status
// ============================================================================
interface RoadmapColumnProps {
  status: FeatureStatus;
  features: RoadmapFeature[];
  selectedFeatureId: string | null;
  onSelectFeature: (id: string) => void;
  onDeleteFeature: (id: string) => void;
}

function RoadmapColumn({
  status,
  features,
  selectedFeatureId,
  onSelectFeature,
  onDeleteFeature,
}: RoadmapColumnProps) {
  const config = FEATURE_STATUS_CONFIG[status];
  
  const statusColors: Record<FeatureStatus, string> = {
    backlog: 'border-muted-foreground',
    planned: 'border-blue-500',
    'in-progress': 'border-primary',
    shipped: 'border-green-500',
    archived: 'border-muted',
  };

  return (
    <div className="flex-1 min-w-[280px] flex flex-col h-full group">
      {/* Enhanced Column Header */}
      <div className={`relative flex items-center justify-between px-3 py-3 mb-3
                      transition-all duration-300
                      before:absolute before:bottom-0 before:left-0 before:right-0 before:h-[2px]
                      before:bg-gradient-to-r before:from-transparent before:via-current before:to-transparent
                      before:transition-all before:duration-300
                      group-hover:before:h-[3px]
                      ${statusColors[status]}`}>
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-sm uppercase tracking-wider transition-all duration-300 group-hover:tracking-widest">
            {config.label}
          </span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-secondary/50
                        border border-current/20 transition-all duration-300
                        group-hover:scale-110 group-hover:shadow-[0_0_12px_currentColor]">
            {features.length}
          </span>
        </div>
      </div>

      {/* Cards with Staggered Animation */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-2">
        {features.map((feature, index) => (
          <div
            key={feature.id}
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: 'backwards'
            }}
            className="animate-fade-in"
          >
            <FeatureCard
              feature={feature}
              isSelected={feature.id === selectedFeatureId}
              onClick={() => onSelectFeature(feature.id)}
              onDelete={() => onDeleteFeature(feature.id)}
            />
          </div>
        ))}
        {features.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
            <Flag className="w-8 h-8 mb-3 opacity-30" />
            <span className="text-sm font-medium">No features</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// FeatureDetailPanel - Full feature details + actions
// ============================================================================
interface FeatureDetailPanelProps {
  feature: RoadmapFeature;
  onClose: () => void;
  onUpdate: (updates: Partial<RoadmapFeature>) => void;
  onDelete: () => void;
  onConvertToTask: () => void;
}

function FeatureDetailPanel({
  feature,
  onClose,
  onUpdate,
  onDelete,
  onConvertToTask,
}: FeatureDetailPanelProps) {
  return (
    <div className="w-96 h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <span className={`text-xs px-2 py-1 rounded ${PRIORITY_COLORS[feature.priority]}`}>
          {feature.priority} priority
        </span>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{feature.title}</h2>
        
        <p className="text-sm text-muted-foreground">{feature.description}</p>

        {/* Status Selector */}
        <div>
          <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Status</h4>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(FEATURE_STATUS_CONFIG) as FeatureStatus[])
              .filter(s => s !== 'archived')
              .map(status => (
                <button
                  key={status}
                  onClick={() => onUpdate({ status })}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    feature.status === status
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-secondary text-muted-foreground border border-border hover:border-muted-foreground'
                  }`}
                >
                  {FEATURE_STATUS_CONFIG[status].label}
                </button>
              ))}
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Priority</div>
            <div className={`text-sm font-medium ${
              feature.priority === 'critical' ? 'text-red-400' :
              feature.priority === 'high' ? 'text-orange-400' :
              feature.priority === 'medium' ? 'text-blue-400' :
              'text-muted-foreground'
            }`}>
              {feature.priority}
            </div>
          </div>
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Complexity</div>
            <div className="text-sm font-medium text-foreground">
              {feature.complexity.toUpperCase()} ({COMPLEXITY_VALUES[feature.complexity]} pts)
            </div>
          </div>
          <div className="p-3 bg-secondary rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Impact</div>
            <div className={`text-sm font-medium ${
              feature.impact === 'high' ? 'text-green-400' :
              feature.impact === 'medium' ? 'text-primary' :
              'text-muted-foreground'
            }`}>
              {feature.impact}
            </div>
          </div>
        </div>

        {/* Tags */}
        {feature.tags && feature.tags.length > 0 && (
          <div>
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Tags</h4>
            <div className="flex flex-wrap gap-2">
              {feature.tags.map(tag => (
                <span key={tag} className="px-2 py-1 bg-secondary text-muted-foreground text-xs rounded-lg">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Linked Tasks */}
        {feature.taskIds && feature.taskIds.length > 0 && (
          <div>
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Linked Tasks</h4>
            <div className="space-y-1">
              {feature.taskIds.map(taskId => (
                <div key={taskId} className="flex items-center gap-2 px-2 py-1.5 bg-secondary rounded text-xs text-muted-foreground">
                  <Target className="w-3 h-3" />
                  {taskId}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-2">
        <button
          onClick={onConvertToTask}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-400 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Task
        </button>
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete Feature
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// AddFeatureDialog - Manual feature creation
// ============================================================================
interface AddFeatureDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (feature: Omit<RoadmapFeature, 'id' | 'createdAt' | 'updatedAt'>) => void;
}

function AddFeatureDialog({ open, onClose, onAdd }: AddFeatureDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<FeaturePriority>('medium');
  const [complexity, setComplexity] = useState<FeatureComplexity>('md');
  const [impact, setImpact] = useState<FeatureImpact>('medium');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      description: description.trim(),
      status: 'backlog',
      priority,
      complexity,
      impact,
    });
    setTitle('');
    setDescription('');
    setPriority('medium');
    setComplexity('md');
    setImpact('medium');
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Add Feature</h2>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Feature title"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-1 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Feature description"
              rows={3}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as FeaturePriority)}
                className="w-full px-2 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Complexity</label>
              <select
                value={complexity}
                onChange={(e) => setComplexity(e.target.value as FeatureComplexity)}
                className="w-full px-2 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
              >
                <option value="xs">XS (1)</option>
                <option value="sm">SM (2)</option>
                <option value="md">MD (3)</option>
                <option value="lg">LG (5)</option>
                <option value="xl">XL (8)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Impact</label>
              <select
                value={impact}
                onChange={(e) => setImpact(e.target.value as FeatureImpact)}
                className="w-full px-2 py-1.5 bg-secondary border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white font-medium hover:bg-blue-400 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
          >
            Add Feature
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Roadmap - Main Component
// ============================================================================
export function Roadmap() {
  const {
    features,
    selectedFeatureId,
    isGenerating,
    selectFeature,
    addFeature,
    updateFeature,
    deleteFeature,
    startGeneration,
    cancelGeneration,
    getFeaturesByStatus,
    getSelectedFeature,
  } = useRoadmapStore();

  const taskStore = useTaskStore();

  const [showAddDialog, setShowAddDialog] = useState(false);

  const selectedFeature = getSelectedFeature();

  // Create task from feature
  const handleConvertToTask = async (feature: RoadmapFeature) => {
    // Generate next task ID by finding the highest existing T### number
    const existingIds = taskStore.tasks
      .map(t => parseInt(t.id.replace('T', ''), 10))
      .filter(n => !isNaN(n));
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 171;
    const taskId = `T${String(nextNum).padStart(3, '0')}`;

    // Map feature priority to task priority
    const priorityMap: Record<FeaturePriority, 'low' | 'medium' | 'high'> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'high',
    };

    // Map feature complexity to task complexity
    const complexityMap: Record<FeatureComplexity, 'sm' | 'md' | 'lg'> = {
      xs: 'sm',
      sm: 'sm',
      md: 'md',
      lg: 'lg',
      xl: 'lg',
    };

    // Create the task object
    const task: Task = {
      id: taskId,
      title: feature.title,
      description: feature.description,
      status: 'backlog',
      priority: priorityMap[feature.priority],
      complexity: complexityMap[feature.complexity],
      tags: feature.tags?.slice(0, 3),
      assignee: '@agent',
      createdAt: new Date().toISOString(),
    };

    try {
      // Create via task-store (persists to disk)
      await taskStore.createTask(task);

      // Link task to feature
      updateFeature(feature.id, {
        taskIds: [...(feature.taskIds || []), taskId],
      });

      toast.success(`Created task ${taskId} from feature`);
    } catch (error) {
      toast.error(`Failed to create task: ${String(error)}`);
    }
  };

  const statuses: FeatureStatus[] = ['backlog', 'planned', 'in-progress', 'shipped'];

  // Empty state - no features yet
  if (features.length === 0 && !isGenerating) {
    return <RoadmapEmptyState onGenerate={startGeneration} />;
  }

  // Generating state
  if (isGenerating) {
    return <GenerationProgressScreen onCancel={cancelGeneration} />;
  }

  return (
    <div className="h-full flex bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Map className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold text-foreground">Roadmap</h1>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-sm">
              {features.length} features
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-400 transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Feature
            </button>
            <button
              onClick={startGeneration}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="flex-1 overflow-x-auto p-6 transition-all duration-300">
          <div className="flex gap-4 h-full min-w-max">
            {statuses.map(status => (
              <RoadmapColumn
                key={status}
                status={status}
                features={getFeaturesByStatus(status)}
                selectedFeatureId={selectedFeatureId}
                onSelectFeature={selectFeature}
                onDeleteFeature={deleteFeature}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedFeature && (
        <FeatureDetailPanel
          feature={selectedFeature}
          onClose={() => selectFeature(null)}
          onUpdate={(updates) => updateFeature(selectedFeature.id, updates)}
          onDelete={() => deleteFeature(selectedFeature.id)}
          onConvertToTask={() => handleConvertToTask(selectedFeature)}
        />
      )}

      {/* Add Feature Dialog */}
      <AddFeatureDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={addFeature}
      />
    </div>
  );
}
