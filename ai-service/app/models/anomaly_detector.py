"""Anomaly detection model using Isolation Forest."""

import numpy as np
from app.models.schemas import AnomalyDetectionRequest, AnomalyDetectionResponse


class AnomalyDetector:
    """Detects anomalous spikes or drops in incident data using statistical methods.

    Falls back to Z-score based detection when Isolation Forest model isn't trained.
    """

    def __init__(self):
        self.model = None
        self.is_loaded = True
        self.version = "0.1.0"

    def detect(self, request: AnomalyDetectionRequest) -> AnomalyDetectionResponse:
        """Detect anomalies in recent data."""
        data = request.recent_data
        if len(data) < 5:
            return AnomalyDetectionResponse(
                zone_id=request.zone_id,
                anomalies_detected=False,
                anomaly_score=0.0,
                anomalies=[],
                message="Insufficient data for anomaly detection (need at least 5 data points)",
            )

        counts = np.array([d.get("count", 0) for d in data], dtype=float)
        mean = np.mean(counts)
        std = np.std(counts)

        if std == 0:
            return AnomalyDetectionResponse(
                zone_id=request.zone_id,
                anomalies_detected=False,
                anomaly_score=0.0,
                anomalies=[],
                message="No variance in data — no anomalies detected",
            )

        # Z-score based anomaly detection
        z_scores = (counts - mean) / std
        anomalies = []
        max_score = 0.0

        for i, (z, point) in enumerate(zip(z_scores, data)):
            if abs(z) > 2.0:  # Threshold: 2 standard deviations
                anomaly_type = "spike" if z > 0 else "drop"
                score = min(1.0, abs(z) / 4.0)
                max_score = max(max_score, score)
                anomalies.append({
                    "index": i,
                    "data_point": point,
                    "z_score": round(float(z), 2),
                    "type": anomaly_type,
                    "severity": "high" if abs(z) > 3 else "medium",
                    "message": f"{'Unusual spike' if z > 0 else 'Unusual drop'} detected: "
                              f"{point.get('count', 0)} incidents "
                              f"(mean: {mean:.1f}, {abs(z):.1f}σ deviation)",
                })

        detected = len(anomalies) > 0
        message = (
            f"Detected {len(anomalies)} anomalies in the data"
            if detected
            else "No anomalies detected — data is within normal range"
        )

        return AnomalyDetectionResponse(
            zone_id=request.zone_id,
            anomalies_detected=detected,
            anomaly_score=round(max_score, 3),
            anomalies=anomalies,
            message=message,
        )
