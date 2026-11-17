from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from api.deps import CurrentUser, DbSession
from api.models import Agent
from api.permissions import Perm
from api.schemas.agent import AgentCreate, AgentRead, AgentUpdate
from api.permissions import PermAny

ReadAgents = PermAny("agents.view", "contracts.view", "management_contracts.view", "payments.view")

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentRead])
def list_agents(db: DbSession, _user: ReadAgents):
    return db.scalars(select(Agent).order_by(Agent.name)).all()


@router.get("/{agent_id}", response_model=AgentRead)
def get_agent(agent_id: int, db: DbSession, _user: ReadAgents):
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return agent


@router.post("", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, db: DbSession, _user: Perm("agents", "create")):
    agent = Agent(**payload.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.put("/{agent_id}", response_model=AgentRead)
def update_agent(
    agent_id: int,
    payload: AgentUpdate,
    db: DbSession,
    _user: Perm("agents", "edit"),
):
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    for field, value in payload.model_dump().items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(agent_id: int, db: DbSession, _user: Perm("agents", "delete")):
    agent = db.get(Agent, agent_id)
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    db.delete(agent)
    db.commit()
