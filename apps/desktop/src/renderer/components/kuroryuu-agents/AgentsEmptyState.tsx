/**
 * AgentsEmptyState — Dramatic dragon ASCII empty state for Kuroryuu Agents
 *
 * Cinematic placeholder shown when no session is selected.
 * Crimson dragon ASCII, gold kanji, scanlines + vignette.
 */
import { motion } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';

// ASCII Dragon Art — from kuroryuu_cli/ui_helpers.py DRAGON_LOGO_ASCII
const DRAGON_ASCII = `                                ==++++++++++=
                            ====    -==+++++++==========
                        #+=+                     ====++++++++
                     ### %%                           ++******%%%
                  +**     %%        **                   #***#%%%%%
               +*+         %%        ##                      %%%%%%%%%
             +              %%%%     %%#%                  *** %%%%%%%%%
                             %%%      %%%                  *  #  #%%#%%%%%
                              %%%      %%%                ++* #    ###%%%%%%
                               %%%     %%%                  +##     #***##*#%
                        *%%     %%%% %% %%%% %%            **         +++*+*%%#
                           %%%% ##%%%%%% %%%%%%           *            ++*#%%***
                          ###%%####*#%%%%% %%%%%         #              *########*
              ++=++     #%%  *##%##%%%%%%%%%%%%%% #      %              **####**#+=
               ++         ##%%%%%%%#%%%%%##%%%%%%%###    %             =+**#####**##
                =     **%%%%%%%%%%%##%%%%%%%%%########*  #               +**#######*+
               ***#%#*+***#%%%%%%%%%###%%%%%%%##******## +*    =        ++**###%%%#%#
             *#**%%%%*+#%%%%%%%%%%%#####%%%%%###***#**#   ##             **++*#%%%%%##
             **##%%%%%%%#%%#%%%%%%%#%%#%%%%%%%%##**###%%%%%##          ++**=-*##%%##%*
               **%%%%%%%%%%%%%%%%%%%%%%%%%####%#****##%%%%%%%#         ++++-=+*#%%%%%#
      +**++   +#*#*#%%%%%%%%%%%%%####*#%%#%%%####**    ##%%%#*       == +**++*###%%%%%*
        +****++*** *%%%%%%%##%%#####*   #%%%  ##%#**#    ###       ==== ****#####%%%%%#
          ####**   +*#%%%%%%##**###             #%%%%%##           ==+ +***####%####%%%
       ######*++    ==#%%%%###***+ %       *  *   %%%%%%*           ++++***##%%%###*#%%
       ## %%%++    ===+#%%%%%###                 %%%%%%%      +     *****#####%%%%##%%%
       ## #** *#*   ==+*###****==           %##%%%%%%%%   *    *  ++*#####%%##%%#%%%%%%
          %%% +**   ==***##**+=+====                     ***#*==+***#####%#######%%#%%%
             +**    =+++*****#+==+*****                 =+****###***########%%%%%%%%%%%
+             ==     +++=-+*+++=+####*+*                 ==++**#####%%##%###########%%%
+               ++    =*#++*+=+*#%%%%###%               ++*+++++#%%##%%%%%%#%%%%##%%%##
                      +*##**+######%%#           #      %%%*++%%%%%%%%%%%##*#**#%#%%%##
                       #########%%%%%%%#+=    *%%*##%%%%%%%%%%%%%%%%%%%%%%%%#**#%%%%%#
  #%                    #%%%%%%%%%%%%%%%#*#%%%%%%%#%%%%#*%%%%%%%%%%%%%%%%%%%%%##+*#%%#
++         *             *###%%%%%%%%%%%%#####%%%%%####**%%%%%%%%%%%%%%%%%%%%%%%##%%%%
*+* ++         *       == ####*##%%%%%%%##*+*#%%%%%*+##%%%%%%%#%%%%%%%%%%%%%%%%%%%%%#+
   *++  #   *    ++     ==+++#*##%%%%%###**+++*###*+*+%#%%%%%%#%%%%%%%%%%%%%%%%%%%%#*=
      ==  * **%%% %%     ==   ###%%%%####***+++++++######%%%%##%%%%%%%%%%%%%%%%%%%%#
    *+ +****** %%##%%%#     #++ %%%%%#######**+++*#####%%%%%%%%##%%%%%%%%%%%%%%%%%##*
            =   %%%%%%%%#            %########***++#####%%%%%%%%%**#%%%%%%%%%%**#####
               %%%%%%%%%%%#               *##*+++**####%%%%%%%%%#++**#%%%%%%%%##++=
                *%%%%%%%%%%  =                  %%%  %%%%%% %%%##=++*%%%%%%%%%#*+
                 %%%%%%%%%%                    %%%%%%%%%%%  %%   +-*%%%%%%%%%#**=
                   %%%%%%%%                      %%%%%%%%%        #%%%%%%%%%%**+
                   #%#%%%%%#              *      %%% %% %%       %%%%%%%%%%#*+=
                        %###*             +       #  %%   #   *%%%%%%%%%%#++==
                           #####                            %%%%%%%%%%%#%##+
                             ######*%#                *+   %%###%%%%%%%%%#====
                               #####%###%%     #%%%#* *##+*#%%%*++#***#%%
                                  =*#%%%%%%%%%%%%%%%%%%#####%%%#`;

export function AgentsEmptyState() {
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
      className="h-full flex flex-col items-center justify-center relative overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at center, rgba(20,8,8,0.6) 0%, transparent 70%)' }}
    >
      {/* Scanlines overlay */}
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

      {/* Content */}
      <div className="relative z-[3] flex flex-col items-center gap-2 px-4">
        {/* Kanji Header */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="font-serif leading-none"
          style={{
            fontSize: isCompact ? '2rem' : '2.8rem',
            color: '#c9a227',
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
          style={{
            fontSize: '10px',
            color: 'rgba(201,162,39,0.5)',
          }}
        >
          KURORYUU GENMU &mdash; Black Dragon of Illusory Fog
        </motion.div>

        {/* ASCII Dragon */}
        {!isCompact && (
          <motion.pre
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            aria-hidden="true"
            className="leading-[1.1] overflow-hidden text-center mt-2"
            style={{
              fontSize: 'clamp(0.22rem, 0.45vw, 0.38rem)',
              color: 'rgba(160,35,35,0.7)',
              textShadow: '0 0 8px rgba(180,40,40,0.3)',
              animation: 'agents-crimson-pulse 4s ease-in-out infinite',
              userSelect: 'none',
              fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
            }}
          >
            {DRAGON_ASCII}
          </motion.pre>
        )}

        {/* Brand */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isCompact ? 0.3 : 0.7, duration: 0.4 }}
          className="font-mono tracking-[0.5em] text-xs mt-1"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          K U R O R Y U U
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: isCompact ? 0.4 : 0.8, duration: 0.4 }}
          className="font-mono tracking-[0.3em] text-muted-foreground"
          style={{ fontSize: '9px' }}
        >
          Black Dragon
        </motion.div>

        {/* Separator line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: isCompact ? 0.5 : 0.9, duration: 0.5 }}
          className="w-32 h-px mt-3 mb-2"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(201,162,39,0.3), transparent)' }}
        />

        {/* Agent-specific message */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: isCompact ? 0.6 : 1.0, duration: 0.4 }}
          className="text-center space-y-1.5"
        >
          <p className="text-sm text-muted-foreground">
            Select a session to view agent logs
          </p>
          <p
            className="font-mono tracking-wider"
            style={{ fontSize: '10px', color: 'rgba(201,162,39,0.35)' }}
          >
            Spawn agents via k_bash &middot; Monitor via k_process
          </p>
        </motion.div>
      </div>

      {/* Keyframe animation for crimson pulse */}
      <style>{`
        @keyframes agents-crimson-pulse {
          0%, 100% { text-shadow: 0 0 8px rgba(180,40,40,0.25); }
          50% { text-shadow: 0 0 16px rgba(180,40,40,0.45), 0 0 32px rgba(180,40,40,0.15); }
        }
      `}</style>
    </div>
  );
}
