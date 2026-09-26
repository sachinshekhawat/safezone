"""Train the zone risk predictor and write the artifact RiskPredictor loads.

The artifact path must match ``RiskPredictor._try_load_model``:
``app/models/artifacts/risk_predictor.joblib``.

Usage:
    # Bootstrap from synthetic data (no database needed)
    python -m app.training.train_risk_predictor --synthetic 4000

    # Train on real rows from PostgreSQL
    python -m app.training.train_risk_predictor --source db

Prefers XGBoost and falls back to scikit-learn's HistGradientBoostingRegressor
so training still works in slim environments.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

import joblib
import numpy as np

from app.data.loaders import (
    FEATURE_NAMES,
    build_xy,
    fetch_training_rows,
    generate_synthetic_dataset,
)

DEFAULT_ARTIFACT = os.path.join("app", "models", "artifacts", "risk_predictor.joblib")
DEFAULT_METADATA = os.path.join("app", "models", "artifacts", "risk_predictor.meta.json")


def _build_model(n_samples: int):
    """Return an untrained regressor and its name."""
    try:
        from xgboost import XGBRegressor

        return (
            XGBRegressor(
                n_estimators=400,
                learning_rate=0.05,
                max_depth=5,
                subsample=0.9,
                colsample_bytree=0.9,
                reg_lambda=1.0,
                random_state=42,
                n_jobs=-1,
                objective="reg:squarederror",
            ),
            "xgboost.XGBRegressor",
        )
    except ImportError:
        from sklearn.ensemble import HistGradientBoostingRegressor

        print("⚠️  xgboost unavailable — falling back to HistGradientBoostingRegressor")
        return (
            HistGradientBoostingRegressor(
                max_iter=400,
                learning_rate=0.05,
                max_depth=5,
                random_state=42,
            ),
            "sklearn.HistGradientBoostingRegressor",
        )


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Compute regression metrics without requiring a specific sklearn version."""
    errors = y_pred - y_true
    mae = float(np.mean(np.abs(errors)))
    rmse = float(np.sqrt(np.mean(errors**2)))
    variance = float(np.var(y_true))
    r2 = float(1.0 - (np.mean(errors**2) / variance)) if variance > 0 else 0.0
    return {"mae": round(mae, 4), "rmse": round(rmse, 4), "r2": round(r2, 4)}


async def _load_db_rows() -> list[dict[str, Any]]:
    from app.database import close_db, get_pool, init_db

    await init_db()
    try:
        pool = await get_pool()
        return await fetch_training_rows(pool)
    finally:
        await close_db()


def train(
    source: str = "synthetic",
    n_synthetic: int = 4000,
    artifact_path: str = DEFAULT_ARTIFACT,
    metadata_path: str = DEFAULT_METADATA,
    test_fraction: float = 0.2,
    seed: int = 42,
) -> dict[str, Any]:
    """Train the risk predictor and persist the artifact.

    Returns a metadata dict describing the run.
    """
    if source == "db":
        rows = asyncio.run(_load_db_rows())
        if len(rows) < 50:
            raise SystemExit(
                f"❌ Only {len(rows)} training rows available from the database. "
                "Ingest more data or run with --synthetic to bootstrap."
            )
        print(f"📥 Loaded {len(rows)} rows from PostgreSQL")
    else:
        rows = generate_synthetic_dataset(n_samples=n_synthetic, seed=seed)
        print(f"🧪 Generated {len(rows)} SYNTHETIC rows (bootstrap only — not real data)")

    x_list, y_list = build_xy(rows)
    x = np.asarray(x_list, dtype=float)
    y = np.asarray(y_list, dtype=float)

    if x.shape[1] != len(FEATURE_NAMES):
        raise SystemExit(
            f"❌ Feature count mismatch: built {x.shape[1]} columns "
            f"but RiskPredictor expects {len(FEATURE_NAMES)}"
        )

    # Deterministic shuffle + split.
    rng = np.random.default_rng(seed)
    order = rng.permutation(len(x))
    x, y = x[order], y[order]
    split = max(1, int(len(x) * (1 - test_fraction)))
    x_train, x_test = x[:split], x[split:]
    y_train, y_test = y[:split], y[split:]

    model, model_name = _build_model(len(x_train))
    print(f"🏋️  Training {model_name} on {len(x_train)} rows ({len(x_test)} held out)")
    model.fit(x_train, y_train)

    train_metrics = _metrics(y_train, np.asarray(model.predict(x_train), dtype=float))
    test_metrics = _metrics(y_test, np.asarray(model.predict(x_test), dtype=float)) if len(x_test) else {}

    print(f"📊 train: {train_metrics}")
    if test_metrics:
        print(f"📊 test:  {test_metrics}")

    os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
    joblib.dump(model, artifact_path)
    print(f"💾 Saved model to {artifact_path}")

    metadata = {
        "model": model_name,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "n_rows": len(rows),
        "n_train": int(len(x_train)),
        "n_test": int(len(x_test)),
        "feature_names": FEATURE_NAMES,
        "train_metrics": train_metrics,
        "test_metrics": test_metrics,
        "synthetic": source != "db",
    }
    with open(metadata_path, "w", encoding="utf-8") as fh:
        json.dump(metadata, fh, indent=2)
    print(f"📝 Saved metadata to {metadata_path}")

    if source != "db":
        print(
            "⚠️  This artifact was trained on SYNTHETIC data. Retrain with "
            "--source db before relying on its predictions."
        )

    return metadata


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Train the SafeZone risk predictor")
    parser.add_argument(
        "--source",
        choices=("synthetic", "db"),
        default="synthetic",
        help="Where to read training rows from (default: synthetic)",
    )
    parser.add_argument(
        "--synthetic",
        type=int,
        default=4000,
        dest="n_synthetic",
        help="Number of synthetic rows when --source synthetic (default: 4000)",
    )
    parser.add_argument("--out", default=DEFAULT_ARTIFACT, help="Artifact output path")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args(argv)

    train(
        source=args.source,
        n_synthetic=args.n_synthetic,
        artifact_path=args.out,
        seed=args.seed,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
