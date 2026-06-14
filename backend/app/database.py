import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# ─────────────────────────────────────────────────────────────
# Database URL resolution
#
# In production (Render) set DATABASE_URL to the Supabase
# SESSION POOLER connection string (port 5432):
#
#   postgresql://postgres.PROJECT_REF:[PASSWORD]@aws-x-region.pooler.supabase.com:5432/postgres
#
# The Session pooler is IPv4-compatible and supports prepared
# statements — it works with SQLAlchemy out of the box.
# ─────────────────────────────────────────────────────────────
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Strip accidental surrounding whitespace or quote characters
    DATABASE_URL = DATABASE_URL.strip().strip("'\"")

    # SQLAlchemy requires 'postgresql://' not 'postgres://'
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # URL-encode the password segment so special chars don't break parsing
    try:
        if DATABASE_URL.startswith("postgresql://"):
            prefix, rest = DATABASE_URL.split("://", 1)
            if "@" in rest:
                auth_part, host_part = rest.rsplit("@", 1)
                if ":" in auth_part:
                    username, password = auth_part.split(":", 1)

                    # Warn if placeholder was not replaced
                    if (
                        "[" in password or "]" in password
                        or "your-password" in password.lower()
                        or "your_password" in password.lower()
                    ):
                        print(
                            "⚠️  WARNING: DATABASE_URL still contains a placeholder password "
                            "(e.g. [YOUR-PASSWORD]). Replace it with your actual Supabase password."
                        )

                    # Unquote first (prevent double-encoding), then safely encode
                    encoded_password = urllib.parse.quote(
                        urllib.parse.unquote(password), safe=""
                    )
                    DATABASE_URL = f"{prefix}://{username}:{encoded_password}@{host_part}"
    except Exception as e:
        print(f"⚠️  Warning: Could not auto-encode DATABASE_URL password: {e}")

# Fall back to local SQLite for development
SQLALCHEMY_DATABASE_URL = DATABASE_URL or f"sqlite:///{os.path.join(DB_DIR, 'glowup.db')}"

is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

# SQLite → needs check_same_thread=False
# PostgreSQL (Supabase Session Pooler, port 5432) → standard config:
#   pool_pre_ping  : verify connection before using it
#   pool_recycle   : refresh connections every 5 min (avoids stale TCP)
#   pool_size / max_overflow : conservative limits for free-tier instances
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine_kwargs: dict = {"connect_args": connect_args}

if not is_sqlite:
    engine_kwargs.update(
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
    )

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
