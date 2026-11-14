"""Support-ticket schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TicketCategory = Literal["technical", "account", "data", "billing", "feature", "other"]
TicketPriority = Literal["low", "normal", "high", "urgent"]
TicketStatus = Literal["open", "in_progress", "waiting_user", "resolved", "closed"]


class TicketUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    full_name: str | None = None
    avatar_url: str | None = None


class TicketMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    is_staff: bool
    internal: bool = False
    attachment_url: str | None = None
    attachment_name: str | None = None
    created_at: datetime
    author: TicketUser | None = None


class TicketSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    reference: str
    subject: str
    category: str
    priority: str
    status: str
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None = None
    user: TicketUser
    assignee: TicketUser | None = None
    message_count: int = 0
    # True when the last public message is from staff and the requester hasn't
    # answered yet (requester view) — or vice-versa (staff view).
    awaiting_me: bool = False


class TicketDetail(TicketSummary):
    page_url: str | None = None
    user_agent: str | None = None
    messages: list[TicketMessageRead] = []


class TicketUpdate(BaseModel):
    """Staff-side triage fields."""

    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    assignee_id: int | None = Field(default=None)
    unassign: bool = False


class TicketStats(BaseModel):
    open: int = 0
    in_progress: int = 0
    waiting_user: int = 0
    resolved: int = 0
    closed: int = 0
    urgent_open: int = 0
