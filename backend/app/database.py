import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Setup Database path: supports production PostgreSQL environment variable
DB_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Clean up whitespace and quotes
    DATABASE_URL = DATABASE_URL.strip().strip("'\"")
    
    # Handle the standard postgres:// vs postgresql:// protocol
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
        
    # Safely URL-encode the password to prevent SQLAlchemy parsing errors
    try:
        if DATABASE_URL.startswith("postgresql://"):
            prefix, rest = DATABASE_URL.split("://", 1)
            if "@" in rest:
                auth_part, host_part = rest.rsplit("@", 1)
                if ":" in auth_part:
                    username, password = auth_part.split(":", 1)
                    
                    # Unquote first to prevent double-encoding, then quote to make it safe
                    unquoted_password = urllib.parse.unquote(password)
                    encoded_password = urllib.parse.quote(unquoted_password, safe='')
                    
                    # Log a warning if they left brackets or placeholder text in
                    if "[" in password or "]" in password or "your-password" in password.lower() or "your_password" in password.lower():
                        print("WARNING: It looks like 'DATABASE_URL' contains brackets or placeholder text (e.g. [your-password]). "
                              "Please make sure you replaced the placeholder with your actual Supabase database password.")
                    
                    DATABASE_URL = f"{prefix}://{username}:{encoded_password}@{host_part}"
    except Exception as e:
        print(f"Warning: Failed to parse or auto-encode database URL: {e}")

SQLALCHEMY_DATABASE_URL = DATABASE_URL or f"sqlite:///{os.path.join(DB_DIR, 'glowup.db')}"

is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

# SQLite needs check_same_thread; Postgres (especially Supabase pooler) needs
# pool_pre_ping for connection health, and prepared-statement mode disabled
# because Supabase transaction-pooler (port 6543, IPv4) does not support them.
connect_args = {"check_same_thread": False} if is_sqlite else {}

engine_kwargs = dict(connect_args=connect_args)

if not is_sqlite:
    engine_kwargs.update(
        pool_pre_ping=True,          # Drop dead connections before reuse
        pool_recycle=300,            # Recycle connections every 5 min
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
