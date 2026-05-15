from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.schemas.assistant import (
    AssistantActionRunResponse,
    AssistantConversationCreateRequest,
    AssistantConversationDetailResponse,
    AssistantConversationResponse,
    AssistantMemorySignalResponse,
    AssistantMessageCreateRequest,
    AssistantMessageExchangeResponse,
    AssistantMessageResponse,
)
from app.services.assistant_action_service import list_action_runs
from app.services.assistant_memory_service import list_memory_signals
from app.services.assistant_service import (
    confirm_assistant_action_run,
    confirm_assistant_memory_signal,
    create_conversation,
    get_conversation_detail,
    list_conversation_messages,
    list_conversations,
    send_message,
)

router = APIRouter(prefix="/assistant", tags=["Assistant"])


@router.post(
    "/conversations",
    response_model=AssistantConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_assistant_conversation(
    payload: AssistantConversationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    conversation = create_conversation(
        db=db,
        user_id=current_user.id,
        title=payload.title,
    )
    return conversation


@router.get(
    "/conversations",
    response_model=list[AssistantConversationResponse],
    status_code=status.HTTP_200_OK,
)
def read_assistant_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_conversations(db=db, user_id=current_user.id)


@router.get(
    "/conversations/{conversation_id}",
    response_model=AssistantConversationDetailResponse,
    status_code=status.HTTP_200_OK,
)
def read_assistant_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_conversation_detail(
        db=db,
        user_id=current_user.id,
        conversation_id=conversation_id,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[AssistantMessageResponse],
    status_code=status.HTTP_200_OK,
)
def read_assistant_conversation_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_conversation_messages(
        db=db,
        user_id=current_user.id,
        conversation_id=conversation_id,
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=AssistantMessageExchangeResponse,
    status_code=status.HTTP_200_OK,
)
def create_assistant_message(
    conversation_id: int,
    payload: AssistantMessageCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return send_message(
        db=db,
        user_id=current_user.id,
        conversation_id=conversation_id,
        content=payload.content,
    )


@router.get(
    "/memory-signals",
    response_model=list[AssistantMemorySignalResponse],
    status_code=status.HTTP_200_OK,
)
def read_assistant_memory_signals(
    status_filter: str | None = Query(default=None),
    effective_only: bool = Query(default=False),
    conversation_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_memory_signals(
        db=db,
        user_id=current_user.id,
        status_filter=status_filter,
        effective_only=effective_only,
        conversation_id=conversation_id,
    )


@router.post(
    "/memory-signals/{signal_id}/confirm",
    response_model=AssistantMemorySignalResponse,
    status_code=status.HTTP_200_OK,
)
def confirm_memory_signal_route(
    signal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return confirm_assistant_memory_signal(
        db=db,
        user_id=current_user.id,
        signal_id=signal_id,
    )


@router.get(
    "/action-runs",
    response_model=list[AssistantActionRunResponse],
    status_code=status.HTTP_200_OK,
)
def read_assistant_action_runs(
    conversation_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return list_action_runs(db=db, user_id=current_user.id, conversation_id=conversation_id)


@router.post(
    "/action-runs/{action_run_id}/confirm",
    response_model=AssistantActionRunResponse,
    status_code=status.HTTP_200_OK,
)
def confirm_action_run_route(
    action_run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return confirm_assistant_action_run(
        db=db,
        user_id=current_user.id,
        action_run_id=action_run_id,
    )
