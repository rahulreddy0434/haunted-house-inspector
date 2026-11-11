import { describe, expect, it } from 'vitest';
import { mergeSelection, type SelectedFileInfo } from './mediaValidation';

const img = (name: string, size = 100, lastModified = 1): SelectedFileInfo => ({
  name,
  type: 'image/jpeg',
  size,
  lastModified,
});
const vid = (name: string): SelectedFileInfo => ({ name, type: 'video/mp4', size: 50_000_000 });
const photos = (n: number) => Array.from({ length: n }, (_, i) => img(`p${i}.jpg`));

describe('mergeSelection', () => {
  it('adds one photo to 4 -> 5 with no error', () => {
    const r = mergeSelection({ kind: 'images', files: photos(4) }, [img('new.jpg')]);
    expect(r.accepted).toBe(true);
    expect(r.files).toHaveLength(5);
    expect(r.errors).toEqual([]);
    expect(r.kind).toBe('images');
  });

  it('adding to 5 reports TOO_MANY_IMAGES and keeps 5', () => {
    const cur = photos(5);
    const r = mergeSelection({ kind: 'images', files: cur }, [img('extra.jpg')]);
    expect(r.accepted).toBe(true);
    expect(r.files).toEqual(cur);
    expect(r.errors.map((e) => e.code)).toEqual(['TOO_MANY_IMAGES']);
    expect(r.errors[0].message).toContain('maximum is 5 photos per submission');
  });

  it('ignores duplicates against current and within the pick', () => {
    const cur = photos(2);
    const r = mergeSelection({ kind: 'images', files: cur }, [cur[0], img('a.jpg'), img('a.jpg')]);
    expect(r.files.map((f) => f.name)).toEqual(['p0.jpg', 'p1.jpg', 'a.jpg']);
    expect(r.errors).toEqual([]);
  });

  it('is idempotent and treats an empty pick as a no-op', () => {
    const cur = { kind: 'images' as const, files: photos(3) };
    const pick = [img('x.jpg'), img('y.jpg')];
    const once = mergeSelection(cur, pick);
    const twice = mergeSelection({ kind: 'images', files: once.files }, pick);
    expect(twice.files).toEqual(once.files);
    expect(twice.errors).toEqual([]);
    expect(twice.accepted).toBe(true);
    expect(mergeSelection(cur, []).files).toEqual(cur.files);
  });

  it('rejects current photos + incoming video, keeping current', () => {
    const cur = photos(2);
    const r = mergeSelection({ kind: 'images', files: cur }, [vid('v.mp4')]);
    expect(r.accepted).toBe(false);
    expect(r.errors[0].code).toBe('MIXED_MEDIA');
    expect(r.errors[0].message).toContain('either photos or one video, not both');
    expect(r.files).toEqual(cur);
    expect(r.kind).toBe('images');
  });

  it('rejects current video + incoming photos, keeping current', () => {
    const cur = [vid('v.mp4')];
    const r = mergeSelection({ kind: 'video', files: cur }, [img('a.jpg')]);
    expect(r.accepted).toBe(false);
    expect(r.errors[0].code).toBe('MIXED_MEDIA');
    expect(r.files).toEqual(cur);
    expect(r.kind).toBe('video');
  });

  it('reports MIXED_MEDIA (not FILE_TOO_LARGE) for an oversize photo added to a video', () => {
    const cur = [vid('v.mp4')];
    const r = mergeSelection({ kind: 'video', files: cur }, [img('big.jpg', 10_485_761)]);
    expect(r.accepted).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['MIXED_MEDIA']);
    expect(r.files).toEqual(cur);
  });

  it('replaces a video with a new video', () => {
    const r = mergeSelection({ kind: 'video', files: [vid('old.mp4')] }, [vid('new.mp4')]);
    expect(r.accepted).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.files.map((f) => f.name)).toEqual(['new.mp4']);
    expect(r.kind).toBe('video');
  });

  it('rejects mixed or multi-video picks', () => {
    expect(mergeSelection(null, [img('a.jpg'), vid('v.mp4')]).errors[0].code).toBe('MIXED_MEDIA');
    expect(mergeSelection(null, [vid('a.mp4'), vid('b.mp4')]).errors[0].code).toBe('TOO_MANY_VIDEOS');
  });

  it('rejects the whole pick for an unsupported type', () => {
    const cur = photos(2);
    const r = mergeSelection({ kind: 'images', files: cur }, [
      img('ok.jpg'),
      { name: 'x.gif', type: 'image/gif', size: 1 },
    ]);
    expect(r.accepted).toBe(false);
    expect(r.errors[0].code).toBe('UNSUPPORTED_TYPE');
    expect(r.files).toEqual(cur);
  });

  it('rejects the whole pick for an oversize photo, even when the count is also exceeded', () => {
    const cur = photos(5);
    const r = mergeSelection({ kind: 'images', files: cur }, [img('big.jpg', 10_485_761), img('s.jpg')]);
    expect(r.accepted).toBe(false);
    expect(r.errors.map((e) => e.code)).toEqual(['FILE_TOO_LARGE']);
    expect(r.errors[0].message).toContain('big.jpg');
    expect(r.errors[0].message).toContain('10 MB');
    expect(r.files).toEqual(cur);
    expect(mergeSelection(null, [img('edge.jpg', 10_485_760)]).accepted).toBe(true);
  });

  it('starts from null', () => {
    const r = mergeSelection(null, [img('a.jpg')]);
    expect(r.files).toHaveLength(1);
    expect(r.kind).toBe('images');
  });
});
