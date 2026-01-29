#!/usr/bin/env python
"""
CLI entrypoint for running an agent on a task.

Usage:
    python -m apps.gateway.run_agent --task T001 --backend lmstudio
    python -m apps.gateway.run_agent --task T001 --thread agent_001 --backend claude
"""
import argparse
import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from apps.gateway.cli.runner import AgentRunner


def main():
    parser = argparse.ArgumentParser(description='Run Kuroryuu agent on a task')
    parser.add_argument('--task', '-t', required=True, help='Task ID (e.g., T001)')
    parser.add_argument('--thread', default=None, help='Thread ID (default: auto-generated)')
    parser.add_argument('--backend', '-b', default='lmstudio', 
                        choices=['claude', 'lmstudio'], help='LLM backend')
    parser.add_argument('--max-turns', type=int, default=20, help='Max tool loop turns')
    parser.add_argument('--project', '-p', default='.', help='Project root path')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    
    args = parser.parse_args()
    
    runner = AgentRunner(
        task_id=args.task,
        thread_id=args.thread,
        backend=args.backend,
        max_turns=args.max_turns,
        project_root=Path(args.project).resolve(),
        verbose=args.verbose
    )
    
    try:
        asyncio.run(runner.run())
    except KeyboardInterrupt:
        print('\n[PHASE] INTERRUPTED')
        sys.exit(130)
    except Exception as e:
        print(f'[ERROR] {e}')
        sys.exit(1)


if __name__ == '__main__':
    main()
