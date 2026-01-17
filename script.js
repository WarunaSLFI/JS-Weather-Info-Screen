const API_KEY = "11e6b9f9ffaa4d229b5110309261701";
const WEATHER_API_BASE = "https://api.weatherapi.com/v1";
const DEFAULT_CITY = "Tampere";
const REFRESH_MS = 5 * 60 * 1000;

const elements = {
  form: document.getElementById("search-form"),
  input: document.getElementById("city-input"),
  geoBtn: document.getElementById("geo-btn"),
  refreshBtn: document.getElementById("refresh-btn"),
  clearBtn: document.getElementById("clear-btn"),
  lastUpdated: document.getElementById("last-updated"),
  currentDate: document.getElementById("current-date"),
  currentTime: document.getElementById("current-time"),
  locationName: document.getElementById("location-name"),
  currentIcon: document.getElementById("current-icon"),
  currentTemp: document.getElementById("current-temp"),
  feelsLike: document.getElementById("feels-like"),
  weatherDesc: document.getElementById("weather-desc"),
  metricFeels: document.getElementById("metric-feels"),
  metricWind: document.getElementById("metric-wind"),
  metricHumidity: document.getElementById("metric-humidity"),
  metricPressure: document.getElementById("metric-pressure"),
  metricSunrise: document.getElementById("metric-sunrise"),
  metricSunset: document.getElementById("metric-sunset"),
  forecastRow: document.getElementById("forecast-row"),
  loading: document.getElementById("loading"),
  loadingText: document.getElementById("loading-text"),
  error: document.getElementById("error"),
  errorMessage: document.getElementById("error-message"),
  unitToggle: document.querySelector(".unit-toggle"),
  suggestions: document.getElementById("suggestions"),
  themeToggle: document.getElementById("theme-toggle"),
  themeIcon: document.getElementById("theme-icon"),
};

const state = {
  unit: "metric",
  lastQuery: null,
  timezoneId: "UTC",
  refreshTimer: null,
  isFetching: false,
  suggestTimer: null,
};

document.addEventListener("DOMContentLoaded", () => {
  wireEvents();
  applyStoredTheme();

  if (!API_KEY || API_KEY.includes("PASTE")) {
    showError("Add your WeatherAPI key at the top of script.js.");
    return;
  }

  startInitialFetch();
});

function startInitialFetch() {
  if (!navigator.geolocation) {
    fetchWeatherByCity(DEFAULT_CITY);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    () => fetchWeatherByCity(DEFAULT_CITY)
  );
}

function wireEvents() {
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const city = elements.input.value.trim();
    if (city) {
      fetchWeatherByCity(city);
      hideSuggestions();
    }
  });

  elements.geoBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showError("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
      () => showError("Unable to access your location. Please allow permission.")
    );
  });

  elements.refreshBtn.addEventListener("click", () => {
    if (state.lastQuery) {
      refreshLastQuery();
    } else {
      showError("Search for a city first, or enable location.");
    }
  });

  elements.error.addEventListener("click", hideError);

  elements.unitToggle.addEventListener("click", (event) => {
    const button = event.target.closest(".toggle-btn");
    if (!button) return;
    const newUnit = button.dataset.unit;
    if (state.unit === newUnit) return;
    state.unit = newUnit;
    updateUnitToggle();
    if (state.lastQuery) {
      refreshLastQuery();
    } else {
      fetchWeatherByCity(DEFAULT_CITY);
    }
  });

  elements.themeToggle.addEventListener("click", toggleTheme);

  elements.input.addEventListener("input", handleSuggestInput);
  elements.clearBtn.addEventListener("click", () => {
    elements.input.value = "";
    hideSuggestions();
    elements.input.focus();
  });
  elements.input.addEventListener("focus", () => {
    if (elements.suggestions.childElementCount) {
      elements.suggestions.classList.add("visible");
    }
  });

  document.addEventListener("click", (event) => {
    if (!elements.suggestions.contains(event.target) && event.target !== elements.input) {
      hideSuggestions();
    }
  });
}

function applyStoredTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "dark") {
    document.body.classList.remove("theme-light");
    elements.themeToggle.setAttribute("aria-pressed", "false");
    setThemeIcon(false);
    return;
  }
  document.body.classList.add("theme-light");
  elements.themeToggle.setAttribute("aria-pressed", "true");
  setThemeIcon(true);
}

function toggleTheme() {
  document.body.classList.toggle("theme-light");
  const isLight = document.body.classList.contains("theme-light");
  elements.themeToggle.setAttribute("aria-pressed", isLight ? "true" : "false");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  setThemeIcon(isLight);
}

function setThemeIcon(isLight) {
  if (!elements.themeIcon) return;
  elements.themeIcon.src = isLight ? "images/sun.svg" : "images/moon.svg";
  elements.themeIcon.alt = isLight ? "Light mode" : "Dark mode";
}

function updateUnitToggle() {
  document
    .querySelectorAll(".toggle-btn")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.unit === state.unit));
}

function handleSuggestInput(event) {
  const query = event.target.value.trim();
  if (state.suggestTimer) clearTimeout(state.suggestTimer);
  if (query.length < 2) {
    hideSuggestions();
    return;
  }
  state.suggestTimer = setTimeout(() => loadSuggestions(query), 250);
}

async function loadSuggestions(query) {
  if (!API_KEY || API_KEY.includes("PASTE")) return;
  const url = `${WEATHER_API_BASE}/search.json?key=${API_KEY}&q=${encodeURIComponent(query)}`;
  try {
    const results = await fetchJson(url, "Unable to search locations.");
    if (!Array.isArray(results) || !results.length) {
      hideSuggestions();
      return;
    }
    elements.suggestions.innerHTML = "";
    results.forEach((place, index) => {
      const label = formatLocationLabel(place);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", "false");
      btn.dataset.lat = place.lat;
      btn.dataset.lon = place.lon;
      btn.innerHTML = `
        <div>${label}</div>
        <div class="suggestion-subtle">${[place.region, place.country].filter(Boolean).join(", ")}</div>
      `;
      btn.addEventListener("click", () => {
        elements.input.value = label;
        hideSuggestions();
        fetchWeatherByCoords(place.lat, place.lon);
      });
      if (index === 0) {
        btn.setAttribute("aria-selected", "true");
      }
      elements.suggestions.appendChild(btn);
    });
    elements.suggestions.classList.add("visible");
  } catch (error) {
    console.error(error);
  }
}

function hideSuggestions() {
  elements.suggestions.classList.remove("visible");
}

function formatLocationLabel(place) {
  if (!place) return "";
  const parts = [place.name, place.region, place.country].filter(Boolean);
  return parts.join(", ");
}

async function fetchWeatherByCity(city, options = {}) {
  const query = { type: "city", value: city };
  await fetchWeather(query, options);
}

async function fetchWeatherByCoords(lat, lon, options = {}) {
  const query = { type: "coords", value: { lat, lon } };
  await fetchWeather(query, options);
}

async function fetchWeather(query, { silent = false } = {}) {
  if (state.isFetching) return;
  if (!query) return;
  state.isFetching = true;

  hideError();
  if (!silent) {
    const text =
      query.type === "city"
        ? `Fetching weather for ${query.value}...`
        : "Fetching weather for your location...";
    showLoading(text);
  }

  try {
    const { current, forecast, location } = await requestWeatherData(query);

    state.timezoneId = location?.tz_id || "UTC";
    state.lastQuery = { ...query };

    renderCurrentWeather(current, location, forecast.astro);
    renderHourlyForecast(forecast.items, state.timezoneId);
    // No city background image.
    updateLastUpdated(current.last_updated_epoch, state.timezoneId);
    startAutoRefresh();
  } catch (error) {
    console.error(error);
    const lower = (error.message || "").toLowerCase();
    const message = lower.includes("failed to fetch")
      ? "Network error: please check your connection."
      : error.message || "Unable to fetch weather data right now.";
    showError(message);
  } finally {
    state.isFetching = false;
    if (!silent) hideLoading();
  }
}

async function requestWeatherData(query) {
  const locationQuery =
    query.type === "city"
      ? encodeURIComponent(query.value)
      : `${query.value.lat},${query.value.lon}`;

  const currentUrl = `${WEATHER_API_BASE}/current.json?key=${API_KEY}&q=${locationQuery}&aqi=no`;
  const forecastUrl = `${WEATHER_API_BASE}/forecast.json?key=${API_KEY}&q=${locationQuery}&days=1&aqi=no&alerts=no`;

  const currentData = await fetchJson(currentUrl, "Unable to find that location.");
  let forecastData = null;
  try {
    forecastData = await fetchJson(forecastUrl, "Unable to load forecast.");
  } catch (error) {
    console.error(error);
  }

  const forecastDay = forecastData?.forecast?.forecastday?.[0];
  const localNow = forecastData?.location?.localtime_epoch || Math.floor(Date.now() / 1000);

  const hourlyItems =
    forecastDay?.hour
      ?.filter((hour) => hour.time_epoch >= localNow)
      .slice(0, 10)
      .map((hour) => ({
        dt: hour.time_epoch,
        tempC: hour.temp_c,
        tempF: hour.temp_f,
        pop: Math.max(hour.chance_of_rain ?? 0, hour.chance_of_snow ?? 0),
        condition: hour.condition,
        isDay: hour.is_day === 1,
      })) || [];

  return {
    current: currentData.current,
    location: forecastData?.location || currentData.location,
    forecast: { items: hourlyItems, astro: forecastDay?.astro },
  };
}

async function fetchJson(url, friendlyError) {
  const response = await fetch(url);
  if (!response.ok) {
    let message = friendlyError;
    try {
      const errorBody = await response.json();
      const innerMessage = errorBody?.error?.message || errorBody?.message;
      if (innerMessage) {
        message = capitalize(innerMessage);
      }
    } catch (_) {
      // ignore parsing errors
    }
    throw new Error(message);
  }
  return response.json();
}

function renderCurrentWeather(data, location, astro) {
  const isDay = data?.is_day === 1;
  const iconName = mapConditionToIcon(data.condition?.code, isDay);
  const unitSymbol = state.unit === "metric" ? "\u00B0C" : "\u00B0F";

  const temp = state.unit === "metric" ? data.temp_c : data.temp_f;
  const feels = state.unit === "metric" ? data.feelslike_c : data.feelslike_f;
  const windSpeed = state.unit === "metric" ? data.wind_kph / 3.6 : data.wind_mph;

  elements.locationName.textContent = [location?.name, location?.country].filter(Boolean).join(", ");
  elements.currentTemp.textContent = `${Math.round(temp ?? 0)}${unitSymbol}`;
  elements.feelsLike.textContent = `Feels like ${Math.round(feels ?? 0)}${unitSymbol}`;
  elements.weatherDesc.textContent = capitalize(data.condition?.text || "--");
  elements.currentIcon.src = `images/${iconName}.svg`;
  elements.currentIcon.alt = data.condition?.text || "Weather icon";

  elements.metricFeels.textContent = `${Math.round(feels ?? 0)}${unitSymbol}`;
  elements.metricWind.textContent =
    state.unit === "metric" ? `${windSpeed.toFixed(1)} m/s` : `${windSpeed.toFixed(1)} mph`;
  elements.metricHumidity.textContent = `${data.humidity ?? 0}%`;
  elements.metricPressure.textContent = `${Math.round(data.pressure_mb ?? 0)} hPa`;

  elements.metricSunrise.textContent = astro?.sunrise || "--:--";
  elements.metricSunset.textContent = astro?.sunset || "--:--";

  elements.currentDate.textContent = formatDate(location?.localtime_epoch, location?.tz_id);
  elements.currentTime.textContent = formatTime(location?.localtime_epoch, location?.tz_id);
}

function renderHourlyForecast(items, timeZone = "UTC") {
  elements.forecastRow.innerHTML = "";

  if (!items || !items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<img src="images/clock.svg" alt="" /><p>No forecast data right now.</p>`;
    elements.forecastRow.appendChild(empty);
    return;
  }

  const unitSymbol = state.unit === "metric" ? "\u00B0C" : "\u00B0F";

  items.forEach((hour) => {
    const card = document.createElement("article");
    card.className = "forecast-card";

    const iconName = mapConditionToIcon(hour.condition?.code, hour.isDay);
    const timeText = formatTime(hour.dt, timeZone);
    const temperature = `${Math.round(
      state.unit === "metric" ? hour.tempC : hour.tempF
    )}${unitSymbol}`;
    const pop = Math.round(hour.pop || 0);

    card.innerHTML = `
      <div class="forecast-top">
        <span class="forecast-time">${timeText}</span>
        <img class="forecast-icon" src="images/${iconName}.svg" alt="${hour.condition?.text || "Icon"}">
      </div>
      <p class="forecast-temp">${temperature}</p>
      <p class="forecast-pop">Precip: ${pop}%</p>
    `;

    elements.forecastRow.appendChild(card);
  });
}

function mapConditionToIcon(code = 1000, isDay = true) {
  if (code === 1000) return isDay ? "clear-day" : "clear-night";
  if (code === 1003) return "few-clouds";
  if (code === 1006) return "clouds";
  if (code === 1009) return "overcast";
  if ([1030, 1135, 1147].includes(code)) return "fog";
  if ([1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246, 1249, 1252].includes(code))
    return "rain";
  if ([1066, 1069, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255, 1258, 1261, 1264].includes(code))
    return "snow";
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return "thunderstorm";
  return isDay ? "clear-day" : "clear-night";
}

function mapConditionToTheme(code = 1000) {
  if ([1066, 1069, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1255, 1258, 1261, 1264].includes(code)) return "theme-snow";
  if ([1030, 1135, 1147].includes(code)) return "theme-fog";
  if ([1003].includes(code)) return "theme-clouds";
  if ([1006, 1009].includes(code)) return "theme-overcast";
  if ([1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246, 1249, 1252, 1087, 1273, 1276, 1279, 1282].includes(code))
    return "theme-rain";
  return "theme-clear";
}

// City background image removed.

function formatDate(timestamp, timeZone = "UTC") {
  if (!timestamp) return "--";
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone });
}

function formatTime(timestamp, timeZone = "UTC") {
  if (!timestamp) return "--:--";
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone });
}

function updateLastUpdated(timestamp, timeZone = "UTC") {
  const date = new Date((timestamp || Date.now() / 1000) * 1000);
  const timeText = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone });
  elements.lastUpdated.textContent = `Last updated: ${timeText}`;
}

function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  if (!state.lastQuery) return;
  state.refreshTimer = setInterval(() => refreshLastQuery(true), REFRESH_MS);
}

function refreshLastQuery(silent = false) {
  if (!state.lastQuery) return;
  if (state.lastQuery.type === "city") {
    fetchWeatherByCity(state.lastQuery.value, { silent });
  } else if (state.lastQuery.type === "coords") {
    fetchWeatherByCoords(state.lastQuery.value.lat, state.lastQuery.value.lon, { silent });
  }
}

function showLoading(message) {
  elements.loadingText.textContent = message;
  elements.loading.hidden = false;
}

function hideLoading() {
  elements.loading.hidden = true;
}

function showError(message) {
  elements.errorMessage.textContent = message;
  elements.error.hidden = false;
}

function hideError() {
  elements.error.hidden = true;
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Sample icon source (open/free): https://fonts.google.com/icons, https://tabler.io/icons
