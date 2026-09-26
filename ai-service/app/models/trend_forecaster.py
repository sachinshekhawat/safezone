"""Trend forecasting model for incident time series."""

import numpy as np
from app.models.schemas import TrendForecastRequest, TrendForecastResponse


class TrendForecaster:
    """Forecasts incident trends using simple moving averages and linear regression.

    Uses a lightweight approach (no Prophet dependency) that can be upgraded later.
    """

    def __init__(self):
        self.is_loaded = True  # Always available (uses online computation)
        self.version = "0.1.0"

    def forecast(self, request: TrendForecastRequest) -> TrendForecastResponse:
        """Forecast future incident trends."""
        data = request.historical_data
        if len(data) < 3:
            return TrendForecastResponse(
                zone_id=request.zone_id,
                trend_direction="stable",
                forecasted_values=[],
                confidence_interval={},
            )

        # Extract counts
        counts = [d.get("count", 0) for d in sorted(data, key=lambda x: (x.get("year", 0), x.get("month", 0)))]

        # Simple linear regression
        x = np.arange(len(counts)).astype(float)
        y = np.array(counts, dtype=float)
        slope, intercept = np.polyfit(x, y, 1)

        # Determine trend
        if slope > 0.5:
            trend = "increasing"
        elif slope < -0.5:
            trend = "decreasing"
        else:
            trend = "stable"

        # Forecast
        forecasted = []
        last_entry = data[-1]
        last_month = last_entry.get("month", 12)
        last_year = last_entry.get("year", 2024)

        for i in range(request.forecast_months):
            future_x = len(counts) + i
            predicted = max(0, intercept + slope * future_x)

            month = (last_month + i) % 12 + 1
            year = last_year + (last_month + i) // 12

            forecasted.append({
                "month": month,
                "year": year,
                "predicted_count": round(predicted, 1),
            })

        # Confidence interval (using residual std)
        residuals = y - (slope * x + intercept)
        std_residual = float(np.std(residuals))

        return TrendForecastResponse(
            zone_id=request.zone_id,
            trend_direction=trend,
            forecasted_values=forecasted,
            confidence_interval={
                "std_error": round(std_residual, 2),
                "slope": round(slope, 4),
                "method": "linear_regression",
            },
        )
