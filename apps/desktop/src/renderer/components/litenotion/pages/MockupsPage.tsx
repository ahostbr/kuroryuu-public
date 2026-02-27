import { PenTool } from 'lucide-react';

export function MockupsPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <PenTool className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Mockups</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Design wireframes and UI mockups</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <div className="text-center space-y-3">
          <PenTool className="w-12 h-12 mx-auto text-zinc-600" />
          <div>
            <p className="text-sm font-medium text-zinc-400">Mockups Workspace</p>
            <p className="text-xs text-zinc-500 mt-1">
              Use the terminal to generate mockups with Excalidraw skills
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
