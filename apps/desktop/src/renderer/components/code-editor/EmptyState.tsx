/**
 * EmptyState - Kuroryuu Dramatic Dragon Empty State
 * Cinematic ASCII dragon with crimson glow, gold kanji, scanlines + vignette
 * Inspired by the Kuroryuu 404 page aesthetic
 */

import { motion } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import { FolderOpen, Bug, Code, Search } from 'lucide-react';

// Kuroryuu brand icon
import kuroryuuIcon from '../../../../build/icon.png';

// ASCII Dragon Art - from kuroryuu_cli/ui_helpers.py DRAGON_LOGO_ASCII
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

interface EmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

const SUGGESTIONS = [
  { label: 'Summarize this project', icon: FolderOpen, desc: 'Project overview' },
  { label: 'Help me debug', icon: Bug, desc: 'Find & fix issues' },
  { label: 'Write a function', icon: Code, desc: 'Generate code' },
  { label: 'Search codebase', icon: Search, desc: 'Find anything' },
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < 550);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`cp-empty-dramatic h-full ${isCompact ? 'cp-empty-compact' : ''}`}
    >
      {/* Kanji Header */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="cp-empty-kanji"
      >
        黒龍幻霧
      </motion.div>

      {/* Subtitle */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="cp-empty-subtitle-mono"
      >
        KURORYUU GENMU &mdash; Black Dragon of Illusonary Fog
      </motion.div>

      {/* ASCII Dragon Art */}
      <motion.pre
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.8 }}
        className="cp-empty-ascii"
        aria-hidden="true"
      >
        {DRAGON_ASCII}
      </motion.pre>

      {/* Brand Text */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.4 }}
        className="cp-empty-brand"
      >
        K U R O R Y U U
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="cp-empty-brand-sub"
      >
        Black Dragon
      </motion.div>

      {/* Dragon Logo Separator */}
      <motion.img
        src={kuroryuuIcon}
        alt=""
        className="cp-empty-dragon-sep w-8 h-8 rounded-lg"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, duration: 0.4 }}
      />

      {/* Quick Action Cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.4 }}
        className="cp-empty-grid"
      >
        {SUGGESTIONS.map((item, i) => (
          <motion.button
            key={item.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 + i * 0.08, duration: 0.3 }}
            onClick={() => onSuggestionClick(item.label)}
            className="cp-empty-card"
          >
            <item.icon className="cp-empty-card-icon" size={18} />
            <div className="cp-empty-card-text">
              <span className="cp-empty-card-label">{item.label}</span>
              <span className="cp-empty-card-desc">{item.desc}</span>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

export default EmptyState;
