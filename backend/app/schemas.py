from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, List, Optional
import datetime

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=20)
    password: str = Field(..., min_length=6)
    gender: str = Field(..., pattern="^(male|female)$")

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    username: str
    gender: str
    created_at: datetime.datetime

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

class ScoreResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    user_id: int
    total_score: float
    potential_score: float
    details: Dict[str, float]
    created_at: datetime.datetime

class LeaderboardEntry(BaseModel):
    username: str
    gender: str
    best_score: float
    created_at: datetime.datetime
