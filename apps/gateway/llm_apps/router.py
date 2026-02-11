"""
LLM Apps Catalog — Gateway Router
Serves the catalog JSON and individual app READMEs.
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/v1/llm-apps", tags=["llm-apps"])

PROJECT_ROOT = Path(os.environ.get("KURORYUU_ROOT", Path(__file__).resolve().parents[2]))
CATALOG_FILE = PROJECT_ROOT / "ai" / "data" / "llm-apps-catalog.json"
REPO_DIR = PROJECT_ROOT / "tools" / "llm-apps" / "awesome-llm-apps"


@router.get("/catalog")
async def get_catalog():
    """Return the full LLM apps catalog."""
    if not CATALOG_FILE.exists():
        raise HTTPException(status_code=404, detail="Catalog not built yet. Use the Desktop setup wizard.")
    data = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    return data


@router.get("/categories")
async def get_categories():
    """Return just the category listing."""
    if not CATALOG_FILE.exists():
        raise HTTPException(status_code=404, detail="Catalog not built yet.")
    data = json.loads(CATALOG_FILE.read_text(encoding="utf-8"))
    return {"categories": data.get("categories", []), "totalApps": data.get("totalApps", 0)}


@router.get("/app/{app_path:path}")
async def get_app_detail(app_path: str):
    """Return an individual app's README and metadata."""
    if not REPO_DIR.exists():
        raise HTTPException(status_code=404, detail="Repository not cloned.")

    app_dir = REPO_DIR / app_path
    if not app_dir.exists() or not app_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"App not found: {app_path}")

    # Find README
    readme_content = None
    for name in ["README.md", "README.MD", "readme.md", "Readme.md"]:
        readme_path = app_dir / name
        if readme_path.exists():
            readme_content = readme_path.read_text(encoding="utf-8", errors="replace")
            break

    # Find Python files
    py_files = sorted([f.name for f in app_dir.iterdir() if f.suffix == ".py"])

    # Find requirements
    requirements = None
    req_path = app_dir / "requirements.txt"
    if req_path.exists():
        requirements = req_path.read_text(encoding="utf-8", errors="replace")

    return {
        "path": app_path,
        "readme": readme_content,
        "python_files": py_files,
        "requirements": requirements,
        "absolute_path": str(app_dir),
    }
