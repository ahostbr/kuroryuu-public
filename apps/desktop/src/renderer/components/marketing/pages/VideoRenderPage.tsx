import { useState } from 'react';
import { Video, Loader2 } from 'lucide-react';
import { useMarketingStore } from '../../../stores/marketing-store';

export function VideoRenderPage() {
  const [template, setTemplate] = useState('');
  const [propsJson, setPropsJson] = useState('{}');
  const [jsonError, setJsonError] = useState('');

  const renderVideo = useMarketingStore((s) => s.renderVideo);
  const videoLoading = useMarketingStore((s) => s.videoLoading);
  const filteredJobs = useMarketingStore((s) => s.activeJobs).filter((j) => j.type === 'video');

  const handleSubmit = () => {
    setJsonError('');
    if (!template.trim()) return;

    try {
      const props = JSON.parse(propsJson);
      renderVideo(template, props);
    } catch (err) {
      setJsonError('Invalid JSON');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Video className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Video Rendering</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Render marketing videos with Remotion templates</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Form card */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Template</label>
            <input
              type="text"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              placeholder="Template name..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Props (JSON)</label>
            <textarea
              value={propsJson}
              onChange={(e) => {
                setPropsJson(e.target.value);
                setJsonError('');
              }}
              placeholder='{"title": "My Video", "duration": 30}'
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none font-mono text-xs"
            />
            {jsonError && <div className="text-xs text-red-400 mt-1">{jsonError}</div>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={videoLoading || !template.trim()}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {videoLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rendering...
              </>
            ) : (
              <>
                <Video className="w-4 h-4" />
                Render Video
              </>
            )}
          </button>
        </div>

        {/* Active jobs */}
        {filteredJobs.map((job) => (
          <div key={job.id} className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-amber-500/30">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-300">{job.message}</div>
              <div className="h-1.5 bg-zinc-700 rounded mt-1.5">
                <div className="h-full bg-amber-500 rounded transition-all" style={{ width: `${job.progress}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
