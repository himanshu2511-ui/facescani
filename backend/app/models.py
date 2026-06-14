import datetime
from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, JSON
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    gender = Column(String, default="female")  # "male" or "female"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    scores = relationship("Score", back_populates="user", cascade="all, delete-orphan")

class Score(Base):
    __tablename__ = "scores"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    total_score = Column(Float, nullable=False)
    potential_score = Column(Float, nullable=False)
    details = Column(JSON, nullable=False)  # stores breakdown: symmetry, proportions, jawline, eyes, lips, etc.
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="scores")
