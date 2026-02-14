/**
 * About Dialog
 * Shows app version, origin story, and dedication
 */

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { KuroryuuDialog } from '../ui/dialog/KuroryuuDialog';
import { useSettingsStore } from '../../stores/settings-store';
import { useIsThemedStyle } from '../../hooks/useTheme';

export function AboutDialog() {
  const { activeDialog, closeDialog } = useSettingsStore();
  const { isKuroryuu } = useIsThemedStyle();
  const [version, setVersion] = useState('');
  const [imgSrc, setImgSrc] = useState('');

  const isOpen = activeDialog === 'about';

  useEffect(() => {
    if (isOpen) {
      window.electronAPI?.app?.getVersion?.().then((v: string) => setVersion(v || '0.2.0')).catch(() => setVersion('0.2.0'));
      // Load image as base64 data URL via IPC (bypasses CSP/protocol restrictions)
      window.electronAPI?.app?.getAssetDataUrl?.('assets/img/marleerose.jpg')
        .then((dataUrl: string | null) => { if (dataUrl) setImgSrc(dataUrl); })
        .catch(() => {});
    }
  }, [isOpen]);

  const electronVersion = window.electronAPI?.versions?.electron ?? '?';
  const nodeVersion = window.electronAPI?.versions?.node ?? '?';
  const platform = window.electronAPI?.platform ?? process.platform;

  const linkStyle = {
    color: isKuroryuu ? '#c9a227' : 'var(--primary)',
    textDecoration: 'none',
    fontSize: '13px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
  };

  const openExternal = (url: string) => {
    window.electronAPI?.shell?.openExternal?.(url);
  };

  return (
    <KuroryuuDialog
      open={isOpen}
      onOpenChange={(open) => !open && closeDialog()}
      title="Kuroryuu"
      description="黒龍幻霧 — The Black Dragon of Illusory Fog"
      size="md"
      variant="default"
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span
              style={linkStyle}
              onClick={() => openExternal('https://www.kuroryuu.com')}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              <ExternalLink className="w-3 h-3" />
              kuroryuu.com
            </span>
            <span
              style={linkStyle}
              onClick={() => openExternal('https://github.com/ahostbr/kuroryuu-public')}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              <ExternalLink className="w-3 h-3" />
              GitHub
            </span>
            <span
              style={linkStyle}
              onClick={() => openExternal('http://shadowsandshurikens.com/')}
              onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              <ExternalLink className="w-3 h-3" />
              SOTS
            </span>
          </div>
          <button
            onClick={() => closeDialog()}
            style={{
              padding: '8px 20px',
              borderRadius: '6px',
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.025em',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
              backgroundColor: isKuroryuu ? '#c9a227' : 'var(--primary)',
              color: isKuroryuu ? '#0a0a0c' : 'var(--primary-foreground)',
              border: isKuroryuu ? '1px solid rgba(201, 162, 39, 0.8)' : '1px solid var(--primary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              if (isKuroryuu) {
                e.currentTarget.style.boxShadow = '0 4px 20px rgba(201, 162, 39, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* About paragraph */}
        <p
          className="text-sm leading-relaxed"
          style={{ color: isKuroryuu ? '#c9b896' : 'var(--muted-foreground)' }}
        >
          Kuroryuu is an open-source AI agent orchestration platform built for Claude Code
          power users. 21 years of self-taught coding since the 90s, 3 years of game dev
          prep when ChatGPT hit, 26 Unreal Engine plugins ported from Blueprint to C++ in
          one month when Opus launched — then Kuroryuu started January 5th, 2026. Built
          back-to-back with Shadows and Shurikens into a multi-agent desktop harness with
          MCP gateway, graph visualization, TTS, memory systems, and full session
          persistence. The dragon is real.
        </p>

        {/* Dedication */}
        <p
          className={`text-center font-bold tracking-wide ${isKuroryuu ? 'font-reggae-one' : ''}`}
          style={{
            color: isKuroryuu ? '#c9a227' : 'var(--primary)',
            fontSize: isKuroryuu ? '1rem' : '0.9rem',
          }}
        >
          Were Doing This For Marlee Rose !!!
        </p>

        {/* Marlee Rose photo */}
        {imgSrc && (
          <div className="flex justify-center pt-1">
            <img
              src={imgSrc}
              alt="Marlee Rose"
              className="rounded-lg"
              style={{
                maxWidth: '220px',
                border: isKuroryuu ? '2px solid rgba(201, 162, 39, 0.3)' : '2px solid var(--border)',
                boxShadow: isKuroryuu
                  ? '0 4px 20px rgba(201, 162, 39, 0.15)'
                  : '0 4px 12px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        )}

        {/* Version info */}
        <div
          className="text-center text-xs pt-2 border-t"
          style={{
            color: isKuroryuu ? '#6a5a3a' : 'var(--muted-foreground)',
            borderColor: isKuroryuu ? 'rgba(201, 162, 39, 0.15)' : 'var(--border)',
          }}
        >
          v{version || '0.2.0'} · Electron {electronVersion} · Node {nodeVersion} · {platform}
        </div>
      </div>
    </KuroryuuDialog>
  );
}
