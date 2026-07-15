/**
 * Tests for observatory.ts - Static data for the Continuity Observatory
 */
import { series, Series, DataPoint, Family, toSvgCoords, toSvgPoints, SVG_W, SVG_H, SVG_LPAD, SVG_TPAD, SVG_RPAD, SVG_BPAD } from '../data/observatory';

describe('observatory.ts', () => {
  describe('series array', () => {
    it('should export a non-empty series array', () => {
      expect(series).toBeDefined();
      expect(Array.isArray(series)).toBe(true);
      expect(series.length).toBeGreaterThan(0);
    });

    it('should have unique series IDs', () => {
      const ids = series.map(s => s.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('individual series structure', () => {
    series.forEach(s => {
      it(`should have all required fields for series "${s.id}"`, () => {
        expect(s).toHaveProperty('id');
        expect(s).toHaveProperty('family');
        expect(s).toHaveProperty('points');
        expect(s).toHaveProperty('unit');
        expect(s).toHaveProperty('source');
        expect(s).toHaveProperty('sourceUrl');
        expect(s).toHaveProperty('license');
      });

      it(`should have valid family for series "${s.id}"`, () => {
        const validFamilies: Family[] = ['flourishing', 'knowledge', 'fragility'];
        expect(validFamilies).toContain(s.family);
      });

      it(`should have non-empty points array for series "${s.id}"`, () => {
        expect(Array.isArray(s.points)).toBe(true);
        expect(s.points.length).toBeGreaterThan(0);
      });

      it(`should have valid data points for series "${s.id}"`, () => {
        s.points.forEach((point: DataPoint) => {
          expect(typeof point.year).toBe('number');
          expect(typeof point.value).toBe('number');
          expect(point.year).toBeGreaterThan(1900);
          expect(point.year).toBeLessThan(2100);
        });
      });

      it(`should have non-empty strings for metadata in series "${s.id}"`, () => {
        expect(typeof s.unit).toBe('string');
        expect(s.unit.length).toBeGreaterThan(0);
        expect(typeof s.source).toBe('string');
        expect(s.source.length).toBeGreaterThan(0);
        expect(typeof s.sourceUrl).toBe('string');
        expect(s.sourceUrl).toMatch(/^https?:\/\//);
        expect(typeof s.license).toBe('string');
        expect(s.license.length).toBeGreaterThan(0);
      });
    });
  });

  describe('toSvgCoords', () => {
    it('should map data points to SVG coordinates', () => {
      const points: DataPoint[] = [
        { year: 2000, value: 0 },
        { year: 2010, value: 100 },
      ];

      const coords = toSvgCoords(points);

      expect(coords.length).toBe(2);
      expect(coords[0]).toHaveProperty('year');
      expect(coords[0]).toHaveProperty('value');
      expect(coords[0]).toHaveProperty('x');
      expect(coords[0]).toHaveProperty('y');
    });

    it('should handle single data point', () => {
      const points: DataPoint[] = [{ year: 2000, value: 50 }];

      const coords = toSvgCoords(points);

      expect(coords.length).toBe(1);
      expect(coords[0].x).toBe(SVG_LPAD);
    });

    it('should handle multiple data points', () => {
      const points: DataPoint[] = [
        { year: 2000, value: 0 },
        { year: 2005, value: 50 },
        { year: 2010, value: 100 },
      ];

      const coords = toSvgCoords(points);

      expect(coords.length).toBe(3);
      // First point should be at minimum x
      expect(coords[0].x).toBe(SVG_LPAD);
      // Last point should be at maximum x
      expect(coords[2].x).toBe(SVG_W - SVG_RPAD);
    });
  });

  describe('toSvgPoints', () => {
    it('should convert coords to SVG points string', () => {
      const coords = [
        { year: 2000, value: 0, x: 10, y: 20 },
        { year: 2010, value: 100, x: 30, y: 40 },
      ];

      const points = toSvgPoints(coords);

      expect(points).toBe('10.0,20.0 30.0,40.0');
    });

    it('should handle empty array', () => {
      const points = toSvgPoints([]);

      expect(points).toBe('');
    });
  });
});
