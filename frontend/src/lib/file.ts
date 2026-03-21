export function isImageFile(file: File) {
  return file.type.startsWith('image/');
}

export function isVideoFile(file: File) {
  return file.type.startsWith('video/');
}
