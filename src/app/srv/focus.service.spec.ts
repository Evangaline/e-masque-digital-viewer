import { FocusService, FocalPoint } from './focus.service';

describe('FocusService.coverStyle', () => {
  let service: FocusService;

  beforeEach(() => {
    window.electronAPI = {
      sendMessage: () => { },
      invoke: () => Promise.resolve(""),
      on: () => () => { }
    };
    service = new FocusService();
  });

  const position = (style: string): number[] => {
    let m = style.match(/object-position:([\d.]+)% ([\d.]+)%/)!;
    return [Number(m[1]), Number(m[2])];
  };
  const portrait = (x: number, y: number): FocalPoint => ({ x: x, y: y, width: 1000, height: 2000, source: 'face' });

  it('centers when there is no focal point', () => {
    expect(position(service.coverStyle(null, 1920, 1080))).toEqual([50, 50]);
  });

  it('moves up to a face near the top of a portrait on a landscape screen', () => {
    //1000x2000 COVERING 1920x1080 SCALES TO 1920x3840, FACE AT 20% (768px) CENTERED NEEDS OFFSET 228 OF 2760
    let [px, py] = position(service.coverStyle(portrait(0.5, 0.2), 1920, 1080));
    expect(px).toBe(50);
    expect(py).toBeCloseTo(228 / 2760 * 100, 1);
  });

  it('clamps so no empty space is shown', () => {
    expect(position(service.coverStyle(portrait(0.5, 0.01), 1920, 1080))[1]).toBe(0);
    expect(position(service.coverStyle(portrait(0.5, 0.99), 1920, 1080))[1]).toBe(100);
  });

  it('always fills the screen', () => {
    let style = service.coverStyle(portrait(0.3, 0.3), 1920, 1080);
    expect(style).toContain('object-fit:cover');
    expect(style).toContain('width:100%');
    expect(style).toContain('height:100%');
  });
});
