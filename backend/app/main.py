import json
import logging
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import jwt

from .database import get_db, engine, Base
from .models import User, Score
from .schemas import UserCreate, UserResponse, Token, ScoreResponse, LeaderboardEntry
from .auth import get_password_hash, verify_password, create_access_token, get_current_user, SECRET_KEY, ALGORITHM
from .face_analyzer import FaceAnalyzer
from .guidance import GuidanceGenerator
from .leaderboard import LeaderboardManager

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create Tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI Glowup Coach API", version="1.0.0")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

analyzer = FaceAnalyzer()

@app.get("/")
def read_root():
    return {"status": "online", "app": "AI Glowup Coach API"}

# --- AUTH ENDPOINTS ---

@app.post("/auth/register", response_model=Token)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user_in.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_pwd = get_password_hash(user_in.password)
    new_user = User(
        username=user_in.username,
        hashed_password=hashed_pwd,
        gender=user_in.gender
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    token = create_access_token({"sub": new_user.username})
    return {"access_token": token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}

@app.get("/auth/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

# --- ANALYSIS ENDPOINTS ---

@app.post("/analyze")
async def analyze_frame(
    file: UploadFile = File(...),
    gender: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Analyzes a single uploaded face photo.
    """
    img_bytes = await file.read()
    target_gender = gender or current_user.gender
    
    result = analyzer.analyze_image(img_bytes, target_gender)
    
    # Save score to db
    db_score = Score(
        user_id=current_user.id,
        total_score=result["total_score"],
        potential_score=result["potential_score"],
        details=result["details"]
    )
    db.add(db_score)
    db.commit()
    db.refresh(db_score)
    
    # Broadcast updates if needed
    return {
        "score_id": db_score.id,
        "total_score": db_score.total_score,
        "potential_score": db_score.potential_score,
        "details": db_score.details,
        "created_at": db_score.created_at
    }

# --- LEADERBOARD & GUIDANCE ENDPOINTS ---

@app.get("/leaderboard", response_model=List[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db)):
    return LeaderboardManager.get_top_scores(db)

@app.get("/guidance/{score_id}")
def get_guidance(score_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    score = db.query(Score).filter(Score.id == score_id).first()
    if not score:
        raise HTTPException(status_code=404, detail="Score record not found")
        
    if score.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized access to this score record")
        
    # Generate roadmap
    roadmap = GuidanceGenerator.generate_roadmap(score.details, current_user.gender)
    return {
        "score_id": score.id,
        "total_score": score.total_score,
        "potential_score": score.potential_score,
        "details": score.details,
        "guidance": roadmap
    }

# --- REAL-TIME 30-SECOND SCANNING WEBSOCKET ---

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_json(self, data: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(data))

ws_manager = ConnectionManager()

@app.websocket("/ws/scan")
async def websocket_scan(websocket: WebSocket, token: Optional[str] = None, db: Session = Depends(get_db)):
    """
    WebSocket endpoint for 30s facial scanning.
    Expects frames to be sent and returns real-time progress, terminating with final aggregate analysis.
    """
    await ws_manager.connect(websocket)
    
    # Authenticate user from query param token
    user = None
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username = payload.get("sub")
            user = db.query(User).filter(User.username == username).first()
        except Exception:
            pass
            
    if not user:
        await ws_manager.send_json({"type": "error", "message": "Authentication failed"}, websocket)
        ws_manager.disconnect(websocket)
        await websocket.close()
        return

    logger.info(f"User {user.username} connected to scan WebSocket.")
    
    frame_scores = []
    scan_steps = [
        {"progress": 10, "message": "Analyzing facial alignment... Please look straight."},
        {"progress": 25, "message": "Measuring bilateral symmetry ratios..."},
        {"progress": 40, "message": "Scanning jawline angles... Tilt head slightly left."},
        {"progress": 55, "message": "Evaluating facial proportions... Tilt head slightly right."},
        {"progress": 70, "message": "Analyzing eyes, lips and nose contour..."},
        {"progress": 85, "message": "Calculating skin harmony and potential score..."},
        {"progress": 95, "message": "Compiling final 4-week personalized roadmap..."}
    ]
    
    step_idx = 0
    
    try:
        while True:
            # Wait for frame (either binary jpeg or json text containing base64)
            data = await websocket.receive()
            
            # Check for binary image or text
            img_bytes = None
            if "bytes" in data:
                img_bytes = data["bytes"]
            elif "text" in data:
                # Text could be a command (e.g. cancel) or base64 image json
                try:
                    payload = json.loads(data["text"])
                    if payload.get("type") == "cancel":
                        break
                    # If base64 data
                    if "image" in payload:
                        import base64
                        base64_data = payload["image"]
                        if "," in base64_data:
                            base64_data = base64_data.split(",")[1]
                        img_bytes = base64.b64decode(base64_data)
                except Exception as e:
                    logger.error(f"Error reading socket text data: {e}")
            
            if img_bytes:
                # Run face analysis
                result = analyzer.analyze_image(img_bytes, user.gender)
                frame_scores.append(result)
                
                # Send feedback progress
                if step_idx < len(scan_steps):
                    step = scan_steps[step_idx]
                    await ws_manager.send_json({
                        "type": "progress",
                        "progress": step["progress"],
                        "message": step["message"],
                        "current_score": result["total_score"]
                    }, websocket)
                    step_idx += 1
                else:
                    # Keep showing progress at 95% while frames finish
                    await ws_manager.send_json({
                        "type": "progress",
                        "progress": 95,
                        "message": "Finalizing analysis calculations...",
                        "current_score": result["total_score"]
                    }, websocket)
                
                # We limit the scan to about 10 frames or 30s on frontend
                if len(frame_scores) >= 12:
                    break
                    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {user.username}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await ws_manager.send_json({"type": "error", "message": str(e)}, websocket)
    finally:
        ws_manager.disconnect(websocket)
        
    # Aggregate results if frames were received
    if frame_scores:
        # Calculate average of details
        keys = ["Symmetry", "Golden_Ratio", "Eyes", "Lips", "Jawline", "Nose", "Harmony"]
        agg_details = {}
        for key in keys:
            vals = [f["details"][key] for f in frame_scores if "details" in f and key in f["details"]]
            agg_details[key] = round(sum(vals) / len(vals), 1) if vals else 70.0
            
        agg_total_score = round(sum(f["total_score"] for f in frame_scores) / len(frame_scores), 1)
        agg_potential_score = round(sum(f["potential_score"] for f in frame_scores) / len(frame_scores), 1)
        
        # Save to database
        db_score = Score(
            user_id=user.id,
            total_score=agg_total_score,
            potential_score=agg_potential_score,
            details=agg_details
        )
        db.add(db_score)
        db.commit()
        db.refresh(db_score)
        
        # Send final completed result
        try:
            await websocket.send_text(json.dumps({
                "type": "complete",
                "score_id": db_score.id,
                "total_score": db_score.total_score,
                "potential_score": db_score.potential_score,
                "details": db_score.details,
                "created_at": db_score.created_at.isoformat()
            }))
            await websocket.close()
        except Exception:
            pass
