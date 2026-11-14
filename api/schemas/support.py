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
    job_title: str | None = None


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
    # Service levels
    assigned_at: datetime | None = None
    first_response_at: datetime | None = None
    response_due_at: datetime | None = None
    resolve_due_at: datetime | None = None
    resolved_at: datetime | None = None
    # on_track | due_soon | breached | met (response) — computed
    sla_state: str = "on_track"
    rating: int | None = None
    # True when the last public message is from staff and the requester hasn't
    # answered yet (requester view) — or vice-versa (staff view).
    awaiting_me: bool = False


class TicketEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    from_value: str | None = None
    to_value: str | None = None
    public: bool = True
    created_at: datetime
    actor: TicketUser | None = None


class TicketDetail(TicketSummary):
    page_url: str | None = None
    user_agent: str | None = None
    resolution: str | None = None
    rating_comment: str | None = None
    rated_at: datetime | None = None
    # The viewer can triage this ticket (support staff, or its assignee).
    can_manage: bool = False
    messages: list[TicketMessageRead] = []
    events: list[TicketEventRead] = []


class TicketUpdate(BaseModel):
    """Staff-side triage fields."""

    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    category: TicketCategory | None = None
    assignee_id: int | None = Field(default=None)
    unassign: bool = False
    # Summary of the fix — shown to the requester and in the e-mail.
    resolution: str | None = Field(default=None, max_length=4000)


class TicketRating(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class TicketStats(BaseModel):
    open: int = 0
    in_progress: int = 0
    waiting_user: int = 0
    resolved: int = 0
    closed: int = 0
    urgent_open: int = 0
    unassigned: int = 0
    assigned_to_me: int = 0
    breached: int = 0
    avg_rating: float | None = None
