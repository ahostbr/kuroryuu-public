#!/usr/bin/env python
"""
Run a 3-agent swarm on a task.

The swarm consists of:
  1. PLANNER - Analyzes task and creates implementation plan
  2. CODER - Implements the plan using tools
  3. REVIEWER - Reviews changes and approves/requests changes

Usage:
    python -m apps.gateway.run_swarm --task T001
    python -m apps.gateway.run_swarm --task T001 --backend claude
    python -m apps.gateway.run_swarm --task T001 --project /path/to/project
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Ensure apps package is importable
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from apps.gateway.swarm.orchestrator import SwarmOrchestrator


def main():
    parser = argparse.ArgumentParser(
        description='Run 3-agent swarm (Planner → Coder → Reviewer) on a task'
    )
    parser.add_argument(
        '--task', '-t',
        required=True,
        help='Task ID to work on (e.g., T001)'
    )
    parser.add_argument(
        '--backend', '-b',
        default='lmstudio',
        choices=['lmstudio', 'claude'],
        help='LLM backend to use (default: lmstudio)'
    )
    parser.add_argument(
        '--project', '-p',
        default='.',
        help='Project root directory (default: current directory)'
    )
    parser.add_argument(
        '--max-turns', '-m',
        type=int,
        default=15,
        help='Max tool calls per agent (default: 15)'
    )
    parser.add_argument(
        '--quiet', '-q',
        action='store_true',
        help='Suppress verbose output'
    )
    
    args = parser.parse_args()
    
    print(f"""
╔══════════════════════════════════════════════════════════════╗
║                    KURORYUU SWARM RUNNER                     ║
╠══════════════════════════════════════════════════════════════╣
║  Task:    {args.task:<50} ║
║  Backend: {args.backend:<50} ║
║  Project: {args.project:<50} ║
╚══════════════════════════════════════════════════════════════╝
""")
    
    orchestrator = SwarmOrchestrator(
        task_id=args.task,
        project_root=Path(args.project).resolve(),
        backend=args.backend,
        max_turns_per_agent=args.max_turns,
        verbose=not args.quiet
    )
    
    try:
        result = asyncio.run(orchestrator.run())
        
        print(f"""
╔══════════════════════════════════════════════════════════════╗
║                      SWARM COMPLETE                          ║
╠══════════════════════════════════════════════════════════════╣
║  Swarm ID: {result['swarm_id']:<49} ║
║  Task:     {result['task_id']:<49} ║
║  Approved: {'✓ YES' if result['approved'] else '✗ NO':<49} ║
╠══════════════════════════════════════════════════════════════╣
║  Artifacts:                                                  ║
║    - plan.md                                                 ║
║    - changes.diff                                            ║
║    - review.md                                               ║
║    - summary.json                                            ║
╚══════════════════════════════════════════════════════════════╝
""")
        
        sys.exit(0 if result['approved'] else 1)
        
    except FileNotFoundError as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        sys.exit(2)
    except ValueError as e:
        print(f"\n[ERROR] {e}", file=sys.stderr)
        sys.exit(3)
    except KeyboardInterrupt:
        print('\n[SWARM] Interrupted by user')
        sys.exit(130)
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
