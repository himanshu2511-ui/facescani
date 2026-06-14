from sqlalchemy import func
from sqlalchemy.orm import Session
from .models import User, Score

class LeaderboardManager:
    @staticmethod
    def get_top_scores(db: Session, limit: int = 50):
        """
        Retrieves the global leaderboard where each user is represented
        only by their single highest all-time total score.
        """
        # 1. Define subquery to find the maximum score for each user
        subq = (
            db.query(Score.user_id, func.max(Score.total_score).label("best_score"))
            .group_by(Score.user_id)
            .subquery()
        )

        # 2. Join the subquery with the User table to fetch usernames and genders
        # and the Score table to fetch the timestamp of that specific best score.
        rows = (
            db.query(User.username, User.gender, subq.c.best_score, Score.created_at)
            .join(subq, User.id == subq.c.user_id)
            .join(Score, (Score.user_id == subq.c.user_id) & (Score.total_score == subq.c.best_score))
            .order_by(subq.c.best_score.desc())
            .limit(limit)
            .all()
        )
        
        # Format results into serialized dicts
        leaderboard = []
        for row in rows:
            leaderboard.append({
                "username": row.username,
                "gender": row.gender,
                "best_score": round(row.best_score, 1),
                "created_at": row.created_at.isoformat() if row.created_at else None
            })
            
        return leaderboard
