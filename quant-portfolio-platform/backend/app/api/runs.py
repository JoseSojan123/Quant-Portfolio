"""Saved optimization runs and saved scenarios (all scoped to the signed-in user)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.models import OptimizationRun, SavedScenario, StressResult, User
from app.db.session import get_db
from app.schemas.analytics import ScenarioCreate
from app.services import analytics as A

router = APIRouter(tags=["saved"])


def _run_summary(r: OptimizationRun) -> dict:
    opt = (r.result or {}).get("optimized", {})
    m = opt.get("metrics", {})
    return {"run_id": r.run_id, "name": r.name, "objective": r.objective,
            "objective_label": A.OBJECTIVE_LABELS.get(r.objective, r.objective), "portfolio_id": r.portfolio_id,
            "capital": r.capital, "created_at": r.created_at.isoformat(),
            "expected_return": m.get("expected_return"), "volatility": m.get("volatility"), "sharpe": m.get("sharpe"),
            "weights": opt.get("weights", {})}


@router.get("/runs")
def list_runs(portfolio_id: str | None = Query(default=None), limit: int = Query(default=20, ge=1, le=100),
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(OptimizationRun).where(OptimizationRun.user_id == user.id)
    if portfolio_id:
        q = q.where(OptimizationRun.portfolio_id == portfolio_id)
    return [_run_summary(r) for r in db.scalars(q.order_by(OptimizationRun.created_at.desc()).limit(limit))]


@router.get("/runs/{run_id}")
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = A.get_owned_run(db, user, run_id)
    return {**_run_summary(r), "request": r.request, "result": r.result}


@router.delete("/runs/{run_id}", status_code=204)
def delete_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(A.get_owned_run(db, user, run_id))
    db.commit()
    return Response(status_code=204)


@router.get("/scenarios")
def list_saved_scenarios(portfolio_id: str | None = Query(default=None), user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    q = select(SavedScenario).where(SavedScenario.user_id == user.id)
    if portfolio_id:
        q = q.where(SavedScenario.portfolio_id == portfolio_id)
    return [{"id": s.id, "name": s.name, "kind": s.kind, "portfolio_id": s.portfolio_id, "config": s.config,
             "summary": s.summary, "created_at": s.created_at.isoformat()}
            for s in db.scalars(q.order_by(SavedScenario.created_at.desc()).limit(100))]


@router.post("/scenarios", status_code=201)
def create_scenario(body: ScenarioCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.portfolio_id:
        A.get_owned_portfolio(db, user, body.portfolio_id)
    s = SavedScenario(user_id=user.id, portfolio_id=body.portfolio_id, name=body.name, kind=body.kind,
                      config=A.sanitize(body.config), summary=A.sanitize(body.summary))
    db.add(s)
    db.commit()
    return {"id": s.id, "name": s.name, "kind": s.kind, "created_at": s.created_at.isoformat()}


@router.delete("/scenarios/{scenario_id}", status_code=204)
def delete_scenario(scenario_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.get(SavedScenario, scenario_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scenario not found")
    db.delete(s)
    db.commit()
    return Response(status_code=204)


@router.get("/stress-history")
def stress_history(portfolio_id: str | None = Query(default=None), user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    q = select(StressResult).where(StressResult.user_id == user.id)
    if portfolio_id:
        q = q.where(StressResult.portfolio_id == portfolio_id)
    return [{"id": s.id, "scenario": s.scenario, "pnl": s.pnl, "loss_pct": s.loss_pct,
             "created_at": s.created_at.isoformat()}
            for s in db.scalars(q.order_by(StressResult.created_at.desc()).limit(100))]
