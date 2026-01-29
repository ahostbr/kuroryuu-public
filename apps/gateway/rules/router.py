"""
Router - Rules Learning

System for learning and organizing development rules:
- Extract rules from successful patterns
- Store rules by scope (component, api, testing, etc.)
- Apply rules to future work
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import json

router = APIRouter(prefix="/v1/rules", tags=["rules"])

# ============================================================================
# Models
# ============================================================================
class LearnRuleRequest(BaseModel):
    """Request to learn a new rule."""
    scope: str  # component, api, testing, documentation, security, etc.
    title: str
    description: str
    example: str = ""
    source: str = ""  # Where this rule came from
    confidence: float = 0.8  # How confident we are in this rule

class RuleResponse(BaseModel):
    """Response with rule details."""
    ok: bool = True
    rule_id: Optional[str] = None
    error: Optional[str] = None

class Rule(BaseModel):
    """A development rule."""
    id: str
    scope: str
    title: str
    description: str
    example: str = ""
    source: str = ""
    confidence: float = 0.8
    usage_count: int = 0
    created_at: str
    last_used: Optional[str] = None

class RulesQueryRequest(BaseModel):
    """Request to query rules."""
    scope: Optional[str] = None
    query: str = ""
    limit: int = 10

# ============================================================================
# Storage
# ============================================================================
def get_rules_dir() -> Path:
    """Get rules storage directory."""
    root = Path(__file__).parent.parent.parent
    rules_dir = root / "ai" / "rules"
    rules_dir.mkdir(parents=True, exist_ok=True)
    return rules_dir

def get_scope_dir(scope: str) -> Path:
    """Get directory for a specific scope."""
    scope_dir = get_rules_dir() / "by-scope" / scope
    scope_dir.mkdir(parents=True, exist_ok=True)
    return scope_dir

def get_learned_dir() -> Path:
    """Get directory for newly learned rules."""
    learned = get_rules_dir() / "learned"
    learned.mkdir(parents=True, exist_ok=True)
    return learned

def load_rules_index() -> Dict[str, Any]:
    """Load the rules index."""
    index_path = get_rules_dir() / "index.json"
    if index_path.exists():
        return json.loads(index_path.read_text())
    return {"rules": [], "scopes": [], "stats": {"total": 0, "by_scope": {}}}

def save_rules_index(index: Dict[str, Any]) -> None:
    """Save the rules index."""
    index_path = get_rules_dir() / "index.json"
    index_path.write_text(json.dumps(index, indent=2))

def save_rule(rule: Dict[str, Any]) -> Path:
    """Save a rule to file."""
    # Save to scope directory
    scope_dir = get_scope_dir(rule["scope"])
    rule_path = scope_dir / f"{rule['id']}.json"
    rule_path.write_text(json.dumps(rule, indent=2))
    
    # Also save to learned directory for review
    learned_path = get_learned_dir() / f"{rule['id']}.json"
    learned_path.write_text(json.dumps(rule, indent=2))
    
    return rule_path

# ============================================================================
# Endpoints
# ============================================================================
@router.get("/status")
async def rules_status() -> Dict[str, Any]:
    """Get rules system status."""
    index = load_rules_index()
    
    return {
        "ok": True,
        "total_rules": index["stats"].get("total", 0),
        "scopes": index.get("scopes", []),
        "by_scope": index["stats"].get("by_scope", {})
    }

@router.post("/learn", response_model=RuleResponse)
async def learn_rule(request: LearnRuleRequest) -> RuleResponse:
    """
    Learn a new development rule.
    
    Rules are extracted from successful patterns and stored for future use.
    """
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        slug = request.title.lower().replace(" ", "_")[:30]
        rule_id = f"rule_{request.scope}_{timestamp}_{slug}"
        
        rule = {
            "id": rule_id,
            "scope": request.scope,
            "title": request.title,
            "description": request.description,
            "example": request.example,
            "source": request.source,
            "confidence": request.confidence,
            "usage_count": 0,
            "created_at": datetime.now().isoformat(),
            "last_used": None
        }
        
        # Save rule
        save_rule(rule)
        
        # Update index
        index = load_rules_index()
        index["rules"].append({
            "id": rule_id,
            "scope": request.scope,
            "title": request.title,
            "confidence": request.confidence
        })
        
        if request.scope not in index["scopes"]:
            index["scopes"].append(request.scope)
        
        index["stats"]["total"] = len(index["rules"])
        index["stats"]["by_scope"][request.scope] = index["stats"]["by_scope"].get(request.scope, 0) + 1
        
        save_rules_index(index)
        
        return RuleResponse(ok=True, rule_id=rule_id)
        
    except Exception as e:
        return RuleResponse(ok=False, error=str(e))

@router.get("/list")
async def list_rules(scope: Optional[str] = None) -> Dict[str, Any]:
    """List rules, optionally filtered by scope."""
    index = load_rules_index()
    rules = index.get("rules", [])
    
    if scope:
        rules = [r for r in rules if r["scope"] == scope]
    
    return {"ok": True, "rules": rules, "count": len(rules)}

@router.get("/scopes")
async def list_scopes() -> Dict[str, Any]:
    """List all rule scopes."""
    index = load_rules_index()
    return {
        "ok": True,
        "scopes": index.get("scopes", []),
        "stats": index["stats"].get("by_scope", {})
    }

@router.get("/{rule_id}")
async def get_rule(rule_id: str) -> Dict[str, Any]:
    """Get a specific rule."""
    # Search in all scope directories
    for scope_dir in (get_rules_dir() / "by-scope").iterdir():
        if scope_dir.is_dir():
            rule_path = scope_dir / f"{rule_id}.json"
            if rule_path.exists():
                return {
                    "ok": True,
                    "rule": json.loads(rule_path.read_text())
                }
    
    return {"ok": False, "error": "Rule not found"}

@router.post("/{rule_id}/use")
async def mark_rule_used(rule_id: str) -> Dict[str, Any]:
    """Mark a rule as used (increments usage count)."""
    # Find and update rule
    for scope_dir in (get_rules_dir() / "by-scope").iterdir():
        if scope_dir.is_dir():
            rule_path = scope_dir / f"{rule_id}.json"
            if rule_path.exists():
                rule = json.loads(rule_path.read_text())
                rule["usage_count"] = rule.get("usage_count", 0) + 1
                rule["last_used"] = datetime.now().isoformat()
                rule_path.write_text(json.dumps(rule, indent=2))
                
                return {"ok": True, "usage_count": rule["usage_count"]}
    
    return {"ok": False, "error": "Rule not found"}

@router.post("/query")
async def query_rules(request: RulesQueryRequest) -> Dict[str, Any]:
    """
    Query rules by scope and/or text search.
    
    Returns relevant rules for the current task context.
    """
    index = load_rules_index()
    rules = index.get("rules", [])
    
    # Filter by scope
    if request.scope:
        rules = [r for r in rules if r["scope"] == request.scope]
    
    # Text search (simple contains for now)
    if request.query:
        query_lower = request.query.lower()
        rules = [r for r in rules if 
                 query_lower in r["title"].lower() or
                 query_lower in r.get("description", "").lower()]
    
    # Sort by confidence
    rules = sorted(rules, key=lambda r: r.get("confidence", 0), reverse=True)
    
    # Limit
    rules = rules[:request.limit]
    
    return {"ok": True, "rules": rules, "count": len(rules)}

@router.delete("/{rule_id}")
async def delete_rule(rule_id: str) -> Dict[str, Any]:
    """Delete a rule."""
    deleted = False
    
    # Remove from scope directory
    for scope_dir in (get_rules_dir() / "by-scope").iterdir():
        if scope_dir.is_dir():
            rule_path = scope_dir / f"{rule_id}.json"
            if rule_path.exists():
                rule_path.unlink()
                deleted = True
                break
    
    # Remove from learned directory
    learned_path = get_learned_dir() / f"{rule_id}.json"
    if learned_path.exists():
        learned_path.unlink()
    
    # Update index
    if deleted:
        index = load_rules_index()
        index["rules"] = [r for r in index["rules"] if r["id"] != rule_id]
        index["stats"]["total"] = len(index["rules"])
        save_rules_index(index)
        
        return {"ok": True, "message": f"Deleted {rule_id}"}
    
    return {"ok": False, "error": "Rule not found"}
