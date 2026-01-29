/**
 * DependenciesPanel - Display project dependencies from package.json/requirements.txt
 * T418: Dependency Viewer
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from '../ui/toaster';
import {
  Package,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  ExternalLink,
  AlertTriangle,
  FileCode,
  FolderOpen,
  Box,
} from 'lucide-react';

interface DependencyInfo {
  version: string;
  type?: string;
  dev?: boolean;
}

interface NpmPackage {
  path: string;
  name: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

interface PythonPackage {
  path: string;
  packages: Array<{ name: string; version: string | null }>;
}

interface DependenciesData {
  npm_packages: NpmPackage[];
  python_packages: PythonPackage[];
}

interface DependenciesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DependenciesPanel({ isOpen, onClose }: DependenciesPanelProps) {
  const [depsData, setDepsData] = useState<DependenciesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPackages, setExpandedPackages] = useState<Set<string>>(new Set(['apps/desktop', 'apps/gateway']));
  const [searchQuery, setSearchQuery] = useState('');
  const [showDev, setShowDev] = useState(true);
  const [activeTab, setActiveTab] = useState<'npm' | 'python'>('npm');

  // Fetch dependencies from k_repo_intel
  const fetchDeps = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI?.mcp?.call?.('k_repo_intel', {
        action: 'get',
        report: 'dependencies',
        limit: 500,
      });

      const resultData = result?.result as { data?: DependenciesData } | undefined;
      if (result?.ok && resultData?.data) {
        setDepsData(resultData.data);
      } else {
        toast.error('Failed to fetch dependencies');
      }
    } catch (err) {
      console.error('[DependenciesPanel] Fetch error:', err);
      toast.error('Failed to fetch dependencies');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on mount and when panel opens
  useEffect(() => {
    if (isOpen && !depsData) {
      fetchDeps();
    }
  }, [isOpen, depsData, fetchDeps]);

  // Toggle package expansion
  const togglePackage = (pkgPath: string) => {
    setExpandedPackages(prev => {
      const next = new Set(prev);
      if (next.has(pkgPath)) {
        next.delete(pkgPath);
      } else {
        next.add(pkgPath);
      }
      return next;
    });
  };

  // Filter dependencies based on search
  const filteredNpmPackages = useMemo(() => {
    if (!depsData?.npm_packages || !Array.isArray(depsData.npm_packages)) return [];
    if (!searchQuery) return depsData.npm_packages;

    const searchLower = searchQuery.toLowerCase();
    return depsData.npm_packages.map(pkg => {
      const filteredDeps: Record<string, string> = {};
      const filteredDevDeps: Record<string, string> = {};

      Object.entries(pkg.dependencies || {}).forEach(([name, version]) => {
        if (name.toLowerCase().includes(searchLower)) {
          filteredDeps[name] = version;
        }
      });

      Object.entries(pkg.devDependencies || {}).forEach(([name, version]) => {
        if (name.toLowerCase().includes(searchLower)) {
          filteredDevDeps[name] = version;
        }
      });

      if (Object.keys(filteredDeps).length === 0 && Object.keys(filteredDevDeps).length === 0) {
        // Check if package name matches
        if (!pkg.name.toLowerCase().includes(searchLower) && !pkg.path.toLowerCase().includes(searchLower)) {
          return null;
        }
      }

      return {
        ...pkg,
        dependencies: Object.keys(filteredDeps).length > 0 ? filteredDeps : pkg.dependencies,
        devDependencies: Object.keys(filteredDevDeps).length > 0 ? filteredDevDeps : pkg.devDependencies,
      };
    }).filter(Boolean) as NpmPackage[];
  }, [depsData, searchQuery]);

  const filteredPythonPackages = useMemo(() => {
    if (!depsData?.python_packages || !Array.isArray(depsData.python_packages)) return [];
    if (!searchQuery) return depsData.python_packages;

    const searchLower = searchQuery.toLowerCase();
    return depsData.python_packages.map(pkg => {
      const filtered = (pkg.packages || []).filter(p =>
        p.name.toLowerCase().includes(searchLower)
      );

      if (filtered.length === 0 && !pkg.path.toLowerCase().includes(searchLower)) {
        return null;
      }

      return {
        ...pkg,
        packages: filtered.length > 0 ? filtered : pkg.packages,
      };
    }).filter(Boolean) as PythonPackage[];
  }, [depsData, searchQuery]);

  // Open npm package page
  const openNpmPage = (pkgName: string) => {
    window.open(`https://www.npmjs.com/package/${pkgName}`, '_blank');
  };

  // Open PyPI page
  const openPyPIPage = (pkgName: string) => {
    window.open(`https://pypi.org/project/${pkgName}`, '_blank');
  };

  // Count total dependencies
  const totalNpmDeps = useMemo(() => {
    if (!depsData?.npm_packages || !Array.isArray(depsData.npm_packages)) return 0;
    return depsData.npm_packages.reduce((sum, pkg) => {
      const deps = Object.keys(pkg.dependencies || {}).length;
      const devDeps = showDev ? Object.keys(pkg.devDependencies || {}).length : 0;
      return sum + deps + devDeps;
    }, 0);
  }, [depsData, showDev]);

  const totalPythonDeps = useMemo(() => {
    if (!depsData?.python_packages || !Array.isArray(depsData.python_packages)) return 0;
    return depsData.python_packages.reduce((sum, pkg) => sum + (pkg.packages?.length || 0), 0);
  }, [depsData]);

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-card/50 border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Dependencies</span>
          <span className="text-xs text-muted-foreground">
            ({activeTab === 'npm' ? totalNpmDeps : totalPythonDeps})
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchDeps}
            disabled={isLoading}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center border-b border-border/50">
        <button
          onClick={() => setActiveTab('npm')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'npm'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <Box className="w-3.5 h-3.5" />
            npm ({depsData?.npm_packages?.length || 0})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('python')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'python'
              ? 'text-primary border-b-2 border-primary bg-primary/5'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <FileCode className="w-3.5 h-3.5" />
            Python ({depsData?.python_packages?.length || 0})
          </div>
        </button>
      </div>

      {/* Search bar */}
      <div className="px-3 py-2 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dependencies..."
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {activeTab === 'npm' && (
          <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showDev}
              onChange={(e) => setShowDev(e.target.checked)}
              className="rounded border-border"
            />
            Show devDependencies
          </label>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && !depsData ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : activeTab === 'npm' ? (
          // NPM packages
          filteredNpmPackages.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {searchQuery ? 'No matching packages' : 'No npm packages found'}
            </div>
          ) : (
            <div className="py-1">
              {filteredNpmPackages.map((pkg) => {
                const isExpanded = expandedPackages.has(pkg.path);
                const depsCount = Object.keys(pkg.dependencies || {}).length;
                const devDepsCount = Object.keys(pkg.devDependencies || {}).length;

                return (
                  <div key={pkg.path} className="border-b border-border/30 last:border-b-0">
                    {/* Package header */}
                    <button
                      onClick={() => togglePackage(pkg.path)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      )}
                      <FolderOpen className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="font-medium">{pkg.path || 'root'}</span>
                      <span className="text-muted-foreground ml-auto">
                        {depsCount} deps{showDev && devDepsCount > 0 ? `, ${devDepsCount} dev` : ''}
                      </span>
                    </button>

                    {/* Dependencies list */}
                    {isExpanded && (
                      <div className="pl-8 pb-2">
                        {/* Production dependencies */}
                        {Object.entries(pkg.dependencies || {}).map(([name, version]) => (
                          <div
                            key={name}
                            className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30 transition-colors group"
                          >
                            <Package className="w-3 h-3 text-blue-500" />
                            <span className="flex-1">{name}</span>
                            <span className="text-muted-foreground">{version}</span>
                            <button
                              onClick={() => openNpmPage(name)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
                              title="Open on npm"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        ))}

                        {/* Dev dependencies */}
                        {showDev && Object.entries(pkg.devDependencies || {}).map(([name, version]) => (
                          <div
                            key={name}
                            className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30 transition-colors group"
                          >
                            <Package className="w-3 h-3 text-orange-500" />
                            <span className="flex-1">{name}</span>
                            <span className="text-muted-foreground">{version}</span>
                            <span className="text-orange-500/70 text-[10px]">dev</span>
                            <button
                              onClick={() => openNpmPage(name)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
                              title="Open on npm"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          // Python packages
          filteredPythonPackages.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">
              {searchQuery ? 'No matching packages' : 'No Python packages found'}
            </div>
          ) : (
            <div className="py-1">
              {filteredPythonPackages.map((pkg) => {
                const isExpanded = expandedPackages.has(pkg.path);

                return (
                  <div key={pkg.path} className="border-b border-border/30 last:border-b-0">
                    {/* Package header */}
                    <button
                      onClick={() => togglePackage(pkg.path)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      )}
                      <FileCode className="w-3.5 h-3.5 text-green-500" />
                      <span className="font-medium">{pkg.path}</span>
                      <span className="text-muted-foreground ml-auto">
                        {pkg.packages?.length || 0} packages
                      </span>
                    </button>

                    {/* Packages list */}
                    {isExpanded && pkg.packages && (
                      <div className="pl-8 pb-2">
                        {pkg.packages.map((p, idx) => (
                          <div
                            key={`${p.name}-${idx}`}
                            className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-muted/30 transition-colors group"
                          >
                            <Package className="w-3 h-3 text-green-500" />
                            <span className="flex-1">{p.name}</span>
                            {p.version ? (
                              <span className="text-muted-foreground">{p.version}</span>
                            ) : (
                              <span className="text-yellow-500/70 text-[10px]">latest</span>
                            )}
                            <button
                              onClick={() => openPyPIPage(p.name)}
                              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-all"
                              title="Open on PyPI"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border flex items-center justify-between">
        <span>
          {activeTab === 'npm'
            ? `${depsData?.npm_packages?.length || 0} package.json files`
            : `${depsData?.python_packages?.length || 0} requirements.txt files`
          }
        </span>
        <span className="text-muted-foreground/60">
          k_repo_intel
        </span>
      </div>
    </div>
  );
}
