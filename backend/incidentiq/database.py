"""SQLAlchemy engine, session management, and connectivity checks."""
from collections.abc import Generator
from datetime import UTC, datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import get_settings

settings = get_settings()

db_url = settings.incidentiq_database_url
connect_args = {}
if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=settings.debug,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_database_connection() -> dict:
    """Actively test DB connectivity with a real query."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        backend = "sqlite" if db_url.startswith("sqlite") else "postgresql"
        return {"status": "healthy", "backend": backend, "reachable": True}
    except Exception as exc:
        return {"status": "unhealthy", "reachable": False, "error": exc.__class__.__name__}


def utc_now() -> datetime:
    return datetime.now(UTC)
