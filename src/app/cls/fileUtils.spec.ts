import { isImageFile, sortFiles } from './fileUtils';

describe('isImageFile', () => {
  it('accepts supported extensions in any case', () => {
    expect(isImageFile('photo.jpg')).toBeTrue();
    expect(isImageFile('photo.JPEG')).toBeTrue();
    expect(isImageFile('photo.Png')).toBeTrue();
    expect(isImageFile('photo.webp')).toBeTrue();
  });

  it('uses the last extension', () => {
    expect(isImageFile('IMG.2024.06.01.jpg')).toBeTrue();
    expect(isImageFile('photo.jpg.bak')).toBeFalse();
  });

  it('rejects files without an extension', () => {
    expect(isImageFile('README')).toBeFalse();
    expect(isImageFile('.jpg')).toBeFalse();
    expect(isImageFile('photo.')).toBeFalse();
  });
});

describe('sortFiles', () => {
  const files = () => [
    { name: 'b.jpg', modifiedAt: new Date('2024-02-01') },
    { name: 'c.jpg', modifiedAt: new Date('2024-03-01') },
    { name: 'a.jpg', modifiedAt: new Date('2024-01-01') },
  ];

  it('sorts by modified date ascending (oldest first)', () => {
    let f = files();
    sortFiles(f, 'CREATED', 'ASC');
    expect(f.map(x => x.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('sorts by modified date descending (newest first)', () => {
    let f = files();
    sortFiles(f, 'CREATED', 'DESC');
    expect(f.map(x => x.name)).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
  });

  it('sorts by name ascending and descending', () => {
    let f = files();
    sortFiles(f, 'NAME', 'ASC');
    expect(f.map(x => x.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    sortFiles(f, 'NAME', 'DESC');
    expect(f.map(x => x.name)).toEqual(['c.jpg', 'b.jpg', 'a.jpg']);
  });

  it('handles dates serialised as strings', () => {
    let f: any[] = files().map(x => ({ name: x.name, modifiedAt: x.modifiedAt.toISOString() }));
    sortFiles(f, 'CREATED', 'ASC');
    expect(f.map(x => x.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});
