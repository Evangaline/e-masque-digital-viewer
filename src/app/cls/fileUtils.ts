
const IMAGE_EXTENSIONS: string[] = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

export function isImageFile(name: string): boolean {
  let idx: number = name.lastIndexOf(".");
  if (idx <= 0) {
    return false;
  }
  return IMAGE_EXTENSIONS.includes(name.substring(idx + 1).toLowerCase());
}

//SORTS IN PLACE, orderby: CREATED (modified date) or NAME, direction: ASC or DESC
export function sortFiles(files: any[], orderby: string, direction: string): void {
  let dir: number = (direction == "DESC") ? -1 : 1;
  if (orderby == "CREATED") {
    files.sort((a: any, b: any) => (new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime()) * dir);
  }
  else {
    files.sort((a: any, b: any) => a.name.localeCompare(b.name) * dir);
  }
}
