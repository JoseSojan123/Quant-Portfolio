from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.auth import clear_session, user_out
from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.auth import Preferences, ProfileUpdate, UserOut
from app.services.analytics import DEFAULT_PREFERENCES

router = APIRouter(prefix="/me", tags=["account"])


@router.patch("", response_model=UserOut)
def update_profile(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    db.commit()
    return user_out(user)


@router.get("/preferences", response_model=Preferences)
def get_preferences(user: User = Depends(get_current_user)):
    return Preferences(**{**DEFAULT_PREFERENCES, **(user.preferences or {})})


@router.put("/preferences", response_model=Preferences)
def put_preferences(body: Preferences, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.preferences = body.model_dump()
    db.commit()
    return body


@router.delete("", status_code=204)
def delete_account(response: Response, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(user)
    db.commit()
    clear_session(response)
    response.status_code = 204
    return response
