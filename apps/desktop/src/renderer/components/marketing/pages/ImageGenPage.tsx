import { useState, useEffect } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useMarketingStore } from '../../../stores/marketing-store';

export function ImageGenPage() {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<'photorealistic' | 'artistic' | 'illustration' | 'minimal'>('photorealistic');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '1:1' | '9:16'>('16:9');

  const generateImage = useMarketingStore((s) => s.generateImage);
  const imageLoading = useMarketingStore((s) => s.imageLoading);
  const filteredJobs = useMarketingStore((s) => s.activeJobs).filter((j) => j.type === 'image');
  const assets = useMarketingStore((s) => s.assets).filter((a) => a.type === 'image');
  const loadAssets = useMarketingStore((s) => s.loadAssets);
  const setLightboxAssetId = useMarketingStore((s) => s.setLightboxAssetId);

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const handleSubmit = () => {
    if (prompt.trim()) {
      generateImage(prompt, style, aspectRatio);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <ImageIcon className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Image Generation</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Generate images with Google Gemini AI</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Form card */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Style</label>
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as 'photorealistic' | 'artistic' | 'illustration' | 'minimal')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            >
              <option value="photorealistic">Photorealistic</option>
              <option value="artistic">Artistic</option>
              <option value="illustration">Illustration</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Aspect Ratio</label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as '16:9' | '1:1' | '9:16')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            >
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="9:16">9:16</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={imageLoading || !prompt.trim()}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {imageLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                Generate Image
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

        {/* Recent images */}
        {assets.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Recent Images</h3>
            <div className="grid grid-cols-2 gap-2">
              {assets.slice(0, 6).map((asset) => (
                <img
                  key={asset.id}
                  src={`file://${asset.path}`}
                  alt={asset.name}
                  className="w-full rounded-lg object-cover aspect-video cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setLightboxAssetId(asset.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
