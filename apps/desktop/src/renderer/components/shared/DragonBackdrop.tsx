/**
 * DragonBackdrop — Reusable dragon ASCII background for empty/landing states
 *
 * Renders the crimson dragon ASCII art as a subtle background layer with
 * gold kanji, scanlines, and vignette. Children are rendered on top.
 *
 * Usage:
 *   <DragonBackdrop>
 *     <YourContent />
 *   </DragonBackdrop>
 *
 * Or with subtitle override:
 *   <DragonBackdrop subtitle="Forge your battle plan">
 */
import type { ReactNode } from 'react';

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

interface DragonBackdropProps {
  children: ReactNode;
  subtitle?: string;
}

export function DragonBackdrop({ children, subtitle }: DragonBackdropProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center relative overflow-hidden">
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.025) 2px, rgba(0,0,0,0.025) 4px)',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.45) 100%)',
        }}
      />

      {/* Dragon ASCII background layer — centered, very dim */}
      <pre
        aria-hidden="true"
        className="absolute pointer-events-none select-none leading-[1.1] overflow-hidden z-[1]"
        style={{
          fontSize: 'clamp(0.2rem, 0.38vw, 0.33rem)',
          color: 'rgba(160,35,35,0.45)',
          textShadow: '0 0 14px rgba(200,50,50,0.25)',
          fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          whiteSpace: 'pre',
        }}
      >
        {DRAGON_ASCII}
      </pre>

      {/* Kanji watermark — above dragon, dim */}
      <div
        className="absolute pointer-events-none select-none z-[2]"
        style={{
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '2.5rem',
          color: 'rgba(201,162,39,0.22)',
          textShadow: '0 0 30px rgba(201,162,39,0.12)',
          letterSpacing: '0.15em',
          fontFamily: 'serif',
        }}
      >
        黒龍幻霧
      </div>

      {/* Subtitle watermark */}
      {subtitle && (
        <div
          className="absolute pointer-events-none select-none font-mono uppercase tracking-[0.3em] z-[2]"
          style={{
            bottom: '12%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '9px',
            color: 'rgba(201,162,39,0.28)',
          }}
        >
          {subtitle}
        </div>
      )}

      {/* Foreground content */}
      <div className="relative z-[3] flex flex-col items-center text-center px-4">
        {children}
      </div>
    </div>
  );
}
