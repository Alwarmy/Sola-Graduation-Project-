from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from app.core.domain_values import (
    ASSISTANT_ACTION_STATUS_VALUES,
    ASSISTANT_ACTION_TYPE_VALUES,
    sql_string_list,
)
from app.db.base import Base


class AssistantActionRun(Base):
    __tablename__ = "assistant_action_runs"
    __table_args__ = (
        CheckConstraint(
            f"status IN {sql_string_list(ASSISTANT_ACTION_STATUS_VALUES)}",
            name="ck_assistant_action_runs_status",
        ),
        CheckConstraint(
            f"action_type IN {sql_string_list(ASSISTANT_ACTION_TYPE_VALUES)}",
            name="ck_assistant_action_runs_action_type",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(Integer, ForeignKey("assistant_conversations.id"), nullable=False, index=True)
    source_message_id = Column(Integer, ForeignKey("assistant_messages.id"), nullable=True, index=True)

    action_type = Column(String, nullable=False, index=True)
    status = Column(String, nullable=False, default="proposed", index=True)

    request_payload = Column(JSONB, nullable=False, default=dict)
    preview_payload = Column(JSONB, nullable=False, default=dict)
    result_payload = Column(JSONB, nullable=False, default=dict)
    failure_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
