"use strict";

const service = require("../../../services/climaAdminService");

// Mock global fetch
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
});

function mockFetchResponse(data, ok = true, status = 200) {
  global.fetch.mockResolvedValue({
    ok,
    status,
    json: jest.fn().mockResolvedValue(data),
  });
}

describe("climaAdminService", () => {
  describe("fetchRainData — with DB coords", () => {
    test("returns rain data when coords are in DB row", async () => {
      mockFetchResponse({
        daily: {
          precipitation_sum: [0, 1.2, 0, 0, 5.3, 0, 2.1],
        },
      });

      const result = await service.fetchRainData({
        station_lat: -19.9,
        station_lon: -43.9,
        city_name: "BH",
        uf: "MG",
      });

      expect(result.source).toBe("OPEN_METEO");
      expect(result.mm_24h).toBe(2.1);
      expect(result.mm_7d).toBe(8.6);
      expect(result.meta.coords.lat).toBe(-19.9);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("fetchRainData — with geocoding", () => {
    test("geocodes city+uf when no coords in DB", async () => {
      // First call: geocoding
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            results: [{ latitude: -20.0, longitude: -44.0 }],
          }),
        })
        // Second call: weather
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({
            daily: { precipitation_sum: [3.0] },
          }),
        });

      const result = await service.fetchRainData({
        station_lat: null,
        station_lon: null,
        city_name: "Contagem",
        uf: "MG",
      });

      expect(result.mm_24h).toBe(3.0);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("fetchRainData — error cases", () => {
    test("throws COORDS_REQUIRED when no coords and no city", async () => {
      await expect(
        service.fetchRainData({ station_lat: null, city_name: "", uf: "" })
      ).rejects.toMatchObject({ code: "COORDS_REQUIRED" });
    });

    test("throws COORDS_REQUIRED when uf is invalid", async () => {
      await expect(
        service.fetchRainData({ station_lat: null, city_name: "BH", uf: "X" })
      ).rejects.toMatchObject({ code: "COORDS_REQUIRED" });
    });

    test("throws GEOCODE_NOT_FOUND when geocoding returns no results", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ results: [] }),
      });

      await expect(
        service.fetchRainData({ station_lat: null, city_name: "Nowhere", uf: "XX" })
      ).rejects.toMatchObject({ code: "GEOCODE_NOT_FOUND" });
    });

    test("throws PROVIDER_ERROR when Open-Meteo returns non-2xx", async () => {
      mockFetchResponse({ error: "too many requests" }, false, 429);

      await expect(
        service.fetchRainData({ station_lat: -19.9, station_lon: -43.9 })
      ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    });

    test("handles empty precipitation_sum array", async () => {
      mockFetchResponse({ daily: { precipitation_sum: [] } });

      const result = await service.fetchRainData({
        station_lat: -19.9,
        station_lon: -43.9,
      });

      expect(result.mm_24h).toBe(0);
      expect(result.mm_7d).toBe(0);
    });
  });

  describe("weatherCodeToCondition", () => {
    test("maps known WMO codes to PT label", () => {
      expect(service.weatherCodeToCondition(0)).toBe("Céu limpo");
      expect(service.weatherCodeToCondition(2)).toBe("Parcialmente nublado");
      expect(service.weatherCodeToCondition(63)).toBe("Chuva moderada");
      expect(service.weatherCodeToCondition(95)).toBe("Trovoada");
    });

    test("returns null for unknown codes", () => {
      expect(service.weatherCodeToCondition(123)).toBeNull();
      expect(service.weatherCodeToCondition(null)).toBeNull();
      expect(service.weatherCodeToCondition(undefined)).toBeNull();
      expect(service.weatherCodeToCondition("nope")).toBeNull();
    });
  });

  describe("clampHumidity", () => {
    test("rounds and accepts valid 0-100", () => {
      expect(service.clampHumidity(73)).toBe(73);
      expect(service.clampHumidity(73.6)).toBe(74);
      expect(service.clampHumidity(0)).toBe(0);
      expect(service.clampHumidity(100)).toBe(100);
    });

    test("rejects out-of-range and non-numeric", () => {
      expect(service.clampHumidity(-5)).toBeNull();
      expect(service.clampHumidity(150)).toBeNull();
      expect(service.clampHumidity("nope")).toBeNull();
      expect(service.clampHumidity(null)).toBeNull();
    });
  });

  describe("fetchRainData — current weather", () => {
    test("returns parsed current weather alongside rain", async () => {
      mockFetchResponse({
        daily: { precipitation_sum: [1.0, 2.0, 0, 0, 0, 0, 1.5] },
        current: {
          temperature_2m: 22.4,
          relative_humidity_2m: 82,
          wind_speed_10m: 18.0,
          weather_code: 63,
        },
      });

      const r = await service.fetchRainData({ station_lat: -19.9, station_lon: -43.9 });

      expect(r.temperature_c).toBe(22.4);
      expect(r.humidity_pct).toBe(82);
      expect(r.wind_kmh).toBe(18.0);
      expect(r.condition).toBe("Chuva moderada");
      expect(r.meta.hasCurrent).toBe(true);
    });

    test("returns nulls when current block is absent", async () => {
      mockFetchResponse({
        daily: { precipitation_sum: [1.0] },
        // sem `current` — provider respondeu parcialmente
      });

      const r = await service.fetchRainData({ station_lat: -19.9, station_lon: -43.9 });

      expect(r.temperature_c).toBeNull();
      expect(r.humidity_pct).toBeNull();
      expect(r.wind_kmh).toBeNull();
      expect(r.condition).toBeNull();
      expect(r.meta.hasCurrent).toBe(false);
      // Chuva continua funcionando.
      expect(r.mm_24h).toBe(1.0);
    });

    test("requests current params and km/h unit", async () => {
      mockFetchResponse({ daily: { precipitation_sum: [0] }, current: {} });
      await service.fetchRainData({ station_lat: -19.9, station_lon: -43.9 });
      const calledUrl = global.fetch.mock.calls[0][0];
      expect(calledUrl).toContain("current=temperature_2m");
      expect(calledUrl).toContain("relative_humidity_2m");
      expect(calledUrl).toContain("wind_speed_10m");
      expect(calledUrl).toContain("weather_code");
      expect(calledUrl).toContain("wind_speed_unit=kmh");
    });
  });
});
