"""Security, authentication, and authorization services."""
from datetime import UTC, datetime, timedelta

import argon2
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User

settings = get_settings()
ph = argon2.PasswordHasher()
bearer_scheme = HTTPBearer(auto_error=False)

RESERVED_CLAIMS = {"sub", "exp", "iat", "role"}
ROLES = ["viewer", "engineer", "incident_commander", "admin"]


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(hashed: str, plain: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except Exception:
        return False


def make_token(sub: str, role: str, extra: dict | None = None, ttl_minutes: int | None = None) -> str:
    now = datetime.now(UTC)
    ttl = ttl_minutes or settings.incidentiq_jwt_ttl_minutes
    secret = settings.get_jwt_secret()

    safe_extra = {k: v for k, v in (extra or {}).items() if k not in RESERVED_CLAIMS}
    claims = {
        **safe_extra,
        "sub": sub,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=ttl),
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    secret = settings.get_jwt_secret()
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "iat", "role"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or expired token",
        )


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> dict:
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing token",
        )

    claims = decode_token(cred.credentials)
    username = claims.get("sub")

    # Fetch user strictly from DB to enforce current active status and authoritative role
    user_record = db.query(User).filter_by(username=username).first()
    if not user_record or not user_record.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="inactive user",
        )

    # Return server-side authoritative role, NEVER trust claims["role"]
    return {
        "id": user_record.id,
        "sub": user_record.username,
        "username": user_record.username,
        "role": user_record.role,
        "active": user_record.active,
    }


def require_role(*roles: str):
    def dependency(user_dict: dict = Depends(get_current_user)) -> dict:
        if user_dict["role"] not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="insufficient role",
            )
        return user_dict

    return dependency
