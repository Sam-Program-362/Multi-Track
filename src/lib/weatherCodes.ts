export const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Rime fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Dense drizzle", icon: "🌧️" },
  56: { label: "Freezing drizzle", icon: "🌧️" },
  57: { label: "Freezing drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌦️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Freezing rain", icon: "🌧️" },
  67: { label: "Freezing rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" },
  73: { label: "Snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "🌨️" },
  80: { label: "Rain showers", icon: "🌦️" },
  81: { label: "Rain showers", icon: "🌧️" },
  82: { label: "Violent showers", icon: "⛈️" },
  85: { label: "Snow showers", icon: "🌨️" },
  86: { label: "Snow showers", icon: "🌨️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm + hail", icon: "⛈️" },
  99: { label: "Severe thunderstorm", icon: "🌩️" },
};

export function describeCode(code: number) {
  return WEATHER_CODES[code] ?? { label: "Unknown", icon: "🌡️" };
}

export function aqiCategory(aqi: number | null): { category: string; color: string } {
  if (aqi === null || Number.isNaN(aqi)) return { category: "Unknown", color: "#9aa4b2" };
  if (aqi <= 20) return { category: "Good", color: "#22c55e" };
  if (aqi <= 40) return { category: "Fair", color: "#84cc16" };
  if (aqi <= 60) return { category: "Moderate", color: "#eab308" };
  if (aqi <= 80) return { category: "Poor", color: "#f97316" };
  if (aqi <= 100) return { category: "Very poor", color: "#ef4444" };
  return { category: "Extremely poor", color: "#a21caf" };
}
