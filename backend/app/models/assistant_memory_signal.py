from sqlalchemy import CheckConstraint, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.domain_values import (
    ASSISTANT_MEMORY_SCOPE_VALUES,
    ASSISTANT_MEMORY_STATUS_VALUES,
    sql_string_list,
)
from app.db.base import Base


class AssistantMemorySignal(Base):
    __tablename__ = "assistant_memory_signals"
    __table_args__ = (
        CheckConstraint(
            f"scope IN {sql_string_list(ASSISTANT_MEMORY_SCOPE_VALUES)}",
            name="ck_assistant_memory_signals_scope",
        ),
        CheckConstraint(
            f"status IN {sql_string_list(ASSISTANT_MEMORY_STATUS_VALUES)}",
            name="ck_assistant_memory_signals_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("assistant_conversations.id"), nullable=True, index=True)
    source_message_id = Column(Integer, ForeignKey("assistant_messages.id"), nullable=True, index=True)

    signal_type = Column(String, nullable=False, index=True)
    signal_key = Column(String, nullable=False, index=True)
    signal_summary = Column(String, nullable=False)
    signal_value = Column(JSONB, nullable=False, default=dict)
    signal_metadata = Column(JSONB, nullable=False, default=dict)

    scope = Column(String, nullable=False, index=True)
    confidence_score = Column(Float, nullable=False, default=0.0)
    status = Column(String, nullable=False, default="proposed", index=True)

    effective_from = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
