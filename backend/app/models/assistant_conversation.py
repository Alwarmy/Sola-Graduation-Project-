from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.domain_values import ASSISTANT_CONVERSATION_STATUS_VALUES, sql_string_list
from app.db.base import Base


class AssistantConversation(Base):
    __tablename__ = "assistant_conversations"
    __table_args__ = (
        CheckConstraint(
            f"status IN {sql_string_list(ASSISTANT_CONVERSATION_STATUS_VALUES)}",
            name="ck_assistant_conversations_status",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="active", index=True)
    conversation_metadata = Column(JSONB, nullable=False, default=dict)

    last_user_message_at = Column(DateTime(timezone=True), nullable=True, index=True)
    last_assistant_message_at = Column(DateTime(timezone=True), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    messages = relationship(
        "AssistantMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AssistantMessage.id.asc()",
    )
