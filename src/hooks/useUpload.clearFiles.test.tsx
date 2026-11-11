import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUpload } from '@/hooks/useUpload';
import type { AcceptedFiles } from '@/lib/validation/mediaValidation';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/uploadFlow', () => ({
  runUploadFlow: vi.fn(async () => ({ ok: false, kind: 'upload', message: 'Upload failed.' })),
}));

const files: AcceptedFiles = {
  kind: 'images',
  files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })],
};
const answers = { location: 'Kitchen', duration: '2 days', recentChanges: 'None' };

async function setup() {
  const hook = renderHook(() => useUpload());
  act(() => {
    hook.result.current.setFiles(files);
    hook.result.current.setAnswers(answers);
    hook.result.current.markNoticeVisible();
  });
  await act(async () => {
    await hook.result.current.submit();
  });
  return hook;
}

describe('useUpload clearFiles / clearAll', () => {
  it('clearFiles removes files, keeps answers and notice, and clears error state', async () => {
    const { result } = await setup();
    expect(result.current.uploadStatus).toBe('error');
    expect(result.current.uploadError).toBe('Upload failed.');

    act(() => result.current.clearFiles());

    expect(result.current.files).toBeNull();
    expect(result.current.answers).toEqual(answers);
    expect(result.current.noticeVisible).toBe(true);
    expect(result.current.uploadStatus).toBe('idle');
    expect(result.current.uploadError).toBeNull();
    expect(result.current.errorKind).toBeNull();
    expect(result.current.resetAt).toBeNull();
    expect(result.current.inspectionId).toBeNull();
    expect(result.current.fileProgress).toEqual([]);
  });

  it('clearAll still clears the answers as well', async () => {
    const { result } = await setup();
    act(() => result.current.clearAll());
    expect(result.current.files).toBeNull();
    expect(result.current.answers).toEqual({ location: '', duration: '', recentChanges: '' });
    expect(result.current.uploadStatus).toBe('idle');
    expect(result.current.uploadError).toBeNull();
  });
});
