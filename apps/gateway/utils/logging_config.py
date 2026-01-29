"""
Gateway Logging Configuration
Centralized logging setup with disk persistence to ai/logs/gateway.log
"""
import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

# Log directory (matches desktop app pattern)
LOG_DIR = Path(__file__).parent.parent.parent.parent / "ai" / "logs"
LOG_FILE = LOG_DIR / "gateway.log"

# Ensure log directory exists
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Log format matching desktop app style: [timestamp] [LEVEL] [module] message
LOG_FORMAT = "[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s"
DATE_FORMAT = "%Y-%m-%dT%H:%M:%S"

# Rotation settings
MAX_BYTES = 10 * 1024 * 1024  # 10MB
BACKUP_COUNT = 5  # Keep 5 backup files

# Global flag to prevent double initialization
_initialized = False


def setup_logging(level: int = logging.INFO) -> logging.Logger:
    """
    Set up gateway logging with file rotation.

    Returns the root gateway logger.
    Call this once at gateway startup.
    """
    global _initialized
    if _initialized:
        return logging.getLogger("gateway")

    # Create formatter
    formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)

    # Create rotating file handler
    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(level)

    # Create console handler for important messages
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.WARNING)  # Only warnings+ to console

    # Configure root gateway logger
    root_logger = logging.getLogger("gateway")
    root_logger.setLevel(level)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Prevent propagation to root logger
    root_logger.propagate = False

    _initialized = True
    root_logger.info("Gateway logging initialized", extra={"path": str(LOG_FILE)})

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger for a specific module.

    Usage:
        from utils.logging_config import get_logger
        logger = get_logger(__name__)
        logger.info("Something happened")
    """
    # Ensure logging is set up
    if not _initialized:
        setup_logging()

    # Create child logger under gateway namespace
    if name.startswith("gateway."):
        return logging.getLogger(name)
    return logging.getLogger(f"gateway.{name}")


# Convenience function for quick migration from print()
def log_info(msg: str, module: str = "gateway"):
    """Quick replacement for print() during migration."""
    get_logger(module).info(msg)


def log_error(msg: str, module: str = "gateway"):
    """Quick replacement for print() error messages."""
    get_logger(module).error(msg)


def log_warning(msg: str, module: str = "gateway"):
    """Quick replacement for print() warning messages."""
    get_logger(module).warning(msg)


def log_debug(msg: str, module: str = "gateway"):
    """Quick replacement for print() debug messages."""
    get_logger(module).debug(msg)
