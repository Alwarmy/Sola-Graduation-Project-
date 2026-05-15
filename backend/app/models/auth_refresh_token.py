from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class AuthRefreshToken(Base):
    __tablename__ = "auth_refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(String(64), nullable=False, unique=True, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    parent_token_id = Column(Integer, ForeignKey("auth_refresh_tokens.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    token_hash = Column(String(128), nullable=False, unique=True)

    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    rotated_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True, index=True)
    revocation_reason = Column(Text, nullable=True)

    created_ip = Column(String(255), nullable=True)
    created_user_agent = Column(String(512), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user = relationship("User")
    parent = relationship("AuthRefreshToken", remote_side=[id])
