import { useState } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { useMarketingStore } from '../../../stores/marketing-store';

export function VoiceoverPage() {
  const [text, setText] = useState('');

  const generateVoiceover = useMarketingStore((s) => s.generateVoiceover);
  const voiceoverLoading = useMarketingStore((s) => s.voiceoverLoading);
  const filteredJobs = useMarketingStore((s) => s.activeJobs).filter((j) => j.type === 'voiceover');

  const handleSubmit = () => {
    if (text.trim()) {
      generateVoiceover(text);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Mic className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Voiceover</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Generate professional voiceovers with ElevenLabs</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Form card */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Text</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the text you want to convert to speech..."
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={voiceoverLoading || !text.trim()}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {voiceoverLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                Generate Voiceover
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
