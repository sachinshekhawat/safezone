"""Risk score prediction model using XGBoost / scikit-learn."""

import os
import numpy as np
import joblib
from app.models.schemas import RiskPredictionRequest, RiskPredictionResponse


class RiskPredictor:
    """Predicts safety risk scores for zones using gradient boosted trees.

    Features used:
        - incident_count_1m/3m/6m/12m: Historical incident frequency
        - population_density: People per sq km
        - literacy_rate / female_literacy_rate: Education indicators
        - unemployment_rate: Economic indicator
        - police_per_1000: Law enforcement density
        - streetlights_per_km: Infrastructure (lighting)
        - cctv_count: Surveillance infrastructure
        - public_transport_routes: Connectivity
        - active_safety_programs: Government interventions
        - zone_type: Encoded zone category
        - month: Seasonal factor
    """

    FEATURE_NAMES = [
        "incident_count_1m", "incident_count_3m", "incident_count_6m",
        "incident_count_12m", "population_density", "literacy_rate",
        "female_literacy_rate", "unemployment_rate", "police_per_1000",
        "streetlights_per_km", "cctv_count", "public_transport_routes",
        "active_safety_programs", "zone_type_encoded", "month",
    ]

    ZONE_TYPE_MAP = {
        "residential": 0, "commercial": 1, "industrial": 2,
        "rural": 3, "mixed": 4, "institutional": 5,
    }

    def __init__(self):
        self.model = None
        self.is_loaded = False
        self.version = "0.1.0"
        self._try_load_model()

    def _try_load_model(self):
        """Try to load a pre-trained model from disk."""
        model_path = os.path.join("app", "models", "artifacts", "risk_predictor.joblib")
        if os.path.exists(model_path):
            self.model = joblib.load(model_path)
            self.is_loaded = True

    def _extract_features(self, request: RiskPredictionRequest) -> np.ndarray:
        """Extract feature vector from request."""
        return np.array([[
            request.incident_count_1m,
            request.incident_count_3m,
            request.incident_count_6m,
            request.incident_count_12m,
            request.population_density,
            request.literacy_rate,
            request.female_literacy_rate,
            request.unemployment_rate,
            request.police_per_1000,
            request.streetlights_per_km,
            request.cctv_count,
            request.public_transport_routes,
            request.active_safety_programs,
            self.ZONE_TYPE_MAP.get(request.zone_type, 4),
            request.month,
        ]])

    def predict(self, request: RiskPredictionRequest) -> RiskPredictionResponse:
        """Predict risk score for a zone."""
        features = self._extract_features(request)

        if self.is_loaded and self.model is not None:
            # Use trained model
            score = float(self.model.predict(features)[0])
            score = max(0.0, min(100.0, score))
        else:
            # Heuristic fallback when model isn't trained yet
            score = self._heuristic_score(request)

        risk_level = self._score_to_level(score)
        factors = self._get_contributing_factors(request, score)
        recommendations = self._get_recommendations(risk_level, request)

        return RiskPredictionResponse(
            zone_id=request.zone_id,
            predicted_risk_score=round(score, 2),
            risk_level=risk_level,
            confidence=0.75 if self.is_loaded else 0.5,
            contributing_factors=factors,
            recommendations=recommendations,
        )

    def _heuristic_score(self, req: RiskPredictionRequest) -> float:
        """Calculate risk score using weighted heuristics (pre-ML fallback)."""
        score = 0.0

        # Incident frequency (40% weight)
        freq_score = min(100, (req.incident_count_1m * 20 + req.incident_count_3m * 5 +
                                req.incident_count_6m * 2 + req.incident_count_12m))
        score += freq_score * 0.40

        # Demographics (25% weight)
        lit_factor = max(0, 100 - req.literacy_rate) if req.literacy_rate > 0 else 50
        score += lit_factor * 0.25

        # Infrastructure (20% weight)
        infra_score = 100
        if req.police_per_1000 > 0:
            infra_score -= min(40, req.police_per_1000 * 20)
        if req.streetlights_per_km > 0:
            infra_score -= min(30, req.streetlights_per_km * 5)
        if req.cctv_count > 0:
            infra_score -= min(30, req.cctv_count * 2)
        score += max(0, infra_score) * 0.20

        # Safety programs (15% weight — reduces risk)
        program_reduction = min(30, req.active_safety_programs * 10)
        score += max(0, 50 - program_reduction) * 0.15

        return max(0, min(100, score))

    @staticmethod
    def _score_to_level(score: float) -> str:
        """Convert numeric score to risk level."""
        if score >= 80:
            return "critical"
        elif score >= 60:
            return "high"
        elif score >= 40:
            return "moderate"
        elif score >= 20:
            return "low"
        return "very_low"

    @staticmethod
    def _get_contributing_factors(req: RiskPredictionRequest, score: float) -> list:
        """Identify top factors contributing to risk."""
        factors = []
        if req.incident_count_1m > 3:
            factors.append({"factor": "High recent incidents", "impact": "high", "value": req.incident_count_1m})
        if req.literacy_rate < 60:
            factors.append({"factor": "Low literacy rate", "impact": "medium", "value": f"{req.literacy_rate}%"})
        if req.police_per_1000 < 0.5:
            factors.append({"factor": "Low police presence", "impact": "medium", "value": req.police_per_1000})
        if req.streetlights_per_km < 5:
            factors.append({"factor": "Poor lighting", "impact": "medium", "value": req.streetlights_per_km})
        if req.cctv_count < 5:
            factors.append({"factor": "Low surveillance", "impact": "low", "value": req.cctv_count})
        return factors[:5]

    @staticmethod
    def _get_recommendations(risk_level: str, req: RiskPredictionRequest) -> list:
        """Generate safety recommendations based on risk level."""
        recs = []
        if risk_level in ("critical", "high"):
            recs.extend([
                "Avoid isolated areas after dark",
                "Share live location with a trusted contact",
                "Keep emergency numbers (112, 181) on speed dial",
            ])
        if req.police_per_1000 < 0.5:
            recs.append("Nearest police station may be far — use SOS button in emergencies")
        if req.streetlights_per_km < 5:
            recs.append("This area has limited street lighting — prefer well-lit main roads")
        if req.active_safety_programs > 0:
            recs.append(f"{req.active_safety_programs} safety programs are active in this area")
        if risk_level in ("low", "very_low"):
            recs.append("This area has a good safety record — stay aware as always")
        return recs
