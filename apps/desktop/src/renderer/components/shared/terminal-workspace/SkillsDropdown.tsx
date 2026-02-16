import { useState, useRef, useEffect } from 'react';
import { Lightbulb, ChevronDown } from 'lucide-react';
import type { WorkspaceSkill } from './types';

interface SkillsDropdownProps {
  skills: WorkspaceSkill[];
  pathPrefix: string;
  terminalPtyId: string | null;
}

export function SkillsDropdown({ skills, pathPrefix, terminalPtyId }: SkillsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSkillClick = (file: string) => {
    if (terminalPtyId && window.electronAPI?.pty) {
      window.electronAPI.pty.write(terminalPtyId, `'${pathPrefix}${file}'`);
      setIsOpen(false);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!terminalPtyId}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
          isOpen
            ? 'bg-amber-500/20 text-amber-500'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <Lightbulb className="w-4 h-4" />
        <span>Skills</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1 overflow-hidden">
          {skills.map((skill) => {
            const Icon = skill.icon;
            return (
              <button
                key={skill.id}
                onClick={() => handleSkillClick(skill.file)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-amber-500/10 hover:text-amber-500 transition-colors"
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{skill.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
