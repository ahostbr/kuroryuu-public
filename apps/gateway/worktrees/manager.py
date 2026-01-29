"""
Git Worktree Manager

Handles creation, listing, merging, and deletion of git worktrees.
"""

import os
import subprocess
import json
import time
import hashlib
from pathlib import Path
from typing import Optional
from dataclasses import asdict

from .models import (
    Worktree,
    WorktreeStatus,
    WorktreeType,
    AheadBehind,
    MergeResult,
    MergeConflict,
    MergeMode,
    CreateWorktreeRequest,
)


class WorktreeManager:
    """
    Manages git worktrees for task isolation.
    
    Each task can have its own worktree, allowing parallel development
    without branch switching.
    """
    
    def __init__(self, repo_path: str):
        self.repo_path = Path(repo_path)
        self.worktrees_dir = self.repo_path / ".worktrees"
        self.worktrees_dir.mkdir(exist_ok=True)
        self._cache: dict[str, Worktree] = {}
        self._cache_time: float = 0
        self._cache_ttl: float = 5.0  # seconds
    
    def _run_git(self, *args: str, cwd: Optional[Path] = None) -> tuple[bool, str]:
        """Run a git command and return (success, output)"""
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=cwd or self.repo_path,
                capture_output=True,
                text=True,
                timeout=30
            )
            return result.returncode == 0, result.stdout.strip() or result.stderr.strip()
        except subprocess.TimeoutExpired:
            return False, "Git command timed out"
        except Exception as e:
            return False, str(e)
    
    def _generate_id(self, branch_name: str) -> str:
        """Generate a unique ID for a worktree"""
        hash_input = f"{branch_name}-{time.time()}"
        return f"wt-{hashlib.md5(hash_input.encode()).hexdigest()[:8]}"
    
    def _get_ahead_behind(self, branch: str, base: str = "main") -> Optional[AheadBehind]:
        """Get ahead/behind counts for a branch"""
        success, output = self._run_git("rev-list", "--left-right", "--count", f"{base}...{branch}")
        if success and output:
            try:
                parts = output.split()
                if len(parts) == 2:
                    return AheadBehind(behind=int(parts[0]), ahead=int(parts[1]))
            except ValueError:
                pass
        return None
    
    def _get_uncommitted_count(self, worktree_path: Path) -> int:
        """Get count of uncommitted changes in a worktree"""
        success, output = self._run_git("status", "--porcelain", cwd=worktree_path)
        if success and output:
            return len([line for line in output.split("\n") if line.strip()])
        return 0
    
    def _get_worktree_status(self, worktree_path: Path, uncommitted: int) -> WorktreeStatus:
        """Determine the status of a worktree"""
        # Check for merge in progress
        merge_head = worktree_path / ".git" / "MERGE_HEAD"
        if merge_head.exists():
            return WorktreeStatus.MERGING
        
        # Check for conflicts
        success, output = self._run_git("diff", "--name-only", "--diff-filter=U", cwd=worktree_path)
        if success and output:
            return WorktreeStatus.CONFLICT
        
        # Check if dirty
        if uncommitted > 0:
            return WorktreeStatus.DIRTY
        
        return WorktreeStatus.IDLE
    
    def list_worktrees(self, force_refresh: bool = False) -> list[Worktree]:
        """
        List all worktrees in the repository.
        
        Uses caching to avoid repeated git calls.
        """
        now = time.time()
        if not force_refresh and self._cache and (now - self._cache_time) < self._cache_ttl:
            return list(self._cache.values())
        
        worktrees = []
        success, output = self._run_git("worktree", "list", "--porcelain")
        
        if not success:
            return worktrees
        
        # Parse porcelain output
        current_wt: dict = {}
        for line in output.split("\n"):
            if line.startswith("worktree "):
                if current_wt:
                    worktrees.append(current_wt)
                current_wt = {"path": line[9:]}
            elif line.startswith("HEAD "):
                current_wt["head"] = line[5:]
            elif line.startswith("branch "):
                current_wt["branch"] = line[7:].replace("refs/heads/", "")
            elif line == "bare":
                current_wt["bare"] = True
            elif line == "detached":
                current_wt["detached"] = True
        
        if current_wt:
            worktrees.append(current_wt)
        
        # Convert to Worktree objects
        result = []
        for wt_data in worktrees:
            path = Path(wt_data.get("path", ""))
            branch = wt_data.get("branch", "unknown")
            
            # Skip main worktree and bare repos
            if path == self.repo_path or wt_data.get("bare"):
                continue
            
            # Determine type based on path
            is_task = str(path).startswith(str(self.worktrees_dir))
            
            # Get metadata from worktree marker file if exists
            metadata_file = path / ".worktree_meta.json"
            metadata = {}
            if metadata_file.exists():
                try:
                    metadata = json.loads(metadata_file.read_text())
                except Exception:
                    pass
            
            uncommitted = self._get_uncommitted_count(path)
            status = self._get_worktree_status(path, uncommitted)
            ahead_behind = self._get_ahead_behind(branch)
            
            wt = Worktree(
                id=metadata.get("id", self._generate_id(branch)),
                type=WorktreeType.TASK if is_task else WorktreeType.GIT,
                branch_name=branch,
                path=str(path),
                status=status,
                spec_name=metadata.get("spec_name"),
                task_id=metadata.get("task_id"),
                task_title=metadata.get("task_title"),
                last_activity=int(path.stat().st_mtime * 1000) if path.exists() else None,
                ahead_behind=ahead_behind,
                is_dirty=uncommitted > 0,
                uncommitted_changes=uncommitted,
            )
            result.append(wt)
        
        # Update cache
        self._cache = {wt.id: wt for wt in result}
        self._cache_time = now
        
        return result
    
    def get_worktree(self, worktree_id: str) -> Optional[Worktree]:
        """Get a specific worktree by ID"""
        self.list_worktrees()  # Ensure cache is populated
        return self._cache.get(worktree_id)
    
    def create_worktree(self, request: CreateWorktreeRequest) -> tuple[bool, Worktree | str]:
        """
        Create a new worktree for a task.
        
        Returns (success, Worktree | error_message)
        """
        # Sanitize branch name
        safe_branch = request.branch_name.replace(" ", "-").lower()
        if not safe_branch.startswith("feature/") and not safe_branch.startswith("bugfix/"):
            safe_branch = f"feature/{safe_branch}"
        
        # Create worktree path
        worktree_name = safe_branch.split("/")[-1]
        worktree_path = self.worktrees_dir / worktree_name
        
        if worktree_path.exists():
            return False, f"Worktree path already exists: {worktree_path}"
        
        # Create branch and worktree
        success, output = self._run_git(
            "worktree", "add", "-b", safe_branch, 
            str(worktree_path), request.base_branch
        )
        
        if not success:
            return False, f"Failed to create worktree: {output}"
        
        # Generate ID and save metadata
        wt_id = self._generate_id(safe_branch)
        metadata = {
            "id": wt_id,
            "task_id": request.task_id,
            "task_title": request.task_title,
            "spec_name": request.spec_name,
            "created_at": int(time.time() * 1000),
        }
        
        metadata_file = worktree_path / ".worktree_meta.json"
        metadata_file.write_text(json.dumps(metadata, indent=2))
        
        # Create worktree object
        wt = Worktree(
            id=wt_id,
            type=WorktreeType.TASK,
            branch_name=safe_branch,
            path=str(worktree_path),
            status=WorktreeStatus.IDLE,
            spec_name=request.spec_name,
            task_id=request.task_id,
            task_title=request.task_title,
            last_activity=int(time.time() * 1000),
            ahead_behind=AheadBehind(ahead=0, behind=0),
            is_dirty=False,
            uncommitted_changes=0,
        )
        
        # Update cache
        self._cache[wt_id] = wt
        
        return True, wt
    
    def delete_worktree(self, worktree_id: str, force: bool = False) -> tuple[bool, str]:
        """
        Delete a worktree.
        
        Returns (success, message)
        """
        wt = self.get_worktree(worktree_id)
        if not wt:
            return False, f"Worktree not found: {worktree_id}"
        
        # Remove worktree
        args = ["worktree", "remove"]
        if force:
            args.append("--force")
        args.append(wt.path)
        
        success, output = self._run_git(*args)
        
        if not success:
            return False, f"Failed to remove worktree: {output}"
        
        # Delete branch if it was a task worktree
        if wt.type == WorktreeType.TASK:
            self._run_git("branch", "-D", wt.branch_name)
        
        # Update cache
        if worktree_id in self._cache:
            del self._cache[worktree_id]
        
        return True, f"Worktree {wt.branch_name} deleted"
    
    def merge_worktree(
        self, 
        worktree_id: str, 
        mode: MergeMode = MergeMode.FULL,
        target_branch: str = "main"
    ) -> MergeResult:
        """
        Merge a worktree branch into the target branch.
        
        Modes:
        - FULL: Merge and commit
        - STAGE_ONLY: Stage changes without committing
        """
        wt = self.get_worktree(worktree_id)
        if not wt:
            return MergeResult(success=False, error=f"Worktree not found: {worktree_id}")
        
        # Ensure target branch is checked out in main worktree
        success, current = self._run_git("branch", "--show-current")
        if not success or current != target_branch:
            success, output = self._run_git("checkout", target_branch)
            if not success:
                return MergeResult(success=False, error=f"Failed to checkout {target_branch}: {output}")
        
        # Perform merge
        merge_args = ["merge", wt.branch_name]
        if mode == MergeMode.STAGE_ONLY:
            merge_args.append("--no-commit")
        
        success, output = self._run_git(*merge_args)
        
        if not success:
            # Check for conflicts
            if "CONFLICT" in output or "conflict" in output.lower():
                conflicts = self._get_conflicts()
                return MergeResult(success=False, conflicts=conflicts, error="Merge conflicts detected")
            return MergeResult(success=False, error=f"Merge failed: {output}")
        
        # Get merged files
        success, diff_output = self._run_git("diff", "--name-only", f"{target_branch}~1..HEAD")
        merged_files = diff_output.split("\n") if success and diff_output else []
        
        return MergeResult(success=True, merged_files=merged_files)
    
    def _get_conflicts(self) -> list[MergeConflict]:
        """Get list of conflicting files"""
        conflicts = []
        success, output = self._run_git("diff", "--name-only", "--diff-filter=U")
        
        if success and output:
            for file_path in output.split("\n"):
                if file_path.strip():
                    conflicts.append(MergeConflict(file_path=file_path.strip()))
        
        return conflicts
    
    def resolve_conflict(
        self, 
        worktree_id: str, 
        file_path: str, 
        resolution: str
    ) -> tuple[bool, str]:
        """
        Resolve a merge conflict for a specific file.
        
        resolution: "ours" or "theirs"
        """
        wt = self.get_worktree(worktree_id)
        if not wt:
            return False, f"Worktree not found: {worktree_id}"
        
        # Use git checkout with --ours or --theirs
        checkout_arg = f"--{resolution}"
        success, output = self._run_git("checkout", checkout_arg, file_path, cwd=Path(wt.path))
        
        if not success:
            return False, f"Failed to resolve conflict: {output}"
        
        # Stage the resolved file
        success, output = self._run_git("add", file_path, cwd=Path(wt.path))
        
        if not success:
            return False, f"Failed to stage resolved file: {output}"
        
        return True, f"Resolved {file_path} using {resolution}"
    
    def open_in_explorer(self, worktree_id: str) -> tuple[bool, str]:
        """Open worktree folder in system file explorer"""
        wt = self.get_worktree(worktree_id)
        if not wt:
            return False, f"Worktree not found: {worktree_id}"
        
        try:
            import platform
            if platform.system() == "Windows":
                os.startfile(wt.path)
            elif platform.system() == "Darwin":
                subprocess.run(["open", wt.path])
            else:
                subprocess.run(["xdg-open", wt.path])
            return True, f"Opened {wt.path}"
        except Exception as e:
            return False, str(e)
    
    def get_terminal_command(self, worktree_id: str) -> tuple[bool, str]:
        """Get command to open terminal in worktree directory"""
        wt = self.get_worktree(worktree_id)
        if not wt:
            return False, f"Worktree not found: {worktree_id}"
        
        return True, f"cd {wt.path}"


def _get_default_repo_path() -> str:
    """Get default repo path from env or derive from __file__."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return env_root
    # __file__ is apps/gateway/worktrees/manager.py -> go up 3 levels
    return str(Path(__file__).resolve().parent.parent.parent.parent)

# Singleton instance
_manager_instance: Optional[WorktreeManager] = None


def get_worktree_manager(repo_path: str = "") -> WorktreeManager:
    """Get or create the worktree manager singleton"""
    global _manager_instance
    if _manager_instance is None:
        path = repo_path or _get_default_repo_path()
        _manager_instance = WorktreeManager(path)
    return _manager_instance
