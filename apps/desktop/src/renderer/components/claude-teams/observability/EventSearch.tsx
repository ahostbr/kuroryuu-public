/**
 * EventSearch - Regex search input for filtering observability events
 */
import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useObservabilityStore } from '../../../stores/observability-store';

export function EventSearch() {
  const searchQuery = useObservabilityStore((s) => s.searchQuery);
  const setSearchQuery = useObservabilityStore((s) => s.setSearchQuery);
  const [localValue, setLocalValue] = useState(searchQuery);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSearchQuery(localValue);
    },
    [localValue, setSearchQuery]
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    setSearchQuery('');
  }, [setSearchQuery]);

  return (
    <form onSubmit={handleSubmit} className="relative flex items-center">
      <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder="Search events..."
        className="w-full pl-8 pr-8 py-1.5 text-xs bg-secondary border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </form>
  );
}
