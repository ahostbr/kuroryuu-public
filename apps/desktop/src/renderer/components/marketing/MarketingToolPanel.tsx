import { useState } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { Search, Globe, Image as ImageIcon, Video, Music, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

export function MarketingToolPanel() {
  const [expandedSection, setExpandedSection] = useState<string | null>('research');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchMode, setResearchMode] = useState<'quick' | 'deep' | 'reason'>('quick');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scrapeMode, setScrapeMode] = useState<'markdown' | 'screenshot' | 'extract'>('markdown');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState('photorealistic');
  const [voiceoverText, setVoiceoverText] = useState('');
  const [musicPrompt, setMusicPrompt] = useState('');
  const [musicDuration, setMusicDuration] = useState(30);
  const [videoTemplate, setVideoTemplate] = useState('');
  const [videoProps, setVideoProps] = useState('{}');

  const lastResearch = useMarketingStore((s) => s.lastResearch);
  const researchLoading = useMarketingStore((s) => s.researchLoading);
  const runResearch = useMarketingStore((s) => s.runResearch);

  const lastScrape = useMarketingStore((s) => s.lastScrape);
  const scrapeLoading = useMarketingStore((s) => s.scrapeLoading);
  const runScrape = useMarketingStore((s) => s.runScrape);

  const activeJobs = useMarketingStore((s) => s.activeJobs);
  const generateImage = useMarketingStore((s) => s.generateImage);
  const imageLoading = useMarketingStore((s) => s.imageLoading);
  const generateVoiceover = useMarketingStore((s) => s.generateVoiceover);
  const voiceoverLoading = useMarketingStore((s) => s.voiceoverLoading);
  const generateMusic = useMarketingStore((s) => s.generateMusic);
  const musicLoading = useMarketingStore((s) => s.musicLoading);
  const renderVideo = useMarketingStore((s) => s.renderVideo);
  const videoLoading = useMarketingStore((s) => s.videoLoading);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <div className="h-full bg-zinc-800 rounded-lg border border-zinc-700 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-100">Marketing Tools</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Active Jobs Progress */}
        {activeJobs.length > 0 && (
          <div className="space-y-2 p-4 border-b border-zinc-700">
            <div className="text-xs font-medium text-zinc-400">Active Jobs</div>
            {activeJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-2 p-2 bg-zinc-700/50 rounded">
                <div className="flex-1">
                  <div className="text-xs text-zinc-300">{job.type}: {job.message}</div>
                  <div className="h-1.5 bg-zinc-600 rounded mt-1">
                    <div className="h-full bg-amber-500 rounded transition-all" style={{ width: `${job.progress}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Research Section */}
        <div className="border-b border-zinc-700">
          <button
            onClick={() => toggleSection('research')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-100">Research</span>
            </div>
            {expandedSection === 'research' ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>
          {expandedSection === 'research' && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Query</label>
                <input
                  type="text"
                  value={researchQuery}
                  onChange={(e) => setResearchQuery(e.target.value)}
                  placeholder="What do you want to research?"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mode</label>
                <select
                  value={researchMode}
                  onChange={(e) => setResearchMode(e.target.value as 'quick' | 'deep' | 'reason')}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="quick">Quick</option>
                  <option value="deep">Deep</option>
                  <option value="reason">Reason</option>
                </select>
              </div>
              <button
                onClick={() => runResearch(researchQuery, researchMode)}
                disabled={researchLoading || !researchQuery.trim()}
                className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {researchLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Researching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Research
                  </>
                )}
              </button>
              {lastResearch && (
                <div className="mt-3 p-3 bg-zinc-900 rounded border border-zinc-700">
                  <div className="text-xs text-zinc-400 mb-2">
                    Results ({lastResearch.citations.length} citations)
                  </div>
                  <div className="text-xs text-zinc-300 max-h-40 overflow-y-auto">
                    {lastResearch.content.slice(0, 300)}...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Web Scraper Section */}
        <div className="border-b border-zinc-700">
          <button
            onClick={() => toggleSection('scraper')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-100">Web Scraper</span>
            </div>
            {expandedSection === 'scraper' ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>
          {expandedSection === 'scraper' && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">URL</label>
                <input
                  type="text"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Mode</label>
                <select
                  value={scrapeMode}
                  onChange={(e) => setScrapeMode(e.target.value as 'markdown' | 'screenshot' | 'extract')}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="markdown">Markdown</option>
                  <option value="screenshot">Screenshot</option>
                  <option value="extract">Extract</option>
                </select>
              </div>
              <button
                onClick={() => runScrape(scrapeUrl, scrapeMode)}
                disabled={scrapeLoading || !scrapeUrl.trim()}
                className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {scrapeLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Scraping...
                  </>
                ) : (
                  <>
                    <Globe className="w-4 h-4" />
                    Scrape
                  </>
                )}
              </button>
              {lastScrape && (
                <div className="mt-3 p-3 bg-zinc-900 rounded border border-zinc-700">
                  <div className="text-xs text-zinc-400 mb-2">
                    {lastScrape.title} ({lastScrape.word_count} words)
                  </div>
                  <div className="text-xs text-zinc-300 max-h-40 overflow-y-auto">
                    {lastScrape.content.slice(0, 300)}...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Image Generation Section */}
        <div className="border-b border-zinc-700">
          <button
            onClick={() => toggleSection('image')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-100">Image Generation</span>
            </div>
            {expandedSection === 'image' ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>
          {expandedSection === 'image' && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Prompt</label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Describe the image you want to generate"
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Style</label>
                <select
                  value={imageStyle}
                  onChange={(e) => setImageStyle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value="photorealistic">Photorealistic</option>
                  <option value="artistic">Artistic</option>
                  <option value="illustration">Illustration</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
              <button
                onClick={() => generateImage(imagePrompt, imageStyle, '16:9')}
                disabled={imageLoading || !imagePrompt.trim()}
                className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {imageLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <ImageIcon className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Voiceover Section */}
        <div className="border-b border-zinc-700">
          <button
            onClick={() => toggleSection('voiceover')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-100">Voiceover</span>
            </div>
            {expandedSection === 'voiceover' ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>
          {expandedSection === 'voiceover' && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Text</label>
                <textarea
                  value={voiceoverText}
                  onChange={(e) => setVoiceoverText(e.target.value)}
                  placeholder="Enter text for voiceover"
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
              <button
                onClick={() => generateVoiceover(voiceoverText)}
                disabled={voiceoverLoading || !voiceoverText.trim()}
                className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {voiceoverLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Music Section */}
        <div className="border-b border-zinc-700">
          <button
            onClick={() => toggleSection('music')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-100">Music Generation</span>
            </div>
            {expandedSection === 'music' ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>
          {expandedSection === 'music' && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Prompt</label>
                <textarea
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Describe the music you want to generate"
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Duration</label>
                <select
                  value={musicDuration}
                  onChange={(e) => setMusicDuration(Number(e.target.value))}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={60}>60 seconds</option>
                </select>
              </div>
              <button
                onClick={() => generateMusic(musicPrompt, musicDuration)}
                disabled={musicLoading || !musicPrompt.trim()}
                className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {musicLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Music className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Video Section */}
        <div className="border-b border-zinc-700">
          <button
            onClick={() => toggleSection('video')}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-zinc-100">Video Rendering</span>
            </div>
            {expandedSection === 'video' ? (
              <ChevronUp className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            )}
          </button>
          {expandedSection === 'video' && (
            <div className="px-4 pb-4 space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Template</label>
                <input
                  type="text"
                  value={videoTemplate}
                  onChange={(e) => setVideoTemplate(e.target.value)}
                  placeholder="Template name or path"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Properties (JSON)</label>
                <textarea
                  value={videoProps}
                  onChange={(e) => setVideoProps(e.target.value)}
                  placeholder='{"title": "...", "subtitle": "..."}'
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none font-mono text-xs"
                />
              </div>
              <button
                onClick={() => {
                  try {
                    const props = JSON.parse(videoProps);
                    renderVideo(videoTemplate, props);
                  } catch (e) {
                    console.error('Invalid JSON props:', e);
                  }
                }}
                disabled={videoLoading || !videoTemplate.trim()}
                className="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {videoLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Rendering...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Render
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
