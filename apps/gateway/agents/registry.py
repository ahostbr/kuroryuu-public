"""Agent Registry - Core registration and lifecycle management.

M2 Multi-Agent Message Bus implementation.

Features:
- Agent registration with auto-generated IDs
- Heartbeat tracking with configurable timeout (default 1s)
- Leader election (first to claim becomes leader)
- Dead agent reaping
- JSON persistence
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .models import Agent, AgentRole, AgentStatus
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


class AgentRegistry:
    """Thread-safe agent registry with persistence.
    
    Manages agent lifecycle:
    - Registration: Creates agent with unique ID
    - Heartbeat: Keeps agent alive, updates status
    - Death detection: Marks agents as dead after timeout
    - Leader election: First agent to request leader role gets it
    """
    
    def __init__(
        self,
        persist_path: Optional[Path] = None,
        heartbeat_timeout: float = 30.0,
    ):
        """Initialize registry.
        
        Args:
            persist_path: Path to JSON file for persistence (optional)
            heartbeat_timeout: Seconds before agent is considered dead (default 30.0)
        """
        self._agents: Dict[str, Agent] = {}
        self._lock = threading.RLock()
        self._persist_path = persist_path
        self._heartbeat_timeout = heartbeat_timeout
        self._leader_id: Optional[str] = None
        
        # Load persisted state if exists
        if persist_path and persist_path.exists():
            self._load()
    
    @property
    def heartbeat_timeout(self) -> float:
        """Get heartbeat timeout in seconds."""
        return self._heartbeat_timeout
    
    @heartbeat_timeout.setter
    def heartbeat_timeout(self, value: float) -> None:
        """Set heartbeat timeout in seconds."""
        self._heartbeat_timeout = max(0.1, value)  # Minimum 100ms
    
    def register(
        self,
        model_name: str,
        role: Optional[AgentRole] = None,
        capabilities: Optional[List[str]] = None,
        agent_id: Optional[str] = None,
        pty_session_id: Optional[str] = None,
    ) -> Tuple[Agent, str]:
        """Register a new agent.

        Args:
            model_name: LLM model name (claude, devstral, etc)
            role: Requested role (leader/worker). If leader requested and
                  no leader exists, grants leader. Otherwise assigns worker.
            capabilities: List of agent capabilities
            agent_id: Optional explicit agent ID (for LM Studio persistent agents).
                      If provided and agent exists, updates heartbeat instead.
            pty_session_id: Optional PTY session ID to link to this agent.

        Returns:
            Tuple of (Agent, message)
        """
        with self._lock:
            # Reap dead agents first
            self._reap_dead()
            
            # If explicit agent_id provided and agent exists, heartbeat and check promotion
            if agent_id and agent_id in self._agents:
                agent = self._agents[agent_id]
                agent.heartbeat()

                # Check if this agent should be promoted to leader (no leader exists)
                if (agent.agent_id.startswith("leader_") and
                    agent.role == AgentRole.WORKER and
                    self._leader_id is None):
                    agent.role = AgentRole.LEADER
                    self._leader_id = agent.agent_id
                    self._persist()
                    return agent, f"Agent {agent_id} promoted to leader (no leader existed)"

                self._persist()
                return agent, f"Agent {agent_id} heartbeat updated (already registered)"
            
            # Determine role
            actual_role = AgentRole.WORKER
            message = "Registered as worker"

            if role == AgentRole.LEADER:
                # Check if there's an ALIVE leader (not just if leader_id is set)
                current_leader = self._agents.get(self._leader_id) if self._leader_id else None
                leader_is_alive = current_leader and current_leader.is_alive(self._heartbeat_timeout)

                if self._leader_id is None or not leader_is_alive:
                    # No leader or leader is dead - grant leader role
                    actual_role = AgentRole.LEADER
                    if self._leader_id and not leader_is_alive:
                        message = f"Registered as leader (previous leader {self._leader_id} is dead)"
                        self._leader_id = None  # Clear dead leader
                    else:
                        message = "Registered as leader (first to claim)"
                else:
                    message = f"Leader already exists ({self._leader_id}), registered as worker"
            
            # Create agent
            agent = Agent.create(
                model_name=model_name,
                role=actual_role,
                capabilities=capabilities,
                agent_id=agent_id,
                pty_session_id=pty_session_id,
            )
            
            # Track leader
            if actual_role == AgentRole.LEADER:
                self._leader_id = agent.agent_id
            
            self._agents[agent.agent_id] = agent
            self._persist()
            
            return agent, message
    
    def heartbeat(
        self,
        agent_id: str,
        status: Optional[AgentStatus] = None,
        current_task_id: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Update agent heartbeat.
        
        Args:
            agent_id: Agent ID to update
            status: Optional new status
            current_task_id: Optional task assignment update
            
        Returns:
            Tuple of (success, message)
        """
        with self._lock:
            if agent_id not in self._agents:
                return False, f"Agent {agent_id} not found"
            
            agent = self._agents[agent_id]
            agent.heartbeat()
            
            if status is not None:
                agent.status = status
            
            if current_task_id is not None:
                agent.current_task_id = current_task_id
            
            self._persist()
            return True, f"Heartbeat updated for {agent_id}"
    
    def deregister(self, agent_id: str) -> Tuple[bool, str]:
        """Remove an agent from the registry.

        Args:
            agent_id: Agent ID to remove

        Returns:
            Tuple of (success, message)
        """
        with self._lock:
            if agent_id not in self._agents:
                return False, f"Agent {agent_id} not found"

            agent = self._agents.pop(agent_id)

            # Clear leader if this was the leader
            if self._leader_id == agent_id:
                self._leader_id = None

            self._persist()
            return True, f"Agent {agent_id} deregistered"

    def update_role(self, agent_id: str, new_role: AgentRole) -> Tuple[bool, str]:
        """Update an agent's role (promote/demote).

        Args:
            agent_id: Agent ID to update
            new_role: New role (leader/worker)

        Returns:
            Tuple of (success, message)
        """
        with self._lock:
            if agent_id not in self._agents:
                return False, f"Agent {agent_id} not found"

            agent = self._agents[agent_id]
            old_role = agent.role

            if old_role == new_role:
                return True, f"Agent {agent_id} already has role {new_role.value}"

            # Handle leader promotion
            if new_role == AgentRole.LEADER:
                # Demote current leader if exists
                if self._leader_id and self._leader_id != agent_id:
                    old_leader = self._agents.get(self._leader_id)
                    if old_leader:
                        old_leader.role = AgentRole.WORKER

                agent.role = AgentRole.LEADER
                self._leader_id = agent_id
                self._persist()
                return True, f"Agent {agent_id} promoted to leader"

            # Handle demotion to worker
            if new_role == AgentRole.WORKER:
                agent.role = AgentRole.WORKER
                if self._leader_id == agent_id:
                    self._leader_id = None
                self._persist()
                return True, f"Agent {agent_id} demoted to worker"

            return False, f"Unknown role: {new_role}"
    
    def get(self, agent_id: str) -> Optional[Agent]:
        """Get agent by ID."""
        with self._lock:
            return self._agents.get(agent_id)
    
    def list_all(self, include_dead: bool = False) -> List[Agent]:
        """List all agents.
        
        Args:
            include_dead: Whether to include dead agents
            
        Returns:
            List of agents
        """
        with self._lock:
            self._reap_dead()
            
            if include_dead:
                return list(self._agents.values())
            
            return [a for a in self._agents.values() if a.status != AgentStatus.DEAD]
    
    def get_leader(self) -> Optional[Agent]:
        """Get the current leader agent."""
        with self._lock:
            if self._leader_id and self._leader_id in self._agents:
                leader = self._agents[self._leader_id]
                if leader.is_alive(self._heartbeat_timeout):
                    return leader
                # Leader is dead, clear it
                self._leader_id = None
            return None
    
    def get_workers(self, status: Optional[AgentStatus] = None) -> List[Agent]:
        """Get all worker agents.
        
        Args:
            status: Filter by status (optional)
            
        Returns:
            List of worker agents
        """
        with self._lock:
            self._reap_dead()
            workers = [
                a for a in self._agents.values()
                if a.role == AgentRole.WORKER and a.status != AgentStatus.DEAD
            ]
            if status:
                workers = [w for w in workers if w.status == status]
            return workers
    
    def stats(self) -> dict:
        """Get registry statistics."""
        with self._lock:
            self._reap_dead()
            total = len(self._agents)
            alive = sum(1 for a in self._agents.values() if a.is_alive(self._heartbeat_timeout))
            dead = total - alive
            leaders = sum(1 for a in self._agents.values() 
                         if a.role == AgentRole.LEADER and a.is_alive(self._heartbeat_timeout))
            
            return {
                "total": total,
                "alive": alive,
                "dead": dead,
                "leaders": leaders,
                "leader_id": self._leader_id,
                "heartbeat_timeout": self._heartbeat_timeout,
            }
    
    def _reap_dead(self) -> int:
        """Mark and DELETE dead agents based on heartbeat timeout.

        Dead agents are immediately removed (no accumulation).

        Returns:
            Number of agents removed
        """
        dead_ids = []

        # First pass: identify dead agents and handle leader promotion
        for agent in list(self._agents.values()):
            if agent.status != AgentStatus.DEAD and not agent.is_alive(self._heartbeat_timeout):
                dead_ids.append(agent.agent_id)

                # Clear leader if dead and auto-promote BEFORE deletion
                if agent.agent_id == self._leader_id:
                    self._leader_id = None
                    # AUTO-PROMOTE: Find another agent with leader_ prefix to promote
                    for candidate in self._agents.values():
                        if (candidate.agent_id.startswith("leader_") and
                            candidate.agent_id != agent.agent_id and
                            candidate.agent_id not in dead_ids and
                            candidate.is_alive(self._heartbeat_timeout)):
                            candidate.role = AgentRole.LEADER
                            self._leader_id = candidate.agent_id
                            logger.info(f"[Registry] Auto-promoted {candidate.agent_id} to leader (previous leader {agent.agent_id} died)")
                            break

        # Second pass: DELETE dead agents immediately (no accumulation)
        for aid in dead_ids:
            logger.debug(f"[Registry] Purged dead agent: {aid}")
            del self._agents[aid]

        # Final check: if no leader exists, auto-promote an eligible agent
        if self._leader_id is None:
            for candidate in self._agents.values():
                if candidate.agent_id.startswith("leader_"):
                    candidate.role = AgentRole.LEADER
                    self._leader_id = candidate.agent_id
                    logger.info(f"[Registry] Auto-promoted {candidate.agent_id} to leader (no leader existed)")
                    break

        return len(dead_ids)

    def purge_dead(self) -> int:
        """Remove all dead agents from the registry.
        
        Returns:
            Number of agents removed
        """
        with self._lock:
            self._reap_dead()  # Mark any newly dead agents first
            
            # Find all dead agents
            dead_ids = [
                aid for aid, agent in self._agents.items()
                if agent.status == AgentStatus.DEAD
            ]
            
            # Remove them
            for aid in dead_ids:
                del self._agents[aid]
            
            self._persist()
            return len(dead_ids)
    
    def purge_all(self) -> int:
        """Remove ALL agents from the registry (dead and alive).
        
        Returns:
            Number of agents removed
        """
        with self._lock:
            count = len(self._agents)
            self._agents.clear()
            self._leader_id = None
            self._persist()
            return count
    
    def _persist(self) -> None:
        """Persist registry state to JSON file."""
        if not self._persist_path:
            return
        
        data = {
            "leader_id": self._leader_id,
            "heartbeat_timeout": self._heartbeat_timeout,
            "agents": {aid: a.to_dict() for aid, a in self._agents.items()},
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        self._persist_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._persist_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self) -> None:
        """Load registry state from JSON file."""
        if not self._persist_path or not self._persist_path.exists():
            return
        
        try:
            with open(self._persist_path) as f:
                data = json.load(f)
            
            self._leader_id = data.get("leader_id")
            self._heartbeat_timeout = data.get("heartbeat_timeout", 30.0)
            
            for aid, agent_data in data.get("agents", {}).items():
                # Parse datetime strings
                agent_data["last_heartbeat"] = datetime.fromisoformat(agent_data["last_heartbeat"])
                agent_data["registered_at"] = datetime.fromisoformat(agent_data["registered_at"])
                agent_data["role"] = AgentRole(agent_data["role"])
                agent_data["status"] = AgentStatus(agent_data["status"])
                
                self._agents[aid] = Agent(**agent_data)

            # Reset heartbeats for non-dead agents so they survive the initial purge
            # They have a grace period to start heartbeating again
            now = datetime.utcnow()
            for agent in self._agents.values():
                if agent.status != AgentStatus.DEAD:
                    agent.last_heartbeat = now

            # AUTO-PROMOTE: Before purging, ensure we have a leader if possible
            if self._leader_id is None:
                for candidate in self._agents.values():
                    if (candidate.agent_id.startswith("leader_") and
                        candidate.status != AgentStatus.DEAD):
                        candidate.role = AgentRole.LEADER
                        self._leader_id = candidate.agent_id
                        logger.info(f"[Registry] Auto-promoted {candidate.agent_id} to leader on startup")
                        break

            # AUTO-PURGE: Remove dead agents on startup to avoid accumulation
            purged = self.purge_dead()
            logger.info(f"[Registry] Loaded {len(self._agents)} agents, purged {purged} dead on startup")
        except Exception as e:
            logger.warning(f"Failed to load registry state: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# Global Registry Singleton
# ═══════════════════════════════════════════════════════════════════════════════

_registry: Optional[AgentRegistry] = None


def get_registry() -> AgentRegistry:
    """Get the global agent registry singleton.
    
    Lazily creates the registry with default persistence path.
    """
    global _registry
    if _registry is None:
        # Default persistence path: ai/agents_registry.json
        persist_path = Path(os.environ.get(
            "KURORYUU_REGISTRY_PATH",
            "ai/agents_registry.json"
        ))
        _registry = AgentRegistry(persist_path=persist_path)
    return _registry
