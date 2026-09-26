"""Incremental risk learner — relearns on every data upload.

## The problem this solves

The existing risk predictor is a batch XGBoost model: to absorb new data you
retrain from scratch over the whole history. That is fine monthly and useless if
the goal is "the model improves every time a district uploads a file", because
each upload would mean a full retrain, a growing cost, and no way to tell whether
the new model is better than the one it replaced.

## Approach

`SGDRegressor.partial_fit` — stochastic gradient descent that takes one batch at
a time and keeps its learned weights between calls. Each upload is one or more
gradient steps, cost proportional to the *batch*, not to history.

Three things make that safe rather than merely fast:

1. **Frozen feature contract.** SGD weights are positional. If the feature order
   ever changed between updates, the model would keep training happily while
   silently attributing "streetlights" to "unemployment". `FEATURE_NAMES` is the
   contract and it is stored alongside every version; a mismatch refuses to load.

2. **Scaling that does not drift.** Gradient descent needs comparable feature
   scales, but a scaler refitted per batch would shift the input distribution on
   every upload and corrupt weights learned under the old scaling. Bounds are
   therefore fixed and declared, not fitted.

3. **A promotion gate.** Online learning can be made worse by one bad batch — a
   mis-parsed file, a district with unusual reporting. Every update is evaluated
   on a held-out set before it replaces the live model; a regression is recorded
   and rejected, not shipped. This is the difference between a model that learns
   and a model that merely changes.

Drift is reported rather than acted on automatically: a genuine change in the
world and a broken upload look identical to a drift statistic, and silently
discarding real change would be as bad as absorbing corruption.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional, Sequence

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Feature contract
# ---------------------------------------------------------------------------

# Order is load-bearing. Appending is safe; reordering or removing is not, and
# either must come with a new model_name so old artifacts are never fed new
# columns. Stored in ml_model_versions.feature_names for exactly this check.
FEATURE_NAMES: tuple[str, ...] = (
    "incident_frequency_score",
    "recency_score",
    "demographic_risk_score",
    "infrastructure_score",
    "trend_score",
    "population_density_per_sqkm",
    "female_literacy_rate_percent",
    "unemployment_rate",
    "below_poverty_line_percent",
    "police_per_1000",
    "streetlights_per_km",
    "cctv_count",
    "public_transport_routes",
    "female_population_share",
    "zone_type_commercial",
    "zone_type_residential",
    "zone_type_industrial",
    "zone_type_rural",
    "zone_type_mixed",
    "zone_type_institutional",
)

# Declared bounds used to scale each feature to roughly 0..1.
#
# Fixed rather than fitted, so that a batch of unusual data cannot redefine what
# "normal" means for every weight learned before it. Values outside a bound are
# clipped, which is the conservative choice: an outlier should not dominate a
# gradient step.
FEATURE_BOUNDS: dict[str, tuple[float, float]] = {
    "incident_frequency_score": (0.0, 100.0),
    "recency_score": (0.0, 100.0),
    "demographic_risk_score": (0.0, 100.0),
    "infrastructure_score": (0.0, 100.0),
    "trend_score": (0.0, 100.0),
    "population_density_per_sqkm": (0.0, 60000.0),
    "female_literacy_rate_percent": (0.0, 100.0),
    "unemployment_rate": (0.0, 40.0),
    "below_poverty_line_percent": (0.0, 60.0),
    "police_per_1000": (0.0, 5.0),
    "streetlights_per_km": (0.0, 120.0),
    "cctv_count": (0.0, 2000.0),
    "public_transport_routes": (0.0, 200.0),
    "female_population_share": (0.0, 1.0),
    "zone_type_commercial": (0.0, 1.0),
    "zone_type_residential": (0.0, 1.0),
    "zone_type_industrial": (0.0, 1.0),
    "zone_type_rural": (0.0, 1.0),
    "zone_type_mixed": (0.0, 1.0),
    "zone_type_institutional": (0.0, 1.0),
}

ZONE_TYPES = ("commercial", "residential", "industrial", "rural", "mixed", "institutional")

MODEL_NAME = "incremental_risk_sgd"

# Minimum rows in a batch before it is worth a gradient step. Below this the
# update is mostly noise and the promotion gate would reject it anyway.
MIN_BATCH_ROWS = 20

# A new version must not be worse than the live one by more than this margin on
# MAE. A small tolerance is allowed because held-out MAE is itself noisy; zero
# tolerance would reject healthy updates at random.
MAE_REGRESSION_TOLERANCE = 0.75

# Size of the trusted reference set the gate evaluates against.
#
# This exists because the obvious design is wrong: evaluating a candidate on a
# holdout taken from the batch being learned lets a corrupted upload set its own
# pass mark. Both the old and new model score badly on scrambled data, the
# comparison looks level, and the bad batch is promoted. The reference set is
# sampled from *previously accepted* batches instead, so a candidate has to stay
# good on data already believed to be sound.
REFERENCE_CAPACITY = 600

# Below this the reference set is too small to gate on, so early updates fall back
# to the batch holdout. The first batch has nothing to compare against either way.
MIN_REFERENCE_ROWS = 60


def _clip_scale(name: str, value: Optional[float]) -> float:
    """Scale one feature to 0..1 against its declared bounds."""
    lo, hi = FEATURE_BOUNDS[name]
    if value is None or (isinstance(value, float) and math.isnan(value)):
        # Midpoint, not zero: zero is a meaningful low value for most of these
        # features, and imputing it would teach the model that missing data means
        # "none of this thing".
        return 0.5
    v = max(lo, min(hi, float(value)))
    span = hi - lo
    return (v - lo) / span if span else 0.0


def featurise(row: dict[str, Any]) -> list[float]:
    """Turn one zone-month record into the fixed feature vector."""
    zone_type = (row.get("zone_type") or "mixed").lower()
    # An unrecognised zone type must still produce a valid one-hot, otherwise the
    # whole block is zeros and the model reads it as "none of the above" — a state
    # that never occurs in training data.
    if zone_type not in ZONE_TYPES:
        zone_type = "mixed"

    total_pop = row.get("total_population")
    female_pop = row.get("female_population")
    share = None
    if total_pop and female_pop is not None and float(total_pop) > 0:
        share = float(female_pop) / float(total_pop)

    values: dict[str, Any] = {
        "female_population_share": share,
        **{f"zone_type_{t}": 1.0 if zone_type == t else 0.0 for t in ZONE_TYPES},
    }

    out: list[float] = []
    for name in FEATURE_NAMES:
        if name in values:
            out.append(_clip_scale(name, values[name]))
        else:
            out.append(_clip_scale(name, row.get(name)))
    return out


@dataclass
class UpdateMetrics:
    mae: float
    rmse: float
    r2: float

    def to_dict(self) -> dict[str, float]:
        return {"mae": round(self.mae, 4), "rmse": round(self.rmse, 4), "r2": round(self.r2, 4)}


@dataclass
class UpdateResult:
    """Outcome of feeding one batch to the learner."""

    version: int
    samples_in_batch: int
    samples_total: int
    promoted: bool
    rejected_reason: Optional[str] = None
    metrics: Optional[UpdateMetrics] = None
    previous_metrics: Optional[UpdateMetrics] = None
    drift: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["metrics"] = self.metrics.to_dict() if self.metrics else None
        d["previous_metrics"] = self.previous_metrics.to_dict() if self.previous_metrics else None
        return d


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> UpdateMetrics:
    err = y_pred - y_true
    mae = float(np.mean(np.abs(err)))
    rmse = float(math.sqrt(float(np.mean(err**2))))
    ss_res = float(np.sum(err**2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    # A constant target makes R2 undefined; report 0 rather than dividing by zero.
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 1e-9 else 0.0
    return UpdateMetrics(mae=mae, rmse=rmse, r2=float(r2))


class IncrementalRiskLearner:
    """An SGD risk model that absorbs one upload at a time.

    Not thread-safe by design. Updates are serialised through the upload queue
    (``data_uploads`` with a NULL trained_model_version_id), because two batches
    applying gradient steps concurrently would interleave weight updates and make
    the result unreproducible.
    """

    def __init__(self, artifact_dir: Optional[Path] = None):
        self.artifact_dir = artifact_dir or Path(__file__).resolve().parent / "artifacts"
        self.model: Any = None
        self.version = 0
        self.samples_total = 0
        self.feature_names: tuple[str, ...] = FEATURE_NAMES
        self.last_metrics: Optional[UpdateMetrics] = None
        # Running mean of each scaled feature, kept to report drift.
        self._feature_mean: Optional[np.ndarray] = None
        # Trusted evaluation set, sampled from previously accepted batches.
        self._ref_X: Optional[np.ndarray] = None
        self._ref_y: Optional[np.ndarray] = None

    # ---------------------------------------------------------------- lifecycle

    def _new_model(self) -> Any:
        from sklearn.linear_model import SGDRegressor

        return SGDRegressor(
            loss="squared_error",
            penalty="l2",
            alpha=1e-4,
            # 'optimal' would decay the learning rate by total step count, which
            # for a long-lived online model eventually freezes learning. A
            # constant rate keeps later uploads as influential as early ones.
            learning_rate="constant",
            eta0=0.01,
            max_iter=1,
            warm_start=True,
            random_state=42,
        )

    @property
    def is_fitted(self) -> bool:
        return self.model is not None and hasattr(self.model, "coef_")

    # ---------------------------------------------------------------- updating

    def update(
        self,
        rows: Sequence[dict[str, Any]],
        target_key: str = "overall_score",
        holdout_fraction: float = 0.25,
        epochs: int = 4,
    ) -> UpdateResult:
        """Absorb one batch.

        Splits the batch, applies gradient steps on the training part, then scores
        the held-out part. The candidate weights are only kept if they do not
        regress the live model's held-out error.

        Args:
            rows: zone-month records, each carrying the features and the target.
            target_key: key holding the ground-truth score.
            holdout_fraction: share reserved for evaluation.
            epochs: passes over this batch. A handful, because one pass over a
                small batch barely moves SGD, and many would overfit to it.
        """
        usable = [r for r in rows if r.get(target_key) is not None]
        if len(usable) < MIN_BATCH_ROWS:
            return UpdateResult(
                version=self.version,
                samples_in_batch=len(usable),
                samples_total=self.samples_total,
                promoted=False,
                rejected_reason=(
                    f"batch has {len(usable)} usable rows, below the {MIN_BATCH_ROWS} "
                    "needed for a meaningful update"
                ),
            )

        X = np.asarray([featurise(r) for r in usable], dtype=float)
        y = np.asarray([float(r[target_key]) for r in usable], dtype=float)

        rng = np.random.default_rng(42)
        idx = rng.permutation(len(usable))
        n_hold = max(5, int(len(usable) * holdout_fraction))
        hold_idx, train_idx = idx[:n_hold], idx[n_hold:]
        if len(train_idx) == 0:
            return UpdateResult(
                version=self.version,
                samples_in_batch=len(usable),
                samples_total=self.samples_total,
                promoted=False,
                rejected_reason="batch too small to split into train and holdout",
            )

        drift = self._drift(X)

        import copy

        candidate = copy.deepcopy(self.model) if self.is_fitted else self._new_model()
        for _ in range(max(1, epochs)):
            candidate.partial_fit(X[train_idx], y[train_idx])

        if not np.all(np.isfinite(candidate.coef_)):
            # Diverged. Keeping these weights would poison every later update.
            return UpdateResult(
                version=self.version,
                samples_in_batch=len(usable),
                samples_total=self.samples_total,
                promoted=False,
                rejected_reason="update diverged to non-finite weights",
                metrics=None,
                previous_metrics=None,
                drift=drift,
            )

        # Gate on the trusted reference set where one exists, because a holdout
        # carved out of this batch would let a corrupted upload grade its own work.
        use_reference = (
            self.is_fitted
            and self._ref_X is not None
            and len(self._ref_X) >= MIN_REFERENCE_ROWS
        )

        if use_reference:
            eval_X, eval_y = self._ref_X, self._ref_y
            gate_basis = "reference"
        else:
            eval_X, eval_y = X[hold_idx], y[hold_idx]
            gate_basis = "batch holdout"

        metrics = _metrics(eval_y, candidate.predict(eval_X))
        previous = _metrics(eval_y, self.model.predict(eval_X)) if self.is_fitted else None

        if previous is not None and metrics.mae > previous.mae + MAE_REGRESSION_TOLERANCE:
            return UpdateResult(
                version=self.version,
                samples_in_batch=len(usable),
                samples_total=self.samples_total,
                promoted=False,
                rejected_reason=(
                    f"held-out MAE worsened from {previous.mae:.3f} to {metrics.mae:.3f} "
                    f"on the {gate_basis}, beyond the {MAE_REGRESSION_TOLERANCE} tolerance"
                ),
                metrics=metrics,
                previous_metrics=previous,
                drift=drift,
            )

        # Accepted.
        self.model = candidate
        self.version += 1
        self.samples_total += len(train_idx)
        self.last_metrics = metrics
        self._track(X)
        # Only accepted data earns a place in the reference set.
        self._absorb_reference(X[hold_idx], y[hold_idx])

        return UpdateResult(
            version=self.version,
            samples_in_batch=len(usable),
            samples_total=self.samples_total,
            promoted=True,
            metrics=metrics,
            previous_metrics=previous,
            drift=drift,
        )

    # ---------------------------------------------------------------- reference set

    def _absorb_reference(self, X: np.ndarray, y: np.ndarray) -> None:
        """Add accepted samples to the reference set, via reservoir sampling.

        Reservoir rather than a sliding window: a window would let the reference
        set be fully replaced by the last few uploads, at which point a slow
        degradation over several batches would go unnoticed because the yardstick
        moved with it. Reservoir sampling keeps a mix of old and recent accepted
        data at bounded size.
        """
        if self._ref_X is None:
            self._ref_X, self._ref_y = X.copy(), y.copy()
        else:
            self._ref_X = np.vstack([self._ref_X, X])
            self._ref_y = np.concatenate([self._ref_y, y])

        if len(self._ref_X) > REFERENCE_CAPACITY:
            rng = np.random.default_rng(self.version)
            keep = rng.choice(len(self._ref_X), size=REFERENCE_CAPACITY, replace=False)
            self._ref_X = self._ref_X[keep]
            self._ref_y = self._ref_y[keep]

    # ---------------------------------------------------------------- predicting

    def predict(self, rows: Sequence[dict[str, Any]]) -> list[float]:
        """Predict scores, clamped to the 0-100 scale the rest of the app uses."""
        if not self.is_fitted:
            raise RuntimeError("model has not been updated with any data yet")
        X = np.asarray([featurise(r) for r in rows], dtype=float)
        return [float(min(100.0, max(0.0, p))) for p in self.model.predict(X)]

    # ---------------------------------------------------------------- drift

    def _track(self, X: np.ndarray) -> None:
        mean = X.mean(axis=0)
        if self._feature_mean is None:
            self._feature_mean = mean
        else:
            # Exponential moving average: recent batches matter more, but one
            # batch cannot redefine the baseline.
            self._feature_mean = 0.8 * self._feature_mean + 0.2 * mean

    def _drift(self, X: np.ndarray) -> Optional[float]:
        """Mean absolute shift in scaled feature means versus the running baseline.

        Reported, never acted on. A real change in a city and a mis-parsed upload
        produce the same signal, and automatically rejecting either would be wrong.
        """
        if self._feature_mean is None:
            return None
        return float(np.mean(np.abs(X.mean(axis=0) - self._feature_mean)))

    # ---------------------------------------------------------------- persistence

    def save(self) -> Path:
        import joblib

        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        path = self.artifact_dir / f"{MODEL_NAME}_v{self.version}.joblib"
        joblib.dump(
            {
                "model": self.model,
                "version": self.version,
                "samples_total": self.samples_total,
                # Stored so a load can refuse a mismatched contract rather than
                # silently mapping weights onto the wrong columns.
                "feature_names": list(self.feature_names),
                "feature_mean": self._feature_mean,
                # Without the reference set a restarted process would gate the
                # next update against a holdout of that batch alone, which is the
                # weakness this design exists to remove.
                "reference_x": self._ref_X,
                "reference_y": self._ref_y,
                "metrics": self.last_metrics.to_dict() if self.last_metrics else None,
            },
            path,
        )
        (self.artifact_dir / f"{MODEL_NAME}_latest.json").write_text(
            json.dumps(
                {
                    "version": self.version,
                    "artifact": path.name,
                    "samples_total": self.samples_total,
                    "metrics": self.last_metrics.to_dict() if self.last_metrics else None,
                },
                indent=2,
            )
        )
        return path

    def load(self, path: Path) -> None:
        import joblib

        blob = joblib.load(path)
        stored = tuple(blob.get("feature_names") or ())
        if stored != FEATURE_NAMES:
            raise ValueError(
                "refusing to load: stored feature contract does not match the current "
                f"one ({len(stored)} vs {len(FEATURE_NAMES)} features). SGD weights are "
                "positional, so loading this would silently mis-assign every weight."
            )
        self.model = blob["model"]
        self.version = int(blob.get("version", 0))
        self.samples_total = int(blob.get("samples_total", 0))
        self._feature_mean = blob.get("feature_mean")
        self._ref_X = blob.get("reference_x")
        self._ref_y = blob.get("reference_y")
